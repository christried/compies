# 05 Assets

All files are in `reference/assets/`. Serve static files from `public/` in Nuxt (`/icons`, `/emotes`, `/coin`, `/baustelle`, `/share`). For anything that must be animated (Compibert), **inline** the SVG; `<img>` only for static uses.

## Compibert

| File | Use |
|---|---|
| `compibert/compibert-full.svg` | Production rig, full body (viewBox `0 36 404 344`). Every part has `id` + `data-pivot`. Fills are CSS vars with fallbacks (`--cb-body`, `--cb-spike`, `--cb-cheek`, `--cb-ink`). |
| `compibert/compibert-bust.svg` | Bust crop (`150 36 254 254`) |
| `compibert/compibert-head.svg` | Head crop (`212 40 192 192`), header logo |
| `baustelle/bauhelm.svg` **[MVP]** | Hard hat (160 × 80). In the rig: child `compibert-hat` of `compibert-head`, `transform="translate(236 6) scale(.95) rotate(-7 80 66)"` |
| `../compibert-options.js` | Reference builder: mount, states, eye-follow, outline treatments. Port to `useCompibert` |
| `../CompibertRig.dc.html`, `../Compibert Rig.dc.html` | Live rig + parts/state documentation |

Variants: head · bust · full · emote · tail (coin). Outline: light = hard shadow, dark = cream sticker rim. Rig docs and state machine: [04-motion.md § Compibert](04-motion.md#compibert).

## Coin (Pick & Ban)

| File | Size | What |
|---|---|---|
| `coin/coin-kopf.svg` | 140 × 140 | Kopf: yellow disc, 5 px ink border, cream + ink ring, Compibert head (idle) clipped to r 52 |
| `coin/coin-schwanz.svg` | 140 × 140 | Schwanz: cobalt disc, same rings, striped curled tail |
| `coin/coin-rim.svg` | 440 × 14 | edge strip for flat uses. 3D coin = 13 stacked discs at z −6…6 (ink at −6/−2/2/6, gold #c99a1a between), faces at ±7 |

## Emotes (Compibert style, not system emoji)

`emotes/emote-klatschen.svg` (Klatschen) · `emote-freudentraenen.svg` (Tränen vor Lachen) · `emote-wuetend.svg` (Wütend) · `emote-bruellen.svg` (Compibert-Brüllen). 100 × 100, 96 px sticker disc + 4 px offset ink shadow. Static for `<img>`, chat log, push. Live floating emotes use the rig in the `emote` crop with the matching state (clap, laugh, angry, roar).

## App, PWA icons, favicon

| File | What |
|---|---|
| `icons/icon.svg` → `icon-512.png`, `icon-192.png` | 1c „Sonnenkopf“, `purpose: any`, rounded sticker tile |
| `icons/icon-maskable.svg` → `icon-maskable-512.png` | full-bleed sunburst, head inside the 80 % safe circle |
| `icons/apple-touch-icon.png` | 180 × 180, full bleed |
| `icons/favicon.svg`, `favicon-32.png`, `favicon-16.png` | simplified head with cream rim (reads on light and dark tabs) |
| `icons/monochrome.svg` | silhouette for Android themed icons |
| `icons/manifest.webmanifest` | name, colours, icons; paste into `pwa.manifest` if using `@vite-pwa/nuxt` |

Theme colour: `#fff3df`, one `<meta name="theme-color">` without a media query, so the browser bar stays light on every device. The dark value (`#17121d`) returns with dark mode (#43). See `reference/docs/compibert-handoff.md` for the exact `app.head` block.

## Construction assets [MVP] (new in Phase 5)

| File | Size | Notes |
|---|---|---|
| `baustelle/absperrband-tile.svg` | 112 × 28 | seamless horizontal tile: red #ff4f4f / white #fffdf8 45° stripes (14 px), ink edges. In the UI use the `tape` utility; this file is for OG/static uses |
| `baustelle/bauzaun.svg` | 240 × 170 | one fence panel with feet. Lines use `currentColor` (inline it and set `color: var(--cp-line)` to follow the theme). In the UI, panels are CSS (`fence-mesh` + borders, see BaustelleZone) |
| `baustelle/absperrschranke.svg` | 200 × 90 | barrier board on A-legs with two yellow lamps |
| `baustelle/leitkegel.svg` | 64 × 80 | traffic cone |
| `baustelle/bauhelm.svg` | 160 × 80 | Compibert's hard hat |

The construction sign („Baustelle! Eltern haften für ihre Dinos.“) is HTML (yellow #ffd23f card, 3 px ink border, 4/4 hard shadow, rotate 2°, two ink zip ties), so the copy stays translatable.

## Sound cues

Full list with character, length and relative volume: `reference/docs/compibert-sound.md` (copy kept there; it is the production brief for the sound designer). Summary of the rules:
- Global mute (header), persisted per device. Nothing plays before the first user gesture.
- Two buses: `sfx` and `cb` (Compibert voice). Fanfare and reveal stingers duck the rest by −6 dB.
- Room limit: max 3 emote sounds per second; others' emotes at 60 %.
- 3 variants where listed, never the same twice in a row; ±2 semitones on UI cues.
- Synced moments schedule cues against server time (Web Audio).
- Delivery: 48 kHz mono, ≤ −1 dBTP, `.ogg` + `.m4a`, file name = cue id.

Cue ids: `boot-steps boot-skid cb-hi ui-hover ui-press ui-hold-fill ui-hold-done ui-toast ui-error drag-pick drag-over drag-snap drag-reject drag-longpress wheel-windup wheel-tick wheel-stop wheel-morph wheel-slice-out cb-hype cb-gulp cb-yay veto-open veto-clock veto-clip-close veto-seal veto-drumroll veto-reveal coin-toss coin-spin coin-land coin-result pb-turn pb-ban pb-pick lb-swap lb-count lb-winner tie-alarm tie-drum cer-drop cer-row cer-trophy-rattle cer-trip cer-bonk cer-stamp cer-fanfare cer-crowd share-shutter br-cutin br-move br-plus br-lead br-win emo-clap emo-haha emo-grr emo-roar cb-poke cb-giggle cb-boing cb-squish cb-huh cb-grr cb-snore cb-hmm cb-uhoh sys-join sys-reconnect`.

MVP: no sound needed (the poll has no sound moments). Ship the mute toggle anyway so it exists when sounds arrive.

## Share image (8a „Poster“) — Satori-compatible

Rendered server-side with nuxt-og-image (Satori) at **1200 × 630** (wide, OG/Discord) and **1080 × 1080** (square). Always light theme. **Flexbox only**, no grid, no conic gradients, no filters, no transforms on SVG children. Fonts loaded as buffers: Lilita One, Bungee, Bricolage Grotesque (700, 800).

```
<div root: flex row, w 1200 h 630, bg #fff3df, border 6px #151515, padding 48>
  <div left: flex column, flex 1, gap 20>
    <div kicker: flex row, gap 10, align center>  [Compibert head still 44px]  "COMPIES"  Lilita 28 </div>
    <div event: Bricolage 800 22, #5d5650>  "{event}, {date}" </div>
    <div winner block: flex column>
      <div label: Bricolage 800 18 caps +0.08em>  "Sieger"  </div>
      <div name: Lilita, ≤14 chars 96px | ≤34 84px | else 64px (square: 128 / 112 / 88), manual line break at the space nearest the middle for 2 lines, colour #151515 />
      <div team strip: h 14, bg team colour, border 3px #151515, w 160 />
    </div>
    <div standings 2–4: flex column, gap 8>  each row: flex row, gap 12 · place (Bungee 28) · TeamMark 28 · name (Bricolage 800 24, ellipsis) · points (Bungee 28, right). More parties → "+N weitere Parteien" </div>
    <div games: flex row wrap, gap 8>  chip per game (max 6 wide / 9 square, then "+N weitere"): border 3px, radius 999, padding 6 12, dot 12px = winner's team colour + name Bricolage 700 18 </div>
  </div>
  <div right: flex, w 420 (square: full width row below), align center, justify center, position relative>
    <img sunburst.svg absolute inset 0 />     (static asset: share/sunburst.svg)
    <img Compibert full, pose "dance" baked to a static SVG, w 340 />
  </div>
</div>
```
Square: column layout, Compibert + sunburst on top (h 420), text block below. Team colours as hex. Alt text: „{winner} gewinnt {event}. Platz 2: …“.

## Battle replay storyboard (9a „Wettrennen“) [1.0 – last ticket]

Purely in-app, GSAP, no server, no video. Reference engine: `reference/battle-replay.js`, component `reference/BattleReplay.dc.html`, screen `App Ende & Archiv ?s=replay`.

| Beat | Time | What happens |
|---|---|---|
| Intro | 0–0.8 s | Lanes draw in from the left (one per party, team colour + pattern + mark at the start). Tokens = party avatars/marks at 0. Compibert (full, bottom-right) `idle` → `excited`. |
| Game n (label `g{n}`) | 1.45 s each | 0–0.2: game cut-in label top-left (game name, Lilita 22, sticker chip) pops in; `br-cutin`. 0.1: one random generic gaming reference („GG!“, „Clutch!“, „Combo x2!“ … from `replay.refs`, shuffled bag, no repeats until exhausted) flashes near the game winner. 0.2–0.7: tokens move to their new cumulative score, 0.5 `power2.inOut`, stagger 0.03; `br-move`. 0.7: game winner hops (`y −14` yoyo 0.15). 0.75: „+N“ chip over each token that scored; `br-plus`. 1.0: if the leader changed, „FÜHRUNG“ stamp left of the new leader (`scale 2→1, rotation −8`), Compibert `excited`; `br-lead`. Else Compibert `clap`. 1.15: label fades out. |
| End (label `end`) | +1.6 s | Winner token scales 1.25, crown drops on it (`y −40→0`, `back.out(2)`), others dim to 60 %. Compibert `dance`. Final standings line below. `br-win`. |

- Lane sizes: ≤ 4 parties 58 px lane / 42 token, ≤ 6 46 / 34, ≤ 8 38 / 28. Rebuild on resize, keep the current time.
- Controls: Play/Pause, „2×“ (`timeScale(2)`), „Nächstes Spiel“ (seek to next label with callbacks suppressed, then re-pose tokens and texts from data), Restart.
- ≈ 10 s for 6 games. Compibert never speaks in the replay.
- Reduced motion: no timeline; „Start / Weiter / Ergebnis“ steps through still frames with a 0.2 s crossfade; an `aria-live` line reports the leader after each game.
- Drop rule (brief): if it doesn't run smoothly with 8 lanes on a mid-range phone, the feature is cut and the archive button removed.
