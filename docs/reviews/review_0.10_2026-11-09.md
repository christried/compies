# Review 0.10 „Feinschliff“ (2026-11-09)

Diff `v0.9.0...e5687a6` (61 commits, 153 files). The integration branch is `release/0.10-feinschliff` of spec [#332](https://github.com/christried/compies/issues/332), with PR [#346](https://github.com/christried/compies/pull/346). Per `docs/agents/release.md` § Review, walk-through, retro, this review ran on the integration branch. Three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#332 with #328, #333, #335–#338, #340);
- quality with architecture.

Browser checks ran before the review:
- `b336` at 0833f97: one walk-through note (the library's filter row, item 2).
- `b337` at 0833f97: one pre-existing FAIL, the detail page h1 overflows with a long unbroken game name.
- `b338` at 35de3dd: all PASS.
- `b340` at e5687a6: pending.

## Result

- **One Must-fix, on the Standards axis:** S1, migration 0026 breaks the 0.9 code that serves while it runs. The Spec axis rates the same window a Note (SPEC-5). Decision for the user, see „For the user“.
- **Must-fix per axis:** Standards 1, Spec 0, Quality 0.
- **Counts:** Standards 1 Must-fix, 3 Should-fix, 12 Note. Spec 0 Must-fix, 3 Should-fix, 7 Note. Quality 0 Must-fix, 7 Should-fix, 8 Note.
- **Shared findings:**
  - the Price copy's home: S3, Q1;
  - the stale GameCard comment: S6, SPEC-3;
  - the 0026 window: S1, SPEC-5;
  - the fixture fallback: S8, Q7;
  - the detail page h1 overflow: SPEC-2, b337.
- The Spec axis alone found the Countdown announcing „Countdown gestellt“ on a Member's arrival (SPEC-1).
- No structural regression on the quality axis; no non-test file crosses 1000 lines.
- Gate, not in the diff: #334 (Datenschutzerklärung). Do not cut 0.10 before it merges (S5, SPEC-10).

### Fixed before `staging`

Branch for all rows: `fix/332-review`, merged ecdb79a.

| | Finding | Fix | Branch |
|---|---|---|---|
| F1 | S2 | The deploy check prints the Event's id and the Session's id instead of the slug; the delivery doc's „names the Event and the Session that block“ stays true by id. Test: the check's output has no slug. | `fix/332-review`, merged ecdb79a |
| F2 | S3, Q1 | `PRICE_SOURCE_LABELS`, `priceLine`, `priceCheckedDay` and the three `Intl` day formats leave `shared/game.ts`: the wording goes into `de.json` under `price.*`, the day format into `app/utils/berlin-time.ts`, the helper into `app/utils/price.ts`. `shared/game.ts` keeps `PRICE_SOURCES`, `parsePrice`, the range. The rendered strings do not change. | `fix/332-review`, merged ecdb79a |
| F3 | S4 | An assertion of easing and duration for the Countdown's CSS transitions (tile, pill, card root, reduced variants) in `event-countdown-motion.test.ts`. | `fix/332-review`, merged ecdb79a |
| F4 | S6, SPEC-3 | The `GameCard.vue` header comment is corrected: pool and Round games carry a Price since #338; only wheel slices carry neither. | `fix/332-review`, merged ecdb79a |
| F5 | Q7, S8 | The `tagsInUse ?? []` fallback in `useGameLibrary` goes; the test fixtures that stub `/api/games` answer `tagsInUse`. | `fix/332-review`, merged ecdb79a |
| F6 | S15 | `docs/design_handoff_compies/04-motion.md` gets a § Countdown pointer to `13-countdown.md` § „04-motion addition“, so the § Motion citations resolve. | `fix/332-review`, merged ecdb79a |
| F7 | SPEC-2 (b337 item 2) | The detail page h1 (`app/pages/bibliothek/[id]/index.vue:97`) gets `break-words` (overflow-wrap: anywhere); a component test mounts a name of `GAME_NAME_MAX` characters without spaces and asserts the class. | `fix/332-review`, merged ecdb79a |
| F8 | SPEC-1 | „Countdown gestellt“ is announced only when the Countdown appears while the Event page is already open, not on a client-side arrival. Tests: mount with a Countdown present (no message); set it afterwards (message). | `fix/332-review`, merged ecdb79a |

Notes on the table:
- F1: Standards S2 recommends asking the user first (the naming was approved as retro-0.9 finding 1, and that approval does not record the public log). fixes.md puts F1 in the fix pass; confirm before the merge.
- F2: fixes.md names `app/utils/price.ts`; Quality Q1 names `app/utils/describe-price.ts` with `describePrice(price, now, t)`. The row keeps fixes.md's path. fixes.md also lists the callers without `GameForm.vue`, which Q1 names as a caller.
- F4: SPEC-3 suggests the wording „carry a Price but no Tags“; fixes.md's wording (only wheel slices carry neither) is the one used here.

### For the user

- **S1 / SPEC-5: migration 0026 (`drizzle/0026_drop_pool_column.sql`, #301, on `staging`, not on `main`).** Production's v0.9.0 schema still declares `pool`, and drizzle names every declared column in an INSERT. During the build window (minutes) a 0.9.0 pool save (Event create with a pool, settings pool save) fails with „column pool does not exist“. Nothing reads `pool`, and no data is lost. Options as the reports give them:
  - fixes.md: (a) accept the window and deploy at a quiet hour (recommended); (b) migration 0029 re-adds `pool_kind` and `pool` with default `'main'` and a schema line, dropped again in 0.11.
  - Standards S1: (a) keep the column through 0.10 and drop it in 0.11, after a release whose schema no longer declares it; (b) record the window as accepted in the Release PR and correct the header and the test comment.
  - Standards and Spec both want the SQL header comment corrected (`drizzle/0026_drop_pool_column.sql:1-4`) and the test comment (`test/integration/drop-pool-column-migration.test.ts:7`). No F-item covers this yet.
  - Either way, the Release PR names 0026 as destructive (as 0024 was).
- **S14: `docs/reviews/prod_review_1.md`.** The file holds the operator's raw notes, with personal details, committed to the public repo (the user's commit 2e96e37). This review does not repeat them. Confirm only; the operator chose to commit it (§ Personal data).
- **b336 item 2: filter row.** At 390 px the library's filter row wraps to three lines with five chips (the brief allowed 2.5; SPEC-9).
- **#340 decision 2: stage order.** fixes.md calls the stage order move from `13-countdown.md` § EventPage a walk-through question. The Spec axis's checked list says „the stage order stays (decision 2)“. Confirm which holds.
- **SPEC-4: spec story 8 and ADR 0006.** A User who was never a Member does not see „Event gelöscht“ on a deleted Event's Invite link. Newcomers get 404 „Link ungültig“ (`server/api/invite/[invite].post.ts:21-25`), former Members 410, by decision on #332 and #333. The signed-out preview `GET /api/invite/:invite` answers 404 for everyone, so a signed-out former Member also sees „Link ungültig“ until sign-in. If story 8 wins, the invite routes, integration case 6 and ADR 0006 change together.

### Follow-up tickets

Refactors, not for the Release (from fixes.md):
- Q2 (with S11 on the same path): `confirmPrice` re-sends the whole game from a possibly stale prop (`GameForm.vue:222-250`), so a stale prop overwrites a concurrent edit. Follow-up: a `priceChecked`-only PATCH or a re-read before the send. S11 adds that `PATCH /api/games/:id` decides the Price day from a row read before the transaction (`server/api/games/[id].patch.ts:24-26`).
- Q3: extract `PriceField.vue` from `GameForm.vue` (14 bindings, about 70 template lines).
- Q4, S7: the select-with-chevron chip is copied four times (`GameBrowser.vue` ×3, `GameForm.vue`); extract `FilterSelect`; `TagInput` re-spells `TextField`'s chrome.
- Q5, S9: `EventCountdown.vue` mixes frame, announcer, tick/burst and focus; the pip colour re-derives the 6 s threshold; the burst parts are found by `querySelector`.
- Q6: `AwardCeremony.vue` is still 515 lines after #328: the standings `<li>` three times, the Winner card three times; the single-card sizes stay in the script while the Tie's sit in `ceremony-sizes.ts`.
- Q8, Q11: four routes repeat the Tag load; `GameForm` fetches the whole library for Tag suggestions.
- Q13, S12, Q14: `teamPosition` sits between the constants in `settings.ts`; `useRoomy` returns `boolean | null` (five `=== true`); `RunOptions` and `TieRunOptions` duplicate their shape.

## Standards review

Count: **1 Must-fix, 3 Should-fix, 12 Note.**

- **S1** Must-fix. Migration 0026 breaks the 0.9 code that serves while it runs. `drizzle/0026_drop_pool_column.sql:1-4`, claim repeated in `test/integration/drop-pool-column-migration.test.ts:7`.
  - Standard: CODING_STANDARDS § Database („Migrations run in the Vercel build while the previous deployment still serves (ADR 0007). A data migration keeps the app correct for the rows the old code writes after it ran“); ADR 0007.
  - v0.9.0, the code that serves production now, still declares `pool: poolKind('pool').notNull().default('main')` on `eventPoolGames` (`git show v0.9.0:server/db/schema.ts`, lines 215-223). Drizzle's `buildInsertQuery` lists every non-disabled column and writes `default` for the ones a caller leaves out. So v0.9.0's inserts (`server/api/e/index.post.ts:63`, `server/utils/settings.ts:68`) fail with „column pool does not exist“ after `DROP COLUMN`, until the 0.10 deployment takes over.
  - Effect: for the build window, creating an Event with pool games and saving a pool in the settings answer 500. Reads are not hit, because `pools.ts` and `rounds.ts` select `games` only.
  - The header's „the 0.9 code … never names `pool`“ is false at the SQL level. The migration test inserts raw SQL without `pool`, as no drizzle-built query does, so it cannot catch this.
  - Fix, either: (a) keep the column through 0.10 and drop it in 0.11, after a release whose schema no longer declares it; or (b) record the window as accepted in the Release PR (the user decides) and correct the header and the test comment.
  - Not owed to 0027 and 0028: both are additive, and v0.9.0's schema does not name their columns.
- **S2** Should-fix. The deploy check now prints Event slugs into public CI logs. `server/domain/game-day.ts:36-54`, printed by `realtime/scripts/deploy-check.mjs:42` through `.github/workflows/game-day-check.yml`.
  - Standard: CLAUDE.md § Personal data („Never send … anything from a database or a log … outside the app without the user's explicit approval for that case. Outside includes GitHub (the repo is public …)“).
  - A slug is the kebab-cased Event name the Host typed plus 4 characters (`server/domain/slug.ts`), so `reason` carries Host-typed text. The repo is public, so the Actions log is public.
  - The user approved „the deploy check names the blocking Event“ as retro-0.9 finding 1 (commit `54382b0`). Whether that covered the public log is not recorded.
  - Fix: ask the user, or keep the answer for the operator only. For example, name the Session and number in the log and the slug behind a workflow step the operator reads, or mask the slug in the log (`::add-mask::`).
- **S3** Should-fix. The Price line has German copy and its own day formats inside `shared/game.ts`, outside their homes.
  - `shared/game.ts:28-36` (`PRICE_SOURCE_LABELS`: „Steam“, „Free-to-play“, „Abo“, …), `:291-293` (three `Intl.DateTimeFormat`), `:297-311` (`priceCheckedDay`, `priceLine` with „bei“ and „Stand“).
  - Standards: implementer-frame § Rules („UI copy is German, in `i18n/locales/de.json`“); CODING_STANDARDS § One home („Dates and times shown to Users: `app/utils/berlin-time.ts`, `shared/time.ts`“); `shared/time.ts:19` names itself „the one home of the day format“.
  - Consequence: `test/unit/copy.test.ts` scans `de.json` and the changelog only, so a retired word in a source label or in „Stand“ is invisible to it. Three call sites each read `new Date()` for the year (`GameCard.vue:24`, `GameHistory.vue:56`, `pages/bibliothek/[id]/index.vue:25`). Smell: Duplicated Code.
  - Fix: labels and „{amount} € bei {source} · Stand {day}“ go into `de.json` (`gameEdit.price*` is already there). The day formats go next to `formatSetDay` in `app/utils/berlin-time.ts`. One helper (`usePriceLine`, or `priceLine(price, t, now)` in `app/utils`) takes the clock once. The Share image's `copy` parameter is the precedent for the server side, and the Price never reaches it.
- **S4** Should-fix. The Countdown's CSS motion has no test for its easing and duration. `app/components/EventCountdown.vue` (pill and tile `transition-colors dur-fast ease-snap motion-reduce:transition-none reduced:transition-none`, card `animate-enter`).
  - Standard: CODING_STANDARDS § Motion („Its test asserts that easing and duration“); 04-motion § Countdown: state changes are `dur-fast` `ease-snap`; the card enters with `animate-enter`.
  - `countdownTick` and `countdownBurst` are pinned token by token in `test/nuxt/event-countdown-motion.test.ts:255-372`, and the static fallbacks in the `reduced motion` block at `:437`, as § Motion's last bullet asks. `grep dur-fast|ease-snap|animate-enter` in the Countdown tests finds nothing.
  - Fix: one case that reads the classes on `[data-testid="countdown-tile"]`, `[data-testid="countdown-pill"]` and the card root, plus the reduced variants.
- **S5** Note. #333 ships ahead of its Datenschutzerklärung text. `i18n/locales/de.json` `legal.*` is untouched („Stand: 8. November 2026“). Spec #332 and the ticket body require the deletion wording, approved by the user, with a new Stand date. That is #334 (open, in the spec's scope). Standard: § Secrecy („checked against every section of the Datenschutzerklärung that says who sees what“). Do not cut 0.10 before #334 merges. Tags and Prices need no text, as spec story 38 says.
- **S6** Note. A comment in `app/components/GameCard.vue:14` is false since #338: „the pool, Round and wheel games carry neither [Tags nor Price]“. `PoolGameFace` and `RoundGame` carry `price`. Tags are the part that holds. Fix the sentence.
- **S7** Note. Smell: Duplicated Code, the select-with-chevron chip.
  - It is now four copies: three in `GameBrowser.vue:112-195` (Spielerzahl, Passt zu, Tag, each `relative div` + `select` + `AppIcon ChevronDown` with the same classes) and one in `GameForm.vue:~370-393` (the Price source).
  - `TagInput.vue` and the Price source's error line (`GameForm.vue:~395`) re-spell `TextField`'s label, border, `CircleAlert` error and `aria-describedby` chrome.
  - Each copy works. A `SelectChip` and a `FieldShell` would make the next field a one-liner.
- **S8** Note. `app/composables/useGameLibrary.ts:24` („Some fixtures answer the games only, so the Tags in use may be missing“) is production code shaped by tests: `GameList.tagsInUse` is required in `shared/game.ts`. Fix the fixtures and drop the fallback, or make the field optional in the type.
- **S9** Note. `EventCountdown.vue` (383 lines) holds the pill and tile markup, the status-region state machine (`announced`, `sawLastSecond`), the tick, the burst lookup by `data-cd` and the focus follow-up. Smell: Divergent Change; the status and focus parts could be composables. `countdownBurst`'s `tracks` is a tuple of five positionals (`app/utils/motion.ts:108-122`): Primitive Obsession. `BURST_CARD_SHADOW` (`motion.ts:96`) repeats the card's `shadow-[6px_6px_0_var(--cp-error)]` class literal.
- **S10** Note. `shared/team-colors.ts:6` `SURFACE = '#fffdf8'` says it equals `--cp-surface`, but `test/unit/team-colors.test.ts` pins only the team inks, which happen to hold the same hex. A rename of the token would go unseen. `CoinFlip.vue:41-42` and `ConstructionTape.vue` also spell the literal, not part of this diff. Fix: one case that reads `--cp-surface`.
- **S11** Note. `PATCH /api/games/:id` decides `changed` for the Price day from a `game` row read before the transaction (`server/api/games/[id].patch.ts:24-26`, `server/utils/library.ts:156-163`). Two editors saving at once can restamp or keep a day wrongly. Low impact (a date). `confirmPrice` in `GameForm.vue` also sends the page's copy of the other fields, so a stale tab can overwrite a rename. Both are in line with how the library already saves; mention only.
  - Note: the Spec and Quality axes call `priceColumns` and the „Preis stimmt noch“ path sound (see their Checked and sound). This Note names a race in the same path.
- **S12** Note. `shared/settings.ts:34-37` puts `teamPosition()` between two blocks of constants (`TEAM_PLAYERS_MAX` and `GAME_COUNT_MIN`). Move it below them. `useRoomy` documents „`null` until the browser was asked“, yet the five call sites in `AwardCeremony.vue` and `CeremonyLayer.vue` each write `roomy.value === true`; a `computed` that returns a boolean once would remove the repeats.
- **S13** Note. `test/nuxt/construction-page.test.ts:18` and `test/nuxt/index.test.ts:55,117` still spell `'home-events'` although `HOME_EVENTS_KEY` (`app/utils/event-data.ts:10`) exists now.
- **S14** Note. `docs/reviews/prod_review_1.md` is the operator's raw notes, committed to the public repo. It holds personal details of the operator, which this review does not repeat. No other User's data. The operator chose to commit it: a confirm-only item under § Personal data.
- **S15** Note. The Countdown's `## 04-motion addition` sits in `13-countdown.md`, while CODING_STANDARDS § Motion and the tests cite „04-motion § Countdown“ and `04-motion.md` has no Countdown section. This repeats how `12-siegerehrung-unentschieden.md` did it. The next reader of § Motion finds nothing under that title. Either name `13-countdown.md` in § Motion or copy the section across.
- **S16** Note, holds. `test/integration/pool-preview.test.ts:247,255,366` pin the faces' whole key list with `toEqual(Object.keys(...).sort())`, which § Tests discourages for sections that grow (`toMatchObject`). Here it is a secrecy allow-list (a new field must be a decision), so keep it. The comment at `:247` could say so.

### Checked and sound (Standards)

- **One home per concern.**
  - Delete goes through `changeEvent(…, { hostOnly, lock: 'update', allowFinished })` with `now` from the change (`server/api/e/[slug].delete.ts`); no `.transaction(` in `server/api/e/**`; it publishes `event.changed` the normal way (ADR 0013).
  - Dock errors go through `useEventMutation` (`errorKeys`), the form's through `apiErrorKey`. The new codes `invalid_tags` and `invalid_price` are in `CODE_COPY`.
  - Request input stays `unknown` until `parseGameInput`, which uses `asRecord`/`isRecord`; text length uses `characterCount`.
  - The library routes use `useClock(event).now()`, which the Event rule does not cover.
- **Secrecy.**
  - Tags exist on `GameView` only. `PoolGameFace` and `RoundGame` carry `price` and no tags.
  - Price travels with the name, so the Hidden wheel and the pool preview rules (`pools.ts`, `stage-read.ts`, `clip.ts`) are unchanged. `eventPool` is still not called for a viewer who may not see the pool.
  - `pool-preview.test.ts` asserts presence per audience, absence of `"tags"` in every raw body, and no `"price"` in the feed or the room messages.
  - The migrations add nothing the deploy check or Home read.
- **Migrations 0027 and 0028.**
  - 0027 indexes `key` (its lookups); `game_id` is served by the primary key.
  - 0028's enum `price_source` belongs to one glossary term, and nothing filters on the price columns, so no index is owed.
  - The CHECKs spell out `IS NOT NULL` against the NULL pass.
  - Both headers carry the ADR 0007 switch-over argument, and the „0.9 tab PATCHes without `tags` or `price`“ case is real code (absent keeps) with tests (`library.test.ts:676`, `:851`).
  - Both have their own migration test (`game-tags-migration`, `game-prices-migration`).
- **#328 acceptance.**
  - The Team colour style has one spelling (`app/utils/team-style.ts`; `grep cp-team-\${` finds only that file).
  - The 1..8 clamp has one home (`teamPosition`).
  - The Team-name fallback has one rule (`shared/team-name.ts`, parity test in `share-image.test.ts`).
  - The breakpoint has one home (`useRoomy`).
  - The run's shape is a type (`CeremonyShape`), with `GRID_FROM_WINNERS` for the default.
  - The person cell is one component with the stack's drift explained in its header and pinned (`ceremony-person-cell.test.ts`).
  - The sizes moved to `ceremony-sizes.ts` unchanged, with their widths tested.
  - The pass-through `CeremonyCompibert.vue` is gone.
  - Review 0.9's S2, S4, S5, S6, S14 are closed by this.
- **Motion.** Tick: 220 ms, `ease-pop` per segment, sought and skipped at 220 ms or more. Burst: seven tracks with the table's delays, durations and eases, from tokens with the token's fallback, `fill: 'backwards'`, sought to the elapsed time, ending on the steady view (tested against a mount of the done state). The burst plays only for a viewer who saw the last second and is at most 760 ms late. No GSAP in the Countdown, so ADR 0015's lazy chunk is untouched. The reduced fallback (steady frame, same keyed steps, same live-region text) has tests.
- **Tests.** Edges are covered: Tags 0, 1, 3, 4, 5, 8, 9 and 20/21 characters; the Price at 0,01 and 999,99, Free-to-play and Abo, the year boundary in Berlin; the Countdown at 10 to 1 and 5 s and 5999 s; deletion in every Phase and every Event route afterwards. People in the ceremony tests have pictures. The Countdown tests fake the server clock.
- **Docs and data.** `docs/agents/*` changes hold no personal data (`delivery.md`'s production-data paragraph names the rule, not a value). `implement-spec-max` differs from `implement-spec` only by name, description and its one paragraph, as its README says. Changelog lines are German, end with the issue link, name no Compibert, and #328 has none. `test/unit/changelog-file.test.ts` now guards the glossary word. No new third-party host, so `privacy-hosts.test.ts` needs nothing.
- **Glossary.** Deleted Event, Tag, Price and Leading Party are in `GLOSSARY.md`; the UI words (Event löschen, Tag, Preis) match. „Leading Party“ has no code user yet (the hat is not in this diff), which is expected.

## Spec review

Count: **0 Must-fix, 3 Should-fix, 7 Note** (SPEC-4 to SPEC-10 are Notes).

Method: each ticket and its comments, then the code that carries it, reasoning about what the tests do not pin. No test or browser run (read-only).

- **Result (Spec).** Secrecy holds (Tags never on an Event read, feed or room; Price exactly where the name is); the delete is host-only, every Phase, 409 while a Session runs, 410 afterwards; the Countdown's late-joiner rule holds, apart from SPEC-1.

### SPEC-1 Should-fix: „Countdown gestellt“ is announced when a Member arrives, not only when the Host sets it

- `app/components/EventCountdown.vue:115`: `if (seen.view === 'ready' && !nuxtApp.isHydrating) live.value = t('countdown.live.set', …)`.
- Ticket #340 / `13-countdown.md` § Accessibility: the status region is written „only on state changes … Nothing on page load (the timer text is there)“.
- `isHydrating` is true only on a server-rendered first load. A Member who reaches the Event page by client navigation (Home card, which is the normal route) mounts the stage after hydration, so a *ready* card at arrival is treated as „the Host just set it“ and spoken. The first sample comes after mount, so the status paragraph is empty at first render and then filled: screen readers do announce that. Same for a Member who leaves and re-enters the Event tab if the stage remounts.
- Not caught: the tests cover „running/paused/done on load“ (`test/nuxt/event-countdown-motion.test.ts:473, 492`) and „appears ready after load“ (`:500`), never a ready card present at a client-side arrival. The implementer noted the hydrating case is untested.
- Fix: decide „the Host set it while I watched“ from the card's arrival relative to the page, not from `isHydrating` (for example the stage tells the card the Event view already held no Countdown on its previous render, or the card announces only on a `countdown` prop change from null to a value while mounted). Add a test that mounts a ready card at a post-hydration first render and expects an empty live region. (Fixed by F8.)

### SPEC-2 Should-fix (known): detail page overflows with a long unbroken game name

- `app/pages/bibliothek/[id]/index.vue:97` (the `<h1>`) has no `overflow-wrap`; `b337` recorded scrollWidth 1283 at 390 px and 2473 at 1440 px for a 60-character name without spaces. It is pre-existing, but #337 put the Price pill and the Tags on this page and its comment says „Goes on the Release 0.10 fix list (`break-words` on the h1 plus a component test)“. It is not in this diff and no ticket names it among the open issues (#347–#357).
- Fix: `[overflow-wrap:anywhere]` (the notes paragraph at line 211 already uses it) plus a component test; ticket it if the fix list is not tracked elsewhere. (Fixed by F7.)

### SPEC-3 Should-fix: `GameCard.vue` header says pool, Round and wheel games carry no Price

- `app/components/GameCard.vue:13-15`: „… and its Price line under the meta line (#337); the pool, Round and wheel games carry neither.“ Since #338 `PoolGame` (so `PoolGameFace` and `RoundGame`) carries `price` and every Member surface draws it through this card. Only Tags are absent there.
- The #338 decision 4 allowed the comment-only edit and the implementer left it „for the fix pass“.
- Fix: „… carry a Price but no Tags“. (Fixed by F4.)

### SPEC-4 Note (user decision): story 8 and ADR 0006

- Spec story 8 (a User who was never a Member sees „Event gelöscht“ on a deleted Event's Invite link) is not built, by decision on #332 and #333: newcomer gets 404 „Link ungültig“ (`server/api/invite/[invite].post.ts:21-25`), a former Member 410. The code does what the decision says and keeps ADR 0006 (no probing).
- One consequence: the signed-out preview `GET /api/invite/:invite` answers 404 for everyone, so a signed-out former Member also sees „Link ungültig“ until they sign in and the join answers 410.
- Still open for the user. If story 8 wins, the invite routes, integration case 6 and ADR 0006 change together.

### SPEC-5 Note: 0026 is destructive and its header claim is wrong for inserts (rides this diff, not a #332 ticket)

- `drizzle/0026_drop_pool_column.sql` says the 0.9 code „never names `pool`“. Drizzle's `buildInsertQuery` lists every table column and writes `default` for the omitted ones (checked in `node_modules/drizzle-orm/pg-core/dialect.js:356-395`), and v0.9.0 still declares `pool` in its schema. So v0.9.0's `tx.insert(eventPoolGames)` (`server/utils/settings.ts:68`, `server/api/e/index.post.ts:63`) fails between the migration (run in the Vercel build, ADR 0007) and the switch-over.
- The window is minutes and only a Host saving a pool or creating an Event with a pool is hit, so the existing „no game day“ rule for the Release PR covers it. (Standards S1 rates the same finding Must-fix; see „For the user“.)
- Fix: name 0026 as destructive in the Release PR (as 0024 was) and correct the SQL header comment.

### SPEC-6 Note: a pool row shows Tags or not depending on where the game came from

- `app/components/stepper/StepPool.vue:96` draws pool rows through `GameCard`. Rows loaded from the Event are `PoolGame` (Price, no Tags); rows added in the open stepper are `GameView` (Price and Tags). #337's decision left it („rows loaded from an Event don't“). Hosts only, no secrecy issue; mention for the walk-through.

### SPEC-7 Note: the Price a Member sees is today's, not the one shown when the game was set

- `GameHistory.vue` and the Round card read `game.price` from the live `games` row (`server/utils/library.ts:priceOf`). If an editor changes or re-stamps a Price after a Round was set, the Spielverlauf shows the new line. Story 37 („history matches what the Round card showed“) holds in the normal case only. Acceptable for Release 0.10; no snapshot was asked for.

### SPEC-8 Note: the delete is „one write“ except the settle that every Host write does first

- `server/api/e/[slug].delete.ts` runs through `changeEvent` with `lock: 'update'`, which first calls `settleDue` (`server/utils/event-access.ts`), an idempotent settle of a draw or Veto window whose instant has passed. It can therefore write a Round or draw outcome before the deleted mark is set. Harmless (no Activity entry reaches anyone, the Event is gone), and the integration test asserts „every other row unchanged“ only for Events with nothing due. Not worth a change.

### SPEC-9 Note: browser-check observations that are spec-adjacent

- #336: at 390 px the library's filter row wraps to three lines (brief allowed 2.5). #335/#336: 20-character Tags truncate hard on a phone card („Rät…“) and a 198 px desktop card wraps to three lines. Both are the implementers' own flags for #342; the acceptance text „wraps cleanly“ is met.
- #333: Home is refreshed on focus/visibility only (ADR 0001). A Member already looking at Home keeps the deleted card until the next refetch; tapping it lands on „Event gelöscht“. Story 6 („at once“) is met for Events they have open and on the next visit, not for a Home that is already on screen.

### SPEC-10 Note: what is not in this diff, and what rode it

- Not in the diff, by design: #334 (Datenschutzerklärung, story 11: the Release must not be cut without it, since „Event löschen“ ships a deletion the policy has to describe), #38 (party hat, stories 44-53), #339/#341 design deliverables (#339's note and artboard are in: `13-countdown.md`, `reference/Countdown.dc.html`), the two sweeps #342/#343, #347–#357.
- Rode the branch without a #332 ticket: #301 (0026), #327 and #329 (ceremony shape, team position), the deploy-check's Session names (retro 0.9), `/implement-spec-max`, docs and skills. None conflicts with the spec.

### Checked and sound (Spec)

#### #333 Event löschen
- Route `DELETE /api/e/:slug` through `changeEvent` with `hostOnly`, `lock: 'update'`, `allowFinished`; answers `{ slug }`; `session_running` uses the same `runningOf` the dock's `runningSessionId` reads, so the dock reason and the server refusal cannot disagree.
- Second delete, a Member's delete and every other Event route answer 410 (`eventAccessRejection` orders `deleted` before `not_host`); a stranger gets 404; Home (`server/api/e/index.get.ts:41`), the invite routes and the deploy check already filter the mark; a slug stays taken (`index.post.ts:77` does not filter).
- Publish is the plain `event.changed` (ADR 0013): `afterCommit` adds nothing else; the integration test pins `['event.changed']`. No Activity entry.
- Dock: `delete` is appended last to `more` in every state including `finished` and `setup`, never in the pill (`dockLayout`); disabled with `dock.deleteBlocked` while a Session runs.
- Sheet copy and hold follow the decision comment (label „Event löschen“, standard „1 Sekunde halten“ hint, no red row); success toasts, drops `HOME_EVENTS_KEY`, `navigateTo('/')`; the page's own refresh is suppressed after success.
- Former Member on the Invite link gets 410 and `InviteEntry` renders „Event gelöscht“.

#### #335 Tags and #336 Tag filter
- `normaliseTag`/`parseTags` as specified (NFC, trim, collapse, `de` lower-case key; 20 graphemes via `characterCount`; 8; duplicates by key; absent `tags` keeps, `[]` clears, `null`/non-array is `invalid_tags`).
- `saveTags` takes the earliest spelling in use, keeps a game's own row label, deletes the rest; `loadTagsInUse` sorts in code; `game_tags` has `created_at`, cascade, key index; migration 0027 additive.
- Tags exist only on `GameView` (library routes, Hosts only); `PoolGame`, `PoolGameFace`, `RoundGame` carry none; the secrecy tests assert it under every visibility rule.
- Form commits a typed Tag before saving and refuses to send if that fails; both error texts match the ticket; suggestions exclude chips.
- Filter: `GameFilters.tag`, search matches labels, `?tag=` normalised, chip in full and compact browser, row order „Alle, Spielerzahl, Passt zu, Tag, Von mir“, stray tag stays selectable and filters to „Nix gefunden.“, „Alle“ clears.

#### #337 / #338 Prices
- Migration 0028: enum, three columns, the three CHECKs (the `IS NOT NULL AND NOT IN` form refuses cents with no source); additive for the 0.9 code (explicit columns).
- `parsePriceAmount` (0 and 1000 → null), `parsePrice` (amount without source, amount with free/Abo, paid source without amount all `invalid_price`), `priceLine` (Berlin day, year only when not current) as specified.
- `priceColumns`: unchanged save keeps the stamp; change or `priceChecked` moves it; `price: null` clears; `priceChecked` with no resulting Price is refused before anything is written; clock is `useClock(event).now()`.
- „Preis stimmt noch“ sends the stored game plus the flag and no `tags`/`price`, so it saves nothing else. (Quality Q2 disagrees on the stale-prop risk; see its entry.)
- Secrecy: `price` rides `PoolGame`, set in `poolGameFace`; faces only when `canSeePoolGames`; open Round, wheel result, Veto window card, clip and Results go through `roundGameView` behind the existing `drawGameKnown`/`windowGameKnown` gates; wheel slices stay `{ id, name }`; not in the feed or the room; tests use a distinct amount per game.

#### #340 Countdown
- `countdownFrame` is a pure function of the facts and the ticker's value: row 7 at once for a viewer at 0:07, tone warning for 10–6 and error for 5–1, scale `1 + (10 − s) × 0.035`, pips = s, paused-in-last-ten keeps pips and scale with the digit colour on paper, done = 0:00, error tile, no lit pip; `m:ss` unpadded.
- Burst only when this component's ticker sampled inside the last second (`sawLastSecond`, cleared on reset), the frame is not 760 ms late, motion not reduced; a viewer who opens after zero, whose ticker was held (off-screen, hidden tab) or who is late gets the steady view; tick is sought to the time spent in the second and skipped at 220 ms or more.
- ADR 0015: Web Animations in `motion.ts`, no GSAP; reduced motion has steps, no tick, no burst, same status text; status region written on view/last-ten/duration changes only (apart from SPEC-1); focus moves to the new first button; height fixed per role and viewport. Changed test literals are only the `m:ss` and bare-second strings (decision 4); the stage order stays (decision 2). (fixes.md calls the stage order a move; see „For the user“.)

#### #328
- `CeremonyPersonCell` with `stack` switching ring, name, border (2.5/2 px) and factor (0.3/0.4) in one place; `teamVar`/`teamSurfaceStyle` are the only spelling of the tokens (`grep 'cp-team-'` finds only `team-style.ts`); `plateSizes` with the other tables under full key names; `useRoomy` in both files; `groupWidth` pinned for 2 Winners wide/phone, 3 wide, grid 4 and 8 wide, grid 3 and 4 phone; `ceremony-layer.test.ts` changes are only the `CeremonyShape` call shape (#327); no changelog line; the orchestrator's before/after browser check was byte-identical.

#### Release hygiene
- Changelog: one line per ticket (#333, #335, #336, #337, #338 under `### Neu`; #340 under `### Geändert`), none for #328; `GLOSSARY.md` has Deleted Event, Tag, Price, Leading Party.
- Migrations 0027 and 0028 are additive and tested; no Worker change; ADR 0007 switch-over reasoning is written in each header (and is right for these two, wrong for 0026 per SPEC-5).

## Quality and architecture review

Count: **0 Must-fix, 7 Should-fix, 8 Note.**

Method: `thermo-nuclear-code-quality-review` over the changed code, `improve-codebase-architecture` scoped to the modules the diff changed, `codebase-design` vocabulary. `CODING_STANDARDS.md`, `GLOSSARY.md` and ADRs 0001–0015 override a generic smell; nothing below contradicts an ADR (ADR 0015 keeps GSAP to the ceremony; the Countdown correctly uses the Web Animations API).

- **Result (Quality).** No structural regression, nothing breaks behaviour (the reviewer did not assess migration 0026; see Standards S1). The two findings with the most weight are Q1 (a second home for dates and UI copy, which `CODING_STANDARDS.md` § One home per concern calls a finding even when it works) and Q2 (the Price confirm path re-sends a stale copy of the whole game).

- **Q1** Should-fix. Price wording and day formats live in `shared/game.ts`, a second home for both. `shared/game.ts:26-37` (`PRICE_SOURCE_LABELS`, German names) and `:289-312` (three module-level `Intl.DateTimeFormat`s, `priceCheckedDay`, `priceLine` with the literals „bei“, „Stand“, „€“). Two homes are bypassed: UI copy goes through `i18n/locales/de.json` (so `test/unit/copy.test.ts` `RETIRED` guards it, and `describeGame` in `app/utils/describe-game.ts` already words the player count and Suitabilities that way), and „Dates and times shown to Users“ go through `app/utils/berlin-time.ts`. Only the app calls `priceLine`/`priceCheckedDay` (GameCard, GameHistory, game page, GameForm); the server never does.
  - Restructure: keep `PRICE_SOURCES`, `priceTakesAmount`, `parsePrice`, `parsePriceAmount`, `formatPriceAmount` in shared (the form and the server both enforce them); move the wording to `app/utils/describe-price.ts` as `describePrice(price, now, t)` with `library.priceSource.<key>` and the line's template in `de.json`, and add the two day formats to `berlin-time.ts` (`formatSetDay` and `formatSlotDay` are neighbours). Result: `shared/game.ts` loses its `BERLIN_ZONE` import and three formatters, and a retired word in a price line is caught by the copy test.
  - Fixed by F2 (fixes.md names `app/utils/price.ts`; see the table note). Standards S3 gives the same finding at `shared/game.ts:28-36`, `:291-293`, `:297-311`.

- **Q2** Should-fix. „Preis stimmt noch“ re-sends the whole game from a possibly stale prop. `app/components/GameForm.vue:222-250` (`confirmPrice`): the PATCH body is rebuilt from `props.game` (name, link, clip, players, Suitabilities, notes, and `https://youtu.be/${…}` spelled out a second time, also at `:41`). Two risks: (1) another Host edited the game since the page loaded, and this press writes the old values back, since the body is „the whole game“ (`[id].patch.ts` replaces every column but tags/price); (2) the next field added to `GameInput` is silently reset to its default by this path unless somebody remembers to extend it. The server-side half is already right: `priceColumns` (`server/utils/library.ts`) does the restamp.
  - Restructure: a route of its own (`POST /api/games/:id/price-checked`, same `requireLibraryViewer` + `canEditGame`, calls `priceColumns({price: undefined, priceChecked: true}, game, now)`), so the button sends no game at all. If the spec fixed „PATCH with `priceChecked`“, keep that contract on the wire but let the server treat a body with only `priceChecked` as the restamp (no whole-game rule). Judgement call: ask the user.
  - Note: the Spec axis calls this path sound („saves nothing else“), and Standards S11 mentions it as a Note. Spec's view covers what the button writes; it does not cover the stale-prop overwrite Quality describes.
  - Follow-up ticket (fixes.md).

- **Q3** Should-fix. The Price group takes 14 bindings out of `GameForm.vue`; extract it like `TagInput`. `GameForm.vue:48-52, 112-135, 205-250, 360-430`: `priceText`, `priceSource`, `storedPrice`, `confirming`, `sourceId`, `sourceErrorId`, `amountless`, a watch, `priceCents`, `priceEntered`, `amountError`, `amountHelp`, `sourceError`, `removePrice`, `confirmPrice`, the `draft.price` branch and about 70 lines of template with its own `<select>` and error span. The form is 492 lines (181 added) and the next field will land in it.
  - Restructure: `PriceField.vue` with `v-model` of `{ amountText, source }`, props `stored: GamePrice | null`, the `attempted` flag, and emits `error` (the one blocker string); the form keeps `draft.price` and `blocker`. `confirmPrice` goes with Q2.
  - Follow-up ticket (fixes.md).

- **Q4** Should-fix. `GameBrowser.vue` now has three copies of the same chip-select (players, Suitability, Tag). `GameBrowser.vue:~137-215` (about 22 template lines each: wrapper, `<select>`, empty option, chevron `AppIcon` with `filters.x !== null ? 'text-paper' : 'text-ink'`). #336 added the third copy rather than the component; the form's Price source `<select>` is a fourth variant.
  - Restructure: `FilterSelect.vue` (`label`, `modelValue: string | null`, `options: { value, label }[]`, optional `strayValue`) and three one-line uses; `onPlayers`, `onSuitability`, `onTag` collapse into one `set` per filter. The stray-Tag option (shows the key, not a label) becomes a prop of the one component.
  - Follow-up ticket (fixes.md; with S7).

- **Q5** Should-fix. `EventCountdown.vue` holds four concerns and three mutable closures in one component. `EventCountdown.vue:95-190` (the report gives 365 lines for this range; Standards S9 and fixes.md give 383 for the file): the ticker/frame, the status region (`announced`, `live`, two watches, one with `flush: 'sync'`), the burst witness (`sawLastSecond`, a `querySelector('[data-cd=…]')` lookup of six parts by string name), and the focus hand-over (`focusPendingSince`, `FOCUS_WAIT_MS`, `press`).
  - Smaller smells in the same file: `pipFill` re-derives the 6 s warning threshold (`frame.s >= 6`, which `countdown-card.ts` owns as `WARNING_UNTIL_S`) and `Array.from({ length: 10 })` re-types `FINAL_FROM_S`; `PILL[...].key` is the view name again (identity); the ghost digit is a literal `1`.
  - Restructure: (a) `countdownFrame` returns `warning: boolean` and `pipCount`, so the template reads the frame and the 6/10 live in one file; (b) `useCountdownAnnouncer(props, frame, now)` returns `live`; (c) the burst parts become template refs (the ghost and stamp are `v-if="done"`, so a `useTemplateRef` per part, read in the post-flush watch) and the bare string list goes; (d) delete `PILL.key`. The component then keeps layout and the `frame` mapping.
  - Follow-up ticket (fixes.md; with S9).

- **Q6** Should-fix. #328's split moved only the person cell; `AwardCeremony.vue` is still 515 lines with its size homes split in two. The standings `<li>` (rank, swatch `<i>`, name, points) is written three times (`:128-148` single card, `:383-405` side/below, `:408-424` chips), the Winner card back/front/stamp three times (single `:100-160`, chain `:236-290`, grid `:325-380`). The Tie sizes moved into `app/utils/ceremony-sizes.ts` (`chainSizes`, `gridSizes`, `plateSizes`, pinned by `ceremony-sizes.test.ts`), but the single card's numbers stayed in the script: avatar 80/64, Compibert 150/120, `344 / 404`, ground 34, `SHARE_ROW_ROOM = 44 + 18`, and the confetti counts 40/20/14/8 (`:67`). So „what changes with `roomy`“ lives in two files.
  - Restructure: `CeremonyRow.vue` (`variant: 'row' | 'chip'`) deletes about 40 lines; add `singleSizes(roomy)` and `confettiCount(roomy, target)` to `ceremony-sizes.ts`; `CeremonyWinnerCard.vue` taking the sizes object (the artboard's single card is the wide chain card without the badge, so check whether one component serves both). Test through the existing `ceremony-layer` and `ceremony-sizes` tests.
  - Follow-up ticket (fixes.md).

- **Q7** Should-fix. `useGameLibrary` carries a fallback for test fixtures. `app/composables/useGameLibrary.ts:24-25`: `tagsInUse: computed(() => data.value?.tagsInUse ?? stale.value?.tagsInUse ?? [])` with the comment „Some fixtures answer the games only“. `GameList.tagsInUse` is a required field, so production code tolerates a mistyped fixture (rule 5: a silent fallback papering over an unclear invariant).
  - Restructure: fix the fixtures (`test/nuxt/*` that stub `/api/games`; a `gameList()` builder next to `memberView()` would keep them honest) and drop the `?? []`.
  - Fixed by F5 (with S8).

- **Q8** Note. Four routes repeat the Tag load. `server/api/games/[id].get.ts:12`, `[id]/image.put.ts:42`, `[id].patch.ts`, `index.post.ts`: `gameView(row, creator, viewer, (await loadTags(db, [id])).get(id) ?? [])`. `gameView` takes `tags` as an argument, so a new route that returns a `GameView` and forgets the load silently answers `tags: []`. Deepen `server/utils/library.ts`: one `readGameViews(db, rows, viewer)` (loads Tags for the given ids, builds the views) that `index.get.ts` and the other four call; `gameView` becomes private. Also `library.ts` now holds access, view builders, Tag persistence (`loadTags`, `loadTagsInUse`, `saveTags`, 50 lines) and Price columns; `server/utils/game-tags.ts` is the natural split when the next ticket touches it (`poolGameView` and friends stay).
  - Follow-up ticket (fixes.md).

- **Q9** Note. `shared/game.ts` went from 275 to 439 lines and holds three families: filters, the input parser, clip/player rules, Tags (`normaliseTag`, `tagProblem`, `parseTags`) and Prices (about 110 lines). Under the limit, but `parseGameInput` now repeats a two-line dance for each optional field (`body.tags === undefined ? undefined : parseTags(…)` then `if (body.tags !== undefined && tags === undefined)`; the same for `price`), because `undefined` means both „absent“ and „invalid“ in the parsers. A small `optional(body.x, parse)` returning `{ ok, value }` makes the third optional field a one-liner. When Q1 moves the Price wording out, split `shared/game-tags.ts` and `shared/game-price.ts` and re-export from `shared/game.ts` only if callers insist.

- **Q10** Note. `COUNTDOWN_BURST_MS` is a second copy of the burst's own length. `app/utils/motion.ts:89` (760) equals `160 + --cp-dur-slower (600)` of track `ringB` only while the token is 600; the tracks are positional 5-tuples `[Element, Keyframe[], number, number, string]` (`:116-124`). `EventCountdown.vue:151` uses the constant to decide whether to play. Let `countdownBurst` return whether it played (`false` when `elapsedMs` is past the longest track it just read), and delete the exported constant; name the tuple's fields (`{ el, frames, delay, duration, easing }`).

- **Q11** Note. `GameForm` now fetches the whole library for Tag suggestions. `GameForm.vue:28` calls `useGameLibrary()`, so the create/edit page runs `GET /api/games` (every game, every Tag) to fill a suggestion list. Fine at today's size and it dedupes by key, but worth a line in the PR description, since the list route has no size bound. If it grows, a `GET /api/games/tags` over `loadTagsInUse` (already a separate function) is the seam.
  - Follow-up ticket (fixes.md).

- **Q12** Note. Two test files sit at the 1000-line line. `test/integration/library.test.ts` 564 → 992, `test/nuxt/game-form.test.ts` 430 → 974, each one `describe`. The next ticket crosses 1k. Split by concern when it does: `library-tags.test.ts`, `library-prices.test.ts`, `game-form-price.test.ts`.

- **Q13** Note. `teamPosition` sits between constants and drags `settings.ts` into two leaf files. `shared/settings.ts:34-37` is a function in the middle of the `TEAM_*`/`GAME_COUNT_*` constants; `shared/team-colors.ts` and `shared/team-marks.ts` (pure data the Share renderer imports) now import `./settings` (and through it `phase`, `board`, `record`) for a one-line clamp. A leaf `shared/team-position.ts` (with `TEAM_COUNT_MAX`'s clamp) keeps them leaves. `useRoomy` (Note Q14) and `teamVar` are fine as one-homes.
  - Follow-up ticket (fixes.md; with S12, Q14).

- **Q14** Note. `useRoomy()` returns `boolean | null`, and every caller writes `roomy.value === true`. `AwardCeremony.vue:45-49` (four times), `CeremonyLayer.vue:49`, while the template uses truthiness. `return computed(() => useMediaQuery(...).value === true)` makes it a `ComputedRef<boolean>` and the five casts go; `chainSizes(roomy: boolean, …)` already wants that. Related: `RunOptions` (`ceremony-run.ts`) and `TieRunOptions` (`ceremony-tie-run.ts`) both redeclare `extends CeremonyShape { grid: boolean }`, and `CeremonyLayer.vue:50-55` builds `shape` and `runShape` as two near-identical objects plus a third pick at `:106`; one `Required<CeremonyShape>`-based type and one computed would do.
  - Follow-up ticket (fixes.md; with Q13, S12).

- **Q15** Note. The delete path is sound; two small seams. `app/composables/useEventMutation.ts:39` special-cases `path === ''` in the URL; `EventHostDialogs.vue:145-160` suppresses the post-delete refetch with a closure flag (`deleted`) because `send` always refetches in `finally`. A `SendOptions.refetch?: false` and a joined URL (`[slug, path].filter(Boolean)`) would remove both. Also `TagInput.vue`: the outcome handling of `tryAdd` is spelled three times (`add`, the comma loop, `onEnter` via `pick`), and `tryAdd`/`options` are pure, so a test through the component mounts a combobox to pin a rule; `app/utils/tags.ts` would give them a direct interface.

### Deepening opportunities

Vocabulary from `codebase-design`. None contradicts an ADR.

1. **Price as one module (Q1, Q2, Q3).** Interface: `parsePrice`/`priceTakesAmount`/`formatPriceAmount` in shared (the rules both sides enforce), `describePrice(price, now, t)` in the app, `priceColumns` on the server. Today the wording is a fourth home inside the rules file. Deletion test: delete `priceLine` from shared and the complexity reappears in the three call sites (GameCard, GameHistory, game page) each building `now`; so it earns its keep, but in the app layer next to `describeGame`.
2. **A game read model on the server (Q8).** `readGameViews(db, rows, viewer)` as the one seam where Tags join a row; depth: five routes lose a load and a `?? []`; locality: the Secrecy rule „only the library carries Tags“ is checkable in one function (`poolGameView` stays Tag-free by type).
3. **The ceremony's sizes as one interface (Q6, Q14).** `ceremonySizes(roomy, layout, winners)` returning `{ stage sizes, plate, groupWidth, compibert, ground, confetti }` replaces four partly related functions plus script constants. `AwardCeremony.vue` would read one object; the test surface is the existing `ceremony-sizes.test.ts` plus the layer tests.
4. **`useCountdownCard(props)` (Q5, Q10).** A deep composable returning `frame`, `live`, and the burst/tick triggers, so the component is layout and a frame mapping. The testable interface is the frame and the announcer (both pure over facts and a sampled time), not the DOM lookups.
5. **`FilterSelect` (Q4).** One adapter-free component; three call sites today, a fourth in the form.

### Checked and sound (Quality)

- **Event delete (#333).** `[slug].delete.ts` goes through `changeEvent(hostOnly, lock: 'update', allowFinished)`; the Running Session check (`runningOf(await eventSessions(tx, …))`) and the `deletedAt` write share the locked transaction; the 410 comes from `loadEvent`/`eventAccessRejection` for every Event route including a second delete; invite routes, Home list (`index.get.ts`), `gameEventsOf` (image route), and `deploy-check` all exclude deleted Events; the dock reason (`useHostActions`) is the server's rule on the client, labelled as such; `HOME_EVENTS_KEY` replaced the literal everywhere.
- **Tags (#335, #336).** `GameView` alone carries `tags`; `PoolGame`, `PoolGameFace`, `RoundGame` do not, so no Event read, feed entry or room message can name one (secrecy standard). Absent `tags` in a PATCH keeps the stored Tags (0.9 tab); `saveTags` runs in the route's transaction; `loadTagsInUse` sorts in JS so PGlite and Neon agree. One `filterGames` serves the library and both pickers; `useRouteFilters` round-trips `?tag=` through `normaliseTag`.
- **Prices (#337, #338).** `priceColumns` is the one place the day moves, and its three DB checks mirror `parsePrice`; migration 0028 is additive, spells out why `IS NOT NULL` is needed in the check, and keeps the 0.9 code correct across the switch-over (ADR 0007); 0027 likewise. `PoolGameFace` carries the price by documented design (#338). Cents stay integers, never floats. (Standards S11 flags a read-before-transaction race in the same function; see there.)
- **Countdown (#340).** `countdownFrame` is a pure function of facts and the ticker's value, so a late viewer needs no remembered state; motion takes tokens through `motionToken` (Standards § Motion); the burst and tick seek to the elapsed time and have steady fallbacks; WAAPI instead of GSAP matches ADR 0015.
- **Ceremony (#327, #328, #329).** `CeremonyShape` replaced five positional arguments at every call site; `GRID_FROM_WINNERS` names the server's default; `teamVar`/`teamSurfaceStyle` are the one place the `--cp-team-N` tokens are spelled (no raw `var(--cp-team-` left in `app/`); one clamp (`teamPosition`) and one Team-name rule (`teamDisplayName`) with a parity test; `CeremonyPersonCell` keeps the artboard's deliberate drift documented; `CeremonyCompibert.vue` (a pass-through wrapper) is deleted.
- **Size rule.** No source file crossed 1000 lines (see Q12 for two test files at 992 and 974).

## Still owed

- Browser check `b340` at e5687a6: pending.
- #334 (Datenschutzerklärung) merges before the Release is cut (S5, SPEC-10).
- The decisions in „For the user“: S1 / SPEC-5 (0026), S14, b336 item 2, #340 decision 2, SPEC-4.
- After the fix pass: F1 to F8 merged into `fix/332-review` (merge sha pending), then the Release PR names 0026.
