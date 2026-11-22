# Review 0.19 „Bibliothek again“ (2026-11-22): diff `v0.18.1...12d88962`, tip of `spec/856-bibliothek-again`

Diff `v0.18.1...12d88962` (tip of `spec/856-bibliothek-again`), 57 commits, 115 files. Per `docs/agents/release.md` § Review, two `sonnet` subagents reviewed it: Standards and Spec.

## Standards

Diff: `git diff v0.18.1...12d88962` (tip of `origin/spec/856-bibliothek-again`), 57 commits, 115 files; the #833 retro commits (PRs #970, #971) included.
Sources: `CODING_STANDARDS.md` (One home per concern, Database, Secrecy, Motion, Tests, Copy), `GLOSSARY.md`, `docs/agents/*`, `docs/design_handoff_compies/*`, the smell baseline of `.claude/skills/code-review/SKILL.md`. Tooling-enforced rules (lint, knip, typecheck, the reduced-twins and scrollbar tests) skipped. Strings the spec prescribes word for word (de.json, Datenschutz, changelog texts) not rated.

Checked clean: `saveEventNotes` (parses both documents before writing, `EventChange.now` used, `publishTo` Host only, no new `.transaction(`), the Datenschutz section 9 and its test, the cookie helper split (`deviceCookieOptions`, one `ONE_YEAR`), CI split keeps the required check `check`, `ship-cue-sound`/`make-cue-candidates` sort change, `worktree-clean`, `context-usage`, `issue-note*`, `fails.mjs`/`standingFails` (all with tests and a knip entry), the reduced-twins test for `motion-reduce:` utilities, tag-fit edge tests (0, 1, 2 chips, widest set).

### Must fix

1. **`docs/design_handoff_compies/02-components.md:~884` deleted the `## LuckyWheel` heading.** The #711 deviation hunk replaced the blank line and `## LuckyWheel` (it was line 883 in v0.18.1) with the new `- **Deviation (0.19, #711)…` bullet, so the next line is now `**Scope:** [1.0] · **Ref:** GameWheel…` straight under GameCard. The index entry at line 75 (`[LuckyWheel](#luckywheel)`) is dead, and the LuckyWheel section reads as part of GameCard. Restore the blank line and `## LuckyWheel` after the bullet.

### Should fix

