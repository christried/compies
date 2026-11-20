# Clip sources beyond YouTube (TikTok, Instagram, Steam) and YouTube volume "ducking"

Research date: 2026-11-20.
Sources are **live pages and files read on 2026-11-20, not pinned to a version**: the TikTok, Meta, Steamworks, Google and Apple developer pages, `www-widgetapi.js` build `6b3d0364` (the file `https://www.youtube.com/iframe_api` points to today), Instagram's `embed.js`, and `WebKit/WebKit` `main` (`Source/WebCore/html/HTMLMediaElement.cpp`; I could not read the commit SHA).

Anything I could not confirm from a primary source is marked **UNVERIFIED** or **not documented** and collected in the last section. Lines marked **Observed** come from a plain HTTP request I made from a US cloud egress; they are measurements, not documentation, and may differ for EU viewers.

**Method caveats**
- `WebFetch` could not resolve most hosts in this session, so I read the pages with `curl` through the session proxy and stripped the HTML. Several pages are JavaScript-rendered and came back empty: the Instagram Help Center and Instagram Terms of Use (so Instagram's own terms are **not read**), and the Mozilla support page on autoplay.
- Nothing was played in a real browser. No iOS device, no Android device, no EU viewer was tested. Everything about actual playback, latency and smoothness is documentation or source reading only.
- Terms and policies are quoted as written; I do not give legal advice. For the German Datenschutzerklärung the cookie and consent facts below are inputs for a lawyer or the operator, not conclusions.

---

## TL;DR

1. **Only YouTube gives the app what it does today.** TikTok and Instagram are weaker on every axis; Steam has no embed at all, but its trailer streams are reachable by a player we run ourselves.

   | | No controls | Start at a second | Script API (play/pause/seek/mute/volume/time/errors) | Seek + sync | Volume | Signed-out view | Privacy mode | Terms for our use |
   |---|---|---|---|---|---|---|---|---|
   | **YouTube** IFrame | `controls=0` | `start=<int s>` or `seekTo` | Full (`playVideo`, `pauseVideo`, `seekTo`, `mute`, `unMute`, `setVolume`, `getCurrentTime`, `onError`, `onAutoplayBlocked`) | `seekTo(s, true)`, keyframe-rounded; `getCurrentTime` | `setVolume` 0 to 100 integer | Plays; age-restricted and owner-disabled videos error | `youtube-nocookie.com` (documented as no personalisation; "no cookies" not stated) | Documented API; no overlay over the player; autoplay rules |
   | **TikTok** player v1 | `controls=0` | **No parameter**; `seekTo` message after `onPlayerReady` | `play`, `pause`, `seekTo`, `mute`, `unMute`; events incl. `onCurrentTime`, `onVolumeChange`, `onPlayerError` | `seekTo` + `onCurrentTime` | **No setter** (mute/unmute only; `force_muted` param) | Not documented | None documented; observed cookie on first load | Embed docs silent on our use; Developer Terms may apply |
   | **Instagram** oEmbed / `embed.js` | **No parameter** | **No** | **None** (host script only resizes the iframe) | **No** | **No** | Not documented; observed login redirect | None documented | Strict "front-end view only" clause; terms of use not read |
   | **Steam** store trailers | n/a (no embed): own player | Own player: `currentTime` | Own player (HLS or DASH) | Own player | Own player (`HTMLMediaElement`) | Store page and manifests load without login (observed) | n/a (video host set no cookies, observed) | No documented permission for reuse; undocumented endpoint |

2. **TikTok cannot duck, and cannot start at a second without a post-load `seekTo`.** The player accepts `mute`/`unMute` but has no volume-setting message, only an `onVolumeChange` event ([TikTok Embed Player](https://developers.tiktok.com/doc/embed-player)). Instagram exposes no playback control at all ([Meta oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed), `embed.js`).
3. **YouTube ducking is documented as possible and undocumented as smooth.** `setVolume` takes an integer 0 to 100 ([YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)); the wrapper sends one `postMessage` per call with no throttle in the client code ([www-widgetapi.js](https://www.youtube.com/s/player/6b3d0364/www-widgetapi.vflset/www-widgetapi.js)); no rate limit, latency, acknowledgement, ramp behaviour or loudness curve is documented. A 20-step fade over 200 to 300 ms must be tested on real devices.
4. **iPhone and iPod Safari (and every iOS browser) cannot set media volume from script; mute still works.** Apple: "The `volume` property is not settable in JavaScript. Reading the `volume` property always returns 1" ([Apple Safari HTML5 Audio and Video Guide](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html), archived page). WebKit's current source locks volume only on small-screen iOS devices, which contradicts Apple's "all iOS" wording for iPad (see section 5).
5. **Un-muting by script is a gesture problem on iOS.** WebKit: "If a `<video>` element gains an audio track or becomes un-muted without a user gesture, playback will pause" ([WebKit blog](https://webkit.org/blog/6784/new-video-policies-for-ios/)). Whether a tap on our page counts for a cross-origin YouTube iframe is **not documented** (section 5).

---

## 1. YouTube IFrame (baseline, what the app does today)

- **Controls:** `controls=0` hides the player controls; default is 1 ([player parameters](https://developers.google.com/youtube/player_parameters)). `disablekb=1` turns the keyboard shortcuts off, default 0 ([same page](https://developers.google.com/youtube/player_parameters)).
- **Start second:** `start` takes a positive integer; "the player will look for the closest keyframe... usually no more than around two seconds" before ([same](https://developers.google.com/youtube/player_parameters)). `seekTo(seconds, allowSeekAhead)` also goes to "the closest keyframe before that time unless the player has already downloaded the portion"; `allowSeekAhead` decides whether a new request is made for unbuffered time ([IFrame API](https://developers.google.com/youtube/iframe_api_reference)). For a shared-second sync the keyframe rounding means two devices can land up to about two seconds apart from the requested second (my reading of those two statements).
- **Reading time:** `getCurrentTime()` is documented as "elapsed time in seconds since the video started playing" ([IFrame API](https://developers.google.com/youtube/iframe_api_reference)). In the loader source it is not a live read: it returns the last time the iframe pushed plus `min(elapsed since that push, 1 s) x playbackRate` while `playerState === 1` ([www-widgetapi.js](https://www.youtube.com/s/player/6b3d0364/www-widgetapi.vflset/www-widgetapi.js), function `gb`). Every `get*`/`is*` method reads a cached `playerInfo` object filled by `infoDelivery` messages from the iframe, so `getVolume()`/`isMuted()` right after a setter can return the old value until the next delivery (same source; the push interval is not documented).
- **Errors (`onError`):** 2 invalid parameter, 5 HTML5 player error, 100 not found or private, 101 and 150 owner disallows embedding, 153 missing HTTP Referer or API client identification ([IFrame API](https://developers.google.com/youtube/iframe_api_reference)). `onAutoplayBlocked` fires when the browser blocks `autoplay`, `loadVideoById`, `playVideo` and the like ([same](https://developers.google.com/youtube/iframe_api_reference)).
- **Signed-out viewer:** "Age-restricted videos can't be watched on most 3rd party websites. These videos will redirect viewers back to YouTube when played" ([YouTube Help: embed videos](https://support.google.com/youtube/answer/171780)). No login wall is documented for ordinary public videos. Region restrictions: **not documented** on the pages I read.
- **Terms ([Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)):** embedded players at least 200x200 px; autoplay only once the player is visible and more than half visible, and "A page or screen must not have more than one YouTube player that automatically plays content simultaneously"; "You must not make changes to the YouTube player that are not explicitly described by the API documentation"; no overlays, frames or other visual elements in front of or obscuring any part of the player "including player controls". The last point matters for the wheel animation: the Clip plays "over" the wheel, so anything drawn on top of the player iframe is the thing to check with whoever owns the policy decision. The [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) add that API clients must not "interfere with or obscure any attribution provided by YouTube, including attribution provided via or shown in embedded YouTube players". Whether using only a part of a video is allowed: **not documented** (`start` and `seekTo` are documented features; no clause on clips).
- **Privacy:** the loader sends data on page load: "When your API Client loads, it collects and shares some basic user data with YouTube via the YouTube embedded player... if you enable Autoplay, playback will occur without any user interaction with the player; playback data collection and sharing will therefore occur upon page load. You can limit the data shared with YouTube before a user interacts... by setting Autoplay to false" ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies); same sentence in the [parameters page](https://developers.google.com/youtube/player_parameters)). Privacy-enhanced mode: change the embed host to `https://www.youtube-nocookie.com`; it "prevents the use of views of embedded YouTube content from influencing the viewer's browsing experience on YouTube" and ads stay non-personalised ([YouTube Help](https://support.google.com/youtube/answer/171780)). That page does **not** say that no cookie or request is made before interaction. The Developer Policies also require disclosing cookie use to users (policy text, section on storing or accessing information on devices; not quoted in full here).

---

## 2. TikTok

### Official embed routes
1. **Embed Player v1** (recommended): `https://www.tiktok.com/player/v1/{tiktok_post_id}?...`, an iframe; the ID is the number in the post URL ([Embed Player](https://developers.tiktok.com/doc/embed-player)).
2. **Embed Videos** (blockquote + script from the Share > Embed button, or oEmbed `GET https://www.tiktok.com/oembed?url=<video url>`): the docs say it "will be deprecated soon. Existing integrations will migrate automatically. We recommend using Embed Player for new integrations" ([Embed Videos](https://developers.tiktok.com/doc/embed-videos)). The sample oEmbed response's `html` is an `iframe` to `player/v1/<id>?embed_from=oembed&music_info=1&description=1&autoplay=1&muted=1` with `allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"` ([same](https://developers.tiktok.com/doc/embed-videos)). `muted` is not in the Embed Player parameter table (only `force_muted` is); I treat it as undocumented.

### URL parameters (all from [Embed Player](https://developers.tiktok.com/doc/embed-player))
`controls` (1; 0 hides progress bar and all control buttons), `progress_bar`, `play_button`, `volume_control`, `fullscreen_button`, `timestamp`, `closed_caption`, `native_context_menu` (all default 1), `loop` (0), `autoplay` (0), `music_info` (0), `description` (0), `rel` (1; 0 = same author's videos), `force_muted` ("Set the default volume to 0 and prevent the user from changing the volume", default 0).
- **No start-time parameter.** The page documents no `start`, `t` or similar.

### Script API (postMessage)
Envelope `{ 'x-tiktok-player': true, type: string, value: T }`. Host to player ([Embed Player](https://developers.tiktok.com/doc/embed-player)):
- `play`, `pause`, `mute`, `unMute` (no value), `seekTo` (number of seconds, 0 to video length), `navigateTo` (image posts only).
- **No volume-setting message and no `getCurrentTime` request.**

Player to host: `onPlayerReady`; `onStateChange` (-1 init, 0 ended, 1 playing, 2 paused, 3 buffering); `onCurrentTime` (`currentTime`, `duration`); `onMute` (boolean); `onVolumeChange` (0 to 100); `onError` (deprecated); `onImageChange`; `onPlayerError` (`errorCode`, `errorType`): 1001 `INVALID_VIDEO`, 2001 `SERVER_ERROR`, 3001 `PLAYBACK_ERROR`, 3002 `AUTOPLAY_ERROR` ("fails to autoplay due to browser security policies").
Not documented: how often `onCurrentTime` fires, the origin of messages from the player (the sample sends with target `'*'`), whether commands sent before `onPlayerReady` are queued, and whether `controls=0` leaves any TikTok branding or overlay in the frame.

### Autoplay, signed-out view, regions
- `autoplay=1` is documented; whether it plays unmuted is **not documented**. `AUTOPLAY_ERROR` (3002) exists for the blocked case.
- Login walls, "open in app" overlays, region and age restrictions in the **player**: **not documented**. The only availability statement: "A video's availability is consistent in and outside the TikTok app, as moderation standards and results are applied to both in-app content and embedded content. For example, if a video has been removed from the TikTok app, the same video in its embedded form on the web will no longer be accessible" ([Embed Videos](https://developers.tiktok.com/doc/embed-videos)).
- **Usage limits:** "TikTok may apply usage limits to embedded players on a per-domain basis... the player may become temporarily unavailable" ([Embed Player](https://developers.tiktok.com/doc/embed-player)). No number given.

### Terms
- The Embed Player and Embed Videos pages state **no embedding terms**: nothing on hiding controls, autoplay, partial use, or required attribution.
- The [TikTok Developer Terms of Service](https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en) (last modified 2025-12-26) govern "TikTok Developer Services", defined to include the TikTok Developer Documentation. Whether they bind a site that only pastes the player iframe, without registering an app, is **not documented**. If they apply: III.3(n) forbids removing "any legal, copyright, trademark or other proprietary notices... or falsify or delete any author attributions"; III.3(a) forbids modifying TikTok Services; III.3(h) forbids collecting personal data from TikTok users or building profiles on a browser; III.3(g) forbids excess request volume; III.3(c) needs TikTok's consent for "any commercial or unauthorized purpose"; and II.1 limits use of TikTok Information to "developing, maintaining, and supporting your Applications" on a "personal, non-exclusive" basis.
- The [TikTok Terms of Service (EEA, UK, CH)](https://www.tiktok.com/legal/page/eea/terms-of-service/en) (July 2026) contain no mention of embeds.

### Privacy
- No privacy-enhanced or no-cookie mode is documented. TikTok's [Cookies Policy](https://www.tiktok.com/legal/page/global/cookie-policy/en) covers the website and apps in general and says nothing specific about the embed player.
- **Observed:** a plain `GET https://www.tiktok.com/player/v1/6718335390845095173?controls=0&autoplay=1` with no cookies answered `200` with `set-cookie: tt_chain_token=...; Domain=.tiktok.com; Max-Age=15552000 (6 months); Secure; HttpOnly; SameSite=None`. The returned HTML also loads TikTok's privacy-protection loader, `webmssdk` and monitoring/analytics endpoints (`slardar`, `tea` config in the page JSON). That is a cookie and third-party contact **before any viewer interaction** from a US egress. Whether the EU variant differs: unknown.

---

## 3. Instagram (videos and Reels)

### Official embed routes
- **oEmbed:** `GET https://graph.facebook.com/v27.0/instagram_oembed?url=<post URL>`; Reels use `https://www.instagram.com/reel/{shortcode}/`, posts `/p/{shortcode}/`, profiles `https://www.instagram.com/{username}` ([Embed an Instagram Post](https://developers.facebook.com/docs/instagram-platform/oembed)). Parameters: `url` (required), `hidecaption`, `maxwidth` (320 to 658), `omitscript`; `maxheight` is not supported ([reference](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed)). The response `html` is a `<blockquote class="instagram-media">` plus a script tag for [`embed.js`](https://www.instagram.com/embed.js); `instgrm.Embeds.process()` re-runs it ([oEmbed doc](https://developers.facebook.com/docs/instagram-platform/oembed)).
- **Token:** since 2026-06-15 the endpoint "can be called without an access token... App Review... no longer required" ([Meta blog](https://developers.facebook.com/blog/post/2026/06/15/tokenless-access-to-meta-oembed-apis/)). The oEmbed page itself lists a limit of "1,000 requests every hour" ([oEmbed doc](https://developers.facebook.com/docs/instagram-platform/oembed)); the blog says token-based access "may offer higher rate limits".
- **Embed button** in the Instagram web UI gives the same HTML ([Embed Button](https://developers.facebook.com/documentation/instagram-platform/embed-button)).
- The `/p/<id>/embed/` iframe URL that `embed.js` builds is not documented in the developer docs; the documented unit is the blockquote.

### Controls, start, autoplay, script API
- **No parameter** for controls, start time, autoplay, mute or volume anywhere in the oEmbed doc or reference (only `hidecaption`, `maxwidth`, `omitscript`).
- **No script API.** The documented host call is `instgrm.Embeds.process()`. Reading `embed.js` (2026-11-20 build), the host side only handles three messages from the iframe, `LOADING`, `MOUNTED` and `MEASURE` (to set the iframe height), and sends none to control playback. That is a reading of minified code, not a documented contract, but it matches the docs' silence.
- Therefore no play, pause, seek, volume, time read or error event. A failed or deleted post would have to be detected by our own timeout or by checking the oEmbed call.

### Signed-out viewer, restrictions
- Embeds work only for public content: "Posts on private, inactive, and age-restricted Instagram accounts are not supported", accounts with Embeds disabled are not supported, stories are not supported, Shadow DOM is not supported ([oEmbed doc](https://developers.facebook.com/docs/instagram-platform/oembed)).
- Login walls or "view on Instagram" overlays inside the embed: **not documented**. **Observed:** a request for `https://www.instagram.com/p/fA9uwTtkSN/embed/` (the shortcode from the docs' sample, which may no longer be a live public post) answered `302` to `https://www.instagram.com/accounts/login/?next=...`. Treat as weak evidence; I had no known-public Reel to test.

### Terms
- The oEmbed endpoint "is **only** meant to be used for embedding Instagram content in websites and apps... Using metadata and page, post, or video content (or their derivations) from the endpoint for any purpose other than providing a front-end view of the page, post, or video is strictly prohibited. This prohibition encompasses consuming, manipulating, extracting, or persisting the metadata and content" ([oEmbed doc](https://developers.facebook.com/docs/instagram-platform/oembed)). Showing only part of a Reel under our own wheel UI is a "manipulation" question the text does not answer; I would treat it as a risk.
- Use of the oEmbed APIs is "subject to Meta Platform Terms, Developer Policies, and Meta's Community Standards" ([Meta blog](https://developers.facebook.com/blog/post/2026/06/15/tokenless-access-to-meta-oembed-apis/)). I read the [Meta Platform Terms](https://developers.facebook.com/terms/) page text: it has no clause that mentions embeds. Instagram's own Terms of Use could **not** be read (JavaScript-rendered).
- Attribution: the Embed Button page says each embedded post "gives proper attribution by displaying the post owner's username and linking to the post owner's profile" ([Embed Button](https://developers.facebook.com/documentation/instagram-platform/embed-button)). That is a description of the embed, not a stated requirement to us.

### Privacy
- No privacy mode documented. Meta's page [privacycenter.instagram.com/policies/cookies](https://privacycenter.instagram.com/policies/cookies/) was fetched but is JavaScript-rendered, so I could not read what it says about embeds.
- **Observed:** the `/embed/` request above returned (on the final `200` login page, after the redirect) `set-cookie: csrftoken=...; Max-Age=34560000` and `mid=...; Max-Age=34560000; HttpOnly`, both `Domain=.instagram.com`. So at least the redirect-to-login path sets Instagram cookies without interaction. Not tested on a live public embed.

---

## 4. Steam (store page videos and trailers)

### Is there an official embed?
- **Video: no official embed was found.** The Steamworks documentation lists an "Embeddable Widgets" > "Store Widget" and a "Trailers" page ([Steamworks docs nav](https://partner.steamgames.com/doc/marketing/widget)). The widget is `<iframe src="https://store.steampowered.com/widget/<appid>/">` showing "information about your product, current price, any discounts, and a purchase button" or "Add to Wishlist"; the only documented parameters are UTM parameters ([Store Widget](https://partner.steamgames.com/doc/marketing/widget)). It is a store card, not a trailer player; no video, controls or API are documented.
- The [Trailers](https://partner.steamgames.com/doc/store/trailer) page documents how developers upload trailers (up to 1920x1080, `.mov`/`.wmv`/`.mp4`), that Steam produces a 600x380 poster and a 232x130 thumbnail, that trailers can be restricted to countries and languages (ISO 3166-1 alpha-2 list, for example for PEGI/ESRB rated videos), and that a 6-second micro-trailer is generated. It documents no embedding, hot-linking or third-party reuse.

### The store's own video files
- **Observed:** the store page `https://store.steampowered.com/app/620/` embeds, per trailer, an HLS manifest `.../store_trailers/<appid>/<id>/<hash>/<ts>/hls_264_master.m3u8` and DASH manifests `dash_av1.mpd` and `dash_h264.mpd` on `video.fastly.steamstatic.com`. The JSON endpoint `https://store.steampowered.com/api/appdetails?appids=620` returned `movies[]` with `dash_av1`, `dash_h264`, `hls_h264`, `thumbnail`, `highlight`. I saw **no** `webm`/`mp4` fields in that response today; older snippets using `movie_max.webm` are therefore not something to rely on.
- **Observed:** `HEAD`/`GET` on the HLS master and the DASH manifest with `Origin: https://example.com` and a foreign `Referer` returned `200` with `access-control-allow-origin: *`, `cache-control: public, max-age=315360000`, no cookie, no token in the URL beyond `t=<unix time>`. So a player library on our own origin (hls.js, dash.js, or Safari's native HLS) can in principle load them cross-origin. No hot-link protection showed up in that one test.
- **The `appdetails` endpoint is not part of the documented Steamworks Web API:** the [Web API reference](https://partner.steamgames.com/doc/webapi) index and the [`ISteamApps`](https://partner.steamgames.com/doc/webapi/ISteamApps) page list `GetAppList` and no `appdetails`. Its stability and terms coverage are therefore **not documented**; it can change or break without notice.

### Terms
- [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms): allow you to "retrieve certain data regarding Steam and games" and "distribute Steam Data to end users for their personal use via your Application, all in accordance with the Steam Web API documentation"; you need an API key, may make 100,000 calls per day, must not present Steam Data as "endorsed or affiliated with Valve or Steam", must carry the "Valve Brand & Links" per the documentation, and Valve may terminate at any time. Whether the store's trailer streams are "Steam Data" under these terms: **not documented**.
- [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/) (last updated 2026-09-10), section "Content and Services": you may not "copy, photocopy, reproduce, publish, distribute... modify... create derivative works based on... the Content and Services... without the prior consent, in writing, of Valve", and use is limited to "personal, non-commercial use of your Subscriptions". Whether a store trailer is "Content" under that clause, and who owns the rights in a publisher's trailer: **not documented** on the pages I read. Trailers are uploaded by the game's developer or publisher; a rights holder's permission is a separate question from Valve's terms.
- No Steam page I read says anything about using a trailer in part, hiding player controls, or autoplay in a third-party player.

### Script API and privacy
- There is no Steam player API; if the app streams the manifests it runs its own `<video>` and gets the full `HTMLMediaElement` API (play, pause, `currentTime`, `muted`, `volume`, `error`), subject to the iOS volume lock in section 5.
- **Observed:** the manifest responses set no cookies. The store page itself set `steamCountry`, `browserid`, `recentapps` and `sessionid` cookies on first load, which is relevant only if the store page or the widget iframe were embedded (the widget is `store.steampowered.com`; I did not measure its cookies). No privacy mode documented.
- Signed-out: the store page and manifests loaded without any login in the test. Age-gated store pages and country-restricted trailers exist (documented for the restriction by country above); I did not test an age-gated title.

---

## 5. YouTube IFrame API volume, mute and autoplay

### `setVolume`, `getVolume`, `mute`, `unMute`, `isMuted`
All from the [IFrame Player API reference](https://developers.google.com/youtube/iframe_api_reference), "Changing the player volume":
- `player.setVolume(volume:Number):Void`: "Sets the volume. Accepts an integer between 0 and 100."
- `player.getVolume():Number`: "an integer between 0 and 100. Note that getVolume() will return the volume even if the player is muted."
- `player.mute()`, `player.unMute()`, `player.isMuted():Boolean`: mute state is separate from the volume number.
- Granularity: integers, so the finest documented step is 1 on a 0 to 100 scale. What happens with a non-integer: **not documented**.

### Speed, rate limits, a ~20-step fade
- **No rate limit, latency, queueing or acknowledgement is documented** for `setVolume` or any other command. The reference does not mention quotas for IFrame calls.
- How a call travels ([www-widgetapi.js](https://www.youtube.com/s/player/6b3d0364/www-widgetapi.vflset/www-widgetapi.js), function `bb`): the wrapper builds `{event:"command", func:"setVolume", args:[n]}`, adds `id` and `channel:"widget"`, and calls `iframe.contentWindow.postMessage(JSON.stringify(msg), origin)`. Commands issued before the iframe has reported ready are held in an array and flushed later; after that every call is posted immediately. I found **no throttling, debouncing or coalescing in the command path of this client wrapper** (I read the setter path, not every line of the 27 kB file). What the player code inside the iframe does with a burst of messages is not visible in this file and not documented.
- Whether a fade of about 20 steps over 200 to 300 ms (one call every 10 to 15 ms) is smooth: **not documented, UNVERIFIED**. `postMessage` is asynchronous and cross-process on some browsers, so call timing may jitter. The player's own handling (does it apply each value, does it smooth steps) is a black box. This needs a measurement on the devices that matter.
- Because `getVolume()` is served from the cached `playerInfo` (see section 1), the app should hold the current target volume itself rather than read it back from the player between steps.

### Scale: linear or perceptual
**Not documented** by YouTube. The HTML Standard says for `HTMLMediaElement.volume`: "values in between increasing in loudness. The range need not be linear" ([HTML Standard, media elements](https://html.spec.whatwg.org/multipage/media.html)), and the user agent may also scale it. How YouTube maps its 0 to 100 onto the element (or whether the player uses Web Audio) is not stated.

### iOS, iPadOS and other platforms: can script set the volume?
- **Apple (archived Safari HTML5 guide):** "On iOS devices, the audio level is always under the user's physical control. The `volume` property is not settable in JavaScript. Reading the `volume` property always returns 1." ([Apple](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html)). The page sits in Apple's *archive* and predates iPadOS; it says "iOS devices" without distinguishing iPad.
- **MDN browser compat data:** `safari_ios` support for `HTMLMediaElement.volume` is flagged partial: "`volume` returns a value and is writable; however, the value is always 1, and setting a value has no effect on the volume of the media object." `chrome_android`, `firefox_android`, `samsunginternet_android`, `webview_android` and `webview_ios` are recorded as mirroring desktop with no note; desktop Safari has no note ([`mdn/browser-compat-data` `api/HTMLMediaElement.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLMediaElement.json)). So no other browser is recorded as having a read-only volume. (BCD is MDN's data, not a vendor statement, but it is the standing compatibility record; I did not test devices.)
- **WebKit source (primary, `main`, [`HTMLMediaElement.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/HTMLMediaElement.cpp)):** `defaultVolumeLocked()` returns `PAL::currentUserInterfaceIdiomIsSmallScreen()` on iOS and `false` elsewhere. `setVolume()` checks the 0 to 1 range, then does nothing to the real volume if `m_volumeLocked`. `setMuted()`/`setMutedInternal()` do **not** check `m_volumeLocked`. Reading: the lock applies to iPhone and iPod touch (small-screen idiom); **iPad is not locked in current WebKit**, which conflicts with Apple's older "iOS devices" wording. I did not verify on an iPad, and this is the unpinned `main` branch, so treat the iPad point as UNVERIFIED for the shipping iPadOS versions. Every iOS and iPadOS browser uses WebKit, so the same applies to Chrome and Firefox on iOS (from WebKit being the only engine there; stated by Apple elsewhere, not re-read here).
- **What YouTube's `setVolume` does on a locked device: not documented.** The reference says nothing about iOS. Expected from the WebKit source: the call is accepted and the loudness does not change. **UNVERIFIED** for the YouTube player specifically (it could draw its own slider or use another audio path).
- **Mute still works on iOS:** the Apple page only restricts `volume`; the WebKit source lets `muted` change. `mute()`/`unMute()` are documented YouTube calls with no iOS caveat. A mute-based duck (hard cut, not a fade) is therefore the only duck that is plausible on iPhone.

### Autoplay policies relevant to un-muting by script
- **Chrome:** "Muted autoplay is always allowed. Autoplay with sound is allowed if: the user has interacted with the domain (click, tap, etc.); on desktop, the user's Media Engagement Index threshold has been crossed; the user has added the site to their home screen on mobile or installed the PWA on desktop. Top frames can delegate autoplay permission to their iframes" with `allow="autoplay"` ([Chrome autoplay policy](https://developer.chrome.com/blog/autoplay)). YouTube's own embed code carries `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"` ([www-widgetapi.js](https://www.youtube.com/s/player/6b3d0364/www-widgetapi.vflset/www-widgetapi.js), `getVideoEmbedCode`).
- **Safari on iOS/iPadOS ([WebKit blog](https://webkit.org/blog/6784/new-video-policies-for-ios/)):** `<video muted>` may autoplay without a gesture (and `playsinline` keeps it inline on iPhone); "If a `<video>` element gains an audio track or becomes un-muted without a user gesture, playback will pause"; the gesture must come from the JS handler of "a touchend, click, doubleclick, or keydown event" that directly runs the call. Autoplay also pauses when the element leaves the viewport. The YouTube parameter `playsinline` is documented: default 0 is fullscreen playback on iOS, 1 is inline ([player parameters](https://developers.google.com/youtube/player_parameters)).
- **Safari on macOS ([WebKit blog](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/)):** media with sound is blocked from auto-playing by default on most sites, users can allow it per website, and the new policies apply to video used "as a tool for making something visual happen (like background video or video-as-animated-gif)" as well; "Websites should assume any use of `<video>` or `<audio>` requires a user gesture click to play", and silent audio tracks still count as audio.
- **Firefox:** per MDN, audible autoplay is generally allowed only if the user has interacted with the site, it is allowlisted, or an iframe has Permissions Policy permission; Firefox blocks autoplay in background tabs by default ([MDN Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)). I could not read Mozilla's support page (JavaScript-rendered), so this is MDN, not Mozilla support.
- **Cross-browser definition ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)):** playback with audio muted or volume 0 is not blocked; audible playback is blocked unless the user interacted, the site is allowlisted, or the iframe has the Permissions Policy `autoplay` permission.
- **YouTube-side signal:** `onAutoplayBlocked` fires when the browser blocks the `autoplay` parameter, `loadVideoById`, `playVideo` etc. ([IFrame API](https://developers.google.com/youtube/iframe_api_reference)). Nothing there says whether a page-level user gesture is forwarded to a cross-origin iframe on `postMessage`. That the tap on our page counts for the YouTube iframe's `unMute()` on iOS is **not documented**; it is the thing to test. The existing "muted, then unmuted as allowed" flow depends on it.

---

## Items still UNVERIFIED or not documented

- TikTok: unmuted autoplay; login walls, region or age restrictions in the player; `controls=0` branding; command queuing before `onPlayerReady`; `onCurrentTime` frequency; whether the Developer Terms bind a plain iframe embed; any embed-specific cookie or consent statement (only an observed `tt_chain_token` cookie from a US egress).
- Instagram: Instagram Terms of Use and cookie-policy statements about embeds (pages not readable here); whether the embed shows a login wall to signed-out viewers (one weak observation); the `/embed/` iframe URL contract; any way to control or even detect playback; whether showing a segment of a Reel under our UI counts as a prohibited "manipulation".
- Steam: any permission, or prohibition, for third-party use of store trailers; whether the `appdetails` endpoint and the `video.*.steamstatic.com` URLs are stable or covered by the Web API terms; hot-link protection beyond my one test; cookies of the Store Widget iframe; age-gated titles.
- YouTube: rate limit, latency, acknowledgement and ramp behaviour of `setVolume`; the loudness scale (linear or perceptual); behaviour of `setVolume` on a volume-locked iPhone; whether a page gesture forwards to the iframe for `unMute()` on iOS; whether `youtube-nocookie.com` sets any storage before playback (the help page speaks only of personalisation); region restrictions for signed-out viewers; whether showing only a segment of a video is covered by the API terms.
- iPadOS: whether the volume lock applies on shipping iPads (Apple's archived page says "iOS devices"; current WebKit `main` locks only small-screen devices). Needs a device test.
- Real-world fade smoothness at 20 steps over 200 to 300 ms: needs a measurement in Chrome, Firefox, desktop Safari and an iPad.

---

## Sources (all read 2026-11-20)

**YouTube**
- IFrame Player API reference: https://developers.google.com/youtube/iframe_api_reference
- Player parameters: https://developers.google.com/youtube/player_parameters
- Required Minimum Functionality: https://developers.google.com/youtube/terms/required-minimum-functionality
- Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- API Services Terms of Service (no clause on partial use found): https://developers.google.com/youtube/terms/api-services-terms-of-service
- Help, embed videos and privacy-enhanced mode: https://support.google.com/youtube/answer/171780
- Loader and widget source: https://www.youtube.com/iframe_api and https://www.youtube.com/s/player/6b3d0364/www-widgetapi.vflset/www-widgetapi.js

**TikTok**
- Embed Player: https://developers.tiktok.com/doc/embed-player
- Embed Videos: https://developers.tiktok.com/doc/embed-videos
- Developer Terms of Service: https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en
- Terms of Service (EEA): https://www.tiktok.com/legal/page/eea/terms-of-service/en
- Cookies Policy: https://www.tiktok.com/legal/page/global/cookie-policy/en
- Observed request: `https://www.tiktok.com/player/v1/6718335390845095173?controls=0&autoplay=1`

**Instagram / Meta**
- Embed an Instagram Post: https://developers.facebook.com/docs/instagram-platform/oembed
- Instagram oEmbed reference: https://developers.facebook.com/docs/graph-api/reference/instagram-oembed
- Embed Button: https://developers.facebook.com/documentation/instagram-platform/embed-button
- Tokenless oEmbed announcement (2026-06-15): https://developers.facebook.com/blog/post/2026/06/15/tokenless-access-to-meta-oembed-apis/
- Meta Platform Terms: https://developers.facebook.com/terms/
- `embed.js`: https://www.instagram.com/embed.js
- Observed request: `https://www.instagram.com/p/fA9uwTtkSN/embed/`

**Steam**
- Store Widget: https://partner.steamgames.com/doc/marketing/widget
- Trailers: https://partner.steamgames.com/doc/store/trailer
- Web API index and `ISteamApps`: https://partner.steamgames.com/doc/webapi and https://partner.steamgames.com/doc/webapi/ISteamApps
- Steam Web API Terms of Use: https://steamcommunity.com/dev/apiterms
- Steam Subscriber Agreement: https://store.steampowered.com/subscriber_agreement/
- Observed: `https://store.steampowered.com/app/620/`, `https://store.steampowered.com/api/appdetails?appids=620`, and the manifests on `video.akamai.steamstatic.com` / `video.fastly.steamstatic.com` for app 620

**Browsers and standards**
- Apple, Safari HTML5 Audio and Video Guide, Device-Specific Considerations (archived): https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html
- WebKit blog, new video policies for iOS: https://webkit.org/blog/6784/new-video-policies-for-ios/
- WebKit blog, auto-play policy changes for macOS: https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/
- WebKit source `HTMLMediaElement.cpp` (`main`): https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/HTMLMediaElement.cpp
- Chrome autoplay policy: https://developer.chrome.com/blog/autoplay
- MDN, Autoplay guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN browser-compat-data, `HTMLMediaElement.volume`: https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLMediaElement.json
- HTML Standard, media elements (volume, "volume locked", "need not be linear"): https://html.spec.whatwg.org/multipage/media.html
