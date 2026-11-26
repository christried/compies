Release review of 0.23.1: `v0.23.0...spec/927-auftritt-0.23.1`, tip 5934ba5c (2026-11-26). Two `sonnet` reviewers; no must fix. The fixes taken are #1013.

# Release review 0.23.1

## Standards

## Standards review, COMPIES 0.23.1

Diff: `v0.23.0...origin/spec/927-auftritt-0.23.1` (tip 5934ba5c). Axis: Standards only (`CODING_STANDARDS.md`, `docs/agents/release.md`, ADRs, `GLOSSARY.md`, plus the smell baseline). Read-only; the design files of #930 and #932 are not reviewed. Nothing under "decided" is rated.

Overall: the diff follows the documented structure closely. The new CODING_STANDARDS rows for the stage smoke and the edge name their homes, files and tests. No `v-html`, no second copy of a Secrecy surface (the smoke reads instants only), no hard-coded colours or px in the new CSS, and the shell keeps its classes without the slot. Findings below are judgement-level except the first two.

### Must fix

None.

### Should fix

#### 1. No CHANGELOG line for #933 (the Theme reveal's edge)
`CHANGELOG.md:5-8` (the `[Unreleased]` / `### Neu` block holds one bullet, for #675 only).
#933 changes what Users see: the circle of the Appearance change now has a cream line and an ink shadow. `docs/agents/release.md` § Changelog lines: "A PR with a change Users can see adds its lines under `## [Unreleased]`", and on an integration branch the orchestrator writes the line into the merge commit. `git log` shows the merge of `feat/933-theme-edge` (5934ba5c) with no line. Add a `### Neu` or `### Geändert` bullet with the `([#933](...))` link, in plain German, before the cut.

#### 2. The motion tests do not assert the easing and duration of the smoke
`test/nuxt/stage-smoke.test.ts:87-99` (drift) and `:101-112` (dim); source `app/components/StageSmoke.vue:56-58` and `:65` (the `--smoke-drift` value).
`CODING_STANDARDS.md` § Motion: "Its test asserts that easing and duration, as well as that something animated." The drift test checks keyframes, leg seconds and delay, but never `var(--cp-ease-io)`. The dim test checks only `opacity-50` / `opacity-100`, not `dur-slower ease-out` / `dur-slow ease-in`. A change to `ease-in` or `linear` would pass every test. For the edge, `test/unit/theme-edge-css.test.ts:19-26` only asserts that the tokens appear somewhere in the block (`toContain`), not that the disc animation is `--cp-dur-slower` on `--cp-ease-io` and the shadow on `--cp-ease-linear`. That is weaker than `test/nuxt/theme-reveal.test.ts:149-160`, which pins the circle's duration and easing.

#### 3. The smoke's wheel window copies the wheel's removal instant
`app/utils/stage-smoke.ts:11-12` (`SPIN_TAIL_MS = 2200`) and `:20`.
`app/utils/wheel.ts:27` and `:90` already hold this number (`REMOVE_AFTER_MS = 2200`, `removalStart(spin, hidden)`). `CODING_STANDARDS.md` § One home per concern ("a second copy is a finding even when it works"; a Draw's instants have their home in `shared/draw-timeline.ts` / `app/utils/wheel.ts`). A change to the wheel's timing would leave the smoke on the old moment. Call `removalStart(wheel.spin, false)` for `to`, or export the constant. The same holds in a weaker form for `VETO_REVEAL_MS = 1200` (`:14`): no home for the reveal's length exists yet, so name its source in the comment or put it next to the reveal's other numbers.

### Nit

#### 4. The edge's timing now lives in two places
`app/assets/css/compies-theme.css:221-232` against `app/utils/theme-reveal.ts:92-96`.
The CODING_STANDARDS row calls `revealTheme` "the one place of the timing", but the edge's disc and shadow run on `var(--cp-dur-slower)` in CSS while the clip runs on `motionMs('--cp-dur-slower')` in script. They stay in step only through the shared token and the `is-running` start. The row (`CODING_STANDARDS.md:73`) should say so ("the edge's timing is the same token in CSS"), or the test in item 2 should pin both. Not a bug.

#### 5. `revealTheme`'s optional `to` is speculative
`app/utils/theme-reveal.ts:70-76` (`to?: 'light' | 'dark'`, "without it the circle has none"). Smell: possible Speculative Generality. The only production caller, `app/composables/useAppearance.ts:96`, always passes it; the edge-less branch exists for the old tests. Make it required, or leave it and accept the extra branch.

#### 6. Header height as a literal; the stage's condition repeated
`app/components/StageSmoke.vue:55` uses `top-[calc(3.5rem+var(--cp-bw))]`. `AppHeader.vue:64` has `h-14 md:h-header`, so the mobile 3.5rem is the same literal in two files, while the md side uses `--cp-header-h`. Possible Duplicated Code; a mobile header token would be the home. Also `app/components/EventPage.vue:345` and `:356`: the condition `data && pageState && (wide !== false || activeView === 'event')` appears twice (smoke and stage); a computed `stageShown` keeps the smoke from drifting off the stage.

#### 7. A test regex that reads the whole stylesheet
`test/unit/theme-edge-css.test.ts:34-36` asserts that no `.line` or `.shadow` selector exists anywhere in `compies-theme.css`, though the comment at `compies-theme.css:218` only concerns the edge's children. A future unrelated `.shadow` rule fails it. Scope it to the `edge` slice.

### Checked, no finding
- Secrecy: `smokeWindows` reads instants only (`stage-smoke.ts:3-4`); `vetoEndsAt` is null for a Member before the stop, and a unit test covers it.
- Copy: the changelog's UI words (Glücksrad, Münzwurf, Siegerehrung, Weniger Bewegung) match GLOSSARY and `i18n/locales/de.json`.
- ADR 0013 and 0015: no server field, message or timer; the drift is CSS and only the rate is script.
- Reduced motion: the smoke has `motion-reduce:animate-none` and `reduced:animate-none`, and the rate is left alone (test `:198`). The reveal falls back to the cross-fade.
- Stage piece row: the smoke is correctly not in `event-stage.ts` (it is decoration, not a piece), and its own row names that.

## Spec

## Spec review, COMPIES 0.23.1 (v0.23.0...origin/spec/927-auftritt-0.23.1, tip 5934ba5c)

Axis: Spec only. Sources: spec #927 (§ The smoke, stories 33-40, § The theme change), tickets #675 and #933 with their build comments, design notes 19 and 20 with their reference files. Decided items (the waiver, #933's scope, the trapped RichNotesLinkControl popover, the two-taps-in-one-frame edge, the builder's disclosed note-vs-code differences) are not rated.

Verdict: no must fix, no should fix. The numbers match the designs. Findings are three nits and a list of what was checked and found right.

### Findings

#### 1. nit: the shadow's animation is not paused until `ready`
`app/assets/css/compies-theme.css`, the `.theme-edge:not(.is-running) * { animation-play-state: paused; }` rule against `.theme-edge[data-to="dark"] .theme-edge__shadow { animation: ... }` and the `light` twin.

Note 20 § How it is drawn, step 5: "The edge animations stay paused until `transition.ready`, then start in the same frame as the clip."

The pause rule has specificity (0,2,0). The `animation` shorthand of the shadow rules has (0,3,0), because of the attribute selector, and it resets `animation-play-state` to `running`. The disc (0,1,0) is paused correctly, but the shadow runs from the moment the edge is appended, so it leads the clip by the frames between the callback and `ready`. That is about 1-2 frames, or 0.2 px of the 10 → 3 px offset, so it is hardly visible. Note 20's own CSS has the same selectors, so this is a flaw inherited from the design, not a deviation by the builder. `test/unit/theme-edge-css.test.ts` does not pin the pause.
Fix if wanted: `animation-play-state: paused` in a rule that outranks the shadow rules (for example `.theme-edge[data-to]:not(.is-running) .theme-edge__shadow`), or drop the shorthand's play-state with a longhand rule placed later.

#### 2. nit: the layer on a phone runs under the tab bar
`app/components/StageSmoke.vue:56` (`fixed top-[...] right-0 bottom-0 left-0`).

Note 19 § Place: "from directly under the header down to the bottom (TabBar on mobile)", where the artboard's layer ends at the tab bar. The fixed layer ends at the viewport's bottom edge, so it is one tab bar's height (about 60-70 px) taller than the note's layer. The shapes' `y` and `h` percentages then resolve over a slightly taller box, and the lower shapes (b4, b5 at 48 % and 66 %) sit a few percent lower than drawn. The tab bar is opaque, so nothing shows through. Fixed vs. absolute is decided on #675; only the bottom edge differs. Could use `bottom: <tab bar height>` below md, or be left as it is.

#### 3. nit: moment windows are approximations of two note rows
`app/utils/stage-smoke.ts:20-27` against note 19 § Moments.

- Coin flip: "toss → result". The window is `startedAt → landsAt`. If "result" means the shown result label or the finish of the coin's settle, the window ends a little early. `landsAt` is the only instant the read carries.
- Award ceremony: "start → share card". The window is `startsAt → endsAt`. The code comment in `shared/ceremony.ts` says a phone's grid ends up to 1.7 s before the stored end, so the smoke on a phone may stay slow for up to 1.7 s after the share card shows. Not visible in practice.
- Clip: "clip.startAt → close". The window is `clipShown` (the overlay is open and the read carries the Clip), the same instant the backdrop dims. That matches how the page already treats the Clip. Only a difference if the overlay can open before `clip.startAt`.

The spin (spin start → stop + 2.2 s) and the Veto reveal (`vetoEndsAt` → +1.2 s) match the note exactly.

### Checked and matching

- Shapes (`stage-smoke.ts:52-58`, `SMOKE_SHAPES`): all ten boxes (1440 and 390 columns), Hell colours (pop, mint, primary, mint, primary), Dunkel colours (hot, cobalt, hot, cobalt, hot), keyframes A/B/A/B/A, legs 18/22/26/30/34 s (loops 36-68 s as two legs), delays 0/-9/-18/-27/-36 s equal note 19's table and `BuehnenRauch.dc.html` (SH.B). Unit-tested for the colours, delays, legs, keyframes and the first and last box.
- Keyframes (`compies-theme.css`): `cp-smoke-rise-a` to `translate3d(3%,-6%,0) scale(1.08) opacity 1`, `-b` to `translate3d(-3%,-6%,0) scale(1.06) opacity 1`, from = rest at opacity .8, transform and opacity only. Tested.
- Group opacity .24 (Hell) and .12 (Dunkel), each shape .8 → 1, radial-gradient closest-side to transparent, no filter, no blend, `will-change` off under Reduced motion, `contain: strict`, `overflow: hidden`, `pointer-events: none`, `aria-hidden`, z = `layer-decor` (1) under the column's `layer-content` (2). Md = 980 px, the note's desktop cut. The right edge is left of the panel from md, the top under the header.
- Dim on the Clip: .5, in `dur-slower` on `ease-out`, out `dur-slow` on `ease-in`; instant under Reduced motion (`motion-reduce:transition-none`, `reduced:transition-none`). Rate .5 on the Clip too, applied through `updatePlaybackRate`, re-applied on `animationstart`, skipped under Reduced motion. Lobby, Veto countdown, Standings: 1x.
- Reduced: `motion-reduce:animate-none` and `reduced:animate-none`; still frame is the `from` keyframe (opacity .8 of peak, no transform).
- Stories 33-40 and the ticket: Event page only (the `decor` slot; AppShell without it keeps its classes, tested); other pages keep the dot grid and warm gradients (the shell's `tex-paper` is untouched); the Dunkel stage fog is the existing `--cp-tex-image` under the smoke; no new server field, message or timer (ADR 0013); drift in CSS, not GSAP (ADR 0015); changelog line under `### Neu` for #675, none for #933.
- Tests against the criteria: layer on the Event page and on no other page or view (`event-page-smoke.test.ts`, both Host and Member, the phone's three other views, the load and error states, the shell without the slot); still under Reduced motion (class names asserted, and the rate untouched under Reduced motion); the moments and their rate (`stage-smoke.test.ts`, unit and nuxt, including the late start and the spin plus Clip overlap).
- The edge (`compies-theme.css`, `theme-reveal.ts`): `.theme-edge` fixed, full viewport, `contain: strict`, `view-transition-name: theme-edge`; `::view-transition-group/new(theme-edge)` animation none; disc `left/top` at `--vt-x/--vt-y`, `translate: -50% -50%`, 0 → 2R, `dur-slower` on `ease-io`; line from Dunkel (`data-theme="dark"`: `--cp-line` #f7efe1, `--cp-bw` 2.5 px) inset when going to Dunkel and outer when going to Hell; shadow from Hell (`data-theme="light"`: `--cp-shadow-modal` 10/10 → `--cp-shadow-sm` 3/3, ink), outer when going to Dunkel and `inset` when going to Hell, on `--cp-ease-linear`; keyframes `cp-vt-disc`, `cp-vt-shadow`, `cp-vt-shadow-in` as in the note; no literal, no new token (pinned by `theme-edge-css.test.ts`). The edge is appended inside the callback after `apply`, `is-running` on `ready`, removed on `finished` also when skipped, and an older edge leaves before a newer spread. The look passed is `shownLook(next, dark)`, tested for a tap from Hell, from Dunkel and on System on a dark device.
- #933 criterion "a test pins that the edge is drawn only with the circle": `theme-reveal.test.ts` has a table of cases (Reduced motion, no View Transitions, no origin, no change, no `to`) that watches the document for any `.theme-edge` and expects none. The tests of 0.23-10 are untouched and stay.
- CODING_STANDARDS rows for the reveal, the edge and the smoke are updated and match the code.
