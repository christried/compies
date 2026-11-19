# Review 0.17 „Klang“ (2026-11-19)

Diff `d3d31621...24230a23`, `origin/staging` to the tip of `spec/718-klang`, the integration branch of spec #718, after the merge of #750. `d3d31621` holds Releases 0.16 and 0.16.1, on which 0.17 is built. The review ran on the integration branch (`docs/agents/release.md` § Review, walk-through, retro), in a cloud session, so nothing was run in a browser. Three `sonnet` reviewers: Standards, Spec, and code quality with architecture.

## Result

- **One must-fix, found by two axes:** S1 (Standards) and P1 (Spec), the changelog line `CHANGELOG.md:15`. It says a Tie and reduced motion stay silent. At the tip a Tie plays its sounds and reduced motion plays the fanfare. The line also leaves out the stamp, fanfare and crowd (#744) and the laugh (#746), and the Tour's voice (#747) has no line at all.
- **Clean, per axis:**
  - Standards: no hard violation. The cue plans are pure and read only flags and instants (Secrecy, ADR 0013 and 0015). The home rules hold, no User data is in the diff, and the scripts follow their headers.
  - Spec: the cue table holds. Every instant, `Vol`, length and reduced-motion cell of the 23 new rows matches the code, and the 34 files pass the format checks. Each secrecy rule has a test. The tickets' criteria are met except where a finding says otherwise. No scope creep.
  - Code quality: no must-fix. The group rule, `CUE_GROUPS`, `useImmediateCue`, the player's two plan sources and the recipe split are sound. No file of the diff crosses 1000 lines.
- **Findings two axes share** (each keeps its own number and severity below):
  - S3 and Q2: the copied cue-test scaffolding in the seven `event-cues-*.test.ts` files.
  - S4 and Q5: the `up` helper, pasted into `scripts/cue-recipes/tour.mjs` and `scripts/cue-recipes/wheel-voice.mjs`.
  - S7, P6 and Q3: the Secrecy test of the group rule, which asserts the keys of its own literal and cannot fail.
  - S10 and Q6: `standings` and `board` in `groupInputOf` are the same expression, kept apart on purpose.
  - The optional fields of `GroupInput`: S7, S10 (its answer), Q3, Q6 (its answer) and P6. Standards and quality both answer yes: make them required.
  - S6 and Q4: the comments of `useImmediateCue.ts` that describe the Release before it was built. S6 and Q8: the `Moment` doc of `app/dev/listening-model.ts`.
  - S8 and P8: the ticks and the counter's writes run on different grids.

## Standards

Read: all 81 non-sound files of the diff (production code first, then tests, then docs). Left out: `sound-candidates/` and `public/sounds/cues/*.wav` (`credits.json` and the candidates manifest were read). Sources: `CODING_STANDARDS.md`, `GLOSSARY.md`, ADR 0013 and 0015, `CLAUDE.md`, and the smell baseline of `.claude/skills/code-review/SKILL.md` § 3. Baseline smells are judgement calls, labelled so. The known items the run named (the eleven titles, "The other ten", the "takes three flags" title, the stale "three flags" and "Only wheel and veto" comments, the "#745 may change it" title, the optional `GroupInput` fields) are not repeated as findings, except that the optional fields are answered below.

### S1. The Release notes are wrong for the Siegerehrung and silent on the rest of the sound work

- **Severity:** must fix before the Release.
- **Where:** `CHANGELOG.md:15` (the only line for the ceremony); no line at all for #744, #745, #746 and #747.
- **What is wrong:** line 15 ends "Bei einem Gleichstand und bei reduzierter Bewegung bleibt sie vorerst still." At the tip a Tie plays its sounds (`ceremonyCuePlan` has no branch on the Winner count; #745, `12-siegerehrung-unentschieden.md` Deviation #745), and reduced motion plays `cer-fanfare` (`sound-cues.ts:446`). The line lists only drop, rows, run and trip/bonk: the stamp, fanfare and crowd (#744) and Compibert's laugh (#746) are not mentioned. `grep '#747'` in `CHANGELOG.md` finds nothing, so the Tour's chirp and cheer, which every User hears on a first visit, has no line. (#671, #741, #669, #742 and #755 each have one and match the code.)
- **Rule:** `CODING_STANDARDS.md` § Copy: "Copy promises only what the app does today."; `docs/agents/release.md` § Changelog lines: a PR with a change Users can see adds its lines under `## [Unreleased]`.
- **Fix:** rewrite line 15 to say what plays now (banner, places, run, gag, stamp with fanfare and crowd, laugh; Tie and reduced motion included, reduced motion = fanfare only), drop "vorerst", and add one line for the Tour's voice under `### Neu`. Run `pnpm vitest run test/unit/changelog-file.test.ts`.

### S2. The Tour's start-rule inputs are assembled twice

- **Severity:** should fix.
- **Where:** `app/composables/useCuePlayer.ts:33-36` and `app/composables/useTour.ts:38-48`.
- **What is wrong:** both build a `TourStartInput` from the view with the same three mappings (`view?.event.isHost ? 'host' : 'member'`, `phase ?? null`, `runningSessionId !== null`). `useCuePlayer` is a second reader of the page's Tour inputs. If the rule gains an input, the files request and the Tour drift apart silently, and the test comment (`tour-cues.test.ts:5`) says "no copy of its conditions is tested here".
- **Rule:** `CODING_STANDARDS.md` § One home: "The Tour: its steps, run and start rule | `shared/tour.ts`; `useTour` reads the rule's inputs from the page and calls it". Baseline: Duplicated Code (judgement).
- **Fix:** one pure `tourStartInputOf(view, storedVersion, layerOpen, calmFor)` in `shared/tour.ts` (or beside `tourMayStart`), called by both; update the Tour row of the table.

### S3. Seven near-identical copies of the cue-file scaffolding in the Event-page cue tests

- **Severity:** should fix (judgement call, test code).
- **Where:** `test/nuxt/event-cues.test.ts:60-69`, `event-cues-board.test.ts:27-36`, `-ceremony.test.ts:49-58`, `-coin.test.ts:41-50`, `-standings.test.ts:26-35`, `-tour.test.ts:29-38`, `-wheel-voice.test.ts:53-62`; `FIRST` and `STARTED` repeated in five of them.
- **What is wrong:** each file registers `/sounds/cues/<id>.wav` for every id into a local `requests` map, then defines `requested`, `requestedOf`, `context`, `started`, `startedOf`, `log` and the same `beforeEach` (`FakeAudioContext.instances = []`, `follows = true`, `stubGlobal('AudioContext')`, `staging = true`). Five of the seven are new in this diff. A change of the fake or of the log shape (this Release added `rate`) is seven edits.
- **Rule:** baseline Duplicated Code. The repo's own pattern is the shared `test/nuxt/event-page.ts` (`serve`, `viewWithSessions`, `memberView`).
- **Fix:** `test/nuxt/event-cues.ts`, a plain helper as `event-page.ts` is, with the endpoint registry, `requestedOf`, `startedOf`, `logOf` and a `setupCuePage()` for the `beforeEach`; the files keep only their own reads.

### S4. `up` (semitone ratio) is defined twice, and four moment helpers live in recipe files

- **Severity:** should fix (small).
- **Where:** `scripts/cue-recipes/tour.mjs:9` and `scripts/cue-recipes/wheel-voice.mjs:8` (identical `const up = (hz, semitones) => hz * 2 ** (semitones / 12)` with the same doc line); also `board.mjs:9` (`wobble`) and `standings.mjs:9` (`pop`).
- **What is wrong:** the two `up` copies are character-identical. `wobble` and `pop` are used inside one file each, so they are weaker cases.
- **Rule:** `scripts/cue-kit.mjs:2`: "A new helper goes here, not into a recipe file." `CODING_STANDARDS.md` § One home (candidates row: "the synthesis kit"). Baseline: Duplicated Code.
- **Fix:** move `up` into `cue-kit.mjs` and import it in both; move `wobble` and `pop` too, or relax the kit's sentence to "a helper two recipe files share".

### S5. The Standards table is incomplete for what this Release added

- **Severity:** should fix (documentation).
- **Where:** `CODING_STANDARDS.md:28` (sound-cues row) and `:38` (Letting sound through row).
- **What is wrong:** the 0.17 edit of row 28 names `standingsCues`, `claimCues`, `ceremonyCuePlan`, `CUE_GROUPS` and says what a new cue is. It leaves out other homes this Release created: `coinCuePlan` and the beats `COIN_SPIN_AT` / `COIN_LAND_AT` (`shared/coin.ts`, shared by the picture's keyframes and the plan), `wheelVoicePlan` (reads `mascotMoments`), `tourStepCue`, `countTicks` (`count-up.ts`), `STAMP_DELAY_MS` and `countDurationMs` (`motion.ts`), `CEREMONY_BONK_MS` (`shared/ceremony.ts`), and `ceremonyAwaitsSound` (`app/utils/ceremony.ts:105`), which is now part of the Ton-notice condition although row 38 says that condition lives in `useSoundUnlock`.
- **Rule:** the table's own contract: "Each concern below has one home. New code calls it".
- **Fix:** add the names to row 28, and "`useSoundUnlock` (#533); its `moment` is the page's `running` kind or `ceremonyAwaitsSound` (#755)" to row 38.

### S5b. `ceremonyAwaitsSound` repeats part of `pageFacts`' "finished" rule

- **Severity:** note (baseline Duplicated Code, judgement).
- **Where:** `app/utils/ceremony.ts:106` (`phase !== 'finished' || settings === null`) against `app/utils/event-page.ts:206-208` (`settings === null` first, then `phase === 'finished'`).
- **What is wrong:** the comment says "as pageFacts reads it", so it knowingly mirrors the order. `pageFacts(view).kind === 'finished'` is the existing home. Also, `EventPage.vue:122` calls it with `serverClock.now()` inside a computed, which is not reactive, so the notice's condition does not re-evaluate at the run's stored end by itself (outside the Standards axis; the Spec review may want it).
- **Fix:** if kept, leave the comment; otherwise call `pageFacts`.

### S6. `useImmediateCue.ts` comments describe the Release before it was built

- **Severity:** note.
- **Where:** `app/composables/useImmediateCue.ts:3-5` ("later the Game board's drop and the Tour") and `:9` ("`(id, delayMs?)` today, and a rate later (#743) with no edit here"). Same kind: `app/dev/listening-model.ts:74` ("Where a cue sounds ... in a spin, in a Veto window, or at the arrival of a read").
- **What is wrong:** the board (`GameBoard.vue:97`) and the Tour (`TourLayer.vue:24`) already call the function in this diff, and `CuePlayer['playNow']` is `(id, delayMs?, rate?)` (`cue-player.ts:70`). The `listening-model.ts` comment lists three of the nine `Moment`s.
- **Rule:** not a documented rule. Comments that state a past plan mislead the next reader (`CODING_STANDARDS.md` § Copy spirit: say what the code does today). Not in the known list.
- **Fix:** reword the three comments to the present.

### S7. The Secrecy test of the group rule can no longer fail

- **Severity:** note (related to the known "takes three flags" title; this is about the body).
- **Where:** `test/unit/sound-cues.test.ts:530-534`.
- **What is wrong:** the test builds a `GroupInput` literal with three fields and asserts `Object.keys` of that literal. It checks the test's own object, so it stays green however `GroupInput` grows (it has nine fields at the tip, six of them optional).
- **Rule:** `CODING_STANDARDS.md` § Secrecy ("a value derived from secret rows is secret too") and § Tests (a test that asserts the rule).
- **Fix:** replace it with a test of the real invariant, for example that `reachableGroups` returns the same groups for two reads that differ only in the draw's game, side and label. Those cannot be put into the type, so the check is that the type has no such field: a `satisfies Record<keyof GroupInput, 'flag' | 'count'>` table fails when a field is added without a decision.

### S8. `countTicks` claims to share one rule with the counter, but the counter does not call it

- **Severity:** note (judgement).
- **Where:** `app/utils/count-up.ts:14-32` against `app/components/CpNum.vue:36-58`; the doc text on `countTicks` ("so the sound and the counter share one rule") and `sound-cues.ts:385` ("The beats are the picture's own").
- **Rule:** `CODING_STANDARDS.md` § One home: "a second copy is a finding even when it works". Baseline: Duplicated Code.
- **What is wrong:** `CpNum` writes on the first frame at least `COUNT_TICK_MS` after the previous write (`wrote = Date.now()`, so the grid drifts by frame jitter) and starts with `shown = from`. `countTicks` assumes ideal steps of `COUNT_TICK_MS` from the start. Both use `countAt` and the constants, so the drift is bounded to a few frames over 600 ms, but "one rule" is two loops.
- **Fix:** soften the claim in the two comments to "same constants and curve", or let `CpNum` drive its writes from `countTicks`.

### S9. A mutable `Set<CueId>` in the domain object of the Standings news

- **Severity:** note (judgement).
- **Where:** `app/utils/standings-news.ts:68-69` (`cuesAsked: Set<CueId>`), `app/composables/useStandingsNews.ts:72`, `claimCues` at `app/utils/sound-cues.ts:411`.
- **What is wrong:** `standings-news.ts` now imports a type from `sound-cues.ts`, which imports `pointsDelta` and `rankMoves` back from it (a type-only cycle, erased at build). The news object gains a field that only the sound layer mutates; `test/nuxt/leaderboard.test.ts:201` and `event-standings-view.test.ts:30` had to add `cuesAsked: new Set()` to their fixtures. Baseline: Feature Envy / Divergent Change, weakly.
- **Fix:** acceptable as is (the comment explains why one object is shared). If it grows, key the claim by `news.key` in the player or the page, not in the news.

### S10. `GroupInput`: `board` repeats `standings` on purpose

- **Severity:** note (baseline Speculative Generality, judgement).
- **Where:** `app/composables/useCuePlayer.ts:28-30`, `app/utils/sound-cues.ts:104-107`.
- **What is wrong:** both flags are the same expression, and the comment gives the reason as "the two groups may part later (#742)". No documented standard endorses it, so the baseline is not suppressed. The cost is small (one line, both documented).
- **Fix:** keep, or one flag until a real second rule exists.

### S11. Smaller points

- **Severity:** note, for each of the six items. Numbered here in the order of the report.
  1. `app/utils/sound-cues.ts:448`: `const m = ceremonyTimeline(shape)` is a single-letter name (Mysterious Name), used eight times; `timeline` would read better. The same one-letter use is in `test/unit/ceremony-cues.test.ts` (`m`).
  2. `app/components/CeremonyLayer.vue:78` calls `Date.parse(run.startsAt)`; `startsMs` (line 48) already holds it for the same `ceremony`.
  3. `app/utils/cue-player.ts:183-194`: `stopImmediates` repeats the `try { source.stop() } catch {}` of `stop(entry)` (line 136); a `stopSource(source)` would serve both.
  4. `app/utils/cue-player.ts:15`: `PlanSource` is called "Module-private" but is the type of the exported `CuePlayer.setPlan` parameter; callers pass `'ceremony'` as a string. Export the type, or say "a caller names one as a string" only.
  5. `public/sounds/cues/credits.json` and `sound-candidates/manifest.json` (34 entries): the source reads "scripts/make-cue-candidates.mjs, Rezept <name>", written by `scripts/make-cue-candidates.mjs:123`. The recipes now live in `scripts/cue-recipes/<moment>.mjs`, so the recipe name is not found in the named file (`grep chip-arpeggio` hits only `cue-recipes/`). Fix: write `scripts/cue-recipes/<file>, Rezept <name>` (the generator knows the file) and rerun it; this also changes the 11 entries of 0.13.3. Or leave it and accept the pointer as "the generator".
  6. `GLOSSARY.md`: Coin flip says "_Avoid_: Coin toss". New identifiers say toss: `GroupInput.toss`, `buildCoinRun`, `startToss`, `MOMENT_LABEL.coin: 'Test toss'`, `CoinCueInput.toss` (the type `CoinToss` and the cue id `coin-toss` predate this). These are dev-only labels and a type name already in the codebase; not worth a rename unless the Release wants it.

### Answer: should `GroupInput`'s optional fields become required?

Yes, I would. `groupInputOf` (`useCuePlayer.ts:21`) is the only production caller and already supplies all nine. "Absent counts as false" (`sound-cues.ts:91`) means a new flag forgotten in `groupInputOf` silently requests no files and nothing fails. The tests that pass three fields (`sound-cues.test.ts`, `tour-cues.test.ts`, `standings-cues.test.ts`, `ceremony-cues.test.ts`, `coin-cues.test.ts`) can spread a `quiet` base object (`const wheelOff = {...}` already exists in `tour-cues.test.ts:31`). This also fixes the S7 test: a required field is a compile error, so the "keys" test becomes meaningful.

### Checked and sound (Standards)

- Production code (`app/utils/sound-cues.ts`, `cue-lengths.ts`, `cue-player.ts`, `count-up.ts`, `motion.ts`, `ceremony.ts`, `ceremony-run.ts`, `coin-flight.ts`, `standings-news.ts`): the plans are pure and read only flags and instants (Secrecy, ADR 0013: the coin plan takes `startedAt` and `landsAt` and has no side; the voice plan has no `isHost`; the ceremony's file group depends on "finished" only). The ceremony plan reads `ceremonyTimeline` and copies no beat. The picture and the sound share `COIN_*_AT`, `CEREMONY_BONK_MS` and `STAMP_DELAY_MS`.
- ADR 0015: all new motion constants sit in `motion.ts` or `shared/`, and no GSAP outside the ceremony. `ceremony-run-tweens.test.ts` reads the tween start times against the plan, as § Motion asks. The static fallback (a failed chunk) cuts the sound (`failedFor`), with a test in `event-cues-ceremony.test.ts`.
- Home rules: the Event page is the only caller of `useCuePlayer`; `GameBoard`, `Leaderboard` and `TourLayer` use `useImmediateCue`; the files come from `reachableGroups` and `cueFilesOf`; `useSoundUnlock` still calls the player's `resume` and builds no context; `tourSeen` comes through `useTourSeen`.
- `shared/` and `server/`: the diff touches only `shared/ceremony.ts` and `shared/coin.ts` (constants and two timeline fields). No server code changed. No secret, name, id or log of any User is in the diff, the docs or the candidates (Personal data: clean).
- `scripts/`: `cue-kit.mjs`, `make-cue-candidates.mjs` and the recipe files follow the contract in their headers (seeded noise, one folder load, ids checked both ways). The `knip.jsonc` entry for `cue-recipes/*.mjs` is justified in its comment.
- Tests: the new unit and Nuxt cue tests assert instants, rates, secrecy (no side, no game) and the edges 0, 1 and many for rows (`partyCount` 1, 2, 4, 8; 0 below). They use `toMatchObject` for the read. `cue-tables.test.ts` and `cue-lengths.test.ts` hold the tables against each other and the document.
- Docs: the 0.17 deviations in 03, 04, 05, 12 and 16 and `compibert-sound.md` match the code on instants (648 ms, 2664 ms, 520 ms, 920 ms, 34 ids). The `CODING_STANDARDS.md` rows added for `CUE_GROUPS`, `CUE_LENGTHS`, the player and the candidates generator are accurate.
- Copy: the other new changelog lines use the glossary UI words (Tabelle, Spielbrett, Münzwurf, Siegerehrung, Host, Ton) and are gender-neutral.

## Spec

Axis: Spec, against the tickets' criteria and the cue table of spec #718. Read-only; nothing changed, committed or posted. Cloud run: no browser and no `pnpm`. The code and tests were read, and two read-only node scripts ran (wav format, and the hand-off id list). Test names below are from the files on the tip; they were not run (CI is the ticket comments' claim).

Verdict: the cue table holds on the tip. One thing must be fixed before the Release (P1, the changelog says the opposite of the build). The rest is notes and small corrections. P2, P3 and P4 are the answers to the run's three questions: the Standings' ticks, the silent end frame, and the hand-off notes.

### P1. The #743 changelog line is false on the tip, and the voice and ceremony lines leave built sounds out

- **Severity:** must fix before the Release (a user-facing line; fix it at the cut).
- **Where:** `CHANGELOG.md:15` (the #743 line).
- **What is wrong:** the spec says "Each audible build ticket gives its own line under `### Neu`; the cut may fold them" (§ Further Notes). Tickets #744, #745, #746 and #747 each say "no changelog line (the line of 0.17-5 / 0.17-8 covers it)". Line 15 ends "Bei einem Gleichstand und bei reduzierter Bewegung bleibt sie vorerst still." That was true when #743 merged. After #744 and #745 it is false: a Tie plays every moment it has, and reduced motion plays the fanfare (`ceremonyCuePlan`, `sound-cues.ts:443-458`, no branch on the Winner count). The same line does not mention the stamp, the fanfare, the crowd or the laugh. The #671 line ("Am Glücksrad …") does not mention the laugh at the trophy, or the Tour's chirp and cheer (#746 and #747 lean on it).
- **Fix:** rewrite the two lines at the cut. One sentence for the ceremony: „… Stempel, Fanfare und Jubel des Publikums, das Lachen der App-Figur; auch bei Gleichstand; bei reduzierter Bewegung nur die Fanfare, wenn das Endbild erscheint“. One clause for the Tour: „Im Rundgang piept die App-Figur zur Begrüßung und jubelt am Ende“. Keep „App-Figur“, since the changelog test bans the name.

### P2. Question 1: "the Party that gains most" against `Math.abs(change)`

- **Severity:** note (the code is right; the spec sentence should change; no code change).
- **Where:** `standingsCues` (`sound-cues.ts:393-396`). The spec is § Engine changes, "The Standings' owner".
- **What is wrong:** the spec says "The ticks follow the counter of the Party that gains most; the others count silently." The code picks the Party with the largest `Math.abs(change)`; ties go to the first in the order of `after`.
- **Reasoning:** for a new Result no Party loses points, so "gains most" and "changes most" pick the same Party. They differ only for a Correction (`pointsDelta` is negative for a Party whose points fall). Story 15 asks for "a tick for every point the counter counts", and story 23 asks for a Correction that "sounds like a new Result, so the change is not silent". A Correction that only lowers points has no gainer; the literal reading would give no ticks while the counter visibly counts down (`CpNum` counts down as readily as up, `count-up.ts` `countAt`). That contradicts both stories. When a drop is larger than the largest gain, the counter that moves most on screen is the falling one, and the ticks should follow the counter the eye follows. So the sentence is the imprecise part.
- **Fix:** edit the sentence in #718 to "the Party whose points change most, up or down (a Correction can lower them)". Nothing in code. The 04-motion note already says exactly that (`04-motion.md:171`). `test/unit/standings-cues.test.ts:62` (`countTicks` for a decrease) and `:147` (a Correction that lowers points counts as a change) pin the behaviour.
- **Loose end, optional:** on an exact absolute tie between a drop and a gain, the first Party in `after` wins, which can be the loser. A tie rule that prefers the gaining Party would match the spec's wording where both apply. Not needed to meet any story.

### P3. Question 2: a failed animation chunk gives a silent end frame; reduced motion plays the fanfare

- **Severity:** note (not a defect against the spec; a gap the spec does not cover; record the decision, no code change needed).
- **Where:** `CeremonyLayer.vue:65-66` (`failedFor`), `:73-80` (`cuePlan` returns `[]` when `failedFor === run.startsAt`), `:242` (`giveUp` sets it). Test: `test/nuxt/event-cues-ceremony.test.ts:646` ("cuts what is left when the GSAP chunk fails to load at the start (the static end frame has no show)"). The decision was recorded at #743 ("A failed animation chunk clears the plan … the ticket does not say this") and flagged again at #744.
- **Reasoning:** no spec sentence requires sound for a failed chunk. § Engine changes names two clearing points for the ceremony's plan, "a skip or a close"; a failed chunk is a third that the orchestrator added. It does not contradict any story. Story 44 (fanfare under reduced motion) is about a deliberate preference, where the end frame is the designed experience and the fanfare is its designed sound. The only spec sentence that points the other way is § Further Notes, "The voice follows the instants, not the drawing of the rig … if it fails to load … it still sounds". That is about the wheel's voice and a rig chunk, and the wheel's picture still runs there. For the ceremony the picture is gone (a static frame), so cues of a show nobody sees would have nothing to sound with. Silence is the conservative choice and consistent with "sound follows what I see" (story 11).
- **Detail:** the layer opens at `startsAt`, and `giveUp` runs a moment later. So `cer-drop` (at `startsAt`) has already been handed to the audio clock when the plan is cut (the test excludes it from its "cancelled" assertion). In practice that is at most a few milliseconds of the banner thud, then silence.
- **Fix:** none for the code. If the operator wants parity with reduced motion, the fix is not "use the reduced plan": the failure is known after `startsAt`, so a `cer-fanfare` at `startsAt` would be more than 150 ms late and skipped. It would have to be a fanfare at the moment of failure, which is new behaviour with its own test, not worth it for a failure path. Add one clause to the ceremony note in `04-motion.md:189` ("A chunk that fails to load cuts the plan: the static end frame is silent"), so the document says what the code does (see P4).

### P4. Question 3: the #750 hand-off notes against the code

- **Severity:** should fix (two wording corrections; 17 of the 19 notes are accurate).
- **Where:** `docs/design_handoff_compies`, the lines added by #750 (`git diff origin/staging...origin/spec/718-klang`).
- **What is wrong:** the added notes were checked against the code: instants, constants, ids, conditions, and the list of 36 left-out ids (a script showed every id of `compibert-sound.md` is one of the 34 built, one of the 36 listed, or `cer-trophy-rattle`, which is part of `cer-run`; `share-shutter` is listed and has no backticked row in the doc, which is harmless).
- **Accurate:** `03-screens.md` § 30 (`ceremonyAwaitsSound`); `04-motion.md` § Avatar drag, § Lucky Wheel, § Coin flip, § Compibert moment slots; `05-assets.md` four notes; `12-siegerehrung-unentschieden.md`; `16-compibert-gluecksrad.md`; and the seven `compibert-sound.md` notes (format, bus, ducking, variants, reduced motion per moment, `cb-hi`/`cb-yay`, `cer-run`, `cb-laugh`).
- **Correction 1:** `04-motion.md:171` (Leaderboard): "`lb-count`: one per step of `COUNT_TICK_MS`, 1000/15 ms, so at most 15 a second". The code ticks at each step where the counter shows another number (`countTicks`, `count-up.ts:20-33`): a gain of 3 gives 3 ticks, not 9; a gain of 30 gives 8. "One per step" reads as a tick on every 66.7 ms step. Fix: "one at each step of `COUNT_TICK_MS` at which the counter shows another number, so at most 15 a second". (The spec row says "one per point stepped", which is the same thing for a small gain.)
- **Correction 2:** `04-motion.md:189` (Award ceremony): "A skip, a close or a new start cuts a fanfare or a crowd that is sounding." The code cuts everything the ceremony's plan holds, pending or sounding (`cue-player.ts:18`, `CUTS.ceremony = true`), and also on a failed chunk (P3) and on Ton off. Fix: "A skip, a close, a new start or a failed animation chunk cuts everything of the plan that is pending or sounding, the fanfare and the crowd included." Also, for a Tie the stamp sits 150 ms after the plate, not the landing; the Tie note in `12-…` says so, and this one could say "the landing (the plate, in a Tie)".

### P5. The row tweens do not read `rowAtMs`; a test guards the drift

- **Severity:** note.
- **Where:** `shared/ceremony.ts:84` (`rowAtMs`), `:89` (`bonkAtMs`), `:72` (`step`); `ceremony-run.ts:138,171` (`rowStep = sec(CEREMONY_ROW_MS)` with `sec(moments.rowsAtMs)`), `ceremony-run.ts:195` (the `confused` call), `ceremony-tie-run.ts:137-138` (`CHIP_STEP_MS` / `CEREMONY_ROW_MS`).
- **What is wrong:** the spec says "`ceremonyTimeline` gains … the instant of each row (rows and chips) … so that the sound and the GSAP tweens read one function and cannot drift". The timeline gained `rowAtMs` and `bonkAtMs`, and the bonk beat is shared (`CEREMONY_BONK_MS`). The row tweens still compute their stagger from constants. They agree today because `rowAtMs` is built from the same constants (`step`), so a change to a constant moves both. The spec's guard is the test of § Testing Decisions seam 2: `test/nuxt/ceremony-run-tweens.test.ts` ("the ceremony's cues sound where their tweens start", one winner, seven Tie shapes, both gags, rows and chips, bonk, stamp, laugh), which reads the tween start times off the built timeline. That test is the real protection, and it is there.
- **Fix (optional):** let `buildRun` and the Tie entrance derive their stagger from `moments.rowAtMs[1] - moments.rowAtMs[0]`, or leave as is.

### P6. Stale test titles and one vacuous secrecy test

- **Severity:** note.
- **Where:** `test/unit/sound-cues.test.ts:491` ("are eleven distinct ids"); `test/unit/sound-credits.test.ts:14` ("reads eleven valid entries …"); `test/unit/sound-files.test.ts:62` ("sits beside exactly the eleven cue files"); `test/unit/listening-model.test.ts:268` ("has all eleven cues in order …"); `test/unit/ceremony-cues.test.ts:108` ("(… #745 may change it)"); `test/unit/sound-cues.test.ts:530` ("takes three flags and nothing of the draw (Secrecy)"); `app/dev/listening-model.ts:70` (the brief of `cb-hi`).
- **What is wrong:** the spec's "Changed" list says the ids are eleven distinct ids, the credits file reads eleven entries and the listening model has the eleven cues; these become the 34. The bodies were changed, the titles were not. The #745 comment says #745 did not change the "may change it" case. The Secrecy test at `sound-cues.test.ts:530` asserts the keys of the object literal it builds itself, so it cannot fail; `GroupInput` has since grown five optional fields. The secrecy of the group rule is carried instead by the Event-page tests that compare requests (see the secrecy table below). The brief of `cb-hi` in `listening-model.ts:70` says "3 variants"; one file ships (spec: "The hand-off's three variants of `cb-hi` … are not built"). Dev page only.
- **Fix:** rename the titles; delete or repair the vacuous test. Either drop the test or make it read the keys `groupInputOf` produces.

### P7. The Coin flip's files are also requested on a finished Event that still holds its last toss

- **Severity:** note (the spec's own rule; wider than story 80 intends).
- **Where:** `useCuePlayer.ts:25` (`toss: view.coin != null`), `sound-cues.ts:123` (`reachableGroups` pushes `coin`), `server/utils/stage-read.ts:278-279` (`coinSection`).
- **What is wrong:** the spec's table says the coin files are requested when "the Event has a running Session (the Host can toss) or the read carries a toss". `coinSection` returns the Event's latest toss whenever one exists, so a finished Event whose last Session had a toss requests the four coin files (about 140 KB) where no toss can happen any more. Story 80 says "only when this Event can reach that moment now". Secrecy is untouched (a flag, never the side).
- **Fix:** a refinement, for example `toss && phase !== 'finished'`, would match the story. It needs a spec decision because the table sentence is explicit.

### P8. The ticks follow the counter's nominal grid, not its actual writes

- **Severity:** note (no requirement broken; the cap holds).
- **Where:** `countTicks` (`count-up.ts:24-25`); `CpNum` writes (`CpNum.vue:52-54`, `wrote = Date.now()`).
- **What is wrong:** `countTicks` puts ticks at `step * COUNT_TICK_MS`. `CpNum` writes at the first frame at least `COUNT_TICK_MS` after the previous actual write, so on a 60 Hz screen the writes drift later than the grid (a frame quantises 66.7 ms to 66.7 or 83 ms). The sound never exceeds 15 a second (story 16, spec "at most 15 a second"), and the first tick is within a frame of the first change. A late tick can lead the number by a few tens of milliseconds. The two-account check (#752) is the place to hear it.

### Secrecy rules and the tests that pin them

| Rule | Pinned by | Gap |
|---|---|---|
| Coin: plan reads `startedAt` and `landsAt` only, no `side` in the type | `test/unit/coin-cues.test.ts:36` (type holds no side, `@ts-expect-error` on an excess `side`) | none |
| Coin: same toss heads and tails gives the same plan, requests and cue log | `coin-cues.test.ts:28` (plan); `test/nuxt/event-cues-coin.test.ts:111` (files, sources and log lines, for a Member and the Host) | the file comparison covers the coin files, not all 34 |
| Coin: set of files a function of the Event, never of the toss | `GroupInput.toss` is a boolean (`useCuePlayer.ts:25`); `event-cues-coin.test.ts:232-261` (files for a running Session, for a read with a toss, none otherwise) | none |
| Hidden wheel: voice plan equal for two drawn games | `test/unit/wheel-voice-cues.test.ts:36`; `test/nuxt/event-cues-wheel-voice.test.ts:156` | none |
| Hidden wheel: cheer at stop + 500 ms for Member and Host, Host differs only in the morph | `wheel-voice-cues.test.ts:52-72`; `event-cues-wheel-voice.test.ts:141` | none |
| Hidden wheel: files requested for any read with a wheel, Hidden or not | `event-cues-wheel-voice.test.ts:180` (a read with a wheel, no spin). Structurally `GroupInput` has no hidden flag | no test varies `hiddenWheel` and compares the requests |
| Ceremony: the same nine files for a Tie and one Winner, pending or started, both gags, Host and Member | `test/nuxt/event-cues-ceremony.test.ts:184`; `:210` (requested before the Host has started it, no other group) | none |
| Ceremony: no plan until the Host has started it | `CeremonyLayer.vue:76` (`!run` gives `[]`); `event-cues-ceremony.test.ts:210` asserts only requests | no test asserts "no plan before the start" directly (it follows from the layer's null `ceremony`) |
| Tour: files by a rule of the Member's own state | `test/nuxt/event-cues-tour.test.ts:115` and `:205-243` | none |
| Standings: cues from ranks, points, positions only | `test/unit/standings-cues.test.ts:202,208`; `test/nuxt/event-cues-standings.test.ts:314,329` | none |
| Cue log only in dev and staging builds | `exposesCueLog` (`cue-player.ts:87`) and its existing test; `useCuePlayer.ts:134,182` | unchanged from 0.13.3 |

### Tickets and acceptance criteria

Legend: met / not met / n/a. "Typed" means judged from code and tests, nothing measured (cloud run). Every build ticket's common criteria (generator, manifest, credits `generated`, file tests, listening-page moment, Ton off, reduced motion, secrecy case, check items posted, changelog) are checked once below the table.

| Ticket | Criterion | Result |
|---|---|---|
| #740 prefactor | wheel/Veto plans, files and tests as before | met (the length test moved to `cue-lengths.test.ts`, the Vol test reads documented rows only: both are the spec's "Changed" items) |
| #740 prefactor | a new cue id needs one row in each table; type or test fails otherwise | met (`test/unit/cue-tables.test.ts`, `Record<CueId, …>`) |
| #740 prefactor | group rule is a pure function with a unit test | met (`reachableGroups`, `sound-cues.test.ts:513-540`) |
| #740 prefactor | 44 candidates unchanged byte for byte | met (the diff holds no modified candidate; manifest only gains) |
| #740 prefactor | knip, lint, test green | typed: ticket comment claims CI green on the head |
| #740 prefactor | no changelog line | met |
| #669 Coin | four cues at the instants, once; refetch; new toss replaces | met (`event-cues-coin.test.ts:134,153`) |
| #669 Coin | heads and tails same plan, requests, log | met (`:111`) |
| #669 Coin | late joiner, read after landing, 150 ms skip | met (`:196-229`) |
| #669 Coin | files only with a running Session or a toss, never a hub page | met (`:232-268`); see P7 |
| #669 Coin | reduced motion: land and result only | met (`:270`) |
| #669 Coin | files, generator, credits, listening "Test toss" | met |
| #669 Coin | Ton off, check items, changelog line | met (items on #751; line at `CHANGELOG.md`) |
| #741 Standings | swap only on a rank change, ticks over 0.6 s (3 gives 3, 30 gives 8), winner at 0.52 s | met (`standings-cues.test.ts:32-36,88`) |
| #741 Standings | first read, reload, hidden tab, finished Event, stale news: nothing | met (`event-cues-standings.test.ts:160-198`, `leaderboard-cues.test.ts:109`) |
| #741 Standings | stage and tab both mounted: one set; a Correction plays | met (`leaderboard-cues.test.ts:142-181`) |
| #741 Standings | phone: swap and ticks, winner only where the stamp is drawn | met (`event-cues-standings.test.ts:264-292`) |
| #741 Standings | files for an Event set up and not finished; none for a hub page | met (`:234-262`) |
| #741 Standings | reduced motion: swap and winner, no ticks | met (`:219`) |
| #741 Standings | files, listening page, Ton off, check items, changelog | met |
| #741 Standings | "the Party that gains most" | met by the code; the sentence is imprecise, P2 |
| #742 Board | pick once at the pick-up, not at first touch; snap at the answer; reject on refusal | met (`useBoardDrag.ts:73-76`, `GameBoard.vue:101-108`; `game-board-cues.test.ts`) |
| #742 Board | release over no place plays reject | met (`GameBoard.vue:128-131`; also Escape, a cancelled pointer, a drop on the own place: decided at the ticket) |
| #742 Board | menu pick plays snap or reject, no pick | met |
| #742 Board | Host moving another hears three; another's move and the confirming refetch silent | met |
| #742 Board | reduced motion keeps all three; Ton off none | met |
| #742 Board | files only for an Event set up and not finished | met |
| #742 Board | files, listening "Test drag", Ton off, check items, changelog | met |
| #743 Ceremony | plan instants equal the tween starts | met (`ceremony-run-tweens.test.ts`); rows computed from constants, P5 |
| #743 Ceremony | cues once from the read with `startsAt` and `gag`, same on every device; trip/bonk by gag | met |
| #743 Ceremony | late joiner only what is still to come; page after the end plays nothing | met (`event-cues-ceremony.test.ts:266,282,293,303`) |
| #743 Ceremony | skip or close cancels pending and stops a sounding source; a new start replaces | met (`:322`, `cue-player.ts:18,283`) |
| #743 Ceremony | replay from the click, this device only | met (`:382`) |
| #743 Ceremony | rate rises a semitone a step, logged, same-instant cues do not collide | met (`sound-cues.ts:450`, `cue-player.ts:106,129`) |
| #743 Ceremony | files for any finished Event, same set | met (`:184`) |
| #743 Ceremony | files, listening "Test ceremony", Ton off, check items, changelog | met; the line is now partly false, P1 |
| #744 Peak | the three cues at `stampAtMs`, matching the stamp's tween | met |
| #744 Peak | reduced motion: fanfare alone at `startsAt`; late joiner hears none that has passed | met (`:441,453`) |
| #744 Peak | skip/close cut a sounding fanfare and crowd; replay under reduced motion plays the fanfare | met (`:355,464`) |
| #744 Peak | Ton off, switch-off mid-fanfare stops it | met (`:425`) |
| #744 Peak | no changelog line | met by the ticket; P1 |
| #745 Tie | every cue at the beat of `ceremonyTimeline` for 2, 3 (chain) and 4+ (grid) and equal to its tween | met (`ceremony-run-tweens.test.ts`, seven shapes, both gags) |
| #745 Tie | none below: no `cer-row`; rows 450 ms apart, chips 200 ms apart | met (`ceremony-cues.test.ts`) |
| #745 Tie | phone's grid of 3 earlier; crossing the width mid-run gives the new plan | met (`event-cues-ceremony.test.ts:509,538`) |
| #745 Tie | skip, close, replay, reduced motion, late join as for one Winner | met (`:566-634`) |
| #745 Tie | same nine files for a Tie and one Winner | met (`:184`) |
| #745 Tie | generator and listening-page criteria | n/a (no new cue; the Test ceremony stays one Winner's) |
| #746 Laugh | `cb-laugh` at `getUpAtMs` for one Winner and each Tie shape, equal to the rig's `laugh` call | met (a test finds the `tl.call`) |
| #746 Laugh | skip/close cancel it; late joiner after it hears none; reduced motion and Ton off none | met (the late-joiner case can only assert "no line scheduled or late", as the ticket notes; the laugh is the plan's last cue) |
| #746 Laugh | file requested with the ceremony's group only | met |
| #746 Laugh | files, listening page (the Test ceremony row), changelog | met |
| #671 Wheel voice | hype, gulp, yay at the instants, once, in step with the wheel | met |
| #671 Wheel voice | Hidden wheel: cheer at stop + 500 ms for Member and Host; two drawn games same plan | met |
| #671 Wheel voice | reduced motion: cheer only | met |
| #671 Wheel voice | files only for a read with a wheel; no Veto-reveal voice | met (`event-cues-wheel-voice.test.ts:192,202`) |
| #671 Wheel voice | wordless | met (the recipes synthesise sounds only) |
| #671 Wheel voice | files, listening "Test voice run", Ton off, changelog | met; the line covers the wheel only, P1 |
| #747 Tour voice | greeting plays `cb-hi`, end plays `cb-yay`, once per showing, through the immediate function; the layer does not call the composable | met (`TourLayer.vue` `sing`, `tour-layer-cues.test.ts`) |
| #747 Tour voice | suspended context silent, no notice because of the Tour | met (`event-cues-tour.test.ts:175`) |
| #747 Tour voice | Ton off and a Member who has seen the Tour: nothing, no request; reduced motion plays both | met (`:166,192,206`) |
| #747 Tour voice | requested at page load for a Member the Tour may start for; not a Host or a finished Event | met (`:141,217,226`) |
| #747 Tour voice | Tour's own rules untouched | met (`useTour.ts`, `shared/tour.ts` unchanged) |
| #755 Notice | shows on a finished Event pending or running, Ton on, suspended context; not after the end, Ton off, after a gesture | met (`event-sound-unlock-ceremony.test.ts`; the end is picked up by the instant refresh at `endsAt`, `event-stage.ts:157`) |
| #755 Notice | cases of today stay; Tour never shows it | met (`ceremonyAwaitsSound` is false before `finished`) |
| #755 Notice | polite, never takes focus | met (test) |
| #755 Notice | a gesture during the run lets the cues still to come through | met |
| #755 Notice | changelog under `### Geändert` | met |
| #750 Notes | each line has its note with ticket numbers | met except the two corrections of P4 |
| #750 Notes | a note says what is built | partly: P4 |
| #750 Notes | list of left-out cues matches the spec's | met (36 ids, checked by script) |
| #750 Notes | no code change | met |

### Scope creep and open points

- **Scope creep:** none found. The additions beyond the table are the orchestrator's recorded decisions: the third touch point on the board (`release`), the Tie under reduced motion playing the fanfare, the failed-chunk cut (P3), Ton off stopping immediate cues, and the Host's notice. Each contradicts no spec sentence; the first two follow stories 51 and 41/44, and the last is the spec's own decision (2026-11-16).
- **#741:** "an immediate cue with a delay already scheduled is not cancelled when Ton is switched off within that half second" is closed by #743 (`stopImmediates`, `cue-player.ts:183-194`, called from `setEnabled(false)` and `dispose`).
- **#745:** the stale title at `ceremony-cues.test.ts:108` is P6.
- **#746:** the late-joiner-after-the-laugh test can only say no line is "scheduled" or "late": accepted; nothing is ahead of such a joiner.

## Code quality

Tip `24230a23` of `origin/spec/718-klang`, read against `origin/staging` (`d3d31621`). Generated files (`sound-candidates/`, `public/sounds/cues/*.wav`) left out. Read-only; nothing changed or posted. `pnpm typecheck`, `lint` and `knip` were not run (no `node_modules` in this worktree).

Overall: the production code is in good shape. The group rule, `CUE_GROUPS`, `useImmediateCue`, the player's two plan sources and the recipe split are sound, and no must-fix was found. What the parallel tickets left behind is mostly (1) the same facts kept in several places, (2) a test harness pasted seven times, and (3) tests that restate data.

Severity key: **S** = should fix in this Release's fix ticket; **I** = Idea for later.

### Q1. S: `CUE_IDS` is scraped from the TypeScript text by regex, in three places, although this Release already proved the leaf-import route

- `scripts/make-cue-candidates.mjs:216` and `scripts/ship-cue-sound.mjs:405` both run `readFileSync('app/utils/sound-cues.ts').match(/export const CUE_IDS = \[([^\]]*)\]/)`. `test/unit/cue-tables.test.ts:41-48` carries a third copy of the regex to guard the first two.
- It forces a rule on every author, written into the doc comment at `app/utils/sound-cues.ts:20-21`: "keep it one `[ ... ]` of quoted ids, and no quote or bracket in a comment". The 718 tickets edited that array in parallel, so this is a standing trap. A `]` in a group comment silently truncates the list.
- Yet the same Release made `app/utils/cue-lengths.ts` a leaf that Node imports directly (`make-cue-candidates.mjs:220`: `await import('../app/utils/cue-lengths.ts')`). `CUE_LENGTHS` has exactly one row per id (held by `cue-tables.test.ts`), so `Object.keys(CUE_LENGTHS)` already is the id list.
- Dead guards follow from it: `make-cue-candidates.mjs:223-227` ("no length for id" and "a length for no cue id") can only fire if the regex and the table disagree. `CUE_LENGTHS: Record<CueId, …>` plus `cue-tables.test.ts` already make that impossible. The "a recipe for no cue id" check (`:312`) and the "at least three recipes" check (`:295`, `:378`) are repeated a third time in `test/unit/cue-recipes.test.ts`.
- **Fix:** move `CUE_IDS` and `type CueId` into a leaf (for example `app/utils/cue-ids.ts`, no imports) that `sound-cues.ts` re-exports. Both scripts then import `CUE_IDS` from it. Then delete the regex in the two scripts, the third regex test and the comment rule. The fallback that touches fewer files is `Object.keys(CUE_LENGTHS)` in the scripts.

### Q2. S: seven `event-cues-*.test.ts` files each paste the same ~25-line fixture block

- Verbatim (apart from names) in `test/nuxt/event-cues.test.ts:60-71`, `event-cues-board.test.ts:27-38`, `-ceremony.test.ts:49-62`, `-coin.test.ts:41-54`, `-standings.test.ts:26-37`, `-tour.test.ts:28-41`, `-wheel-voice.test.ts:53-66`:
  - the `requests` record and the `for (const id of CUE_IDS) registerEndpoint('/sounds/cues/<id>.wav', …)` loop;
  - `requested`, `requestedOf`, `context`, `started`, `startedOf`;
  - the `__compiesCueLog` cast and `log` (typed differently in every file, for example `LogLine`, `Line`, an inline type);
  - a matching `beforeEach`/`afterEach` that resets `FakeAudioContext` and Ton.
- Also pasted: `filesReady` + `settle` + `reduced()` in `-board` and `-standings` (identical bodies); `HeldContext` in `-tour`, `event-sound-unlock.test.ts` and `event-sound-unlock-ceremony.test.ts`; `FIRST`, `STARTED` and `iso` again in four of them, although `event-page-states.ts` exports `FIRST` and `STARTED`; `leaderboard-cues.test.ts:55` and the two above re-implement `motion()`, although `test/nuxt/motion.ts` exists.
- Cost of leaving it: the next moment pastes it an eighth time. A change to the log shape (it just gained `rate`) must be made in eight places. `-tour` already pins `{id,outcome}` only, while `-coin` pins `{id,at,outcome}`, so the files have begun to diverge.
- **Fix:** one `test/nuxt/cue-harness.ts` exporting `serveCueFiles()` (the endpoint loop, `requested`, `requestedOf`), `audio()` (`context`, `started`, `startedOf`, `cueLog()`), the shared `beforeEach`/`afterEach` body as a function, and `HeldContext`. Reuse `motion.ts`. Each file keeps only its own serving and assertions.

### Q3. S: tests that restate the tables, or pass without the code

- **The test computes the answer with the same code it tests, or checks its own literal.**
  - `test/unit/coin-cues.test.ts:36-41`, `wheel-voice-cues.test.ts:44-49` and `standings-cues.test.ts:204-205` assert `Object.keys(input).sort()` where `input` is a literal built two lines above. These pass with any implementation, and fail only if the test file itself is edited. `sound-cues.test.ts:529-534` does the same for `GroupInput` and is now wrong as well as empty. The `@ts-expect-error` line in `coin-cues.test.ts:42` is the one real check in that test.
  - `test/nuxt/event-cues.test.ts:44-48` and `-coin.test.ts:59` define `planOf` in the test as the same narrowing that `useCuePlayer.planOf` does, then compare the page's log with it. A wrong narrowing in production is copied here.
  - `listening-model-coin.test.ts` "makes the same run twice" and `wheel-voice-cues.test.ts` "gives the same plan for the same read twice" call a pure function twice and compare. They cannot fail.
- **Table data pinned as literals**, so the operator's listening session (ticket #748, which exists to change volumes and the semitone step by ear) breaks them:
  - `CUE_VOLUME` literals: `coin-cues.test.ts:94-96` (`[50, 30, 60, 55]`), `wheel-voice-cues.test.ts:92-95`, `ceremony-cues.test.ts:~219` (`40/60/60`), `ceremony-laugh-cues.test.ts` (`CUE_VOLUME['cb-laugh']` = 40 and the whole `CUE_LENGTHS` row).
  - `MOMENT_OF`/`MOMENT_LABEL` literals: `listening-model-coin.test.ts` last case, `listening-model-tour.test.ts` last case, `board-cues.test.ts`.
  - `ROW_STEP_SEMITONES` (`sound-cues.ts:432`, comment: "The listening session may change the step") is not exported. Four tests hard-code `2 ** (index / 12)` (`ceremony-cues.test.ts`, rows 1, 2, 4 and 5 of the `describe('ceremonyCuePlan')` block), so changing the step by ear fails them.
  - `OWN_FILES` and `CEREMONY_CUES = 10` in `event-cues-ceremony.test.ts:46,105` copy `CUE_GROUPS` and the plan length. `board-cues.test.ts:48-52` pins "four recipes" per id, while `cue-recipes.test.ts` already requires at least three.
  - `coin-cues.test.ts:62-67` finds the flight keyframe by the string `'translate3d(0px,83px,0)'`, which pins a drawing constant of `coin-flight.ts` rather than the contract (the offset equals `COIN_LAND_AT`).
- **The same function is re-tested by every ticket, 33 times over six files.** The `reachableGroups` cases (`reached by its own flag`, `comes after the wheel`, `not reached when absent`) sit in `sound-cues.test.ts`, `coin-cues`, `board-cues`, `standings-cues`, `tour-cues` and `ceremony-cues`. Each pins the whole returned array, so adding group N+1 means editing the expectations in N other files (for example `board-cues.test.ts:19-20` pins `['standings','board']`). 29 object literals of the form `{ wheel: false, vetoAllowance: 0, vetoWindow: false, … }` are scattered over the same six files.
- **Two files test one thing.** `ceremony-laugh-cues.test.ts` re-asserts ordering, grid-vs-chain and reduced motion, which `ceremony-cues.test.ts` already covers with a full-plan `toEqual` that includes `cb-laugh` and an exhaustive ascending-order loop. `ceremony-cues.test.ts:21-47` tests `ceremonyTimeline` (a `shared/` function) in the cue file; its home is a `shared/ceremony` test.
- **Real-clock sleeps.** `event-cues-board.test.ts:111` and `-standings.test.ts:81` (`setTimeout 60`), `filesReady` (`setTimeout 20`) and `event-cues-ceremony.test.ts:109-110` (`vi.waitFor(Date.now() >= start + stampAtMs + 50, {timeout: 5000})`, a wait of up to seconds in real time) will flake on a slow CI runner.
- **Fix:** one table-driven `reachableGroups` test (a `{group → flag}` list, each flag alone, absent, and the union order once); one `groupInput(over)` builder in `test/unit/` for the literals; export `ROW_STEP_SEMITONES` and use it; drop the keys-of-own-literal tests and the same-twice tests; keep the volume, length and moment literals only in the one place that checks them against the document (`cue-lengths.test.ts`, the `sound-cues.test.ts` Vol test). Fold `ceremony-laugh-cues.test.ts` into `ceremony-cues.test.ts`.

### Q4. S: `playNow(id, delayMs, rate)` carries a `rate` that no production caller passes

- `app/utils/cue-player.ts:70,350` accepts `rate`. The only calls that pass it are `test/unit/cue-player-sources.test.ts:164,193,201,203,205`. Production rate reaches the player only through `Cue.rate` in a plan (`schedule`/`replace`). `ArrivalCue` (`sound-cues.ts:331`) has no `rate`, so no immediate cue can carry one.
- `app/composables/useImmediateCue.ts:276` justifies it as "`(id, delayMs?)` today, and a rate later (#743) with no edit here". The rate exists now and is not used through this path, so this is speculative generality plus a stale comment. The same file's header (`:272-274`) still says "later the Game board's drop and the Tour"; both shipped. `ImmediateCue` is a one-line alias of `CuePlayer['playNow']`.
- **Fix:** drop the `rate` parameter and its three test lines (the log's `rate` field and `Cue.rate` stay), or give `ArrivalCue` a `rate?` and a user. Rewrite the two comments.

### Q5. S: `up()` semitone helper pasted into two recipe files, against the kit's own rule

- `scripts/cue-recipes/tour.mjs:9` and `scripts/cue-recipes/wheel-voice.mjs:8`: `const up = (hz, semitones) => hz * 2 ** (semitones / 12)`. `scripts/cue-kit.mjs:1-2` says "A new helper goes here, not into a recipe file". Cheap to move. The row rate in `sound-cues.ts:450` is a third spelling of the same formula (production, so leave that).
- Also `ceremony` has three recipe files (`ceremony-laugh`, `-peak`, `-run`) and `wheel` two, while `CODING_STANDARDS.md` says "one recipe file per moment" (`scripts/cue-recipes/<moment>.mjs`). Either word it as "per ticket's moment group" or leave it. I would only fix the wording.

### Q6. S: `groupInputOf` repeats one fact several ways, and says so on purpose

- `app/composables/useCuePlayer.ts:94,96`: `standings` and `board` are the identical expression `view?.standings != null && view.event.phase !== 'finished'`, kept apart "so the two groups can part later (#742)", and `GroupInput` (`sound-cues.ts:104-107`) documents the duplicate field twice. That is speculative: if they part, the author splits the field then. `view?.event.phase` is read three times (`:92,94,96`), and `sessionRunning` is spelled two ways (`:90` `view?.runningSessionId != null` against `:101` `view != null && view.runningSessionId !== null`), which differ for `undefined`.
- **Fix:** compute `const setUp = view?.standings != null && view.event.phase !== 'finished'` once, and `phase` once. Keep both flags if you want the split, or drop `board`.
- **The question on `GroupInput`:** making the optionals required is **yes, worth it.** `groupInputOf` is the only production constructor and already sets every field, so required fields cost the product nothing and make the compiler list every group's flag when the next one lands. The cost is the test literals (Q3), which become one `groupInput(over)` builder. Do it together with Q3, or the churn lands twice.

### Q7. S: `planOf` copies and re-narrows the same read; `reducedMotion()` four times

- `app/composables/useCuePlayer.ts:111-134`: `reducedMotion()` is called four times and `view.settings?.hiddenWheel ?? false` twice; the wheel's five spin fields and the voice's two are each copied into a fresh object. The same copy lives a second time in `app/dev/listening-model.ts:325-338` (`buildRun.planOf`: "from the same five and four fields as `planOf`") and a third time in the tests (Q3).
- **Fix in this ticket:** hoist `const reduced = reducedMotion()` and `hiddenWheel` once at the top of `planOf`. If a second caller appears, extract `wheelInputsOf(view)`. The narrowing exists so a plan cannot read the drawn game at runtime, so keep it; just do it once.

### Q8. S (low): stale or wrong comments that are not in the known list

- `app/utils/sound-cues.ts:11-15` header names only the wheel, veto and standings plans; coin, voice, ceremony and tour are missing.
- `app/dev/listening-model.ts:73-77`: the `Moment` doc says "in a spin, in a Veto window, or at the arrival"; it has nine members now.
- `app/composables/useImmediateCue.ts:272-274,276` (see Q4).
- `app/utils/cue-lengths.ts:3-5` says the generator and listening page read it, which is correct. But `app/dev/listening-model.ts:24-27` describes `CUE_BRIEF` as "the Cue column … word for word", and the table is a single-field object (`{ character: string }`) since the lengths moved; the wrapper object could be the string itself.
- `shared/ceremony.ts` `CEREMONY_BONK_MS = 920` says ".5 + .42 s", while `ceremony-run.ts:~192-193` still hard-codes the `0.5` and `0.42` tween durations: half-extracted. Either extract both or leave the number with a comment.

### Q9. I: `TOUR_STEP_CUES` (a string-keyed table in `sound-cues.ts`) duplicates a fact the Tour already has

- `app/utils/sound-cues.ts:242-246`: `{ greeting: 'cb-hi', end: 'cb-yay' }`, keyed by untyped step id and looked up in `TourLayer.vue:211` with `props.steps[index]?.id ?? ''`. `shared/tour.ts:49-51` already says which steps are the greeting and the end: `tourFace(step)` returns `'hello'` for the target-less greeting and `'cheers'` for `end`. `tourStepCue(step)` could be `{ hello: 'cb-hi', points: null, cheers: 'cb-yay' }[tourFace(step)]`: typed, no step ids in the audio module, no `''` fallback. Caveat: a future Host-tour step with no target would chirp too, which may be wanted. Not urgent; the current table is covered by `tour-cues.test.ts`, which also holds the `MEMBER_TOUR` ids in step.

### Not findings (checked)

- File sizes: the largest new production file is 458 lines; no file crosses 1000 lines.
- `cue-player.ts` plan-by-source design (`PLAN_SOURCES`, `CUTS`, `keyOf`) is small and tested.
- `useImmediateCue` and `provideImmediateCue` are a sound seam with a null-safe default.
- No unused import in any recipe file (checked with a script).
- `ceremonyAwaitsSound` sits in the right layer and reuses `ceremonyRunning`.
- `countTicks` shares the counter's own rule rather than copying it (but see S8 for the drift).
- `STAMP_DELAY_MS` and `countDurationMs` were extracted from the call sites that used literals.

## Architecture candidates

Kept apart from the findings. Vocabulary of the codebase-design skill (module, interface, depth, seam, deletion test).

### A1. One leaf table per cue (deepen the per-cue facts). Strength: worth exploring

- **Problem:** a cue is described by six parallel `Record<CueId, …>` tables in three files, each with its own group comment lines: `CUE_VOLUME` and `CUE_GROUPS` (`sound-cues.ts`), `CUE_LENGTHS` (`cue-lengths.ts`), `CUE_BRIEF` and `MOMENT_OF` (`listening-model.ts`), plus `CUE_IDS`. 35 cues times five tables is about 175 hand-kept rows, which `test/unit/cue-tables.test.ts` exists to police. The standing-rules text says "a new cue is one row in each table". The tables share a key and change together, so their interface is wider than the thing behind it (low locality).
- **Solution:** one leaf `app/utils/cue-table.ts`: `CUES = { 'wheel-windup': { volume: 45, groups: ['wheel'], ms: 500, loop: false, docRow: true }, … } as const satisfies Record<string, CueRow>`, with `CUE_IDS = Object.keys(CUES)`, `CueId = keyof typeof CUES`, and `CUE_VOLUME`, `CUE_GROUPS` and `CUE_LENGTHS` as thin derived views if the call sites should stay. Node imports it (as it does `cue-lengths.ts` now), which removes Q1 entirely. The listening-only fields (`character`, `moment`) stay in the dev module as one table (`CUE_LISTENING`), so no brief text ships in the production bundle. Rows sit under group lines as today, so parallel tickets still touch different lines.
- **Benefits:** one row per cue instead of five; `cue-tables.test.ts` shrinks to the one-row-per-id check on the dev table; the deletion test passes (deleting the three derived tables concentrates, not moves, complexity).
- **Cost:** a one-time edit of about 35 rows and the call sites of `CUE_VOLUME[id]` and `CUE_GROUPS[id]` (about a dozen, mostly tests). It touches the same lines every open ticket would touch, so do it between Releases. Q1 is the cheap 80 % of this.

### A2. A moment descriptor that owns its group flag and plan. Strength: speculative

- **Problem:** adding a moment touches `GroupInput` (field), `groupInputOf` (line), `reachableGroups` (line), `planOf` (spread) in two files, plus `CueGroup`, `Moment`, `MOMENT_LABEL` and `MOMENT_RUNNERS`. The plan functions repeat a shape (null input gives `[]`, gate by reduced motion, no `now`; the "has no `now` and drops nothing for being past" paragraph is copied into five doc comments) but not logic, so a generic plan helper would be a wrapper that buys nothing. The real repetition is the wiring.
- **Solution:** `{ group, reached(view): boolean, plan?(view): Cue[] }` per moment in `useCuePlayer`, so `groupInputOf` and `planOf` become `MOMENTS.filter(…)` and `MOMENTS.flatMap(…)`.
- **Cost:** it moves view-reading code from the typed narrow inputs (`WheelCueInput` and the others, deliberately free of the drawn game, § Secrecy) into one place that sees `EventView`. The Secrecy guarantee then rests on review rather than on the input types. Do not do this until a tenth moment arrives; Q6 and Q7 give most of the benefit.

### A3. Split `sound-cues.ts` into data and plans. Strength: speculative

- **Problem:** 458 lines, still far from 1k. It holds the id, volume and group tables, the group rule, the file URLs, and nine plan or arrival functions. `CODING_STANDARDS.md` names it as the one home, so it is deliberate.
- **Cost:** not worth a ticket on its own. If A1 lands, the tables leave, and what remains (plans, arrival and the group rule) is one concern.

### A4. Two cue shapes, two player entry points. Strength: speculative

- **Problem:** `Cue { id, at, rate? }` (plans, `setPlan`) and `ArrivalCue { id, delayMs }` (arrival and Standings cues, `playNow`) are one concept at two reference times. They are kept apart because arrival cues have no server time known ahead (documented at `sound-cues.ts:321-331`). Merging would mean giving the player a relative-cue entry that turns `delayMs` into `at`, which `playNow` already does.
- **Cost:** no change recommended. Noted because Q4 (rate) is the point where the two shapes would otherwise grow apart.

### A5. Split `app/dev/listening-model.ts`. Strength: speculative

- **Problem:** 462 lines mixing three concerns: candidate manifest parsing (`candidatesOf`), choices and report, and nine hand-built test runs (`buildRun`, `buildCoinRun`, `standingsChangeCues`, `dragRunCues`, `tourVoiceCues`, `ceremonyRun`, `arrivalCues`, `stampCues`) that return five different shapes (`Run`, `{startedAt, landsAt, plan}`, `ArrivalCue[]`, `Cue[]`). The page's `MOMENT_RUNNERS` papers over this. A `listening-runs.ts` split (runs only) would give each next moment a home that is not the manifest module. Its tests are already split per ticket (`listening-model-coin.test.ts`, `-tour`, `-voice`).
- **Cost:** dev-only code, so low priority.

## Fixed before `staging`

To be filled in by the orchestrator once the fix ticket exists.
