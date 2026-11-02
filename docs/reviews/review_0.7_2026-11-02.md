# Review 0.7 „Glücksrad“ (2026-11-02)

Diff `v0.6.0...origin/feat/218-gluecksrad` (3e431da), the integration branch of spec [#218](https://github.com/christried/compies/issues/218). It is a one-spec Release, so per `docs/agents/release.md` § Review, walk-through, retro, this review runs on the integration branch, and its fixes land before PR #255 merges into `staging`. Three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#218 with #226–#238);
- thermo-nuclear with architecture.

Before the review, a two-account browser check of #230–#235 ran on the same commit. Its defects are on the fix list below, marked „browser“. Its results are posted on the tickets.

## Result

- **No hole in the secrecy design.** Every read, room message, named send and feed path the Spec review traced holds; the gap is the slice order. These hold:
  - the Hidden wheel;
  - the Pool preview;
  - the sealed Vetoes;
  - settling (idempotent, under the lock, stamped with its instant);
  - the races between two requests;
  - the migrations 0016–0018, which are additive.
- **The slice order leaks under a Hidden wheel** (spec S1): only the labels are shuffled, so `resultIndex` names the drawn game to anyone who knows the pool, 6 s before the stop. Fixed in the fix round (F2).
- **The Datenschutzerklärung is out of date** (standards M1): since #230 every Member's browser loads the YouTube player at a draw's stop, and it starts by itself. Section 8 says only Hosts see the player and that it never starts by itself. The orchestrator drafts the text and the user approves it in chat before #255 merges (F1).
- **Three moments sit below the fold or under the clip** (browser): the Veto window's hold button, the coin and the pool warning. Decided once for all stage pieces (§ Decisions).

### Fixed before `staging` (fix round on `feat/218-gluecksrad`, one `sonnet` implementer)

| | Finding | Fix |
|---|---|---|
| F1 | standards M1 | Datenschutzerklärung § 8: who loads the player (also every Member of an Event in a running Session), when (at a draw's stop, for a game with a video), that it starts by itself, the legal basis. The user approves the wording; the orchestrator commits it. |
| F2 | spec S1 | A Hidden wheel shuffles the slice order per spin, not only the labels. `hidden-wheel.test.ts` pins that the order isn't the pool's. |
| F3 | #235 browser (high) | The coin lands on the face it names: Kopf = the Compibert head, Schwanz = the curly tail (reference `App Spielrunde` Pick & Ban notes). A test pins the visible face per side. |
| F4 | #231 browser, standards S1 | The Veto window's hold button moves into a fixed bar above the clip (§ Decisions), with the time left and the Party's status. The bar enters as 04-motion § Veto window says, and the window's motion helpers get the easing and duration tests the standard asks for. |
| F5 | #235 browser (medium) | The coin's flight shows in a fixed overlay (§ Decisions); the inline card keeps the result. |
| F6 | #232 browser | The Veto window shows its game's card (a set game has no other place on the stage). The wheel's „Zuletzt gezogen“ card shows only while its spin is the latest draw and isn't vetoed. |
| F7 | #233 browser | „Gegeben“ shows after a Bonus Veto: the button is re-keyed after its done state, not before. |
| F8 | browser | At 390 px the „Versiegelt“ stamp no longer cuts off „Veto eingelegt“, and the reveal stamp no longer covers „von …“. |
| F9 | browser | „Noch 1 Sekunde“ (singular). |
| F10 | browser | Under reduced motion every tile and stamp of the reveal shows at the same moment: no 80 ms stagger, no 300 ms stamp delay (04-motion). |
| F11 | browser | No hydration mismatch on a hard load while the clip overlay is open: its time is null before mount. |
| F12 | browser, spec leftover | The pool warning sits after the wheel and the open Rounds (story 15: the drawn Round first). |
| F13 | spec S2 | `useInstantRefresh` reads again (every 500 ms, at most 3 times) while a passed instant is still unsettled in the read. |
| F14 | spec S3 | Setting a game that already has a draw in a Round not put back is refused (409), so a retried „Setzen“ can't open a second Round of the same game, and a vetoed game can't come back. |
| F15 | spec N2 | A Veto can't be cast once the Running Session has ended. |
| F16 | quality Q8 | `recordActivity` requires `at` for every type in `INSTANT_ACTIVITY_TYPES` and refuses it for the others, by type. |
| F17 | standards S2, quality Q14 | GLOSSARY: **Clip**, **Draw**, **Veto window**. |
| F18 | standards S3 | Index on `draws.game_id`, in a new migration 0019. |
| F19 | standards S4 | Wheel labels cut with `characterCount` / `cutToCharacters`. |
| F20 | standards S6, spec N9 | Changelog `### Geändert`: the lock on „Rad verdecken“ and the Veto allowance while a game is drawn, the Game count floor, the Bench subtitle, the #237 fade under reduced motion. |
| F21 | CI flake | `clip.test.ts` asserts on the game's id and a string no placeholder contains („Kart“ is in „Mario Kartoffel“). |
| F22 | leftovers, standards N1, N2, N4 | One-line fixes, listed below. |

F22, one line each:
- `einstellungen.vue` calls `refreshEvent`;
- the unused strings `veto.window`, `veto.banner`, `veto.sealed`, `veto.by`, `dock.vetoRunning` are reused by F4 or deleted;
- `poolWarning.text` gets a singular for `needed`;
- `recordActivity` names published entries with the request clock;
- the dead `end` primary in `host-dock.ts` goes;
- the stale `coin_tossed` comment in `shared/activity.ts`;
- `veto-window.test.ts` builds its Members with `memberView()`;
- „Ton aktivieren“ shows only with a player;
- the picker's disabled „Setzen“ looks disabled at 390 px;
- the coin's reduced-motion fade swaps to the final face at its midpoint.

## Decisions (orchestrator, 2026-11-02)

- **A moment every device sees at the same instant shows in a fixed layer, not in the page flow.** The stage is long: the wheel alone fills a phone screen, and the side panel and the dock cover the bottom at 1440 px. So:
  - the clip stays a fixed overlay at the top (`layer-clip`, 44), as built;
  - the Veto window's action moves into a fixed bar at the bottom (`layer-veto`, 46, above the clip). It follows the reference `App Spielrunde` „Clip + Veto-Fenster“ and „Eigenes Veto versiegelt“: a pill at desktop width that leaves the side panel free, and a full-width bar above the tab bar on a phone. A Player of a Party sees it while the window is open. The inline Veto window keeps the game card, every Party's tiles, the reveal and the outcome;
  - the coin's flight shows in a fixed, centred overlay from the toss's start until shortly after the landing, then fades out, and the inline coin card keeps the result.

  This builds from existing pieces (`VetoButton`, `CoinFlip`, the clip overlay's frame), so it needs no Claude Design hand-off.
- **The pool warning** goes after the wheel and the open Rounds.
- **F14:** a vetoed game can't be set again from the library either. The Parties' Veto stands; a put-back Round's game returns as before.
- **F15:** a Veto window doesn't outlive its Session.
- **Spec N8:** a Round waiting for a respin still can't be put back, as story 40 is written (#261 asks for a copy line).

## To later tickets

| Ticket | Findings |
|---|---|
| [#256](https://github.com/christried/compies/issues/256) 0.8 ticket zero: seams for stage pieces | Q1, Q2, Q3, Q15, part of Q17 |
| [#257](https://github.com/christried/compies/issues/257) One server-time ticker, a slimmer Event page | Q5, Q6, standards N5 (per-frame countdown, off-screen pause) |
| [#258](https://github.com/christried/compies/issues/258) One rule for a drawn game's visibility; drop the unread room messages | Q9, Q7 |
| [#259](https://github.com/christried/compies/issues/259) Session instants on the request clock; `changeEvent` owns `now` and the settle | Q10, Q11, Q16, spec N4 |
| [#260](https://github.com/christried/compies/issues/260) ADR 0013 amendment (`ready-for-human`) | standards S5 |
| [#261](https://github.com/christried/compies/issues/261) Nits and small leftovers | standards N3, N5–N10; spec N1, N3, N5, N6, N8; Q12, Q13, Q17; build leftovers |

Not a ticket: **quality Q4** (the changelog conflicts on integration branches) changes `release.md`, so it goes to the 0.7 retro.

## Release 0.7 „Glücksrad“ – Standards review

Diff: `git diff v0.6.0...origin/feat/218-gluecksrad` (3e431da). Axis: Standards only. Sources read: CODING_STANDARDS.md, GLOSSARY.md, ADR 0012/0013, 04-motion.md, CLAUDE.md, docs/agents/{domain,release,delivery,design-handoff,implementer-frame}.md, eslint/knip config. Line numbers are at 3e431da.
Totals: 1 must-fix, 6 should-fix, 10 nit. Baseline smells are judgement calls and are marked as such.

### Must-fix

#### M1. The Datenschutzerklärung now says something the app no longer does (YouTube)
- `i18n/locales/de.json:1120` (section „youtube“), against `app/components/ClipOverlay.vue:94` (`loadYouTubeApi()`), `app/utils/youtube.ts:61` (`https://www.youtube.com/iframe_api`), `YOUTUBE_HOST`.
- The text says: „Der Player wird schon geladen, wenn du die Bearbeitung eines Spiels oder seine Detailseite öffnest … Er startet nicht von selbst“ and „Den Player sehen Hosts beim Bearbeiten eines Spiels und auf dessen Detailseite in der Bibliothek“. 0.7 loads the script from youtube.com and the player from youtube-nocookie.com in the browser of every Member of an Event, whenever the Host draws or sets a game in a running Session, and the player starts by itself (the synced clip, with or without sound). No privacy line of de.json changed in the diff.
- Rule: CODING_STANDARDS § Copy: „A new third party the browser or the server talks to goes into the Datenschutzerklärung … and the user approves the text“ and „Copy promises only what the app does today“. The host is not new, but who loads it, when, and that it starts by itself are. `privacy-hosts.test.ts` only checks that the hosts are named, so it stays green.
- Fix: amend section 8 (who loads the player: also every Member of an Event during a running Session; when: at the start of a clip; that it starts by itself; the IP address goes to Google as before; the legal basis for the Member case). The wording is the user's to approve (CLAUDE.md „Personal data“, the Copy rule), so ask before the cut. Separately, the Release PR must name migrations 0016–0018 for the production approval (delivery.md § Database migrations).

### Should-fix

#### S1. The Veto window's motion has no easing/duration test, and its bar has no enter animation
- `app/utils/motion.ts:53-72` (`sealStamp`, `revealTile`, `vetoStamp`, `clockTick`), used by `VetoButton.vue` / `VetoWindow.vue`. `test/nuxt/veto-window.test.ts` and `veto-button.test.ts` contain no `animate`, `easing` or `duration` (grep: 0 hits). `app/components/VetoWindow.vue` (the section, ~line 100) has no enter at all, where 04-motion § Veto window says „Open @determinedAt: bar `y 100%→0` 0.36 `EASE.out`“.
- Rule: CODING_STANDARDS § Motion: „Its test asserts that easing and duration, as well as that something animated“ and „An animation takes the curve and the duration that 04-motion names for its moment“ (the #208 precedent). The wheel, coin, clip, rounds and board motion are covered; only this group is not.
- Fix: in the two test files spy `Element.animate` and assert each helper's options (300 ms `--cp-ease-pop`; 420 ms with `index*80` delay, `--cp-ease-out`; 520 ms with 300 ms delay; 260 ms `--cp-ease-snap`; reduced: 200 ms fade with the same delay; no tick under reduced). Add `animate-veto-in` (translateY 100%→0, `--cp-dur-slow`, `--cp-ease-out`, with its reduced twin beside `animate-clip-in` in `compies-theme.css`) on the section and assert the class.

#### S2. Code cites a glossary term that does not exist
- `shared/clip.ts:1`, `shared/event.ts:226` and `server/utils/clip.ts:13` say „GLOSSARY: Clip“. `GLOSSARY.md` has no Clip entry. „Draw“ is also a domain word the code runs on (`draws`, `DrawRow`, `drawId`, `ClipView.drawId`; the Round entry says „vetoed draws“) and has no entry; „Pool warning“ (UI „Wird knapp.“) neither.
- Rule: docs/agents/domain.md: use the glossary's vocabulary; a concept that is not in it is „a real gap (note it for /domain-modeling)“.
- Fix: add Clip, Draw and (optionally) Pool warning to GLOSSARY.md via domain-modeling, or drop the „GLOSSARY:“ citations. No UI word is retired, so `RETIRED` stays as it is.

#### S3. `draws.game_id` is filtered and joined on without an index
- `server/db/schema.ts:292` (draws indexes: only `draws_round_id_idx`); migration `drizzle/0017_rounds_and_draws.sql:89`. Requests that filter on it: `server/utils/pools.ts:45` (`eq(draws.gameId, gameId)`, on every game image request of a non-library viewer) and `server/utils/activity.ts:57-58` (`inArray(draws.gameId, gameIds)`, on every feed read). `rounds` got `rounds_game_id_idx` for the same reason; `draws` did not.
- Rule: CODING_STANDARDS § Database: „A column a request filters or joins on gets its index in the same migration.“
- Fix: `index('draws_game_id_idx').on(table.gameId)` in `schema.ts` and in 0017 if it has not run on staging (the integration branch is not staging); if it has, a new migration 0019 (never edit one that has run).

#### S4. Text length counted with `.length`/`.slice` on a game name
- `app/components/LuckyWheel.vue:108`: `text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text`. Game names can carry emoji; `.slice` can cut a surrogate pair or a ZWJ sequence in half, and the 22 differs from the characters a User sees.
- Rule: CODING_STANDARDS table, „Text length → `characterCount` in `shared/text.ts`“ (`cutToCharacters` is its cutter).
- Fix: `characterCount(text) > LABEL_MAX ? `${cutToCharacters(text, LABEL_MAX - 1)}…` : text`. (The known leftover „truncate to the slice“ is a larger change; do this inside it.)

#### S5. ADR 0013 is contradicted by what the room now carries, and is not amended
- `docs/adr/0013-nuxt-decides-the-room-relays.md` Consequences: „The room's messages carry no game data in 1.4; the Hidden wheel secrecy test covers what the room sends.“ In 0.7: `activity.added` carries the name of a set or drawn game (`server/utils/activity.ts` `namedGames`; `shared/realtime.ts:4-5` calls it „The one exception“), `round.spun` carries the shuffled placeholder labels, `coin.tossed` (and the Event read's `coin.side`) carries the side before the landing, which the UI hides until `landsAt`. The 2026-10-31 amendment covers deadlines and named sends, not these. The new `direct` publish shape (`shared/realtime.ts` `RoomPublishBody`, `realtime/src/room.ts`) is also a protocol decision with no ADR line.
- Rule: docs/agents/domain.md „Flag ADR conflicts“: surface it rather than silently overriding.
- Fix: one amendment paragraph to ADR 0013 (what the 0.7 messages carry and why that is safe: only what everyone may know at that instant; the coin side rides along by decision; the `direct` shape fails closed on the old Worker). Needs the user's nod.

#### S6. Changelog lines missing for visible changes
- `CHANGELOG.md` [Unreleased] has no line for: „Rad verdecken“ and the Veto allowance locked while a game is drawn (known leftover, still open; `StepMode.vue`, `eventSettings.lockedDrawing`); the Game count that can no longer go below the Rounds started (`StepGameCount.vue`, `stepper.games.floor`, `game_count_below_started`); the Bench subtitle changed from „Ersatz, unbegrenzt“ to „Noch ohne Team, unbegrenzt“ (`de.json:190`, every Member sees it); the #237 fade at the new place under reduced motion (`GameBoard.vue`).
- Rule: release.md § Changelog lines: „A PR with a change Users can see adds its lines under `## [Unreleased]` … in the same PR.“ Groups in order (`### Geändert` after `### Neu`).
- Fix: a `### Geändert` group between `### Neu` and `### Behoben` with two or three lines (Host: settings lock and game-count floor; all: Bench wording; the reduced-motion fade if the user wants it said).

### Nit

- N1. Dead branch: `app/utils/host-dock.ts:21` and `:84` keep `primary: 'end'` / `case 'end'` in `dockLayout`, but `hostDockState` returns only `spin` / `setGame` for a running Session now, so `end` is never a primary (the dock tests never build it). Baseline: Speculative Generality. Delete the union member and the case.
- N2. Stale comment `shared/activity.ts:37`: „#235 adds `coin_tossed`“ while `coin_tossed` is already in the list on line 39. Reword to „`coin_tossed` (#235)“.
- N3. `app/components/CountdownSheet.vue:69-79`: the range error and the „läuft schon“ hint are bare `<p>`s (`text-error-fg`), not linked to the fields and not announced. CODING_STANDARDS „A notice, hint or error line in a page → NoticeBanner with its tone“; use `NoticeBanner` or the `error` prop of `TextField` (`TextField.vue:17`, linked by `errorId`).
- N4. `test/nuxt/veto-window.test.ts:16` builds a `MemberView` by hand with `image: null`. CODING_STANDARDS § Tests: „Tests that draw a Member build it with `memberView()` in `test/nuxt/event-page.ts`.“ The window shows names only, so low impact; swap for `memberView({ id, name, zone: 'team', team })`.
- N5. Small 04-motion gaps not in the leftovers: `VetoWindow.vue:32` renders its countdown from a 250 ms `setInterval` where 04-motion § Synchronised moments says „Countdowns render `ceil((endsAt − serverNow()) / 1000)` every frame“ (`EventCountdown.vue` does it with rAF, so the app has both); `ClipOverlay.vue:216` uses a raw `duration-250` and `:203` Tailwind's default `animate-pulse` instead of motion tokens (neither is a 04-motion moment, so a token or a comment settles it); the rAF loops of `LuckyWheel`, `CoinFlip` and `EventCountdown` (up to 99 min) are not paused off-screen („Pause timelines of off-screen elements (IntersectionObserver, rootMargin 120 px)“). Also `LuckyWheel.vue:9` says „3.5 s past its stop“ where the loop ends 3.4 s after a Hidden wheel's stop (`TAIL_MS` 100).
- N6. Mysterious Name (judgement): `app/utils/motion.ts:47` `veto()` is the generic „run or reduce“ helper for the Veto window only; call it `animateVeto`. `LuckyWheel.vue` `angle` ends in `+ 0` with no comment (`wheel.ts` explains the same trick for `wheelAngle`).
- N7. Second locked-transaction home: `server/utils/rounds.ts` `settleBeforeRead` opens `db.transaction` + `for('update')` on a GET and calls `recordActivity(tx, () => {}, …)`. ADR 0013's amendment sanctions „the first read or write after the instant settles it“, and lint only guards `server/api/e/**`, so it passes. But the CODING_STANDARDS table names `changeEvent` as the one home for „transaction, locked Event load, publish after commit“. Add a row or sentence for the read-side settle so the next timed feature calls it instead of copying it.
- N8. Duplicated Code (judgement): `const msOf = (at: Instant) => …` is spelled in `shared/session-state.ts:19`, `shared/clip.ts:7`, `shared/coin.ts:19`, `shared/countdown.ts:30`, and `new Date(now).getTime()` again in `shared/rounds.ts` `vetoRejection`. `Instant` is already exported from `session-state.ts`; export `msOf` with it. Same family: the `ClipView` / `CoinView` / `CountdownView` builders use `.toISOString()` (`server/utils/coin.ts:28`, `countdown.ts:25`, `clip.ts`) while `tossCoin` right below uses `isoInstant`.
- N9. Repeated Switches (judgement): `GameBoard.vue:45` `['running','between','done'].includes(props.pageKind)` and `:223` `['running','done'].includes(props.pageKind)` re-derive page-state facts that `app/utils/event-page.ts` keeps in `pollCompactIn` / `cardsStandOutIn`. Add `startedIn(kind)` and `unevenNoticeIn(kind)` there.
- N10. `knip.jsonc:11-13` suppresses all `exports` issues for `scripts/browser/kit.mjs`, against the file's own rule a few lines above („What counts as dead is an export nothing uses“). Fine as a documented toolbox; revisit when the second scenario lands, or list the exports it keeps.

### Leftovers confirmed or refuted where the reading touched them (not new findings)
- Confirmed, still open: `app/pages/e/[slug]/einstellungen.vue:48` `refreshNuxtData(eventDataKey(...))` (moved from line 47); `app/components/EventPoll.vue:42` still calls `sessionsEditable`; `server/utils/activity.ts:33` `activityEntries(tx, [row!], new Date())` (the only request-path `new Date()` left besides the vote rate limiter and the R2 signature, which `clock.ts` names as exceptions); unused strings `veto.window`, `veto.banner`, `veto.sealed`, `veto.by` and `dock.vetoRunning` (0 uses in app/server/shared/test); `poolWarning.text` (`de.json:1505`) has no singular for `needed` (plural only by `have`); the missing changelog line for the lock (folded into S6).
- Consistent with the standards, no finding: every new write handler goes through `changeEvent` (`broadcast: false` and `publishTo` are options of it; no second transaction in `server/api/e/**`); request bodies and params go through domain parsers (`parseSetGame`, `parseGrantBonusVeto`, `parseSetCountdown`, `parseActivityQuery`); the rules both sides enforce live in `shared/` (`countdownSeconds`, `BONUS_VETO_MAX`, `VETO_WINDOW_MS`, `coinRejection`, `clipPosition`); API errors go through `CODE_COPY` and `send` (every new code has copy; every `t()` key the diff uses exists in de.json); the new tables each have their index except S3; one enum per term; migrations 0016 and 0018 are additive for the previous deployment (ADR 0007); the clip, coin, rounds and board motion tests assert tokens and durations, and the wheel's curve and timings are pure functions with unit tests (`test/unit/wheel.test.ts`); no `@vercel/*` import; no personal data in the diff, the scripts or the workflow.

## Release 0.7 „Glücksrad“ — Spec review (spec #218 and tickets #226–#238)

Head reviewed: origin/feat/218-gluecksrad (diff v0.6.0...origin/feat/218-gluecksrad). Read-only; no repo file changed.

Result: **0 must-fix, 3 should-fix, 9 nit.** The secrecy design holds in every read, room message, named send and feed path I traced
(Hidden wheel, Pool preview, sealed Vetoes), settling is idempotent, under the lock and stamped with the instant, and the respin /
Game count rules match the spec. What I traced and found sound is listed at the end under "Checked and sound".

---

### Should-fix

#### S1. The slice order is the pool's alphabetical order on every spin, so `resultIndex` is decodable and a game can be followed around a Hidden wheel
- **Severity:** should-fix (secrecy)
- **Where:** `server/domain/wheel.ts:41-50` (`sliceGameIds: [...left]`, only the labels are shuffled); `server/utils/rounds.ts:42-49` (`readGamePool` orders by `lower(games.name)`); `server/utils/rounds.ts:182` (`drawSpin(left, …)`).
- **Spec lines missed:**
  - Story 11: „placeholder names on the slices, shuffled for every spin, **so that I can't follow a game around the wheel**“.
  - #229 / § Hidden wheel on the wire: „Nothing the app sends reveals the drawn game before the stop, **or any game not drawn**.“
- **Failure scenario:** Under a Hidden wheel the `round.spun` message (and the read) carries `slices` and `resultIndex` from the commit on. Slice i is always the i-th remaining game by name; only the placeholder texts move. (a) A Player who knows the pool (the Host announced it, or Pool preview was on before the Host switched to a Hidden wheel, which is allowed between Rounds; a Host-permission user sees the library) sorts the names and reads the drawn game off `resultIndex` 6 s before the stop, which defeats the reveal. (b) Without knowing the pool, each reveal (name X at index i of n) pins every undrawn slice alphabetically between known games, and a slice can be tracked by position from spin to spin, which is exactly what story 11 wants to prevent.
- **Smallest fix:** in `drawSpin`, when `placeholders !== null`, shuffle the slice order too: `const order = placeholders === null ? [...left] : shuffled(left, randomInt)` and use `order` for `sliceGameIds` and for the result id. The check constraint `slice_game_ids[result_index+1] = game_id` still holds. A visible wheel can keep the alphabetical order.

#### S2. A page whose clock estimate is early reads again once and then never again, so the stop reveal / Veto reveal / coin landing can stay missing until the 15 s poll
- **Severity:** should-fix (races / sync)
- **Where:** `app/composables/useInstantRefresh.ts:25-39` (an instant is deleted from `pending` when it fires; the watch re-adds only instants with `at + 250 > now`); used from `app/components/EventPage.vue:48-57`.
- **Spec lines:** § Deadlines: „Clients know each instant and refetch the Event read when one passes“; story 12 (the drawn slice turns real at the stop), story 27 („every Veto revealed at the same moment“), story 67.
- **Failure scenario:** The server settles and gates reads on its own clock, and nothing is broadcast at the stop or at the end of the window (settle publishes nothing; the feed entries are written without `activity.added`). The page fires its one refetch at `instant + 250 ms` by its estimated server time. If the estimate runs more than ~250 ms ahead of Nuxt's clock (lowest-RTT offset on a bad mobile link, drift between probe rounds), the read reaches the server before the instant: a Hidden-wheel Member gets no `spin.game` and no real label, the Veto tiles stay „wird aufgedeckt“, the coin banner and feed entry are missing. The instant is already dropped, so nothing reads again until `event.changed` or the 15 s poll.
- **Smallest fix:** after `refresh()` resolves in the `onPassed` callback, if the data still shows an unsettled passed instant (hidden spin with `stopAt <= now` but `game === null`; `vetoes.draw.vetoEndsAt <= now` but `revealed === null`; a coin whose `landsAt` passed but the feed lacks it), schedule one more refetch after ~500 ms, at most 3 times.

#### S3. The same game can sit in two open Rounds, and a vetoed game can be set again; a retried „Setzen“ opens a second Round of the same game
- **Severity:** should-fix (races / rules)
- **Where:** `server/utils/rounds.ts:129-161` (`setNextGame`): the only checks are `setRejection` and `unknown_game`; `source` falls back to `'library'` when the game is not in `gamesLeft` instead of refusing.
- **Spec lines:** § Drawing: games left are „the pool minus every game drawn or set in this Event (played, vetoed or open)“; story 28 „A vetoed game leaves the Game pool“; story 48.
- **Failure scenario:** The Host's „Setzen“ times out on a flaky link and is sent again (or double-tapped past the `busy` guard after a reload): the first one committed, the second finds the Round set (not being drawn) and the Game count not reached (e.g. 6), so it opens a second Round with the same game, burns a Round of the Game count and shows the game twice under „wird gespielt“. Also, a game the Parties just vetoed can be set again from the library search with „Veto erlauben“ off, which silently overrides the Vetoes.
- **Smallest fix:** refuse a game that already has a draw in a standing Round whose outcome is not `vetoed` (`game_already_open`, 409). If setting a vetoed game from the library is meant to stay possible, note it in the glossary; the duplicate-open case should be refused either way.

---

### Nit

#### N1. „Münzwurf“ is refused while the coin is in the air; story 68 says „any time“
`shared/coin.ts:41` (`coin_in_air`), `server/utils/coin.ts:110-118`. Spec: „I want to toss again any time, each toss new“ (story 68); roadmap: „the Host tosses it any time during a running Session“. Ticket #235 only says „Each toss is new“, and a second toss in flight would break the late joiner's single latest-toss read, so the refusal is defensible. Either note the decision in the ticket / glossary or allow it (a new toss replaces the flight; `readLatestToss` already takes the latest).

#### N2. A Veto can be cast after the Running Session has ended
`server/utils/rounds.ts:225-250` (`castVeto`) and `shared/rounds.ts:202-209` (`vetoRejection`) never look at the Running Session. The stage hides the wheel after „Session beenden“ (`onWheel` needs a Running Session), so no page offers it, but a request in a window that was open at the end of the Session is accepted and decides the draw. Add `no_running_session` to the veto path, or document that the window outlives the Session.

#### N3. A Host who plays can peek at a sealed Veto by moving into the Party
`shared/board.ts:61` (the Host moves anyone at any time) with `server/utils/event-read.ts:228-232` (`own.castBy` is shown to every Player of the Party). The Host moves themself from Party A to Party B during B's open window and reads B's `castBy`. Only the Host can do it, so the promise to Players holds, but the Host-as-Player is then not blind. Smallest fix: refuse a move into or out of a team while a window runs, or accept it as the Host's privilege and say so in the glossary.

#### N4. The coin's visibility rule mixes two clocks
`server/utils/coin.ts:140` compares the toss's request-clock `startedAt` with the Session's `startedAt`, which `server/api/e/[slug]/sessions/start.post.ts:23` and `end.post.ts:17` stamp with the database's `now()`. If the app clock lags the database by more than the 1.5 s lead (`COIN_LEAD_MS`), tosses of the whole Session are hidden. Fix: delete the Event's `coin_tosses` in the Session end transaction (as the Countdown is, `end.post.ts:19`), or stamp Session start / end with `useClock(event).now()` (ADR 0013: Nuxt owns the instants).

#### N5. The settings page never reads again at the end of a draw, so the „Rad verdecken“ lock text stays up to a poll after the lock is free
`app/pages/e/[slug]/einstellungen.vue:37-45` takes `roundBeingDrawn` from the last read; there is no `useInstantRefresh` on that page and settling broadcasts nothing. The server is right (`settings.patch` settles first, `server/utils/settings.ts:43-46`); only the displayed reason lingers up to 15 s. Fix: the same `useInstantRefresh` on the window's end, or drop the lock text once the read's `vetoEndsAt` has passed.

#### N6. The Event read is not one snapshot
`server/utils/event-read.ts:56-87` reads the Rounds with the other rows and `roundsSection` (`:198`) reads the draws afterwards. A spin that commits between the two makes a response with a draw whose Round it lacks (`roundBeingDrawn` false for a moment, the game already gone from `left`). The next `event.changed` refetch corrects it, so it is transient; reading the draws in `readEventRows` would close it.

#### N7. Work outside #218 and its tickets
- `.github/workflows/game-day-check.yml` (a new `workflow_dispatch` workflow; retro 0.6, not in the spec's list).
- `server/utils/settings.ts:38` (a settings body with neither `settings` nor `pools` is now `invalid_settings`).
- `scripts/browser/pool-preview.mjs`.
All small and commented; name them in the PR body so they are not a surprise.

#### N8. A Round that waits for a respin cannot be left (confirms the session-3 leftover)
`server/utils/rounds.ts:261` (`putBackRound` refuses it as `round_being_drawn`) with `shared/rounds.ts:120` (a waiting Round keeps `roundsStarted` up, so the Game count floor holds too). With an empty pool after the Veto, the only way on is „Nächstes Spiel setzen“ from the library. Story 40 speaks only of an *open* Round, so this is as written; a copy line on the disabled „Neu drehen“ (`dock.setBlocked.pool_empty`) that points at „Nächstes Spiel setzen“ would remove the dead end for the Host.

#### N9. Changelog gaps
`CHANGELOG.md` has no line for: the lock on „Rad verdecken“ and the Veto allowance while a game is drawn (visible to Hosts), the reduced-motion fade and the 5 s return of an unconfirmed move (#237, the one place a User can notice it), and the Bench subtitle copy (#238). Confirms the #231 leftover.

---

### Leftovers: confirmed or refuted where my reading touched them

- **#235 coin lands on the wrong face (high): still present.** `app/utils/coin-flight.ts` and `CoinFlip.vue` have no commit after `73837f2`, which is before session 3's browser check; `faceRoll` / `finalTilt` are unchanged. I did not re-derive the 3D transform; I rely on the screenshot named in the leftover.
- **#232/#229 `LuckyWheel` shows the latest *spin*, not the latest draw: confirmed** (`event-read.ts:280-283`: `spin` is the latest `kind === 'spin'`, `windowDraw` the latest draw of any kind). After a set game with „Veto erlauben“ the wheel's result card is an older spin's. No secrecy effect: the older spin is stopped, its game is known.
- **#231 a waiting Round can't be put back: confirmed**, see N8.
- **#231 `Rad verdecken` / Veto allowance lock without changelog line: confirmed**, see N9.
- **#234 „noch 1 Spiele“: confirmed** (`i18n/locales/de.json:1507` pluralises by `have` only; `needed` has no singular).
- **#234 the Host's read queries the Vetoes twice: confirmed** (`vetoView` `event-read.ts:222` and `poolWarningOf` `:260`); harmless, both go through `knownVetoRows`.
- **`einstellungen.vue` still calls `refreshNuxtData`: confirmed** (line 48, not 47). **`EventPoll.vue` still calls `sessionsEditable`: confirmed** (line 42).
- **`recordActivity` names published entries with `new Date()`: confirmed** (`server/utils/activity.ts:33`); real clock and request clock agree in production, only a test clock could differ.
- **Stage block order (#234): confirmed** (`app/utils/event-page.ts`, `running`: `'pool'` before `'wheel'`); story 15 wants the Round being drawn first.
- Not re-checked (client-visual): label overlap, the 0.22 s fade, overlay offset, autoplay, the idle wheel snap, the first-hydration 0°.

---

### Checked and sound (so nobody re-traces it)

**Secrecy**
- Hidden wheel read (`event-read.ts:278-318`): a non-Host gets `slices: null`, placeholder `labels`, the result label's real name and `spin.game` only when `spin.stopAt <= now`; the games table is queried only for ids the viewer may know (`ids` is built per viewer), so no row of an undrawn game leaves the database.
- `round.spun` (`rounds.ts:204-214`) carries counts, index, offset, instants and placeholders, never a game; `round.set` / `round.putBack` / `countdown.changed` carry ids only.
- Pool preview: `pools` stays null for a Member (`poolsSection`); the set game appears only through `rounds` / `vetoes.draw.game` (stop = set instant for a set draw); notes are the Host's alone (`roundGameView`, `RoundView.notes`).
- Image route (`pools.ts:gameEventsOf`): a draw's game gets its picture from `stopAt <= now`, not before; put-back and vetoed games stay visible (everyone saw them).
- Clip (`clip.ts:readClip`): selects only draws with `stopAt <= now`, so the game stays out of the read before the stop.
- Sealed Vetoes: `castVeto` runs with `broadcast: false` (no `event.changed`) and the cast goes only to the Users of the casting Party (`publishTo`; the Worker's `{ to, direct }` shape fails closed on an old Worker); the read counts a cast on a draw whose window runs only for its own Party (`knownVetoRows`), `own.castBy` is the viewer's Party only, `revealed` exists only after `vetoEndsAt`, `own.rejection` can only name the viewer's Party; the Host's Veto allowance floor counts settled draws only (`settings-floors.ts`) and the allowance is locked while drawn; the pool warning uses `knownVetoRows`. A Bonus Veto inside a window changes only public numbers.
- Feed: `game_drawn`, `vetoes_revealed`, `coin_tossed` are written with their instant as `at` and left out of the page until then (`INSTANT_ACTIVITY_TYPES`, `readActivityPage`); game names are resolved only for games a draw has stopped on or a Round has set (`namedGames`); no `activity.added` is published for them; `next` is computed after the hidden rows are filtered.
- Numbers: the pool size reaches a non-Host only as `wheel.count` (story 13); `setGame`, `poolWarning`, `roundBeingDrawn`, `bonusVetoes`, `settingsFloors` are Host-only. The count drops when a pool game is set (story 48), so a Player can tell a pool game from a library game; that is inherent to story 48, not a leak of an undrawn game.

**Settling / instants**
- `settleDue` is one conditional update (`outcome IS NULL`) under the Event row lock; it stamps `settledAt`, `rounds.setAt` and the feed `at` with the draw's own instant (`stopAt` or `vetoEndsAt`) and is called first by every round write, the settings change, `skipClip`, the Event read and the feed read; a read with nothing due takes no lock (`settleBeforeRead`). Two readers settle once; a thrown write rolls its settle back and the next read redoes it.
- In every round handler the clock is read inside the `changeEvent` callback, i.e. after the lock is held (`veto.post.ts`, `rounds/*.ts`, `coin.post.ts`), so a request that waited for the lock is stamped when it runs.

**Respin / Game count**
- A Round is the unit: a `waitsForRespin` Round takes the next spin or set, counts once toward `roundsStarted` and bypasses `game_count_reached` (`shared/rounds.ts:120`); the unique index `rounds_one_drawn_per_event_idx` backs „only one Round drawn at a time“; vetoed games stay out of `gamesLeft`, a put-back Round returns only a pool game whose draw was `set`, spent Vetoes stay (casts in put-back Rounds are counted by `readVetoes`); the Game count floor is `roundsStarted`; open Rounds survive the Session end.

**Races between two requests**
- Spin / set / put back / cast / grant / toss / countdown all use `lock: 'update'`; one Veto per Party per draw is the primary key `(draw_id, team)` plus the rule; two Bonus Vetoes cannot both pass the limit; the cast / window-end race resolves consistently either way (a cast stamped before the end that lost the lock to a settle is refused `veto_window_closed`).

**Worker / deploy**
- The named send is a distinct body shape, so a new Nuxt against the old Worker fails closed (400, nothing broadcast); a body with both shapes is refused; matching on `sub` covers every tab of a User; the in-memory notifier records the named Users.

## Quality and architecture review, Release 0.7 „Glücksrad“ (thermo-nuclear + improve-codebase-architecture)

Diff `v0.6.0...origin/feat/218-gluecksrad` (HEAD 3e431da, 76 commits, 200 files, about 19k lines added, a large share tests and drizzle snapshots). Read-only; no tests run. Known leftovers (`leftovers.md`) are not repeated. Vocabulary from `codebase-design`: module, interface, depth, seam, adapter, leverage, locality.

Severity: **must-fix** = before the Release reaches `main`; **should-fix** = before the cut if cheap, else first ticket of 0.8; **later** = ticket.

### Result

- **Must-fix: 0.** Nothing in this axis blocks the Release. No file crosses 1k lines (largest: `EventPage.vue` 537, `shared/event.ts` 430, `event-read.ts` 384; tests top out at 903). The migrations 0016-0018 are additive, indexed and say why the old deployment is unaffected.
- **Should-fix: 9** (Q1-Q9). **Later: 8** (Q10-Q17).
- The 1.4 architecture bets paid off. A1 (one home for a Session's state, `shared/session-state.ts`), A2 (Nuxt owns the deadline; ADR amended; no Worker timer), A5 (publish after the response), A6 (people and games by declaration, `ACTIVITY_PEOPLE`/`ACTIVITY_GAMES`, `ParamsSafe` makes „no game name in params" a compile error) and A8 (`useBoardPlaces`) are done and the stage pieces lean on them. `settleDue`/`settleBeforeRead` is a clean answer to „no timer runs": one idempotent settle, called under the row lock, stamped with the instant that decided it.
- What is not good yet is the **shape of „a stage piece"**. Five pieces landed (rounds + wheel + Vetoes, clip, Countdown, Coin flip, Bonus Veto), each as a vertical slice that is individually tidy (pure rule in `shared/`, row access in `server/utils/`, thin handler, one component) but which all hooked into the same eight horizontal lists. See the verdict next.

### Verdict: is a registry for stage pieces worth it now?

**Not one registry. Three small seams, as ticket zero of 0.8, before the result/finish/ceremony pieces arrive.**

Evidence (non-merge commits touching the file, of about 9 stage tickets): `de.json` 13, `shared/event.ts` 12, `event-read.ts` 12, `EventPage.vue` 12, `CHANGELOG.md` 10, `api-error.ts` 9, `errors.ts` 8, `realtime.ts` 8, `host-dock.test.ts` 7, `[slug].get.ts` 7, `host-dock.ts`/`useHostActions.ts`/`event-page.ts` 6. Eight of the 76 commits are „merge the integration branch into the ticket branch" syncs. A new piece today touches, beyond its own files: `Block` union + `pageBlocks` arms, a `v-else-if` in `EventPage.vue` with its prop wiring, `knownInstants`, `DockKey` + 2-3 `dockLayout` arms + `useHostActions` entry + `HostActionHandlers` + dialog `defineExpose`, a section builder + the handler's spread + an `EventView` field, `ACTIVITY_TYPES`/`PEOPLE`/`GAMES`/`INSTANT`/icon/sentence, `API_ERROR_STATUS` + `CODE_COPY`, a `RoomMessage`, and the changelog.

Why not a full registry (`{ block, component, props, section, instants, dock }` per piece):
- The client side is typed props per component. A registry that maps block to component through `<component :is>` hides the data flow and loses the template type check; the explicit `v-else-if` chain is boring and right. `pageBlocks` already is the one ordered list per state (A4 half done), so the block list is not the pain.
- The server sections are not yet one shape (pure vs async, with or without viewer, with or without `db`), so an array of them has no uniform interface. Make the interface uniform first (Q1), then the array is a one-liner.
- The collisions come from three things that are cheap to fix on their own: (a) the Event read's handler composing sections by hand (Q1), (b) the instants list living in the page component (Q2), (c) the dock's per-state arrays and their whole-list `toEqual` tests (Q3). Plus a process fix for the changelog (Q4). Together they remove the conflict points for a piece's server read, its refetch instants, and its dock entry. What stays explicit: the template branch and the activity/error/message tables, which are type-checked tables where a missing entry is a compile error (the good kind of list).

Open threads from review 1.4: **A1, A2, A5, A6, A8 done. A3 partial** (the lock is still two constants, `LOCKED_WHEN_RUNNING` and `LOCKED_WHILE_DRAWN`, and `checkSettingsChange` takes a `roundBeingDrawn` boolean; acceptable, a `lockOf(key, ctx)` is still the better shape the next time a lock depends on state). **A4 half done**: `eventPageState` returns `blocks`, `pollCompact`, `cardsStandOut` and the dock has named parts, but the page still holds the phone-tab state (`EventPage.vue:164-192`) and the text computeds, and the page grew from 461 to 537 lines (Q6).

---

### Should-fix

#### Q1. The Event read's stage sections: one module, one uniform interface, parallel, one Veto read (should-fix; the server half of the registry)
- `server/utils/event-read.ts:183-353` (about 170 of its 384 lines) and `server/api/e/[slug].get.ts:25-27,44-47`.
- Problem: `event-read.ts` was the Sessions/poll/board read; 55% of it is now the round family (`roundsSection`, `vetoView`, `partyOf`, `poolWarningOf`, `wheelView`, `clipSection`, `countdownSection`, `coinSection`, `bonusVetoSection`), including the most secrecy-critical code in the app (`wheelView`). The handler composes by hand: `readEventRows` and pools in parallel, then `await roundsSection` alone, then a second `Promise.all` of four sections that do not depend on it. Inside `roundsSection` the awaits chain (draws+pool, then `poolWarningOf` reads Vetoes+Bonus, then `wheelView` selects games, then `vetoView` reads Vetoes+Bonus again) and `bonusVetoSection` reads the Bonus rows a third time. On a Lucky Wheel Event that is about 9 serial round trips on the endpoint every client refetches on each `event.changed` and each instant. Every stage ticket also appended an import, a function and a spread in these two files (12 and 7 touches).
- Fix (behaviour unchanged): move the round family into `server/utils/stage-read.ts` (the Event read keeps poll, Sessions, members, board, start, pools, invite). Give the sections one signature, `(ctx: { db, eventRow, rows, viewer, now }) => Promise<Partial<EventView>>`, and let the handler spread `await Promise.all(stageSections.map(section => section(ctx)))`. 0.8's result and ceremony sections become one array entry. Inside: start `readVetoes`/`readBonusTeams` in the first `Promise.all` with `readDraws`/`readGamePool`, pass the rows to `poolWarningOf`, `vetoView` and `bonusVetoSection`. That also removes the Host's double Veto read from the leftovers. Existing integration tests (`hidden-wheel`, `vetoes`, `pool-preview`) cover the move.

#### Q2. `knownInstants` belongs in a pure function with its own test (should-fix; the client half)
- `app/components/EventPage.vue:42-57`.
- Problem: the list of „instants the page must refetch at" is four path expressions into the view, inline in the page, with the comment that grows per ticket. It is the only thing that knows, for the whole page, which view fields are deadlines. The server side has the mirror knowledge (`dueDraws`, `INSTANT_ACTIVITY_TYPES`, `readClip`'s end). A new piece with a deadline (0.8: nothing yet, but 0.9's ceremony will) must remember to add a line here; nothing fails if it does not, the page just stays stale until the 15 s poll.
- Fix: `viewInstants(view: EventView): number[]` in `app/utils/event-instants.ts`, one expression per piece, a unit test per piece („the Veto window's end is an instant"). The page keeps `useInstantRefresh(() => (data.value ? viewInstants(data.value) : []), …)`.

#### Q3. `dockLayout`: the game actions are spelled out three times, one arm is dead, and the tests pin whole lists (should-fix; the dock half)
- `app/utils/host-dock.ts:21,74-88`, `test/unit/host-dock.test.ts:140-185`.
- Problem: (1) `case 'end'` (line 84) and `'end'` in `HostDockState.primary` (line 21) are dead: `hostDockState` never returns `primary: 'end'` since „Session beenden" became a secondary. (2) The three running arms repeat `[...bonus, 'coin', 'countdown', 'settings']` and `['end', 'invite']`; every stage ticket edited all of them (6 touches), and 9 `toEqual` tests pin whole `more` lists, so every new action rewrites the same test lines and conflicts. (3) `dockLayout(state, pollOpen, bonusVetoOpen)` takes positional booleans; the next piece adds a third.
- Fix: delete the dead arm and the `'end'` primary. Introduce `const GAME_ACTIONS: DockKey[] = ['bonusVeto', 'coin', 'countdown']` (filtered by the flags) and compose `more: [...head, ...GAME_ACTIONS, 'settings']` once for the running arms. Pass a small `{ pollOpen, bonusVetoOpen }` object. Rewrite the tests to assert the contract, not the list: primary per state, `secondary` contains `end` while running, `more` ends with `settings`, each game action is in `more` while running and in no other state (three of the tests already do this). A new action then adds one string and one membership test.

#### Q4. The changelog is the one list that conflicts by design; fix the process, not the file (should-fix, a `release.md` change)
- `CHANGELOG.md` (10 touches), `docs/agents/release.md` § „Changelog lines (every ticket PR)".
- Problem: the rule says every ticket PR appends under `[Unreleased]`, so a spec built from nine tickets on one integration branch has nine branches editing the same hunk; the log shows the sync merges this causes. Fragments (towncrier-style) would need a parser, test and cut-script change in `shared/changelog.ts`; that is more than the problem is worth.
- Fix (cheapest first): (a) for a spec on an integration branch, ticket branches add no changelog line; the closing ticket (or the orchestrator when it merges each ticket into the integration branch) writes the lines in the Release's order and wording in one commit. State it in `release.md` § Changelog lines. (b) Optionally `CHANGELOG.md merge=union` in `.gitattributes`: it resolves append-vs-append for the local `git merge` syncs, but GitHub's web merge ignores merge drivers, so it is only a partial help and can duplicate a line if two branches edit the same bullet. Do (a); skip (b) unless syncs stay painful.

#### Q5. Five stage components hand-roll the same server-time ticker (should-fix; the deepest module missing)
- `app/components/LuckyWheel.vue:34-66`, `VetoWindow.vue:26-34`, `CoinFlip.vue:81-107`, `EventCountdown.vue:26-57`, `ClipOverlay.vue:57-170`.
- Problem: each has its own `now` ref, its own `requestAnimationFrame` or `setInterval`, its own `onMounted`/`onBeforeUnmount` cleanup, its own `mounted`/client-only guard so that the server render and the first client render agree, and its own stop condition. 15 to 25 lines each, five times, with small differences (rAF vs 250 ms; `landed` vs `mounted` guards; `restart` vs `drive` vs `start`) that are accidents, not decisions. This is the next piece's first copy-paste (0.8's result reveal, 0.9's ceremony).
- Deletion test: delete the five copies and the knowledge „a ref of server time that ticks while something is pending, null before mount" reappears in every new piece. A module would concentrate it.
- Fix: `useServerTicker(serverNow, { until: () => number | null, every?: 'frame' | number })` returning `Readonly<Ref<number | null>>` (null before mount, stops itself once `now >= until`, restarts when `until` changes, cleans up on unmount). Each component keeps its own derivation (`running`, `landed`, `secondsLeft`) as a `computed` of that ref. The components' tests already inject `serverNow`, so they cross the same interface. Do it with the first 0.8 piece that needs a ticker, or earlier if the leftover „dev hydration mismatch" (#230) is looked at: the null-before-mount rule fixes it in one place.

#### Q6. `EventPage.vue` kept growing: stage actions and phone tabs belong outside it (should-fix, finish A4)
- `app/components/EventPage.vue:69-98,164-192,353-393`, `app/components/EventHostDialogs.vue:112-137`.
- Problem: 461 to 537 lines. The script now holds six one-line `send(...)` wrappers (`reopenSession`, `removeSession`, `endSession`, `castVeto`, `skipClip`, `putBackRound`), two inline sends in handler objects (`spin`, `coin`), a `command` lambda that builds the Countdown path in the template (`'countdown/' + action`, `EventPage.vue:386`, the type lives in the component), the phone-tab state (`wide`, `activeView`, `unread`, `tabs`, `panelTabs`: the 1.4 A4 `useEventTabs` that was not done), and the three text computeds (`seatNote`, `teamsStay`, `pill`). The wheel block is an inline `div` that wires `LuckyWheel` and `VetoWindow` with 14 props between them. Host actions are split between the page (spin, coin, end) and `EventHostDialogs` (set game, Countdown, Bonus Veto): to find where an action sends its request you need both.
- Fix: (1) `useStageActions(slug, refresh)` returning `{ castVeto, skipClip, putBackRound, spin, toss, countdown(action), endSession }`, so the page passes functions and holds no request strings; (2) `useEventTabs(room)` as A4 said; (3) a `StageWheel.vue` taking `data` + `serverNow` + `castVeto` and rendering the wheel and the window together, so the page's `wheel` branch is one component with three props; (4) move the three text computeds next to `pagePill` in `utils/event-page.ts` as pure functions. Target: the page under 400 lines and 0.8's blocks add a branch, not 15 lines of script.

#### Q7. Five of the six new room messages have no listener (should-fix, or delete the payloads)
- `shared/realtime.ts:42-63`; senders `server/utils/rounds.ts:159,205-214,265`, `coin.ts:56`, `countdown.ts:48,79`; the only client listener is `EventPage.vue:92` (`veto.cast`).
- Problem: `round.set`, `round.putBack`, `round.spun` (with `spinStartAt`, `stopAt`, `resultIndex`, `resultOffset`, `labels`), `countdown.changed` and `coin.tossed` (with the side and both instants) are built, published, tested and documented, and nobody reads them: every client just refetches on the `event.changed` that `changeEvent` adds to every commit. That is dead protocol surface with two costs: a second, unfiltered copy of the spin and the coin's side travels to every socket (the Event read is the filtered one; the comments say „no game data" and rely on the sender's care), and a reader of the code assumes the messages drive the stage.
- Fix: delete the five types and their `publish` calls and their message assertions (the room tests keep `event.changed`, `veto.cast` and named sends). If 0.8 wants a payload message (a live scoreboard), it adds it with its listener. If the author wants them reserved, say so in `shared/realtime.ts` and keep only the payload-free ones.

#### Q8. `INSTANT_ACTIVITY_TYPES` and `recordActivity`'s `at` are two unlinked sources of one rule (should-fix, small)
- `shared/activity.ts:39`, `server/utils/activity.ts:19-33,106-110`.
- Problem: a type in the list must be written with `at` (so it is not published and the feed hides it until then); a type not in the list must not. Nothing ties the two. A new instant type written without `at` is published at once, with its params (`game_drawn` carries `gameId`) to every socket before the stop: the leak that A6 asked to make mechanical for names but not for ids. A non-list type written with `at` is silently never pushed. The feed filter (`notInArray(type, INSTANT…) or at <= now`) also depends on the list.
- Fix: type it. `recordActivity` takes `{ type, … } & (T extends InstantType ? { at: Date } : { at?: never })` (a conditional on the params object, or two overloads), so a list type without `at` does not compile. Add a unit test that every list type is an `ActivityType` (already by type) and that the feed hides an instant type before its `at`. Note the alternative that deletes the list: filter every feed read by `at <= now` for all types; the only reason against is that a test clock set in the past would hide DB-stamped entries, which is a test-harness reason.

#### Q9. „What a viewer may know of a drawn game" has four implementations (should-fix; the secrecy rule has no single home)
- `server/utils/event-read.ts:278-318` (`wheelView`: `sees`, `stopped`, `windowGameKnown`), `server/utils/pools.ts:41-57` (`gameEventsOf`: `stopped`/`wasSet` as SQL), `server/utils/activity.ts:55-70` (`namedGames`: `lte(draws.stopAt, now)` or a Round's `gameId`), `server/utils/clip.ts:22-30` (`readClip`: `lte(draws.stopAt, now)`).
- Problem: the 1.4 review (A2) asked for the drawn-games branch to live in `canSeePoolGames`, with a `now` input. What was built is `canSeeGame({ set })` for the image route only, plus the same rule re-derived in SQL or TypeScript in three other places. All four agree today and the hidden-wheel tests pin it, but the rule is „a draw's game is public from `stopAt`, the Host's always, a Hidden wheel's only the drawn one", and 0.8's result and ceremony will add a fifth reader. A fifth copy that is off by one comparison (`<` vs `<=`) is a Hidden-wheel leak.
- Fix: one SQL fragment `stoppedDraws(eventIds, now)` (a `where` helper or a CTE-like function in `server/utils/draws.ts`) used by `gameEventsOf`, `namedGames` and `readClip`; and a pure `drawGameKnown({ isHost, draw: { stopAt }, now })` in `server/domain/pool-preview.ts` used by `wheelView`. Keep the integration tests as they are; add one unit test for the pure rule at the exact instant.

---

### Later (tickets)

#### Q10. A Session's start and end are still stamped by the database clock; the coin compares them with request-clock instants (later, one small ticket with Q11/Q12)
- `server/api/e/[slug]/sessions/start.post.ts:23`, `sessions/end.post.ts:17`, `server/utils/coin.ts:113-118` (`readShownToss`), `server/db/schema.ts` comment on ADR 0013.
- Problem: ADR 0013 (amended) says every instant a rule compares with „now" comes from the request's clock so a test can move it. 0.7 added the first rule that compares a Session's `startedAt` with another instant: a toss belongs to the Running Session when `latest.startedAt >= running.startedAt`, where the toss is on the request clock (+1.5 s lead) and the Session start is `sql\`now()\``. In production the two agree; under a test clock (2090) a toss of Session 1 is „newer" than Session 2's start, so a test cannot show that a new Session starts without the old toss. The same file family has a second, different mechanism for „dies with the Session": the Countdown is deleted inline in `end.post.ts:19` (and the read guards only by `runningOf`), the toss is filtered by time, the clip and wheel by `runningOf`.
- Fix: stamp start and end with `useClock(event).now()`. Then give a toss its Session: `coin_tosses.session_id` (migration 0019, nullable for old rows) so `readShownToss` is `where session_id = running.id` with no time comparison; and move „what ends with a Session" into one `onSessionEnded(tx, eventRow)` in `server/utils/sessions.ts` (today: delete the Countdown; tomorrow: 0.8's open results) instead of a line in a handler.

#### Q11. Every Event writer must remember `useClock` and `settleDue`; make both part of `changeEvent` (later, with Q10)
- `server/api/e/[slug]/{rounds/index,rounds/spin,coin,bonus-vetoes,clip/skip,countdown/*,draws/[drawId]/veto}.post.ts` (nine handlers each `import { useClock }` and pass `useClock(event).now()`), `server/utils/{rounds,clip,settings}.ts` (each starts with `await settleDue(tx, eventRow, now)`).
- Problem: ADR 0013 says „the first read or write after an instant settles it". The read side is central (`settleBeforeRead` in two handlers); the write side is a convention: `setNextGame`, `spinWheel`, `castVeto`, `putBackRound`, `skipClip` and `applySettingsChange` call `settleDue`; `tossCoin`, the Countdown commands, `grantBonusVeto`, session end and start do not, and are right not to today. The next writer that reads round state (0.8's result entry) has to know. `afterCommit` already calls `useClock(event).now()` itself, so the clock is read twice per request.
- Fix: add `now: Date` to `EventChange` (set once in `changeEvent` from `useClock`), delete the nine `useClock` imports and arguments, and add an option `settle?: boolean` (default true for writers that touch rounds, or simply always: `dueDraws(...).limit(1)` is one indexed select inside a transaction that already holds the lock). Then the convention is the default and 0.8 cannot forget it.

#### Q12. `ACTIVITY_PEOPLE` and `ACTIVITY_GAMES` are two 18-row tables that are mostly `() => []` (later)
- `shared/activity.ts:95-156`.
- Problem: adding a type means a row in two tables, 15 of 18 rows in each say „nobody". The type-check forcing is good (A6 asked for it), the ceremony around it is not: 36 lines to say 5 facts, and per piece 4 more lines.
- Fix: one table `ACTIVITY_NAMES: { [T in ActivityType]: { people?: (p) => string[], games?: (p) => string[] } }` where an absent key means none, or one `Partial` per table with the exhaustiveness check moved to a type test. Not urgent; do it when the next type is added. (Keep the compile-time forcing for `params` shape: that is `ParamRules`, and it is worth its 30 lines.)

#### Q13. `msOf` is copied four times and `Instant` lives in the wrong module (later, 15 minutes)
- `shared/session-state.ts:19`, `shared/clip.ts:7`, `shared/coin.ts:19`, `shared/countdown.ts:30` (identical bodies); `shared/rounds.ts:205-206` re-spells it as `new Date(x).getTime()` three times; `server/utils/coin.ts:68` once more.
- Problem: the `Instant` type and its conversion are not a Session concept; `session-state.ts` happens to be where they were first needed. `coin`, `clip`, `countdown` and `rounds` import a type from a module about Session state.
- Fix: `shared/instant.ts` exporting `Instant` and `msOf`; the five modules import it; `vetoRejection` uses it. A one-line unit test.

#### Q14. GLOSSARY lacks the terms the code cites (later, docs)
- `GLOSSARY.md`; cites: `server/utils/clip.ts:13`, `shared/clip.ts:1`, `shared/event.ts:226` („GLOSSARY: Clip"); the `draws` table, `DrawRow`, `VetoView.draw`, `settleDue` and the UI copy „Veto-Fenster" use **Draw** and **Veto window**; `Veto` mentions the veto window without defining it.
- Fix: add **Clip**, **Draw** (one try at a Round's game: a spin or a set; vetoed or set; open until it settles) and **Veto window** (the 60 s from the stop, or from the set, in which every Party with a Veto left may reject the game), each with `_Avoid_` lines. `domain-modeling` skill.

#### Q15. Block presence is decided twice: `pageBlocks` by state, the template by data (later)
- `app/utils/event-page.ts:60-72`, `app/components/EventPage.vue:296-298,353-354,381-382,389-390`.
- Problem: `pageBlocks('running')` always lists `pool`, `countdown` and `coin`; the template then checks `data.setGame?.poolWarning`, `data.countdown`, `data.coin`, and `empty:hidden` hides the empty wrapper. Two places must agree about when a block exists, and a block with no data still takes a slot in the `TransitionGroup`.
- Fix: let `eventPageState` take the view fields it needs (`countdown !== null`, `coin !== null`, `setGame?.poolWarning`, `wheel !== null`) and list a block only when it has data; the template branches drop their `&& data.x`. The unit test for `pageBlocks` then covers the presence rules too.

#### Q16. `setNextGame` and `spinWheel` repeat „settle, read facts, pick the Round, insert the draw, record, publish" (later)
- `server/utils/rounds.ts:129-161` and `172-216`.
- Problem: both do `settleDue`, `readRoundFacts`, find the Round that `waitsForRespin` (`setNextGame` with an if/else that inserts a Round or updates one; `spinWheel` with `waiting?.id ?? insert`), insert a `draws` row and call `recordActivity` + `publish`. They diverge in one real way (instants and slice data). The four-place edit shows when 0.8 changes what starts a Round.
- Fix: `roundForDraw(tx, eventRow, roundRows, drawRows, now, patch)` returning the Round id (reuse the respin Round or insert), and `insertDraw(tx, …)`. Keep the two public functions; they shrink by about 20 lines each.

#### Q17. Small ones, one list (later)
- `settings !== null && hasWheel(settings.selectionMode)` is spelled five times (`event-page.ts:143`, `host-dock.ts:42`, `EventHostDialogs.vue:121`, `event-read.ts:196,350`). Add `eventHasWheel(settings: Pick<EventSettings, 'selectionMode'> | null)` next to `hasWheel` in `shared/settings.ts`.
- `shared/event.ts` (430 lines) now holds Event limits, Phases, Session views and all stage views (`RoundView` to `BonusVetoView`, about 130 lines). Move the stage views to `shared/stage.ts` (re-export types from `event.ts` only if a consumer needs it) before 0.8 adds results; it also gives the stage pieces one place to look.
- Time arguments of the rules differ: `coinRejection({ nowMs })`, `countdownRejection(…, nowMs)`, `vetoRejection({ now: Instant })`, `clipPosition(clip, nowMs)`, the server callers pass `Date`. With `Instant`/`msOf` (Q13) every rule can take `now: Instant`.
- New foreign keys without an index: `draws.game_id`, `vetoes.user_id`, `bonus_vetoes.granted_by`, `coin_tosses.tossed_by`, `rounds_game_id_idx` exists. Deleting a game or a User scans them; the same decision as `activity.actor_id` in 1.4. Record it in the schema comment instead of adding indexes.
- `HostDockState.primary` doc and the `useHostActions.ts` header still describe „Session starten oder beenden"; update with Q3.

---

### Checked and fine
- **Layering:** `shared/rounds.ts`, `coin.ts`, `clip.ts`, `countdown.ts`, `session-state.ts` are pure, import only `shared/`, and are unit-tested; the Worker imports none of them (the deploy-path test still holds). The named send fails closed (`RoomPublishBody` with `direct`), and the comment says why.
- **Atomicity:** every round, Veto, coin, Countdown and Bonus write runs in `changeEvent` under `lock: 'update'`; the settle re-checks under the lock (`isNull(draws.outcome)` in the update). The partial unique index `rounds_one_drawn_per_event_idx` and the `draws_*` checks keep the invariants in the database.
- **Secrecy discipline:** `ActivityParams` refuses a wide string under a key not ending in `Id`; the feed hides instant entries until their `at`; `readClip` selects only stopped draws; the Event read names a Hidden wheel's drawn game only from the stop. (Q9 is about the number of copies, not about a hole.)
- **Migrations:** 0016 (six `ADD VALUE`s, none used in the same transaction), 0017 (new tables only), 0018 (nullable column) are additive; each says why the old deployment is safe (ADR 0007). No migration edited after merge.
- **Reuse:** `ClipPreview` shrank by 48 lines onto `utils/youtube.ts`; `teamsRejection` is the one equal-teams rule for start, set and spin; `apiFailure` returns the refusal's payload (N6 closed); `refreshEvent` replaced the hand-built key calls (one left: `einstellungen.vue:47`, in the leftovers).
- **Dead code:** `knip` stays green with one scoped ignore (`scripts/browser/kit.mjs`, with a reason). Unused i18n strings are in the leftovers.
- **Not checked:** visual behaviour, accessibility, query plans on production data, the browser scripts (`scripts/browser/*`), `game-day-check.yml`.
