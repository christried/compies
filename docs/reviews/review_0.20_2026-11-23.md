# Release review 0.20 „Archiv“, 2026-11-23

Diff `v0.19.0...spec/683-archiv` at its tip `146c056b` (spec #683), reviewed on the integration branch in two axes (`docs/agents/release.md` § Review, walk-through, retro).

## Standards

## Standards review: COMPIES 0.20 „Archiv“ (spec #683)

Diff: `git diff v0.19.0...origin/spec/683-archiv` at tip `146c056b` (68 files, +6146 −194). Read: `CODING_STANDARDS.md`, `GLOSSARY.md` (Phase, Archive, Winner), ADR 0007 / 0013 (as the files cite them), `docs/agents/release.md` § Changelog lines, `01-tokens.md`, `02-components.md`. Copy was not rated (spec words are decided). No personal data is in this report.

Summary: no „must fix“. Secrecy of the Archive read and migration 0042 are clean (details at the end). Four „should fix“, the rest are notes.

---

### Should fix

#### S1. `server/domain/archive.ts` imports from `server/utils/`: layering break, domain no longer pure
`server/domain/archive.ts:8-9`
```ts
import { ceremonyShownOf, ceremonyViewOf, type CeremonyRow } from '../utils/ceremony'
import type { EventRow } from '../utils/event-access'
```
It is the only file in `server/domain/` that imports from `../utils` (checked: every other domain file imports only `shared/` and its siblings). The file's own header says „Pure functions“, and `api/e/index.get.ts` and `archive.get.ts` both say „Pure rules live in server/domain“. `utils/ceremony.ts` pulls in drizzle, the schema, `event-state.ts` (all of the Event read) and `event-access.ts`, so the "pure" unit test `test/unit/archive.test.ts` now loads the server graph. `ceremonyShownOf` and `ceremonyViewOf` are themselves pure (they read a row and `shared/`). Judgement call (no written rule for the direction of the dependency), but it is a Feature Envy / layering smell in a new file. Fix: move the two pure functions and the `CeremonyRow` type to `server/domain/` (or `shared/ceremony.ts`) and let `utils/ceremony.ts` re-use them.

#### S2. The Archive's cache is not dropped when a Host deletes a finished Event
`app/utils/event-data.ts:12-13`, `app/components/EventHostDialogs.vue:158` (`clearNuxtData(HOME_EVENTS_KEY)`).
`ARCHIVE_KEY` is documented „as Home's: one cache for the page, so a return refetches the same data“, but the one place that drops Home's list on „Event löschen“ (#333) does not drop the Archive's. A Host who deletes a finished Event and then opens Archiv gets the stale list (the shared `data` ref holds the old answer while the refetch is pending, and the page renders `pending && !data` as skeleton only when `data` is empty), so the deleted Event is a card that opens a 410 page. Same pattern, same fix: `clearNuxtData(ARCHIVE_KEY)` next to Home's. (Behaviour finding; the Spec reviewer may rate it too.)

#### S3. `CODING_STANDARDS.md` § One home per concern was not extended for the new homes
The diff does not touch `CODING_STANDARDS.md` (nor `docs/agents/`). The section says „Each concern below has one home. New code calls it“. 0.20 creates new homes that the next feature has to find:
- the list filters kept in the address: `useAddressState` (`app/composables/useAddressState.ts`), with `useRouteFilters` and `useArchiveFilters` as its two callers;
- the search field with the magnifying glass: `SearchField`; the row „Searching and filtering games | `GameBrowser`“ now reads as if the browser owned the field;
- the chip button look: `CHIP_BUTTON` / `CHIP_SHAPE` in `app/utils/chip-look.ts`;
- the Archive's rules: `server/domain/archive.ts` (`archiveEntry`, `archiveResult`, `resultOpen`, `arrangeArchive`), `shared/archive.ts` (`filterArchive`, `archiveChip`), and „a closed entry has no `winners`/`rank` key“ as a secrecy row;
- the composition of all Team names: `composeTeamNames` in `shared/board.ts` (the Event read and the Archive both call it; „a second composition is a finding“ is exactly the kind of row the table holds).

#### S4. ArchiveCard pill below the type floor, and a second copy of the neutral pill
`app/components/ArchiveCard.vue:30`
```ts
const PILL = 'inline-flex h-6 items-center gap-1 rounded-pill border-2 border-line px-2 text-[11px] font-extrabold'
```
`docs/design_handoff_compies/01-tokens.md:59`: type scale „body-lg / body / small / caption = 17 / 15 / 13 / 12 (floor 12 px)“. 11 px is below the documented floor. Precedent exists (`GameCard.vue:84` `PILL` also uses `text-[11px]`, `ChatPanel`, `ClipPreview`), so the repo itself breaks the doc, and the artboard may prescribe it: if so, a „Deviation“ line in `02-components.md` is what the docs ask for; there is none. Also a Duplicated Code smell: `ArchiveCard.PILL` and `GameCard.PILL` are two hand-written pill shapes (no shared Pill component or constant). Judgement call on the 11 px, hard on the missing deviation note.

#### S5. Index on a filtered column (rule met only by precedent)
`server/api/archive.get.ts:46` filters on `eventMembers.userId`. `CODING_STANDARDS.md` § Database: „A column a request filters or joins on gets its index in the same migration.“ `event_members` has the PK `(event_id, user_id)` and `(event_id, team)`, no index that leads with `user_id`. Home (`api/e/index.get.ts:41`) does the same, so this is not new, but the Archive is the read that never shrinks (finished Events stay for good), and 0042 is the migration of this Release. Rate „should fix“ only if the user wants the rule applied literally; otherwise a note for a ticket on both reads.

---

### Notes

#### N1. Two homes for „the Award ceremony is pending / over“
`server/domain/archive.ts:64-66` (`resultOpen`) and `app/utils/ceremony.ts:105-108` (`ceremonyAwaitsSound`) are the two sides of one rule (shown ∧ no run going vs. not started ∨ run going), both over `ceremonyRunning` of `shared/ceremony.ts`, and they treat a missing run differently (`endsAt === null` counts as over here, `ceremony === null` counts as pending there; defensible, because the Archive has a `shown` flag and the page does not). Also `useCeremonyHold`. If a fourth reader comes, the rule belongs in `shared/ceremony.ts`. Duplicated Code in shape, not yet in logic.

#### N2. `ArchiveEntry` asserted with a whole-object `toEqual`
`test/unit/archive.test.ts:24-34`. `CODING_STANDARDS.md` § Tests: a read section that grows is asserted with `toMatchObject` or a builder, not `toEqual` on the whole object. Here the whole-object check is what pins „a closed entry has exactly these keys“ (and `test/integration/archive.test.ts` pins `CLOSED_KEYS` separately), so it is defensible; a new field on the entry breaks it, which is the cost the rule names. `test/integration/archive.test.ts:425` also compares two whole entries (intended: „same closed entry for both viewers“).

#### N3. Stale design hand-off lines
- `docs/design_handoff_compies/03-screens.md` (added line): „the search and the chips come with 0.20-4“. They ship in this Release, so the line is wrong on arrival.
- `02-components.md` § SkeletonCard has no note on the new `shape="archive"`; § ArchiveList / ArchiveCard has no deviation for the Winner strip, the „Die Siegerehrung steht noch aus.“ sentence, the rank pill or the chips (the 0.20 lines added there cover #882 and #887 only).
- `ArchiveCard.vue:48` uses `border-[2.5px]`; `01-tokens.md:72`: `border-memphis` 3 px light / 2.5 px dark, so the Winner strip is thinner than its neighbours' `border-(length:--cp-bw)` in Hell. Same literal in `Leaderboard`, `CeremonyStandingRow`: precedent, not a new habit.

#### N4. Raw pixel type sizes where utilities exist
`archiv.vue:51,112` `text-[13px]`, `ArchiveCard.vue:71,81,111` `text-[13px]`/`text-[12px]`, `SearchField.vue` `text-[17px]` (moved unchanged from GameBrowser) are `text-small`, `text-caption`, `text-body-lg` in `01-tokens.md`. The name's `text-[16px]` is no step of the scale (15/17). Repo-wide habit (HomeEventCard does the same), so a note.

#### N5. Small smells
- `app/pages/archiv.vue:101` and `:144` repeat the grid classes `grid-cols-1 gap-3 min-[600px]:grid-cols-2 min-[1024px]:grid-cols-3` (skeleton grid and list); one `GRID` constant, as `GameBrowser` has. Duplicated Code.
- `archiv.vue:21` `hosts` is a boolean named like a collection (`hostsAny` / `viewerHosts`); `CHIPS` (`:25`) is a computed named like a constant. Mysterious Name, minor.
- `SkeletonCard.vue`: one component, two unrelated templates switched by `shape` (the Archive's has none of the Home card's shape). A Boolean/flag-argument smell; a separate `ArchiveSkeletonCard` would need no `v-if/v-else` and no doc deviation. Judgement.
- `SearchField.vue:16` bakes `min-w-[220px] flex-1` into the shared component; both callers sit in a `flex-wrap` toolbar, so it works, but a caller cannot change it.
- `useAddressState.ts:23` `ref(fromAddress()) as Ref<S>` is a cast the original (`ref(fromAddress())` of a concrete type) did not need; it is the price of the generic. Fine.
- `server/domain/archive.ts:31` `ArchiveResultRow = CeremonyRow & Pick<EventRow,'ceremonyShown'> & Pick<ArchiveRow,'team'>` and `CeremonyRow = Parameters<typeof settingsFromRow>[0] & …` (utils/ceremony.ts:19): the type is derived from a function's parameter; correct, but the name does not say „the columns the Archive selects“. The handler's hand-written 14-column select is the same list, kept in step by the type checker, not by a shared constant. Data Clump, mild.
- `archive.get.ts:53-57`: a „game“ is a Round with `resultAt` not null, matching `event-state.ts:123`; `utils/game-events.ts:19` additionally filters `isNull(rounds.putBackAt)`. A Round put back has no Result, so no difference today, but the third copy of „what counts as a played Round“ has no single home.

---

### Checked and clean

#### Secrecy of the Archive read (`CODING_STANDARDS.md` § Secrecy)
- `archiveEntry` (`server/domain/archive.ts:38-57`) spreads `...result` after `resultOpen: result !== null`. A closed entry (`result === null`) therefore has no `winners` and no `rank` key at all, not `undefined`, and `resultOpen` is the same for every viewer. `shared/archive.ts` types them optional and says so.
- `archiveResult` returns `null` before computing names or rank: `ceremonyShownOf` → null; `resultOpen` false → null. The Standings and `ceremonyViewOf` are computed from the Results only to decide *whether* to open, and nothing of that is returned. The Team names (`composeTeamNames`) are built only after the open check.
- The handler writes nothing and commits no `changeEvent`, so no `event.changed` and no room message exists to leak (ADR 0013 respected; the clock is the request's, read once).
- `test/integration/archive.test.ts:407-421` searches the raw JSON of a closed entry for `winners`, `rank` and both Team words, for Host and Member, and pins `CLOSED_KEYS`; a Tie case at `:423-436`; `hidden-wheel-world.ts` knows `/api/archive` (the GET sweep).
- Judgement call for the Spec reviewer: a closed entry still carries `gameCount`, which is a count of Rounds with a Result (derived from Results). It reveals no Winner, rank or name and the Event page shows the same count; I did not rate it.
- No new Datenschutz section is needed (Members see their own Events' Winners, as on the Event page).

#### Migration `drizzle/0042_drop_phase_archived.sql`
- Matches ADR 0007 / § Database: a new migration (not an edit); the `DO $$ … RAISE EXCEPTION` guard refuses to rewrite an Event in `archived` (nothing silent), and `test/integration/drop-phase-archived-migration.test.ts` pins the abort and the full rollback (type still has six values), the retry after a hand move, the re-run, the five-value type, no `event_phase_old`, and both checks without `archived`.
- Order is right: the two CHECKs (0023, 0025 names confirmed) are dropped before the type swap and re-added after; `events.phase` has no default, no index and no other column of the type (only `events.phase` uses `event_phase`), so `SET DATA TYPE … USING phase::text::event_phase` has nothing to trip on. `events_ceremony_pair_check` is untouched, as the header says.
- Switch-over claim holds: in `v0.19.0` no SQL names `'archived'` as a Phase literal; `LIVE_PHASES = PHASES.filter(beforeFinish)` (`utils/library.ts:31`) is a parameter list of the four live Phases, and the Finish writes pass the rewritten checks. The old code's `phase === 'archived'` comparisons are JS only.
- Journal: `idx 42`, `when` greater than 0041's; snapshot diff against 0041 is exactly the id/prevId, the two check values and the enum value, nothing else.
- Operational note (not a finding): if production holds an `archived` Event the Vercel build fails by design (story 65). The operator should check `SELECT count(*) FROM events WHERE phase='archived'` on production before the Release PR is merged.
- Follow-on edits are consistent: `schema.ts` checks, `PHASES`, `settingsLocked`, `bonusVetoRejection`, `PhasePill` `DOT`, `PHASE_WORD_KEY`, `phaseAfterChange` comment, i18n keys `phase.archived`, the other tests; `team-names-open-migration.test.ts` moves the `archived` rows by hand between 0041 and 0042 via the new `migrateThrough`.

#### Extraction of `useAddressState` / `SearchField` / `CHIP_BUTTON`
- `useAddressState`: the generic holds the one rule (local state, chip push, `q` replace after 250 ms, back/forward followed, `q` kept with its spaces); `useRouteFilters` and `useArchiveFilters` hold only `read` and `changes`. The extracted body is the old body verbatim apart from `write(changed, …)` naming; no behaviour moved. Two callers, so no Speculative Generality. Covered by the library and the archive-page address tests (`archive-page.test.ts:529-589`); there is no unit test of the composable itself.
- `SearchField`: `GameBrowser` and `archiv.vue` both use it; the old inline markup is gone from `GameBrowser` (import of `Search` removed), same classes.
- `CHIP_BUTTON` replaces `GameBrowser`'s local `CHIP`; `FilterSelect` keeps `CHIP_SHAPE` with its own paddings (the comment says so). One home per concern is met, but see S3 for the missing table rows.

#### Other standards checked, no finding
Dates through `berlinDay` (`shared/time`); copy words in `de.json` only; `nuxt` error state through `FullScreenState` + `errorPage.generic.retry` as Home; changelog lines under `## [Unreleased]` in `### Neu` then `### Geändert`, German, with issue links, none for the invisible tickets (#884, #887, #888); GLOSSARY words (Archive, Winner, Stands, Phase: „no Event is ever archived“) match the code; `HUB_SITES` loses `archiv`; removed i18n keys (`archive.*`, `mvp.site.archiv`, `ended*`) have no remaining caller (grep over `app`, `server`, `shared`, `scripts`, `test`); personal data: `walk-states-archiv.mjs` names only dev Users by role and Events by the run prefix.

## Spec

## Release review 0.20 „Archiv“: Spec reviewer

Diff: `v0.19.0...origin/spec/683-archiv` (68 files). Read against #683 and #882 to #888 with their merge comments (decisions in those comments are treated as spec). No personal data in this report.

Result: no „must fix“. Three „should fix“, five notes. The areas the brief singled out hold (see „Verified“ at the end).

### Should fix

#### 1. A deleted Event can still show on the Archive page after the Host deletes it (spec story 9)
- Spec story 9: „As a Member, I want a Deleted Event gone from the list at once, so that no card leads to an address that leads nowhere.“
- `app/pages/archiv.vue:11` fetches under the shared key `ARCHIVE_KEY` (`app/utils/event-data.ts:13`). The Host's delete (`app/components/EventHostDialogs.vue:158`) clears only `HOME_EVENTS_KEY`, with the comment „Home's list is dropped so the Event is gone on arrival“ (#333). The Archive key is never cleared.
- Trace: Host opens Archiv, opens a finished Event, deletes it, `navigateTo('/')`, later opens Archiv again in the same tab. `useFetch` re-fetches, but `data` still holds the old list while the request is pending, and the page renders it (`pending && !data` is false, so no skeleton). The deleted card shows, linking to a 410 page, until the read resolves. The read itself excludes the Event (`isNull(events.deletedAt)`, `server/api/archive.get.ts:62`), so this is a flash, not a lasting error. Same effect for an Event finished meanwhile: the list lacks it until the refetch lands.
- Fix: `clearNuxtData(ARCHIVE_KEY)` beside `clearNuxtData(HOME_EVENTS_KEY)` in the delete's `done`. No test covers this (the delete tests do not know the Archive).

#### 2. `empty.archive.*` stays in the locale file and states the rule the spec dropped (story 69)
- Spec story 69: „the texts no code uses any more removed from the locale file (…, and of the old archive copy whatever the Archive does not use)“.
- `i18n/locales/de.json:1893-1896`: `empty.archive.title` „Noch nichts im Archiv.“ and `.text` „Spiel mindestens ein Spiel in einem Event, dann taucht es hier auf.“ No code uses them (the #882 comment confirms `unused.mjs` lists them). The text says „played at least one game“, which grilling decision 1 rejected.
- #882's merge comment left them because they are not on the spec's explicit list (`archive.*`, `connection.*`, `mvp.site.archiv.*`, `phase.archived`, `archiveList.empty`). That is a decision, but it narrows story 69 without saying so. Remove them in #889, or say they stay on purpose.

#### 3. #888's second criterion is not met on this diff
- #888 AC: „The recording's check passes and every new or changed text of 0.20 has a sighting (`node scripts/wording/review.mjs --new` lists them).“
- The merge comment says `review.mjs --new` was not run, and the dark check over the renamed state `archiv` (was `baustelle-archiv`) was not run. `scripts/browser/walk-states-archiv.mjs` and `test/unit/wording-walk-archiv.test.ts` do give every `archiveList.*` key a state (`CLAIMS`, lines 40 to 61), so the plan is complete. What is missing is the run. Carry it into #889/#890 as an open item, not as done.

### Notes

#### 4. `03-screens.md` states something that is no longer true
- `docs/design_handoff_compies/03-screens.md`, the § 21 deviation line (added in #882): „the search and the chips come with 0.20-4“. #885 built them in the same Release, so the hand-off note is stale at the cut. Story 67 asks that the notes and the app agree. The note also does not mention the closed card (Winners and rank held back until the ceremony), which is a visible deviation from the artboard.

#### 5. Skeleton against the real card: 2 px strip mismatch, and the controls row moves the cards
- `app/components/SkeletonCard.vue` (archive shape) has a 46 px strip block. The real strip is 48 px (#883 comment: „the strip is 48 px high“). A one-Winner card therefore ends 2 px taller than its skeleton, and a Tie card or a closed card (a text block of another height) differs more. #884 AC „no jump when the list arrives“ is browser-only and open for #890.
- #885 states that the chips and search are absent while loading, so cards move down by the controls' row on arrival. That conflicts with story 53 („so that the page does not jump when the Events arrive“). It is a recorded decision, so not a defect, but it is the one place the page jumps by design; #890 should measure it and the operator should accept it knowingly.

#### 6. The `/archiv` sign-in criterion is covered only through the catch-all page
- #882 AC: „`/archiv` behind the sign-in“. `test/nuxt/auth-guard.test.ts:12-24` still mounts `CatchAllPage` with route `/archiv`. The guard is global middleware, so the behaviour is right, but the tests exercise the Construction page and use `/archiv` as an arbitrary path. No test mounts `ArchivePage` signed out. The route-level refusal (`requires a signed-in User`, `test/integration/archive.test.ts:162`) is covered.

#### 7. `?filter=host` for a User who hosts nothing pushes an invisible history entry on „Alle“
- `app/composables/useArchiveFilters.ts:13` compares `next.chip === was.chip` on the raw state (`host`), while the page shows `all` (`archiveChip`). Clicking the already-pressed „Alle“ changes `host` to `all`, so `useAddressState` pushes a new history entry that removes `filter` and changes nothing visible. Back then returns to the same list. Story 48 is met (the list reads „Alle“); this is only a cosmetic history step.

#### 8. Scope beyond the tickets, all recorded or asked for
- `EmptyState`'s `<h2>` now has `overflow-wrap: anywhere` for every empty state of the app (`app/components/EmptyState.vue`), not only the Archive's. #885's comment records the reason, so it is a decision. It reaches the Bibliothek's no-match title; #890 should include it.
- The `useRouteFilters` rewrite onto `useAddressState`, `SearchField` and `CHIP_BUTTON` were asked for (#885: „give the shared part one home“). `library.test.ts` was left untouched and passes 76 of 76 per the merge comment.
- Nothing else found that was not asked for. The Archive card's Medal and Crown icons follow the artboard and are not in the spec text; harmless.

### Verified (no finding)

- **Wire, closed entry** (`server/domain/archive.ts` `archiveEntry`, `shared/archive.ts`): a closed entry gets `resultOpen:false` and no `winners` or `rank` key (`...result` spreads `null`). Nothing else in the entry derives from the result: `seated`, `isHost`, `gameCount`, `memberCount`, `format` are the viewer's or counts. The Team words are composed only inside `archiveResult` after the open check, so no Team name travels on a closed entry. The Host and a Member get the same object (decision in #883). `test/integration/archive.test.ts:406` reads the raw text for both and checks no `winners`, `rank` or Team word. `resultOpen` itself tells every viewer that the ceremony has started and finished; the spec's own wording („whether the result is open“) carries that.
- **When an entry opens** (`archiveResult`, `resultOpen`): `shown = ceremonyShownOf` (flag or stored start, the page's rule), the end is `ceremonyViewOf(row, leaders.length).endsAt`, the same function and the same Winner count as `ceremonySection`. Closed from the lead (start is `now` plus lead) to one ms before the end, open at the end's instant (`ceremonyRunning` is `now < end`). A restart overwrites the start, so the entry closes again. Flag without a start, or no settings, reads as open (decided). Tests: unit at the instants (`test/unit/archive.test.ts:77-100, 131`), integration for lead, first run, restart and Tie length (`archive.test.ts:622-672`).
- **Rank and „Gewonnen“**: rank is `Standing.rank` of the viewer's seat from `standingsAndEnd` over the Rounds with a Result (the page's own fold, `event-state.ts:134`), so a shared rank prints as the Standings do; a Member on the Stands gets `null`. `filterArchive` keeps `resultOpen && rank === 1`, which equals „open and Winners include the viewer's Party“ (a Tie gives every Party on rank 1 that rank). Closed entries have no `rank`, so they stay out for everyone. Tested at unit, integration and page level.
- **Chips and search**: `?filter=won|host`, `?q=`; unknown values and `host` without a hosted Event read as „Alle“; a chip pushes, typing replaces after 250 ms; back and forward follow the address; „Als Host“ is rendered only when hosted. All covered in `archive-page.test.ts:357-640`.
- **Navigation highlight**: `HubNav.vue:33` `eventTab` is `archiv` only for `context.phase === 'finished'`, else `events`; no context gives „Events“. The current mark, the context row and the description hang on that tab. The header passes the Event context on the Event page and on its settings page. The bottom tab bar gets no context. The move at the Finish is tested on a mounted nav (`hub-nav.test.ts:273`), the settings page in `app-header.test.ts:93`. The nav shows from 980 px, not 768 (decision in #886).
- **Migration `0042_drop_phase_archived.sql`**: guard `RAISE EXCEPTION` on a count of `archived`; drop both checks, rename the type, create the five-value type, `ALTER COLUMN … USING phase::text::event_phase`, drop the old type, re-add both checks with `= 'finished'`; `events_ceremony_pair_check` untouched. `events.phase` has no default and no other column, index or view uses the type (only `0002` names it). Drizzle runs it in one transaction, so a stop leaves everything as it was. The 0.19 code never writes `archived` and filters on `LIVE_PHASES` as typed parameters, so the order of migration and deployment is safe (ADR 0007). Journal index 42 and `when` are monotonic. Tests cover Events of every Phase surviving, both checks, the stop with its message, rollback and the run after a manual move.
- **Phase removal**: `git grep "'archived'"` outside `drizzle/` and tests shows only game-archive lines; schema, `PHASES`, pill, the two rules, `phase.archived` are gone.
- **Texts, Construction page, Changelog**: `HUB_SITES` is `['admin']`; `mvp.site.archiv.*`, `archive.*`, `connection.ended*` and `archiveList.empty` removed; Changelog has lines for #882, #883, #885 under „Neu“ and #886 under „Geändert“; none for #884, #887, #888, as the tickets say.
