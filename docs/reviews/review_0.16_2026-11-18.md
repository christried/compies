# Review 0.16 „Bibliothek“ (2026-11-18)

Range: `v0.15.0...claude/inspiring-cerf-eda3s3` (tip fe7789e7). The Release spec is #717.

Per `docs/agents/release.md` § Review, walk-through, retro, step 1, three reviewers read the Release diff. Their three reports are merged here without dropping or adding a finding:
- Standards: the `code-review` Standards axis against `CODING_STANDARDS.md`, `docs/adr/` (0018, 0019 in particular, 0007, 0013, 0015), `GLOSSARY.md`, `docs/agents/release.md` and the smell baseline. IDs `S1`…`S9`.
- Spec: the `code-review` Spec axis against #717 and its tickets (#734, #605, #721, #722, #455, #723, #615, #727, #467, #728, #731, #730, #732, #724, #725, #733, #656, #726, #720, #729, #454, #464). IDs `N1`…`N5`.
- Quality: code quality and architecture. Method note: `christried-thermo-nuclear-code-quality-review` is `disable-model-invocation`, so this reviewer could not call it (the Skill tool refused) and reviewed in the `improve-codebase-architecture` / `codebase-design` vocabulary instead (module, interface, depth, seam, locality, leverage, deletion test). If the user wants the skill's exact output, `/christried-thermo-nuclear-code-quality-review` has to be run by the user. IDs `F1`…`F11`.

Nothing was run by the reviewers: no `node_modules` in the worktree (Standards), no test suite and no browser (Spec and Quality). The browser items are left to #737 and #738 by their tickets, and the migration on a dev or staging database to the #721 open box.

## Result

- **Must fix: 1** (S1).
- **Should fix: 12 IDs in 9 entries** (S2, S3 = F1 with F8, S4, S5, S6 = F2, S7, F3, F4, F5).
- **Nit: 12 IDs in 10 entries** (S8, S9 = N5 = F6, N1, N2, N3, N4, F7, F9, F10, F11).
- All 25 IDs are kept: Standards 9, Spec 5, Quality 11.
- Where two reviewers found the same thing, the entry carries both IDs and each report's file:line, rule and fix. Where two reports share only part of a finding, the shared part is one entry and the rest keeps its own.
- F8 was rated nit by its reviewer. Its content is the live-Event half of S3, so it sits in the S3 = F1 entry (should fix) with its own rating noted there.
- Where the reports cite different line numbers for the same thing, both are kept as written. Line 203 for the schema comment was checked on the tip (see S9).

---

## Must fix

### S1: the Datenschutzerklärung still describes the old image and notes audience

- Where: `i18n/locales/de.json:1357` (section 5 „Spielbilder“), not touched by the Release; `i18n/locales/de.json:1381` (Events section) does not mention the new stored Event notes.
- Rule: CODING_STANDARDS § Secrecy: „A feature that shows Members something they didn't see before … is checked against every section of the Datenschutzerklärung that says who sees what. In 0.7 both the YouTube section and the image section still said only Hosts; the user approves the new text (§ Copy).“ And § Copy: „A new third party … goes into the Datenschutzerklärung … the user approves the text.“
- What breaks: section 5 says „Sehen dürfen ein Bild Personen mit Host-Berechtigung (Abschnitt 6) und Admins, außerdem Mitglieder eines Events …“. Since #723 only the owner of a game row with that key sees it (CHANGELOG „Sicherheit“ says so), not every Host and not the Admin. The Events section lists what is stored per Event but not the Host's Event notes (`event_game_notes`, #731), which are new stored User text. The `test(legal)` Stand-date check (#650) also follows the text, so the Stand date moves with the edit.
- Fix: draft the new section 5 sentence (owner, then Members as before) and one clause in the Events section for the Host's Event notes; put both in the Release PR for the user's approval and move the Stand date with the cut.

---

## Should fix

### S2: new motions have no test of their curve, duration or reduced-motion fallback

