# Review 0.16.1 „Wortwahl“ (2026-11-18)

Diff `fe7789e7...48b6d243`, the tip of `spec/790-wortwahl`, the integration branch of spec #790, after the merge of #797. `fe7789e7` is the tip of Release 0.16, on which 0.16.1 is built. The review ran on the integration branch (`docs/agents/release.md` § Review, walk-through, retro), in a cloud session, before Release 0.16's own review had run (the operator's decision of 2026-11-18 on #790). Three `sonnet` reviewers: Standards, Spec (#790 with #791 to #811), quality with architecture. Nothing of this Release was measured in a browser: #813 is the local check.

## Result

- **No must-fix on any axis.** The Spec axis compared 83 ticket texts with `de.json` on the tip by script (0 differences), found all 38 removed keys gone from `app`, `server`, `shared`, `scripts`, `test` and `public`, and traced all 102 changed keys to a ticket or a recorded decision.
- **Shared findings:** the copied „shown message“ pair and error line of #797 (Q3, S12); the old button names in code comments (S8, Q8) and in two Host texts (P1, already in the Release PR notes).

## Fixed before `staging`: #825

| | Finding | Fix |
|---|---|---|
| F1 | Q1 | A form message is announced again: the red line gets `role="alert"`. |
| F2 | Q3, S12 | One `FieldError` component draws the line; one function in `useTouched.ts` gives the shown message; `CODING_STANDARDS.md` § One home per concern gets rows for the form messages, the brand fills, the Has voted colour and the new wording modules. |
| F3 | Q4 | The game form recognises the notes reason by what it is, not by its translated text. |
| F4 | Q5 | The price's reason beside „Speichern“ follows the fields' order, so it names the same problem as the group's line. |
| F5 | Q2 | The walk report prints the count of its mono uses from the list. |
| F6 | S8, Q8 (comments, the dead `kicker` pass) | Code comments name the buttons as they read now; `GameHistory` no longer passes a `kicker` that `ResultEntry` hides. |

## For the operator: findings about single texts

The texts of this Release are the operator's own words from the sweep, and `CODING_STANDARDS.md` § Copy says a string the spec prescribes word for word is decided. So these are questions, posted on #812 (the sweep of the new texts), and no ticket changes a text until the operator has answered:

