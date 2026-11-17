# Review 0.15 „Tour“ (2026-11-17)

Diff `origin/staging...origin/spec/622-tour` (tip b4ce6859). Release 0.14 is on `staging`, so the range is 0.15's own work. The Release spec is #622, with its tickets #646, #647, #460, #648, #649, #650. Per `docs/agents/release.md` § Review, step 1, three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#622, with tickets #646, #647, #460, #648, #649, #650);
- Quality (code quality and architecture).

Nothing was measured in a browser by the reviewers. The browser check is #651.

## Result

- **One finding is rated must fix:** Spec S1, the Rundgang's changelog line sits under a released section (`## [0.14.0]`) instead of `## [Unreleased]`. The fixes are ticket #785.
- The findings below keep the reviewers' IDs and tags. Each axis's IDs are its own: Standards S1 is not Spec S1.
- The orchestrator's triage is its own section at the end, verbatim.

## Standards axis

Release 0.15 „Tour“, tip b4ce6859 of `spec/622-tour`, product files of `git diff origin/staging...origin/spec/622-tour`. Sources read on the tip: `CODING_STANDARDS.md`, `GLOSSARY.md` (§ Tour, § Compibert), ADR 0007, 0013, 0015, 0017, `01-tokens.md`, `02-components.md`, `04-motion.md`, `17-rundgang.md`, plus the Fowler smell baseline of the code-review skill. All lines below were read on the tip's files.

No hard breach of a documented standard with a User-visible or safety effect. The documented homes are respected (`shared/tour.ts` for the rules, `requireUser`/`asRecord`/`parseTourVersion` on the routes, `greatest()` in SQL, migration with no index and with the switch-over reasoning, no room message, `motionMs`/`motionToken` for durations and eases, one GSAP request only with the face, `AppButton`, `NoticeBanner`, layer scale class `layer-modal`). Findings are all small.

### S1 (should-fix): the Profil button uses `disabled`, where the standard asks for `aria-disabled`

`app/components/SettingsCard.vue:84-93` passes `:disabled="tourResetting"` to `AppButton`. `02-components.md` line 10 („Disabled = `aria-disabled="true"`“) and line 121 („Disabled keeps focus (aria-disabled, click handler no-ops)“) say otherwise, and `AppButton.vue:4-5` says it too. AppButton styles only `aria-disabled:` (the one `disabled:` class is `pointer-events-none`), so the pending state has no look, and a native `disabled` on the focused button drops the keyboard focus out of the row. The codebase is mixed (`CountdownSheet`, `NextGamePicker`, `PriceField` also use `disabled`), but `ConfirmModal.vue:72`, `GameForm.vue:412` and `ProfileCard.vue:75` follow the standard, and the Profil page's own card should.
Fix: `:aria-disabled="tourResetting ? 'true' : undefined"` and `if (tourResetting.value) return` at the top of `resetTour` (SettingsCard.vue:15).

### S2 (should-fix): the build deviates from `17-rundgang.md` in places and records none of them