2. **`CODING_STANDARDS.md` § One home per concern is not extended for the new homes** (the file is not in the diff). The table is the review's source and the next ticket's guard. New concerns with no row: the device cookies' attributes (`ONE_YEAR`, `deviceCookieOptions` in `server/utils/device-cookie.ts`, now shared by the Appearance and Reduced motion); what Reduced motion is (`shared/motion.ts`, `useReducedMotion`/`useReducedMotionSetting`, `app/plugins/motion.ts`, the `reduced:` variant); the Round card's remembered notes state (`useRoundNotesMemory`); the Tags fit (`fitTags` in `app/utils/tag-fit.ts`, read by `useTagFit`, the one DOM reader); the duplicate-name rule (`gameNameKey`, `sameNameGame` in `shared/game.ts`); the Notes button's place on a card (`GameCard` `notes`/`eventNotes`, `GameNotesButton` is now mounted by `GameCard` alone). Without rows the next picker or list will mount its own `GameNotesButton` again (what #859 just removed from three places).
3. **`docs/design_handoff_compies/18-notizen.md:~129` is stale against #857.** It says "A finished Event stays fully locked until 0.19-2 (#857), which frees the Game notes", but #857 ships in this Release (`canEditGame` ignores `finished`, the route has `allowFinished`). Same file, the "Finished Event … game note unchanged" line is fine; the 0.19 paragraph contradicts itself. Also `02-components.md` Deviation (0.14, #621) still says "from md in the library card" while #707 moved the grid to `sm` (the 0.19 deviation for #707 is missing there; only the Scrollbar and #711/#689 entries were added).
4. **Duplicated Code, `GameNotesButton.vue` footer (sheet branch ~140-168 and popover branch ~215-244) and `GameNotesDisclosure.vue:~92-108`.** The `NuxtLink`/`button` pair with the Pencil icon and `t('library.edit')` is written twice in one file (only `text-[15px]` vs `text-[14px]` differs) and a third time in the disclosure, with the `EDIT_LINK` class string copied (`inline-flex h-11 items-center gap-1.5 rounded-pill px-2 … hover:tint focus-visible:focus-ring`; the comment even says "the link of the popover's footer"). One small component (`NotesEditFooter`, props `to`, `size`, emits `edit`) is the extraction.
5. **`GameForm.vue:~44-47` loads the whole library for the duplicate hint while still calling `useTagsInUse()`.** `useTagsInUse`'s doc (`useGameLibrary.ts`) exists "without loading the whole library" (#365); the form now loads `/api/games` (games with notes included) on every open of the form, including the Event setup sheet, and `useGameLibrary().tagsInUse` already carries the Tags in use, so there are two sources for one list. Either take `tagsInUse` from `useGameLibrary` and drop `useTagsInUse` where unused, or keep #365's intent and say why the full list is needed. (Check against the spec's decision for #689.)
6. **Possible Duplicated Code, `useReducedMotion.ts:~71-104` vs `useAppearance.ts:~50-90`.** The same save queue (show at once, one request in flight, newest choice sent after the first returns, failure puts back `saved`) is written a second time for a boolean; the header comment names the prior art ("as the Appearance's are, #657"). Judgement call: the Appearance's version also carries per-control failure routing, so a shared `useQueuedSave` may not fit; worth a line in the Release PR notes as a deliberate second copy.

### Nit

7. **Speculative Generality, `GameNotesDisclosure.vue:21,25`:** `startOpen` has no production caller left (EventRounds moved to `remember`; EventSessions, GameEventList, TagInput leave it at false); only tests pass it. `GameNotesButton.vue:~22`: `size?: 32 | 36 | 40` with default 40, while the only mount (`GameCard`) passes 32; `IconButton` keeps 36/40 for others, but the button's own default is dead.
8. **Flag pairs, `GameCard.vue` props `notesEditTo` / `notesEditable` and `GameNotesButton.vue` `editTo` / `editable`:** two props of which "a caller gives this or the other" (the doc comment says so). A single `notesEdit?: { to: RouteLocationRaw } | 'button'` would make the invalid pair unrepresentable.
9. **`GameDialog.vue:~45`:** `const canEdit = computed(() => canEditGame.value)` is a pure alias (Mysterious Name: two names for one fact next to `canEditEvent`); use `canEditGame`. The two add buttons (`data-notes-edit="event"` and `"both"`, ~178-212) repeat the same class string and icon block; `"both"` calls `startEdit('event')` so the attribute value is never a `field` that `startEdit` takes.
10. **`EventRounds.vue:~46-52`:** `keepTile(roundId, tile: unknown)` casts `tile as { openEditor: () => void }`. A typed ref (`InstanceType<typeof GameTile>`) removes the cast.
11. **Route strings:** `/bibliothek/${id}/bearbeiten` is spelled in `GameBrowser.vue:281`, `pages/bibliothek/neu.vue:62`, `pages/bibliothek/[id]/bearbeiten.vue:66` and the pre-existing `[id]/index.vue:101`; `/bibliothek/${id}` in five files. No helper exists, so this is a small Duplicated Code, not a breach.
12. **`server/api/e/[slug]/games/[gameId]/notes.put.ts:6-9`:** the header comment's third line runs to ~330 characters (the repo's other route comments wrap near 180); `04-motion.md:13-16` still describes the in-app toggle through `--cp-motion` and does not mention the `compies-motion` cookie / `data-motion` seam of #680.


## Spec

Reviewer: Spec. Read: the spec #856, tickets #707 #706 #838 #837 #689 #835 #859 #680 #857 #711 #860 #858 #836 #861 (+ #708), every merge note, the non-test diff (server, shared, app, i18n, docs, CHANGELOG), the test titles. #833 commits not rated. Strings the spec prescribes (two § 9 paragraphs, `settings.motionHelp`) match word for word and are not rated.

Result: no must-fix. Every story 1 to 96 has an implementation or a stated measurement; the server route, the dialog, the seams, the cookie, the privacy paragraphs, the scrollbar rule and the click-area closure match the spec. Findings are docs and edge cases.

### (a) Requirements missing or partial