- P1: `stepper.games.tie` and `dock.lastGameBlocked.game_count_range` still say „Unentschieden beenden“ and „ein letztes Spiel hinzufügen“; the buttons read „Unentschieden“ and „Letztes Spiel“ since #801.
- P2: `setup.info.loserAdv.warn` says „Das Rad kann hier nicht verdeckt werden …“ where the option is named „Pseudo-Games“ (2.a, decided by nobody); `setup.info.wheel.hostSees` and `stepper.summary.hidden` keep „verdeckt“ by #796's comment (2.b, 2.c).
- S3: `auth.intro` „Compies verarbeitet nur das Notwendigste an Daten.“ is a privacy promise the Datenschutzerklärung does not make in these words.
- S1: the help line `slotsHelp` carries a wink („Das wird ja wohl für alle reichen. Bestimmt.“), which § Copy allows in empty states, errors, placeholders and Construction pages only, and lost „die Zeit gilt für alle (Europe/Berlin)“.
- S2: `heroTitle` „Schwitzen, aber unter Freund:innen“ uses the colon form where „Leute“ fits, as the same Release writes elsewhere.
- S4: a link that is no YouTube link says so twice, under the field (`gameEdit.badLink`) and in the preview box (`gameEdit.noPreview`, „Link ungültig.“).
- S5: the stepper's step is „Spieleanzahl“, the same count is „Anzahl Spiele“ in three other places.
- S6, S10: „Jeder gegen jeden (FFA)“; a missing comma in `hideWheelHelp`; „zw.“ and „max. … s“ in form messages; a full stop in the heading „Läuft aktuell.“; „Das Archiv kommt bald.“ as a time promise.
- S14: the changelog has no line for the vote count's colours (#798) or the countdown's removed pill (#802).
- P3: `NoteBlock`'s title „Notizen“ is still 13 px (the open question of #804, not answered).
- #797: `gameEdit.linkBroken` shows only after the link field was left or a save was tried (the merge comment on #797).

## Follow-up, not this Release

- S7: the Vote Note's audience lines („sehen alle“) were removed as the sweep asked; § Secrecy asks for the user's approval of a text that says who sees what. The removal is the operator's own wording decision; named here so that it is seen.
- S9: `RETIRED` in `scripts/wording/retired-words.mjs` holds „Termin festlegen“ only; „Rad verdecken“, „Unentschieden beenden“ and „Letztes Spiel hinzufügen“ are not guarded. They can join once P1 and P2 are decided, since `de.json` still holds them.
- Q6: `SlotEditSheet` holds two attempt flags and `DateTimeField` an `attempted` prop for that one caller; two small forms that each call `provideFormAttempt` would remove both.
- Q7: `TextField` counts a value the form moves as touched, so „Preis entfernen“ and then a source shows the amount's message at once. Accepted with #797 (Länge follows Ende); a narrower rule is a ticket of its own.
- S11: Home's Baustelle zone takes its title from `mvp.zone.chip` and its text from `mvp.zone.homeTitle`: the key names mislead.
- S13: the `wording_…json` name pattern twice in `scripts/wording/`, the `COPY` line six times in `scripts/browser/`.
- P4: `GameCard` gives the price line a `title` tooltip nobody asked for; harmless, stays.
- Q8, the rest: `GameBoard` re-checks `phase === 'running'` in its template; `EventStepper.reasonShown` has a default nobody uses; `scriptFromLoad` duplicates `keepToastsFromLoad`; `tabKeyAction`'s `inField` is always false at its call site; the walk's baseline uses `except: null` where the review's uses the target's name; the offline-page test does not compare its head SVG with the asset; `AppButton`'s brand variants are not derived from `SignInProvider`.

## Still owed

- #825 merged, with CI green on its merge commit.
- #812 (the operator's sweep of the new texts, with the questions above) and #813 (the browser check): local.
- Release 0.16's own review; a fix it lands in a file this Release touches gets a second look when 0.16's branch is merged into `spec/790-wortwahl`.

## Standards review

Diff: `git diff fe7789e7...origin/spec/790-wortwahl`. Sources read from the tip: `CODING_STANDARDS.md` (whole), `GLOSSARY.md`, the ADRs the changed files touch (0003, 0010, 0011, 0015, 0017, 0019), `CLAUDE.md` § Personal data and § Scripting, `docs/agents/release.md`, and `.claude/skills/code-review/SKILL.md` § 3 (smell baseline). Line numbers are on the tip. Hard violations: none found. Everything below is a judgement call (rule words quoted) unless it says otherwise; the order is by weight.

### S1. A wink in a help line, outside the places the rule allows

**severity** should fix
**where** `i18n/locales/de.json:1440` (key `slotsHelp` of the Event creation form, the `create` object at line 1432)
**what** `"slotsHelp": "Abgestimmt wird mit Ja, Meh oder Nein. Bis zu 16 Vorschläge. Das wird ja wohl für alle reichen. Bestimmt."` (was `… Bis zu 16 Vorschläge, die Zeit gilt für alle (Europe/Berlin).`)
**why** CODING_STANDARDS § Copy: „A wink is welcome in empty states, errors, placeholders and Construction pages (the wording sweep of 2026-11-16).“ A help line under a field is none of the four. The same edit drops „die Zeit gilt für alle (Europe/Berlin)“, the one place that says whose clock the Slot times are in (ADR 0003, „Europe/Berlin on screen“); that is a fact the screen does not show elsewhere, so the rule „says only what the screen does not already show“ does not justify the cut.
**fix** Keep the wink out of the help line: `Abgestimmt wird mit Ja, Meh oder Nein. Bis zu 16 Vorschläge, die Zeit gilt für alle (Europe/Berlin).` (the old text), or move the joke to a placeholder or empty state.

### S2. Colon form where a neutral word fits

**severity** should fix
**where** `i18n/locales/de.json:769` (`heroTitle`)
**what** `"heroTitle": "Schwitzen, aber unter Freund:innen"`
**why** CODING_STANDARDS § Copy: „Words for people are gender-neutral: a participle („Spielende“, „Teilnehmende“) or a neutral word („Leute“, „alle“), and the colon form („Freund:innen“) only where neither fits.“ The same Release writes „deine Leute“ for „deine Freunde“ in `stepper.sessions.doneText`, `doneDirectTextPlural` and `doneDirectText` (lines 1442, 1443, 1458), so a neutral word does fit. The new test `test/unit/copy.test.ts` (`MASCULINE_PEOPLE`) only catches `Spieler|Spielern|Freunde|Freunden`, so it does not see this either way.
**fix** „Schwitzen, aber unter Leuten, die man mag“ or „… unter deinen Leuten“, or `Schwitzen, aber nur mit Freund:innen` only if the user wants the colon form here and says so.

### S3. A claim about data processing in the sign-in card

**severity** should fix
**where** `i18n/locales/de.json:764` (`auth.intro`), shown by `app/components/SignInCard.vue` under the buttons
**what** `"intro": "Compies verarbeitet nur das Notwendigste an Daten."` (replaces „Einfach nur mit dem Konto, mit dem du eh schon zockst, und das war’s.“)
**why** CODING_STANDARDS § Copy: „Copy promises only what the app does today.“ and § Secrecy: a text that says who sees what is „checked against every section of the Datenschutzerklärung … the user approves the new text“. „Nur das Notwendigste“ is a privacy promise the Datenschutzerklärung does not make in these words (it lists IP address and User-Agent per login, profile picture, Votes, Notes, activity feed, the WebSocket connection). The new text is also a statement the user has not approved as a privacy text.
**fix** Put the line to the user as a privacy statement (approve or replace). A plain alternative that promises nothing: restore the sign-in explanation, e.g. „Melde dich mit Discord oder Twitch an.“

### S4. The same problem said twice on one screen (broken link)

**severity** should fix
**where** `i18n/locales/de.json:1059` (`gameEdit.badLink`) and `:1023` (`gameEdit.noPreview`); `app/components/GameForm.vue:86-87` and `:413`
**what** A link that is no YouTube link shows `"badLink": "Der Link funktioniert so nicht."` under the field and, in the preview box, `"noPreview": "Link ungültig."` (`hasLink ? t('gameEdit.noPreview') : t('gameEdit.noClip')`). After a save attempt the button reason `gameEdit.linkRequired` (line 136) is a third line.
**why** CODING_STANDARDS § Copy: „A text says only what the screen does not already show: … no help line that restates its field …“. #804 shortened both texts but left both on screen.
**fix** Let the preview box say nothing about the link when `linkError` is set (show the blank placeholder or `noClip`), so the field's message is the only one.

### S5. `Spieleanzahl` against `Anzahl Spiele`: one name per thing

**severity** should fix
**where** `i18n/locales/de.json:1587` (`stepper.games.label` area: `"games": { "label": "Spieleanzahl", … }`) against `:83` (`dock … gameCount: "Anzahl Spiele"`), `:627` (`activity.gameCount`), `:1623` (`"label": "Anzahl Spiele"`)
**what** The stepper's step label becomes „Spieleanzahl“ while the same Game count is „Anzahl Spiele“ in the dock, the Activity feed and the step's own field label.
**why** The Release's changelog line (#809) says „Eine Sache hat jetzt überall denselben Namen“. GLOSSARY § Game count: _Avoid_: „Games per Session, number of games“ (the term has no fixed UI word, so this is a judgement call).
**fix** „Anzahl Spiele“ (the three other places keep it).

### S6. `Jeder gegen jeden` is a generic masculine

**severity** note
**where** `i18n/locales/de.json:362` and `:1605` (both changed to `Jeder gegen jeden (FFA)`)
**what** `"title": "Jeder gegen jeden (FFA)"`, `"name": "Jeder gegen jeden (FFA)"`.
**why** § Copy: „Words for people are gender-neutral … a neutral word („Leute“, „alle“)“. The diff touched exactly these strings (it added „(FFA)“) and replaced „Spieler“ and „Freunde“ elsewhere. GLOSSARY § Format gives no UI word for free-for-all, so „Alle gegen alle“ is open.
**fix** „Alle gegen alle (FFA)“ in both places, or keep and note that the format name is an idiom.

### S7. The Vote's Note lost its audience line at the point of writing

**severity** note
**where** `app/components/NoteEditor.vue` (removed `mvp.notes.audience`, `mvp.notes.savedLabel`: „sehen alle“, „Deine Anmerkung · sehen alle“)
**what** The two lines that told the writer that every Member reads the Note are gone; no other text on the poll says it (the Datenschutzerklärung does, section 11).
**why** § Copy: „no line that tells a Host what everyone will see anyway“ covers the Host; a Member's Note is the one free text that every other Member reads (GLOSSARY § Note: „every Member can read it“). § Secrecy: who sees what is a privacy text and „the user approves the new text“.
**fix** Put the removal to the user as an explicit choice, or keep one short line („Sehen alle“) at the field.

### S8. Stale UI words in comments the diff left or half-updated

**severity** note
**where** `app/components/EventPoll.vue:11` (`("Termin festlegen")`, two lines above the edited „Wann Zockung?“), `app/composables/useHostActions.ts:14` (`„Unentschieden beenden“ … „Letztes Spiel hinzufügen“`, two lines below the edited „Termin fixieren“), `app/components/ToggleSwitch.vue:2` and `app/components/stepper/StepMode.vue:9,12,41` and `app/utils/event-draft.ts:24,41,43` (`„Rad verdecken“`), `app/components/EventPage.vue:79`, `app/components/EventStage.vue:51`, `app/utils/event-page.ts:71` (`"Termin festlegen"`), `app/utils/host-dock.ts:14`, `app/utils/event-stage.ts:86`, `app/utils/api-error.ts:120`.
**what** The UI texts are now „Termin fixieren“, „Unentschieden“, „Letztes Spiel“, „Pseudo-Games“; these comments still name the old buttons and options. This diff makes them wrong.
**why** The retired-word guard only reads `de.json` and the Unreleased lines (`test/unit/copy.test.ts`), so nothing catches comments (CODING_STANDARDS § Copy: „UI copy uses the glossary's UI word“ applies to copy; comments are a judgement call).
**fix** One sweep over the names above. Cheap and in the Release's own subject.

### S9. The retired-word guard is narrower than its test's title

**severity** note
**where** `scripts/wording/retired-words.mjs:12`, `test/unit/copy.test.ts:191-194`
**what** The new test is titled „#809: the Host fixes a Date („Termin fixieren“, GLOSSARY.md § Date); „festlegen“ for the same act is retired too.“ but `RETIRED` holds only `'Termin festlegen'`, and the test only asserts that map entry. „Direkt festlegen“, „Festlegen“, „Termine festgelegt“ (the strings #799 had to fix by hand) would pass `copy.test.ts` if they came back. „Rad verdecken“, „Unentschieden beenden“ and „Letztes Spiel hinzufügen“ (renamed in the same Release) are not guarded at all.
**why** § Copy: „When the glossary retires a word, it goes into `RETIRED` … (`test/unit/copy.test.ts` and the wording review read it).“ A word is retired „when a text includes it“, so the entry has to be the stem.
**fix** Add `'Direkt festlegen'`, `'Termine festgelegt'`, `'Rad verdecken'` (and `'Unentschieden beenden'`) with their successors, or word the test's comment to what it checks.

### S10. Copy details in the changed texts

**severity** note
**where / what**
- `i18n/locales/de.json:326` `"hideWheelHelp": "Erfundene Namen bis das Rad stoppt."`: the comma before the subordinate clause fell out („Erfundene Namen, bis das Rad stoppt.“, the test fixture `test/nuxt/toggle-switch.test.ts:7` still has it).
- `:1020` `"lengthInvalid": "Nur zw. 10 und 120 Sekunden möglich."` and `:1019` `"lengthMax": "max. {max} s"`: abbreviations in a form message, where the other messages of the form spell out „Höchstens {max} Zeichen“ (`:1035`, `:1036`).
- `:1754` `"rounds.title": "Läuft aktuell."`: a heading with a full stop; the neighbours („Offene Spiele“) have none.
- `:1506` `"Das Archiv kommt bald. Bestimmt."`: a Construction page may wink, but „kommt bald“ is a time promise (§ Copy: „Copy promises only what the app does today“); the old „wird noch gemauert“ promised nothing.
- `:742` `"Du siehst den letzten Stand (den du kennst lol)."`: allowed as an error wink; named only because the same sentence is the one a User reads when the connection is lost.
**fix** The comma, spell out „Nur zwischen 10 und 120 Sekunden“ / „Höchstens {max} Sekunden“, drop the full stop, „Das Archiv kommt irgendwann. Bestimmt.“ if a wink is wanted.

### S11. `BaustelleZone` on Home is fed from keys whose names say something else (Mysterious Name)

**severity** note
**where** `app/pages/index.vue:96-97`
**what** `:title="t('mvp.zone.chip')"` and `:text="t('mvp.zone.homeTitle')"`: the `chip` key is now the title, `homeTitle` is now the text, `homeText` was deleted.
**why** Smell baseline „Mysterious Name“: the next reader looking for the Home zone's title finds `homeTitle` holding the body. No repository rule overrides it.
**fix** Rename the keys to `mvp.zone.homeTitle` (the „Kommt in einer der nächsten Versionen“ line) and `mvp.zone.homeText` (the „Der Rest ist noch Rohbau.“ line), or move the pair to one `home` object.

### S12. The „show a message once touched“ pair is copied into three components, and its home is not in the table

**severity** note
**where** `app/components/TextField.vue:43-47`, `app/components/DateTimeField.vue:48-49`, `app/components/FieldGroupMember.vue:9-11`; `app/composables/useTouched.ts:11` (returns `touched`, nobody reads it); `app/components/stepper/EventStepper.vue:33` (`reasonShown: true` default, one consumer, which always passes it)
**what** Each of the three components repeats `const { shown, touch } = useTouched(…)` plus `const message = computed(() => (shown.value ? props.error : undefined))`, and the error line's markup (CircleAlert + text) now exists in TextField, DateTimeField and FieldGroup.
**why** Smell baseline „Duplicated Code“ (and, for `touched` and the default, „Speculative Generality“). CODING_STANDARDS § One home per concern: „Each concern below has one home“; #797 created a new home (when a form message shows, how a group shares its line: `useTouched`, `useFormAttempt`, `useFieldGroup`, `FieldGroup`) but § One home per concern has no row for it, so the next field will not know to use it. The same holds for the brand fills (#792: `BrandIcon`, `--cp-discord`/`--cp-twitch`, `AppButton` variants), the Has voted colour (`voteCountTone`, #798) and the wording harness's new modules (`scripts/wording/baseline.mjs`, `review-keys.mjs`, `walk-report.mjs`), which the row „The wording harness“ does not list.
**fix** A row for „When a form message shows; a group's one line“ → `useTouched`/`useFormAttempt`/`FieldGroup` (#797), and the other three additions to their rows. Optional: `useShownMessage(() => props.error)` in `useTouched.ts`; drop `touched` from the return.

### S13. Small duplicates in the scripts

**severity** note
**where** `scripts/wording/baseline.mjs:11` and `scripts/wording/answers.mjs:19` (`const NAME = /^wording_\d{4}-\d{2}-\d{2}\.json$/`, and again with a capture in `baseline.mjs:28`); `scripts/browser/walk-states-notes.mjs:16` and `walk-states-tour.mjs:18` (`const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))`, now six copies of that exact line in `scripts/browser/`)
**why** Smell baseline „Duplicated Code“; § One home: the wording harness row names `answers.mjs` as the home of the answers file.
**fix** Export `NAME` (or an `isAnswersFileName`) from `answers.mjs`; the `COPY` line is a candidate for `kit.mjs` or `walk-kit.mjs` (its header already says texts „always come from the caller's `COPY`“).

### S14. Changelog: two visible changes have no line

**severity** note
**where** `CHANGELOG.md` `## [Unreleased]` / `### Geändert`
**what** Lines exist for #792, #794, #795, #797, #805, #806, #808, #809. Not named anywhere: the Date poll's vote count in green, yellow or red (#798, `voteCountTone`), the countdown's removed pill (#802), the removed kickers on the library and Event pages (#793, #798, #804), the sign-in card's reordered text. „Kürzere Texte, ein Name pro Sache“ covers the words, not these.
**why** `docs/agents/release.md` § Changelog lines: „A PR with a change Users can see adds its lines“; „plain German for Users“.
**fix** One line each for the vote count's colours and the countdown, or fold them into #809's line by name.

### Checked and sound (Standards)

- **One home per concern (table):** dates through `formatMonthYear` in `app/utils/berlin-time.ts` (no own `Intl` in components); Has voted colour in `app/utils/vote-look.ts`; no new `changeEvent`, `drawGameKnown`, `shownName`, `characterCount` or `apiErrorKey` bypass; the new `t('error.…')` uses are existing keys in `StepName.vue`.
- **Form messages (§ Copy): red and after touch:** TextField, DateTimeField, FieldGroupMember, GameForm's blocker, the stepper's reason, SlotEditSheet's „incomplete“ (now `text-error-fg`), ProfileCard and einrichten.vue (`error` instead of `invalid` plus help) all gate on touch or a tried submit; groups (clip start/end/length, players from/to, price amount/source, date plus time inside DateTimeField) share one line.
- **UI words of the glossary:** „Termin fixieren“ everywhere in `de.json` (no „festlegen“ left for a Date; remaining hits are settings and legal text), „Slot“ for a Seat, „Pseudo-Games“ for the option, „Teilnehmende“, „Unentschieden“, „Letztes Spiel“, „Tribüne“, „Sieger“ (Party name, stays), „Session“, „Event“. No retired word of `RETIRED` in `de.json` or the new Unreleased lines.
- **Gender-neutral words, rest of `de.json`:** „Spieler“ and „Freunde“ are gone from UI copy (compounds „Spielerzahl“ at `:782`, `:893`, `:1028` stay and pass the test; they are unchanged lines); legal texts keep their wording.
- **Text repeats the screen:** the removed kickers, pills, help lines, `confirmSeeAll`, `votesKept`, `renewShare`, `stepper.name.help` and the countdown pill follow the rule; checked against the components that rendered them.
- **Motion:** no animation, transition or token added or changed; `public/offline.html` adds a hover translate with no transition and no GSAP.
- **Database, Secrecy, ADRs:** no server, schema or room change except `server/utils/library.ts` (one line); ADR 0003, 0010 (own date fields kept), 0011, 0015, 0017 (in-house Tour: only walk states), 0019 not touched in substance.
- **Tests (§ Tests):** only sampled (`game-board`, `home-event-card`, `copy`, `offline-page`); no whole-object `toEqual` on a read section in the added test lines; not read in full.
- **CLAUDE.md § Personal data:** the diff adds no real name, e-mail, id, Vote or Note text; test and walk data are invented (`example.invalid`, Dev accounts); no new third-party host (`privacy-hosts.test.ts` unaffected; `BrandIcon` paths are inline, no request).
- **CLAUDE.md § Scripting:** new scripts are `.mjs` files run with node; no heredoc or inline `node -e` in the diff.
- **Smells with nothing to report:** Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Message Chains, Middle Man, Refused Bequest.
- **`public/offline.html`:** copy unchanged and still the `connectionG` text; the inlined Compibert head is a documented static copy (the file's comment says so; `test/unit/offline-page.test.ts` pins the CSS numbers against `FullScreenState.vue`, not the SVG paths).

## Spec review

Axis: does `fe7789e7...origin/spec/790-wortwahl` (tip `48b6d243`) build what #790 and #791 to #811 asked for?
Method: every ticket body and comment read; 83 replacement texts of the tickets compared by script with `i18n/locales/de.json` on the tip (0 differences); the 38 removed keys and the 3 added ones checked against `app/`, `server/`, `shared/`, `scripts/`, `test/`, `public/` (no live reference left); the `de.json` diff by key (102 changed keys, every one named by a ticket, by a recorded decision, or by the spec's „terms carried“; no `legal.*` key changed); the component diffs read ticket by ticket.

No finding is „must fix before the Release“.

### P1: two sentences still name the Tie buttons by their old labels

**severity** should fix

**where** `i18n/locales/de.json:1629` (`stepper.games.tie`), `i18n/locales/de.json:93` (`dock.lastGameBlocked.game_count_range`)

**what**
- `stepper.games.tie`: „Das Event kann unentschieden enden. Dann entscheidest du: Unentschieden beenden oder ein letztes Spiel hinzufügen.“
- `dock.lastGameBlocked.game_count_range`: „Mehr Spiele gehen nicht. Du kannst das Event noch als Unentschieden beenden.“

**why** #801: „`dock.finishTie` → „Unentschieden“; `dock.lastGame` → „Letztes Spiel““, from the spec's group „One thing, two words“ (Tie: UI „Unentschieden“, „Letztes Spiel“) and „The decided terms reach the texts around the ones the operator touched, so each thing has one name.“ Both sentences send the Host to „Unentschieden beenden“ and „ein letztes Spiel hinzufügen“, which no button says any more. The orchestrator knows both (Release PR notes, „Review notes not fixed“: „the sweep answered both“); the sweep answered them „passt“ against the old buttons, and the buttons have changed since, so the answer does not carry over.

**fix** Name the buttons as they read now: „… Dann entscheidest du: „Unentschieden“ oder „Letztes Spiel“.“ and „Du kannst das Event noch mit „Unentschieden“ beenden.“ Update the quote in `test/nuxt/event-stepper.test.ts`. (Four code comments still quote the old labels too: `useHostActions.ts`, `host-dock.ts`, `api-error.ts`, `event-stage.ts`.)

### P2: the Hidden wheel option is still called „verdeckt“ where it is the option that is named

**severity** should fix for 2.a, note for 2.b and 2.c

**where**
- 2.a `i18n/locales/de.json:409` (`setup.info.loserAdv.warn`)
- 2.b `i18n/locales/de.json:384` (`setup.info.wheel.hostSees`)
- 2.c `i18n/locales/de.json:1669` (`stepper.summary.hidden`)

**what**
- 2.a „Das Rad kann hier nicht verdeckt werden, sonst wüsste niemand, was er bannt.“ This is the Loser's Advantage info: it says the option is not available in this mode.
- 2.b „Du als Host siehst die Spiele auf dem verdeckten Rad trotzdem, auch wenn du mitspielst.“ It stands in the info section whose heading is now „Pseudo-Games“ (`setup.info.sections.hideWheel`), as the second part of that section (`app/utils/info-sections.ts:28`).
- 2.c „{mode} (verdeckt)“ in the setup summary.

**why** Spec, Implementation Decisions: „„Pseudo-Games“ wherever the Hidden wheel option is named; „verdeckt“ stays for the wheel's state on the Event page.“ And story 17: „… everywhere the option is named (the switch, the info section, the lock note in the settings, the line under the pool switch), and the wheel itself still „verdeckt“ on the Event page.“ 2.a names the option's act, in the Host's setup, not a state on the Event page; 2.b sits inside the section that carries the new name. #796's comment keeps 2.b and 2.c („stay, since the spec keeps „verdeckt“ for the wheel's state“); that reading holds for 2.c only if the summary is shown where the wheel is seen, and it covers 2.a not at all, since 2.a was not on the ticket's list and nobody decided it.

**fix** 2.a: „Hier gibt es keine Pseudo-Games, sonst wüsste niemand, was er bannt.“ 2.b and 2.c: the operator's call; if it is „Pseudo-Games“, 2.b reads „… auf dem Rad mit Pseudo-Games …“ and 2.c „{mode} (Pseudo-Games)“.

### P3: „Notizen“ on a game is still 13 px in the notes block

**severity** note (partial, already an open question for the operator)

**where** `app/components/NoteBlock.vue:49` (`class="m-0 font-sans text-[13px] leading-tight font-extrabold text-balance"`, text `library.notes`)

**what** #804 and story 64 asked for „Notizen“ on a game in a readable size; the title of the block that shows a game's Notes in the game dialog and the Event's notes popover is unchanged at 13 px. #804 built nothing for `library.notes` and #803 nothing for `howWePlay.notes` (15 px since 0.16, `GameNotesDisclosure.vue:50`).

**why** #804: „`library.notes` („Notizen“): a readable size.“ Spec story 64: „As a Host, I want „Notizen“ on a game in a readable size“. The merge comment of #804 records the reading (the 26 px heading on the library page and the 22 px heading in the popover meet it; the block's 13 px title is 0.16's hand-off design) and puts the question to the operator, who has not answered. So this is not a departure to fix, only an acceptance line that stands unmet until he answers.

**fix** The operator's answer: grow the title to the size of the card's other labels (15 px like `GameNotesDisclosure`), or close the line as „leave“ on #804.

### P4: a title attribute on the price line nobody asked for

**severity** note

**where** `app/components/GameCard.vue:178` (`:title="priceText"`, with `data-price` on line 177, which the test at `test/nuxt/game-card.test.ts:544` reads)

**what** #804 asked: „`price.line` wraps to at most two lines before it is cut with „…“; every game card stays the same size.“ The diff adds the `line-clamp-2 min-h-[2lh]` classes it asked for and, besides, a native tooltip with the whole price line on every card, row and picker line.

**why** Behaviour no ticket or spec line asks for. A `title` is not announced reliably and does nothing on a phone, where the cut matters most; the brief's reading was that the full line must stay reachable, but no acceptance line says so.

**fix** Drop the `title`, or keep it and say so in the merge comment; no other change.

### Checked and sound (Spec)

- **#791** (sign-in, onboarding): five texts and two removals as listed; `auth.intro` stands under the two buttons (story 2) and on the invite landing; `auth.linkLater`, `onboarding.kicker` and their elements gone.
- **#792** (brand buttons): `BrandIcon.vue` inline marks, tokens `--cp-discord`/`--cp-twitch` with white text, two `AppButton` variants, no new host; changelog line present. The 3.7:1 / 3.8:1 reduced-motion hover in Dunkel is recorded and open (below 4.5:1 is what the ticket's „at least 4.5:1 in both“ forbids; the operator has been asked).
- **#793** (Home): texts, `mvp.zone.homeText` removed, chip off the Baustelle card only (the Construction pages keep theirs), „Termin“ off a running Event's card only. Story 10 (vote count's alignment) not built: decided by the operator on #793 („Ignore it then“).
- **#794** (head): `EmptyState` and `FullScreenState` draw `variant="head"`; the five bust places (`anmelden`, `neuigkeiten`, `WhatsNewDialog`, `neu.vue`, `LuckyWheelMascot`) untouched; no rig loaded; moods deferred to #819 as the ticket allows; the changelog line does not name the figure.
- **#795** (sparkles): no `Sparkles` anywhere in `app/`; Home's Best slot uses the calendar icon; changelog line present.
- **#796** (Host setup): every listed text equals the ticket; `stepper.name.help` gone with its line; the eight pool hints and `poolWarning.text` lost „Blockiert nichts …“ (operator's addition on #796); both „Last“ hints say „Gleichstand“; no „Tiebreaker“; no „Spieler“/„Freunde“ left outside `legal.*`; every „festlegen“ left is a decided one (`mvp.slots.locked`, `*.emptyHost/emptyMember`, „Du legst fest …“, the Datenschutzerklärung).
- **#797** (form messages): `useTouched`, `useFormAttempt`, `FieldGroup`, `FieldGroupMember`, `TextField`, `DateTimeField`, `PriceField`, `GameForm`, `SlotEditSheet`, the wizard and `StepName`, `ProfileCard`, `einrichten.vue` read against the three choices of the operator's comment (touched = edited or left; the wizard may show a sentence twice; the clip hints give way to the group's line: `GameForm.vue` passes `clipError` to `help`); groups: players, clip, price. Messages red; `TextField` lost `invalid`; the two save buttons lost `aria-describedby="display-name-help"`; one changelog line. Team word and Note messages arise from typing only.
- **#798** (Event head, poll): single-Session kickers gone, multi-Session kickers kept (the ticket lists only the three `…Single`/`finished` keys); the vote count is coloured through `voteCountTone` in the poll title row and the undated Sessions row (the orchestrator's recorded reading), not on Home; „Wer kann wann?“ is an `h2` with the look of „Terminumfrage“; `mvp.notes.audience` and `savedLabel` gone with their elements.
- **#799** (fixieren): five keys and three removals as listed, dialog list and reschedule paragraph gone; `RETIRED` has „Termin festlegen“.
- **#800** (board): all keys equal the ticket; `board.meta.running` is „gesperrt“ in `text-error-fg` after the teams text (`GameBoard.vue:277`); `board.meta.poll`, `board.standsSub`, `team.word.help` gone with their lines; Team word message only on `stripped`.
- **#801** (dock, invite): „H“ badge removed from `HostDock.vue`, the shortcut untouched; invite pill and `renewShare` line gone; tab title of a signed-in visitor on the invite page now „Compies“ alone (recorded reading, a consequence of removing the key).
- **#802** (running Session): pills gone; the Countdown keeps four meta lines (`set`, a Member's `ready`, `doneHost`, `done`) although story 47 says „without its meta lines“ and the acceptance line says „no meta line in each of its states“. The ticket's key list names only three, and the merge comment records the reading, so I take it as decided, but it is the orchestrator's reading, not the operator's. The Tie lines of the ceremony keep „{k} Sieger, je {n} Punkte“ and „Beide gleichauf …“ without the Event name (recorded). `clip.live` aligned with `items-baseline` (a measure for #813).
- **#803** (Host Round controls): `result.kickerCorrection` gone (the line is hidden for a correction), „gleichauf“ has a solid border and no icon, the en dash is in, the three `howWePlay` texts say „Die Teilnehmenden“; `howWePlay.notes` unchanged (recorded, see P3).
- **#804** (game form, library): all keys equal the ticket; kickers, clip note, free-to-play hint, `priceAmountHelp` and `library.kicker` gone with their lines; placeholder „z. B. 19,99“; excerpt, „Kein Clip.“ and „Link ungültig.“ no longer mono; price range message under both price inputs; only cards wrap the price line (recorded).
- **#805** (Zuletzt aktualisiert): `GameView.updatedAt` replaces the unread `createdAt`; `library.updatedAt` on the game page; integration test backdates a row and shows that a Tags-only save moves the time; no migration; changelog line says „wann es zuletzt geändert wurde“ (recorded).
- **#806** (Noch eins): the action sits on the new-game toast `library.saved` and opens `/bibliothek/neu`, not on `library.saveDone` as the ticket says. That is right: „Speichern und noch eins“ exists only on the new-game form (`GameForm.vue:438`, `v-if="saveAndNext && !game"`) and the ticket's second criterion needs the edit toast to have none; recorded on the ticket.
- **#807** (four small cuts): three keys gone with their elements, `settings.appearanceHelp` shortened; Event settings pass `kicker: null` so no „Schritt n von m“ stands where the kicker was (recorded).
- **#808** (offline page): one file, texts word for word, no external reference, measures read from `FullScreenState.vue` by a test; heading weight 800 with `font-synthesis: none` (recorded). The head's dark outlines on the Dunkel paper are a browser item for #813.
- **#809** (guards, changelog): `RETIRED` entry, gender guard with planted-text case, wording line and all seven own lines of the spec present in `CHANGELOG.md` (Discord/Twitch, head, sparkles, form messages, Zuletzt aktualisiert, Noch eins, offline page); no text ticket wrote a changelog line.
- **#810** (walk): merged baseline (`baseline.mjs`, `mergeAnswers`), Tour states at 390 and 1440, Profil row with toast, placeholders state, report of texts without a picture, 0.16's states in `walk-states-notes.mjs`; the ticket's premise about dev sign-ins was wrong and the replacement (only the Rundgang states sign in unseen, plus a guard) is recorded on the ticket. Whether the walk paints everything is for #812's local walk.
- **#811** (Tab): `tabKeyAction` pinned by a unit test, label shows „Tab oder Alt+C“; the page has no key list, so the label carries it (recorded).
- **Spec outside the tickets:** `CODING_STANDARDS.md` § Copy and `GLOSSARY.md` carry the rules from PR #814; Datenschutzerklärung untouched; no migration; the three Idea issues exist (#815 to #817, #819 for the head's moods).
- **Not built, by decision:** #812 and #813 (local); story 10 (see #793); the Tour's texts (#652) arrive with the `staging` merge in the base, so story 71 needs no code in this diff.
- **Unasked behaviour that is a recorded consequence, not a finding:** `InviteEntry` tab title; `kicker: null` on the Event settings; `board.meta.poll` showing nothing (the ticket removes it).

## Quality and architecture review

Tip `48b6d243`, diff `fe7789e7...origin/spec/790-wortwahl`. Method: the repository's thermo-nuclear code-quality review plus the deepening lens of `improve-codebase-architecture` (vocabulary of `codebase-design`: module, interface, depth, seam, deletion test). Nothing was measured in a browser. No file of this diff crossed 1000 lines (largest source files: `DateTimeField.vue` 504, `dark-states-event.mjs` 791, `walk.mjs` 466).

### Q1: The red message line of a field is not announced; the announced path of `invalid` was removed

- **severity:** should fix
- **where:** `app/components/TextField.vue:113-123`, `app/components/FieldGroup.vue:14-24`, `app/components/DateTimeField.vue:493-503`
- **what:** the three lines that now carry a field's problem are plain `<span v-if="message" :id=... class="... text-error-fg">` with no `aria-live` and no `role`. Before this Release `TextField` had `invalid`, whose help text carried `:aria-live="invalid ? 'polite' : undefined"` (the profile setup and `ProfileCard` used it: `:invalid="missing"`). The Release deleted that prop and its test (`test/nuxt/form-fields.test.ts`, „marks the field invalid with the help text as the reason, announced“: `expect(help.attributes('aria-live')).toBe('polite')`). `einrichten.vue` and `ProfileCard.vue` now pass `:error`, and nothing announces the message when it appears after a blur or an input.
- **why:** TextField's own header comment (before the diff): „`invalid` turns the help text into the reason for an invalid field (announced)“. The message now appears at an arbitrary moment (touch), which is exactly when a screen reader user needs the announcement. The announced behaviour was dropped without a replacement, and no test asks for it any more.
- **fix:** one `FieldError` component (see Q3) with `role="alert"` (or a persistent polite live region wrapping the `v-if` span) used by TextField, FieldGroup and DateTimeField; restore the assertion in `form-fields.test.ts` for it.

### Q2: The walk report prints „The eleven mono uses“ while the table now holds ten

- **where:** `scripts/wording/walk-report.mjs:116`
- **what:** `` `The mono font is ... The eleven mono uses:` ``. `scripts/wording/walk.mjs:59` was changed in this diff to „The ten uses of `font-mono` in app/“ and `MONO_USES` has ten rows (HostDock and GameForm dropped, RichNotesToolbar added). The report is printed, written to `results.log` and `report.md` on every walk.
- **why:** a hard-coded count in a second file that the Release updated in one place only; `test/unit/wording-walk-mono.test.ts` counts the rows of `walk.mjs` against `font-mono` lines but never reads the report's sentence.
- **severity:** should fix
- **fix:** `` `... The ${input.monoUses.length} mono uses:` `` (the list is already in `input.monoUses`).

### Q3: The same message wiring is written three times, and the abstraction around it is shallow

- **severity:** should fix
- **where:** `app/components/TextField.vue:43-50`, `app/components/DateTimeField.vue:48-49`, `app/components/FieldGroupMember.vue:9-11`; error-line markup in `TextField.vue:113-123`, `FieldGroup.vue:14-24`, `DateTimeField.vue:493-503`; the claim in `app/components/FieldGroup.vue:5-6`
- **what:** every field repeats `const { shown, touch } = useTouched(…)` then `const message = computed(() => (shown.value ? props.error : undefined))` (TextField, DateTimeField, FieldGroupMember), TextField and FieldGroupMember then add `useGroupMember(() => message.value)` and a describedby expression. The icon-plus-bold-red line (`CircleAlert` + `text-small font-bold text-error-fg`) is pasted three times. `FieldGroupMember` is a renderless component that exists only so that `useGroupMember` is called below the `FieldGroup`; its three slot props (`invalid`, `described-by`, `touch`) are the whole interface, nearly as wide as its body, so it fails the deletion test (deleting it only moves the three lines into `PriceField`'s select). `FieldGroup.vue` also says „The members (TextField, DateTimeField, the Price source) register“; `DateTimeField` never calls `useGroupMember` (grep: only `TextField` and `FieldGroupMember` do), so it can not sit in a group.
- **why:** skill rules „Copy-pasted logic instead of extracted helpers“ and „Thin wrappers … that add indirection“. #797's whole point is that every field behaves the same; today that sameness is kept by copy.
- **fix:** one deep module `useFieldMessage(error: () => string | undefined, { attempted? })` returning `{ message, touch, invalid, describedBy(extraIds) }`, folding `useTouched` + `useGroupMember`; one `FieldError` component for the line. Give `FilterSelect` the `error` prop it already half has (`invalid`) and let it call the composable, so `FieldGroupMember` is deleted. Correct the `FieldGroup` comment (or really register `DateTimeField`).

### Q4: A blocked reason is recognised by comparing translated text

- **severity:** should fix
- **where:** `app/components/GameForm.vue:170`
- **what:** `const blockerShown = computed(() => blocker.value !== null && (attempted.value || (notesBlocked.value && blocker.value === t('notesEditor.saveBlocked'))))`
- **why:** the form asks „is the notes blocker the one that won“ by `===` on the i18n string. It breaks silently if the copy of `saveBlocked` equals another blocker's text, or when #812's wording sweep rewords one of them; the `blocker` ordering (name, link, players, notes, price, clip) is then encoded twice (in `blocker` and in this guess). Skill rule: „Replace condition chains with a typed model“.
- **fix:** make `blocker` return `{ text, immediate }` (or compute `blockerKey` first and the text from it); `blockerShown = blocker !== null && (attempted || blocker.immediate)`.

### Q5: The Price reason beside the button and the group line can name two different problems

- **severity:** should fix
- **where:** `app/components/PriceField.vue:71` (`const blocker = computed<string | null>(() => sourceError.value ?? amountError.value ?? null)`) against the template order (amount `TextField` first, `FieldGroupMember` second, lines 113-148)
- **what:** with an amount that does not parse („abc“) and no source, both `amountError` (`gameEdit.priceRange`) and `sourceError` (`gameEdit.priceNeedsSource`) exist. After a try the `FieldGroup` line shows the first member in mount order: the amount's. The form's reason beside „Speichern“ is `priceError`, the `blocker` above: the source's. Two different reasons on one screen. Before #797 each field had its own line and the order did not matter; the shared „first shown, once“ rule made it visible. The clip group does not have it (`startError ?? endError ?? lengthError` matches its visual order).
- **why:** `useFieldGroup.ts` header: „Members register in mount order, which is the visual order, and the line shows the first message that is shown“. The form's blocker must follow the same order.
- **fix:** `amountError.value ?? sourceError.value ?? null`.

### Q6: `SlotEditSheet` holds two forms in one component, and the module API bends for it

- **severity:** note
- **where:** `app/components/SlotEditSheet.vue:42-55,77-103`, `app/composables/useTouched.ts:6-9` (`override`), `app/components/DateTimeField.vue:36-39,48` (`attempted` prop)
- **what:** two hand-kept flags `addTried` and `changeTried`, set in `add()` / `saveChange()` as `if (blocked) tried = true`, reset in three places (open watcher, `changingId` watcher, `done` callback), handed down through an `attempted` prop that `useTouched` takes as an `override` function. `useTouched(override)` and `DateTimeField.attempted` have exactly one caller.
- **why:** `provideFormAttempt` is the module built to be the „submit tried“ flag of a form; the sheet re-implements it twice by hand and widens two shared interfaces to do so. Deletion test: extract `SlotAddForm` and `SlotChangeRow` (each a form with its own `provideFormAttempt()`); the `override` parameter, the `attempted` prop, both `*Tried` refs and two watchers vanish.
- **fix:** as above; then `useTouched` takes no argument and `DateTimeField` loses a prop.

### Q7: `TextField` touches on any programmatic change of its value

- **severity:** note
- **where:** `app/components/TextField.vue:46` (`watch(() => props.modelValue, touch)`), with `app/components/PriceField.vue:41-43,75-78`
- **what:** the watcher exists for Länge following Ende, but it fires for every change of the model, including a parent's reset. Sequence: amount „12“, source Steam, press „Preis entfernen“ (`removePrice` sets `priceText = ''`): the amount field is now touched for good. Choosing a source again makes `amountError` (`priceSource !== '' && !priceEntered`) show red at once, before the User has typed or left the empty field. The same happens after picking Free-to-play (empties the amount) and then a paying source.
- **why:** `useTouched` header: „once the User edited the field (`input`) or left it (`blur`) … and for good“. A reset is no edit; the exception was written for one pair of clip fields (comment line 44-45) and applies to all callers.
- **fix:** opt-in prop or emit (`touchOnChange`) on the three clip fields in `GameForm.vue` instead of the global watcher, or have `editClip` call a `touch` the form owns.

### Q8: Small shape leftovers of the new modules

- **severity:** note
- **where / what:**
  - `app/components/GameBoard.vue:277`: `meta` returns the text but the template re-asks `phase === 'running'` to add „· gesperrt“; the phase union has exactly four members and the `default` of `meta` is `running`, so one model `{ text, locked }` from the `switch` would drop the template branch.
  - `app/components/stepper/EventStepper.vue:33`: `reasonShown` defaults to `true`; the only consumer (`EventSetupWizard.vue`) always passes it. The default describes a mode nobody uses, and a future second consumer silently shows the reason at once instead of after a try. Make it required, or default to `false` like the form flag.
  - `scripts/browser/walk-kit.mjs:100-117`: `keepToastsFromLoad` is now `scriptFromLoad(tab, KEEP_TOASTS)` pasted; `releaseToasts` is documented as releasing „any such script“ but keeps its toast name. One function and a neutral name.
  - `scripts/browser/dark-states-event.mjs:437`: `pair()` takes 16 options, two more this Release (`spielerWidths`, `tour`); fine today, the next flag should group them (`{ host: {widths,stops}, spieler: {…} }`).
  - `scripts/wording/review-keys.mjs` / `scripts/wording/review-page/page.mjs:427`: `tabKeyAction` has an `inField` parameter that the page always passes as `false` (the handler returns on `inField` three lines above), so its test case „leaves Tab inside a text field“ pins a branch the page never reaches; the real decision (the switch `case 'Tab'` after the guard) is untested.
  - `scripts/wording/walk.mjs:447` passes `{ except: null }` while `review-server.mjs` passes `except: basename(target)`; once today's file is committed the walk's „new“ set and the review's „neu“ filter can differ, although the report line says they are the same.
  - Retired term still in code comments next to rewritten ones: `app/components/EventPoll.vue:11`, `app/components/EventPage.vue:79`, `app/components/EventStage.vue:51`, `app/utils/event-page.ts:71`, `scripts/browser/dark-states-event.mjs:521` say „Termin festlegen“ while `useHostActions.ts` comments were changed to „Termin fixieren“ in this diff; `RETIRED` scans the copy and the Unreleased lines only (`test/unit/copy.test.ts:170`).
  - `test/unit/offline-page.test.ts` „draws the head inline, as a static copy of the asset“ checks only the viewBox and „more than 3 paths“; the six `d` values of `public/offline.html` are identical to `app/assets/compibert/compibert-head.svg` today (checked), so a test that every `d` of the page is in the asset would really pin the claim. The dark block of the page (`--paper`, `--ink` … in `@media (prefers-color-scheme: dark)`) is not compared with the dark tokens either, though the page says it follows them (#402).
  - `app/components/AppButton.vue:6,22-25`: the shared button now knows two brand names in `variant`; acceptable, but the type should be `Exclude<…>`-derived from `SignInProvider` (`shared/auth`) so a third provider cannot be added in one place only.

### Checked and sound (Quality)

- `app/composables/useFormAttempt.ts`: provide/inject with a `readonly` flag and a null-safe default is sound; no sticky state found (wizard `go()` resets it, step components are keyed per step, `GameForm` is remounted by `formRound`).
- `app/composables/useFieldGroup.ts`: registration and `onScopeDispose` in the member's own scope are correct; `shallowReactive` array reacts to push and splice.
- `app/components/stepper/EventStepper.vue` / `EventSetupWizard.vue` (`blockedPress` → `attempt`, reset on `go`): behaves; the reason is hidden once the blocker clears.
- `app/components/DateTimeField.vue` touch points (input, commit, calendar and list pick, blur): complete; no programmatic path touches it.
- `app/components/BrandIcon.vue`, brand tokens, `AppButton` brand variants, `SignInCard.vue`: tokens are light-block only and tested (`brand-colours.test.ts`); no file-size or branching issue.
- „Zuletzt aktualisiert“ (#805): `updatedAt` is `$onUpdate` and set by the archive and image routes; `formatMonthYear` is Berlin-zoned and tested; no finding.
- „Noch eins“ toast (#806): `ToastStack` already supports `action`; `navigateTo('/bibliothek/neu')` is a fresh route; test present. (The 4 s default duration of an action toast is a product question, not a code one.)
- Empty-state head (#794), `EventPageHead.vue` kicker `null`, `EventCountdown.vue` pill removal, `ceremony.ts` `sub: string | null`: removals leave no dead imports or branches that lint/knip would miss.
- `voteCountTone` (`app/utils/vote-look.ts`): total function, 0 of 0 handled, tested including contrast.
- Wording tooling: `baseline.mjs` / `mergeAnswers` (pure, non-mutating, tested), `walk-report.mjs` `withoutPicture`, `recording.mjs` `wheelPlaceholderKeys`, `walk.mjs` `pictureItems`/`serverItemsOf` split, `walk-states-notes.mjs` and `walk-states-tour.mjs` plan tests (`wording-walk-notes.test.ts`, `wording-walk-tour.test.ts` read the real tables against `shared/tour.ts` and the copy and can fail), `MONO_USES` line numbers (all match the tip).
- `test/unit/copy.test.ts` gender rule: has a planted-failure case; the `RETIRED['Termin festlegen']` test only pins a constant but the `it.each(Object.entries(RETIRED))` scan beside it does the real work.
- Tests of the form modules (`field-group.test.ts`, `form-fields.test.ts`, `price-field.test.ts`, `slot-edit-sheet.test.ts`): assert the shown/hidden states both ways; none found that cannot fail.
