# Review 0.5.1 „Neue Nummern“ (2026-11-01)

Diff `v1.4.0...origin/staging` (b977fd3): PRs #213, #214, #219 and #239. Per `docs/agents/release.md` § Review, walk-through, retro, three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#215, with #216, #220, #221 and #222);
- thermo-nuclear with architecture.

Before it, a two-axis review (Standards + Spec) ran on the integration branch `feat/215-neue-nummern`. Its fix pass (merge ff7eb3e, in PR #239) corrected three stale comments and added the secrecy case „same response however many games the pools hold“.

## Result

No blocking finding. One behaviour fix and the cheap doc fixes go into [#242](https://github.com/christried/compies/issues/242) before the version cut; the structural items wait for 0.6 and 0.7, where the code they touch changes anyway.

**Fixed before the cut, in #242:**
- **Spec P1 + thermo N6:** a version stored above the newest Release (the old code can write `1.4.0` between the migration and the switch-over) counts as unknown, so the next „Gesehen“ replaces it. One rule in `shared/changelog.ts` for the server route and the client.
- **Spec N4:** a unit case for a mapped middle value.
- **Standards S5:** three test titles and comments that still say „counts“.
- **Standards S2, S3, S4, S6, S7, N6, N7 and thermo N2:** glossary `_Avoid_` of Game count; one home for reading an issue; no local user path in `merger.md` (forward fix, the user's choice; the history keeps it); old and new Release numbers in the roadmap and ADR 0013; the superseded sentence in ADR 0013 marked; the tag rename in `release.md`; forward references to „1.5“ in code comments say „Glücksrad (0.7)“.

**Decided by the user:**
- **Standards S1 / thermo N7:** the Host banner keeps the spec's wording („… erst am Rad …“). It becomes exactly true with 0.7; until then it describes the Hidden wheel as specced.
- **Standards S4:** fixed forward, no history rewrite.

**Planning items for 0.6 „Notizen“** (spec [#217](https://github.com/christried/compies/issues/217)):
- **Thermo T1 + A1, the first 0.6 ticket:** `pools: { main, tiebreaker } | null` instead of `{ hidden: true }`, `eventPools(db, eventId)` without the mode flag, and one `PoolFacts` input to `canSeePoolGames`, before Pool preview adds its reason to withhold the pools. Decide there whether `pool-visibility.ts` keeps its name (Standards N2).
- **Thermo T2, N4, N5 and Standards N4:** the dev sign-in route sets `newsSeen` on every sign-in (and `?news=unseen`), so `cdp.mjs` `open()` loses its pop-up workaround; ports per account; `send` with a timeout. With the first 0.6 ticket that runs the browser kit.
- **Standards N3:** narrow the test-data picture rule to tests that render an avatar, or sweep the fixtures; one `memberView()` factory in `test/nuxt/event-page.ts`.

**For 0.7 „Glücksrad“** (spec [#218](https://github.com/christried/compies/issues/218)): thermo A2 (split `cdp.mjs` when the wheel check is the second two-account scenario) and the carry-over of review 1.4 A3.

**Left as they are:** Spec N2 (old `#1.x.y` links land at the top of Neuigkeiten), N3 (the 0.4.0 line stays history), N5, N6 (a mail-forwarding sentence in the Datenschutzerklärung is the user's call for a later edit), N7, N8; Standards N1 (glossary entries tightened when 0.6 and 0.7 are specced), N5 (the #222 line stays under Geändert, as the spec says), N8, N9 (goes with T1); thermo N1 (migration 0013 has run on staging and is never edited), N3.

---

---

## Standards review: Release 0.5.1 „Neue Nummern“ (v1.4.0...origin/staging, b977fd3)

Sources: `CODING_STANDARDS.md`, `GLOSSARY.md` (and its format rules in `.claude/skills/domain-modeling/GLOSSARY-FORMAT.md`), `docs/agents/*.md`, `CLAUDE.md` (Personal data), `docs/adr/`, and the Fowler smell baseline as judgement calls. Method: read the whole diff of the four PRs (#213, #214, #219, #239; snapshots and lockfile skipped) and grepped `origin/staging` for what the diff leaves behind (stale wording, old numbers, the glossary's `_Avoid_` words, personal data). Read-only; no tests, lint or knip run.

### Result

No blocking finding. The code part of the Release is small and clean: `eventPools` selects nothing for a hidden viewer, `EventPools` shrinks to `{ hidden: true }`, the migration has its own test in the house style of its siblings, the changelog format, `package.json` version and group order hold, and no personal data or forwarding target reached the repo apart from the one path in S4. What the #239 review missed is mostly about words: three test comments/titles still say „counts“ after #222 removed them (S5), the new Hidden wheel copy and changelog line promise a wheel screen that does not exist yet (S1), the glossary contradicts itself on „Rounds“ (S2), two agent docs disagree about `gh issue view` (S3), and the roadmap and the ADR 0013 amendment mix old and new release numbers in text written after the renumbering (S6, S7). Findings: 7 should-fix (S1 to S3 are hard violations of a documented rule, S4 is borderline hard, S5 to S7 are judgement calls) and 9 nits.

---

### Should-fix

#### S1. Copy promises a wheel the app does not have (CODING_STANDARDS § Copy: „Copy promises only what the app does today“). Hard violation; the wording is spec-prescribed, so the user's call

- `i18n/locales/de.json:1426` `howWePlay.hostOnly`: „Die anderen sehen erst am Rad, wie viele Spiele drauf sind, und nur die Spiele, die gezogen werden.“ and `CHANGELOG.md:7`: „Das zeigt dir erst das Rad.“
- What and why: the Lucky Wheel screen, the draw and the count shown on it are Release 0.7 (`docs/roadmap.md:91` ff.). Today Members see nothing about the pools, full stop; the Host's banner and the Users' changelog line both describe a future screen. The earlier wording („sehen nur, wie viele Spiele im Pool sind“) was true when written; this one is not. The glossary may describe the target (it does for Round, Pool preview); UI copy may not.
- Fix: say only what is true now. Banner: „Das Rad ist verdeckt: Die anderen erfahren vorher nichts über die Spiele im Pool, auch nicht, wie viele es sind.“ Changelog: end the sentence after „… im Pool sind.“ Update the string pinned in `test/nuxt/how-we-play-card.test.ts:91`; the `not.toContain('verrät')` guard can go. If the user wants the spec wording kept, record that decision in the PR.

#### S2. `Game count` still lists `Rounds` under `_Avoid_` while its own definition now says „Rounds“ (GLOSSARY format: `_Avoid_` lists words not to use; `docs/agents/domain.md`: „Don't drift to synonyms the glossary explicitly avoids“). Hard violation

- `GLOSSARY.md:41-43`: the definition (rewritten in #219) reads „The number of Rounds an Event runs for … until that many Rounds have their result“, and the next line still says `_Avoid_: Rounds, games per Session`. The new `Round` entry (`:217`) is the term the Game count counts.
- Why: the glossary now forbids the word it uses two lines up; an agent following `_Avoid_` would rewrite the definition or the 0.7 tickets.
- Fix: `_Avoid_: Games per Session, number of games` (drop „Rounds“). The `Session` entry's `_Avoid_: … round` is right and stays.

#### S3. Two agent docs give opposite instructions for reading an issue (CODING_STANDARDS § One home per concern, applied to the agent docs; `docs/agents/issue-tracker.md` is the home). Hard violation

- `docs/agents/implementer-frame.md:14` (new in #214): „`gh api repos/christried/compies/issues/<n> --jq .body` (`gh issue view` prints nothing from Git Bash)“. `docs/agents/issue-tracker.md:8` still gives `gh issue view <number> --json …` as THE way to read an issue in its local § Conventions.
- Why: the retro learned that `gh issue view` prints nothing in Git Bash on this machine; only the new doc got it, so the next orchestrator reading `issue-tracker.md` meets the dead command.
- Fix: put the Git Bash caveat and the `gh api` form into `issue-tracker.md` § Conventions (Read an issue), and let `implementer-frame.md` point there instead of carrying its own copy.

#### S4. A Windows account path of the operator in a public file (CLAUDE.md § Personal data). Borderline hard; the user decides

- `docs/agents/merger.md:5` and `:12`: the local checkout path and the same path in Git Bash form. The only hit for that user name in the tree. The Impressum states the operator's name, address and now the contact address; the Windows user name is not among them. The path is also useless to a cloud session, which `docs/agents/` otherwise serves.
- Fix: „the main checkout of the repo“ and `cd "$(git rev-parse --show-toplevel)"`. The path stays in the history of commit 7f9cd23; whether that needs more than a forward fix is the user's call.

#### S5. Stale „only the counts“ wording #222 left behind (what the #239 stale-comment fix missed). Judgement

- `test/integration/event-pools.test.ts:15` („… and by every other Member as counts only.“) and `:164` (test title „gives every other Member only the counts under a Hidden wheel …“, which now asserts `toEqual({ hidden: true })`); `test/unit/pool-visibility.test.ts:5` („who only the counts“).
- Why: a test title that names what the assertion no longer checks is what the secrecy tests must not drift on; the sibling titles in `hidden-wheel.test.ts` and `how-we-play-card.test.ts` were updated, these three were not.
- Fix: „… learns nothing about the pools (no count, no game)“ in the first two places; „who sees the games of the pools and who nothing“ in the unit test header.

#### S6. New and rewritten text mixes old and new Release numbers (`docs/agents/release.md` § Semantic versioning: only text written BEFORE the renumbering keeps the old numbers; `docs/roadmap.md` is the map). Judgement

- `docs/roadmap.md` was re-planned on 2026-10-31 (its intro says so) and defines the new numbering, yet its body keeps old ones: `:40` („created before 1.3 … enforced from 1.4“) under the heading „0.4 … (was 1.3)“, `:85` („The 1.3 secrecy rules“), `:135` („Planning items from 1.4“), `:93` („Standards S3 and S6“ with no review named). A reader of the Hidden wheel bullet cannot tell whether 1.3 means 0.3 or 0.4, the very confusion the renumbering risks.
- `docs/adr/0013-nuxt-decides-the-room-relays.md:16` (new): „Settled in the 0.7 „Glücksrad“ grilling (review 1.4, finding A2)“ puts both numberings in one sentence.
- Fix: in the roadmap use the new number and, once, the old in brackets („before 0.4 (1.3)“, „the 0.4 secrecy rules“, „Planning items from 0.5 (review 1.4)“, „Standards S3 and S6 of review 1.4“). In the ADR: „… the 0.7 grilling (review 1.4, now 0.5.0, finding A2)“.

#### S7. ADR 0013 now contradicts itself in one file and marks nothing at the superseded sentence (precedent: ADR 0004:7 and ADR 0008:3 mark the superseded text where it stands). Judgement

- `docs/adr/0013-nuxt-decides-the-room-relays.md:3` still says „Timed moments … (the 1.5 wheel stop and veto window alarms) are the room's job“; the amendment at `:14-23` says the opposite. A reader who stops at the first paragraph (an ADR is meant to be readable in one paragraph) takes the rejected design.
- Fix: end that sentence with a pointer as ADR 0008 does („Superseded for deadlines by the amendment below.“), or strike the clause and keep the history in the amendment's „Considered“ line.

---

### Nits

#### N1. Glossary entries are not tight and define behaviour (GLOSSARY-FORMAT: „One or two sentences max. Define what it IS, not what it does“). Judgement
`GLOSSARY.md:217` `Round` runs four long sentences (start, vetoed draws, put back, numbering, order of results, Game count cap). `Pool preview` (`:175`) and `Game count` (`:41`) are two long ones each. The rules belong in the 0.6/0.7 specs; the entry can keep „One of the games an Event plays, from its spin or its being set until its result is entered“ plus the numbering sentence.

#### N2. The glossary avoids a name the code already carries (`domain.md`). Judgement, for the 0.6 tickets
`Pool preview` says `_Avoid_: Pool visibility`; `server/domain/pool-visibility.ts`, `poolsVisibleTo`, `canSeePoolGames` and `test/unit/pool-visibility.test.ts` all use it. Today they implement the Hidden wheel rule, not the future setting, so it is not wrong yet; the 0.6 ticket that adds the setting should say whether the module is renamed or keeps its name.

#### N3. The new test-data rule is wider than what was applied (CODING_STANDARDS § Tests). Judgement
The rule reads „A Member comes with a picture“. The change gave the Game board fixtures and the dev Users one; `test/nuxt/auth.ts:6` (`image: null`), `poll-matrix.test.ts:11`, `invite-entry.test.ts:12`, `sign-in.test.ts:25` and the ~40 integration `signIn` fixtures (`image: undefined`) still do not. Either narrow the rule („in a test that renders an avatar“) or sweep them. Duplicated Code: the fixture `image: \`https://example.com/${name}.png\`` was copied into four nuxt test files (`event-page-composition`, `event-settings-editor`, `game-board`, `team-name-builder`) plus `event-page.ts`; one `memberView(...)` factory next to `view()` in `test/nuxt/event-page.ts` would be the home.

#### N4. `scripts/browser`: ports repeated, centre maths copied (Duplicated Code, Data Clumps). Judgement
`9311`/`9312` are literals in both `shots.mjs` and `moves.mjs` (README: „Each account needs its own port“); `cdp.mjs` could export the port per account and `launch(account)` use it. `drag()` re-spells `centre()`'s rectangle maths for `end` because `centre` scrolls; give `centre` a `{ scroll }` option. `open()` takes six positional arguments (`tab, path, width, height, waitFor, { news }`), the README documents five.

#### N5. #222's changelog line sits in „Geändert“, its 0.4.0 predecessor in „Sicherheit“ (`docs/agents/release.md` § Changelog lines). Judgement
The line tightens what a Player can learn from the network (`CHANGELOG.md:7` against the 0.4.0 „Bei verdecktem Rad erfährt niemand …“ under `### Sicherheit`). Either group is defensible; pick one so the secrecy history reads in one place.

#### N6. Implementer frame and release.md word the changelog duty differently
`docs/agents/implementer-frame.md:28` („add a line only if your brief says so“) against `release.md` („A PR with a change Users can see adds its lines … in the same PR“). Add „(the brief says so whenever release.md asks for a line)“ so an implementer who sees a visible change but no brief line knows to ask.

#### N7. The tag rename has no procedure in `release.md`
`release.md:61` says „tags included“; how (new `v0.x` on the old commits, `v1.x` deleted after the user's approval, so the next review diffs against `v0.5.0`) lives only in the 0.5.1 bullet of `docs/roadmap.md:68`, a plan that gets edited away. One line in § After the merge, or a note to move the bullet when the user approves the tags.

#### N8. Mail forwarding processes inbound mail; the Datenschutzerklärung has no contact section. User's call, not a rule violation
CODING_STANDARDS § Copy asks for the Datenschutzerklärung only for third parties the browser or the server talks to, so `compies@christried.me` forwarded by a provider is outside the letter of the rule. The forwarding target is rightly not in the repo. Worth a sentence the next time the user edits that text (the user approves it).

#### N9. `HowWePlayCard.vue` checks `pools.hidden` twice
`:51` (`lists` returns `[]` for hidden) and `:118` (`v-if="!pools.hidden"` around the only use of `lists`). The `[]` branch is dead; one `const shown = computed(() => props.pools.hidden ? null : props.pools)` with `v-if="shown"` makes narrowing and template one check. Same file, roadmap side: 0.6 „no round“ and 0.7 „The game round up to …“ use lower-case „round“ next to the new term Round; say „no Rounds yet“ / „The game draw up to …“.

---

### Checked and fine

- **Personal data**: no trace of the old account address, no forwarding target, no Discord/Twitch ids or User names beyond the Impressum in the diff or on `origin/staging`; the copy test pins `compies@christried.me` as the only address; test fixtures use `example.com` and `Gast`. Only S4's path.
- **Changelog**: `## [Unreleased]` holds one `### Geändert` group with three lines, each with its issue link; Release headings descend 0.5.0 to 0.1.0 and `package.json` is 0.5.0 (the format test enforces it); plain German for Users.
- **Migration 0013**: a new file, no earlier migration edited, no filtered column (no index rule); `WHERE … IN (…)` keeps NULL and unmapped versions; its test follows `session-start-migration.test.ts` (`createTestDbBefore`, `migrateTo`, `rmSync` of the folder) and covers mapped, unmapped and NULL. `news-seen.test.ts` and `changelog.test.ts` follow the new numbers, and `1.4.0` joins the refused versions.
- **One home**: no Event change bypasses `changeEvent`; `eventPools` stays the one reader of the pools and `poolsVisibleTo`/`canSeePoolGames` the one rule; dropping `mainCount`/`tiebreakerCount` left no reference in type, query, UI, i18n (`howWePlay.counts`) or tests (grepped).
- **Hidden wheel secrecy**: the new `hidden-wheel.test.ts` case compares the Player's raw response before and after an insert, with the Host's response as control, and the Host case asserts the exact games. Consistent with GLOSSARY `Hidden wheel` and roadmap 0.5.1.
- **Dev sign-in picture** (`server/dev/sign-in.ts`): insert and conflict update both set `image`, asserted in `dev-sign-in.test.ts`; `public/icons/icon-192.png` exists.
- **CI and knip**: `pnpm knip` added to `ci.yml` before `pnpm test`, to `package.json` and the README table; `knip.jsonc` gives a reason for every entry and ignore, and the two `@public` test doubles say why. `implementer-frame.md` and `merger.md` run the same `typecheck && lint && knip` as CI.
- **`.gitattributes`**: `* text=auto eol=lf` leaves binaries alone (git detects them); no `.bat`/`.cmd` in the repo.
- **`docs/agents`**: `subagents.md` keeps the model rule (haiku implementers and merge jobs, sonnet reviews, never opus) and links the frame, the merger and the motion/ADR checks; `delivery.md`'s `claude --chrome` sentence matches `scripts/browser/README.md`; `merger.md` has the merge job touch only the integration branch, leaving `staging`/`main` to the orchestrator.
- **CODING_STANDARDS additions** (Motion, Tests) are rules a reviewer can apply and name their tickets (#208, #207); CLAUDE.md § Personal data states what is public and what is not.
- **Glossary vs code**: no retired UI word reappears; `Release` (0.1 start, 1.0 declared by the operator) matches `release.md` (the glossary says „operator“, release.md „user“: same person, left alone); the `Session` entry's moved `_Avoid_` line closes the 1.4 review's N3. Round, Pool preview and Game notes describe not-yet-built behaviour, as the glossary already does for Veto and Award ceremony.
- **ADR 0013 amendment** matches roadmap 0.7 (Nuxt owns deadlines, the room sends to named Users) and does not touch ADR 0005's rule on Vercel imports.

---

## Spec review: Release 0.5.1 „Neue Nummern“ (v1.4.0...origin/staging, b977fd3)

Reviewer axis: Spec only (#215 with #216, #220, #221, #222; the two-axis review on the integration branch is not repeated). Read-only. Code read from `origin/staging` (b977fd3). I did not run `pnpm test` or the app. Ticket comments were read: #216 is closed ("redirect works, send-as is also configured"), #221 and #222 closed with staging checks, #220 open on purpose until the tags. The tags, the version cut and the roadmap "released" line are out of the diff by design and are not findings.

### Result

No blocking findings. Every acceptance criterion of #220, #221 and #222 and user stories 1 to 18 are met in the code and the tests. The Event read, the room (`event.changed` has no payload), the Activity feed (params hold ids and numbers only), the image route (`canSeePoolGames`) and the library hand a Player no pool count, name, id, image or clip under a Hidden wheel. One should-fix concerns an edge the spec names (a stale client or old server writing a 1.x version) and one nit-sized gap in the tags story. Nits follow.

### Should-fix

#### P1. A 1.x version stored after the migration can never be marked seen: the pop-up and the NEU chip then repeat until Release 1.5.0
- `server/api/me/news-seen.post.ts:18`, `app/composables/useNewsSeen.ts:33`, `shared/changelog.ts:129-132`, `docs/agents/delivery.md` § Database migrations.
- Spec: #215 story 4 „I want the pop-up for 0.5.1 once, and none of the older Releases again“; § Renumbering „A value outside the mapping and null stay as they are“; #220 „A User who already saw 1.4.0 is shown no older Release again.“ Edge named in the brief: a stale tab / old code posting 1.4.0.
- What is wrong: migrations run in the Vercel build, before the new deployment is live (`delivery.md`). For the minutes between the migration and the switch-over, the old code serves requests with `CURRENT_RELEASE` = 1.4.0. In that window (a) a User who had seen 1.3.0 (stored 0.4.0 after the migration) opens „Was ist neu“, which shows 1.4.0, and closes it: the old server stores `1.4.0`; (b) a User who signs in for the first time gets `newsSeen: '1.4.0'` from `auth.ts:70`. After the deploy that stored `1.4.0` is higher than every 0.x Release. `unseenReleases` shows only the newest Release (the value is no Release), but `markSeen` refuses to save it, on the client (`compareVersions('0.5.1', '1.4.0') <= 0` returns) and on the server (same test returns the old value). So the dialog opens on every page load and the footer NEU chip (`seen !== version`) stays on, until Release 1.5.0 exists. The migration test only covers 1.5.0 staying as is, not what happens to that value afterwards. The same happens after a rollback of the Worker/Vercel deploy to 1.4.0 code followed by a roll-forward.
- Cost: the group of Users who touch the app in the deploy window (small, but the app is used on game days) gets a pop-up on every visit, with no way to dismiss it for good.
- Fix: treat a stored value above `CURRENT_RELEASE` as unknown, in both guards. Server: `if (newsSeen !== null && compareVersions(newsSeen, CURRENT_RELEASE) <= 0 && compareVersions(version, newsSeen) <= 0) return { newsSeen }`; client: the same with the newest `RELEASES[0].version`. Add a case to `news-seen.test.ts` (stored `1.4.0`, marks `0.5.0`, becomes `0.5.0`). Alternatively (or in addition) deploy the Release at a time nobody uses it and name the window in the Release PR; the code fix is cheap and removes the dependence.

### Nits

- **N1. Tag story has no safety net for the retag.** #215 story 19 / #220: tags `v0.2.2`, `v0.3.0`, `v0.4.0`, `v0.5.0` on the commits of `v1.1.2`, `v1.2.0`, `v1.3.0`, `v1.4.0`. `origin` carries exactly those four, all annotated (`v1.1.2^{}` = fb25b7d, `v1.2.0^{}` = d61e336, `v1.3.0^{}` = c2da1af, `v1.4.0^{}` = 8a50773). Create the new tags on the `^{}` commit, not on the tag object, with messages `Release x.y.z – Name` (names: Angemeldet bleiben, Mehr Termine, Spielvorbereitung, Teams). `docs/agents/release.md` § Review step 1 diffs `vPREVIOUS...origin/staging`, so `v0.5.0` must exist before the 0.5.1 review runs next time; the old tags stay until the user's OK in #220, as specced.
- **N2. Old Neuigkeiten links lose their target.** `ReleaseCard` ids are the version (`neuigkeiten.vue`, `ReleaseCard.vue:21`) and the copy button shares `/neuigkeiten#<version>`. Anyone who copied `#1.4.0` (released yesterday) or `#1.2.0` now lands at the top of the page. Spec does not cover it and the cost is tiny; an optional fix is a small map in `neuigkeiten.vue` that scrolls `#1.x.y` to its new id.
- **N3. Old Neuigkeiten line still says the opposite of the fix.** `CHANGELOG.md:46` (0.4.0, #148): „Ist das Rad verdeckt, siehst du nur, wie viele Spiele drin sind.“ Spec says only headings change, and the new #222 line corrects it, so this is by design; noted so nobody is surprised on Neuigkeiten.
- **N4. Test gap, story 5.** `changelog.test.ts` adds the case „saw 0.5.0 sees only 0.5.1“ (story 4) but none for a mapped middle value (stored `0.3.0`, expect everything newer under new numbers, and `0.2.1`/`0.2.2` for a User who saw 1.1.1/1.1.2). The generic cases cover the logic, but spec §Testing asked for „a case for a User whose stored version was mapped“. Also nothing ties the migration's map to the CHANGELOG headings (all seven targets exist today, checked by hand); a test that each target of 0013 is a heading in `CHANGELOG.md` would keep a later edit honest.
- **N5. Stale comment.** `shared/changelog.ts:127` says „a User who joins long after 1.0“; 1.0 is now the future ready-Release. Spec keeps old numbers in code comments on purpose, so leave or fix with the next touch of the file.
- **N6. Contact flow and the Datenschutzerklärung.** Mail to `compies@christried.me` now passes Namecheap's forwarding before the operator's inbox; the Datenschutzerklärung names no mail provider (it did not name Google before either). Outside the three tickets, so not a finding; worth a line in a later Datenschutz pass if the user wants the recipient chain stated.
- **N7. #216 closing comment** says the redirect works but not literally that a test mail arrived. The user closed it and #221 started; no action.
- **N8. Scope.** The diff also carries the dev sign-in picture (`server/dev/sign-in.ts`), the game-board test fixture change, knip, `scripts/browser/*`, CI and agent docs. None is user-visible and none touches the pool or version rules; they ride along in a „patch, no new feature“ Release and need no changelog line.

### Checked and fine

- **Stories 1, 2 (new numbers everywhere).** `CHANGELOG.md` headings 1.0.0 to 1.4.0 map to 0.1.0, 0.2.0, 0.2.1, 0.2.2, 0.3.0, 0.4.0, 0.5.0 exactly as in #215; dates, names, intros and lines are untouched (diff shows only heading lines changing). `package.json` is 0.5.0 (right until the cut). The footer, Neuigkeiten and „Was ist neu“ all read `RELEASES` from the changelog, so they cannot disagree. No `1.x` string remains in user-visible copy; the only 1.x mentions left are code comments and the explaining line.
- **Story 3 (explaining line).** The `### Geändert` line under `[Unreleased]` reads as the spec's example, with the #220 link; the changelog parser and test need no new rule (versions still strictly descend).
- **Stories 4 to 8 (what the User sees).** Migration `0013_renumber_releases.sql` maps the seven values and leaves null and unknown values alone (`CASE` without `ELSE` is safe because `WHERE ... IN` restricts the rows; re-running is harmless since 0.x values are not in the list). Journal entry 13 has a later `when` than 12. A User who saw 1.4.0 (stored 0.5.0) gets only 0.5.1; one who saw 1.1.1 or 1.1.2 (0.2.1, 0.2.2) gets every newer Release; null and unknown stored values get only the newest; new Users get `CURRENT_RELEASE` and no pop-up; the value lives on the User, so two devices agree. Stale tab posting 1.4.0 against the new server: `news-seen.post.ts:17` answers 400, the client swallows it, nothing is stored (a test pins `1.4.0` as refused). Signed-out localStorage `compies.news.seen` holding `1.x.y`: it is only read for the Neuigkeiten stamp (equality test), so an old value just lets the stamp celebrate once for the newest Release; the pop-up and the chip are signed-in only and use the server value. The only edge that breaks is P1.
- **Stories 9 to 12 (contact address).** `i18n/locales/de.json` Impressum „Kontakt“ and Datenschutz § 1 name `compies{'@'}christried.me`; the other Datenschutz sentence that points to it („die unter Abschnitt 1 genannte Adresse“) needs no change. `copy.test.ts` finds addresses by pattern, so an escaped or odd spelling of the old one would still fail it. The old address is gone from the whole tree (grep over `origin/staging`, docs and tests included). No forwarding target is written in the diff, the issues or the comments; I did not repeat the git author address of the commits here. No `mailto` link exists, so nothing else carries the address.
- **Stories 13 to 18 (Hidden wheel counts).** `eventPools` returns `{ hidden: true }` before any query; `EventPools` lost both counts; `howWePlay.counts` and its call sites are gone (grep: no `mainCount`, `tiebreakerCount` or `howWePlay.counts` left). Host sees both pools under a Hidden wheel plus the new banner text (exact string of story 15); visible wheel, Host pick and an Event without settings (non-Host gets `{hidden:true}`, the card shows „Sanne legt gleich fest“; Host gets the games) behave as before. Switching the wheel on or off goes through `afterCommit`, which always sends `event.changed`, so a Player's page refetches and drops or gains the lists at once. Other channels checked for a leak: the room (`RoomMessage` types carry no game or count), the Activity feed (`game_count_changed` and `team_size_changed` carry the Game count and Team size, not the pool), `settings` (no pool field; `settingsFloors` is Host-only), the image route (`canSeeImage` uses `canSeePoolGames`, a hidden wheel or unset settings give a non-Host the missing-route answer), the library routes (library viewers only), the stepper (Host only) and the service worker (precaches `offline.html` and the favicon only, no API response cached). The secrecy test now also pins „same bytes whatever the pool size“ for a Player.
- **Story 19 (tags).** Not in the diff, as agreed; see N1 for how to do it. `release.md` and `roadmap.md` already use the new numbers and map the old ones.

---

## Thermo-nuclear review with architecture: Release 0.5.1 „Neue Nummern“ (v1.4.0...origin/staging, b977fd3)

Reviewer axis: thermo-nuclear code quality plus deepening opportunities (vocabulary of `codebase-design`: module, interface, depth, seam, adapter, leverage, locality). Read-only. Diff read without `drizzle/meta/*_snapshot.json`; touched modules judged in their surroundings (`server/utils/pools.ts`, `event-read.ts`, `server/domain/pool-visibility.ts` and `image-access.ts`, `HowWePlayCard.vue`, `shared/event.ts`, `shared/changelog.ts`, `news-seen.post.ts`, `useNewsSeen.ts`, `scripts/browser/*`, `server/dev/sign-in.ts`, `knip.jsonc`). `pnpm knip` run locally on b977fd3: clean. Planned releases follow `docs/roadmap.md` (0.6 Notizen with Pool preview, 0.7 Glücksrad). What the 1.4 review already scheduled (A1 Session state, A2 deadlines, A4 to A6) is not repeated.

### Result

- **Blocking: 0.** Nothing in this axis has to change before 0.5.1 reaches production.
- **Should-fix: 2**, both for 0.6: T1 (`EventPools` is a boolean wearing a union, and 0.6 is about to add a second reason to withhold pools) and T2 (the browser kit works around a gap in the dev sign-in route).
- **Architecture: 2** (A1 the pool visibility rule has two input shapes and 0.6 and 0.7 widen both; A2 `cdp.mjs` mixes the Chrome transport with COMPIES scenario knowledge, relevant when the second scenario lands in 0.7), plus one carry-over note.
- **Nits: 7** (N7 is a pointer for the Standards review).
- The release is a good patch. Removing the counts deleted code on every layer (a `groupBy` query, a computed, a copy key, two test cases) instead of adding a mode, the secrecy test got stronger, and the renumbering migration is bounded, explicit and tested against a real pre-migration database. No file is near 1k lines (largest touched: `HowWePlayCard.vue` about 190, `cdp.mjs` 179).

---

### Should-fix

#### T1. `EventPools` is a boolean in a union, and `eventPools(db, id, visible)` is a mode flag on a function that then ignores `db` (should-fix; do as the first ticket of 0.6, Pool preview)

Before this release `{ hidden: true, mainCount, tiebreakerCount }` carried a payload, so the tagged union earned its place. After it, `{ hidden: true }` carries nothing; `hidden` is a flag and the type is "the pools, or a marker that they are withheld". The residue is spread over five places:

- `server/utils/pools.ts:16-17`: `eventPools(db, eventId, visible)` starts with `if (!visible) return { hidden: true }`. A function that takes a `Db` and sometimes does not touch it, selected by a boolean its only caller computes one line above (`poolsVisibleTo(...)` in `event-read.ts:151`). The "no game can leak because nothing is selected" guarantee now lives in a branch of a loader instead of in the caller's decision.
- `app/components/HowWePlayCard.vue:51-56` and `:118`: `lists` returns `[]` when `pools.hidden`, and the template guards the same case again with `v-if="!pools.hidden"`. The `[]` arm is dead at runtime and exists to narrow the type.
- `app/utils/event-draft.ts:104`: `view.pools.hidden ? { main: [], tiebreaker: [] } : ...` with the comment "The Host always gets the games; the guard only narrows the type". If that invariant ever broke, the editor would silently save empty pools over the real ones. A silent fallback papering over an invariant (skill rule 5).
- `app/pages/e/[slug]/einstellungen.vue:39`: a fake default `{ hidden: false, main: [], tiebreaker: [] }` to satisfy the type while the read is loading.
- Test fixtures write `{ hidden: true }` / `{ hidden: false, ... }` by hand (`test/nuxt/event-page.ts:36`, `how-we-play-card.test.ts`, `team-names.test.ts:228`).

Code-judo move: model it the way `EventView` already models "this viewer does not get this": `settingsFloors: ... | null`, `start: ... | null`, `inviteUrl: string | null` (all "every other Member gets null"). So `pools: { main: PoolGame[], tiebreaker: PoolGame[] } | null`. Then:

- `eventPools(db, eventId)` is unconditional (no `visible` parameter) and `poolsSection` does `visible ? eventPools(...) : null` inside the `Promise.all` it already has, next to `poolsVisibleTo`, which already makes the decision.
- `HowWePlayCard` narrows with `v-if="pools"`; the `lists` computed has no hidden arm; `draftFromEvent` and `einstellungen.vue` take `pools ?? { main: [], tiebreaker: [] }` (the Host-only invariant becomes a visible `??` instead of a hidden flag).
- The secrecy tests keep their strongest assertion (`after` equals `before` byte for byte) and the changed one becomes `pools: null`.

Why 0.6 and not now: 0.6 adds the second reason pools are withheld (Pool preview off: "Members see no pool list and no counts"). Doing the reshape first means Pool preview arrives as a change to one decision (`poolsVisibleTo`) and not as a second meaning of `hidden` that the name ("Hidden wheel" in the doc comments) has to stretch over. Behaviour for Players is unchanged except `{"hidden":true}` becomes `null`; no client other than this repo reads it.

Note when doing it: a not-set-up Event (`settings === null`) already gets the withheld shape for non-Hosts (the "safe default" of `canSeePoolGames`). `null` states that more honestly than `hidden: true` ("not shown to you"), and the card's own `settings === null` branch already covers the copy.

#### T2. The dev sign-in route half-solves "the dev User has seen the news", and `cdp.mjs` `open()` works around the rest (should-fix; do in 0.6 with the first ticket that runs the browser kit, or as a chore before)

- `server/dev/sign-in.ts:37-38` writes `newsSeen: CURRENT_RELEASE` on **insert** only. The `onConflictDoUpdate` set (`canHost`, `isAdmin`, `image`) leaves `newsSeen` alone. So a dev database that already has the three Users shows the „Was ist neu“ dialog after every Release cut, and the 0.5.1 cut over 0.5.0 is such a cut.
- `scripts/browser/cdp.mjs:127-135` compensates: it reads `package.json` for `RELEASE`, POSTs `/api/me/news-seen`, probes `[role="dialog"]`, reloads after a fixed `sleep(500)` and hydrates again; `open()` has a sixth positional parameter plus an options object (`{ news }`) only to skip that. About ten lines, one race (the dialog check happens after hydration, the reload after a guess) and a second place that knows "what the newest Release is".

Code-judo: put `newsSeen: CURRENT_RELEASE` into the conflict `set` of the dev route (a dev-only route that already resets permissions and the picture on each sign-in). Then `open()` loses the API call, the dialog probe, the reload, the `RELEASE` constant and its `package.json` read; the browser kit no longer depends on the server's idea of the current Release. For the one check that wants the dialog (`news: true` today), let the route take `?news=unseen` and set `null`: a two-line branch in the dev route instead of a mode in the kit. Leverage: every later scenario (0.6 notes sheet, 0.7 wheel) starts clean without knowing about the pop-up.

---

### Architecture

#### A1. The pool visibility rule is fed two shapes, and 0.6 and 0.7 each widen both (worth exploring; shape it with T1 in 0.6)

`canSeePoolGames({ isHost, hiddenWheel: boolean | null })` is the one rule (module `server/domain/pool-visibility.ts`; the Event read and the image route both ask it, which is the right seam). But its interface takes loose fields, and the two callers build them from different sources:

- Event read: `poolsVisibleTo({ isHost, settings })` unpacks `settings?.hiddenWheel ?? null` from the parsed `EventSettings`.
- Image route: `poolEventsOf` (`server/utils/pools.ts:41-48`) `selectDistinct`s `{ isHost, hiddenWheel: events.hiddenWheel }` from the raw column, with a comment that the raw null is decided by the rule, and `PoolEvent` (`image-access.ts:5`) is a hand-written type of the same two fields.

0.6 (Pool preview: an Event setting, on by default, editable while the Event runs, off and disabled under a Hidden wheel) adds a third input to all of: the `events` column, `settingsFromRow`, the `selectDistinct` list (and its meaning: distinct over a wider tuple), `PoolEvent`, `canSeePoolGames` and `poolsVisibleTo`, plus the unit tests of both. 0.7 then adds the "drawn games" branch the file's header promises, which needs `now`/`revealAt` (review 1.4 A2, settled by the ADR 0013 amendment as "Nuxt owns the instants"). That is one function body widened by two releases through two differently shaped doors.

Deepening: make the rule's interface the facts, not the fields. A `PoolFacts` type (`hiddenWheel`, later `poolPreview`) with one constructor from an Event row (`poolFactsOf(row)`, used by the Event read and by `poolEventsOf`), and `canSeePoolGames(viewer, facts, now?)`. `poolsVisibleTo` (a pass-through that only unwraps `settings`) can then go, and `PoolEvent` becomes `{ isHost } & PoolFacts`. Deletion test: deleting the loose-field signature concentrates the three-way widening in one type. Interface = test surface: `test/unit/pool-visibility.test.ts` already tests through `poolsVisibleTo` and `canSeePoolGames`; it would test one function with a table of `(viewer, facts)`. Locality: the secrecy rule that 0.6 and 0.7 both depend on stays in one function.

Release: 0.6, in the same first ticket as T1 (both are "what does the Event read withhold, and why"). ADR check: nothing in 0001 to 0013 constrains this.

#### A2. `cdp.mjs` is named for the protocol and holds the COMPIES scenario kit (worth exploring; split when the second scenario arrives in 0.7, not before)

`scripts/browser/cdp.mjs` (179 lines) contains three layers in one file:

1. The Chrome adapter: find Chrome, spawn headless with a profile and port, `connect`, `send`, `evaluate`, `resize`, `shot`.
2. COMPIES knowledge: `/api/dev/sign-in?as=`, the news pop-up workaround (T2), `data-user-id`, `[data-drop-zone]`, `ANIMATION_SPY` that hooks `Element.animate` and reads `closest('[data-user-id]')`, `drag` with a 300 ms long press, the `api` fetch helper.
3. Scenario setup that lives in `moves.mjs`: launch two accounts, open each, join through the Invite link, bench both, wait 3 s, drain the spy.

Rule from `codebase-design`: one adapter is a hypothetical seam; there is exactly one scenario today (`moves.mjs`) and one thin screenshot script (`shots.mjs`), so splitting now would be speculation. The signal for 0.7: the wheel check is the second two-account scenario and will want the same bootstrap (layer 3), plus a different spy (the wheel spin and the synced clip are timed moments, not `Element.animate` moves). At that point: `chrome.mjs` (layer 1, no app knowledge), `compies.mjs` (layer 2: `open`, `api`, `drag`, spies as a list), and a `twoAccounts(slug)` helper that returns `{ host, member }` already joined and benched. `moves.mjs` shrinks to its four steps. The README's "A new check imports `cdp.mjs`" line becomes the interface description. Keep `open` from growing a flag per concern: a `spies: [...]` option instead of the one hard-wired `ANIMATION_SPY`.

#### Carry-over (no new finding): the "So wird gespielt" row/lock mapping from review 1.4 A3 is still as it was

The release touched `HowWePlayCard.vue` and did not make it worse: `ROW_SETTINGS` / `fixedWhenRunning` still re-map rows to `LOCKED_WHEN_RUNNING`. It stays scheduled with the state-dependent settings lock (0.7, with the first Round ticket). With T1 done in 0.6 the card is smaller by one computed and one branch, which makes that later change smaller.

---

### Nits

#### N1. The migration states its map twice (nit)

`drizzle/0013_renumber_releases.sql` lists the seven old versions in the `CASE` and again in the `WHERE ... IN (...)`; the test lists them a third time as seeds (that one is right: a test spells its data). A `FROM (VALUES ('1.0.0','0.1.0'), ...) AS m(old, new) WHERE users.news_seen_version = m.old` states each pair once and cannot drift. Per `CODING_STANDARDS.md` a migration that has run on staging is never edited, so apply this only if 0013 has not run on a shared database yet; otherwise leave it.

#### N2. Four code comments still call the planned Glücksrad "1.5" (nit; fix in 0.6 where the file is touched anyway)

`server/domain/pool-visibility.ts:8` ("1.5 adds the drawn games branch"), `app/components/EventPage.vue:28` and `app/composables/useServerClock.ts:12` ("timers of 1.5"), `server/utils/settings-floors.ts:10` ("stays 0 until 1.5"). The roadmap says code comments keep old numbers, but these four are not history, they are forward references, and after the renumbering "1.5" reads as "after 1.0". Write the release's name (Glücksrad) instead of a number: it survives the next renumbering. `pool-visibility.ts` is rewritten by A1 in 0.6 anyway.

#### N3. Two `@public` pragmas carry the same sentence in production source (nit)

`server/utils/image-store.ts` and `server/utils/room-notifier.ts` each got a three-line JSDoc whose second line explains knip to the reader of the code. The other reasons for knip exceptions are written once in `knip.jsonc` beside the entry they excuse. Move these two to one entry there ("test doubles live next to the interface they stand in for"), so a third double (0.7 will likely add a clock or timer one) is one more line of config and the production files carry no tool pragma. Or move the doubles under `test/`. Nit because nothing is wrong, only scattered.

#### N4. `scripts/browser`: ports belong to the account (nit)

`shots.mjs` and `moves.mjs` both hard-code `9311` for host and `9312` for member, and the README tells new checks "each account needs its own port". The port is a function of the account; `launch(account)` can own the table (`{ host: 9311, member: 9312, admin: 9313 }`) and drop the parameter from every call site. Do it in the same change as A2 or T2.

#### N5. `cdp.mjs` failure modes (nit)

- `send` never rejects and has no timeout or close handler: if Chrome dies mid-check, the script hangs until the shell's timeout instead of failing with the method name.
- `launch` swallows a `connect` error in the same `catch` that means "Chrome is still starting", so a real handshake failure shows as "did not start" after 10 s.
- `tab.spying` is an ad hoc property set on the returned object (`open`); a closure variable in `launch` is the direct form.
- `drag` recomputes the end point with its own `getBoundingClientRect` expression next to `centre` (which also scrolls). Fine, but a comment should say that scrolling `to` into view first is deliberate.

#### N6. "The newest Release a User has seen never goes down" is written twice (nit)

`server/api/me/news-seen.post.ts:15` (`compareVersions(version, newsSeen) <= 0` returns the stored value) and `app/composables/useNewsSeen.ts` (`markSeen`, same comparison, "never lowered, like the server"). The renumbering showed what this rule costs: a stored `1.4.0` would have pinned every User forever, which is why migration 0013 exists. One `seenAfter(seen: string | null, version: string): string` in `shared/changelog.ts` next to `compareVersions` and `unseenReleases` (the third consumer of the same ordering) makes both call sites one line and puts the rule where its tests are. No release needs it; do it when either file is next touched.

#### N7. Cross-axis pointer for the Standards review (not a code-quality finding)

`i18n/locales/de.json:1426` (`howWePlay.hostOnly`) and the Changelog line for #222 now say the others learn the count "am Rad". The wheel arrives in 0.7, and `CODING_STANDARDS.md` § Copy says "Copy promises only what the app does today". The Host's note describes a screen that does not exist yet; the previous text ("sehen nur, wie viele") was true as built. The Standards review should decide whether that copy says what is true today.

---

### Checked and fine

- **The count removal deleted complexity across layers** instead of adding a mode: the `groupBy` query and `countOf` in `pools.ts`, the `counts` and `hiddenText` computeds in the card, the plural `howWePlay.counts` key, two component tests; no leftover reference to `mainCount`, `tiebreakerCount` or `howWePlay.counts` in `app/`, `server/`, `shared/`, `test/`.
- **The secrecy guarantee got stronger and is tested at the right level.** `hidden-wheel.test.ts` still reads the raw response text, and the new "same response however many games the pools hold" case compares bytes before and after an insert, with the Host response as a control that the insert really changed the pools. That is the property the feature promises, stated directly.
- **The decision still lives in one place.** `poolsVisibleTo` / `canSeePoolGames` remain the only rule; `poolsSection` still loads the Host-only floors and the pools in one `Promise.all`; `eventPools` still selects nothing when the viewer must not know.
- **Migration 0013** is bounded (an explicit map, not a clever regex), leaves null and unknown versions alone, and is tested against a database migrated to the step before it (`createTestDbBefore` / `migrateTo`), including the unmapped `1.5.0` and null cases. The journal entry is ordered after 0012. It is also necessary: `news-seen.post.ts` never lowers the stored value, so without it a stored `1.4.0` would block every save.
- **`unseenReleases` needed no change**: a stored value that is not a Release shows only the newest, the right degradation for a signed-out device still holding `1.4.0` in localStorage; the new test pins the mapped case.
- **`knip` is wired the way the project already works.** `--production` with the reason for each `entry` and `ignore` written beside it, CI runs it before the tests, and it passes on b977fd3. `ignoreExportsUsedInFile` is a stated choice (helpers a unit test imports on purpose), not a loophole. The realtime workspace is configured without installing its dependencies and says why.
- **`.gitattributes`** `* text=auto eol=lf` states its reason (scripts that match text exactly, the SessionStart hook) and covers the old `*.sh` rule.
- **`server/dev/sign-in.ts`** gives the dev Users a picture so pages and checks draw what production draws (CODING_STANDARDS § Tests); `PICTURE` is one constant used in insert and conflict update, and the shared Nuxt fixture `test/nuxt/event-page.ts` got pictures in one place.
- **`scripts/browser/*`**: no dependencies, Node's global `WebSocket`, profile and screenshots outside the repo, the README states the limits (headless Chrome never starts the native image drag; staging and production need Claude in Chrome). `moves.mjs` prints what a reviewer needs (who moved, curve, duration, native drags, page errors). Untested, which is fine for a dev tool that is itself the check.
- **No file crosses or nears 1k lines; no new `any`, cast or optionality churn.** The `EventPools` change is type-checked through every consumer (see T1 for the residue).
- **ADRs respected:** 0013 (Nuxt decides, the room relays; the amendment is documentation only and this diff adds nothing that contradicts it), 0005 (no Vercel-only imports added), 0012 (no Worker change).
