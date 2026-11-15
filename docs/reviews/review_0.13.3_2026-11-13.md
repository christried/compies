# Review 0.13.3 „Ton“ (2026-11-13)

Diff `v0.13.2...origin/spec/504-ton` (tip 3ceb6bba). Per `docs/agents/release.md` § Review, three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#504);
- Quality (code quality, with the architecture vocabulary of `codebase-design`).

## Result

- **No finding is rated must fix.** Standards, Spec and Quality each found nothing that has to be fixed before the Release.
- **The fix ticket is #594.** It takes Quality S1, S2, S3 and N1, Standards S1, S2 and S4, and Spec S1 and S8.
- **Standards S3 (the changelog line) and Spec S3 (the Release PR notes) are the orchestrator's.**
- **Quality S4 and Spec S7 go to #593.**
- **The unused key `sound.on` goes to the wording sweep #343.**
- **Spec S2 (reduced motion leaves the drumroll out) is a question for the operator at the listening session #535.**
- Nothing was run in a browser by the reviewers. The browser check #537 runs beside the review.

## Standards review: Release 0.13.3 „Ton“ (spec #504)

Diff: `v0.13.2...origin/spec/504-ton` (tip 3ceb6bba, 39 commits). Sources read: `CODING_STANDARDS.md` (One home, Secrecy, Motion, Tests, Copy), `GLOSSARY.md` (Sound, Veto window), ADR 0013 and 0015, `04-motion.md` § Synchronised moments and the sound lines of § Lucky Wheel and § Veto window, `docs/agents/release.md` (changelog lines, process and tooling list), `CLAUDE.md` § Personal data and § Scripting, the smell baseline of the code-review skill. Binary files in `public/sounds/` and `sound-candidates/` not read; manifest, credits file and loading code read. **Nothing "must fix before the Release".** No User data in this file.

### Checked and clean

Secrecy: both plans take only the five spin fields and the four draw fields, and the types leave out `game`, `labels`, `own`, `left` and `revealed`; the tick times come from `pinCrossings` (the one place that works crossings out) and the morph and slice-out times depend on `hiddenWheel`/`isHost` only, so no cue's presence or time before the stop depends on the drawn game; `veto-seal` is never in a plan and its arrival cue reads only the viewer's own Party's `cast`; there is no new `stopAt <= now` copy (the arrival lateness test is a lateness window, not the stop edge); no new room message, `changeEvent` call or broadcast. ADR 0013: every cue time is server time through `useServerClock().now`, no `Date.now()` or `useClock` in `app/` outside the dev page, `performance.now()` only in the log line. Motion: `CUE_LATE_MS = 150` and the `currentTime + (at - now)/1000` scheduling are 04-motion § Synchronised moments word for word; the clock/drumroll/reveal offsets and `wheel-windup` at 0 follow 04-motion; reduced-motion twins and edges (0, 1, 2 slices, late join, moved end, hidden tab by audio clock) are tested. One home: the wheel's timing comes from `wheel.ts` (`REVEAL_AFTER_MS`, `removalStart`) and `wheel-pins.ts`, file folder and extension only in `sound-cues.ts` (a test pins it), the player is mounted in `EventPage.vue` only (a test pins it), and the CODING_STANDARDS table got its five rows. Build safety: `carriesListeningPage(dev)` takes no env, has a unit test and a build test that greps `.output`; the candidate route's path regex admits no `..`. Personal data: manifest and credits hold `author: null`, `generated`, no names, no URLs; `__compiesCueLog` holds cue ids and times only and is exposed on dev and staging only. Copy: new key `sound.notice` and the changed `soundHelp` use the glossary word „Ton“; no new third party (same-origin files), so no Datenschutz change. CHANGELOG format (`### Neu`, issue link, plain German) follows `release.md`. Scripts are node files, none a heredoc.

### Findings

#### S1 (should fix) `isObject` and `isText` are copied twice, next to the repo's `isRecord`

- `app/utils/sound-credits.ts:22-23` and `app/dev/listening-model.ts:63-64` each define `isText` and `isObject`. `isObject` is `isRecord` of `shared/record.ts` verbatim.
- Rule: § One home per concern, row "Request input: `unknown` until a domain parser has checked it; `asRecord`/`isRecord` from `shared/record.ts`", and "a second copy is a finding even when it works". Smell: Duplicated Code.
- Fix: import `isRecord` from `~~/shared/record` in both files, delete `isObject`; export `isText` from `sound-credits.ts` and import it in `listening-model.ts`.

#### S2 (should fix) The „Ton aktivieren“ notice is a stage piece that is not a row of `event-stage.ts`

- `app/components/EventStage.vue:106-124`: a block drawn above the `TransitionGroup`, decided by a prop of the page, with the stage group's own container classes copied (`mx-auto w-full max-w-[1100px] px-3.5 pt-4 md:px-6 md:pt-6`, line 108 vs. the group's class below).
- Rule: § One home per concern, row "A stage piece: its block and place per page state, who sees it ..." and `event-stage.ts`'s own header: "A new piece is a row here and its component in EventStage.vue; nothing else decides which blocks the page lists or in which order". The diff's comment ("A fact of this device, so not a block of the read") argues the exception, but the standards table row for `useSoundUnlock` names only the notice's condition, not its place.
- Fix (smallest): add one sentence to the `useSoundUnlock` row of the table saying the notice is deliberately outside the stage rows (a fact of the device, never reordered, never in the read) and name the container classes once (a shared class const or a wrapper both use). Otherwise make it a row with a `StageInput` field.

