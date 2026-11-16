# Review 0.14 „Politur“ (2026-11-16)

Diff `v0.13.3...origin/spec/621-politur` (tip f2cb1141), the Release spec #621. Per `docs/agents/release.md` § Review, step 1, three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#621, with tickets #602, #603, #604, #606, #607, #608, #609, #610, #611, #612, #613, #614, #616, #617, #618, #639, #640, #471, #587);
- Quality (code quality and architecture).

No browser check: this was a cloud run (no browser, no dev server, no `.env`, no staging). Nothing was measured in a browser. The browser items of #641 and #642 are measured by a later local session. Process docs merged on `staging` before the Release (`docs/agents/`, `.claude/skills/`, `docs/roadmap.md`) were not under review.

## Result

- **No finding is rated must fix.** Standards, Spec and Quality each found nothing that has to be fixed before the Release.
- The findings below keep the reviewers' IDs and tags. Each axis's IDs are its own: Standards S1 is not Spec S1.
- The orchestrator's triage is its own section at the end, verbatim.

## Standards axis

Diff: `v0.13.3...origin/spec/621-politur`, product files only (`app/`, `server/`, `shared/`, `i18n/`, `test/`, `CHANGELOG.md`, design hand-off notes). Sources: `CODING_STANDARDS.md`, `GLOSSARY.md`, `docs/adr/`, `docs/design_handoff_compies/01-tokens.md`, `02-components.md`, `04-motion.md`, the smell baseline of `.claude/skills/code-review/SKILL.md` § 3. Read only, cloud run (nothing seen in a browser).

