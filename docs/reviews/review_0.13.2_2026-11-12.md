# Review 0.13.2 „Show-Rad“ (2026-11-12)

Diff `v0.13.1...origin/spec/503-show-rad` (tip ab280ef1). Per `docs/agents/release.md` § Review, three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#503);
- Quality (code quality, with the architecture vocabulary of `codebase-design`).

## Result

- **No finding is rated must fix.** Standards found no hard breach of a Secrecy, Database or Copy rule. Quality has no must-fix. Spec's findings are should-fix, note or open user questions.
- **The fix ticket is #584.**
- Nothing was run in a browser. Every criterion that needs a real layout, a second device or a real clock is marked "browser pending" in the Spec report.

## Standards review: Release 0.13.2 „Show-Rad“ (spec #503)

Diff: `v0.13.1...origin/spec/503-show-rad` (tip ab280ef1). Sources read: `CODING_STANDARDS.md`, `GLOSSARY.md`, ADR 0013 and 0015, `04-motion.md` § Lucky Wheel, `16-compibert-gluecksrad.md`, the baseline smells of the code-review skill. No hard breach of a Secrecy, Database or Copy rule found. Nothing "must fix before the Release". No User data in this file.

### Checked and clean

Secrecy (the mascot is told two instants, `hidden`, `reduced`; refill keys are slot numbers for a count-only Member; pins and flapper come from the count and the instants; `bulbsLit` goes through `stopReached`; spin length is drawn after the result and from the source alone); the Draw timeline stays the one home (`SPIN_MIN_MS`/`SPIN_MAX_MS`, `drawInstants` refuses a spin without length); Motion tests assert easing, duration, late joiner, reduced fallback and edges (0, 1, 2 games, 176 games, longest name); copy uses the glossary word (Glücksrad, App-Figur); the one local clock (`performance.now()` for the refill) is argued in the code against ADR 0013 and is a data-change motion, not a server moment.

### Confirmed from the brief

#### S1 (should fix) One home: wheel timing constants are copied across files. (also P5, Q2)

- `app/utils/wheel-stop.ts:12` and `app/utils/wheel-refill.ts:10` each hold `POP_EASE = [0.34, 1.56, 0.64, 1]`. This diff itself exported `SNAP_EASE`, `IO_EASE`, `bezier`, `CROSSFADE_MS` from `app/utils/wheel.ts` for exactly this reuse, then left `POP_EASE` out.
- `wheel-refill.ts:14` `FADE_MS = 200` repeats the `CROSSFADE_MS` (200) that `wheel-stop.ts` imports, although its comment calls it "the app's one crossfade length". `wheel-refill.ts:11` `REDISTRIBUTE_MS = 600` repeats `REMOVE_MS = 600` (`wheel.ts:28`, private): the same 0.6 s of 04-motion.
- Rule: § One home per concern: "New code calls it; a second copy is a finding even when it works."
- Fix: export `POP_EASE` (and `REMOVE_MS`, or one `REDISTRIBUTE_MS`) from `wheel.ts` next to the other eases; import `CROSSFADE_MS` in `wheel-refill.ts`; delete the copies.

#### S2 (should fix) The Hidden wheel's 500 ms is two constants. (also Q2)

- `app/utils/wheel-mascot.ts:26` `HIDDEN_CHEER_AFTER_MS = 500` vs private `REVEAL_AFTER_MS = 500` at `app/utils/wheel.ts:104`. The comment says "until the drawn label turns into the game" but only a test keeps the two equal.
- Rule: § One home; the code's own comment ties it to `revealStage`. Smell: Duplicated Code.
- Fix: `export const REVEAL_AFTER_MS` in `wheel.ts`, import in `wheel-mascot.ts`, delete the local one.

#### S3 (note) Unused theme utility `animate-pop-in`. (also P5, Q11)

