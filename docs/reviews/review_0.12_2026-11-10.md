# Review 0.12 „Eventseite“ (2026-11-10)

Diff `v0.11.0...4d2fd32`, the tip of `spec/425-eventseite`, the integration branch of spec [#425](https://github.com/christried/compies/issues/425). A one-spec Release, so this review ran on the integration branch. Three `sonnet` reviewers: Standards; Spec against #425 and its 15 tickets; Quality and architecture. No browser check in the cloud: its items are on #448 and #449.

## Result

- **No Must-fix on any axis.**
- **Counts (Must-fix / Should-fix / Note):** Standards 0 / 1 / 8. Spec 0 / 1 / 6. Quality and architecture 0 / 3 / 7.
- **Shared findings:**
  - S6 and Q7: control characters in a Team word, which the feed's marker pieces then carry;
  - S5 and Q5: the optional `ceremonyShown` in `StageInput`;
  - S2 and Q6: the second `event_members` select in `feedTeamNames`. S2 proposes passing the state's members into `moveMember`; Q6 moves the call into `recordActivity`.

### Where each finding goes

| Finding | What | Where it goes |
|---|---|---|
| S1 | Add `Bench` and `Zuschauer` to `RETIRED` with the successor `Tribüne`, and `Bench: ['437']` to `REMOVAL_ISSUES`. | #488 |
| S2 | Add the row for the Team name an Activity entry stores to the One-home table; optionally pass the state's members into `moveMember`. | note, not fixed in 0.12 |
| S3 | No fix needed for the Release; optionally a case for `POST rounds` with a vetoed draw due, with budget 18. | note, not fixed in 0.12 |
| S4 | `stageParts` returns or exports `{ onWheel, parts }`, and `roundsSection` reads the decision from there. | note, not fixed in 0.12 |
| S5 | Make `ceremonyShown` required in `StageInput` and set `ceremonyShown: true` in the fixtures, or say in the comment that production always sends it. | note, not fixed in 0.12 |
| S6 | `activityParts` strips `[\u0001-\u0004]` from every value in a marked piece, or `parseTeamWord` refuses control characters. | #488 |
| S7 | List `scripts/browser/moves.mjs` in the "Process and tooling apart" section of the Release PR. | the Release PR into `main` |
| S8 | `poolGameView` drops `notes`, and the Host's dialog reads them from `hostGames` alone, if wanted. | note, not fixed in 0.12 |
| S9 | `castVeto` filters with `state.members.filter(member => partyOf(state, member.id) === team)` instead of reading `zone`. | #488 |
| F1 | Ask the user to approve one more clause on #446: for Events finished before 0.12, the frozen Team name stays stored while the Event exists. | the user's wording on #446 |
| F2 | Keep the #449 scroll item and run it on iOS Safari too; tell the user the ticket line was read as "no auto-scroll". | note, not fixed in 0.12 |
| F3 | Drop „bei allen zugleich“ from the changelog line, or write „nach derselben halben Sekunde“. | note, not fixed in 0.12 |
| F4 | One nuxt test that StepPool's sheet shows the Free-to-play hint. | note, not fixed in 0.12 |
| F5 | None needed; one line in the release notes' switch-over section, or accept. | note, not fixed in 0.12 |
| F6 | Nothing to build. | note, not fixed in 0.12 |
| F7 | Entries from before 0.12 keep their old reading (moves, resets and Bonus Vetoes keep the colour name); no action unless the user decides otherwise. | open with the user on #440 |
| Q1 | Keep the Team word field while it has the focus or an unsaved draft; `fold()` blurs the input itself. | #488 |
| Q2 | Place the Notes popover with `placeNotePopover` so it stays in the viewport; add a placement assertion to the test. | #488 |
| Q3 | Pass the clock's `ready` into `useStageOrder`; a clock that is not ready yet counts every moment at once. | #488 |
| Q4 | `stageParts` returns a literal union by case, and `poolsSection` takes the computed floors; or drop the claim from the header and the CODING_STANDARDS row. | note, not fixed in 0.12 |
| Q5 | One `stageTimeline(view, kind, now, counted, settleMs)` call; delete the `PageInput` and `Kind` aliases; `ceremonyShown` required (with S5). | note, not fixed in 0.12 |
| Q6 | Derive `TEAM_NAMING_TYPES` from `ACTIVITY_NAMES`; `recordActivity` calls `feedTeamNames` itself (with S2). | note, not fixed in 0.12 |
| Q7 | Refuse or strip the C0 control characters in a Team word (with S6). | #488 |
| Q8 | One line per switch-over item in `docs/roadmap.md` under the release that drops it, or a grep tag in the code. | note, not fixed in 0.12 |
| Q9 | Provide the host game facts at `EventPage` instead of drilling them; attach `GameNotesButton`'s listeners in `watch(open)`. | note, not fixed in 0.12 |
| Q10 | Rename or inline `started` in `EventStage.vue`; correct the `GameBoard.vue` header comment; one watcher in `TeamNameBuilder.vue`. | #488 |

## Standards

Sources read: `CODING_STANDARDS.md`, `GLOSSARY.md` (diff), ADRs 0007, 0013, 0016, `docs/agents/domain.md`, `docs/design_handoff_compies/04-motion.md` (diff), `test/unit/copy.test.ts`, the four migrations with their snapshots and journal, the tickets' decision comments (#440, #445). Run: `test/integration/lock-statements.test.ts` (30 passed). Nothing edited, committed or pushed.

Result: no "must fix before the Release". One "should fix", eight notes.

#### S1 · Should-fix · `test/unit/copy.test.ts:118-124` (`RETIRED`), `GLOSSARY.md` § Stands

Rule: `docs/agents/domain.md` line 47: "When the glossary retires a UI word, add it with its successor to `RETIRED` in `test/unit/copy.test.ts` in the same change, so the copy can't fall back to it." `CODING_STANDARDS.md` § Copy says the same.

Problem: 0.12 removes the glossary terms Bench and Spectator and writes `_Avoid_: Bench, Bank, waiting room, audience, Spectator` under Stands. The UI words they had were „Bench“ and „Zuschauer“ (v0.11.0 `de.json`: `fillFromBench`, `moveToBench`, `standsSub: "Zuschauer, spielen nicht mit"`). `RETIRED` still holds only the five old entries, so nothing stops the copy from falling back to either word. The Release's own #437 changelog line uses „Bench“ („Die Bench gibt es nicht mehr“), so the test needs its `REMOVAL_ISSUES` entry too.

Verified: `de.json` and `[Unreleased]` hold no „Zuschauer“ and, apart from the #437 line, no „Bench“, so the added entries pass today.

Fix: add `'Bench': 'Tribüne'` and `'Zuschauer': 'Tribüne'` to `RETIRED`, and `Bench: ['437']` to `REMOVAL_ISSUES`.

#### S2 · Note · `server/utils/activity.ts:52-63` (`feedTeamNames`), `server/utils/event-state.ts:434-441` (`teamNamesOf`), `server/utils/board.ts:36-42` (`moveMember`), `server/api/e/[slug]/move.post.ts`

Rule: `CODING_STANDARDS.md` § One home per concern, the Event state row: seats and Team words are facts the rules run on and come from `readEventState`, "in the parts their rules need"; the module's principle is that no part is read twice (`withParts`).

Two small things:

1. `feedTeamNames` selects `event_members` itself. `move.post.ts` has just read that part (`['members','sessions']`), and `moveMember` takes no state, so a move into a team runs a second `event_members` select under the lock (7 → 8 statements; the test comment names it). `composeTeamName(state.members, …)` is a pure function and would cost none. The doc comment justifies the separate function (settle.ts cannot import event-state.ts); that holds for settle, not for the move.
2. Team name composition now has two entry points (`teamNamesOf` for the read, `feedTeamNames` for entries). They differ on purpose (a stored `frozen_name` counts only in a finished Event), but the One-home table has no row for "the Team name an Activity entry stores", which is the row a later feature would look for.

Fix: add the row (`feedTeamNames`, ADR 0016) to the table; optionally pass the state's members into `moveMember`. The test still passes at 8.

#### S3 · Note · `test/integration/lock-statements.test.ts` (`LOCK_BUDGET = 16`), `scratchpad/416-measurement.md`

Rule: spec #425 § Order of work: "no write route runs more statements under the lock than the heaviest route does today"; the standards row for `lock-statements.test.ts`.

Problem: the budget fixture has no due draw. The measurement file says `POST rounds` with „Veto erlauben“ and a due vetoed draw ran 18 before #416 and 17 after it. #440 adds one `feedTeamNames` select in `settleDue` for a revealed Veto, so that case is back at 18 (the reviewer's arithmetic from the file and #440's comment; not re-measured). That equals today's heaviest including its extras, so the rule holds, but the only fenced settle case is `PUT countdown (a vetoed draw is due)`, a light route. The heavy route plus a due vetoed draw is unguarded.

Checked and fine: the six routes #440 touched stay at or under 15 (the ticket's own list: move 8, reset 6, Bonus Veto 7, Result 10, Finish 14, settle 9); `readHostGameFacts` and the new `teams` read sit outside the lock or in the lock-free read.

Fix: none required for the Release. If wanted, a case `POST rounds (set, Veto erlauben) with a vetoed draw due` with its own budget of 18 and a comment saying why.

#### S4 · Note · `server/utils/stage-read.ts`: `stageParts` (l. ~95-100) and the head of `roundsSection` (l. ~110-125)

Smell baseline: Duplicated Code, a judgement call.

Problem: both compute `lucky = eventHasWheel(settings)`, `onWheel = lucky && runningOf(sessions)`, `!viewer.isHost && !onWheel`, and which parts a viewer gets (`vetoes`/`pool`, plus `bonus` when lucky). `roundsSection` guards drift with `lacking()`, which throws at runtime. A change to the rule in one place surfaces as a 500 on the Event read, not as a failing compile.

Fix: `stageParts` returns, or exports, the decision (`{ onWheel, parts }`) and `roundsSection` reads it from there.

#### S5 · Note · `app/utils/event-stage.ts` l. 25-26 and l. 170-171 (`view.ceremonyShown === false || …`)

Rule: `CODING_STANDARDS.md` § Tests: "Test data has the shape production data has."

Problem: `EventView.ceremonyShown` is required and the server always sends it, but `StageInput` makes it optional and treats a missing value as "shown", the comment saying "other fixtures build one without it". Production types bend to fixtures, and a view that ever lacks the field shows the result.

Fix: make it required in `StageInput` and give the fixtures (`test/nuxt/event-page-states.ts`) `ceremonyShown: true`. If that is too wide for now, leave the default but say in the comment that production always sends it.

Shared with Q5.

#### S6 · Note · `app/utils/activity.ts` (`TEAM_OPEN` `\u0003`, `TEAM_SEPARATOR` `\u0004`, `OPEN`/`CLOSE`), `shared/team-word.ts` `parseTeamWord`

Problem: `parseTeamWord` refuses spaces and more than 12 characters, nothing else, so a word may hold U+0001 to U+0004. The Team name now travels into `teamPiece(...)` verbatim, so such a word splits or garbles the feed line of its own team. No injection (Vue escapes the text); cosmetic only. The same class already existed for display names and game names under `OPEN`/`CLOSE`; `\u0003`/`\u0004` are new in 0.12.

Fix: `activityParts` removes `[\u0001-\u0004]` from every value it puts into a marked piece, or `parseTeamWord` refuses control characters.

Shared with Q7.

#### S7 · Note · Release PR: process and tooling list

Rule: `docs/agents/release.md` § Release PR: "Process and tooling apart" lists changes under `.github`, `scripts`, `.claude`, `docs/agents`.

Problem: `git diff --name-only v0.11.0...HEAD -- .github scripts .claude docs/agents` gives one file, `scripts/browser/moves.mjs` (the browser move check now knows one zone).

Fix: it belongs in that section of the Release PR.

#### S8 · Note · `server/utils/pools.ts` `eventPool` (the Host's `PoolGame` carries `notes`), `server/utils/library.ts` `readHostGameFacts`, `shared/event.ts` `hostGames`

A guess about intent.

What is seen: for the Host, every pool game's Notes travel in `pool[].notes` and again in `hostGames[id].notes`, on a read the page repeats every 15 s (ADR 0001). The tests pin both on purpose (`hidden-wheel.test.ts`); whether `PoolGame.notes` should now go is a #443 decision that is not visible in the ticket. No secrecy effect, since Host only.

Fix, if wanted: `poolGameView` drops `notes`, and the Host's dialog reads them from `hostGames` alone.

#### S9 · Note · `server/utils/rounds.ts` l. 143 (`member.zone === 'team' && member.team === team`) in `castVeto`

Rule: `server/utils/event-state.ts` header: "The seats of a Member are `placeOf(row)`, never `zone` read on its own."

Problem: harmless today, since a legacy `bench` row is never `team`, but the 0.12 header names the rule because of the `bench` leftovers. `partyOf`/`seatOf` give the same answer through `placeOf`.

Fix: `state.members.filter(member => partyOf(state, member.id) === team)`.

### Checked and sound

- **Migrations 0030 to 0033** (CODING_STANDARDS § Database, ADR 0007): each carries a switch-over note, and each note matches what the code does with the rows the previous deployment writes (0030: countdown start column, read as the later of `started_at` and `last_started_at`; 0031: old reset and start writes on `event_teams`; 0032: `bench` read as the Stands, enum value kept; 0033: `ceremony_starts_at` counted by `ceremonyShownOf`). Journal entries 30 to 33 in order, snapshots chained by `prevId`, each with its own migration test. None has run on staging, so none was edited after the fact.
- **Secrecy, #444 (pool game face).** `playersMin/Max` and `suitabilities` leave `poolGameView` for `poolGameFace` and travel exactly where the face already did. `hostGames` is `null` for every non-Host, and `GameDialog` ignores Tags and Notes for a `member` audience. `hidden-wheel.test.ts` and `pool-preview.test.ts` assert the new keys' absence.
- **Secrecy, #440 (Team names in the feed).** `teamNames` is a sibling key, so `publicParams`' rebuild of `vetoes` does not touch it. A `vetoes_revealed` entry is never published, so `lte(activity.at, now)` still hides it. `ParamsSafe` still refuses a game's name under any other key. ADR 0016 and the Datenschutzerklärung say what the code does.
- **#445: is any of the result sent before it may show?** Yes, by the ticket's decision, so not a finding. The Event read still carries `standings`, `results`, `end` and the `event_finished` entry; the pending view is a client wait. The one server-side refusal is the Share image route (`ceremony_pending`, 409), which is what the ticket asks for.
- **One home across `event-stage.ts`, `event-page.ts`, `activity.ts`.** `app/utils/activity.ts` is the only place that builds a feed sentence; `teamNameOf` is its one resolver, backed by `TEAM_NAMING_TYPES` in `shared/activity.ts`. `event-instants.ts` is gone with no leftover reference.
- **Motion (CODING_STANDARDS § Motion, `04-motion.md`).** `riseFade`, `namePop`, the fold, and the glide on `REFLOW_CLASS` take the tokens 04-motion names, and each has a test. Reduced motion and a hidden tab have their own tests.
- **Copy and glossary.** No „Bench“, „Zuschauer“ or „eingefroren“ in `de.json` outside the legal text; `ceremony_pending` is in the error table with its German line; Tribüne, Teamwort and Siegerehrung are used as the glossary says. The Datenschutzerklärung's „Stand“ date moved.
- **Tests.** The new list and name tests have edge cases (`GAME_NAME_MAX` in game card, pool, dialog, rounds, notes button, feed; 0, 1, many).

Smell baseline (judgement calls, repo standards win): nothing beyond S4 (Duplicated Code) and S5 (the optional field). `GameTile` is a thin wrapper but carries the dialog's state, so it is not a Middle Man; the three tile sites share it and `GAME_GRID`, which is the opposite of a copy.

## Spec

Sources: spec #425 body, the 15 ticket bodies and their comments. An issue body wins over an older brief comment: #423's body says 8 Tags, no migration, hint under the Tags field; its brief comment says 16, a migration, hint under the Price field; the code follows the body. Browser-check criteria are out of scope (#448, #449). Read-only; nothing run (CI is green on the tip).

Verdict: every ticket is built. No criterion is missing. All findings below are small; none must block the Release.

#### F1 · Should-fix · `i18n/locales/de.json`, `legal.datenschutz.events.text` and `legal.datenschutz.retention.text`

The Datenschutzerklärung no longer says that frozen Team names are still stored for Events finished before 0.12. The Events text sentence is „Zu jeder Session speichern wir, wann der Host sie gestartet und beendet hat.“; the retention text is „Ein Teamwort wird gelöscht, sobald du dein Team verlässt; im aktuellen Namen des Teams steht es dann nicht mehr. Ausgenommen sind die Einträge des Aktivitäts-Feeds …“.

Problem: `drizzle/0031_team_names_open.sql` keeps `event_teams.frozen_name` in every finished Event, and `shared/board.ts` `composedTeamName` / `server/utils/event-state.ts` `teamNamesOf` show it there (#438: „Finished Events keep theirs“). A frozen name is composed from the Team words of its day, so in a pre-0.12 finished Event a Team word stays stored (and shown on the Standings and the Share image) after its Player left the team. The 0.12 text removed „eingefrorene Teamnamen“ and names only the feed as the exception, so „Ein Teamwort wird gelöscht, sobald du dein Team verlässt“ is not true of those Events, and the stored names are no longer disclosed at all. The 0.11 text covered it („eingefrorene Teamnamen … solange das Event besteht“).

Not a deviation from the ticket: #446's approved wording drops both. It is a gap in what was approved.

Rule broken: #446 „The Datenschutzerklärung describes what 0.12 stores“, and the rule that each sentence is true of the code as built.

Fix: ask the user to approve one more clause on #446, e.g. „In Events, die vor dem 10. November 2026 abgeschlossen wurden, bleibt der Teamname, der beim Start der ersten Session eingefroren wurde, gespeichert, solange das Event besteht.“ (retention text; the Events text can keep it implicit), and move the „Stand“ if needed.

#### F2 · Note · #441 (scroll), `test/nuxt/event-page-order.test.ts` l.141

"Die Seite scrollt nie von allein" is built as "no scroll API is called", not as "keep the viewer's place".

What is said: #441 body: „The page never scrolls by itself (keep the viewer's place when a block moves above it)“. Decision comment (orchestrator, 2026-11-10T14:26): „the page calls no scroll API on a reorder; no scroll compensation“. This is the orchestrator's decision, not the user's. `test/nuxt/event-page-order.test.ts` l.141 pins „calls no scroll API“.

Scenario (a guess, not verified): a Member scrolled down to the Game board; a block rises above it; the board is pushed down by the block's height. Chromium and Firefox scroll anchoring may hold the place; Safari has none. The #449 item „the scroll position holds when scrolled to the board“ is the check. If it fails on a phone, the fix is `overflow-anchor` handling or a scrollTop correction in `EventStage.vue`, which is what the decision left out.

Fix: keep the #449 item and run it on iOS Safari too; tell the user the ticket line was read as "no auto-scroll".

#### F3 · Note · `CHANGELOG.md` § Unreleased, „Die Bühne folgt dem Spiel“

The #441/#442 line says the block rises „bei allen zugleich“. The order is a function of stored instants and each device's estimate of the server clock (`useStageOrder`), and news that reaches a device later than 0.5 s lifts at once. So the rise is at the same server instant, but not the same moment on every screen: slightly more than the code promises.

Fix: drop „bei allen zugleich“ or write „nach derselben halben Sekunde“.

#### F4 · Note · `test/integration/library-free-to-play.test.ts`, `app/components/stepper/StepPool.vue` l.176

#423's „the stepper's sheet behaves the same“ has no test of its own. The library test covers create and edit through `POST /api/games` and `PATCH /api/games/:id`. The stepper's „Neues Spiel anlegen“ sheet is the same `GameForm` posting to the same route, so the rule holds by construction. The ticket's criterion names the sheet; no test does. Low risk.

Fix, if wanted: one nuxt test that StepPool's sheet shows the hint (the GameForm test already pins the hint).

#### F5 · Note · #438 (the Finish deletes `event_teams` rows), `teamNamesOf`

An Event the previous deployment finishes during the switch-over keeps its stray frozen names. #438's decision comment deletes `event_teams` rows at the Finish „in the same transaction“ so names do not jump back. That is the 0.12 code's Finish. If the 0.11 build finishes an Event after migration 0031 ran, the rows its start inserted stay, and from then on `teamNamesOf` shows them (finished Event) instead of the words the Event showed live. The window is minutes long and the same shape as the accepted #445 switch-over case, but #438's comment accepts only the reset case.

Fix: none needed; add one line to the release notes' switch-over section, or accept.

#### F6 · Note · `result_corrected` (`shared/activity.ts`), `test/integration/activity-team-names.test.ts` l.146 (decision covers it)

Spec #425 story 25 and § Implementation Decisions list `result_corrected` among the kinds that store a name. #440's body says „every kind whose params carry a team position“, and #440 brief decision 1 says a Correction names no team (`shared/activity.ts`: `result_corrected: { roundId, number, gameId }`; sentence „{name} hat Spiel {n} ({game}) korrigiert“). Verified true; a test pins it.

Nothing to build.

#### F7 · Note · entries written before 0.12 (#440 brief decisions 3 and 9; flagged to the user already)

Old moves, resets and Bonus Vetoes keep the colour name; old Vetoes, Results and Event ends resolve live. ADR 0016 says old entries „keep resolving“ the name and that moves, resets and Bonus Vetoes name the Team name „of the moment“; the code does the latter only for new entries.

Open to the user on #440 (point 3: live names for all; point 9: „seit 0.12“ in the Datenschutzerklärung). No action unless the user chooses otherwise.

### Per ticket

| Ticket | Verdict |
|---|---|
| #415 One Stage module | Built, tested. |
| #416 One Event state | Built, tested. Budget guard 16, measured before the build. |
| #423 Free-to-play | Built, mostly tested. The stepper's sheet has no test of its own (F4). |
| #435 Game tiles | Built, tested. |
| #436 Notes in the picker | Built, tested. |
| #437 One Tribüne | Built, tested. |
| #438 Team names open | Built, tested. Switch-over edge in F5. |
| #439 Folded builder with pencil | Built, tested. |
| #440 Feed names of the moment | Built, tested. `result_corrected` names no team (F6); old entries (F7). |
| #441 Stage order | Built, tested. Scroll: no compensation, see F2. Changelog wording: F3. |
| #442 Standings rise first | Built, tested. |
| #443 Host's game dialog | Built, tested. |
| #444 Member's game dialog | Built, tested. |
| #445 Finished Event waits for the ceremony | Built, tested. |
| #446 Datenschutzerklärung | Built, tested. One gap (F1). |

#### Per-ticket notes

- #441: the „Gerade dran“ and Standings moments and the 0.5 s delay are built as the ticket says; the migration 0030 for `countdowns.last_started_at` is beyond the three the spec names, covered by a decision comment and its own migration test.
- #446: every approved sentence is in `i18n/locales/de.json` word for word, except the frozen-name gap (F1). Sentence by sentence, the rest is true of the code: „Tribüne oder ein Team“; the feed sentence (wider than the data for pre-0.12 entries, nothing in it false); the Share image sentence; the Notes sentence (broader than the code, promises no reader the code lacks); `realtime`.

### CHANGELOG § Unreleased

Every ticket that asks for a line has one in the section it names: #423, #436, #443, #444 under `### Neu`; #435, #437, #438, #440, #441 (with #442), #445, #446 under `### Geändert`; none for #415, #416, #439, #442, as their tickets say. No line promises more than the code does except „bei allen zugleich“ (F3). #426 (hub nav) is not in this diff: it is the local phase's ticket, with no line yet, as spec #425 plans.

## Quality and architecture

Reviewer axis: `thermo-nuclear-code-quality-review` and `improve-codebase-architecture`, applied to the diff. Read-only. `pnpm lint`, `pnpm typecheck` and `pnpm knip` are green on the tip. No file crosses 1000 lines (largest touched: `CeremonyLayer.vue` 458, `event-state.ts` 441). "Proved" means reproduced by a test run in a scratch copy of the checkout; "Read" means from the code only.

No finding is a must fix before the Release. Q1 is should fix with a proved failing scenario; Q2 and Q3 are should fix with concrete failing scenarios.

#### Q1 · Should-fix · `app/components/TeamNameBuilder.vue:63-64` · proved

`const showName = computed(() => props.named && !(canWrite.value && editing.value))`

`named` is "the team has any word", from any Player. `editing` is only set by the pencil. A Player in an unnamed team sees the field without ever having pressed the pencil, so `editing` is false. When someone else's word arrives (refetch, room), `showName` turns true and the field is replaced by the folded name and the pencil, whatever the Player is typing.

Scenario (the ticket's use case: a lobby naming its teams at the same time): Player A and Player B in team 1, no word yet. Player A focuses the field and types "Wil". Player B saves "Gurken". Player A's page reads the Event: team 1 is now named. Proved with a copy of `test/nuxt/team-name-builder.test.ts` plus one test (mount `GameBoard`, focus and type, `setProps` with the named team): after 500 ms the input is gone, the pencil is there, the posted words are `[]` and `document.activeElement` is `BODY`. The draft "Wil" is lost and keyboard focus drops to the page. In 0.11 the field was always shown (`mine && !frozen`), so this is new with the fold (#439). Whether a real Chrome fires `blur` on the removed input (and so posts "Wil" through `onBlur`) is not proved; either outcome is unintended: a lost draft, or a word saved from a field that vanished.

Fix: keep the field while it has the focus or an unsaved draft: `showName = props.named && !(canWrite.value && (editing.value || focused.value || draft.value !== saved.value))`. `fold()` must then blur the input explicitly (Enter and Escape fold by `editing = false`, which today relies on the field being replaced), otherwise `returnFocus` never fires.

#### Q2 · Should-fix · `app/components/GameNotesButton.vue:28-31` (`onScroll` l. 47-51) · read

The popover is placed at `top: rect.bottom + 6` with `max-h-[min(60vh,420px)]`. A button in the lower part of the picker (a Host with a long list, md and up, where the popover is `fixed`) gets a popover whose bottom lies below the window. Scrolling would show the rest, but `onScroll` closes the popover on any scroll outside it.

Scenario: viewport 800 px high, the Notes button of a row at y = 650, notes of 300 px: the popover spans y = 656 to 956, so 156 px are unreachable.

The canonical helper already exists: `placeNotePopover` in `app/utils/note-popover.ts` (above/below flip, clamped; `NotePopover` renders, measures, places). `GameNotesButton` is the third home of "popover on md, sheet below" (next to `MoveToMenu` and `NotePopover`) and re-implements placement without it (thermo-nuclear rule 6).

Fix: measure like `NotePopover.place()` and call `placeNotePopover` (the arrow is not needed). The test (`test/nuxt/game-notes-button.test.ts:75-120`) asserts CSS classes (`fixed`, `w-72`, `max-h-[min(60vh,420px)]`), not where the popover ends up; add a placement assertion with a stubbed `getBoundingClientRect`.

#### Q3 · Should-fix · `app/composables/useStageOrder.ts:78,91,100` · read

`useStageOrder` reads `serverNow()` straight away. Every other consumer of the clock waits for `serverClockReadyKey` (`useServerTicker`, #287, review 0.8 Q11: "a device clock running ahead cannot end a moment early"); `useServerClock.now()` is `Date.now()` until the first `clock.pong`. `useEventView` refetches on `room.state === 'open'`, the same moment the probes start, so the first live read can land before the pong.

- Device clock ahead (minutes): the first read sets `orderAt` to the device time; `Math.max(orderAt, serverNow())` never lets it back, so for the rest of the page's life `orderAt` runs ahead. Moments are counted at once (the 500 ms delay is gone, #441), and `standingsHeld` (`arrival > orderAt`) is false, so the result sequence (#442) never waits.
- Device clock behind: the timer is armed for `due - serverNow()` on the wrong clock, and nothing re-arms it when the clock syncs; the block rises on the next read (up to 15 s).

Fix: pass `ready` in (`useStageOrder(view, serverNow, ready)`) and treat a not-ready clock as `orderAt = null` (everything counted) until it turns true. `EventPage` owns the clock, so it can hand it down; `inject` does not work inside the providing component.

#### Q4 · Note · `server/utils/event-state.ts` header, `server/api/e/[slug].get.ts`

The header says "calling [a rule] on a state that lacks one is a compile error". In the Event read the guarantee is gone: `stageParts()` returns `StatePart[]`, so `withParts<S, P>` infers `P = StatePart` and the result is typed `S & EventState<every part>`. For a Member who does not see the wheel, `state.vetoes`, `state.pool` and `state.bonusTeams` are typed present and are `undefined` at runtime. `poolsSection(state: EventState<'members' | 'rounds' | 'vetoes'>, …)` only works because of the runtime guard `viewer.isHost ? floorsOf(state)`; remove the guard and it compiles and throws. `roundsSection` knows it (`hasParts` + `lacking()`); the handler does not. The module also claims "the one cast of the module" and has three double casts (`eventStateOf`, `withParts`, `readEventState`'s `rows as StateRows<P>`).

Fix: let `stageParts` return a literal union by case (`[]` | `['vetoes','pool']` | `['vetoes','bonus','pool']`) and give `poolsSection` a `Partial` facts argument or the already computed floors; or drop the claim from the header and the CODING_STANDARDS row.

#### Q5 · Note · `app/utils/event-stage.ts`, `app/utils/event-page.ts`, `app/composables/useStageOrder.ts:46-47` · deepening candidate

`event-stage.ts` exports `stageBlocks`, `stageCounted`, `stageMoments`, `stageRises`, `stageArrival(s)`, `risen`, `stageInstants`, `stageUnsettled`. Four of them re-run `listed(view, kind)` (every `present` and `moment` closure), and `useStageOrder.sync()` calls `pageFacts(current).kind` three times per read, plus `eventPageState` once more in the page. The caller must know that `stageArrivals` has to run before `stageCounted` (comment at `useStageOrder.ts:46-47`: "arrivals first, while `counted` is still what the page counted before this read"): a temporal coupling carried by call order.

Deletion test: one `stageTimeline(view, kind, now, counted, settleMs)` returning `{ blocks, counted, moments, rises, arrivals }` would concentrate this; the callers shrink to one call and the order dependency moves inside it. The interface is also the test surface today: `test/nuxt/event-stage.test.ts` (863 lines) calls each function. Worth doing, not urgent.

Smaller, same module: `PageInput = StageInput` and `type Kind = PageKind` in `app/utils/event-page.ts` are pure aliases (delete them, import the real names). `StageInput.ceremonyShown` is optional with the silent default "a view without it counts as shown" only so that test fixtures may omit it (`event-stage.ts` `listed()`), although a production `EventView` always has it (thermo-nuclear rule 5). Make it required and fix the fixtures (shared with S5).

#### Q6 · Note · `shared/activity.ts:60` (`TEAM_NAMING_TYPES`), `app/utils/activity.ts:49`, `server/utils/board.ts:40`

`TEAM_NAMING_TYPES`, the `teams:` extractors of `ACTIVITY_NAMES` and `LIVE_WHEN_UNSTORED` list the same six types; a test ("keeps this list in step", `test/unit/activity-params.test.ts`) glues the first two. Production calls `activityTeams()` for one of the six (`moveMember`, `server/utils/board.ts:40`); `settle.ts`, `results.ts`, `vetoes.ts`, `finish.ts` and `reset-name.post.ts` derive the positions by hand (`casts.map(...)`, `first`, `[team]`, `winners`). So five `teams` extractors exist for a test only, and a new sixth writer can forget it without a compile error: `NamedTeams<T>` demands `teamNames`, not that its keys equal `activityTeams`.

`feedTeamNames` is a second `event_members` select next to the state's `readMembers`. The doc names the import cycle with `settle.ts` as the reason, so keep it a function, but the call belongs in `recordActivity`.

Fix: derive `TEAM_NAMING_TYPES` from `ACTIVITY_NAMES` (`teams` present) and have `recordActivity` (or one `namedEntry()` helper) call `feedTeamNames(tx, eventId, activityTeams(type, params))` itself, so no writer repeats it and the five extra reads disappear from five files (shared with S2).

#### Q7 · Note · `shared/team-word.ts` (`parseTeamWord`), `app/utils/activity.ts` (`teamPiece`) · read

`parseTeamWord` accepts U+0001 to U+0004. `app/utils/activity.ts` builds sentences with U+0001/U+0002/U+0003/U+0004 as markers and now puts a Player-chosen Team name inside one (`teamPiece`). A word `a` + U+0002 + `b` ends the piece early: the rest renders as plain text, and a word with U+0003 digit U+0004 forges a TeamMark of another team in the sentence of every Member. Cosmetic, no injection (everything is text nodes), but the stored name is permanent (ADR 0016).

Fix: reject C0 control characters in `parseTeamWord` (the field strips them with the spaces), or drop them in `teamNameOf` (shared with S6).

#### Q8 · Note · eight switch-over places across the 0.12 diff

0.12 adds eight places that read legacy data of the deployment before 0.12 (ADR 0007):

1. `parsePlace` and `placeOf` (`bench`);
2. `useBoardPlaces.hear` (`parsePlace` again);
3. `movedText` (any non-team place);
4. `teamNamesOf` (stored `frozen_name` in finished Events);
5. `ceremonyShownOf` (stored start);
6. the later-of `startedAt`/`lastStartedAt` in the Countdown piece;
7. `LIVE_WHEN_UNSTORED`;
8. `finishEvent`'s `delete(eventTeams)`.

Each is commented, none is tagged. Nothing says when `ZONES` may lose `bench`, when the `Place` check in four files goes, or when `teamNameOf` may stop guessing.

Fix: one line per item in `docs/roadmap.md` under the release that drops it, or a `// SWITCH-OVER 0.12, drop in 0.13` tag to grep.

#### Q9 · Note · `EventRounds.vue`, `LuckyWheel.vue`, `HowWePlayCard.vue`, `GameTile`, `GameDialog`, `GameNotesButton`, `GameCard`

- `GameTile` and `GameDialog`: three call sites (`EventRounds.vue`, `LuckyWheel.vue`, `HowWePlayCard.vue`) each repeat `:audience="isHost ? 'host' : 'member'"` and `:facts="hostGames?.[game.id] ?? null"`, and `hostGames` is drilled through `EventStage` to `StageWheel` to `LuckyWheel` to `EventRounds` to `HowWePlayCard`. The audience is `facts !== null` in every reachable case (the read sends `hostGames` to the Host only); `GameDialog` already re-guards by `audience`. One provided "host game facts" at `EventPage` (or `GameTile` taking the map and the id) removes two props from four components.
- Every tile mounts its own `AppSheet`, `useDialog` and `useAuthUser`; a pool of 30 games is 30 closed sheets. Acceptable at this size; a `v-if="dialogOpen"` around `GameDialog` would also hold the comment's reason ("goes with the tile when the tile leaves").
- `GameNotesButton` registers a `pointerdown` and a capture `scroll` listener per instance at mount, closed or not; a picker with 40 rows has 80 global listeners, the scroll one on every scroll event. Attach them in a `watch(open)` and detach on close.
- `GameCard` now has three renderings of its name (`to ? NuxtLink : asButton ? 'button' : 'b'`) driven by `layout`, `to` and `opens`; the `tile` layout switches off meta lines with `showMeta`. It still reads, but the next variant should be its own component (`GameCard` as tile is a different element: cover and name).

Fix: provide the host game facts at `EventPage` instead of drilling them (the first bullet); attach the listeners in `watch(open)` (the third). The other two are acceptable at this size and for the next variant.

#### Q10 · Note · `app/components/EventStage.vue:71`, `app/components/GameBoard.vue` header comment, `app/components/TeamNameBuilder.vue`

Stale wording left by #438 and #437:

- `EventStage.vue:71`: `started` is "the teams and their names are locked for Players". Names are no longer locked; only `HowWePlayCard :locked` (the settings rows) uses it.
- `GameBoard.vue` header comment (the "running" phase): "teams and names are locked for Players". Same.
- `TeamNameBuilder.vue` registers two watchers on `() => props.name` (announce, pop) with the same `name !== before` test; one watcher with both effects reads simpler.

Fix: rename `started` to what it is (`hasStarted`) or inline it; correct the `GameBoard.vue` comment; one watcher in `TeamNameBuilder.vue`.

### Tests

Behavioural where it matters (`event-stage`, `event-page-order`, `event-page-ceremony-wait`, `activity`, the migration test). Two spots assert internals: Q2's classes, and `test/unit/activity-params.test.ts`, which pins `ACTIVITY_NAMES.teams` for five types whose production code never calls it (Q6). The Stage rules and `useStageOrder` tests sit in `test/nuxt` although `event-stage.ts` and its rules are pure (the `unit` project has the `~` alias): they run under the Nuxt runtime only because of `useStageOrder`'s `ref`/`watch`; moving the pure half to `test/unit` would speed the loop.

### Architecture candidates (deepening, for the retro; none blocks the Release)

1. Stage timeline as one module (Q5): Strong.
2. `recordActivity` owns the Team names of an entry (Q6): Strong, small, deletes five call-site reads.
3. One popover/sheet module for `NotePopover`, `GameNotesButton`, `MoveToMenu` (Q2): Worth exploring.
4. Provide host game facts instead of drilling (Q9): Speculative.

No candidate contradicts an ADR (0016 keeps the Team name of the moment; Q6 only moves where it is stored).

### Verified without finding

- The order of the Stage (`PIECES` ranks reproduce the old `pageBlocks` lists kind by kind); the counted and arrival logic of `useStageOrder` (null clock, hidden tab, second Result, reload); the ceremony hold (`useCeremonyHold` and `CeremonyLayer.over`, including a viewer who comes back after the run).
- The three team-name writers' read-before-write order (`feedTeamNames` runs before every change in move, reset, Bonus Veto, Result, Finish and settle).
- Migrations 0030 to 0033 (journal monotonic, switch-over notes match the code); the Free-to-play tag rule; Host-only `hostGames`.
- Smell baseline: nothing beyond S4 and S5 (see Standards).