Overall: the release follows the standards closely. No must-fix. The moves into the documented homes are done (Appearance in `shared/appearance.ts` #603, the one `lift` utility, the layer token with its 01-tokens entry and Deviation note, motion tokens and tests for the backdrop). Findings below are should-fix and notes.

### Hard violations of a documented standard

#### S1 (should-fix) The „+N“ button on the game card has no 44 px hit area

`app/components/GameCard.vue` (the `<button ref="more">`, about line 180): `h-6 … px-1.5`, 24 px tall, and no `hit-44`. `02-components.md` § Common rules: „Hit area ≥ 44 px.“ The button has `relative` (what `hit-44` needs) but not the utility, so on a phone the „+2“ target is 24 px high. Every other small control in the diff (IconButton, the menu rows `h-11`) meets the rule. `hit-44` adds a pseudo-element, so the layout does not change and the button already sits above the stretched link. Fix: add `hit-44`.

#### S2 (should-fix) UserMenu repeats the Appearance list, against #603's „written once“

`app/components/UserMenu.vue` (`appearanceOptions`, lines 1308–1312 of the diff): a hand-written `[{ light }, { dark }, { system }]` with labels, the same as `SettingsCard.vue` (older) and unlike `AppearanceMenu.vue`, which maps `APPEARANCES` from `shared/appearance.ts`. `CODING_STANDARDS.md` § One home: „What an Appearance is (the list …) → `shared/appearance.ts` (#603)“. A fourth Appearance would be added in the list and be missing from two menus without a compile error. Fix: one shared options list (a small composable or util that maps `APPEARANCES` to value and label), used by `SettingsCard`, `UserMenu` and `AppearanceMenu`'s labels.

#### S3 (should-fix) HoldToConfirmButton keeps its own copy of the lift, and presses by another rule

`app/components/HoldToConfirmButton.vue` (non-menuitem branch): `hover:-translate-y-0.5 hover:shadow-card reduced:hover:… motion-reduce:hover:… active:scale-[0.97]`. #608 made `lift` (`compies-theme.css`) the one definition and `02-components.md` § Common rules now says: a shadowed clickable element „moves onto its shadow when pressed“, reduced motion „no movement, no growing shadow“. The Hold button re-implements the hover half by hand and presses by `scale(.97)` instead of the 4 px translate. The § HoldToConfirmButton text still has the press-scale (its own Motion line), so this is a documented difference, but the hover is a second copy of the lift (the 1.3 review's failure: a pattern copied beside the one just collapsed). Fix, or a PR-description line saying why the Hold button stays apart.

#### S4 (should-fix) Design hand-off notes miss two 0.14 changes to GameCard

`docs/design_handoff_compies/02-components.md` § GameCard has a 0.14 Deviation for #608 only. #612 (every tile and card reserves two title lines, `min-h-[2lh]`) and #614 (the Tags sit on the card's bottom edge on one line and „+N“ is a button opening a popover of all Tags) are shipped (CHANGELOG, `GameCard.vue`) but written nowhere in the notes; `RevealPopover` mentions #614 as a user only. The notes are the design contract (`02-components.md` header: every deviation is listed). Also not listed: `AppearanceMenu` has no `##` section or index entry (only the 15-header Deviation), `SegmentedControl`'s new `arrows` prop and `AppShell`'s `covered` / `layers` are in code comments only.

### Smell baseline (judgement calls, labelled)

#### N1 (note) Possible Duplicated Code: `useAppearance({ onFailed: () => toast(…) })`

`AppearanceMenu.vue` and `UserMenu.vue` carry the same three-line wiring (toast tone `error`, `settings.appearanceSaveFailed`). Both are mounted in the header at once (CSS hides one), so there are two instances of the save queue as well. A `useAppearance` default for „says its failure in a toast“, or one small wrapper, would hold it once.

#### N2 (note) Possible Duplicated Code: NoticeBanner's two branches

`NoticeBanner.vue`: the new `v-if="hostOnly"` branch and the `v-else` branch each hold their own `<slot />` and `<slot name="action" />` wrapper. Acceptable for a two-shape layout (the spec wants the Host-only shape different at every width), flagged only because a third notice change has to touch both.

#### N3 (note) Possible Speculative Generality / dead classes: reduced twins on AppButton

`AppButton.vue` still carries `reduced:active:translate-0 motion-reduce:active:translate-0`. After the 173c1983 fix `lift` itself never moves a pressed element under reduced motion, so these two are redundant (the `aria-disabled:active:translate-0` stays needed). Harmless; removing them lets the utility be the only place.

#### N4 (note) Hidden contract in `useDropdownMenu`

The composable reads `useTemplateRef('root')` and `close()` focuses the first `[aria-haspopup="menu"]` in it: the caller must name its root `ref="root"` and have exactly one such trigger. It is written in the header comment, but nothing enforces it (a rename in one menu breaks keyboard focus return silently). Passing the root ref in would remove the string coupling (Mysterious/Hidden dependency).

#### N5 (note) Mirrored constants that can drift

- `app/utils/wheel-mascot.ts`: `WHEEL_MAX_PX` (340 / 420) mirrors the `max-w-[340px] md:max-w-[420px]` classes of the wheel disc in `LuckyWheel.vue`, `WHEEL_CARD_PADDING_PX` (16) mirrors `p-4` on the card. The unit test pins the constant (`toBe(16)`), not the class. The JSDoc names the mirror; no test reads the Vue file. A change to the disc's width makes the bust size wrong at no failing test.
- `EventStepper.vue`: `md:mr-[356px]` is the info column's `w-[340px]` plus the 16 px gap, and `pb-40` is the pill's height plus a three-line reason; both are Tailwind literals written in two places in the same file (comments give the sum).
- `--cp-backdrop` is written three times with one value (light, dark, system-dark) although it does not change by theme; one `:root` entry would do. 01-tokens says „the same in Hell, Dunkel, System“, so it is a choice, not a breach.

#### N6 (note) Possible ARIA ownership slip in UserMenu

`UserMenu.vue`: a `role="radiogroup"` (SegmentedControl) sits inside `role="menu"` under a `role="none"` wrapper. A `menu` owns `menuitem*` (and groups of them), not radios; some screen readers drop the radios from the menu's walk. Arrow keys were made to work (`arrows="horizontal"`), and a test pins the radios. `menuitemradio` rows (as `AppearanceMenu` uses) would be the conforming pattern; the Profil page's control cannot be reused as is. Judgement call, for the browser/AT check.

#### N7 (note) HoldToConfirmButton `menuitem` header comment says more than the code does

Comment: „the variant's background and size do not apply“. Code: only `secondary` and the size classes are gated by `!menuitem`; `hot` and `primary` still paint `bg-hot` / `bg-primary` on a menu row. The only user (`MoveToMenuList`, „Entfernen“, „Neue Terminsuche“) passes `secondary`, so nothing shows today.

#### N8 (note) Out-of-release entries in the diff

`GLOSSARY.md` gains **Tour** and `docs/adr/0017-the-tour-is-built-in-house.md` appears in the range: they belong to 0.15 („Tour“, #622), not to 0.14, and no 0.14 code uses them. Process docs, not under review; mentioned so that the CHANGELOG/roadmap check does not read them as 0.14 scope. `server/dev/sign-in.ts` `member2` (#599) is not among the spec's tickets either.

### Checked and fine (no finding)

- **Homes:** Appearance (list, guard, cookie) only in `shared/appearance.ts`, schema CHECK built from it with the same SQL text as before (no migration needed); the Event page's „seat“ piece removed from `event-stage.ts` with its component, helper, i18n keys and the block type; stage-piece home untouched otherwise.
- **Motion:** the backdrop enters on `cp-fade-in` over `--cp-dur-slow` / `--cp-ease-out`, leaves on `dur-base ease-in` (04-motion Deviation entry agrees); `clip-backdrop.test.ts` asserts class names, the `--animate-backdrop-in` tokens and both reduced twins (OS setting and `data-motion=reduced`); `lift.test.ts` and the theme's lift block cover the reduced geometry (no translate, tint). Backdrop uses `<Transition>` on a `v-if` inside an already-mounted component, so the pending-Suspense rule does not bite.
- **Layers and tokens:** `layer-backdrop` 25 added to tokens, theme, and 01-tokens with a „Deviation (0.14, #621)“ line; no raw z-index; no raw colour outside the tokens file.
- **Teleported sheets/dialogs** (AppSheet, ConfirmModal, ShareDialog and so on) live in `<body>`, so the `inert` on the page regions does not lock them, as 02-components says.
- **Copy:** no new retired word; no hard-coded German in new components (all through `t()`, keys exist: `settings.appearance|light|dark|system|appearanceSaveFailed`, `nav.profile`, `common.hostOnly`, `library.moreTags`); CHANGELOG groups are only Neu / Geändert / Behoben / Entfernt in order, German, with issue links.
- **Tests:** edge cases for the Tags popover (4 and 5 Tags, ≤ 3 none, longest label), the plate (resting, own lift, someone else's pick, finger after the long press), the mascot width at the thresholds; deviation notes accompany each design change except S4.
- **Personal data:** none in the diff (fixtures use the existing test people, `Dev Member 2` is a dev stand-in).

## Spec axis

Verdict: All 68 user stories and every ticket's acceptance list have a matching implementation, a test, the changelog line (Neu: #587, #617, #618, #614; Geändert: #471, #607, #608, #611, #612, #613, #616; Entfernt: #610; Behoben: #609, #604; none for #602, #603, #606, #639, #640) and the named hand-off note (Clip, tokens, motion, stepper in 02/03, hint, avatar menu in 10/15, rule for the aura and the lift, 16-compibert line). No must-fix found. One should-fix about a stated requirement (hard load mid-Clip), two small ones, and notes.

Operator decisions taken from the issue comments: #604 card width alone decides, tablets get the big bust; #613 „Weiter“ keeps one place on every step; #621 build beside #620. Diff at tip f2cb1141. Read only; cloud run, nothing measured in a browser.

### (a) Missing or partial

**S1. should-fix. A device that opens the page mid-Clip gets the backdrop after hydration, not with the Clip.**
- Spec #621 story 9: „As a Member who opens the page while a Clip runs, I want the backdrop there at once with the Clip.“ Decision: „The backdrop appears with it, also for a device that opens the page mid-Clip.“ Ticket #587: „the backdrop appears with it, also for a device that opens the page mid-Clip“.
- `app/components/EventPage.vue` 74-77, 353-356, `app/components/ClipOverlay.vue` 208-211: `clipShown` is `clipOpen && !!data.clip`, and `clipOpen` is set only by `ClipOverlay`'s `watch(open, emit, { immediate: true })`. `ClipBackdrop` sits in the `layers` slot before `ClipOverlay`, so in a server render it is drawn while `clipOpen` is still false. The Event read goes through `useFetch` (`app/composables/useEventView.ts:19`) and the overlay's own comment says a hard load renders it on the server (`open` is true on the server: `now` is null, `ended` false).
- Failure: hard load or reload of `/e/<slug>` during a running Clip. The server HTML holds the bright page plus the Clip, no backdrop and no `inert`. After hydration the child's emit flips `clipOpen`, the backdrop fades in over `dur-slow` (0.36 s), so the page is bright first and the covered regions are focusable until then.
- The new tests mount client-side (`mountSuspended`), so none sees it. A client-side navigation is fine (the emit lands before the next paint).
- Fix direction: `clipShown` also true while the page has not mounted and `data.clip` exists (the overlay is open on the server too), or have `clipOpen` start from `!!data.clip`. Worth one browser item on #642 either way (hard load mid-Clip).

**S2. note. #606 „Stay“ list names „standing still ... in a hidden tab“; no mounted bulb test has that case.**
- Ticket #606: „Stay: the wheel at 0, 1, 2 and 30 games; standing still out of view and in a hidden tab“. The implementer's merge comment says the file never had one and the wheel does not stop its bulbs in a hidden tab, and the ticket says „No change to the wheel's code“. Out-of-view is covered (`test/nuxt/wheel-bulbs.test.ts` 127, 196). Nothing to build; the ticket text asked for something that was not there. Recorded so the operator knows.

**S3. note. Found by #639, still open: `pathOf`'s exact-360 degree branch in `LuckyWheel.vue` is pinned by no test.**
- The kept mounted check reads `A180,180`, which the general arc branch also produces at 600 ms (~359.95 degrees). Not a regression (the removed test read the same moment), but it is the gap the implementer asked the Release review to look at. No fix ticket needed unless the operator wants the branch pinned in `test/unit/wheel-refill.test.ts`.

### (b) Behaviour not asked for

**B1. note. The hint's native tooltip is removed (`IconButton` gets a `tooltip` prop, `HintElement` passes `false`).**
- Spec says only for „+N“: „Its native tooltip goes.“ Nothing says the hint loses its `title`. Reason given (a hover-opened popover next to a native tooltip) is sound and the exception is written into `02-components.md` § HintElement, so no change needed. Keep or drop is the operator's call.

**B2. note. Reduced motion also removes the press movement of every `lift` element, and a pressed card moves.**
- Spec #608: „A pressed control moves onto its shadow on both axes“; „under reduced motion a hovered control shows the tint without a growing shadow“. The utility (`compies-theme.css` 250-285) additionally (1) stops the press translate under reduced motion for every `lift` user (AppButton already had `reduced:active:translate-0`; the avatar trigger and others had not) and (2) applies the press to a game card now that it carries `lift`: pressing anywhere on a library card or tile moves it 4 px right and down and drops its shadow, although a card's shadow is `shadow-sm`, not the 4 px button shadow. Both follow from „the existing lift utility goes onto a game card“ and are in the changelog line, so this is documented; only the card press is a look nobody asked for. Browser item on #642 (press on a card) would settle it.

**B3. note. A 320 px cap on the blocked reason above the stepper pill (`max-w-80`) and `pb-40`.**
- Spec: „The line that says why „Weiter“ is blocked stays above the pill“; „The form reserves the pill's height“. The cap and the 160 px reserve are the implementer's numbers for the longest reason (the open TODO of the #613 brief); both are in the 03-screens deviation. Needs the browser item „last line of the longest step visible above the pill“ (already on #641).

**B4. note. `overflow-hidden` on `<html>` as the backdrop's scroll lock.**
- Spec: „the page behind does not scroll, as under a sheet“. The code's own comment says no sheet locks scroll, so this is the first lock in the app. It does what the spec wants; on a desktop with a classic scrollbar it removes the scrollbar and shifts the page by its width at the Clip's start, behind an 85 % black layer. Not worth a ticket.

### (c) Implemented, but wrong or doubtful

**C1. should-fix (small). Hold rows in the Session „Mehr“ menu do not line up with the plain rows.**
- Spec story 21: „flat rows like the entries above them“; ticket #607: „flat rows with the plain entries' height, type and hover“. `HoldToConfirmButton.vue` menuitem branch (131-133, template 160-185) has the right height (`min-h-11`), type (`text-[15px] font-semibold`) and hover (`hover:bg-surface-2`), but the icon is `:size="18"` with `gap-2`, while `MoveToMenuList.vue` plain rows use `AppIcon :size="20"` with `gap-3`. In the Session menu the plain entries carry icons (Download, CalendarClock: `EventSessions.vue` 109-110) and the hold entries too (Search, Trash2: 111-112). So the label of „Neue Terminsuche“ and „Entfernen“ starts 6 px left of the labels above them, and the icon is 2 px smaller. Not measured here; the 0.14-20 measured-numbers brief for #607 should include the label's left edge.

**C2. note. Two `useAppearance()` instances can race.**
- Spec story 59: „applied at once and saved with me, exactly as on the Profil page“. `useAppearance` keeps `saved` and `sending` per call. From md up on the Profil page there are two live instances (the header button, `SettingsCard`), plus `UserMenu`'s on every page. A choice in the header followed at once by one in the Profil row sends two POSTs without the second waiting for the first (each instance's `sending` is false), so arrival order decides what the server keeps, and a failure puts back the failing instance's stale `saved`. Narrow case (two controls used within one round trip); the spec's „exactly as on the Profil page“ holds per instance. A module-level queue would close it. No ticket needed unless the operator wants it.

**C3. note. „Nur du siehst das“ notice: the icon chip is vertically centred against the whole column.**
- Spec story 34 / ticket #611: „the icon chip at the left; beside it a column with the label as a small bold line, a divider under it, the text, and the action button below the text.“ `NoticeBanner.vue` keeps the outer `items-center`, so with label, divider, text and action the chip floats at mid-height of a tall column (two or three lines at 390 px). The spec gives no alignment; a top-aligned chip may be what the design wants. The six notices at 390 and 1440 px are already browser items on #641 (the operator judges the look).

**C4. note. Tests that pin class tokens, where the spec's Testing Decisions and #606 rule against them.**
- Spec § Testing Decisions: „A good test here checks what a Member or a Host can observe, never how a component is built inside“; #606 removes class-token tests (Q10). New tests of #613 (`event-stepper-layout.test.ts`: `fixed`, `bottom-4`, `h-0 justify-end`, `md:mr-[356px]`), #612 (`game-card.test.ts` „reserves the lines“: `line-clamp-2`, `min-h-[2lh]`), #607 (`hold-to-confirm.test.ts`: `shadow-btn` absent) and #608 (`lift`) assert class names. Where jsdom/happy-dom cannot compute layout this is the only seam, `test/unit/lift.test.ts` compiling the utility is the more honest form, and the measured browser items cover the real numbers. Noted, no change asked.

### Checked and found to match

- **#587** backdrop is its own element outside the Clip's section (`ClipBackdrop.vue`, in `AppShell`'s `layers` slot); new layer `--cp-z-backdrop: 25` between header 20 and dock 30; token `--cp-backdrop` `rgba(8,5,12,.85)` in all three blocks with a test next to the system-appearance test; header, stage, panel, banner, skip link, tab bar and footer `inert`; Clip, Veto bar and Host dock moved into `layers`, so they stay lit; sheets and the Bonus Veto's ConfirmModal are teleported to `body`, so not inert; click does nothing; scroll lock; start/end/skip/„Für mich schließen“ as decided; card of a game without a video and failed player count as open; reduced motion falls to `cp-fade-in` `dur-fast`; `clip-overlay.test.ts` player test untouched (additions only).
- **#471** `aura` option on `AppButton`; Home and library head use it, no `class="aura"` left, empty state plain; rule in 02-components.
- **#602, #603** names `ownColor`/`color`; header comment now states the clash rule; Glossary sentence; three edge-case tests; `shared/appearance.ts` holds list, type, guard, cookie; no re-export in `shared/auth.ts`; CHECK built from `APPEARANCES` (`sql.raw` of own constants); no migration; `CODING_STANDARDS.md` row.
- **#604** `mascotWidthFor(cardWidth, wheelMax)` with `C >= W + 192` (612 / 532), `ResizeObserver` on the card (content box, padding excluded), null is `sm`; boxes unchanged; the 16-compibert note. Math checked: `(C+W)/2 + 112 <= C + 16`.
- **#606, #639, #640** merge comments name every removed case with its unit test; server-clock call counts gone from mounted wheel tests; Veto bar sideways test removed with its #642 item; player test unchanged.
- **#607** dock and stepper pill `pt-1.5 pl-1.5 pr-2 pb-2` (8 px against a 4 px or 6 px shadow); hold entries flat with fill and „1 s halten“ badge; `gap-1.5` between rows; the dock's phone sheet untouched; dock/card hold button keeps its look (test).
- **#608** `lift` on `GameCard` only when `to` or `opens` (library cards, `GameTile` everywhere it is used; pickers, Veto window, Clip stay still); press on both axes; hover lift only where the device hovers (Tailwind 4's `hover:` for the hold button, `@media (hover: hover)` in the utility); reduced motion tint without growing shadow; rule in 02-components.
- **#609** plate (`data-testid="name-plate"`, absolute, `bg-surface`, name row `relative`), no layout size.
- **#610** component, both texts, `seatNote`, block `'seat'` and its piece gone; Member notices untouched.
- **#611** all six users go through `NoticeBanner`'s `hostOnly` branch (label line, divider, text, action below); non-Host-only keeps today's layout; closable button kept.
- **#612** `min-h-[2lh]` with the two-line clamp in the tile, card and `md:` of the responsive layout; the one-line row below 980 px unchanged.
- **#613** pill `fixed bottom-4` in a zero-height `justify-end` anchor, inset 356 px on a step without the info column (the operator's decision: one place on every step), Zurück from step 2, reason above the pill, `pb-40`; settings editor uses the same stepper; deviations in 02 and 03.
- **#614, #616** one shared `useRevealPopover` (hover, 120 ms close, pointer onto the popover, focus, Esc, pin, press outside, scroll, resize); the Date poll's `useNoteReveal` untouched; „+N“ a `h-6` button with `text-[12px]` above the stretched link, native tooltip gone, popover lists every Tag in game order, three Tags on the card; Tags `mt-auto`; hint is one circle with a bare glyph, stepper phone info button same glyph, desktop heading keeps `CircleHelp`; Deviation note for „click or tap“.
- **#617, #618** `AppearanceMenu` left of Sound, from md up (`max-md:hidden`), signed in only, three radio items with tick, Esc returns focus; row in `UserMenu` below md; both call `choose`; failed save switches back and toasts with the existing text; Profil page row follows; „Profil“ directly above „Abmelden“; deviation notes in 10 and 15. No new i18n key was added (only the two seat keys removed).
- **Out of Scope respected:** `useNoteReveal`, `CODING_STANDARDS.md` § Motion, Datenschutzerklärung, #605/#615, Host dock sheet all untouched; no wording change.
- Files in the range that are not 0.14's (`.env.example`, `server/dev/sign-in.ts` member2, `scripts/browser/`, Glossary „Tour“, ADR 0017, `docs/agents/`) come from staging merges (#599, roadmap) and were not reviewed.

## Quality axis

Reviewed `v0.13.3...origin/spec/621-politur` (tip f2cb1141), product files only. Read by hand, no browser. No must-fix found. The correctness risks are mostly latent or narrow; the structural findings are where this Release added a second copy of something or a hidden contract.

### Should-fix

#### S1. Two `useAppearance` instances can race, and a failure in one overwrites the other

`app/composables/useAppearance.ts:10-52`, used by `AppearanceMenu.vue:13`, `UserMenu.vue:14` and `SettingsCard.vue:10`.

`sending` and `saved` are closure state per call, but the Appearance they guard is the one shared `useAuthUser()` state. On `/profil` from md up, the header's AppearanceMenu and the SettingsCard's SegmentedControl are both mounted and visible. Failing sequence:
1. The User picks Dunkel in the header (instance A sends).
2. A moment later they pick System in the card. Instance B has `sending === false`, so it sets `saved = appearance.value` (the optimistic Dunkel, not the server's value) and POSTs in parallel.
3. The two POSTs can land in either order, so the server can end on Dunkel while the page shows System.
4. If A's POST fails, `show(saved)` puts back the old server value and wipes B's pending choice.

The header also mounts both UserMenu's row and AppearanceMenu at every width (CSS-hidden only), so the same split exists there at the md boundary.

Remedy: one shared save queue (module-level or `useState`-backed `sending` and `saved`), with `useAppearance` keeping only per-caller `onFailed`.

Related duplication this would also remove: the options array `{light, dark, system} → t('settings.*')` is written out verbatim in `UserMenu.vue:17-21` and `SettingsCard.vue:11-15`, and a third time in `AppearanceMenu.vue:16-17`. The toast wiring `onFailed: () => toast({ tone: 'error', text: t('settings.appearanceSaveFailed') })` is copied in the two header menus. All of it belongs next to the composable.

#### S2. `lift` is now a second implementation beside `HoldToConfirmButton`'s hand-written one, and `AppButton` keeps dead classes

- `HoldToConfirmButton.vue:~132-135` spells out the hover-rise, the reduced-motion twin and the tint as a class string: `hover:-translate-y-0.5 hover:shadow-card reduced:hover:shadow-btn motion-reduce:… reduced:hover:tint`. That is the same behaviour `@utility lift` now owns after #608. Two places must change together the next time the lift rules move, and the tests pin class tokens to keep them in step (`hold-to-confirm.test.ts` "keeps its resting shadow under reduced motion"; `lift.test.ts` "the hold button hover", which compiles those classes). Only the press differs (scale instead of translate). Suggest `lift` plus a press override, or a documented reason why the hold button must not use it.
- `AppButton.vue:36` still carries `reduced:transition-colors reduced:active:translate-0 motion-reduce:transition-colors motion-reduce:active:translate-0`. After #608 `lift` no longer moves on `:active` under reduced motion, so the two `active:translate-0` classes are dead. `aria-disabled:hover:translate-y-0 / aria-disabled:active:translate-0` are still needed. Delete the dead ones, otherwise the next reader assumes `lift` still translates there.
- `lift` on a clickable GameCard (`GameCard.vue:101`): `:active` matches when any descendant is pressed. Pressing an `#actions` button (Vote, Pick) or the „+N“ button makes the whole card sink 4 px and lose its shadow, in addition to the button's own press. Likely not intended ("a lift always means a click"). Consider `:active:not(:has(button:active, a:active))` or lifting only the stretched link's target.

#### S3. `HoldToConfirmButton` `menuitem` leaves the variant fill on

`HoldToConfirmButton.vue:~136-137`: the doc comment (line 13-14) says "the variant's background and size do not apply" as a menu item. Size and `secondary` are gated with `!menuitem`, but `'bg-hot text-on-hot': variant === 'hot'` and `'bg-primary text-on-primary': variant === 'primary'` are not. `variant` defaults to `'primary'`, so `<HoldToConfirmButton menuitem …>` without an explicit `variant="secondary"` renders a primary-filled row that also carries `text-ink`, so the text colour depends on stylesheet order. The only caller (`MoveToMenuList.vue:58`) passes `secondary`, which hides it. The test uses the same props, so nothing guards the default. Gate all three fills with `!menuitem`, or make `menuitem` ignore `variant`/`size` in one place.

#### S4. The Clip's backdrop shifts the page by a scrollbar width on desktop

`ClipBackdrop.vue:12-15` puts `overflow-hidden` on `<html>`. There is no `scrollbar-gutter: stable` anywhere in `app/` (grep). On a desktop with classic scrollbars (Windows, which is the operator's machine) the page reflows about 15 px when the Clip arrives and again when it ends. The 85 % scrim hides most of it on the way in but not the reflow when it fades out. Add `scrollbar-gutter: stable` on `html`, or compensate in the same watcher. This is a browser-check item (#641) but cheap to settle in code.

#### S5. A pinned Reveal popover outlives the Tab that leaves its trigger

`useRevealPopover.ts:166-168` (`onBlur`: `if (!pinned) hide()`). Keyboard flow: Tab to the „+N“ or „?“ (focus opens it), Enter (pins), Tab on. The popover stays open, floating over content, until Esc, a press outside, or the trigger is clicked again. Esc does work from anywhere (the capture handler is on `document`), so this is not a trap, but a keyboard User gets a popover they never asked to keep once focus has gone elsewhere. Suggest unpinning on blur when focus leaves both trigger and popover (`relatedTarget`), or at least stating the behaviour in the 02-components § RevealPopover note.

#### S6. Hidden contracts in `useDropdownMenu`

`useDropdownMenu.ts:1-4, 7`.
- It reads `useTemplateRef('root')`, so the caller must have a literal `ref="root"`, and the caller must also wire `@keydown.esc/.down/.up` to the returned `close`/`move`. Nothing enforces either; forgetting one gives a menu that opens but has no keys.
- `UserMenu` selects items with `[role="menuitem"], [role="radio"][tabindex="0"]` (`UserMenu.vue:24`), which depends on `SegmentedControl`'s internal roving-tabindex markup.
- `menuItems` is exported only so each caller's `initialFocus` can call it.

The interface is nearly as large as the work behind it (shallow by the deletion test: the two callers would each need ~5 lines again). Deepen it by attaching the key handling itself (`useEventListener` on the root in `onMounted`), taking the root as an argument instead of a magic name, and giving `initialFocus` the item list as a parameter.

#### S7. Test seams that assert markup instead of behaviour

The 0.14 tickets mostly say so themselves ("geometry cannot be measured here: the markup that decides it is pinned"), and #640 dropped the Veto bar's class-token test for this reason, so the rule is not applied evenly:
- `event-stepper-layout.test.ts` (new 5 tests): `pb-40`, `md:mr-[356px]`, `h-0 justify-end`, `fixed bottom-4 layer-sticky`, `max-w-80`, DOM nesting depth (`parentElement.parentElement`). These repeat the template line for line and pass whatever the layout does. The real risks of the fixed-pill technique (a fixed box with no left/right relying on its static position, the 356 px being 340 + 16 copied from another file's column, `pb-40` a magic number for pill + three-line reason) are only visible in a browser. They belong on #641's list; the tests only make the next refactor harder.
- `clip-backdrop.test.ts`: `classes()` containing `fixed inset-0 layer-backdrop bg-backdrop`, and `transition.props('enterActiveClass')` equals a string. Pure restatement of the template. The CSS regexes in the same file (`--animate-backdrop-in:[^;]*cp-fade-in…`) restate `compies-theme.css`. The overflow-lock tests and the `inert` tests in `event-clip.test.ts` are the useful ones.
- `hold-to-confirm.test.ts`: four tests on class tokens (`shadow-btn`, `outline-memphis`, `reduced:hover:shadow-btn`).
- `app-button.test.ts` / `library.test.ts` / `index.test.ts` assert `classes()` contains `aura`. For these the class is the seam (the `aura` prop's whole effect), so I would keep them.
- Good ones, for contrast: `reveal-popover.test.ts` (drives the composable by events), `lift.test.ts` (compiles the real utility), `appearance-menu.test.ts`.

### Notes

#### N1. `AppShell` `covered` is five attributes plus one in the caller

`AppShell.vue` adds `:inert="covered || undefined"` on the skip link, the header, the content row, HubNav and the tabs div; `EventPage.vue` adds a sixth on the banner wrapper because the `banner` slot cannot be wrapped from AppShell. The next region added to the frame (or the next slot) will silently stay interactive under a Clip. One wrapper would do it: a single `<div class="contents" :inert="covered || undefined">` around everything except `<slot name="layers" />` (inert is attribute-based, `display: contents` keeps the flex column and the sticky header working). That also covers the banner slot, so the EventPage workaround goes. Worth trying in the browser check before the next Release; it is the one concrete deepening this Release's code makes.

#### N2. Teleported layers are not under the scrim's `inert`

Sheets (`AppSheet`), `ConfirmModal`, `NoteDialog`, `CeremonyLayer` and `RevealPopover` teleport to `<body>`, outside the `inert` regions. A dialog open when a Clip arrives stays usable and, at z 40-55, above the backdrop (25). Probably the right visual outcome; but the spec text "takes no pointer, tap or key" is then true only for what is in the frame. State it in 02-components § ClipPlayer, or make the Clip close them. Also: focus is not restored when `inert` lifts, and the page has no `aria-hidden`-equivalent signal besides `inert` (fine for AT).

#### N3. Hydration: `covered` arrives a tick after the first paint

`ClipOverlay.vue:211` emits `shown` from an immediate watcher during its own setup. The parent's `clipShown` is therefore false in the first render (server HTML and first client render agree, so no mismatch), and the backdrop and `inert` appear one update later. On a hard load into a running Clip the page is briefly lit and usable. Cosmetic; passing `:shown` from `data.clip` plus a "not closed on this device" read in the page would avoid it, at the cost of moving `closedByMe` out of the overlay.

#### N4. Copy of the popover shell and of `ignoreScrollForAWhile`

`RevealPopover.vue:47` repeats the box class string of `GameNotesButton.vue:119` (and part of `NotePopover.vue`); `useRevealPopover.ts:127-134` repeats `useNoteReveal`'s two-frame scroll guard. Both are deliberate and stated in the header comments ("imports nothing from it"), and the Notes rules do differ. Two copies is still the point where a third (the next hover popover) should pull out `popoverBoxClasses` and `ignoreScrollForAWhile` into one home. No action now.

#### N5. `NoticeBanner` Host-only branch

`NoticeBanner.vue:42-66`: `v-if="hostOnly"` and `v-else` each carry the text slot and the action slot. The non-Host branch keeps a wrapper `div` (`flex-col gap-1 sm:flex-row`) that now holds a single `span` since the badge left. Harmless; a single container with an optional label + `<hr>` on top would delete a branch and the dead wrapper.

#### N6. `useRevealPopover` details checked and found sound

Listener lifetime (attached only while open, removed on `hide` and unmount), the armed-click focus return (the capture `pointerdown` added during dispatch does not see the current event), touch (taps pin by click, no focus on iOS), Esc capture so a surrounding sheet keeps its own Esc, and the timers (`closeTimer` cleared in `hide`) all hold. One judgement: `resize` closes the popover, which on a phone browser fires when the address bar collapses; scroll closes it anyway, so no new failure.

#### N7. `LuckyWheel` card width

`LuckyWheel.vue:230-234` observes the section with a bare `ResizeObserver`, null until the first report, so the first (and server) render is the small bust and swaps to the big one on mount. Correct, and matches `HubNav`/`CeremonyLayer`. The section is already `@container`, so a container query could pick the bust in CSS, but the rig size drives GSAP in JS, so the observer is the right call. `mascotWidthFor` has no hysteresis: a card hovering around 532 px (wheel 340) or 612 px (wheel 420) flips the bust size on every resize pixel while dragging the window. Unit-tested at the threshold only; fine for now.

#### N8. Wording drift

`ClipOverlay.vue:208-209` says the backdrop "shows exactly while this is true: it is closed on this device, or ended, or never opened": the sentence describes the opposite of `open`. Fix the comment when next touching the file.

## Triage (the orchestrator's decisions)

No reviewer found a must-fix. The should-fixes below became three fix tickets, built on the integration branch before its PR leaves draft:

- **#657 (0.14-24)** the Appearance's one save state and one list of choices: Quality S1, Spec C2, Standards S2, Standards N1.
- **#658 (0.14-25)** a card presses only for its own click, „+N“ with a 44 px hit area, the Clip's backdrop without a sideways jump, the ClipOverlay comment: Quality S2 (the press on inner controls), Quality S4, Spec B4, Standards S1, Quality N8. The orchestrator checked S4: no sheet locks the scroll on `<html>`, so the jump is new with #587.
- **#659 (0.14-26)** the hold rows' icon and gap, no variant fill in a menu, AppButton's redundant reduced press classes, the hand-off deviation notes, the full-circle test: Spec C1, Quality S3, Standards N7, Standards N3, Standards S4, Spec S3 (also found by #639's implementer).

Not fixed, with the reason (they go into the Release PR's „Review notes not fixed“):

- Spec S1, Quality N3 (a hard load into a running Clip shows the backdrop only after hydration): the Clip itself appears on the client too, and the spec ties the backdrop to the Clip's own enter. An item on #642 measures that both appear together.
- Quality S5 (a pinned popover stays open when Tab moves away): as the spec decides („pins it open until a click outside or Esc“).
- Quality S2, Standards S3 (the hold button keeps its own hover classes and its `scale` press instead of `lift`): the hold is its own gesture (`04-motion.md`), and user story 23 keeps its look; the review names it for a later tidy-up.
- Quality S6, Standards N4 (`useDropdownMenu`'s hidden contracts), Quality N1 (`AppShell` repeats `:inert` six times; one `display: contents` wrapper would do): deepening candidates, no defect; for an Idea issue if the operator wants one.
- Quality S7, Spec C4 (new tests pin class tokens): without a browser the classes are the only seam; the browser items on #641 and #642 measure the result.
- Standards N2, Quality N5 (`NoticeBanner`'s two branches each carry the slots), Spec C3 (the icon chip centred against the whole column in a Host-only notice): judgement; the chip's place is an item of the #641 check.
- Standards N5 (mirrored constants without a test tying them to their classes): judgement.
- Standards N6 (the avatar menu's Appearance row is a `radiogroup` inside `role="menu"`): the spec asks for „the control the Profil page uses“ there; the ARIA ownership slip is named for the operator.
- Quality N7 (`mascotWidthFor` has no hysteresis): the bust does not change the card's width, so no loop.
- Spec S2 (#606's „hidden tab“ has no mounted case): it never had one, and the wheel does not stop its bulbs in a hidden tab.
- Spec B1 to B3, Quality N2, N4, N6, Standards N8: checked, no change needed.