#### S3 (should fix) The changelog line leaves out the phone's Clip

- `app/components/ClipOverlay.vue:193-198, 211-213` changes what Users see: a phone's Clip now starts with sound after the page's first tap and a blocked one unmutes without a button. `CHANGELOG.md` (the single `### Neu` bullet) names the wheel, the Veto window, the „Ton“ switch and the notice, but not this.
- Rule: `docs/agents/release.md` § Changelog lines: "A PR with a change Users can see adds its lines under `## [Unreleased]`".
- Fix: one `### Geändert` line, for example „Auf dem Handy startet ein Clip nach deinem ersten Tipp mit Ton.“ with the issue link (#533).

#### S4 (should fix) `useSound.ts` header comment is now false

- `app/composables/useSound.ts:1-2`: "The MVP plays no sounds yet; the toggle ships now so it exists when the first cue arrives." The toggle now gates the cue player and the Clip.
- Rule: baseline (a comment that misleads); the Standards review reads comments as code. Fix: replace by "Ton: one switch per device for the Clip and the cue player (`useCuePlayer`), stored in this browser."

#### N1 (note) Unused locale key `sound.on` promises a Fanfare

- `i18n/locales/de.json:857`: "Ton ist an, für den Rest des Abends. Rad, Veto-Aufdecken und Fanfare klingen jetzt auch." No code reads it (it predates this diff), and 0.13.3 has no fanfare (the eleven cues are wheel and Veto).
- Rule: § Copy, "Copy promises only what the app does today". Fix: delete the key, or leave it to the wording sweep; list it in the #343 comment either way.

#### N2 (note) The draw's four fields are picked three times

- `app/composables/useCuePlayer.ts:34` (`planOf`), `:46` (`arrivalOf`), `app/dev/listening-model.ts:247`; the five spin fields twice (`useCuePlayer.ts:30`, `listening-model.ts:242`, the latter's comment says "the same ... as `planOf`").
- Smell: Duplicated Code / Data Clumps. Deliberate (the copy is the Secrecy guard), and TypeScript's `Pick` types already stop a plan from reading `game`. Fix if touched again: one `cueDrawOf(draw)` and `cueSpinOf(spin)` in `sound-cues.ts`, used by the page and the dev model, so the dev page cannot drift from the real plan.

#### N3 (note) The cue ids and the doc's length column live in several readers

- `CUE_IDS` is scraped from `sound-cues.ts` by regex in `scripts/make-cue-candidates.mjs:35` and `scripts/ship-cue-sound.mjs:19`; the doc's length column is read in the candidate script, held as `LENGTH_MS` in `test/unit/sound-files.test.ts:13` and as `CUE_BRIEF.lengthMs` in `app/dev/listening-model.ts:20`. Tests read the doc, so drift fails; the two regex copies are the only ones no test pins. Fix: none now; a shared `scripts/cue-ids.mjs` if a third script needs it.

#### N4 (note) "The last ten seconds" has three homes

- `app/components/VetoBar.vue:45` and `app/components/VetoWindow.vue:38` (the visual tick) and `CLOCK_TICKS_BEFORE_END_MS` in `app/utils/sound-cues.ts:118` (the sound). They must stay together (04-motion § Veto window: "last 10 s"); no shared constant, no test relates them. Fix: export one `CLOCK_LAST_SECONDS = 10` and use it in the three places, when one of them next changes.

#### N5 (note) Copy for the wording sweep (#343) and the Release PR's process list

- New locale keys for the #343 comment (`release.md` step 3): `sound.notice`; changed `settings.soundHelp` ("Clips und Geräusche mit Ton"), which drops "Wird auf diesem Gerät gemerkt" although GLOSSARY.md § Sound says the setting "belongs to the device"; `sound.on` (N1).
- Process and tooling for the Release PR's own section (`release.md` § Release PR): `scripts/make-cue-candidates.mjs`, `scripts/ship-cue-sound.mjs`, `scripts/browser/chrome.mjs` (+ README), `knip.jsonc`. No `.github`, `.claude` or `docs/agents` change.

#### N6 (note) A type assertion on stored JSON in the dev page

- `app/dev/listening-page.vue:223`: `JSON.parse(...) as { choices?: ..., tickMinGapMs?: number } | null`; the fields are checked on the next lines, and lint does not refuse it. Dev server only. Fix: none needed.

## Spec review: Release 0.13.3 „Ton“ (spec #504)

Diff: `v0.13.2...origin/spec/504-ton` (tip 3ceb6bba, 39 commits, 93 files). Read: the spec #504 with its comments (incl. the reorder of 2026-11-13, issuecomment-6847310747), the bodies and comments of #530, #531, #532, #533, #534, #536, #537, #593 (and #535 for what it holds), `docs/agents/release.md` § Review, `CODING_STANDARDS.md`, `compibert-sound.md`, `04-motion.md` § Synchronised moments and Veto window, and the code of `sound-cues.ts`, `cue-player.ts`, `useCuePlayer.ts`, `useSoundUnlock.ts`, `EventStage.vue`, `EventPage.vue`, `ClipOverlay.vue`, `app/dev/*`, `server/dev/cue-candidates.ts`, `stage.ts`, `nuxt.config.ts`, the credits file and its parser, and the test files. Nothing was run in a browser and no test was run (read-only); "met" means the code and a named test show it. Not reported as missing, per the brief: the final sounds, #535's outcome, #593, #537's results, #538.

States: **met**, **met (dev)** = met with a recorded deviation, **browser pending**, **partly met**, **not met**.

### Findings (rated)

| # | Rating | Finding |
|---|---|---|
| S1 | should fix | The recorded deviations are not written into the hand-off docs. Every earlier Release of 0.13 writes a `Deviation (0.13.x, #…)` bullet into `02-components.md` / `04-motion.md` (e.g. `04-motion.md:120-122`); this diff touches no file under `docs/design_handoff_compies/`. Deviations that need one: stamps of the reveal and a set game's opening play on the read's arrival, not at planned instants (against `04-motion.md:139`); reduced motion leaves out the drumroll instead of making it one hit (`compibert-sound.md:15`); WAV 16-bit mono 44.1 kHz at about −1 dBFS instead of `.ogg` + `.m4a`, 48 kHz, ≤ −1 dBTP (`compibert-sound.md:5`); the tick cap (`TICK_MIN_GAP_MS` 40 ms) the doc does not know. Docs only. |
| S2 | question for the operator | Story 24 and #532 say „the drumroll becomes one hit“. Built: under reduced motion the plan has **no** `veto-drumroll`; `veto-reveal` at the end is the one hit (`sound-cues.ts:139`, `sound-cues.test.ts:316`). Recorded on #532 (a plan can only choose a cue and a time) and handed to #535 as „does reduced motion get its own short hit sample?“. Is the reveal alone enough, or should #593 add a short hit file? |
| S3 | should fix | The Release PR notes (comment on #504, issuecomment-6837044466) are stale against the tip: the „Process and tooling“ list names `scripts/make-placeholder-cues.mjs`, which is gone at the tip (added by #531, removed by #536, so it is not in the Release diff at all), and it omits `scripts/browser/chrome.mjs` and `scripts/browser/README.md` (`COMPIES_CHROME_FLAGS`, commit 3ceb6bba), which `git diff --name-only v0.13.2...origin/staging -- scripts` will list. Release.md wants every such change listed apart. |
| S4 | note (Release gate) | The Release ships an unheard, provisional set of 11 generated files and 44 candidate files (`sound-candidates/`). By the operator's decision this is intended; but #536's criteria „every cue ships the file the operator chose“ and „no unchosen candidate is left“ are open until #593, and the Release PR must say so if the cut comes before #593 (the notes already say it). Nothing in the diff contradicts the reorder. |
| S5 | note | Stamps (`veto-seal` per Veto) and a set game's `veto-open` are arrival cues: they sound when each device's read arrives, not at one server instant, and are skipped 2 s late (`sound-cues.ts:162-183`). Story 11 („every one of these at the same moment as everyone else“) therefore holds for the 9 planned cues, not for the stamps and a set game's opening. Recorded deviation on #532 with its reason (planned instants would be past on arrival); #537 item 5 measures it. Met (dev). |
| S6 | note | A game without a video has a card Clip that ends at the window's end, so `veto-clip-close` („soft TV off“) falls on the same instant as `veto-reveal`, 1 s after the drumroll has started, and sounds for a card that has no TV (`sound-cues.test.ts:277` pins the coincidence, nobody calls it out). Plausibly fine to the ear (35 against 85), worth one listening in #535/#537. |
| S7 | note for #593 | The credits file's `candidate` field is mandatory and names a manifest entry; the byte-equality test in `sound-files.test.ts:88` only runs „while that candidate is in the manifest“, and the file test wants ≈ −1 dBFS peak and a length within the doc's. After #593 removes unchosen candidates, the bytes test silently stops pinning anything for the cues whose candidate left the manifest; a sound brought from elsewhere has to be added to the manifest first (README says so) and normalised to −1 dBFS to pass. Say so in #593's brief. |
| S8 | note | `window.__compiesCueLog` exists in `pnpm dev` and in the staging build (`useCuePlayer.ts:76`), a hook the spec did not ask for; recorded on #531, gated by `public.staging`, tested present. Its absence from production is untested (`event-cues.test.ts:416` skips in a dev environment) and is #537's item. |
| S9 | note | Unrequested but harmless: the listening page's „Log des Players“ panel (#534 decision), the README line for `/dev/ton`, `COMPIES_CHROME_FLAGS` in `chrome.mjs` (tooling for #537), a 300 ms settle and a 1 s return of the notice (#533 decision; new behaviour, but the notice needs it). |
| S10 | note | The pre-existing key `sound.on` („… Rad, Veto-Aufdecken und Fanfare klingen jetzt auch.“) is not used anywhere in `app/`, and names the fanfare, which is out of scope. For the wording sweep (#343); not this Release's. |
| S11 | browser pending | Everything a real layout, a second device or a real clock must show: see the table below (notice at 390/980/1440 px and its layout jump when it shows and when a tap removes it; the tap still landing on what it hit; in-step instants within 50 ms; hidden tab; late join; the iOS Safari unlock, which only the operator's phone can show in #538). |

No must-fix finding. Nothing in the diff leaks anything the viewer may not know (secrecy, see Ticket #530 and #532).

### Stories of #504

| # | Story | State |
|---|---|---|
| 1 | Wind-up at the spin's start | met (`wheelCuePlan`, `sound-cues.ts:88`; test 36-50) |
| 2 | A tick per pin, fast then slow | met (`pinCrossings` through `thinTicks`, cap 40 ms; tests 91-146) |
| 3 | Thunk and chord at the stop | met (plan `wheel-stop`; test 37) |
| 4 | Morph under a Hidden wheel (Member only) | met (`sound-cues.ts:93`; test 68-82) |
| 5 | Slice leaving | met (`removalStart`, later on a Hidden wheel for every viewer; test 68) |
| 6 | Veto window opens | met for a spin (planned at the stop); for a set game on arrival (met (dev), S5) |
| 7 | Clock in the last 10 s, faster in the last 5 | met (15 ticks, `sound-cues.ts:118`; test 245) |
| 8 | Clip's close | met (`sound-cues.ts:142`; tests 268-283), see S6 |
| 9 | Stamp for own Party, nobody else hears it | met (`vetoArrivalCues`, transition of `own.cast`; `event-cues.test.ts:243,264,282`) |
| 10 | Drumroll, reveal hit, a stamp per Veto | met for drumroll and hit (planned); stamps on arrival (met (dev), S5) |
| 11 | Same moment for all, late joiner skips | met for the planned cues (150 ms rule, `cue-player.ts:178`, test 99); browser pending for the 50 ms; stamps S5 |
| 12 | Header switch and Profil row gate Clip and cues together | met (`useSound().enabled` gates the player and the notice; Clip unchanged) |
| 13 | Ton off: silence, same animations | met (`cue-player.test.ts:121-143`, `event-cues.test.ts:156`) |
| 14 | Profil row „Clips und Geräusche mit Ton“ | met (`de.json` `settings.soundHelp`, `profile-page.test.ts:271`) |
| 15 | No volume slider | met (none; one fixed bus) |
| 16 | Ton on by default | met (unchanged) |
| 17 | Notice while Ton on, Session runs, sound held back | met (`useSoundUnlock`, `EventStage.vue`; `event-sound-unlock.test.ts:80`); layout browser pending |
| 18 | Any tap or key removes it and lets sound through | met (`pointerup`, `click`, `keydown` except Escape, capture; tests 102-151) |
| 19 | On a phone the same tap unlocks the Clip | met in code and tests (`ClipOverlay.vue` `watch(gestured)`, `clip-overlay.test.ts:273-327`); iOS Safari browser pending (#538) |
| 20 | Polite, never focused | met (`NoticeBanner` is `role="status"`; test 193 pins no focus) |
| 21 | Ton off: no notice | met (test 206) |
| 22 | Hidden tab plays | met in code (plan from the read, scheduled ahead on the audio clock, no timer; `event-cues.test.ts:138`); real hidden tab browser pending (#537 item 2) |
| 23 | Phone in the background: accepted silence | n/a |
| 24 | Reduced motion keeps cues, drumroll as one hit, no wind-up or ticks | partly met: no wind-up, no ticks (test 148); the drumroll is left out, not made one hit (S2) |
| 25 | A page that lists the cues, plays each alone and in its moment | met (`app/dev/listening-page.vue`: per cue id, brief, length, volume, candidates with source and licence; test spin 6/10 s with Hidden wheel; window 40/150 s with 0 to n Vetoes, start „von Anfang / letzte 12 s“; arrival buttons); smoke recorded on #534 |
| 26 | Pick one per cue or „keins passt“ | met (`choose`, `noneFits`; read-back `window.__compiesListeningChoices()` and a text box); the agent bringing more is #535 |
| 27 | CC0 or generated only, credits file | met (`credits.json`, `parseCredits` rejects any other licence; `sound-files.test.ts:80`) |
| 28 | 0.13.3 waits for the choices, no other Release waits for sound | met (roadmap: „Sound never holds a cut“; the diff adds nothing to other Releases) |

Decisions of #504 not tied to a story:

- Eleven cue ids, relative volumes from the brief's table, one bus, no ducking: met (`CUE_IDS`, `CUE_VOLUME`, test 489-500 checks the doc; `cue-player.ts:90`, test 72).
- Files served by the app from one folder, named by cue id, one format, fetched when the Event page first needs them and not on hub pages: met (`cueFileUrl`; `preload` only when `view.wheel`, which the server sends only for a running Session; `sound-files.test.ts:98-111` pins that only the Event page mounts the player; `event-cues.test.ts:155-178`). Format is WAV, a recorded deviation (S1).
- One Web Audio context per page, scheduled on the audio clock at `cue time − server now`, 150 ms skip: met (`cue-player.ts:149-178`).
- A skip that moves the end gives a new plan, old cues cancelled: met (`cue-player.test.ts:206`, `sound-cues.test.ts:296`); a cue that already sounded is not cut off (recorded deviation, test 410).
- `veto-seal` not server-timed, Party only: met.
- The plan never contains what the viewer may not know: met, see below.
- „Ton aktivieren“ context starts suspended until a gesture; the notice is the existing notice banner with one button: met.
- Changelog: one line under `### Neu`, Datenschutzerklärung unchanged: met (`CHANGELOG.md`; the line is long, three sentences in one bullet, and names the notice as well; spec asked „one line“ for the wheel, the Veto window and Ton off. Standards axis, not a finding).
- „No Worker change“: met (no file under `realtime/`).

### Tickets

**#530, Cue-Plan fürs Rad** (decisions: home `app/utils/sound-cues.ts`, `TICK_MIN_GAP_MS` 40, Hidden-wheel host)

| Criterion | State |
|---|---|
| Spin of 6 s and of 10 s: wind-up, ticks after the cap, stop, in order | met (`sound-cues.test.ts:37` 28 ticks, `:51` 43 ticks) |
| Morph only for a Member under a Hidden wheel; slice-out at the removal, later on a Hidden wheel | met (test 68-89) |
| Reduced motion leaves out wind-up and ticks | met (test 148) |
| Two spins differing only in the drawn game give equal plans | met, and stronger: equal in full, for four viewer kinds and both motion settings (test 189-226) |
| Crossings from one place | met (`pinCrossings` called, `wheel-pins.ts` untouched) |
| No changelog line | met |

**#531, Cue-Spieler** (decisions: `cue-player.ts` + `useCuePlayer`, WAV placeholder, files when the read has a wheel, `__compiesCueLog`)

| Criterion | State |
|---|---|
| Unit tests against a fake audio clock: each cue at its offset; > 150 ms late skipped; Ton off schedules nothing; switching off cancels; new plan cancels the old; suspended context plays nothing and throws nothing | met (`cue-player.test.ts:36-306`, `test/fake-audio.ts`) |
| Component test: one scheduled plan per spin, a refetch does not schedule twice | met (`event-cues.test.ts:89,104`) |
| Files not requested on the hub pages | met (structural test `sound-files.test.ts:107`; browser item on #537) |
| Browser items on #537 | posted (six items) |
| No changelog line yet | met (#536 added it) |
| Hidden tab plays where the browser allows | met in code; browser pending |
| Gate before first gesture is #533's: nothing plays, nothing fails | met (`reconcile` returns on a context that does not run) |

**#532, Cue-Plan fürs Veto-Fenster** (deviations recorded: 15 ticks, reduced-motion drumroll left out, stamps and a set game's opening on arrival, a played cue not cut off)

| Criterion | State |
|---|---|
| 40 s and 150 s windows: opening, clock ticks (five at 1/s, ten at 2/s), drumroll, reveal; stamps 80 ms apart; Clip's close at the Clip's end and absent without a Clip | met (test 229-266, 424-437); stamps are an arrival function, not part of the plan (S5) |
| Moved end gives the new instants; reduced motion; a Draw without a window gives no veto cue | met (test 296-343) |
| Component test: `veto-seal` scheduled for the casting Party, not for another Party | met (`event-cues.test.ts:243,264`; „scheduled“ here is `playNow`, logged `scheduled`) |
| Plan before the end is the same whether or not another Party has cast | met (test 362-382: the plan's type has no `own`, `left`, `revealed`, `game`) |
| A set game with „Veto erlauben“ has them without the wheel's | met (`event-cues.test.ts:385`) |
| Browser items on #537; no changelog line | posted / met |

**#533, „Ton aktivieren“ auf der Bühne** (decisions: sentence `sound.notice`, in-flow above the blocks, three gesture events, 300 ms settle, no latch, notice returns after 1 s, Clip on a phone)

| Criterion | State |
|---|---|
| Notice shows with Ton on, a running Session and sound held back; goes after a pointer and a key event; never with Ton off or without a running Session; no focus | met (`event-sound-unlock.test.ts:80-249`) |
| Page-wide listener, any gesture removes it, the button included | met (`useSoundUnlock.ts:55-90`) |
| On a phone the first gesture counts for the Clip's „Ton aktivieren“ | met (`ClipOverlay.vue`, `clip-overlay.test.ts:300`); iOS browser pending |
| Profil row „Clips und Geräusche mit Ton“ | met |
| Browser items on #537; no changelog line | posted / met |
| „Announced politely“ | met by `role="status"`; a status region that is inserted already holding its text is announced less reliably than one that was there empty; the spec chose the existing banner, so this is only a screen-reader note for the walk-through |
| Notice placement and layout (390/980/1440 px) | browser pending (#537 item 1): the stage moves down once when it shows (300 ms after the load) and up when a tap removes it; no space is reserved (recorded) |

**#534, Hörseite** (decisions: dev server only, not the staging build; `carriesListeningPage`; test pins the production build)

| Criterion | State |
|---|---|
| Lists the eleven cues, plays a candidate alone and in a test spin and a test window | met (page, `listening-model.ts` with its unit test; the page has no test, as the spec said; smoke on #534 with one FAIL fixed) |
| Production build contains neither page nor candidate files, pinned | met (`test/build/listening-page.test.ts`, `stage.test.ts`; CI runs `pnpm test:build`) |
| Candidates in a folder of their own, apart from shipped files | met (`sound-candidates/`, served by `server/dev/cue-candidates.ts` with a whitelist path) |
| A chosen mark per cue and a read-back list | met |
| No changelog line | met |

**#536, Die Töne und die Credits-Datei** (scope changed 2026-11-13: a provisional set)

| Criterion | State |
|---|---|
| Test pins that every cue id has its file and credits entry and no licence but CC0 or „generated“ | met (`sound-files.test.ts:67-96`, `sound-credits.test.ts`) |
| The chosen files in the format and level the player expects | partly met by decision: the provisional files, WAV, peak ≈ −1 dBFS; the operator's choices are #593 |
| No placeholder left | met (beeps and `make-placeholder-cues.mjs` gone) |
| No unchosen candidate left | not met by decision: moved to #593 |
| Credits file names source, author where there is one, licence | met (`credits.json`, all eleven „generated“, author null; public, nothing personal) |
| Datenschutzerklärung unchanged | met (no change in the diff) |
| Changelog line under `### Neu` | met (line is 2c62aef0) |
| The length rule changed from ±5 ms to „at most +5 ms, at least half“ | not asked, recorded on #536, three provisional files are shorter than the doc's length |
| Browser items on #537 | posted |

**#537** is not built by this diff (the browser check runs beside this review); the 27+4 items posted by #531, #532, #533 and #536 are the check's input. One item the spec names has no posted item: „A skipped Clip: the reveal's cues move with the window's end“ is covered by #532's item 6, and „Ton off mid-spin cancels the rest“ by #531's item 3; no gap found.

### Secrecy and Hidden-wheel check

- `wheelCuePlan` reads five fields of the spin (`spinStartAt`, `stopAt`, `slices`, `resultIndex`, `resultOffset`) and `hiddenWheel`, `isHost`: the type has no `game` or `labels`; the test compares plans of two spins differing only in the drawn game for four viewers and both motion settings (`sound-cues.test.ts:189`).
- `vetoCuePlan` reads `drawId, kind, stopAt, vetoEndsAt` and the Clip's two fields; `vetoEndsAt` is null for a Member before the stop, so no clock tick or reveal is planned before the read that carries it (the server's rule, `stage-read.ts:185`). No plan ever holds `veto-seal` (test 368).
- Every viewer requests all six veto files when the Event allows Vetoes or has a window, whether or not their Party cast (`useCuePlayer.ts:101`; test `event-cues.test.ts:363`), so no request reveals a cast. `veto-seal` plays on the transition of the viewer's own `own.cast` only.
- The listening page and its files exist on the dev server only; `credits.json` and the cue files are the only new files under `public/`.

### Behaviour the spec did not ask for

S8 and S9 above; plus `useSoundGesture` is a shared `useState` flag (needed for story 19, recorded), `CUE_BRIEF.loop` for the drumroll on the listening page (informational), and CODING_STANDARDS rows and a README line (documentation).

### Contradictions with recorded decisions

None found: the code matches the decisions recorded on #530 to #534 and #536 and the reorder of 2026-11-13; the eleven credits entries name exactly the provisional candidates of the table in that comment.

### What only the browser can show (carried by #537 and #538)

The 50 ms in-step instants on two devices; a hidden tab on a desktop; the 150 ms skip for a late joiner on a real clock; the notice at 390, 980 and 1440 px and the layout jump on removal; that a real tap lets the tap through to what it hit; the absence of `__compiesCueLog` in a production build; no `/dev/ton` on staging; and, on the operator's own phones in #538, that a tap unlocks Web Audio and the Clip's sound on iOS Safari.

## Quality review: Release 0.13.3 „Ton“ (spec #504)

Diff: `v0.13.2...origin/spec/504-ton` (tip 3ceb6bba, 39 commits, 93 files, 55 of them sound files). Skills followed: `thermo-nuclear-code-quality-review`, `improve-codebase-architecture` with `codebase-design` (module, interface, depth, seam, leverage, locality). No sub-agents, no user questions. Read in full: `app/utils/cue-player.ts`, `app/utils/sound-cues.ts`, `app/composables/useCuePlayer.ts`, `useSoundUnlock.ts`, the `ClipOverlay`/`EventPage`/`EventStage` hunks, `nuxt.config.ts` and `stage.ts` hunks, `server/dev/cue-candidates.ts`, `app/dev/listening-model.ts` and the script of `listening-page.vue`, `scripts/ship-cue-sound.mjs`, `app/utils/sound-credits.ts`; ADR 0013; `useServerClock`, `useInstantRefresh`, `useEventView`, `wheel.ts`, `wheel-pins.ts`. Tests: the names of every test in `cue-player`, `sound-cues`, `event-cues`, `event-sound-unlock`, and in full `fake-audio.ts`, `sound-files.test.ts`, `listening-page.test.ts` (build), and the hidden-tab and first tests of `event-cues`. Nothing was run (no node_modules in the worktree), no server started. `make-cue-candidates.mjs` (868 lines, a dev tool) was not read line by line. No User data in this file.

**Verdict: no must-fix.** The two core modules are deep: `createCuePlayer` is a seven-member interface over about 250 lines (diff by key, 150 ms rule, suspended and Ton gates, a bounded log) and the plan functions are pure and take narrow `Pick` inputs, so the Secrecy rule is held by types and by tests. No file is near 1000 lines. Nothing runs on a timer or a frame; every cue is handed to the audio clock ahead of time, as ADR 0013 and the spec want. What is left is one scheduling gap that a green suite cannot show (S1), a cost that is already known from 0.13.2 (S2), one silent-failure path (S3), a test that becomes vacuous with #593 (S4), and notes.

### Checked and clean

- Doubled or cancelled cues: the key `id@at` plus the diff in `reconcile` (`cue-player.ts:155`) schedules a cue once however often the read is refetched; a cue that left the plan and is not yet due is stopped, one that already sounded rings out. A Host skip that moves the end gives new keys and cancels the old ones. `onState` takes pending cues back when the context leaves `running` and re-plans when it returns, so nothing fires after a long suspension. `dispose` stops everything and `useCuePlayer` closes the context, removes the log hook and (in `useSoundUnlock`) every listener and both timers.
- Late join: first read is the baseline for the arrival cues (`vetoArrivalCues`, `previous === null`); a cue more than 150 ms late is skipped and logged, and is not asked for again.
- Read against a Room message: the plan comes from the viewer's own read only; `veto-seal` and the stamps are arrival cues with no trace in any plan, so a refetch race cannot reveal another Party's cast. `useFetch` cancels an older in-flight read, so an out-of-order response cannot flip `ownCast` back.
- A tab that was hidden: no cue is scheduled from a timer or frame; the plan arrives with `event.changed` and goes to the audio clock. (See N2 for the one data path that is timer-driven.)
- Reduced motion: leaves out wind-up, ticks and drumroll; the stop, morph and slice-out instants are the same functions the wheel uses (`REVEAL_AFTER_MS`, `removalStart`), so no second copy of a constant (the 0.13.2 finding S2 is not repeated).
- The listening page and its handler: registered only when `nuxt.options.dev` (`carriesListeningPage`), no env switch; the path regex plus the `CUE_IDS` check leave no traversal; the build test checks the output for the page, the route and every candidate file name.

### Findings

#### S1 (should fix) A scheduled cue is anchored once, so a later change of the clock offset leaves it where it was

`app/utils/cue-player.ts:140-146` computes `when = context.currentTime + lead / 1000` once, at schedule time, from `serverNow()`. `reconcile` never looks at an entry again unless it left the plan. `serverNow()` is `performance.now() + offset` (`useServerClock.ts`) and the offset is replaced by every round of probes (on open, on `visibilitychange`, `online`, a message stamped ahead of the estimate) and, before the first answer, is the device clock.

Failing scenarios:
1. `ready` is true after `CLOCK_READY_GRACE_MS` (1.5 s) without a `clock.pong`, on the device clock (`ready = synced || !room.enabled || graceOver`). A phone whose clock is 3 s ahead schedules the whole spin 3 s early; the pong arrives, `synced` flips, but `ready` was already true, so the watch in `useCuePlayer.ts:123` does not run and the keys are unchanged. The stop sounds 3 s before the wheel stops, on that device only, for the whole spin. Tests pass: `event-cues.test.ts` has no room, so the clock is the device's and never moves.
2. A laptop that slept: `performance.now()` and the audio clock can stop while the server clock does not; cues scheduled before the sleep keep their old audio time (the context may report `running` throughout).
3. A re-sync that moves the offset by 80 ms after a 40 s Veto window was scheduled: the reveal stays 80 ms off, past the ADR's 50 ms budget, and nothing corrects it.

Smallest fix: in `schedule`, keep `anchor = serverNow() - context.currentTime * 1000` on the entry; in `reconcile`, for an entry that is not yet due and whose current anchor differs by more than about 25 ms, `cancel` and `schedule` it again (the same code path as a moved end). Expose `refresh()` (= `reconcile`) on the player and call it from `useCuePlayer` when the clock's `synced` flips and on `visibilitychange` visible. Add a unit test: schedule with `serverNow` at one offset, move the offset, `refresh`, expect the old source stopped and a new one at the new `when`.

#### S2 (should fix) `pinCrossings` runs on every refetch for the plan, and a second time in the wheel

`app/composables/useCuePlayer.ts:23-39` `planOf` runs on every new `view` object, that is on every `event.changed` (a Vote, a join, a Team word), and calls `wheelCuePlan`, which calls `pinCrossings` (`sound-cues.ts:89`). From the 0.13.2 review (Q3), one call is about 1 ms at 30 slices and 4 to 7 ms at 176 slices, measured. `LuckyWheel.vue` does the same search for the flapper on the same refetch. Cost: two searches per refetch while the Event is open, for a plan that is identical until the spin changes; the player then discards it by key.

Smallest fix, one seam for both: a one-entry memo inside `wheel-pins.ts` keyed on the six `WheelTiming` fields (`pinCrossings` returns the same array while its input is equal). Both callers speed up and the 0.13.2 finding closes with it. Alternative: key `planOf` on `drawId` plus `stopAt` plus `hiddenWheel`, `isHost`, `reduced` and the draw's fields.

#### S3 (should fix) A cue file that failed to load is never asked for again, so one dropped request silences a cue for the evening

`cue-player.ts:113-125`: any rejection of `loadFile`, a network error as much as a 404 or an undecodable file, sets `{ state: 'failed' }`; nothing resets it and `preload` skips ids in `buffers`. A phone on a weak connection that loses the request for `veto-reveal` at the start of the evening has no reveal hit, no tick of that kind and no log line except `skipped` in a staging build, until a reload. The unit test pins "does not try it again" for a decode error, which is right, but it pins it for a fetch error too.

Smallest fix: split the two. A decode error stays `failed` for good; a fetch error stores `{ state: 'failed', retryAt: performance.now() + 30_000 }` and `reconcile` re-calls `load` once `retryAt` passed (a 404 is then retried every 30 s at most, only while a plan wants the cue). One test with a loader that rejects once and then succeeds.

#### S4 (should fix, with #593) The byte-copy check of the shipped files goes vacuous the moment the unchosen candidates are removed

`test/unit/sound-files.test.ts:89-96`: the `it.each` returns silently when the credited candidate is missing from the manifest or from disk. The comment says that is the plan for #593 ("removes the unchosen ones"). After #593 every row passes with no assertion, so nothing keeps the shipped file and its credit entry (source, licence) together; a later swap of `wheel-stop.wav` by hand would go green. Line 69 also reads the manifest at collection time with no guard: a deleted manifest crashes the whole file instead of one test.

Smallest fix: `ship-cue-sound.mjs` writes a `sha256` of the shipped file into its `credits.json` entry (and `sound-credits.ts` validates it); the test compares the file's hash to it, which works with no candidate left. Guard the manifest read like the credits read three lines below.

#### N1 (note) `createCuePlayer` takes the single slot `context.onstatechange`

`cue-player.ts:193` and `:253` assign and null a property. One player per context is the production shape, but the listening page already breaks it: `armed` and every `alone` player (`listening-page.vue`, `playAlone`) share one context, the last created wins, and `disposeAlone()` sets the handler to `null` for the armed one too, so a run on the listening page stops hearing interruptions. Fix: `context.addEventListener('statechange', onState)` and `removeEventListener` in `dispose` (add the two members to the `CueContext` pick and to `FakeAudioContext`).

#### N2 (note) A Member's Veto clock depends on a timer-driven read after the stop

`vetoEndsAt` is null for a Member until the read after the stop (`vetoCuePlan`, `sound-cues.ts:136`), and nothing server-side pushes that read: `useInstantRefresh` (`setTimeout` at stop + 250 ms) brings it, or a `veto.cast` message. In a hidden tab that timer is throttled to 1 s, and after five hidden minutes a browser may stretch it to a minute unless the page is audible; a window is 30 s at least. In practice the spin's own cues make the page audible just before, so this is probably covered, but spec story 22 ("hear the Veto window from a background tab") rests on it, and the one test that claims the hidden tab (`event-cues.test.ts:138`) only defines `visibilityState` and passes with any code, because the code has no visibility branch. For #537: check a Member's hidden tab for a 30 s window after more than five minutes hidden. If it fails, the smallest fix is for the room's `event.changed` at the commit to be followed by a client read scheduled with `useInstantRefresh` that is not hidden-tab-throttled (a `Worker` timer), or to send the Member the window end with the commit.

#### N3 (note) Output latency and the audio clock's granularity are not part of `when`

`when = context.currentTime + lead / 1000` ignores `outputLatency`/`baseLatency` (Bluetooth speakers: 150 to 250 ms) and reads `currentTime`, which moves in render quanta. The wheel's pixels are not latency-compensated either, so a device's sound can lag its picture by its output latency, and "everyone hears the same moment" is true only to within that. `getOutputTimestamp()` gives the exact pair for the anchor and, with `outputLatency`, a one-line correction (`when - outputLatency`, clamped at `currentTime`). Worth a line in the listening session or the browser check rather than code now.

#### N4 (note) Small duplication

- `useCuePlayer.ts:34` and `:46` copy the same four-field `draw` projection; `reducedMotion()` (a `getComputedStyle` call) is read twice in `planOf`. One `drawOf(view)` and one read.
- The state key `'sound-gestured'` is written twice (`useSoundUnlock.ts:16` and `:28`): the exported reader and the writer can drift. Export the key, or make `useSoundGesture` return the writable ref to `useSoundUnlock` only.
- The lengths of the cues are three copies (the doc, `LENGTH_MS` in `sound-files.test.ts`, `CUE_BRIEF.lengthMs` in `listening-model.ts`); each is pinned to the doc by a test, so they cannot drift silently. `scripts/ship-cue-sound.mjs:19` reads `CUE_IDS` out of the TypeScript source with a regex; `sound-files.test.ts` checks `credits.json` against the real list, so a break shows, but it is a fourth reader of the list.
- When `new AudioContext()` throws, `ensure()` returns null, `suspended` stays true and `useSoundUnlock` keeps showing „Ton aktivieren“ whose button does nothing. Cheap fix: a `failed` flag from the composable that clears `wanted`.

#### N5 (note) Where the seams are

- Good: the plan functions take `Pick` types and no clock; the arrival cues are a pure function of two reads; the player takes the context, the clock and the loader. Tests drive the player's interface with a fake context and assert sources, gains and `when`, not internals.
- The EventView-to-input projection sits in the composable and is only reached by the Nuxt page tests. It is thin (see N4); a function `cueInputsOf(view)` next to `sound-cues.ts` would let a unit test cover it without mounting the page, but the type narrowing is the real guard, so this is optional.
- `playNow` is a second scheduling path with its own gates (Ton, running, buffer ready) that repeat `reconcile`'s. It earns its place (arrival cues are no plan and no server time), but if a third caller arrives, make the gate one function.
- Files stay in `public/` as WAV (about 450 KB for eleven); Vercel serves them with a revalidating cache header, so each Event page visit makes eleven conditional requests. A content hash in the file name would remove them; only worth it if the check in #537 shows a delay.

### Tests that would pass on broken code

- `event-cues.test.ts:138` (hidden tab): see N2.
- No test moves `serverNow` after a cue is scheduled (S1); none lets a file fail once and then succeed (S3).
- `sound-files.test.ts:89` (S4).
- The player's fake always starts `running` at `currentTime = 10`; the real context starts at 0 and `suspended`, which the unlock tests do cover with a held context, but no test checks that a cue scheduled before a `resume` lands on the audio clock of the moment after it (`currentTime` after the wait is read again in `schedule`, so the code is right, but only by reading it).

### Questions for the user

None. S1 to S3 are small and inside `cue-player.ts` and its composable; S4 touches the shipping script, which #593 changes anyway.