Every earlier Release writes a „**Deviation (0.x, #n):**“ line into the hand-off notes where the build differs (`02-components.md` 144, 238, 434, 894 for the rig's `excited`; `01-tokens.md` 75). `17-rundgang.md` on the tip has none, so the next reader of the note is told the opposite of the code:
- „All GSAP“ (the Rundgang table of § Additions to 04-motion) against `app/utils/tour-motion.ts:5` (Web Animations; allowed by ADR 0015, „new motion goes into `motion.ts` … unless it animates the rig“).
- „New rig state: none“ (line 5 of the note) against `app/utils/compibert-rig.ts:12` (`wave` is the ninth state; `compibert-rig.ts:2-3` says so).
- „scroll lock on the stage while open (only the tour scrolls it)“ against `TourLayer.vue:312-316` (`onScroll` lets a User's scroll through and re-places) and the test „follows the thing when the page is scrolled by the User“.
- „The thing gets `aria-describedby` → bubble body“: not set anywhere in `TourLayer.vue` (moot under `inert`, but unrecorded).
- Names and emits: `EventTour`/`done({skipped, at})` is `TourLayer`/`over(how)`; step keys `hallo`/`ende` are `greeting`/`end`; the start condition and the last step's „Überspringen“ (the two the notes call decided).
Fix: one „Deviation (0.15, #622)“ block in `17-rundgang.md` listing these, in the style of the 0.14 lines.

### S3 (should-fix): `glideScroll` has no test for its curve or duration

`CODING_STANDARDS.md` § Motion: „Its test asserts that easing and duration“. `app/utils/tour-motion.ts:116-131` glides the page over `bezier(IO_EASE, …)` for `motionMs('--cp-dur-slow')` (`TourLayer.vue:259`); `test/nuxt/tour-layer.test.ts:418, 687` pin only the last `scrollTo` (a known point). Every other Tour animation has its duration and easing asserted (586-756). The function takes `from, to, ms, scrollTo` and needs only a `requestAnimationFrame` stub.
Fix: a unit test that drives the frames: at `ms / 2` the value is `bezier(IO_EASE, .5)` of the way, at `ms` it is `to`, and `stop()` ends it.

### S4 (should-fix): an open „Verschieben“ popover on a desktop does not count as an open layer

`useOpenLayers` counts `useDialog` and `useDropdownMenu` only (`app/composables/useOpenLayers.ts:1-4`). `MoveToMenu.vue` on a desktop is a Teleported `layer-popover` (line ~75; below md it is an `AppSheet`, which counts), has its own Esc and press-outside close, and opens from a Member's own avatar on the Game board, the very thing the Tour points at. The start rule (spec: „no sheet, dialog, menu or Clip“, `shared/tour.ts:99-102`) then lets the Tour start over an open menu, and the popover (z 55) sits above the Tour layer (z 50) while the page behind is `inert`. The comment at `useOpenLayers.ts:3-4` excuses hover and pin popovers, not a click menu.
Fix: `useOpenLayers().track(toRef(props, 'open'))` in `MoveToMenu.vue`'s setup (the sheet branch then counts twice, harmless as it is one flag), with one case in `event-page-tour.test.ts`'s „waits while a sheet is open“ group.

### S5 (note): `CODING_STANDARDS.md` § One home per concern has no row for the Tour

Each earlier feature added its rows. New homes this Release creates: the Tour's steps, run and start rule (`shared/tour.ts`; `useTour` reads its inputs), the placement (`app/utils/tour-placement.ts`), the registry of open layers (`useOpenLayers`; any new overlay must `track` or the Tour starts over it, see S4), and the `data-tour` markers pinned by `test/nuxt/event-page-tour-markers.test.ts`. Fix: add those rows.

### S6 (note): small smells in the Tour code (judgement calls)

- Possible Speculative Generality: `TourPage.role` (`shared/tour.ts:22`) is passed by `useTour.ts:80` and read by nothing in `tourRun`; `tourMayStart` already carries the role. Drop the field until the Host tour (#462) needs it.
- Possible Mysterious Name / shadowing in `TourLayer.vue`: `findThing(step)` (line 65) shadows the computed `step` (line 26); `shown` (line 55) is the texts while `useTour`'s `shown` is a boolean; `run` (line 148) is a counter while `useTour`'s `run` is the step list.
- Possible Duplicated Code: `!element.closest('[data-tour-edge]')` appears at `TourLayer.vue:75` and `:88`.

### S7 (note): the reset toast promises a little more than the app does

`i18n/locales/de.json` `settings.tourResetDone`: „Der Rundgang startet beim nächsten Event, das du nicht hostest.“ `tourMayStart` (`shared/tour.ts:103-112`) does not start it on a finished Event, while a Session runs or until the page is calm. CODING_STANDARDS § Copy: „Copy promises only what the app does today.“ Goes to the wording sweep (#652): „… beim nächsten Event, das du nicht hostest und das noch nicht vorbei ist“ or drop the promise to „Der Rundgang ist zurückgesetzt“.

### Checked and fine

Migration 0035 (default 0, NOT NULL, no index: nothing filters on it; ADR 0007 reasoning in the file; test with old rows); `tour-seen` and `tour-reset` routes (parser, `greatest`, `SavedTourSeen`, no `changeEvent` since no Event changes); `userColumns` `satisfies` keeps `AuthUser` and the read in step; dev sign-in `?tour=unseen`; privacy text (§ Secrecy: new data stored per User is in the Datenschutzerklärung, #650); layer scale (`layer-modal`, no raw z-index); Tour motion durations and eases from tokens with Hell/Dunkel/System handled in `TourBubble.vue:144-156` and `CompibertRig.vue:167-176`; reduced-motion twins and their tests (`tour-layer.test.ts:672-760`); the rig's older users keep their behaviour (`applyLook` is a no-op until a look is given; `RIG_STATES.each` tests cover `wave`; `restTo` rests on gaze 0/0/0 by default); GSAP stays behind `loadGsap()` with the face (test at `event-page-tour.test.ts:301-311`); RETIRED words not used; i18n keys used dynamically are caught by the unused scan's `BUILT` pattern.

## Spec axis

Tip `b4ce6859` of `origin/spec/622-tour`, range `origin/staging...origin/spec/622-tour`. Spec source: #622 (stories 1-37, Implementation Decisions, Testing Decisions, Further Notes), tickets #646, #647, #460, #648, #649, #650 with their comments, the operator's decisions on #645, #648, #650, #622. Every file below was read on the tip (checked out detached in my own worktree). Nothing was run or measured.

### Findings

**S1 (must-fix): the Tour's changelog line sits in the released 0.14.0 section, not under `## [Unreleased]`.**
`CHANGELOG.md:10` (under `## [0.14.0] - 2026-11-16 – Politur`, `### Neu`). `[Unreleased]` at line 3 is empty, as on `origin/staging`. Concerns story 34 and #460's criterion "Changelog line under `### Neu`". The line was added (7d403ae8) before 0.14 was cut; the merge of `staging` (b4ce6859) took it without a conflict and left it in the 0.14.0 block. Effects: it rewrites a released Release's notes; the „Was ist neu“ pop-up (built from this file, `shared/changelog.ts`) lists it under 0.14.0, which every User has seen, so 0.15 does not announce the Rundgang; and `test/unit/changelog-file.test.ts` (#566: a Release section may not hold more items than on `origin/main`) should fail in CI. Smallest fix: move the bullet to a new `### Neu` group under `## [Unreleased]`.

**S2 (should-fix): the open-layers rule misses the desktop seat menu, so the start rule does not hold for every "menu".**
`app/components/MoveToMenu.vue:68-85` (the `Teleport` branch from md up) has no `useDialog` or `useDropdownMenu`, so `useOpenLayers` never counts it; only its phone branch (`AppSheet`) is tracked. It is opened from `BoardPerson` for every Member. Concerns #622 "no sheet, dialog, menu … is open", #647 "each condition on its own blocks the start". With the menu open, `layerOpen` stays false and the calm timer does not restart; any later change of `input` (a realtime refetch) can start the Tour over the open menu. Tests cover only the avatar menu and a sheet (`event-page-tour.test.ts:503-535`). Smallest fix: `useOpenLayers().track(toRef(props, 'open'))` in `MoveToMenu` (wide branch only, since the sheet is already counted), plus one case in `event-page-tour.test.ts`.

**S3 (should-fix, can go to #652): the Game board text during Team choice tells the User to act.**
`i18n/locales/de.json` `tour.boardOpen.text`: „Such dir jetzt ein Team aus: Zieh dich hinein oder tipp dich an und wähl eins.“ Story 20: the Rundgang "never asks me to vote, to take a seat or to type"; story 14 asks only for "that I can pick one now". The page behind is also `inert`, so the User cannot do it. Fix: state the possibility ("Du kannst dir jetzt ein Team aussuchen. …") and drop the drag and tap instruction.

**S4 (note): Compibert speaks in the first person only at the greeting.**
`tour.greeting.text` has „Ich zeige dir“; the other texts are impersonal („Hier steht …“, „Hier schaltest du …“). Story 22 and #648 ask for first person. Wording sweep (#652).

**S5 (note): the Datenschutzerklärung's „Stand“ was not moved.**
`de.json` `legal.datenschutz` §22 still says „Stand: 10. November 2026.“ while §6 changed; the file's `_scope` says to adjust the Stand on a change. The sentence itself equals the operator's approved wording (#650). Probably a step of the cut.

**S6 (note): a failed save keeps the client „seen“ for the whole SPA session.**
`app/composables/useTour.ts:86-100` (`over` writes `tourSeen` at once; `save` swallows the failure). Spec: "If saving fails, the Tour shows again at the next visit." It does after a reload, but not on the next Event reached by navigation in the same session. Tested and commented as chosen (`event-page-tour.test.ts:219`); noted for the operator.

**S7 (note): `17-rundgang.md` still states the behaviours the build did not take.**
Lines 26, 40, 69, 111 (ConnectionBanner „lost“ start condition, scroll lock, no „Überspringen“ on step 8, „All GSAP“). The decisions are on #460, but a reader of the hand-off note cannot see them. One-line "Built differently" block.

Known points judged: `disabled` instead of `aria-disabled` on #649's button (`SettingsCard.vue`, 3 lines) is a standards matter, not a spec criterion; no finding here. The real calm second in tests, the rAF glide, the static `TourLayer`, the missing Vetos and the two decided deviations are not spec findings. The rig additions are all demanded by the hand-off and default to the old behaviour (`look` null, `micro` true, `hopsFor` undefined, `gaze` starts at 0); no scope creep found. The „third Game board text“ is the operator's decision on #648.

### Stories

| Stories | Verdict | Where |
|---|---|---|
| 1-4, 8 (who, Host, finished) | met | `tourMayStart`, `useTour`; tests `event-page-tour.test.ts` |
| 5, 9 (existing Users, version) | met | migration default 0; `TOUR_VERSION` |
| 6 (calm page) | met with a deviation | S2 (wide MoveToMenu untracked); sheet, dialog, avatar menu, Clip, Was ist neu, Ceremony counted |
| 7 | met | starts after a Session ended in the mount |
| 10-13, 15-19 (the steps) | met | `MEMBER_TOUR`, markers; story 15 without Vetos is known |
| 14 | met with a deviation | operator's third text; S3 |
| 20 | not met | S3 |
| 21, 24, 25 | met | `TourSpotlight`, `placeTour`, resize/scroll follow |
| 22 | met with a deviation | S4 |
| 23, 28 (buttons, keys, Überspringen) | met | `TourBubble`, `TourLayer` |
| 26 (reduced motion) | met | cut, bubble fades only (hand-off) |
| 27 (SR, focus) | met | dialog, live region, `useDialog`; focus return is #651 |
| 29-32 | met | skip counts; Session start, tab close save nothing |
| 33 (Datenschutz) | met | §6 sentence = approved wording; S5 |
| 34 (changelog, pop-up) | not met | S1 |
| 35 | n/a here | #652 |
| 36 (steps as data) | met | second list tested |
| 37 (dev Users) | met | `server/dev/sign-in.ts`; tests |

### Tickets

| Ticket | Criterion | Verdict |
|---|---|---|
| #646 | tests: rises, never falls, reset, other User, signed-out, invalid version | met (`tour-seen.test.ts`) |
| #646 | dev sign-in test | met |
| #646 | migration, `db:generate` writes nothing | met by file and journal; not run |
| #646 | knip and typecheck | not run |
| #646 | no changelog line | met |
| #647 | steps, start rule, layer, Event page tests | met (`tour.test.ts`, `tour-layer.test.ts`, `event-page-tour.test.ts`) |
| #647 | not with a sheet open | met; menu case S2 |
| #647 | knip | not run |
| #460 | bubble parts, spotlight on head, dark page, reduced motion | met |
| #460 | placement at 390 and 1440, top, middle, bottom | met (`tour-placement.test.ts`, 12 cases) |
| #460 | rig not in the first load | met (`event-page-tour.test.ts:301-324`) |
| #460 | browser-check items | on #651 |
| #460 | changelog line under `### Neu` | not met (S1) |
| #648 | step presence, both Game board texts, tabs below 980, no run without a thing | met |
| #648 | Event page tests in poll, date set, running | met |
| #648 | each marker on its element | met (`event-page-tour-markers.test.ts`) |
| #648 | no changelog line here | met |
| #649 | row, reset and toast, failed reset | met (`settings-card.test.ts`) |
| #649 | Tour starts after a reset | met (`event-page-tour.test.ts:244`) |
| #650 | approved wording on the issue; sentence in §6 | met; S5 |

## Quality axis

Tip read: `origin/spec/622-tour` (b4ce6859), product files only. Read as `git show origin/spec/622-tour:<path>`; nothing was run or measured (no browser, per the notes). Line numbers are on the tip.

Overall: the seams are mostly right. The pure parts are pure and have homes of their own (`shared/tour.ts` for the rules, `tour-placement.ts` for the geometry, `tour-motion.ts` for Web Animations), `useOpenLayers` is a small, honest registry, the rig's additions leave the older users alone (see Q9), and the tests mostly observe what a User and assistive technology observe. `TourLayer` is not a pile of conditions, but it is a hand-rolled state machine held together by ten module-level `let`s; one real defect sits in it (Q1).

### Q1. ResizeObserver is re-armed on every commit, so each re-place triggers the next: a re-place every frame while the Tour is open (should-fix; must-fix if the browser check confirms it)

`app/components/TourLayer.vue:320-327` (`watchThing`) does `observer.disconnect()` and `observe(document.body)` / `observe(element)` every time it runs. A fresh `observe()` always delivers one initial notification (the last reported size starts at 0 x 0). `watchThing()` runs at the end of every `replace` (line 305), of `start` (189) and of every `change` (243, 279). The chain is: RO callback -> `replace(true)` (line 322) -> rAF -> `place` -> `commit` -> `watchThing()` -> disconnect and observe -> an initial notification next frame -> `replace` again. So once the first step is placed, the layer re-measures, re-places and re-renders on every frame for as long as it is open (layout reads, `run += 1`, a new `placement`/`hole` object each time), and the Tour is the page's only job at that moment. It stays hidden in the tests because happy-dom has no `ResizeObserver` (`typeof ResizeObserver === 'undefined'` returns at line 321) and no test stubs one: the whole observer path, including `watchThing`'s three call sites, is untested.
Smallest fix: observe `document.body` once (in `listen()`, disconnect in `unlisten()`), and in `watchThing` only `unobserve` the previous thing and `observe` the new one (`observe` on a target already watched does nothing). Add a test with a stub `ResizeObserver` that counts `observe` calls and fires its initial callback. Confirm in #651 with a frame count or a Performance trace on the open Tour.

### Q2. Two homes for the face's and tail's numbers (should-fix)

`app/utils/tour-placement.ts:9-12` (`TOUR_LAYOUT`: `S`, `faceL`, `faceT`, `faceZone`, `tail`, `sh`) are the numbers the placement computes with (tail clamps, the `faceDir` centre, the face zone that moves the bubble left). The same numbers are typed again in `app/components/TourFace.vue:18` (`56 : 72`) and 33 (`'8px' : '14px'`, `'-16px' : '-20px'`), in `app/components/TourBubble.vue:36` (`TAIL_SIZE = { wide: 20, narrow: 16 }`), in `TourBubble.vue` `ml-[54px]`/`ml-[72px]` and `drop-shadow(10px 10px ...)`, and 400/24 in `tourBubbleWidth`. A change to the face size or tail in one place silently skews the gaze angle or the tail clamp in the other, and no test links them.
Smallest fix: export `tourLayout(narrow)` from `tour-placement.ts` and have `TourFace` and `TourBubble` read size, offsets and tail from it (the `ml-` and `drop-shadow` can bind to the same values through `:style`).

### Q3. Two owners of "the Tour was seen" on the client, two copies of the same state write (should-fix)

`app/composables/useTour.ts:98-109` (`over` / `save`) and `app/components/SettingsCard.vue:17-31` (`resetTour`) each write `user.value = { ...user.value, tourSeen: ... }` and call one of the two `/api/me/tour-*` routes with their own try/catch. The codebase already has the shape for this: `useNewsSeen` (the `markSeen` function, `seenAfter`, "never lowered") and `useAppearance`. A `useTourSeen()` with `markSeen()` and `reset()` would own the number, the optimistic write, the "never lowered" rule (today only in `Math.max` inside `over`) and the failure policy, and `SettingsCard` would shrink to a button plus `failed`. This is the one place where logic that has a canonical home elsewhere is repeated in a component.

### Q4. #649's reset button is `disabled`, not `aria-disabled` (should-fix; the known point, judged)

`app/components/SettingsCard.vue:87` uses `:disabled="tourResetting"`. `AppButton.vue:5` states the rule (disabled-with-reason is `aria-disabled`, still focusable) and gives only `aria-disabled` a look (line 35: the dashed look), so the natively disabled button changes nothing visually, and a keyboard User who pressed it loses the focus to the body in browsers that blur a disabled button. Precedent in the codebase is mixed (`ConfirmModal.vue:72`, `GameForm.vue:412`, `GameImageField.vue:321` use `aria-disabled`; `CountdownSheet.vue:84`, `PriceField.vue:163` use `disabled`), so this is not a break from the norm, but the component's own comment and the spec (`02-components.md`) choose `aria-disabled`.
Smallest fix: `:aria-disabled="tourResetting || undefined"` and `if (tourResetting.value) return` at the top of `resetTour` (aria-disabled does not stop the click).

### Q5. `TourLayer`'s control flow lives in ten module-level `let`s and three copies of "commit, scroll, watch" (note, the main deep-module question)

`TourLayer.vue` is 469 lines, about 390 of script. The geometry and the motion are already out in `tour-placement.ts` and `tour-motion.ts`, so what is left is orchestration, and it holds together: the `run` token (line 154) makes every async path check `mine !== run`, `settle()` (lines 160-169) is the one place that stops timers, animations and the glide, and I found no timer or listener that is not cleared on `settle`, `close` or `onBeforeUnmount` (listeners: `unlisten` and the document keydown; the exit: `tourExit` resolves its `finished` on cancel because each animation's `finished` rejection is caught, so `close()` does not hang on `cancel()`). I traced these races and found them correct: finish during a change (settle, then `close` bumps `run`); close during `place` (`mine !== run`); reopen during the exit (`start` cancels `exit` before bumping `run`); resize during a change (`replace` returns on `changing`); the calm second against the end (the latch `done` and the check `tourMayStart({ ...now, calmFor })` in `useTour`).
The cost is legibility: the state is `at`/`shownAt`/`measuring`/`waiting`/`mounted`/`narrow`/`bubbleWidth` (refs) plus `run`, `changing`, `byUser`, `keep`, `frame`, `ownScroll`, `observer`, `listening`, `inDom`, `exit`, `timers`, `plays`, `stopGlide` (lets). `start` (170-192), the unanimated branch of `change` (236-248) and `replace` (301-306) each repeat `commit` + `scrollNow` + `nextTick` + `watchThing()`; `place` (97-123) also writes reactive state (`measuring`, `bubbleWidth`, `narrow`), so a function that reads like a measurement has three side effects. See the architecture candidates.

### Q6. The start rule doubles as the end rule through a faked argument; `calmFor` is a boolean typed as a number (note)

`shared/tour.ts:103-112` (`tourMayStart`) is documented as "the start rule, and the rule that ends a shown Tour", and `useTour.ts:70` gets the end rule by calling it with `calmFor: TOUR_CALM_MS` to cancel the calm term. In `useTour.ts` the ref `calmFor` (line 38) only ever holds `0` or `TOUR_CALM_MS` (line 54: `calmFor.value = TOUR_CALM_MS`); the timer is the clock, the number carries one bit. Smallest fix: a `tourStillHolds(input)` (everything but the calm term) that `tourMayStart` extends with `calm: boolean`; drop `calmFor` from `TourStartInput`. This also removes the spread-override at line 70.

### Q7. Tests: they pin behaviour, but two of them reach into implementation and the suite pays real seconds for the calm second (note)

`test/nuxt/tour-layer.test.ts` and `event-page-tour.test.ts` observe text, roles, keys, focus, hole and bubble places, and recorded `Element.animate` calls; the animation numbers are the hand-off's, so pinning them is a deliberate spec pin, not an implementation leak. Points:
- `event-page-tour.test.ts:~140` resets `useState('open-layers').value = 0`: the test knows the registry's state key. Reset through `useOpenLayers` or unmount cleanly instead.
- The calm second is real (`past()` sleeps `TOUR_CALM_MS + 400`, line ~97) in every negative case, about 1.4 s each across 15 or more cases, plus `vi.waitFor(..., { timeout: 800 })` for the 150/300/520 ms change timing in `tour-layer.test.ts`. A `calmMs` option on `useTour` (default `TOUR_CALM_MS`) would let a test pass 20 ms without fake timers.
- Gaps against the races: no layer-level test for `open` going false in the middle of a change (the timers are cleared by `close`, but nothing pins it), a reopen during the exit, or a `ResizeObserver` (Q1). No test that every `MEMBER_TOUR` id has `tour.<id>.title` and `.text` in `de.json` (a missing key would show a raw key; the page walks cover only the ids a run reaches).

### Q8. `useDialog` carries a `tracked: false` option for exactly one caller (note)

`app/composables/useDialog.ts:13-15`: the Tour's layer needs to not count itself, so a generic composable gained an option. It is small and documented, so acceptable. The alternative that deletes the option: `useOpenLayers` could ignore a layer by ref (`track(open, { ignoredBy })`) or `useTour` could subtract its own `shown`: `busy.value && !shown.value`... but the subtraction is wrong when another layer opens mid-Tour. Leave it.

### Q9. The rig's additions leave the older users alone (note, the notes' ask)

I read the diff of `app/utils/compibert-rig.ts` and `CompibertRig.vue` from the ceremony's and the wheel mascot's side. `look: null` and `micro: true` are the defaults, `applyLook` returns early for a rig never asked to look (`CompibertRig.vue` `looked` flag), and `restTo` writes the pupils to `gaze` (0, 0 until a look is set), the same as before. The new `neck` tween in `restTo` runs only under `pupilsMoved` and only if `compibert-neck` exists (`some(p.neck)`), so older states change nothing. `landCall` is in `owned()`, so it is paused, resumed and killed with the rest (`destroy` kills `owned()`), and `toState` kills it before a new state. `wave`'s endless timeline is a child of the state timeline, so the reduced-motion hold (`pause(0)` of children with `repeat() === -1`) reaches it. No finding.

### Smaller notes (checked on the tip)

- Q10. `TourLayer.vue:75-78`: `getComputedStyle(element)` is read twice; read once. Trivial.
- Q11. `TourLayer.vue:126-130`, `onScroll`: `ownScroll` is never reset (not at `start`, not at `close`), so a User scroll that lands within 1 px of the last own target is read as the layer's. Reset it in `start` and when the glide ends.
- Q12. `TourLayer.vue:201-215` (`go`) does not wait for the first `place`: ArrowRight in the first ~50 ms bumps `run`, so `start` returns without `tourEnter`/`watchThing`, and the first step appears with no entry animation. Cosmetic and rare; guard with `if (!placement.value) return`.
- Q13. `tour-motion.ts:11-14` repeats the easing fallbacks that `motion.ts` already spells out (e.g. the pop curve in `motion.ts:35,43,52` and `tourTick`). Cheap to share as constants if `motion.ts` grows more.
- Q14. `EventPoll.vue` (143 changed lines) is mostly a re-indent into one wrapper `div` so that `data-tour="poll"` can cover heading to grid. The wrapper needs the second `flex flex-col gap-3.5` to keep spacing, and the section still holds the compact toggle outside it. Correct and tested (`event-page-tour.test.ts`), but a smaller diff would give the existing `<section>` the marker and move the compact button inside the wrapper's logic; not worth a re-do.
- Q15. `data-tour` / `data-tour-anchor` values are string literals in eight components and `MEMBER_TOUR`; `event-page-tour-markers.test.ts` checks each target against the DOM, which is the right guard. A `TOUR_MARKS` const would give typos a compile error; not needed while the marker test exists.

## Architecture candidates

1. Tour stage controller (worth exploring). Pull `place`, `findThing`, `readThing`, `readAnchor`, `watchThing`/listeners, the `replace` rAF coalescing, `ownScroll` and the glide into `useTourStage(steps, shownAt)` returning `{ placement, hole, narrow, bubbleWidth, measuring, place, follow, stopFollowing }`. `TourLayer` then owns only the step machine (`at`, `shownAt`, `changing`, `run`) and the template. Deletion test: removing it would spread the DOM measuring and following over the layer again, so it concentrates complexity. The interface is the test surface: a test of the stage needs a stub `ResizeObserver` and rects, which fixes Q1's blind spot. Locality: Q1, Q11 and the three copies of "commit, scroll, watch" end up in one module.
2. Change choreography as one function in `tour-motion.ts` (worth exploring). The 150/300/520 ms timers, `plays`, `waiting` and `stopGlide` (lines 249-280) are the note's table written as callbacks. A `playChange({ bubble, spot, from, to, scroll, side, onSwap, onArrive }): TourPlay` with a single `cancel()` would remove `timers`, `plays` and `stopGlide` from the layer, leave `settle()` as one `cancel()`, and let the table be tested without a component. Leverage: `tourExit` already has this shape (`TourPlay`), so `close` and `change` would use one idea.
3. `useTourSeen` (strong, small): Q3. One owner for the stored number, `markSeen`/`reset`, shared by `useTour` and `SettingsCard`, like `useNewsSeen`.
4. `tourLayout(narrow)` as the single source of the bubble/face/tail geometry (strong, small): Q2.
5. Speculative: the hidden twin (`measure` TourBubble with a `measuring` index) exists to read a height before the bubble is swapped. A pure `estimateBubbleHeight` would not match fonts; keep the twin, but name the pair (`place`'s three state writes) as one `measureBubble(index)` so `place` stops writing refs.

No ADR conflict seen; ADR 0015 (motion in `motion.ts` and neighbours, GSAP only for the rig) is followed: `TourLayer` is static, GSAP arrives with the face, and `tour-motion.ts` uses Web Animations.

## Triage (the orchestrator, 2026-11-17)

One must-fix, and it is the orchestrator's own: Spec S1. The Rundgang's changelog line was added to `## [Unreleased]` before 0.14 was cut; the cut renamed that section, and the merge of `staging` into `spec/622-tour` (b4ce6859) went through without a conflict and left the line under `## [0.14.0]`.

**Taken, as ticket #785** (one fix branch off `spec/622-tour`, before the integration PR #660 merges):

- Spec S1: the changelog line moves under `## [Unreleased]`.
- Standards S4 and Spec S2: the „Verschieben“ popover counts as an open layer.
- Standards S1 and Quality Q4: the Profil row's button uses `aria-disabled` and guards against a second call.
- Quality Q1: `watchThing` no longer re-observes on every commit. Read on the tip by the orchestrator: every `commit` ends in `watchThing`, which disconnects and observes again, and a `ResizeObserver` delivers a first callback for each new `observe()`. The Release's re-check measures it (#785, browser-check item 1).
- Quality Q2: one home for the bubble's and the face's numbers.
- Quality Q3: one composable writes `tourSeen`.
- Standards S3: a test pins the glide's duration and curve.
- Standards S2, Spec S7 and Standards S5: Deviation lines in `17-rundgang.md`, the Tour's homes in `CODING_STANDARDS.md`.

**To the wording sweep (#652):** Spec S3 (`tour.boardOpen.text` asks the User to act, against story 20), Spec S4 (only the greeting speaks in the first person, story 22), Standards S7 (the toast `settings.tourResetDone` promises more than the start rule gives), and the build's own note that „So wird gespielt“ names no Vetos (story 15).

**For the cut:** Spec S5: the Datenschutzerklärung's „Stand“ date still reads 10. November 2026, though §6 gained the Rundgang's sentence (#650). It moves to the Release's date at the version cut; noted in the comment „For the Release PR“ on #622.

**Not taken:**

- Spec S6 (after a failed save the client stays „seen“ until a reload): the Tour comes back on the next load, which is what #646 asks.
- Standards S6 (small smells), Quality Q5 to Q15 (notes), Quality Q6 (`tourMayStart` as the end rule): no behaviour depends on them.
- The architecture candidates (a Tour stage controller out of `TourLayer`, the change choreography as one `playChange`): worth doing when a second Tour is built (the Host's, #624), not for one Tour.