#### 1. should fix - story 58 / #707: the library list inside „Nächstes Spiel setzen“ now switches to a grid at 600 px
- Spec: „Nächstes Spiel setzen“ stays one column, since it is a narrow panel (story 58); „„Nächstes Spiel setzen“ is not changed“ (Implementation Decisions, The grid from 600 px). Ticket #707: „„Nächstes Spiel setzen“ stays one column.“
- Built: `GameBrowser.vue:132` `GRID` and `GameCard` `responsive` switch at `sm`; `NextGamePicker.vue:96` renders its library list through `GameBrowser` with no opt-out. Merge note of #707 says so: „This also covers „Nächstes Spiel setzen“'s library list … Its own pool list is unchanged.“ The note states it but does not say the ticket allows it, so it is a deviation from the ticket line.
- Effect: between 600 and 979 px the sheet is full width and its library list becomes a card grid instead of rows (from 980 px the 400 px drawer was a grid before, so only that band changes). The pool list above it stays rows, so the one sheet shows two styles.
- Decision for the operator: accept (the spec's „both pool pickers“ wording could mean this) or give `GameBrowser` a prop that keeps rows there.

#### 2. should fix - story 75: overlay scrollbars are not covered by any measurement
- Spec: „On a phone or a Mac with overlay scrollbars, I want them to stay overlay scrollbars that take no room.“ #706 merge note: measured classic bars only (headless Chrome), „At 390 px the kit's touch emulation draws no classic bar, so the width has no 390 px item.“ The ticket's browser items for #863 name only „a device with classic scrollbars“.
- Risk: a non-`auto` `scrollbar-color` may change how Chromium or Safari draw an overlay bar on macOS. Add a Mac or phone item to #863 (the bar stays overlay, no layout shift) so the story is checked once.

### (b) Behaviour not asked for

None that a User meets. Small things, all harmless:

#### 3. nit - dead prop `startOpen` on `GameNotesDisclosure`
- `GameNotesDisclosure.vue:21,25,33`: the Round card now passes `remember`; no caller passes `start-open` any more (`git grep start-open` finds none). The prop and its default `local` branch stay. Spec: „The same disclosure on a game's page … stays closed and remembers nothing“ needs only the default `false`. Remove the prop or keep it knowingly.

### (c) Looks implemented but wrong

#### 4. nit - phone row can cut a Tag that is narrower than the row (story 48, 51)
- Spec: „I want that Tag alone cut with „…““ (a Tag wider than a whole row) and „a row to keep one line of Tags, filled by width with none cut short“.
- `app/utils/tag-fit.ts:403-406` returns at least 1 chip, and `GameCard.vue:259` lets the last chip in a one-line row shrink (`min-w-0 shrink`, `truncate`) when `„+X“` follows. So a first chip that fits the row but leaves no room for „+X“ is cut, and `useTagFit.ts:280` gives it a tooltip. The code comment owns it. Rare (needs a long Tag and a second Tag on a narrow row); the 390 px measurement had none. Accept or hide „+X“ in that case.

#### 5. should fix (docs) - `## LuckyWheel` heading deleted by the #711 doc edit
- `docs/design_handoff_compies/02-components.md:883-884`: the diff for #711 replaces the blank line and `## LuckyWheel` with the new `- **Deviation (0.19, #711)** …` line, so the LuckyWheel section (`**Scope:** [1.0] · **Ref:** GameWheel …`) now continues the GameCard list. The index link `[LuckyWheel](#luckywheel)` (line 75) points nowhere. Restore a blank line and `## LuckyWheel` after the #711 line.

#### 6. nit (docs) - the notes hand-off doc still describes the pre-0.19 build
- `docs/design_handoff_compies/18-notizen.md:129`: „A finished Event stays fully locked until 0.19-2 (#857), which frees the Game notes.“ #857 is merged.
- `18-notizen.md:133`: „It is not in the notes popover or sheet of „Nächstes Spiel setzen“ … and not on the Round card's disclosure“ is true for the pickers but no longer for the Round card (#836: footer „Bearbeiten“) and not for the library card and Event tile popovers (#837, #858). Not required by a ticket, but the doc is the hand-off record.

### Checked and fine (no finding)
- Route `PUT .../notes` (`server/utils/event-notes.ts`): both keys optional, absent stays, neither is `invalid_value`, both parsed before either written in `changeEvent`'s transaction, `GAME_NOTES_MAX`, `invalid_game_notes`, own game only, Host permission not asked, `allowFinished` with `wrong_phase` for any request carrying `notes` (also `null`, also with `gameNotes`). Integration tests cover each line of the spec's list, secrecy included.
- Dialog (`GameDialog.vue`): both editors Event first, per-field guards, three entries, focus per entry, only changed fields sent, drafts kept, finished Event shows the locked block and one field, Member unchanged, `edit` seam.
- Notes button: sticky-note icon, `notes.open_a11y`, `aria-expanded` + ink fill, cover top right / row right, footer „Bearbeiten“ as link (library), button (Event tiles, then dialog in edit mode, also finished), none in pickers, none on Round tile, none for Members; `gameNotes.open` removed.
- Round card memory: `compies-round-notes`, head script before first paint, blocked storage, library page untouched, § 9 ninth paragraph and „Stand“ match the spec text.
- Tags, equal heights (`anyTags` over the whole filtered list), duplicate hint (`gameNameKey`, `sameNameGame`, own library, archived variant with link, no „Das nehmen“ for Archived, `createAnyway` and `error.duplicateGame` removed, `admin.duplicate` kept), „Das nehmen“ in the library and in the „Spiele“ step.
- Scrollbars: one `:root` rule, no `::-webkit-scrollbar`, `scrollbar-width` only in the notes editor and ReleaseNav, component doc section.
- Reduced motion: cookie route (server only, no DB, attributes shared with Appearance), `data-motion` plugin (signed out too, only `reduced`), row place and texts, failed-save notice, spinner and thumb twins (`grep motion-reduce:` without `reduced:` finds nothing), § 9 tenth paragraph, 03-screens note updated, no other writer of the cookie.
- #708 closed with 361-point measurements and no change, as the spec allows (story 59).
- #861 walk states cover every item of the ticket (including § 9 via `datenschutz`); the stated 1440 px popover deviation is covered by the library card state.
- CHANGELOG has a line per ticket as each asks (#861 none).
