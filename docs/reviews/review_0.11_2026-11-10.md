# Review 0.11 „Profil“ (2026-11-10)

Diff `v0.10.1...54d8c65`, the tip of `spec/398-profil`, the integration branch of spec [#398](https://github.com/christried/compies/issues/398). A one-spec Release, so this review ran on the integration branch. Three `sonnet` reviewers: Standards; Spec against #398 with #399 to #409 and #430 to #434; quality with architecture. The diff also carries the architecture run #413/#414 and the Tag colours #427, which reached `staging` through their own PRs.

## Result

- **No Must-fix on any axis.**
- **Counts (Must-fix / Should-fix / Note):** Standards 0 / 6 / 8. Spec 0 / 4 / 4. Quality 0 / 9 / 8.
- **Shared findings:**
  - copied test helpers: S6 and Q7;
  - `isDue`: S2 and Q14;
  - the dark check's default `--base`: S9 and Q11 (both in `scripts/browser/dark.mjs`; Q5 on the same script);
  - the Tag colours of #427: S12 and Q17;
  - process and tooling files in the diff: S7 and SPEC-7;
  - the Profil name form (`ProfileCard.vue`, `einrichten.vue`): S4 and Q8.

### Fixed before `staging`

The fix round takes these findings: S1, S4, S5, S6, S10, S11, SPEC-1, SPEC-2, Q1, Q5 (the dead `signedOut` field and the `pair()` doc name only), Q7, Q8 and Q9.

| | Finding | Fix | Branch |
|---|---|---|---|
| F1 | SPEC-1 | The copy-link icon on a Release card takes `text-on-primary` where the button fills with primary (hover, focus): readable in Dunkel, Hell unchanged. | `fix/398-review` (`sonnet`) |
| F2 | SPEC-2 | The info notice's chip takes `text-on-info`; a token test pins all four chips in both looks and that `--cp-on-info` equals ink in Hell. | same |
| F3 | Q8 | A saved Display name takes only the name from the answer, so an Appearance choice made meanwhile is not reverted; tests for both orders and a failed name save. | same |
| F4 | Q9 | Real where the browser has no CookieStore: `useSignOut` calls `refreshCookie` so the sign-in page keeps the look; the test pins the call (happy-dom has the store). | same |
| F5 | Q1 | The dark check's reader hands a form field without a visible edge to `judgeBox`, which fails it; hidden and native inputs and 1 px fields stay skipped. | same |
| F6 | S6, Q7 | The five stylesheet tests share `test/unit/css-tokens.ts`; no case changed. | same |
| F7 | S5 | The Profil page tests sign in a User with a picture and assert the `img`; one case keeps the initial. | same |
| F8 | S10 | Two stale test titles corrected. | same |
| F9 | S4 | `useDisplayNameForm` holds the Display-name form for Profil and setup; `profile.saveFailed` and `onboarding.saveFailed` are one key; the help texts differ in wording and stay. | same |
| F10 | S1 | `CODING_STANDARDS.md` lists the Activity feed's `lte(activity.at, now)` as a surface of the stop edge. | same |
| F11 | Q5 (the dead field and the doc name) | `signedOut` removed, `pair()`'s doc names `after`. | same |
| F12 | S11 | `settings.theme*` renamed to `settings.appearance*`; the German strings are unchanged. | same |

### Not fixed

| Finding | Why | Where it goes |
|---|---|---|
| S2, Q14 | `isDue` has only the parity test as caller; the parity test is its purpose, and `@public` says so. | Nowhere: accepted. |
| S3, S8, S13, S14 | Notes. | Nowhere: accepted as they are. |
| S7 | Skill patches hold rules inline. Process, not product. | Input for the `/retro` of 0.11. |
| S9, Q2, Q3, Q4, Q5 (the part beyond the dead field), Q6, Q10, Q11, Q12, Q13 | The dark check as a tool. Q3: #398 says „differs“, without a threshold. | Noted on #448, where 0.12 extends it. |
| S12, Q15, Q16, Q17 (#427's Tag colours: the comment, the glossary, the edge-case tests) | Notes outside the 0.11 fix round. | A follow-up issue after the Release. |
| SPEC-3, SPEC-5, SPEC-6 | SPEC-3: states the check does not reach (hover, among others). SPEC-5: the Ton switch's knob in Dunkel. SPEC-6: verification gaps. | Carried to the Dunkel walk-through #410 for the user to judge. |
| SPEC-4 | No full dark-check run recorded after #432 to #434. | Met by the full run against the production build that follows this review; its result goes on #409. |
| SPEC-7 | Process and tooling files ride in the diff. | Listed apart in the Release PR, as `release.md` asks. |
| SPEC-8 | The Datenschutzerklärung's sentence about when the cookie is set. | The user's call; raised at the walk-through. |

## Standards

#### S1 · Should-fix · `server/utils/activity.ts:149` · #414
The Activity feed holds a third SQL copy of the stop edge: `lte(activity.at, now)` for the `game_drawn` entry, the `<=` edge of `drawGameKnown` and `stoppedDraws`. CODING_STANDARDS § Secrecy names only `stoppedDraws` and `dueDraws` as SQL twins; a comment and `test/integration/draw-timeline.test.ts:109` mitigate it. Fix: a twin for the instant entries in `server/utils/draw-timeline.ts`, or add the feed's `lte` to the table row (the instant types include `vetoes_revealed` and `coin_tossed`).

#### S2 · Should-fix · `shared/draw-timeline.ts:84-90` · #414
`isDue` is a production export that only two test files call, marked `@public`. The `knip.jsonc` header says an export kept alive by a test only counts as dead, and the `@public` precedent covers test doubles, not a rule function. It is a judgement call, since it is the oracle of the SQL parity test. Fix: move it into `test/`, or give `settleDue` a caller for it.

#### S4 · Should-fix · `app/components/ProfileCard.vue:1-46`, `app/pages/einrichten.vue:1-80` · 0.11, #399
Both repeat the Display-name flow: state, `save()`, `TextField` props, the critical `NoticeBanner`. CODING_STANDARDS § One home per concern needs a reason in the PR for a second copy; the PR is not visible from the diff. `de.json` repeats the copy: `profile.saveFailed` (l.305) and `onboarding.saveFailed` (l.786); `profile.displayNameEmpty` (l.303) and `onboarding.nameMissing` (l.787). Fix: one `useDisplayNameForm()` composable or a `DisplayNameField` that both mount.

#### S5 · Should-fix · `test/nuxt/auth.ts:3-12`, used by `test/nuxt/profile-page.test.ts` · 0.11, #399
The shared test User has `image: null`, while the page draws `UserAvatar :image="user?.image"` (`ProfileCard.vue:73`). The test „shows the picture with its hint“ (l.20) asserts only the hint. CODING_STANDARDS § Tests asks for production shape: every account has a picture. Fix: a `kittyWithPicture` (or `image` on this file's fixture) and one assertion that the `img` renders; the initials-only case stays as the failed-picture case.

#### S6 · Should-fix · seven test files · 0.11, #406, #409
`rgba`, `colour`, `contrast` and `block` are copied three times (`ink-3-text.test.ts`, `primary-ink.test.ts`, `toast-ring.test.ts`); `clean` and `normalise` four times (`hover-tint.test.ts:12-13`, `ink-3-text.test.ts:33-34`, `system-appearance.test.ts:19-21`, `toast-ring.test.ts:14-15`); `sourceFiles` three times (`system-appearance`, `room-listeners`, `md-query`). `scripts/browser/contrast.mjs:25` already holds the inverse, `hex()`. No documented rule is broken (baseline Duplicated Code). Fix: `test/css.ts` with `clean`, `normalise`, `tokenBlock(name)`, `tokenColour(block, name)` and `contrastOf(a, b)`.

#### S7 · Should-fix · `.claude/skills/to-tickets/SKILL.md`, `.claude/skills/retro/SKILL.md`, `.claude/skills/implement-spec-max/SKILL.md` § Model tiers · process
The to-tickets patch now holds the finer-tickets and joint-session rules; the new retro patch holds two rules. The tier rule lives in `implement-spec-max` (37 lines), and `docs/agents/subagents.md:11` points to it. `.claude/skills/README.md` § COMPIES patches says a patch stays a pointer, and CLAUDE.md § Standing rules says new rules go in `CLAUDE.md` or `docs/agents/`. Fix: move the ticket rules to `docs/agents/` (`issue-tracker.md` or a new `tickets.md`), the retro exclusions to `docs/agents/release.md` § Review, walk-through, retro, and leave one-line pointers; give the tier rule one home.

#### S3 · Note · `server/utils/settings-floors.ts:22` · #414
`floorFacts` filters casts with `windowEnded`, not with `knownVetoRows`, which § Secrecy calls „the one filter“. The stricter filter is on purpose, and the edges agree (`windowEnded` is `end <= now`, `vetoesSealed` is `now < end`). No leak. Judgement: say so in the Secrecy bullet, or add a second named filter in `server/utils/vetoes.ts` (`endedVetoRows`).

#### S8 · Note · `app/pages/profil.vue:21-31` and `:13` · 0.11, #399
The „Abmelden“ text button and the h1 class strings repeat `EventSessions.vue:231`, `GameNotesDisclosure.vue:20`, `HowWePlayCard.vue:53`, `BackLink.vue:34`, `EventPageHead.vue:102`, `bibliothek/index.vue:32` and `index.vue:30`. Baseline Duplicated Code; the pattern predates 0.11. Home: an `AppButton variant="text"`.

#### S9 · Note · `scripts/browser/dark.mjs:53` and `:44` · 0.11, #407
`baseRef` defaults to `origin/spec/398-profil`, a branch deleted after the Release, so `git()` answers `'unknown'` silently. `GAME_NAME_MAX = 60` copies `shared/game.ts:9`. Fix: default to `origin/staging`; name the source in a comment for the constant.

#### S10 · Note · `test/unit/copy.test.ts:57`, `test/nuxt/legal-pages.test.ts:86` · #403, #405
The first title („names no design cookie while the app is light only“) is stale: the app now has `compies-appearance`. The second lost „and the new Stand“ and kept its comma. Fix: retitle the first („never brings back the old nuxt-color-mode cookie“) and correct the second.

#### S11 · Note · `i18n/locales/de.json:1074-1079` · #404
`settings.theme`, `settings.themeHelp`, `settings.themeSaveFailed`: „Theme“ is in `GLOSSARY.md` § Appearance under _Avoid_. The copy („Darstellung“) is right; only the key names carry the word. Fix: rename to `settings.appearance*`; only `SettingsCard.vue` and the tests read them.

#### S12 · Note · `shared/tag-colors.ts` · #427
Five names in one 50-line file mix both spellings of „colour“. `GLOSSARY.md` § Tag is silent about colours. `test/nuxt/game-card.test.ts` tests 4 and 2 Tags, with no 0- or 1-Tag case and no `TAG_MAX`-long label in a coloured chip (`GameCard.vue:142`, `TagInput.vue:189`). Fix: one spelling; a sentence in § Tag; the missing edge cases. `test/unit/tag-colors.test.ts` covers the colour function well.

#### S13 · Note · five places holding the dark token block · 0.11, #402
`app/assets/css/compies-tokens.css:84-121`, `compies-theme.css:11-20`, `Compibert.vue:85-90`, `CompibertRig.vue:124-128` and `:149-153`, `public/offline.html:20-26`. The repo decided on the copies (`docs/design_handoff_compies/01-tokens.md`), so the baseline is overridden. Recorded because the guard knows only `.css` and `.vue` under `app/` and `public/offline.html`, and `browser-frame.md` does not mention the twin rule for new `<style>` blocks.

#### S14 · Note · `app/composables/useAppearance.ts:39-41`, `app/components/ProfileCard.vue:41-43` · #399, #404
Both catch every failure and show one fixed line, not `reasonKey` / `apiErrorKey` as CODING_STANDARDS asks for an API error. The two codes the routes answer are `null` entries of `SHARED`, so the words are right today; a 401 after sign-out in another tab also reads „didn't work“. Acceptable; `apiErrorKey(error, 'profile.saveFailed')` would keep the table the one place.

### Checked and sound

- **Draw timeline (#414):** no Draw comparison copy outside the timeline modules except S1; edges are `<=` at the stop and `<` at the window end; parity tests at every boundary millisecond.
- **Secrecy of new surfaces:** no new read or message names a drawn game; the room lost six messages (#419); `GET /api/me` and `POST /api/me/appearance` publish nothing (ADR 0013).
- **Database:** `0029_user_appearance.sql` is additive, constant default, CHECK, no index; `user-appearance-migration.test.ts` runs the old-code writes.
- **One home per concern:** `parseDisplayName` in `shared/auth.ts`; `shownName`; `characterCount`; the `reasonKey` / `apiErrorKey` table is total; `NoticeBanner` for every failure line.
- **Copy:** glossary words used; `Lobby` in `RETIRED`; changelog groups and order correct; the Datenschutzerklärung names the stored Appearance, the cookie and the Display name, pinned by `legal-pages.test.ts`.
- **Personal data:** no real e-mail, name, id or path in the diff; the check's data is deleted at the end of a run.
- **Motion:** no new animation.
- **Process files:** `docs/agents/delivery.md` matches `CLAUDE.md`; `release.md`, `implementer-frame.md`, `browser-frame.md` and `scripts/browser/README.md` agree with the code.
- **Test architecture (#418):** the route guard checks the files under `server/api`; `resetDatabase` order derives from the schema.
- **Tokens and Hell:** `text-on-hot` and `text-on-primary` equal `--cp-ink` in Hell, so the Dunkel fixes change nothing there.
- **Tooling-owned, not re-judged:** lint rules, knip entries, typecheck, the changelog guard.

## Spec

#### SPEC-1 · Should-fix · `app/components/ReleaseCard.vue:137`, `app/components/IconButton.vue:25` · #398 story 44, #409
The Copy-link button draws `text-ink` on `hover:bg-primary focus-visible:bg-primary`. In Dunkel `--cp-ink` `#f7efe1` on `--cp-primary` `#ffd23f` is 1.26:1 (computed); it has the same cause as #431. #409 notes it („Noted for #410, not fixed here“), but no ticket fixes it. Fix: `hover:text-on-primary focus-visible:text-on-primary` on that button; Hell cannot change.

#### SPEC-2 · Should-fix · `app/utils/notice.ts:15` · #398 story 44, #407
`info: 'bg-info text-ink'`: in Dunkel `--cp-ink` on `--cp-info` `#6b93ff` is 2.54:1 (computed), under 3:1 for a graphic. The check missed it because the chip's icon is an SVG. Fix: `bg-info text-on-info` (`--cp-on-info` is 6.35:1 in Dunkel; equal to ink in Hell).

#### SPEC-3 · Should-fix · #398 § Dark in the app, story 54 · #410
The spec lists toasts, notice banners, sheets and dialogs on the way, and the stepper's steps. #407 and #408 record gaps for #410: the Connection banner, a Hidden wheel's placeholders, the Clip with a video, the „Session starten“ dialog, the Host's phone dock, „Event erstellt“ after the last stepper step. #409 adds hover, SPEC-1, the sticky „Springe zu“ column taller than 1440 × 900, and readable text on `--cp-ink-3`. #410's body names none of them. Fix: add them to #410, or walk them first.

#### SPEC-4 · Should-fix · #409 acceptance · no full dark-check run after #432 to #434
#409 asks for a full run against the production build on the integration branch. The last full run on record (#408) is at `25030d9`: 160 FAIL in both `pnpm dev` and the production build. #432 to #434 (`524f7f7`, `aed9070`, `54d8c65`) have no run, and #430 and #431 report only their own states. Fix: one `node scripts/browser/dark.mjs` run against the production build on the tip, its counts on #409, before #410 starts.

#### SPEC-5 · Note · `app/components/ToggleSwitch.vue:46-50` · #398 story 44
In Dunkel the Ton switch's knob (`bg-ink`, no border) sits on the `bg-primary` track at 1.26:1 (computed). The state stays readable, so no WCAG failure, but the check does not measure fills inside a control. For the walk-through (#410 step 2); the fix would be `bg-on-primary` for the on-knob.

#### SPEC-6 · Note · verification gaps · #402, #406
#402: „Not measured: `CompibertRig`'s outline on its own.“ #406: „Not measured: the hot `HoldToConfirmButton`'s contrast“; its fix `text-on-hot` is token-correct (Dunkel 5.93:1 by the ticket). One screenshot each in the walk-through.

#### SPEC-7 · Note · behaviour and files beyond the spec · #398
Recorded behaviour, not findings: the dev sign-in's `?name=unset` and `coalesce` (`server/dev/sign-in.ts:44-54`, #407), `DateConfirmDialog` and `HoldToConfirmButton` (#406), `ToggleSwitch` track-only mode and `SettingsCard.vue` (#400). Process and tooling files ride along and are on no 0.11 ticket: `.claude/skills/*`, `docs/agents/{delivery,merger,subagents,implementer-frame,release}.md`, `scripts/ci-wait.mjs`, `scripts/ci-verdict.mjs`, `CLAUDE.md`, `CODING_STANDARDS.md`; so do the #413, #418, #421 and #427 changes. The Release PR description must not claim them for #398.

#### SPEC-8 · Note · Datenschutzerklärung (#405)
The approved wording says the cookie is also written „sobald du dich dort anmeldest“. In code it is written at any page load where the device's cookie disagrees with the signed-in User (`server/utils/appearance-cookie.ts:21-25`, `server/api/me.get.ts:10`), including a cleared cookie without sign-in. True for the common case; exact would be „sobald du dich dort anmeldest oder die Seite öffnest“. The „Stand“ date stays right only while no later text change lands on a later day.

### Checked and sound

- **Storage and migration:** `drizzle/0029_user_appearance.sql` is additive, default `light`, CHECK `users_appearance_check`; the 0.10.1 code can serve through the switch-over.
- **Routes and rule:** `isAppearance`, `AuthUser.appearance`, `GET /api/me` and the Display name answer carry it; `POST /api/me/appearance` answers 401 signed out, 400 for other values.
- **Cookie:** `compies-appearance` is `dark` or `system`, never `light`, one year, `/`, `SameSite=Lax`, `Secure`; sign-out leaves it.
- **Render rule and first paint:** a signed-in User wins; `nuxt-color-mode` is never read; no script before paint.
- **Browser bar and offline page:** two metas always (the recorded #404 deviation); offline page has both metas and the dark block.
- **System as CSS only:** the System block equals the dark block (stylesheet test); the Tailwind `dark` variant has the media twin.
- **Profil page:** one column, cards „Profil“ and „Einstellungen“, Abmelden; a failed save keeps the input and shows the notice.
- **Names and Ton:** every read resolves through `shownName`; the Ton row is bound to `useSound`.
- **Darstellung:** optimistic show, failed save restores the server's value, quick taps follow the Vote rule.
- **Dark:** hover tint 14 % inside the one `tint` utility; Leaderboard has no hex left; the Share image is left light.
- **Dark check:** `scripts/browser/dark.mjs` covers the pages and Event states the spec names; exit code 1 on FAIL.
- **Docs and changelog:** the docs the tickets named are updated; `### Neu` and `### Geändert` in order; `test/unit/changelog-file.test.ts` not run here.

## Quality and architecture

#### Q1 · Should-fix · `scripts/browser/dark-read.mjs:332-345` · 0.11
`if (!edge && !paint) continue` skips a form field whose border and fill are both absent, after looking up to three wrappers; `border()` (l. 231) returns null for alpha 0, and `toRgba` (l. 52-57) turns an unparsable colour into transparent. A field whose border breaks in Dunkel is never judged, though `judgeBox` would FAIL it. Fix: push `FIELD` elements with `edge: null, fill: null` instead of `continue`; make `toRgba` throw on a colour the canvas does not take.

#### Q2 · Should-fix · `scripts/browser/dark-read.mjs:405-410` · 0.11
A card is a rounded fill only with a `box-shadow` or a four-sided 2 px border, so a card whose shadow and border vanished never reaches `judgeSurface`. Fix: take a card as fill, radius >= 8 and size >= 120 x 48, and let `judgeSurface` decide; check the first run for false positives.

#### Q3 · Should-fix · `scripts/browser/contrast.mjs:180`, `scripts/browser/dark-read.mjs:418` · 0.11
`differs` has no tolerance: a card `#221b2c` on `#221b2b` (ratio 1.001) PASSes, and a shadow of alpha 0.02 on an equal fill PASSes. The reader takes only the first shadow (`colourTokens(...)[0]`). Fix: a floor such as ratio >= 1.05 for fill and border, and a shadow only with a non-zero offset or blur; pin it in `test/unit/contrast.test.ts` beside the 1.10 case.

#### Q4 · Should-fix · `scripts/browser/contrast.mjs:221` (`FIELDS`), `show()` l. 211-219 · 0.11
The Dunkel = System comparison ignores `shadow`, `opacity`, `frame` and `group`, and shows a `behind` layer without its `stops`; a System twin with another shadow reads as „same“. Fix: add the fields to `FIELDS` and `stops` to `show()`, one test case each.

#### Q5 · Should-fix · `scripts/browser/dark-states-app.mjs:13-19`, `scripts/browser/dark-states-event.mjs:15-25`, `scripts/browser/dark.mjs:17, 31, 49, 69` · 0.11
Each state file reads `de.json`, parses `--run=` and writes NOTE lines through its own `note()`, a second copy of `log.note`; `dark.mjs` repeats the parse and the read. A state file cannot be imported by a test. Drift: `signedOut?: true` is documented and set (`dark-states-signed-out.mjs:14`) but nothing reads it; `pair()`'s doc names `endOfPass` while the parameter is `after`. Fix: the runner puts `copy` and `note` on `ctx`, and `run` goes from the state files; the fix round takes the dead field and the doc name only.

#### Q6 · Should-fix · `scripts/browser/dark-states-event.mjs:81-87, 113-123`, `server/dev/sign-in.ts` · 0.11
`purge` deletes every Event of the Dev Host starting with `R011 Dunkel-Check `, so two runs delete each other's Events; each dev sign-in resets the dev User's Appearance to light, which another agent's run can trigger. `purge` ignores the answers of `sessions/end` and `DELETE`, and soft deletes leave about 40 rows per pass. Fix: a per-run suffix in the Event names, check both answers, and state in the README that one run goes at a time on a dev database.

#### Q7 · Should-fix · `test/unit/primary-ink.test.ts`, `toast-ring.test.ts`, `ink-3-text.test.ts`, `hover-tint.test.ts` · #409, #411, #431, #433
Each asserts a token ratio and that Tailwind compiles a hand-written candidate list. None reads `BenchZone.vue:44`, `ToastStack.vue:10`, `PageFooter.vue` or `ReleaseNav.vue`, so removing the class leaves all four green. The same 25 lines are copied into each; `hover-tint.test.ts` states a 1.45:1 target and never computes it. Fix: a shared `test/unit/css-tokens.ts`, and per fix one assertion that reads the component source for its class.

#### Q8 · Should-fix · `app/components/ProfileCard.vue:32`, `app/composables/useAppearance.ts:31-33` · 0.11
`user.value = response.user` replaces the User state. If a name save answers while an Appearance request is in flight, the server's old Appearance replaces the newest choice, `choose` resends it, and the page flips back. Fix: merge, `user.value = { ...user.value, displayName: response.user.displayName }`. `einrichten.vue:31` replaces too, without an Appearance control.

#### Q9 · Should-fix · `app/plugins/appearance.ts:15-16`, `app/composables/useAuthUser.ts:14` (`useSignOut`) · 0.11
Without `cookieStore`, the plugin's cookie ref keeps the value the page loaded with. `useSignOut` sets `user.value = null` and navigates client-side, so the sign-in page renders light until a reload. `test/nuxt/appearance.test.ts` cannot see this (it says so). Firefox support is unverified; to be checked. Fix: `refreshCookie(APPEARANCE_COOKIE)` in `useSignOut` after `user.value = null`, or navigate with `external: true`.

#### Q10 · Note · `scripts/browser/dark.mjs:46` · 0.11
`SCHEMES = { dark: 'light', system: 'dark' }`: System is measured only on a dark device; the light half is covered at source level only. Optional: one `system` pass on a light device at 390.

#### Q11 · Note · `scripts/browser/dark.mjs:179`, `:53`, others · 0.11
`:179` special-cases `'offline'`; `:53` defaults `--base` to a deleted branch; state names are not checked for uniqueness; covered text (`dark-read.mjs:277, 351`) is dropped without a count; `readRings` finishes transitions on the page (l. 488);

#### Q12 · Note · `scripts/browser/dark-read.mjs:113-128` · 0.11
`behindFrom` composites ancestors up to the first opaque one, which is not what is painted under a translucent layer (a dialog's scrim, the dock, a toast). Not wrong for opaque layers. A header note would do.

#### Q13 · Note · `scripts/browser/dark-states-event.mjs:54, 89, 113-114`, `dark.mjs` `makeData` · 0.11
`signedIn`, `library`, `memo` and `pass` are module singletons never reset between passes. The purge hangs on `fertig-gleichstand` being last, so `--only` or `--group` drop it; `fresh: true` states bypass `made()`. `makeData` finds its Event through Home, which stops listing it a day after its Date, so a later run makes a new one.

#### Q14 · Note · `shared/draw-timeline.ts:85` · #413
`isDue` has no production caller; `test/integration/draw-timeline.test.ts` compares it with the SQL. A deliberate parity seam, but the one export only a test uses: dead code with a test unless the SQL predicate is built from it.

#### Q15 · Note · `shared/auth.ts:13-37`, `server/db/schema.ts:36` · 0.11
`shared/auth.ts` holds sign-in facts, the Appearance list, guard, cookie contract and `parseDisplayName`. The Appearance lives in seven places; `shared/appearance.ts` would hold the type, list, guard, cookie name and `appearanceCookieValue`. `schema.ts:36` spells the CHECK list (`IN ('light','dark','system')`) by hand.

#### Q16 · Note · `test/nuxt/appearance.test.ts:83-85` · 0.11
The test sets `head._dom` and `head.dirty` on unhead's private state. It covers #404 and will break on an unhead upgrade; keep it and its comment. No test renders a signed-in User's first paint through SSR.

#### Q17 · Note · `shared/tag-colors.ts:2-3` · #427
The comment says a Tag's colour „is the same on every game, page and load“. The code shifts a Tag to the next free colour when an earlier Tag of the game already wears its own. Behaviour is fine; the sentence is wrong.

### Checked and sound

- **Appearance path:** the stored choice reaches the head on the server; a signed-in User wins over any cookie; the `theme-color` metas keep one shape (#404).
- **Cookie and routes:** only the server writes it; `correctAppearanceCookie` writes only on a mismatch; `auth.global.ts` forwards every `Set-Cookie`; no `routeRules` cache can serve the wrong look.
- **System:** the media copy, the `dark` variant with both selectors, and `test/unit/system-appearance.test.ts` keep the twins equal.
- **Profile API:** `POST /api/me/appearance` writes nothing for a refused value or without sign-in.
- **Migration 0029:** constant default, CHECK, no index; tested with the 0.10.1 code's writes.
- **Dark check:** `label()` prints committed copy or a count; cleanup runs in `finally`; `judgeRing` fails a missing ring; `framed` fails safe.
- **#413:** the Draw timeline keeps every edge and is checked at every boundary millisecond; the route scan fails loudly on a duplicate or missing default export.
- **#427:** `tagColors` always terminates; the hash is pinned by test; card, page and field take the colour from the whole Tag order.