- Where (Standards): `app/components/RichNotesLinkControl.vue:166-190` (popover `translateY(-4px)` 0.14 s, bar height 0.22 s, close 0.14 s, reduced variants); `app/assets/css/notes.css:103-117` (`.cp-note-pop`, `cp-note-pop-reduced`, used by `GameNotesButton.vue:136`); the toolbar tooltip CSS in `RichNotesToolbar.vue:194+`. Only `disclosureEnter`/`disclosureLeave` are pinned (`test/nuxt/game-notes-disclosure.test.ts:242-253`). `test/unit/notes-css.test.ts` covers text, headings, lists, links but has no `.cp-note-pop` case; `rich-notes-link-control.test.ts` has no `animate`/`easing`/`duration` assertion.
- Rule: CODING_STANDARDS § Motion: „Its test asserts that easing and duration, as well as that something animated.“ and „A motion's static fallback (reduced motion, a failed chunk, a skip) has a test for its geometry.“
- Fix: add a case per motion: stub `Element.prototype.animate` as the disclosure test does and assert duration 140/220 and the `--cp-ease-out`/`--cp-ease-in` curves for the link control (popover and bar, plus the reduced branch); add a `notes-css.test.ts` case that `.cp-note-pop` uses `--cp-dur-base`/`--cp-ease-out` and that both reduced selectors switch to `cp-note-pop-reduced` with `--cp-dur-fast`.
- Related (same report): `enter`/`leave` set `animation.onfinish` only. A cancelled animation (the control unmounts while it runs) never calls `done`; `heightRun` in `app/utils/motion.ts:350-364` guards this with a timer. Reuse `heightRun`'s guard (or `heightRun` itself for the bar) instead of a second hand-rolled height run (Duplicated Code, see S5).

### S3 = F1 (with F8): the own-library, Archived and live-Event predicates are copied into server sites

Standards (S3):
- Where: `games.createdBy = host` + `archivedAt IS NULL` in `server/utils/event-state.ts:262`, `server/utils/pools.ts:37`, `:49`, `:64`, `:91` (nested in `gameEventsOf`), `server/utils/rounds.ts:69`, `server/api/games/[id]/archived.put.ts:35`, and the live-Event rule `events.hostId + deletedAt IS NULL + phase IN beforeFinish` in `server/utils/library.ts:158` and `server/utils/pools.ts:77`. `assertGamesExist` (`pools.ts:44-50`) and `assertPoolGames` (`pools.ts:58-66`) also repeat the same id-normalise-and-count shape.
- Rule: CODING_STANDARDS § One home per concern: „Each concern below has one home. New code calls it; a second copy is a finding even when it works. The 1.3 review found … a feature repeating a pattern the codebase had just collapsed.“ Baseline: Duplicated Code / Shotgun Surgery (judgement call: the next change to „what counts as in the pool“ must touch all of them; `pools.ts:91` already differs from the others by a nested select).
- Fix: put the three terms in `server/utils/library.ts` as SQL fragments (`ownedBy(hostId)`, `notArchived`, `liveEventOf(hostId)`) and call them from each site; let `assertPoolGames` call `assertGamesExist` with an extra `notArchived`-or-pooled condition passed in, so there is one lookup.

Quality (F1):
- Files: `server/utils/event-state.ts:257-266` (`readPool`), `server/utils/pools.ts:30-39` (`eventPool`), `pools.ts:64` (`assertPoolGames`), `pools.ts:91` (`gameEventsOf`, inPool), `server/utils/rounds.ts:69` (`setNextGame`), `server/utils/library.ts:30` (`loadGame`).
- Why it matters: the two predicates `games.createdBy = hostId` and `games.archivedAt IS NULL` are the whole of #722/#725. Each query spells them itself, and `readPool` and `eventPool` are two near-identical join + `ORDER BY lower(name), id` queries that differ only in the archived term. A seventh reader added in 0.17 (an export, a "random game" button) that forgets one term puts an archived or foreign game on a wheel or in a Member's list, and nothing fails at the type level. The tests pin the six places that exist today, not the next one. By the deletion test this is a missing shallow-to-deep move: the rule is real, but it lives in no module.
- Fix: in `server/utils/library.ts` add two small predicate builders, `ownedBy(hostId)` and `notArchived` (or one `hostLibraryGames(hostId, { archived?: 'any' | 'no' })`), and use them in all six. Better still, one `poolRows(db, eventId, hostId, { archived })` that `readPool` (ids) and `eventPool` (rows) both call, so the join and the order live once.