- No user left in `app/` (the only use, the result card in `LuckyWheel.vue`, went with #523; `test/nuxt/wheel-stop.test.ts:117,128` only assert its absence). It still sits in `app/assets/css/compies-theme.css:155` (token), `:167` (`@keyframes cp-pop-in`), `:181` and `:185` (reduced-motion overrides).
- Rule: Speculative Generality baseline; no documented standard. The comment "physical landings only" suggests it may be wanted by the design.
- Fix: delete the four spots, or keep and say so in the cut's notes. Not blocking.

#### S4 (note) `LuckyWheelMascot.vue` has an unscoped `<style>` block

- `LuckyWheelMascot.vue:95` (`.wheel-mascot` and `--wm-left`).
- The app's own convention for a computed offset is a utility on a custom property (`top-(--clip-top)` in `ClipOverlay.vue`, `top-(--drag-dy)` in `ResultEntry.vue`). The two rules are `left-(--wm-left)` and `data-[ready=false]:opacity-0` (inline GSAP opacity still wins). The unscoped block is global CSS. The two rig components have a `<style>` because they need selectors and filters; the mascot does not.
- Fix: put both on the root element's `class`, drop the block.

#### S5 (note) `LuckyWheel.vue` has grown to 503 lines (+331) with five tickets. (also D1)

- Smell: Divergent Change. It now holds the disc's static drawing, the flapper's 60 template lines, the refill machine (`restSlices`, `baseline`, `refill`, `refillClock`, `refilling`, `refillOpacity`, about 45 lines of script), the pops, bulbs, mascot width. 0.13.3 adds the cues to the same file.
- Fix (smallest, before 0.13.3 rather than before this cut): `WheelFlapper.vue` (prop `angle`; the shadow and front shapes become one `v-for`/`<use>` instead of two copies of the blade and hub), and `useWheelRefill(wheel, running, rootEl, reduced)` for the refill block.

### New findings

#### S6 (should fix) Compibert's hand-off is built, but 04-motion and 02-components still say the opposite. (also P6)

- `04-motion.md:112` still has "Compibert (full, beside the wheel) rises `y 180→0`"; `:120` (Deviation 0.13) and `02-components.md:871` still say Compibert "waits for his own Claude Design hand-off". `16-compibert-gluecksrad.md:45` says its additions "replace the Compibert parts of § Lucky Wheel and the wheel line in § Compibert moment slots (4a)" (`04-motion.md:184` still `y 180→0`). The build is the bust, in along the radius (`x −130, y 100` and `x −100, y 80`), with the Hidden wheel's cheer at stop + 0.5 s. This diff adds a 0.13.2 deviation line for #522 only.
- Rule: the repo's practice that a built deviation from 04-motion is written as a "Deviation (x.y)" line (see the 0.13 and 0.13.2 lines).
- Fix: one Deviation (0.13.2, #526) line in 04-motion § Lucky Wheel naming the bust, the radius travel, the Hidden-wheel cheer and the reduced fade in place; correct the "waits for his hand-off" words in `04-motion.md:120` and `02-components.md:871`; the slot line at `:184` gets "see § Lucky Wheel".

#### S7 (should fix) His timings are two sets of numbers. (also Q2, D3)

- `app/utils/wheel-mascot.ts:17,18,20` (`ENTER_MS` 450, `LEAVE_MS` 400, `FADE_REDUCED_MS` 220) and `app/utils/wheel-mascot-run.ts:10,11,15` (`ENTER_S` 0.45, `LEAVE_S` 0.4, `FADE_REDUCED_S` 0.22) are the same moments; phase and tween agree only because two test files pin each.
- Rule: § One home; Duplicated Code.
- Fix: `wheel-mascot-run.ts` takes seconds from `mascotMoments` (or imports exported `ENTER_MS`/`LEAVE_MS`/`FADE_REDUCED_MS` and divides by 1000).

#### S8 (note) `CompibertRig.vue:64` has the viewBox width as literals. (also Q2)

- `props.variant === 'bust' ? 254 : 404` repeats the widths in `VIEW_BOX` (`app/utils/compibert-rig.ts`: `bust: '150 36 254 254'`, `full` 404). The head (192 wide) still gets 404, as before this diff, so its cheap shadow is too small.
- Fix: export a `viewWidth(variant)` from `compibert-rig.ts` and read it; decide the head's shadow in the same change (or leave and say so).

#### S9 (note) Rim geometry is split between `wheel-look.ts` and the template. (also Q12, D1)

- The header of `wheel-look.ts` says it holds "the geometry of the rim", but `LuckyWheel.vue:298-320` has the literals `207/208`, `204`, `190` (the same value as the private `BULB_RING_RADIUS`, `wheel-look.ts:24`), `22`, `201`, and the flapper's shapes (`FLAP_BLADE`, radius 10, 3.5) sit in the component while `FLAPPER_PLACEMENT`/`FLAPPER_HINGE` are in `wheel-look.ts`.
- Rule: Magic numbers; Duplicated Code (190 twice).
- Fix: export `BAND_RADIUS`/`BAND_WIDTH`/`RIM_OUTLINE_RADIUS` and the flapper's blade from `wheel-look.ts`; or with S5, move them into `WheelFlapper.vue`.

#### S10 (note) Stale and misplaced comments in `LuckyWheel.vue`.

- `:66` the doc comment "The server time of this frame …" now sits above `rootEl`, not above `clock`.
- `:194` "The Show-Rad's still defaults (#519); each is a function of the server's clock once its ticket fills it" and `:419` "only its arm will move (#522)" are ticket-stage wording; #521 and #522 are done.
- `:20` "while the wheel is scrolled out of view, nothing runs" is still true only of `target`; the `lampClock` (`until: () => Infinity`) now runs every frame at rest while the wheel is in view.
- Fix: move the `clock` comment, reword the two, add one sentence on `lampClock` to the file header.

#### S11 (note) `mascotPhase` repeats the stop edge

- `wheel-mascot.ts`: `cheerAt = stopAt` on an open wheel, `nowMs < cheerAt`, where `wheel-stop.ts` and `wheel-bulbs.ts` go through `stopReached`. It uses `>=` like `stopReached`, names no game, and under a Hidden wheel waits 500 ms for everyone, so there is no leak (§ Secrecy).
- Optional: a test that pins `mascotPhase`'s cheer instant to `stopReached` on an open wheel.

#### S12 (note) Reduced-motion bulbs have no deviation line.

- `bulbsLit` lights all 24 steadily under reduced motion (`wheel-bulbs.ts`, tested); 04-motion says only "no bulbs chase". Add the words to the 0.13.2 deviation line of S6.

## Spec review: Release 0.13.2 „Show-Rad“ (spec #503)

Diff: `v0.13.1...origin/spec/503-show-rad` (tip ab280ef1). Read: the spec #503, the bodies and comments of #519, #520, #521, #522, #523, #524, #526, #550, `docs/design_handoff_compies/16-compibert-gluecksrad.md`, `CODING_STANDARDS.md` § Secrecy and § Motion, and the code of `LuckyWheel.vue`, `LuckyWheelMascot.vue`, `app/utils/wheel*.ts`, `shared/draw-timeline.ts`, `server/domain/wheel.ts`, `server/utils/rounds.ts`, `stage-read.ts` (`wheelView`), the Clip and Veto components and their tests. Nothing was run in a browser; #527 and #528 have only the implementers' items, no results, so every criterion that needs a real layout, a second device or a real clock is marked "browser pending".

States: **met**, **met (dev)** = met with an accepted deviation, **browser** = code and tests meet it, only the browser check can confirm, **not met**.

### Stories of #503

| # | Story | State |
|---|---|---|
| 1 | Bulb rim, pins at every slice edge, flapper | met (`wheel-look.ts`, template; layout at 340/420 browser) |
| 2 | Same colours in Hell and Dunkel, card dark | met (literal Hell values, dark check exempts only `wheel-disc`) |
| 3 | Whole wheel inside the card at 390 px, no size change | browser (disc has no reserved space for mascot or flapper changes; flapper cleared by `mt-4`) |
| 4 | Labels as readable as today | met (label rules untouched) |
| 5 | Bulbs blink slowly at rest | met (`bulbsLit`, 0.6 s, `lampClock`); see P3 |
| 6 | Chase in the spin, flash at the stop | met (every 4th, 0.08 s; flash 0.72 s: met (dev), open question on 0.36 s) |
| 7 | Flapper kicks per pin, thinning out | met (dev: +30 deg, held up between close pins, back crossings kick; written in 04-motion) |
| 8 | Drawn slice outlined, label pops, card pops | met (dev: one `EASE.pop` over 420 ms with three keyframes, as the reference; outline is instant as today); see P4 |
| 9 | Same angle, bulbs, flapper for everyone, late joiner | met in code: `angle`, `bulbsLit`, `pinCrossings`/`flapperKick`, `cardPop`/`labelPop`, `mascotPhase` are functions of server time and the spin's instants; browser pending (#528) |
| 10 | Hidden wheel: reveal half a second after the stop | met (`revealStage` untouched); see P7 |
| 11 | Drawn slice leaves, others close the gap | met (`sliceSpans`/`removalEase` untouched) |
| 12 | Slices move over on put back / refill, new slice pops | met (`wheel-refill.ts`, 0.6 s `EASE.io`, 0.3 s pop); the one non-server-time motion, see section Refill below |
| 13 | Hidden tab: right state, no replay | met in code for bulbs, flapper, pops, mascot (clock re-read on return, pure functions); refill runs unseen to its end; browser pending |
| 14 | Reduced motion: calm 1.2 s turn, steady bulbs, no chase, no kicks | met for bulbs, flapper, pops, refill, mascot; **the turn is not calm any more, see P1** |
| 15 | Screen reader: name with count, announced result, decor silent | met (svg `role=img`, decor `aria-hidden`, mascot `aria-hidden`, live region untouched) |
| 16 | Each spin 6 to 10 s | met (`drawSpin`: `SPIN_MIN_MS + randomInt(4001)`, both ends, drawn last) |
| 17 | Longer spin, more turns | met (`spinTurns` = round(ms/1250): 5, 6, 7, 8 for 6, 7, 8.5, 10 s; a stored 6 s spin still reads 5) |
| 18 | No Host setting | met |
| 19 | Hidden wheel: length tells nothing | met (drawn last from the same source, not stored, no new field on the wire, tested at both ends and a millisecond before the stop) |
| 20 | Operator chooses Compibert from options | met (#525 approved, 1b „Hinterm Rad“) |
| 21 | Compibert rises, excited, holds breath, cheers, sinks | met (dev: spin passed as `{spinStartAt, stopAt}`, `bust` variant and `excited` state added although the note says "new rig state: none"; eye-follow not built) |
| 22 | Compibert under reduced motion | met (opacity only 0.22 s, no x/y, still pose; Hidden + reduced cheers at stop + 0.5 as the note says) |
| 23 | Ship without him if not approved | moot, he is approved and built |

### Tickets

| Ticket | Criterion | State |
|---|---|---|
| #519 | 24 bulbs, pin per edge for 2, 9, 30 slices, flapper, no accessible name; name and live region unchanged | met |
| | Colours the same in Hell/Dunkel; dark check exempts the wheel, still checks the card | met (`dark-read.mjs` EXCLUDED, `[data-testid="wheel-disc"]` only) |
| | Existing wheel tests pass; changelog line | met |
| | Browser items on #527 | posted, not run |
| #520 | Scripted source: length at both ends, stop follows, result independent | met (`draw-spin.test.ts`, `rounds.test.ts`, `hidden-wheel-draw.test.ts`) |
| | 5, 6, 7, 8 turns for 6, 7, 8.5, 10 s; angle at start, mid, stop for two lengths; reduced | met |
| | SQL parity test covers 10 s | met (`draw-timeline.test.ts`: 36 stored shapes) |
| | Integration as Player under Hidden wheel, nothing leaks before the stop | met |
| | Veto window and Clip start at the stop; no setting | met |
| #521 | Rest blink 0.6 s, chase every 4th at 0.08 s, flash, reduced steady | met (dev: flash 0.72 s, reading open with the user) |
| | Pure function of server time; only in view | met (`lampClock` samples a pure function; target `rootEl`) |
| #522 | Crossings from one place, `wheel-tick` can reuse; kick 0.13 s; held up between close pins; reduced rests | met (dev: +30 deg, `back` flag) |
| #523 | Outline + label pop 0.42 s, card pop 0.42 s, placed from server time, late joiner sees end state | met (inline style from `clock - stopAt`, no CSS animation, `animate-pop-in` removed from the card) |
| | Hidden reveal unchanged; reduced crossfade | met |
| #524 | Grow and shrink at rest go through a transition; nothing during a spin; reduced fade | met |
| | Under a Hidden wheel count change with placeholders only | met (keys `slot-i`, names `???`, keys never rendered) |
| | Pins and bulbs follow | met (pins from spans; bulbs are on the band) |
| #526 | Per the hand-off note: placement, poses, times, reduced, late joiner, hidden tab, never covers label/flapper/card, size unchanged | met in code; placement and "never crosses the card border" browser pending, see P2 |
| | `excited` tested like the other states | met (`it.each(RIG_STATES)`) |
| | Changelog under `### Neu` | met |
| #550 | Veto bar beside the video at 844 x 390 and 667 x 375, Host and Player, no fixed/sticky element over the video | met in code (two fixed columns, `sideways` variant, `--cp-veto-side-w`); rects browser pending (#527) |
| | Upright and desktop layouts unchanged | met in code: every new class carries the `sideways:` prefix, the #549 video-box class list and the veto-bar bottom offsets are pinned unchanged in tests, md bound is `width < theme(--breakpoint-md)` |
| | Accessible names kept where labels are hidden | met (`sideways:sr-only` on "Ton aktivieren", "läuft für alle", the hint line; tests pin it) |
| Spec | Changelog: look/motion line and spin line | met (plus Neu and Behoben lines for Compibert and #550) |
| Spec | Datenschutzerklärung and Worker unchanged | met (no migration, no Worker or legal diff) |

### Pure function of server time, and the one exception

- Angle, bulbs (rest, chase, flash), flapper, pops, Compibert's stage and state are all computed from `clock`/`lampClock` and the two instants; none holds a timer, a CSS animation, a transition or a GSAP call that starts when mounted. The mascot's only GSAP is a paused timeline moved with `timeline.time(clock - spinStartAt)`, as the ceremony does, so a late joiner or a returning tab lands where the clock is.
- The refill (#524) is the exception and is fenced correctly: `refilling` is null whenever `running` is true; the watch over `[restSlices, running]` drops a plan in flight and re-bases silently when `running`; the spin's commit takes the drawn game out of the pool in the same read, so the count's fall at the commit plays nothing; at the removal's end the keys equal the baseline and `refillPlan` returns null. A change that arrives mid-spin shows at once after the removal (accepted in the brief). A page opened after a change, a tab out of view or hidden, and a Hidden Member's slot keys were all checked: no replay, no game id or name reaches the plan for a Member who has only `count`.

### Findings

#### P1 (should fix before the Release, or decide with the user) Reduced-motion spin is no longer calm: up to 8 turns in 1.2 s

- File: `app/utils/wheel.ts` lines 66 to 82 (`finalAngle` uses `spinTurns`, `wheelAngle` reduced branch uses the same angle over `SPIN_REDUCED_MS` = 1200).
- Spec: story 14 "the calm 1.2 s turn that ends at the same stop"; #520 decision 1 left it as an open question for the user ("cut the reduced turn to about one turn, a small follow-up in `wheelAngle`").
- Code: the reduced spin travels the full angle, now 5 to 8 turns in 1.2 s on `EASE.snap`. Computed from the ease: peak 18.5 rev/s (111 deg per frame at 60 Hz) at 5 turns, 28.7 rev/s (172 deg per frame) at 8 turns. At those speeds the wheel strobes; that is the opposite of what reduced motion is for. The 5-turn case was already fast, the longer spins make it worse.
- Smallest fix: in the reduced branch of `wheelAngle` end at the same orientation with one turn: target `finalAngle(spin) + 360 * (spinTurns(spin) - 1)` (still ends exactly where `finalAngle(spin) % 360` rests), and add the unit test the ticket already names ("reduced motion"). Or take the user's decision and note it in the Release.

#### P2 (should fix if the 1000 px check confirms it) The md bust can cross the card border between 980 and about 1090 px

- File: `app/utils/wheel-mascot.ts` `mascotBox`, `app/components/LuckyWheelMascot.vue`.
- Spec: hand-off 16 puts him at "left 300, 232 px, 112 px past the wheel" for md and up, and says only at sm that "it must not cross the card border"; #526 question 2 was settled "no clamp, the browser check looks at 1000 px".
- Code: at md the box ends 112 px past the wheel's right edge. When the stage is narrower than about 676 px (viewport 980 to roughly 1090, side panel 340 px; my estimate from the layout, not measured) the wheel fills the card's inner width and his box sticks 50 to 100 px out of the card, over the gap and the side panel.
- Smallest fix: decide after the 1000 px item of #526's browser check; if it fails, use the sm bust (150 px, overhang 8) below a wider breakpoint, or clamp `left` to the card's inner width. The `width` prop already allows it.

#### P3 (note) `lampClock` is a permanent frame loop at rest (also Q1)

- File: `app/components/LuckyWheel.vue` lines 91 to 94.
- Spec: #503 "The wheel animates only while it is in view, as today", #521 decision 4 (accepted, render count measured: 2 per 1.2 s).
- Code: while the wheel is in view and motion is not reduced, a `requestAnimationFrame` loop runs for the whole evening, 60 samples a second to change a bulb every 0.6 s. The render guard keeps the DOM quiet, but the loop and a 24-element array per frame cost battery on a phone left on the Event page.
- Smallest fix: `every: 40` on `lampClock` (the chase's 80 ms step is the finest thing it must resolve), or `every: 'frame'` only while a spin is in progress. Optional.

#### P4 (note) The pops leave `transform: scale(1)` and `opacity: 1` on the card and label for good

- File: `app/components/LuckyWheel.vue` `cardStyle`, `labelTransform`/`labelOpacity`.
- Spec: #523 "long after the stop the end state without a running animation".
- Code: the end state is an inline `transform: scale(1)` on the result card (and a four-part transform on the label) for as long as the card shows. A transform on an ancestor makes it the containing block of any `position: fixed` descendant and a stacking context; the card holds the game tile and its dialog (`GameTile` keeps `GameDialog` in the tile), so a dialog or popover that is not in the top layer would be placed against the card. I did not confirm that any of them is.
- Smallest fix: return `undefined` from `cardStyle` once `stopElapsed >= 420` (and keep the label's identity transform as it is, or drop it after 420 ms); a late joiner still gets the end state, now as no style at all.

#### P5 (note) `POP_EASE` is defined twice (also S1, S3)

- File: `app/utils/wheel-refill.ts` line 10 and `app/utils/wheel-stop.ts` line 12 (also named in #524's report).
- Standard: `CODING_STANDARDS.md` § One home. Smallest fix: export `POP_EASE` next to `IO_EASE` in `app/utils/wheel.ts` and import it in both. The unused `animate-pop-in` utility in `app/assets/css/compies-theme.css` can go in the same change (the #523 report left it for this review).

#### P6 (note) Documentation of the deviations is still to be written at the cut (also S6)

- Not in the diff: deviation lines for the flash length (0.72 s, #521), the pop curve (#523), the refill (#524), the bust and `excited` and the `{spinStartAt, stopAt}` prop (#526) in `docs/design_handoff_compies/02-components.md` § LuckyWheel and 04-motion, and the two #550 lines in § ClipPlayer and § VetoWindow. The only deviation line there is #522's. The briefs say the orchestrator writes them at the cut; also 16-compibert-gluecksrad.md still says "New rig state: none" while the code adds `excited` and `bust`.

#### P7 (note, pre-existing, for the Secrecy sweep) Under a Hidden wheel the result card names the game at the stop

- File: `app/components/LuckyWheel.vue` `card` (unchanged since 0.13.1), `server/utils/stage-read.ts` `wheelView` (`game` from `spinKnown`, i.e. from the stop).
- Story 10 only asks for the label's reveal "as today", so this is met. But the card, now popping in with the stop, shows the real name half a second before the label turns into it, and Compibert is built to hold his breath until stop + 0.5 s "because the name is only known then". The wheel's own gate (`drawGameKnown` from the stop) is by design; the half second is cosmetic. No new leak, nothing before the stop: the card and the Event read still carry no game before `stopAt` (tested a millisecond before the stop at 6 s and 10 s).

#### P8 (note) Open user questions still open

- Flash read as 0.72 s (lit/dark three times) vs 0.36 s (#521, one constant `FLASH_TOTAL_MS`); flapper kick sign +30 (#522, documented); reduced Hidden cheer at stop + 0.5 (#526, per note); the Veto bar's hint line is hidden visually in sideways mode (#550 question 1, to be shown to the operator in the walk-through). None blocks the cut.

### Checked and found fine

- Hidden wheel, every surface the standard names: Event read has no new field (key list pinned in `hidden-wheel-draw.test.ts`); no new room message; DOM of the wheel and the mascot carries `data-stage`, `data-state`, `data-width`, `data-lit` and slice indices only; the mascot is told `{spinStartAt, stopAt}`, `hidden`, `reduced`, `width`, never slices or result; pins, bulbs, flapper and pops derive from the same data the wheel angle already shows; the Hidden Member's refill uses slot keys and "???" and the test reads the disc's `outerHTML` for names and ids; no new `stopAt <=` comparison on a game-naming surface (`stopReached` is used by the wheel and the bulbs; the mascot's `>=` guards a pose, not a name).
- The spin's length: drawn last from the injected `randomInt`, not stored (the stop instant carries it), no field added, `drawInstants` throws for a spin without a length; the integration setup file answers only the one-argument call with 4001 and every file with its own `vi.mock('node:crypto')` still wins; no code anywhere else assumes 6 s (grep of `app`, `server`, `shared`, `realtime`).
- #550: `sideways:inset-x-auto` is ordered before `sideways:left-2.5` by Tailwind, the video box is unchanged, the 41rem floor is pinned to the token and the 356 px floor by `sideways-query.test.ts`, the bar keeps its bottom offsets so the Host's crown at `bottom-24` stays free by the brief's arithmetic. Not confirmed without a browser: the rects at 844 x 390 and 667 x 375, the cast pill not truncating, the Host's Clip bar in one row at 373 px.
- Raw `z-0` and `relative z-1` in the disc: allowed by hand-off 16 ("no layer token needed", isolated context), against the general "never raw z-index" of 01-tokens.

## Quality review: Release 0.13.2 „Show-Rad“ (spec #503)

Diff: `v0.13.1...origin/spec/503-show-rad` (tip ab280ef1). Skills followed: `thermo-nuclear-code-quality-review`, `improve-codebase-architecture` with `codebase-design` (module, interface, depth, seam, leverage, locality). No subagents, no user questions asked: the questions are in the last section. No file crosses 1000 lines (`LuckyWheel.vue` is 503, script 250 + template 220).

Method: read every changed app/server/shared file in full, read the mascot, refill, pins and bulbs tests, and ran `pinCrossings` outside Vue in node (copy in the scratchpad `bench/`) at 3, 30 and 176 slices, 6 and 10 s. Per-frame render cost is reasoned from the code, not measured (no node_modules in the worktree).

Verdict: no must-fix. The pure modules (`wheel-pins`, `wheel-bulbs`, `wheel-stop`, `wheel-refill`, `wheel-mascot`) are deep, take no clock and have thorough interface-level tests. The refill watch and the mascot's build/seek hold up (reasoning below). What is left is duplicated constants that must move together, an always-on 60 Hz loop at rest, avoidable recomputation, one layout question, and structure.

### Findings

#### Q1 (should fix) The bulbs keep a 60 Hz animation loop running at rest, and the header says nothing runs (also P3)

`app/components/LuckyWheel.vue:84-87` (`lampClock`, `until: Number.POSITIVE_INFINITY`) with `useServerTicker` (`pending()` is always true for `now < Infinity`) means one `requestAnimationFrame` loop per mounted wheel in view, for as long as the Event page is open, to flip 24 circles every 600 ms. The test `test/nuxt/wheel-bulbs.test.ts` "keep the clock running while the wheel is in view, one read at each frame" pins this as a feature. The header comment at lines 19-20 ("at rest, and while the wheel is scrolled out of view, nothing runs") is now false.

Scenario: a Member leaves the Event page open on a phone through a two-hour session; the main thread wakes 60 times a second for a blink that changes 1.7 times a second, plus the ticker's `serverNow()` read and a computed re-run each time.

Smallest fix: at rest wake only at the next 600 ms boundary (`every: 150` ticker, or a `setTimeout` to `ceil(now / 600) * 600`), keep the frame loop for the spin and the 0.72 s flash (`clock` already runs per frame then). Update the comment either way. If the spec wants a 60 Hz loop at rest, say so in the comment and correct line 19.

#### Q2 (should fix) Constants that must change together are copied, not shared

- `app/utils/wheel-mascot.ts:130` `HIDDEN_CHEER_AFTER_MS = 500` is `REVEAL_AFTER_MS` of `app/utils/wheel.ts` (private there; the comment says "revealStage's half second"). Failing scenario: someone moves the reveal to 700 ms; the label turns into the game at 700, Compibert cheers at 500. Fix: export `REVEAL_AFTER_MS` and use it. (also S2)
- `app/utils/wheel-mascot.ts:121-124` (`ENTER_MS 450`, `LEAVE_MS 400`, `FADE_REDUCED_MS 220`) mirror `app/utils/wheel-mascot-run.ts:180-185` (`ENTER_S .45`, `LEAVE_S .4`, `FADE_REDUCED_S .22`). Failing scenario: LEAVE_MS goes to 500; `goneAt` and the box's removal move, the tween still ends at 0.4 s and he stands still for 0.1 s (or is cut off). Fix: `export` the `_MS` ones and write `const ENTER_S = ENTER_MS / 1000` in the run file; the run test already pins the eases. (also S7)
- `POP_EASE` in `wheel-stop.ts:12` and `wheel-refill.ts:10` (known; also S1, P5). `wheel.ts` exports `SNAP_EASE` and `IO_EASE` in this diff; export `POP_EASE` next to them and delete both copies. `motion.ts` has a third copy as a `motionToken` fallback string, which is fine (CSS side).
- 200 ms three times: `CROSSFADE_MS` (`wheel.ts`, now exported), `FADE_MS` (`wheel-refill.ts:125`), `REMOVE_REDUCED_FADE_MS` (`wheel.ts`). The refill one cites the same 04-motion line; import `CROSSFADE_MS`. (also S1)
- `app/components/CompibertRig.vue` (onMounted, `const viewWidth = props.variant === 'bust' ? 254 : 404`) repeats the width inside `VIEW_BOX` of `compibert-rig.ts:16`; the head variant (viewBox 192 wide) still gets 404, so its cheap shadow is about twice too small (before this diff too). Fix: export a `viewWidth(variant)` from `compibert-rig.ts` and use it for all three. (also S8)

#### Q3 (should fix) Every Event refetch during a spin re-runs the pin search

`LuckyWheel.vue:62-66` `timing` returns a fresh object whenever `props.wheel` gets a new identity, which every `event.changed` refetch does (a Vote, a join). `crossings` (line 206), `mascotSpin` (213) and `restSlices` (92) all key on it. Measured in node, one `pinCrossings` call: 30 slices 1.0-1.1 ms (181-271 crossings), 176 slices 4.4 ms at 6 s and 6.9 ms at 10 s (1061-1593 crossings), each time anyone touches the Event while a wheel is turning. Not a jank by itself, but it is waste with the fix already in the file (`litBulbs` returns `previous` when equal).

Smallest fix: make `timing` stable by value (`computed((previous) => equal(previous, next) ? previous : next)`), or key `crossings` on `drawId`. This also stops `mascotSpin` from handing the child a new prop object each refetch.

#### Q4 (should fix, ask the user) The Clip narrows for a Veto bar that may not exist

`app/components/ClipOverlay.vue:221` gives the section `sideways:left-2.5 sideways:mx-0 sideways:w-[calc(100%-30px-var(--cp-veto-side-w))]` unconditionally. `VetoBar.vue` renders only while `shown && own` ("The Stands and a Host outside the teams get no bar", its own header), so a Host, a Stand, and a Member whose Party has no bar state see the Clip pushed into the left column with an empty 16.5 rem column on the right on a phone held sideways. The tests pin class tokens only (`clip-overlay.test.ts:562-570`, and the `PLACED` allow-list at 528), happy-dom has no layout, so nothing shows the empty column.

Smallest fix: `VetoBar` already emits `shown`; pass it down (or a `data-` attribute on the page root) and put the `sideways:` placement behind it. If the empty column is deliberate (the bar can appear mid-clip when the window opens, so the Clip must not jump), say that in the comment. Question for the user in the last section.

#### Q5 (should fix) The mascot's tests promise more than they cover

`test/nuxt/wheel-mascot.test.ts:399` is titled "…a chunk that never arrives leaves him invisible" but only holds the chunk and then releases it. There is no test for: a chunk that rejects (`LuckyWheelMascot.vue:47-51`, `build` returns, `ready` stays false, no retry until the next spin), an unmount while `build` awaits (the `ticket` check at line 52), or a rebuild when `width` or `reduced` change (lines 62-65). I traced all three and they are right today: the ticket guard covers unmount and a second build; `reduced` only changes at mount or by a new `drawId`, which is a new `:key` and a new component. One latent edge: the reduced timeline never touches `x`/`y`, so a rebuild from motion to reduced on the same element would keep the old inline `transform`. Only reachable if `reduced` ever becomes reactive to the OS setting. Fix: add the three tests (`vi.mock` the chunk to reject), and make `buildMascotTravel` start with `gsap.set(element, { clearProps: 'transform' })` under reduced.

#### Q6 (later, as an Idea) Per-frame render work grows with the slice count; nothing here caches it

While a spin runs, `angle` changes every frame so the whole render function runs, and `spans` (130-134) is a new array every frame even while `removalEase` is 0 (that is, from the commit until 2.2 s past the stop). Per frame, at 176 slices: `sliceSpans` (176 objects), `pinAngles` + 176 `wheelPoint` (sin/cos) + 352 `toFixed` in the template for the pins (new in this diff), 2 × `pathOf` per slice (352 strings, old). At 30 slices each label calls `labelOf` 4 times (one more than before: `labelOpacity`), three `characterCount` segmenter passes, and builds a four-function `transform` string for every label though only the drawn one scales (`labelTransform`, new). Estimate, not measured: well under a millisecond on desktop at 30, around a millisecond at 176; a pool of 176 is not realistic, so this is not urgent.

Smallest fix: `const ease = computed(() => running && timing ? removalEase(...) : 0)` (a number, so dependents stay quiet when it does not change), derive `spans`, `pins` and the slice paths from it, and give only the drawn label the long `transform`. The bigger fix is in the deepening section (D1).

#### Q7 (later) `bulbsLit` allocates and the component compensates

`wheel-bulbs.ts` returns a new 24-array every call and `LuckyWheel.vue:201-204` keeps `previous` and compares 24 booleans per frame so the render stays quiet. There are only about eight distinct patterns (rest even, rest odd, all lit, all dark, four chase phases). Intern them as module constants (frozen arrays); identity is then stable by construction, the `previous` hack and the `every` compare leave the component, and a frame allocates nothing. Same idea at the source: return a small pattern key and let the template look the array up.

#### Q8 (later) `drawInstants` takes `spinLengthMs: number | null`, then asserts it

`shared/draw-timeline.ts:31-44`: the type allows `kind: 'spin'` with `null`, the body throws at runtime and then writes `spinLengthMs!`. A discriminated union (`{ kind: 'spin', spinLengthMs: number } | { kind: 'set' }`) makes the throw and the `!` unnecessary, and the set caller in `server/utils/rounds.ts:80` stops passing a meaningless `null`. The comment "Required, so a writer cannot forget it" is true of the field and false of the value.

#### Q9 (later) The integration setup recognises the length draw by a magic argument

`test/integration/setup.ts:9-16` mocks `node:crypto` for every integration test and answers `spinAnswer.value` when `randomInt` is called with exactly `SPIN_MAX_MS - SPIN_MIN_MS + 1` (4001). Any other `randomInt(4001)` (a pool of 4001 games, a future draw with that bound) is hijacked silently. The handler already injects `randomInt` (`spinWheel(change, randomInt)`); an exported `drawSpinLength(randomInt)` the setup mocks by module would not depend on the number.

#### Q10 (later) Test layering and what is asserted

- `test/nuxt/wheel-bulbs.test.ts` (277 lines) re-checks the rest, chase and flash patterns that `test/unit/wheel-bulbs.test.ts` (143 lines) already pins to the millisecond; the component tests are worth their render count and visibility cases, the pattern cases are a second copy. Same shape for refill (361 + 269) and mascot (412 + 157). Keep the component files to what only a mounted wheel can show.
- Tests that assert internals, not what a Member sees: `wheel-mascot.test.ts:324` counts `serverNow` calls (that is the clock plumbing, the point is "he moves with the wheel"); `wheel-mascot-run.test.ts` reads GSAP ease names off the timeline (`'back.out(1.8)'`), so a change to an equivalent ease fails a test that guards nothing a Member sees; `clip-overlay.test.ts:528` and `veto-bar.test.ts:92` pin Tailwind class tokens (see Q4: they could not catch the empty column).
- `test/unit/wheel-pins.test.ts` is the model: it asserts crossings against the angle function itself.

#### Q11 (later) Dead and half-dead code

- `animate-pop-in`, `--animate-pop-in`, `@keyframes cp-pop-in` and its two reduced-motion rules in `app/assets/css/compies-theme.css` (lines 155, 167, 181, 185): no use anywhere in `app/` (known). Delete. (also S3)
- `mascotPhase(...).stage` ('in' | 'on' | 'out') and `MascotStage` exist for the `data-stage` attribute, which only the tests read; `mascotBox().overhang` is returned and unused outside the function. Either keep as a documented test hook or drop.
- `LuckyWheel.vue:55` `bulbPoints()` runs per instance; it is a constant (make it one in `wheel-look.ts`). `const COLOURS = WHEEL_COLOURS` is an alias for nothing.
- `sideways:right-2.5` in `VetoBar.vue` repeats the base `right-2.5`.

#### Q12 (later) The static chrome is hand-written in the template with numbers `wheel-look.ts` does not own

`LuckyWheel.vue:297-324` hard-codes `r="204"`, `cx/cy 207/208`, `r="190"` (= `BULB_RING_RADIUS`, private in `wheel-look.ts`), `r="201"`, `stroke-width="22"`; the flapper (419-471) writes blade, head and hinge twice, once as its shadow, with the same six attributes each time. Change the band width and the bulb ring has to be edited in two files. Fix: export the band geometry from `wheel-look.ts`, and draw the flapper from one `v-for` over `[{ dx: 3, dy: 3, fill: ink }, { dx: 0, dy: 0, fill: flapper }]` (a Safari filter is why shapes are used, a repeat is not needed). (also S9)

### Deepening proposals (larger than a fix)

For the user to pick from; no interfaces are proposed yet, per the skill. Decision for each: the ADRs 0013 (server clock) and 0015 (GSAP) are not contradicted.

#### D1 Split `LuckyWheel.vue` by what changes together (worth exploring, before 0.13.3) (also S5, S9)

Today one module holds eight concerns: the spin's clock and `running`/`stopped`; the Hidden reveal (`held`, `labelOf`); the rest refill (89-126); label sizing; slice geometry; the show look (pins, bulbs, flapper); the stop's pops; the mascot wiring. It is still readable at 503 lines, but 0.13.3 adds sounds, and sounds need exactly the data the show look already owns: `crossings` for the ticks, `stopped` for the stop, the bulbs' flash time. The deletion test says the right cut is not by file size but by consumer:
- `useWheelSpin(props)` (timing, clock, running, stopped, reduced, ease, angle): the spin's moments in one module; the sounds, the mascot and the card read it instead of each re-deriving gates from `clock`. Interface: a handful of refs. Leverage: 0.13.3 and the mascot; locality: the "which frame am I in" rules (`running`, `stopped`, the stale-clock cases) sit in one place and one test.
- `useWheelRefill(props, running)` (lines 89-126): its watch/baseline/clock ordering is the subtlest code in the diff (it relies on `restSlices` and `running` settling in one flush and on the ticker's `until` watch firing after the refill watch sets `refill`); a composable with a test through its two refs is safer than the current whole-wheel mount tests. I verified the order works today for every case I could construct (stale or null clock, commit during a refill, hidden toggle, empty lists) but it depends on Vue's watcher ordering, not a documented contract.
- `WheelRim.vue` (band, bulbs, flapper; props `lit: boolean[]`, `flapperAngle: number`): the static chrome with its geometry (Q12) and a sealed template that no spin logic touches.
- `WheelRotor.vue` (slices, labels, pins; prop: the layout of this frame): a child whose props change only when the layout does, with the parent applying the rotation on a wrapping `<g>`. Vue then skips the child while the wheel merely turns, which removes most of Q6 structurally (the render of 176 slices and pins on every frame goes away) and not by caching.

Risk: `data-testid` hooks and the Dunkel-Check selector (`wheel-disc`) must stay on the same elements; the nuxt tests mount `LuckyWheel` so they survive a split.

#### D2 One ease/motion module (worth exploring, small) (also S1, P5)

`wheel.ts` has become the home of `bezier`, three eases and `CROSSFADE_MS`, and `wheel-pins`, `-stop` and `-refill` import a general easing helper from a module named for one component. A `app/utils/ease.ts` (`bezier`, `SPIN_EASE`, `SNAP_EASE`, `IO_EASE`, `POP_EASE`) makes Q2's duplicate disappear by construction and gives 0.13.3 and any later server-time animation one import.

#### D3 Fold the mascot's three timing tables into one (speculative) (also S7)

`mascotMoments` (server instants), `buildMascotTravel` (seconds, eases) and `mascotBox().travel` (pixels) describe one choreography in three places in two files, joined by hand (Q2). One `MASCOT_RUN = { enter: { ms, ease, from }, leave: {...} }` consumed by both would be the single place 04-motion's Compibert row maps to. Only worth it if a second mascot or the sounds touch his timing.

### Questions for the user (not asked)

1. Q4: should the Clip stay left-aligned with an empty right column for viewers who get no Veto bar on a phone held sideways, or should it centre when no bar is there?
2. Q1: is the bulbs' blink at rest meant to be a continuous frame loop, or may it wake only every 600 ms?
3. D1: which of the four splits, if any, do you want grilled? (The skill asks "which would you like to explore" and waits.)
