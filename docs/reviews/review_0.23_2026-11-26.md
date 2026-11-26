# Review 0.23 „Auftritt“ (spec #927), 2026-11-26

Diff `v0.22.0...spec/927-auftritt` at d74f28aa, two `sonnet` reviewers at high effort (`docs/agents/release.md` § Review). No browser check by the user's waiver.

## Standards


Read: CODING_STANDARDS.md (all), the non-test diff in full, the tests for the Motion rules (theme-reveal, boot-motion-tweens, boot-splash). No hard violation found. The Motion rules are met (tokens `--cp-dur-slower`/`--cp-ease-io`/`--cp-dur-fast` asserted in `test/nuxt/theme-reveal.test.ts`; the splash's GSAP eases read off the timeline in `boot-motion-tweens.test.ts`; static fallbacks tested). `durationToken` lint rule respected (`motionMs` used). New cookie and storage entry are in the Datenschutzerklärung (§ 9), the Stand is moved. New rows were added to the One-home table for splash, install hint, duck and cue plans.

## Must fix
None.

## Judgement calls

1. **Duplicated Code: `arrivalOf` (agree with the orchestrator's nit).** `app/composables/useHeaderReaction.ts` L21-30 copies `arrivalOf` of `app/composables/useCuePlayer.ts` L82 and its "previous read = baseline" watch. Its comment says "under change in #670"; #670 is merged and did not touch it. CODING_STANDARDS § One home: "a second copy is a finding even when it works". Export one `arrivalOf` (next to `VetoArrivalState` in `app/utils/sound-cues.ts`) and delete the comment.

2. **Duplicated Code: the Emote's own/late rule, three times.** `emoteCue` (`sound-cues.ts` L396), `emoteReaction` (`app/utils/header-reaction.ts` L27: `!own || now - serverTime > ARRIVAL_LATE_MS`) and the two `message.userId === …viewerId` lines (`EventPage.vue` `playEmoteCue`, `useHeaderReaction.ts`). The comment calls it "the rule of `emoteCue`", so name it once (`emoteArrivedLate`/`isOwnEmote`) in `sound-cues.ts`. Related: `provideHeaderReaction` registers its `emote.sent` handler before the page's, while the § Motion/cue row says `emoteCue` is called "before anything that draws"; harmless (a shallowRef set) but worth one line.

3. **Stale file name (agree with the nit).** `app/utils/theme-reveal.ts` L6 and L15 say `main.css`; the rules are in `app/assets/css/compies-theme.css` (the Release PR note says so too).

4. **Speculative Generality: `rig-reaction.ts`.** `Reaction.seconds` ("a cheer after a wheel stop lasts 1.6 s") has no caller, and `RIG_REACTIONS` holds `sad` and `cheer` that nothing reacts with (the header uses wave, angry, clap, laugh, roar; the sad head is baked). `cheer`/`sad` mirror 04-motion's table, so keeping them is defensible; the `seconds` override is the part to drop or defend in the PR.

5. **One-home table has no row for three new concerns.** The Theme reveal (`shownLook` in `app/utils/appearance.ts`, `revealTheme` in `theme-reveal.ts`, called by `useAppearance`), the header reaction (`header-reaction.ts`, `useHeaderReaction`) and the rig reaction layer (`rig-reaction.ts`, `admitReaction`) each say "the one rule of …" in a comment but are not listed in CODING_STANDARDS § One home per concern. The Release added rows for the splash, install hint and duck, so these three are the odd ones out and the next ticket cannot find the home.

6. **Primitive Obsession / repeated union: head moods.** `'confused' | 'sad'` is typed separately in `Compibert.vue`, `EmptyState.vue` and as `as const` in `FullScreenState.vue`. `FullScreenState.vue` L16-17 then casts: `MOODS[props.kind as keyof typeof MOODS]`. Type `MOODS` as `Partial<Record<Kind, CompibertMood>>`, export `CompibertMood` once, drop the cast. In `Compibert.vue` the computed `mood` shadows the prop `mood` (rename `shownMood`).

7. **Layering: first `app` import from `~~/server`.** `Compibert.vue` imports `~~/server/assets/compibert/compibert-head-{confused,sad}.svg?raw`. No other `app/` file imports from `server/`. The comment gives the reason (one copy with the bake), so it is a deliberate crossing; consider baking into `app/assets/compibert/` as well, or note it in the row of the One-home table.

8. **`PwaInstallHint.vue` vs the table row "A notice, hint or error line in a page → `NoticeBanner`".** It states its reason ("Its own build, not a NoticeBanner", screen 29), which satisfies "needs its reason"; the PR description should repeat it. Also `t('pwa.done', { where: 'Home-Bildschirm' })` hard-codes a German word in the component instead of an i18n value, and the „Später“ control is a raw `<button>` with hand-set classes (check whether `AppButton` has a quiet variant).

9. **Token vs literal duration.** `BootSplash.vue` style block `animation: boot-fade-in 0.2s linear` (04-motion says 0.2) while its fade-away uses `--cp-dur-base` (220 ms): two different fade lengths in one component. Also `HOLD_MS` and `GIVE_UP_MS` sit in the component while the new table row says "the timeline and its numbers in `app/utils/boot-motion.ts`".

10. **Flag argument.** `revealTheme(origin, changes, apply)` takes `changes: boolean`, and `useAppearance.choose` computes `systemDark()` plus `shownLook(a) !== shownLook(b)` twice (success and failure path). One helper `looksDiffer(a, b)` in `useAppearance` would remove both.

11. **Nits.** `app/utils/install-hint.ts` imports `'../../shared/time'` while every other new file uses `~~/shared/…`. `CHANGELOG.md` #931 line ends `… ([#931](…))` after a full stop; the others have no stop. `test/integration/home.test.ts` L138/489/513 `toEqual({ events: [], hasPlayed })` on the whole read (CODING_STANDARDS § Tests asks `toMatchObject` for a section that grows). `server/domain/home.ts` `hasPlayed` takes a long inline structural type (name it `PlayedEntry`).

## Spec


Method: read the spec, the eight tickets and the „For the Release PR“ comment, then the whole non-test diff (src.diff, 2.7k lines) and the risky tests' subjects. Settled deviations are not repeated. No must-fix found.

## (a) Missing or partial

1. **#670 acceptance criterion open: „The operator tuned the depth and the fades on the listening page, or confirmed the starting values.“** (judgement call) The build ships 50 / 100 ms / 400 ms / 25 ms as named constants and the listening page has the video and four inputs. The criterion is the user's and is listed under „Waiting for the user“ on #927; it only needs to be said in the Release PR that #670 closes with it still open.
2. **Changelog wording is out of the spec's „Stand“ rule for the Datenschutzerklärung only if the Release day is not 26 Nov** (judgement call). Spec: „the ‚Stand‘ date moves to the day each ticket lands“. The code says 26. November 2026 (today). If the cut is on another day, the date and `legal-pages.test.ts` move.

## (b) Not asked for

3. **Reveal stamps duck the Clip too** (judgement call). Spec and #670: „What ducks: the own Party's `veto-seal` and every Emote“. `DUCKING_CUES` (`app/utils/clip-duck.ts`) is keyed by cue id, and `vetoArrivalCues` plays the reveal's stamps as `veto-seal` through `playNow` as well (`useCuePlayer.ts` line 188), so each revealed Veto stamp lowers the Clip on every device, not only the own Party's cast. Probably wanted by ear, but it is wider than the spec's sentence. Either narrow it (the cast cue only) or state it in the PR.
4. **Keyboard selection in the Appearance control also spreads the circle** (judgement call, trivial). Spec: „Only a tap goes through it.“ `SegmentedControl.onKeydown` now passes the focused radio as origin, so an arrow key reveals from that radio. Reasonable, but beyond „a tap“.
5. **„Installiert“ state shows a cheering rig head** (`PwaInstallHint.vue`, `LazyCompibertRig state="cheer"`), which the spec does not mention (it only names `pwa.done`). Presumably from screen 29's artboard; it loads GSAP on Home after an install. Judgement call, tiny.
6. `runtimeConfig.public.iconDir` and the staging icon in the banner: already settled in the PR comment; no finding.

## (c) Looks implemented, may be wrong

7. **Splash tap „lets the tap through to nothing“** (judgement call, unverified). Spec: „Any tap or key ends it at once and lets the tap through to nothing (the page is under the layer).“ `BootSplash.vue` ends on `pointerdown`, and `finish()` unmounts the layer through `v-if` synchronously (the tap's `progress(1)` fires `onComplete`). The `pointerup` and the `click` that follow then land on whatever is under the finger on Home (a card, „Neues Event“). A browser may or may not dispatch that click to the removed node's old position; the tests do not exercise it. Cheap guard: end on `click`/`pointerup` with `preventDefault`, or keep the layer one more frame. Browser checks are waived, so this stays a risk to note.
8. **Splash chunk loads in browser tabs** (judgement call, informational). Because the cookie is written only in standalone, a signed-in browser-tab visit to `/` without the cookie always gets `bootDue` true, hydrates `BootSplash`, which then ends at once (`display-mode` check). Spec stories 25 and 27 hold (nothing visible, nothing held up), but the lazy chunk is fetched on every such Home load. The spec prescribes „layer in the first byte, shown by the stylesheet“, so this follows from it; noted only.
9. **Reactions over a `confused` base are dropped** (`admitReaction`: „none is while the base is `confused`“). Spec: „a reaction plays over the base … `confused` is the base while the connection is down“, with a test line „a reaction over `confused`“. The code follows 04-motion's „errors block“ and the PR comment says #928 added the confused block, so this is settled; the spec's wording could also be read as „plays over“. Only a reveal arriving during `reconnecting` is affected. No change needed.

## Checked and fine

- Every one of the spec's two § 9 paragraphs is in `de.json` word for word, at the right place; `pwa.text` is word for word; `pwa.iosNote` is gone from code and locale (design-handoff copies under `docs/` keep it, which is fine).
- Cookie attributes (`seen`, `Max-Age` 86400, `Path=/`, `SameSite=Lax`, Secure on https) match; path rule is `/` + signed-in + no cookie; calm variant, 400 ms give-up, `aria-live` „Compies lädt“, fade at 1.7 s are in.
- Header reactions: own Emote per id with the motion notes' lengths, reveal with Veto under the stamps' lateness rule (one shared `revealedOnArrival`), `confused` base on `reconnecting`/`lost`, wave once at `back`, nothing elsewhere (provide/inject, `AppShell` under `EventPage`), static head until first reaction, GSAP loaded before the swap, failed chunk keeps the static head.
- Moods: bake script writes both stills, `--check` covers all four, mapping matches the ticket table (Home without Events and `noPermission`/`removed` keep the plain head, settled).
- Install hint rule, 14 days, `done` for the sheet, iPad-as-Mac, blocked storage, `hasPlayed` (Player = zone `team`, ended Session or finished Event, computed before `arrangeHome`) all match.
- Theme reveal: all three controls reach one function; no transition when the shown look is unchanged; device switch and other-device change untouched; failed save cross-fades; newest tap wins via `latestReveal`.
- Duck: volume call on the player seam, pure plan, mute never touched, attach sets volume independent of mute, Sound off never reaches `onSounding`.
- Not built and not reported: #675, #933.
