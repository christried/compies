# Review 0.9 „Siegerehrung“ (2026-11-08)

Diff `v0.8.0...c72bb24`, the tip of `feat/308-siegerehrung`, the integration branch of spec [#308](https://github.com/christried/compies/issues/308). It is a one-spec Release, so per `docs/agents/release.md` § Review, walk-through, retro, this review ran on the integration branch, and its fixes land before PR #318 merges into `staging`. Three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#308 with #309, #311–#315);
- quality with architecture.

Before the review, a browser check `c3` on `762e395` had one FAIL: the share row covered Compibert at 390 px (#314). It is fixed in `c72bb24`.

## Result

- **No Must-fix on any axis.** The start and the end of the ceremony, the Tie, the Share image, secrecy, the migrations 0024 and 0025 and the switch-over hold. See each section's „Checked and sound“.
- **Shared findings:** the Tie's tracks re-type timeline numbers (S2, Q1); the dot's 11 px is counted only in a Tie (S3, SPEC-6, Q10); `startCeremony` reads the Standings before it refuses (S10, SPEC-4, Q7); the stale bake header (S8, SPEC-7, Q8); the key-based watch (S7, SPEC-8, Q9).
- **The Spec axis alone** found the end frame waiting for the GSAP chunk (SPEC-1) and a cold replay losing its start (SPEC-2).

### Fixed before `staging`

| | Finding | Fix | Branch |
|---|---|---|---|
| F1 | SPEC-1 | The end frame never waits for GSAP: under reduced motion no chunk is loaded; a skip while it loads shows the end frame at once; a missing part or a build that throws falls back like a failed chunk. Compibert stands at his stop there without GSAP. | `fix/308-review-client` (`sonnet`), merged `c72f8fa` |
| F2 | SPEC-2 | A replay waits for the chunk before it stamps its zero, so a cold page plays the show from its start. | same |
| F3 | S7, SPEC-8, Q9 | The key-based watch stays; its comment says what the rebuild does that `watch(elapsed)` does not; a test fails without the rebuild (the stage measured again). | same |
| F4 | S2, Q1 | The Tie's hop, row and chip steps come from `shared/ceremony.ts`. | same |
| F5 | S1 | `CODING_STANDARDS.md` § Motion names GSAP's named eases inside the timelines; `ceremony-run-tweens.test.ts` reads ease and duration off the built run. | same |
| F6 | Q2, SPEC-5 | A test joins the grid rule's two homes: the client never ends after the stored end (Party counts 2–8, every Winner count, both widths and gags). | same |
| F7 | S4 (drift) | Checked against the artboard: the grid stack differs by design (no ring, no name, overlap, 0.4 „+N“); a comment says so. No change. | same |
| F8 | S3, SPEC-6, Q10 | The wide chip row counts the dot on every chip, as the renderer draws it; a single Winner's long game names no longer clip (PNG looked at). | `fix/308-review-server` (`haiku`), merged `a3074cc` |
| F9 | S10, SPEC-4, Q7 | A start is refused (`not_host`, `wrong_phase`) before the Standings are read. | same |
| F10 | S8, SPEC-7, Q8 | The bake script's header names `getItemRaw` via `SHARE_SVGS`. | same |

## Follow-up, not this Release

[#319](https://github.com/christried/compies/issues/319) collects the architecture candidates and judgement calls: Q3/S6 (the run's shape as one object), Q2 (one home for the grid rule), Q6, Q11, Q4/S16, S4 rest/Q13, Q5/S12/S13, S5, S15, Q12, S14, S10's every-read Standings.

## Decisions and notes

- **Decided by the user (2026-11-08):** SPEC-11: „Nochmal ansehen“ keeps its copy; the end frame keeps both buttons secondary; the Datenschutzerklärung names the result picture and the ceremony's start (`959edff`, #313).
- **Notes, no action:**
  - S9 / SPEC-3: notes 1 and 5 hold.
  - S11 / SPEC-12: secrecy holds.
  - SPEC-9: migrations 0024 and 0025. 0025 is additive. 0024 (#286) deletes rows and replaces a primary key, and the wire rename `pools` → `pool` is a break for a 0.8 tab open across the deploy. The Release PR names both.
  - SPEC-10: other tickets riding the Release (#283–#288, #247, tooling).
  - S17, S18: the dev sign-in's guard is the build-time `carriesDevSignIn`, #247's design, pinned by `test/build/dev-sign-in.test.ts` and `test/unit/stage.test.ts`.

## Standards review

Count: **0 Must-fix, 6 Should-fix, 12 Note.** No hard violation bites. Where a standard is plainly broken, the cost is a false comment or a test gap.

- **S1** Should-fix, fixed by F5. The ceremony's motion has no test for ease and duration, and the claimed deviation from § Motion is in two comments but in no ADR. `app/utils/ceremony-run.ts:9`, `test/nuxt/ceremony-layer.test.ts:16-17`. The values match 04-motion.
- **S2** Should-fix, fixed by F4. The Tie's tracks hard-code `HOP_MS`, `CEREMONY_ROW_MS`, `CHIP_MS` and `CHIP_STEP_MS`. `app/utils/ceremony-tie-run.ts:144-145, 172`.
- **S3** Should-fix, fixed by F8. The wide chip row counts the dot only in a Tie. `shared/share-image.ts:377`. A clip is possible; low confidence, checked by a PNG.
- **S4** Should-fix, F7 (no change) and #319. The person cell is copied three times in `AwardCeremony.vue` and has drifted (`:team` on two copies only; „+N“ factor 0.3 and 0.4).
- **S5** Should-fix, #319. A third copy of the Team-name fallback (`shared/share-image.ts:339`); the clamp to 1–8 sits in three places plus a bare `8` (`shared/team-colors.ts:16`, `shared/team-marks.ts:15`, `TeamMark.vue:17`, `app/utils/share-image.ts:51`).
- **S6** Should-fix, #319. `(partyCount, gag, winners, grid)` travels as positional numbers (`shared/ceremony.ts`, `CeremonyLayer.vue:51`, `app/utils/ceremony-tie-run.ts:105-110`).
- **S7** Note, fixed by F3. The key-based `watch` (`CeremonyLayer.vue:201`) is a cheap guard, not dead weight.
- **S8** Note, fixed by F10. The bake header (`scripts/bake-compibert.mjs:3`) names `getItem`; the code uses `getItemRaw` (`server/utils/share-assets.ts:74`).
- **S9** Note, holds. The client's `ended` is never later than the stored `endsAt`.
- **S10** Note, fixed by F9. `startCeremony` reads the Standings before the refusal (`server/utils/ceremony.ts:41`). The every-read Standings in `ceremonySection` is in #319.
- **S11** Note, holds. Secrecy and migration 0025.
- **S12** Note, #319. `shareImageCopy` mirrors the whole copy tree (`app/utils/share-image.ts:21-60`).
- **S13** Note, #319. `shareImageModel` is about 110 lines and branches on `shape` five times; a magic `22` at `shared/share-image.ts:317`, `'#fffdf8'` at `:372`.
- **S14** Note, #319. The breakpoint `useMediaQuery('(min-width: 48rem)')` sits in `AwardCeremony.vue:25` and `CeremonyLayer.vue:48`.
- **S15** Note, #319. The Share dialog's error line bypasses `apiErrorKey` (`useShareImage`, `ShareDialog`).
- **S16** Note, #319. `CompibertRig.vue` and `rigMarkup` repeat `Compibert.vue`'s four steps; documented and accepted in `compibert-rig.ts` (#311).
- **S17** Note, no action. `test/nuxt/ceremony-layer.test.ts` is 1704 lines (99 cases).
- **S18** Note, no action. `server/dev/sign-in.ts` lost its own `NODE_ENV` guard; the defence is now `carriesDevSignIn` (`nuxt.config.ts`).

### Checked and sound (Standards)

- **One home per concern.** `changeEvent` with `hostOnly`, `lock: 'update'`, `allowFinished: true`; no `.transaction(` in the new `server/api/e/**`; `startCeremony` takes `now` from `ChangeCore`; `randomInt` is injected; dates use `berlinDay`; the dock's reason reuses `ceremonyRejection`.
- **Request input.** The `format` query goes through `parseShareFormat(unknown)`; `pools` is refused by `assertNoOldPools` before anything is written; the ceremony POST takes no body.
- **Database.** The enum `ceremony_gag` belongs to one concept; nothing filters on the new columns, so no index is owed; the CHECKs encode „both set together, only in a finished Event“; the migration header covers the switch-over (ADR 0007).
- **Motion.** All 6b and 6b-T eases and durations match 04-motion; `reduced` is respected; timelines are paused and moved by `time(elapsed)` from the server clock; at most one full-body rig animates.
- **ADR 0015.** GSAP is imported at runtime only in `app/utils/gsap.ts` and in the Node bake script; `test/build/gsap-lazy.test.ts` guards the chunk.
- **Copy and glossary.** Award ceremony, Winner and Share image match the code; Compibert is not named in any copy.
- **Data and docs.** `docs/agents/*`, `scripts/worktree-clean.mjs` and `scripts/ci-wait.mjs` contain no personal data.

## Spec review

Count: **0 Must-fix, 2 Should-fix, 10 Note** (SPEC-3 to SPEC-12).

- **SPEC-1** Should-fix, fixed by F1. The end frame stays invisible until GSAP loads, also under reduced motion and on „Überspringen“; a missing part or a thrown build leaves the layer blank for good (`app/components/CeremonyLayer.vue:169-195, 318`, `:181`).
- **SPEC-2** Should-fix, fixed by F2. A replay stamps its zero before the chunk loads, so the first stretch of a cold replay is skipped (`CeremonyLayer.vue:84-100`).
- **SPEC-3** Note, holds. The client's `ended` never comes after the stored `endsAt`; a phone's grid of 3 ends up to 1.7 s early, and only the dock's re-enable waits on the stored end.
- **SPEC-4** Note, fixed by F9. `server/utils/ceremony.ts:39-44`.
- **SPEC-5** Note, fixed by F6 (the test). The Winner count has two derivations (`server/utils/ceremony.ts:41`, `server/utils/stage-read.ts` `ceremonySection`); one helper is in #319 (Q6).
- **SPEC-6** Note, fixed by F8. The single-Winner chip count undercounts the dot (`shared/share-image.ts:377`).
- **SPEC-7** Note, fixed by F10. The bake header (`scripts/bake-compibert.mjs:1-3`) is stale.
- **SPEC-8** Note, fixed by F3. Keep the key-based watch.
- **SPEC-9** Note, notes above. Migrations 0024 and 0025; the Release PR names both.
- **SPEC-10** Note, notes above. Bundled tickets, and small behaviour no ticket asked for: „Nochmal ansehen“ hidden under reduced motion and after a failed chunk, Escape closing the layer, pictographs stripped from Team names on the Share image.
- **SPEC-11** Note, decided by the user (see above).
- **SPEC-12** Note, holds. Secrecy per audience (see above).

### Checked and sound (Spec)

- **Schema and rules.** Columns, enum and CHECKs; the 1.5 s lead; `ceremony_running` (409) with its German message; the rejection order; a start is allowed exactly at the end; the gag is random first, then alternates; a restart overwrites both.
- **Server.** Host-only through `changeEvent` with `lock: 'update'` and `allowFinished`; no Activity entry; `ceremony` is null before the first start.
- **Layer.** Opens by itself from the start instant, in any tab and on scroll; a late joiner lands in the right place; close and skip are per start and per viewer; confetti only for a stamp seen live; the live region speaks at the stamp, or at once on skip and under reduced motion; focus goes in and comes back.
- **Watching again.** The button exists only after a first start; a replay sends no request and uses the read's gag; a Host's new start takes over.
- **Tie.** Chain or grid by screen; every Party wins; the copy is plural; rows drop by wrap.
- **Share image.** Access and status order; `private`; formats other than the three give 400; the model rules for date, size steps, rows, chips, alt text and the shared first place.
- **GSAP.** Only through `loadGsap()`; the manifest hook removes the prefetch hint; no preload for an ended ceremony.

## Quality and architecture review

Count: **0 Must-fix, 3 Should-fix, 10 Note.**

- **Q1** Should-fix, fixed by F4. The Tie re-types `HOP_MS`, the row and chip steps (`app/utils/ceremony-tie-run.ts:172`). The same family (`800` and `2200` in `shared/ceremony.ts`, `t1 + 0.92` in `ceremony-run.ts`) is not in F4.
- **Q2** Should-fix, F6 (the test) and #319 (one home). The grid rule has two homes: the default `winners >= 4` in `shared/ceremony.ts` and `ceremonyLayout` in `app/utils/ceremony.ts`.
- **Q3** Should-fix, #319. The run's shape is no type: `partyCount` and `winners` are bare `number`s in `ceremonyTimeline`, `ceremonyEndsAt` and `ceremonyRigState`.
- **Q4** Note, #319. `app/components/CeremonyCompibert.vue` is a 17-line pass-through wrapper.
- **Q5** Note, #319. The Share image's copy is a third message format (`shared/share-image.ts`, `app/utils/share-image.ts`).
- **Q6** Note, #319. The Winner count of a finished Event is derived at three call sites.
- **Q7** Note, fixed by F9. `startCeremony` reads the Standings before it knows it will not refuse (`server/utils/ceremony.ts`).
- **Q8** Note, fixed by F10. The bake header is stale.
- **Q9** Note, fixed by F3. The in-place arm of the key-based watch is unproven and its comment overclaims.
- **Q10** Note, fixed by F8. `several ? DOT_PX : 0` forks a geometry estimate on Tie-ness, not on whether the chip has a dot (`shared/share-image.ts`).
- **Q11** Note, #319. `CeremonyLayer.vue` (367 lines) holds three modules; the playback latch could be a composable.
- **Q12** Note, #319. `eventPageState` takes `isHost` for a Members-only block, and the dock spoofs it (`app/utils/host-dock.ts`).
- **Q13** Note, #319. The Tie's size tables sit in `AwardCeremony.vue` (561 lines), untested.

### Checked and sound (Quality)

- **Note 1.** `partyCount` equals the server's `settings.teamCount`; `winners` is `leadersOf(standings)` on both sides; `ceremonyTimeline(…, true).endMs` is never later than the default for 2–8 Winners and both gags (`ceremony.test.ts:151`).
- **Note 5.** The stored end drives only the ticker's stop, the latch that opens the layer, the viewInstants refetch and the dock's disabled state. None of it draws on the stage.
- **Migration 0025.** Additive: nullable columns, a nullable enum, two CHECKs that NULL satisfies. The 0.8 code never writes them.
- **ADR 0015.** Only `app/utils/gsap.ts` imports `gsap` at runtime in `app/`.
- **Sizes.** No file crosses 1k lines. `EventPage.vue` went from 503 to 335 lines by extracting `EventStage.vue`; `useHostActions` lost its 14-handler mirror.
- **Pure rules stay pure and shared.** `ceremonyRejection`, `ceremonyPlays`, `nextGag`, `ceremonyModel`, `ceremonyLayout`, `shareImageModel` are functions of data with unit tests; `shared/finish.ts` and `shared/phase.ts` break an import cycle.
- **Share image route.** `loadEvent` gives non-Members the same 404 as the Event read; `wrong_phase` comes before the format check; games go only through `resultsSection`.

## Still owed

- Browser check `c4`: the share row, the static end frame under reduced motion, a cold replay, and a skip while the chunk loads.
- The staging checks of #309 and #313 (the session-3 handoff list), then each ticket verified on staging and closed.