Quality (F8, the live-Event half of this finding, rated nit by its reviewer):
- Files: `server/utils/pools.ts:77` (`liveEventsHolding`), `server/utils/library.ts:158` (`liveEventCounts`): both `isNull(events.deletedAt), inArray(events.phase, PHASES.filter(beforeFinish))`.
- Why it matters: „library card counts“ and „who is told when I archive“ must agree by definition (#733 vs #725); today the same sentence lives in two files and `PHASES.filter(beforeFinish)` is recomputed per call.
- Fix: one `liveEventOf(hostId)` condition (or a `LIVE_PHASES` constant plus a helper) next to `beforeFinish`, used by both.

### S4: the „One home per concern“ table has no row for the 0.16 concerns

- Where (Standards): `CODING_STANDARDS.md` (the release adds only three Copy bullets).
- Rule: the table is the review's list of homes (`CODING_STANDARDS.md` header: „What the Standards review checks“); AGENTS.md § Standing rules: „Record new standing rules in this file or `docs/agents/`“.
- Missing homes: the notes document and its limit/visible-text rules (`shared/notes-doc.ts`: `parseNotes`, `notesLength`, `notesHasText`, `notesLinkHref`); rendering a notes document (`RichNotes`, never `v-html`, ADR 0019) and the one stylesheet `notes.css`; the editor's Tiptap list kept in the lazy chunk (`app/utils/notes-extensions.ts`, `nuxt.config.ts` `lazy-chunks-no-prefetch`); „is this game in this Host's library“ and „is it Archived“ (S3 = F1); `wheelPoolSize` for any count of the pool a Host sees (`app/utils/event-draft.ts:79`); `useGameArchive` for archive/restore; `sortTagsByLabel`.
- Fix: add one row each, with the rule „a second copy is a finding“.

### S5: the same notes-pair logic is written five times in the components

- Where (Standards): `notesHasText(x) ? x : null` in `GameDialog.vue:41`, `GameNotesButton.vue:29-30`, `GameNotesDisclosure.vue:29-30`, `GameNotesStack.vue:18-19`; the „both blocks → sub = Event name / „aus deiner Bibliothek““ rule in `GameNotesDisclosure.vue:80,94`, `GameNotesStack.vue:32-40`, `GameDialog.vue:165-174`; and the Event block + game block pair itself is laid out three times (`GameNotesStack`, the round variant of `GameNotesDisclosure`, `GameDialog`).
- Rule: baseline smell Duplicated Code; CODING_STANDARDS § One home per concern (last paragraph: „A second page, flow or component that does what an existing one does needs its reason in the PR description.“).
- Fix: `GameNotesStack` already is the pair; give it a `bare`/`framed` option and use it in the Round disclosure and the dialog, and move the blank-to-null normalisation into one composable (`useNoteDocs(props)` returning `doc`, `eventDoc`, `both`).

### S6 = F2: four Event-notes props travel together through nine components

Standards (S6):
- Where: `eventNotes`, `eventName`, `eventFinished`, `saveEventNotes` are declared and forwarded in `EventStage.vue`, `EventRounds.vue`, `HowWePlayCard.vue`, `StageWheel.vue`, `LuckyWheel.vue`, `GameTile.vue`, `GameDialog.vue`, `GameNotesDisclosure.vue`, `GameNotesButton.vue`/`GameNotesStack.vue` (+ `NextGamePicker`, `EventHostDialogs`), each with its own default line. The same four were already travelling beside `hostGames`, which is read from the same `view`.
- Rule: baseline smell Data Clumps; Shotgun Surgery (adding a field to Event notes touches every file). The repo has the same finding in CODING_STANDARDS §“One home”: a feature repeating a pattern.
- Fix: one object (`EventNotesContext { notes, eventName, finished, save }`) provided from `EventStage` with `provide/inject` (a `useEventNotes()` composable) so the tiles read it where they need it; keep `hostGames` beside it.

Quality (F2):
- Files: `EventStage.vue:192,208,315` -> `StageWheel.vue:13` -> `LuckyWheel.vue:41-51` -> `GameTile.vue:13-21` -> `GameDialog.vue:30-40`; `EventStage` -> `EventRounds.vue:43` -> `GameNotesDisclosure`/`GameNotesStack`; `HowWePlayCard.vue:39`; `NextGamePicker.vue:20`; `EventHostDialogs.vue`. `grep "saveEventNotes?:"` finds six declarations of `((gameId: string, notes: NotesDoc | null) => Promise<boolean>) | null`, plus the composable.
- Why it matters: `eventNotes`, `eventName`, `eventFinished` and `saveEventNotes` travel together and are read at one place only (the dialog and the popover). Every intermediate component (`StageWheel`, `LuckyWheel`, `EventRounds`, `GameTile`, `HowWePlayCard`) is a pass-through with a bigger interface and no behaviour: shallow modules, and the next consumer of Event notes (the Round card, a future feed) pays the same toll again. The „guard is this component's“ comment in `GameDialog` shows the authors felt the leak.
- Fix: one `EventNotesContext` (`{ notes: Record<string, NotesDoc> | null, eventName, finished, save }`) provided by the Event page (`provide`/`inject` through a `useEventNotes()` composable, the same way `useStageActions` already is the single owner of the PUT). `GameDialog`, `GameNotesButton` and `GameNotesDisclosure` read it; the five pass-throughs lose four props each. As a minimum, export `type SaveEventNotes` from `shared/event.ts` and use it in all places.

### S7: `RichNotesEditor` carries unused modes and props

- Where (Standards): `app/components/RichNotesEditor.vue:15,24,52,122,170,175,190,200,214` (`readonly`) and the `label`, `help`, `placeholder` props; `i18n/locales/de.json` `notesEditor.finishedHelp`. No caller passes `readonly`, `label`, `help` or `placeholder` (`GameForm.vue:375`, `GameDialog.vue:189`); a finished Event never opens the editor (`GameDialog.vue:44` `canEdit`).
- Rule: baseline smell Speculative Generality; CODING_STANDARDS § Copy: „no pill for a state the screen already shows“ (the readonly branch shows a „Event beendet“ chip and an „Das Event ist beendet“ line together, on a screen that is the finished Event).
- Fix: delete `readonly`, the three text overrides and `notesEditor.finishedHelp`; the read-only finished look already lives in `NoteBlock` (`frozen`).

### F3: the server's notes schema and the editor's schema disagree, and a client workaround covers the gap

- Files: `shared/notes-doc.ts:99-108` (`parseBlock`: a heading accepts bold), `app/utils/notes-extensions.ts:31-34` (`NotesHeading` has `marks: 'italic link'`), `app/utils/notes-editor.ts:150-167` (`editorContent` strips bold from stored headings so the editor will not refuse edits).
- Why it matters: ADR 0019 says the schema is „exactly“ the server's list. Here the server's is wider, so a document that `parseNotes` accepted is one the editor cannot hold. The patch lives in a third place (`editorContent`) and exists only to fix the mismatch. Tests pin the patch (`notes-editor.test.ts:59`) but nothing pins the general invariant „every document `parseNotes` accepts survives the editor's schema unchanged“. The existing test covers only the opposite direction (editor output is a fixed point of `parseNotes`). The next narrowing in either place drifts silently.
- Fix: make the server the narrow one. In `parseBlock` for a heading, drop `bold` from the text nodes' marks (or refuse the document, like any other unknown mark). Documents exist only since 0.16 and the 0038 conversion makes plain paragraphs, so no stored heading with bold can exist. Then `editorContent` reduces to the empty-paragraph default. Add one nuxt test that loads a corpus of valid docs (every node and mark combination) into the Tiptap schema and asserts `getJSON()` equals the input.

### F4: a Host's Event-notes save wakes the whole room (low)

- File: `server/api/e/[slug]/games/[gameId]/notes.put.ts:9`. The comment says „that a Host's note changed is no secret“.
- Why it matters: the Event read a Member gets does not change (`eventNotes` is null for them), yet every Member's client gets `event.changed` and refetches the whole Event on each save. It also tells every Member when the Host edits notes. `changeEvent` has the option for exactly this (`broadcast: false`, used by the sealed Veto), and `publishTo` for named Users.
- Fix: `changeEvent(event, { hostOnly: true, lock: 'update', broadcast: false }, ...)` and in `saveEventNotes` `publishTo([user.id], { type: 'event.changed' })` so the Host's other tabs still refresh. (Pass `user` through the `Pick`.)

### F5: no failure state when the lazy editor chunk does not load (verify first)

- Files: `GameForm.vue` (the `ClientOnly` + `LazyRichNotesEditor` block), `GameDialog.vue` (same), `RichNotesEditorFallback.vue` (`aria-hidden`, empty box).
- Why it matters: the notes field is now only reachable through a dynamic import. On a flaky network (a Host at the table, on a phone) a failed chunk fetch leaves the `ClientOnly` fallback in place forever: an empty, hidden box, no message, no retry, and the game form is saveable without the notes field being usable. The reviewer did not run it in a browser. Nuxt may also route the rejected import to its error handler; check both outcomes. The tests cover the chunk being lazy, not it failing.
- Fix: wrap the lazy component in `NuxtErrorBoundary` (or define the async component with an `errorComponent`) that shows a short German line and a „Erneut laden“ button, and make the fallback `aria-busy` with a visually hidden „Editor lädt“ text instead of `aria-hidden`.

---

## Nit

### S8: Copy against the Copy rules (goes to the wording sweep)

- Where (Standards): `i18n/locales/de.json` `library.kicker` = „Deine Spiele“ above the title „Bibliothek“ (`app/pages/bibliothek/index.vue:31`); `notes.finished.chip` = „Event beendet“ in `NoteBlock.vue:68` on a page that already is the finished Event.
- Rule: CODING_STANDARDS § Copy: „no kicker that repeats the page's title or place … no pill for a state the screen already shows“.
- Fix: drop the kicker (the page's own title and the Event-less library already say it) or give it a wink only if the wording sweep wants one; drop the chip where the dialog is on a finished Event (the dashed frame stays).

### S9 = N5 = F6: small hygiene (Standards item 9, with the schema points of Spec and Quality)

Standards (S9), five small items:
- (a) `app/components/GameDialog.vue:188,197`: `<!-- eslint-disable vuejs-accessibility/no-autofocus -->` without the reason every other disable in the repo gives (` -- …`). Add one. (Checked on the tip: the line is 188.)
- (b) `server/db/schema.ts:203`: the comment above `games` still says „one global library that Hosts fill“. Say „one library per Host (ADR 0018)“. (Spec N5 cites line 204; the tip has the comment on line 203.)
- (c) `i18n/locales/de.json`: the new `notes` group uses snake_case (`from_library`, `open_a11y`, `link.new_tab`) beside `gameNotes`, `eventNotes`, `notesEditor` in camelCase; four namespaces for one subject. Rename to camelCase and fold into `notesEditor`/`eventNotes`.
- (d) `server/db/schema.ts:216-219`: property `notes` now maps to column `notes_doc` and `notesLegacy` maps to column `notes` (baseline: Mysterious Name). The comment explains it; it will bite the next raw-SQL writer, so name the property `notesDoc` or drop `notesLegacy` with the follow-up Release as planned. (On the tip: `notes: jsonb('notes_doc')` at line 218, `notesLegacy: text('notes')` at line 220.)
- (e) `CHANGELOG.md` „Notizen formatieren“ (#454) does not say that the limit rose from 1000 to 2000 characters (`shared/game.ts` `GAME_NOTES_MAX`), a change Users can notice (release.md: „plain German for Users“). Add a clause.

Spec (N5), the same comment:
- `server/db/schema.ts:204` still says „one global library that Hosts fill“. Replace with „one library per User (ADR 0018)“.

Quality (F6), the same column pair:
- File: `server/db/schema.ts` (the `games` table: `notes: jsonb('notes_doc')`, `notesLegacy: text('notes')`).
- Why it matters: the property named `notes` reads the column `notes_doc` and `notesLegacy` reads the column `notes`. Drizzle code is fine, but raw SQL or a script that goes by the property name will read the wrong column (the tag-review script correctly says `g.notes_doc`; the trap is one `sql\`\`` away). The comment explains it, and the next Release drops the column.
- Fix: either accept until the drop is done, or name the properties after their columns (`notesDoc`, `notes` -> `notesLegacy`) now while the blast radius is these few call sites. Put the drop of `notesLegacy` and the rename into the follow-up issue.

### N1: the Game page lists no Event whose only link is a Round that waits for its Result (decision to confirm)

- Ticket/spec: spec § F „every Event they host that is not deleted and either holds the game in its Game pool **or has a Round with it that was not put back**, finished Events included“. Story 77: „every Event of mine that holds or played the game“.
- Code: `server/utils/game-events.ts:562-566` counts only Rounds with `resultAt IS NOT NULL AND putBackAt IS NULL`, and the doc comment says a set Round that still waits for its Result „does not make a row on its own“. An Event that set the game directly (not in its pool) and has not entered the Result yet is not listed, and the Event stays unlisted until the Result is entered. #656's implementer decided this and the orchestrator accepted it, but the spec text is wider.
- Fix: either drop `isNotNull(rounds.resultAt)` from the id-collecting query and keep `played` counting Rounds with a Result (the row then reads „im Pool“, which is the wrong word for a game in no pool, hence the brief's reasoning), or amend § F to say „played“. The second is cheaper; add a third label if the first is chosen.

### N2: the Event block in the „Nächstes Spiel setzen“ popover and sheet has no Event-name sub

- Ticket/spec: #732/#729 „Event notes above Game notes … in the notes popover and sheet of Nächstes Spiel setzen“; the design's sub („the Event's name“) shows where both blocks show.
- Code: `app/components/NextGamePicker.vue:75,105` passes `:event-notes` only; `eventName` and `eventFinished` are not threaded (reported by the #729 implementer as a deviation). With both blocks present the Event block has no sub there; behaviour and secrecy are unaffected.
- Fix: thread `view.event.name` into `EventHostDialogs` → `NextGamePicker` → `GameNotesButton`.

### N3: Event notes on a game's page are behind a collapsed disclosure

- Story 79 „each row to show that Event's Event notes“. `GameEventList.vue:53-58` renders them in `GameNotesDisclosure variant="round"`, closed by default, with the „Nur du siehst das“ lock line. Everything is reachable, but the note is one click away. The #656 comment says this was chosen on purpose (#729 Q8).
- Fix: only if the operator wants the text visible, pass `start-open`.

### N4: the CHANGELOG line of #467 overstates „fällt aus dem Spielepool“

- `CHANGELOG.md` „Aus dem Glücksrad und dem Spielepool deiner Events … fällt es damit ebenfalls heraus“. The pool row stays and the Host's own pool still lists the game, marked „Archiviert“ (stories 37/38); only the wheel, the pickers and Members' lists drop it.
- Fix: say „Aus dem Glücksrad … und aus dem Pool, den deine Mitglieder sehen“, or „bleibt im Pool, markiert, aber nicht mehr auf dem Rad“.

### F7: `gameEventsOf`: inline duplicate subquery and no owner match

- File: `server/utils/pools.ts:86-100`. (Same site as S3 = F1, `pools.ts:91`; this entry is about the duplicate subquery and the missing owner match.)
- Why it matters: `withKey` is built once and then rebuilt inline for `inPool` with the archived term, in a 300-character line. `inPool` also does not require `games.createdBy = events.hostId`, so a foreign pool row left by the 0.15 code during the migration window still shows a Member that game's image although no list shows the game (the new readers skip such rows). It is a narrow gap and the window is minutes.
- Fix: `const liveWithKey = withKey.where(isNull(games.archivedAt))`-style helper on one base query (`gamesWithKey(imageKey, { archived })`), add the host condition (`eq(games.createdBy, events.hostId)` inside the correlated subquery), and break the line.

### F9: small shallow spots

- `app/components/EventNotes.vue` is a one-line wrapper over `NoteBlock` (adds `kind="event"` and the edit label). Fine as a name, but fold it into `NoteBlock`'s callers or accept it; deletion moves, not concentrates.
- Link `rel` differs: `RichNotes.vue:55` writes `noopener noreferrer`, the editor's `Link` (`notes-extensions.ts:117`) `noopener noreferrer nofollow`. Pick one, put it in `shared/notes-doc.ts` as `NOTES_LINK_REL`.
- `assertGamesExist(tx, hostId, ...lists)` (`pools.ts:46`) is variadic, but its one caller (`event-notes.ts:30`) passes one list. Make it `(tx, hostId, ids: string[])`. (Related to S3 = F1, which also covers `assertGamesExist`.)
- `RichNotesEditor.vue:62-73`: `silent` is read in a watcher before its `let` (line 73). It works through the closure, but reorder it.
- `RichNotesEditor.vue:79`: every keystroke runs the whole `parseNotes` rebuild plus `JSON.stringify` (up to the 200 kB JSON cap). Fine at 2000 characters, but a paste of a huge text makes the editor sluggish; a `requestAnimationFrame` or 150 ms debounce on `onUpdate` would be cheap.

### F10: hand-maintained dependency list in `nuxt.config.ts`

- File: `nuxt.config.ts:62`: the `lazy` regex names `prosemirror-*`, `linkifyjs`, `orderedmap`, `rope-sequence`, `w3c-keyname`, `crelt`.
- Why it matters: a Tiptap upgrade that adds a transitive dependency (e.g. `markdown-it`, `@floating-ui`) regains the prefetch hint silently. `test/build/notes-editor-lazy.test.ts` is a good guard, but it runs under `pnpm test:build` only; confirm CI runs it on the Release PR. Alternative: match on the chunk's importers (`chunk.isDynamicEntry` of the lazy components and their `imports`) instead of package names.

### F11: migration 0036 loops per pair with an unindexed `activity.params->>'gameId'` update

- File: `drizzle/0036_game_copies_per_host.sql` (the `UPDATE activity ... WHERE ac.params->>'gameId' = ...` inside the `FOR pair` loop, and the same expression in the `refs` union).
- Why it matters: each pair costs a scan of the Host's Activity rows (`ev.host_id` narrows through the join, but the filter on the JSON key has no index). Fine for the current production size (the operator's rehearsal is the check named in the file), and the one-statement `DO` is right for the driver. If the rehearsal on a production-sized copy takes more than seconds, switch the activity update to one set-based statement after the loop with a temp mapping table `(host_id, old_id, copy_id)`.

---

## Checked and found sound (per reviewer)

- **Standards:** no `v-html`/`innerHTML`/`getHTML` in the notes path (ADR 0019); the notes document is rebuilt by `parseNotes` on both write routes and the length goes through `characterCount` (`shared/text.ts`); Event notes save through `changeEvent` and are read only in the Host branch of `[slug].get.ts`; `games.created_by` has its index from 0006, `event_game_notes.game_id` gets its index in 0039; migrations 0036–0039 are written for the switch-over window (ADR 0007) and no migration that ran on staging is edited; the removed code (`canEditGame`, `not_game_editor`, `formatMonthYear`, `filterMine`, `createdBy`) has no leftover reference; every new de.json key is used; CHANGELOG groups are the five allowed ones in order and issue links are in the required form; no retired UI word appears.
- **Spec:** Event notes never reach a Member (the only carriers are `EventView.eventNotes`, the Host-only PUT route and `GET /api/games/:id/events`, owner only; no Activity entry, no room payload); archived games are excluded from a Member's pool list, from the Event state's pool (`readPool`) and from picker and refusal paths, and `RoundGame`/`PoolGameFace` carry no `archived` flag; a Host's library is only their own (`loadGame` answers `libraryNotFound` for unknown, non-uuid and foreign ids); migrations 0036–0039 are in the journal with rising `when` and the snapshot chain is linked; changelog lines exist for every ticket that asked for one.
- **Quality:** ADR 0019 holds (only the four pre-existing own-asset `v-html` in the Compibert/CoinFlip files); one link rule (`notesLinkHref`) is used by the parser, the renderer, the Tiptap `isAllowedUri`, the link control and the Ctrl+click handler; the 0038 trigger fires only on a SET that names `notes`; `parseNotes` check order is right and `notesHasText` is the single „are there notes“ rule; `archived.put.ts` is idempotent; `readGameEvents` and `eventCounts` run in a fixed small number of statements.

## Not verified

- Browser-only items (toolbar at 390 px, sheet height, popover placement): #737 and #738.
- The migration on a dev or staging database: #721 open box, the operator's.
- No test suite, lint or typecheck was run by any reviewer.
