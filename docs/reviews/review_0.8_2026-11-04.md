# Review 0.8 „Punkte“ (2026-11-04)

Diff `v0.7.0...a68a7c9`, the tip of `feat/272-punkte`, the integration branch of spec [#272](https://github.com/christried/compies/issues/272). It is a one-spec Release, so per `docs/agents/release.md` § Review, walk-through, retro, this review runs on the integration branch, and its fixes land before PR #281 merges into `staging`. Three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#272 with #256–#261, #273–#280, #282);
- quality with architecture.

Before the review, a three-account browser check of #275–#278 ran on `ee01966` (session 5). Its defects are on the fix list below, marked „browser“.

## Result

- **No Must-fix on any axis.** The Points rules and the Standings (ADR 0014), Corrections, the Tie and the finish under the lock, secrecy, and the migrations 0020–0023 against pre-0.8 data and the switch-over all hold. See each section's „Checked and sound“.
- **All three axes found the same regression:** since #259 a Session's start and end come from the request's clock, but feed entries still come from the database's clock, and the feed's groups compare the two. That is the cause of s5 O1 (F7).
- **The finish checked less than story 53 asks** (spec S2): a Correction that moved the lone lead to another Party did not refuse a stale finish. The user widened the request (F8).

### Fixed before `staging` (three branches on `feat/272-punkte`)

| | Finding | Fix | Branch |
|---|---|---|---|
| F1 | s5 F1 (browser) | A corrected history row with two winners stays legible in the 310 px panel: the „korrigiert“ chip goes into the title line and the Scores get their own line below a 340 px row (container query). | `fix/272-s5-findings` (`haiku`) |
| F2 | s5 F3 (browser) | The winner stamp rides on the row's top edge, about 10 px higher, clear of the digit and the delta pill (the user's call). | same |
| F3 | s5 O4 (browser) | „Letztes Spiel hinzufügen“ no longer shows a second time in „Mehr“ at 1440 px (`dockOnly`). | same |
| F4 | s5 O2 (browser) | The Host's dead end after „Letztes Spiel hinzufügen“ with no Session left: a closable Host notice „Noch n Spiel(e) offen“ with „Session hinzufügen“ (copy approved by the user). | same |
| F5 | s5 F4 (browser) | The Standings block glides instead of jumping 102 px when an open Round's card leaves; a hidden tab moves at once. The INFO line of `standings.mjs` becomes a check. | `fix/272-standings-jump` (`sonnet`) |
| F6 | quality Q3 | Focus stays on the page after „Ergebnis speichern“ (the sheet outlives the card its save removes). | same |
| F7 | standards S1, spec S1, quality Q1 | Feed entries are stamped at or after their request's `now`, keeping their order inside a change. | `fix/272-review` (`sonnet`) |
| F8 | spec S2 | The finish carries the winners the Host saw, and any difference is refused (`standings_changed`). | same |
| F9 | quality Q2 | One `standingsAndEnd` for the read and the finish rule. | same |
| F10 | standards S2, s5 O5 | A 60-character game name without a space wraps in the feed and the Result sheet. | same |
| F11 | standards S3, s3 O3 | The empty-wheel hint no longer names „Mehr“ (copy approved by the user). | same |
| F12 | standards S4 | „Tiebreaker“ is in `RETIRED`. | same |
| F13 | leftover | `useHostActions.ts`'s header comment lists the Tie actions. | same |
| F14 | spec N5 | Home's pill says „Kein Termin“ where the Event page does. | same |

### Fixed after the browser check of the fix round (session 7)

The browser check on `6e02764` passed F2–F14 but for these; each was then fixed on its own branch and checked again in the browser.

| | Finding | Fix | Branch |
|---|---|---|---|
| G1 | #279, F10 | At 390 px a pool game's 60-character name without a space still widened the page by 219 px: the cards grid had no column template below `md`, so its `auto` column grew to the word. It is `grid-cols-1` now. | `fix/272-s6-layout` (`haiku`) |
| G2 | F1 | At 390 px the corrected row with two winners and three Scores clamped the names to 46 px: the phone's row is 358 px, above F1's 340 px breakpoint. The breakpoint is 440 px, so the phone's row takes the panel's layout. | same |
| G3 | s3 F1 | A sheet's sticky footer stopped 20 px above the bottom edge (a sticky box sticks inside its scroll container's padding), and the content showed through. The footer sticks at `-bottom-5`. | same |
| G4 | F5 | At 1440 px a Round card that stays crossed the two-column grid in about one frame (134 px): the blocks' steep `ease-out` over `dur-slow`. The cards glide on `CARD_REFLOW_CLASS` (`ease-io`, `dur-slower`, 43 px per frame at most), and `leaveInPlace` pins a leaver on its exact place, measured once per render, so it fades instead of vanishing. | `fix/272-card-glide` (`sonnet`) |
| G5 | F7 | F7 kept the database's clock when it leads the request's, so an entry written within that lead (1.7 s on dev) before a Session's end landed under „Nach der Session“. Entries are stamped on the request's clock only. | `fix/272-feed-clock` (`sonnet`) |
| — | F4 | Accepted: at 1440 px the notice's copy wraps to two lines beside the chip and the button. | — |

## Decisions (orchestrator and user, 2026-11-04)

- **Winner stamp** (F2): the user chose to lift it onto the row's edge, as in `DS Scoring`, over keeping it or replacing it with the event-page artboard's banner ([#276](https://github.com/christried/compies/issues/276#issuecomment-6638212172)).
- **Dead-end notice** (F4): copy approved by the user; it counts the open games, since Events from before 0.8 that stopped early show it too. Not shown at 8 Sessions, where „Session hinzufügen“ doesn't exist ([#278](https://github.com/christried/compies/issues/278#issuecomment-6638212627)).
- **Finish** (F8, spec S2): the user widened the request to carry the winners.
- **`EventPage.vue` at 494 lines** (spec S3, quality Q8): a ticket, not a fix now. The F5 fix changes the block group the split would move, and the split is a refactor, not a defect.
- **Accepted:**
  - spec N1 (#275: the Host is the only writer);
  - spec N3 (a 0.7 tab open across the switch-over errors until reloaded; the Release goes out on a day without a Session).
- **Spec N4:** the Release PR names the Worker redeploy (`shared/realtime.ts`, `shared/activity.ts`), and the merge goes on a day without a Session. ADR 0013 stays with #260.
- **Refuted:** s5 O6 (the notice's × has a 44 px hit area through `hit-44`). s3 F1 couldn't be decided from the code; the next browser check looks at 390 px.

## To later tickets

| Ticket | Findings |
|---|---|
| [#283](https://github.com/christried/compies/issues/283) Slimmer Event page and composition test | spec S3, Q8, Q9 |
| [#284](https://github.com/christried/compies/issues/284) Deeper stage read and Results modules | Q4, Q7, Q12 |
| [#285](https://github.com/christried/compies/issues/285) One press-and-hold drag; one finish arm in dockLayout | Q5, Q6 |
| [#286](https://github.com/christried/compies/issues/286) Drop the one-pool leftovers after the switch-over | Q10 |
| [#287](https://github.com/christried/compies/issues/287) Server ticker waits for the clock sync | Q11, s3 O2 |
| [#288](https://github.com/christried/compies/issues/288) Nits and small leftovers of 0.8 | standards and quality nits; spec N1, N2, N6, N7 |

## Release 0.8 „Punkte“ – Standards review

Diff: `git diff v0.7.0...a68a7c9` (251 files, 167 commits, tip `a68a7c9` of `origin/feat/272-punkte`). Axis: Standards only. Sources read: `CODING_STANDARDS.md`, `GLOSSARY.md`, ADR 0003/0005/0007/0013/0014, `CLAUDE.md`, `docs/agents/{domain,release,delivery,subagents,implementer-frame,design-handoff}.md`, `docs/design_handoff_compies/{02-components,04-motion,01-tokens}.md`, `eslint.config.mjs`, `knip.jsonc`, and the smell baseline of `code-review/SKILL.md` § 3. Line numbers are at `a68a7c9`. Nothing a tool enforces (typecheck, lint, knip) is reported.

### Result

- **No must-fix.** The one-home table holds for every new write (all through `changeEvent`, instants from `EventChange.now`, bodies through domain parsers, rules in `shared/results.ts`), the secrecy rules hold (every drawn-game read goes through `drawGameKnown` / `stoppedDraws`), the migrations 0020–0023 follow ADR 0007, and the new motion carries its token and a test of curve and duration.
- **Four should-fix**, all small:
  - S1: the feed's groups now compare two clocks (a regression of #259).
  - S2: the longest allowed game name (60 characters, no space) is untested on the 0.8 surfaces, and two of them don't wrap it.
  - S3: the empty-wheel copy names „Mehr“, which the phone dock does not have.
  - S4: `RETIRED` lacks „Tiebreaker“.
- Eleven nits, most of them baseline smells (judgement calls, marked).

Totals: 0 must-fix, 4 should-fix, 11 nit.

### Must-fix

None.

### Should-fix

#### S1. Session start and end now come from the app clock, the feed's `at` still from the database clock, and the feed's groups compare them
- `server/utils/activity.ts:37`: `at: at ?? sql\`clock_timestamp()\``. `recordActivity` receives `now` for every non-instant type but uses it only to decide which games the message may name. `server/api/e/[slug]/sessions/start.post.ts` and `end.post.ts`, and `server/utils/sessions.ts` `closeSessions` (the finish), changed in this diff from `sql\`now()\`` to `now` (the request clock, #259). `app/utils/activity.ts:218` (`groupActivity`) puts an entry in the group where `segment.from <= at && at < segment.to`, with `from`/`to` the Session's `startedAt`/`endedAt`.
- Before, both sides were the database's clock, so an entry written after the start was never earlier than `startedAt`. Now they are two clocks. Failure case (measured in the s5 browser check, O1, constant offset of 1.7 s on the dev machine): the `session_started` entry lands under „Vor dem Start“ and the `event_finished` entry under „Session“ instead of „Nach der Session“. In production the gap is the skew between the Vercel function and Neon minus the few milliseconds between `now` being read and the insert, so it is rare there but real, and it is not testable with the fake clocks of the integration tests (they set one clock).
- Rule: CODING_STANDARDS § Database („A change of an Event takes its instants from `EventChange.now`“): the Session instants follow it, the feed entries of the same change don't, and the code compares them. `drizzle/0020_coin_toss_session.sql:2` states „(nothing compares those any more)“, which is not true of the feed.
- Fix (smallest): in `groupActivity`, handle `session_started` like the existing `session_ended` special case: key it by its `params.sessionId` (the entry that starts a Session belongs to that Session), and let `event_finished` follow the last `session_ended`'s gap. Or stamp the entry with `now` and give the feed a tiebreak for entries of one change (today the order inside a change rests on `clock_timestamp()` being later per insert). Correct the comment in 0020.

#### S2. The longest allowed game name is not tested on the new surfaces, and two of them don't wrap it
- Rule: CODING_STANDARDS § Tests: „A list, a wheel or a count is tested at its edges: 0, 1 and 2 items, and the longest name allowed (`GAME_NAME_MAX`)“ (#263). `GAME_NAME_MAX` is 60 and a name needs no space. The new tests cover 0, 1, 2 and 30 rows well (`game-history.test.ts`, `leaderboard.test.ts`, `result-entry.test.ts`), but their „long“ names are `'Ein sehr langer Spielname, der nicht in die Zeile passt'` (56 characters, with spaces) or Team names. `grep GAME_NAME_MAX test/nuxt` finds nothing. The s5 browser check found the gap (O5), and it is real:
  - `app/components/ActivityFeed.vue:206`: the sentence `span` has `min-w-0 flex-1` but no `break-words` / `[overflow-wrap:anywhere]`, so „Spiel 3: {game}, {list} gewinnt“, „{name} hat Spiel 3 ({game}) korrigiert“ and the existing `game_set` / `game_drawn` lines run out of the panel for a name without a space. The 0.8 entries add two more sentences with a game name.
  - `app/components/ResultEntry.vue:136`: the game name above the rows is a bare `<p class="m-0 font-display text-[22px] leading-tight">` in a 400 px sheet (a phone: the screen). A 60-character name at 22 px display size is about twice the sheet's width; the sheet is `overflow-y-auto`, so it gets a horizontal scroll. From reading; not run.
  - `GameHistory.vue` (`truncate` on the name), the open-Round rows and `EventPageHead.vue` (`break-words`) are fine; `HowWePlayCard.vue` is fixed by `dcba166` (#279).
- Fix: `break-words` (or `[overflow-wrap:anywhere]`, as `GameNotesDisclosure.vue:36` does) on the feed sentence and on the sheet's game line; in `activity-feed.test.ts`, `result-entry.test.ts` and `game-history.test.ts` one case each with `'W'.repeat(GAME_NAME_MAX)` that asserts no horizontal overflow of the row or the sheet (the repo's tests can assert the class; the width itself is for the browser check).

#### S3. The empty-wheel copy sends the Host to „Mehr“, which the phone dock does not have
- `i18n/locales/de.json:104` (`dock.setBlocked.pool_empty`): „Auf dem Rad ist kein Spiel mehr. Unter „Mehr“ kannst du mit „Nächstes Spiel setzen“ eines aus der Bibliothek setzen.“ `app/components/HostDock.vue:55` and `:298`: „The phone sheet has no „Mehr“ step, so it lists them all.“ At 390 px the Host looks for a „Mehr“ that isn't there (s3 O3, confirmed from reading, and the changelog line of #261 promises the hint to every Host).
- Rule: CODING_STANDARDS § Copy: „Copy promises only what the app does today“. The spec did not prescribe the words (#261 says only that a copy line „could point to „Nächstes Spiel setzen““), so it is not a decided string.
- Fix: drop „Unter „Mehr“ kannst du“: „Auf dem Rad ist kein Spiel mehr. Mit „Nächstes Spiel setzen“ setzt du eines aus der Bibliothek.“ It is right at both widths. `dock.test` / `host-dock.test.ts` pin the string if they quote it.

#### S4. `RETIRED` in `test/unit/copy.test.ts` lacks „Tiebreaker“
- `test/unit/copy.test.ts:109-113`: `RETIRED` holds three words. `GLOSSARY.md` dropped **Tiebreaker** and **Tiebreaker pool** in this diff and lists „Tiebreaker“ as `_Avoid_` on **Tie**. They were UI words („Tiebreaker-Pool“ in the stepper, the summary and „So wird gespielt“; 0.7 copy).
- Rule: `docs/agents/domain.md`: „When the glossary retires a UI word, add it with its successor to `RETIRED` in `test/unit/copy.test.ts` in the same change, so the copy can't fall back to it.“
- Caveat: the retired-words test also scans `## [Unreleased]`, and two lines there name the removal on purpose (#279 „Entfernt“, #280 „Den Tiebreaker-Pool nennt sie nicht mehr“). Adding `'Tiebreaker': 'Gleichstand / Unentschieden'` as is turns the test red.
- Fix: add the entry and scan only `entries` (the locale file) for it, e.g. a second map `RETIRED_IN_COPY_ONLY`, or reword the two changelog lines without the word. The legal text names the pool no more (checked: `grep -i tiebreaker i18n/locales/de.json` finds nothing).

### Nit

- N1. **Duplicated Code (judgement), the team's display name.** `teamName(teams.find(team => team.position === position) ?? position, t)` is spelled nine times: `EventPageHead.vue:69`, `GameHistory.vue:28`, `Leaderboard.vue:37`, `ResultEntry.vue:54` (variant), `useStandingsNews.ts:42`, `app/utils/activity.ts:129` and `:142`, and the older `GameBoard.vue:49`, `VetoWindow.vue:54`, `event-page.ts:169`. Six are new in this diff. Fix: one `teamNameAt(teams, position, t)` in `app/utils/board.ts` next to `teamName`.
- N2. **Duplicated Code (judgement), `type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish' | 'now'>`** is declared in `coin.ts`, `finish.ts`, `last-game.ts`, `results.ts`, `rounds.ts` and `vetoes.ts` (`clip.ts` and `countdown.ts` have a shorter variant). Export one alias from `event-access.ts`.
- N3. **Duplicated Code (judgement), the Results join and the Standings fold.** `server/utils/finish.ts:23-37` (`readResultPlaces`) repeats the `round_places` ⨝ `rounds` read of `readEventRows` (`event-read.ts`), and `readEnd` (`finish.ts:46`) repeats `standingsOf(totalPoints(…))` + `endOf(…)` of `resultsSection` (`stage-read.ts`). The finish needs its own read under the lock, so the SQL may stay; the fold is one pure function (`standingsAndEnd(groups, settings)` in `shared/results.ts`) that both would call. Two places that must agree on „who leads“ decide whether the dock offers „Event abschließen“ or „Unentschieden beenden“.
- N4. **Duplicated Code (judgement), the row drag.** `app/composables/useRowDrag.ts` repeats the press state machine of `useBoardDrag.ts` (`listen` / `unlisten` / `finish` / `start` / `onMove` / `end` / `onUp` / `onCancel`, about 60 lines) and imports only its three constants. The two differ in what they track (a zone, an index) and in Escape handling. A shared `usePointerPress({ onPickUp, onMove, onEnd })` would hold the machine once. Judgement: two copies of a small machine, tested separately.
- N5. **Duplicated Code (judgement), `recommendedPoolSize` and `poolHint`** (`shared/settings.ts:150` and `:165-166`) both compute the Vetoes of all Parties and the possible last game. `poolHint` can take both from one helper; today a change of the formula needs two edits and a test would not see a difference between them.
- N6. **Duplicated Code (judgement), `readShownToss`** (`server/utils/coin.ts:68`) repeats `readLatestToss` (`:21`) inline, with an extra `eventId` filter that a Session id already implies. Call `readLatestToss(db, running.id)`.
- N7. **Repeated Switches (judgement), the page kind.** `finished` added an arm to `pageBlocks`, `pagePill`, `startedIn`, `unevenNoticeIn`, `cardsStandOutIn`, `pollCompactIn` (`app/utils/event-page.ts`), `hostDockState` and `dockLayout` (`host-dock.ts`), and `EventPageHead.vue`. The file's own header says one list decides; it is now eight switches on one type. A table keyed by `kind` (`{ blocks, pill, started, unevenNotice, standOut, compact }`) would make the next kind (the 0.9 ceremony) one entry. Not for this release.
- N8. **Weaker guard (judgement), `ACTIVITY_NAMES`** (`shared/activity.ts`). The two exhaustive maps `ACTIVITY_PEOPLE` / `ACTIVITY_GAMES` („a type without an entry here does not compile“) became one optional-keyed map. An entry type that carries a game id in its params and is not registered now names no game (the sentence is `null`), which fails closed, but the compile-time prompt to decide it is gone, and CODING_STANDARDS § Secrecy relies on every entry that names a game going through `stoppedDraws`. Consider keeping the exhaustiveness (`{ [T in ActivityType]: … }` with an empty `{}` for the types that name nothing).
- N9. **Naming against the glossary (judgement).** `app/components/Leaderboard.vue`, `leaderboard.test.ts` and the comments „both Leaderboards“ use a word `GLOSSARY.md` lists under `_Avoid_` for **Standings**. The name comes from the design hand-off (`02-components` § Leaderboard) and has its lint exception (`eslint.config.mjs`), so this is a documented trade-off. `StandingsTable.vue` is two words, needs no exception and uses the glossary's term; `docs/agents/domain.md` asks for the glossary's word „in a test name“ and a refactor proposal. Cost: the hand-off mapping.
- N10. **Raw colour (judgement).** `Leaderboard.vue:237` (the winner stamp) writes `#151515` twice (`border-[#151515]`, `text-[#151515]`); the tokens have `--cp-on-primary` (which is `#17121d` in dark) and the comment says the stamp is fixed ink in both modes (`DS Scoring`). Precedent: `CoinFlip.vue` and the construction components. Fine as a deliberate fixed ink; if a third place needs it, a `--cp-ink-fixed` token.
- N11. **Hint lines outside `NoticeBanner` (judgement).** `EventRounds.vue` (`rounds.hostEnters`, a `<p class="m-0 text-small text-ink-2">` under each open Round), `ResultEntry.vue` (`result.help`), and the empty lines `table.empty` / `history.empty` are plain `<p>`s. CODING_STANDARDS: „A notice, hint or error line in a page → `NoticeBanner` with its tone.“ These are captions and empty states rather than banners, and the roadmap prescribes the text, not the element, so it is a judgement call; `EmptyState` (with its Compibert) is the existing component for an empty list.

Also, from the leftover (see below): `app/composables/useHostActions.ts:8` header comment lists „Event abschließen“ but not „Unentschieden beenden“ and „Letztes Spiel hinzufügen“. One line.

### Leftovers confirmed or refuted where the reading touched them (not new findings)

- **s3 F1 (a strip under `AppSheet`'s sticky footer at 390 px): not decidable from the code, and the reading finds no defect.** `AppSheet.vue:60`: the footer is `sticky bottom-0 -mb-5` inside a `p-5` scroll container; a sticky offset is measured from the scrollport's edge, so the footer sticks flush, and `-mb-5` makes it flush at the end of the content. The s3 report itself says the strip was mostly the Nuxt devtools pill. Leave it to a browser look at the `full` variant (the 0.8 result sheet is its only user).
- **s3 O1 (clip entry animation) and O2 (wheel at 0° and the coin's pose for ~0.3 s on reload):** not touched by my reading (not read in depth; outside the Standards axis).
- **s3 O3 (the empty-wheel hint names „Mehr“): confirmed, now S3.**
- **s5 O1 (feed group label compares the DB clock with the app clock): confirmed, with the cause, now S1.** The cause is the diff's own: Session start and end moved to the request clock (#259) while `recordActivity` kept `clock_timestamp()`.
- **s5 O5 (a long game name without spaces does not wrap in the 1440 feed): confirmed, now S2** (`ActivityFeed.vue:206`), and the same defect sits in `ResultEntry.vue:136`.
- **s5 O6 (the notice's × is a 16 × 16 px button): refuted as a defect.** `NoticeBanner.vue:62` gives the button `hit-44`, whose `::after` is at least 44 × 44 px (`compies-theme.css:205`); the browser measured the 16 px glyph box, not the hit area.
- **s5 O7 (a stale page heals itself) and O4 (two „Letztes Spiel hinzufügen“ at 1440):** not in my axis; O4 is in the being-fixed list.
- **s5 F2 (60-character game name widens „So wird gespielt“ at 390): fixed** by `dcba166` (`HowWePlayCard.vue`, `min-w-0`), confirmed in the diff.
- **s2 browser notes:** 4b (reduced motion is a ~1.2 s fast turn and a 0.2 s removal fade, where the brief said „same times“) is correct against `04-motion.md` § Lucky Wheel („Reduced: spin = calm 1.2 s … remove = fade 0.2“), so refuted as a defect. The other notes (4a, 4c–g) are observations outside the Standards axis.
- **`app/composables/useHostActions.ts` header comment does not list the Tie actions: confirmed** (line 8; the nit above).

### Checked and sound (so nobody re-traces it)

- **One home, row by row (CODING_STANDARDS table).**
  - Every new write handler (`finish.post.ts`, `last-game.post.ts`, `rounds/[id]/result.put.ts`) goes through `changeEvent` with `hostOnly` and `lock: 'update'`; no `.transaction(` in `server/api/e/**` (lint).
  - `useClock` appears only in reads and in `changeEvent`; the instants of Results, finish, last game and Session start/end are `EventChange.now`.
  - Bodies go through `parseResultBody` / `parseFinishBody`; the rules live in `shared/results.ts` (`resultShapeValid`, `scoreValid` with `characterCount`, `finishRejection`, `lastGameRejection` with `GAME_COUNT_MAX`) and the sheet reads the same functions (`result-draft.ts`).
  - `addLastGame` writes `events.gameCount` itself instead of `applySettingsChange` and says why (the rule is the whole check); `lastGameRejection` carries the maximum.
  - The finish's `closeSessions` / `withdrawSession` / `onSessionEnded` are one home each; `endSession` and the removal route call them.
  - Notices go through `NoticeBanner` (the countdown sheet's two `<p>`s of 0.7 N3 became banners, `EventSeatNotice`, `EventSetupNotice`, the tie banner, the correction note).
  - Dates: nothing new formats a date by hand.
  - API errors: `apiErrorKey` / `CODE_COPY` got `wrong_phase`, `results_missing`, `standings_changed`, `no_tie`, `round_not_open`, `invalid_result`; `useEventMutation.quiet` is the one way to treat a code as „already done“.
- **Secrecy (CODING_STANDARDS § Secrecy).**
  - `resultsSection` lists a Result's game only through `drawGameKnown`; the feed's `result_entered` / `result_corrected` name games through `ACTIVITY_NAMES` → `namedGames` → `stoppedDraws`. Tests: `results.test.ts`, `hidden-wheel.test.ts` (a Result names only the set game).
  - The only other `stopAt <= now` is `settle.ts` (`dueDraws`), which decides what to settle, not what a viewer may know; `draws.ts` and `pool-preview.ts` hold the one visibility comparison.
  - Standings and the count of Results are not derived from secret rows: a Round can only get a Result once it is set, which is at or after its stop.
  - Every `event_pool_games` reader filters `pool = 'main'`, so a Tiebreaker row the 0.7 code writes during the switch-over is read by nothing (the s2 browser check inserted one).
  - Datenschutzerklärung: Places and Scores, the Event's end and the feed sentence are in § Events; the wording was approved by the user on 2026-11-04 (comments on #280), and `legal-pages.test.ts` pins it.
- **Database.** 0020–0023 add only (plus the one data `DELETE` in 0021); each header says what the 0.7 code writes during the switch-over and why the new code stays correct (ADR 0007). Indexes: `coin_tosses (session_id, started_at)` in 0020; `round_places` joins on its primary key's prefix; `rounds (event_id, number)` is unique. `events.finished_at` has no index because nothing filters on it in SQL (Home filters in code). The three FK columns left unindexed (`vetoes.user_id`, `bonus_vetoes.granted_by`, `coin_tosses.tossed_by`) carry a comment that cites `activity.actor_id`. `pool_kind` keeps `tiebreaker` for lack of a safe `DROP VALUE`, with a comment.
- **Motion.** `deltaPop` (0.42 s, `--cp-ease-pop`, 0.3 s delay), `winnerStamp` (0.48 s, 0.52 s delay, `--cp-ease-snap` as `DS Scoring` draws it), `highlightRow` (0.2 s, linear), the rows' glide (`transition-transform dur-slower ease-spring`, stagger 40 ms), the count-up (`power2.out`, `--cp-dur-slower`, at most 15 writes a second) and the reduced twins match `04-motion.md` § Leaderboard; `leaderboard.test.ts` asserts duration, delay and easing, `cp-num.test.ts` and `count-up.test.ts` the curve and the tick, and the count's landing on the final number is tested. `dur-*` now sets the transition only, with `motion-utilities.test.ts` as its seam; I found no element that combined `dur-*` with `animate-*`. `useServerTicker` follows 04-motion's off-screen pause (rootMargin 120 px) and says where it deliberately doesn't (the coin overlay, the Veto bar).
- **Copy and glossary.** UI words follow the glossary: Ergebnis, Platz, gleichauf, Score, Tabelle, Rang, korrigiert, Event abschließen, Unentschieden beenden, Letztes Spiel hinzufügen. Counted messages all carry a singular form (`copy.test.ts` „counted copy“ is green by construction). The Unreleased groups are in order (`Neu`, `Geändert`, `Behoben`, `Entfernt`), every line ends with its issue link, and each user-visible change I traced has a line (Results, Standings, Corrections, finish, Tie, motion, Home, „Kein Termin“, Datenschutz, the pool's removal, the nits of #261/#268).
- **Tests.** Members are built with `memberView()` (`event-page-composition`, `stage-wheel`, `veto-*`); the edge cases 0, 1, 2 and 30 rows exist for the history, the Standings, the sheet and the dock; the grown read sections are asserted by `toMatchObject` or `STAGE_KEYS` (`rounds.test.ts`); the Results' secrecy has its own integration cases.
- **Design hand-off.** `ResultEntry` (drag list, arrow buttons with live region, „gleichauf“, correction mode), `Leaderboard` (table semantics, polite announcement, side panel tab and stage block, phone tab) and `GameHistory` follow `02-components`; „Compibert cheers“ is left out by the roadmap's decision. The roadmap says all 0.8 UI is own build from existing artboards, so no Claude Design hand-off was owed (`docs/agents/design-handoff.md`).
- **ADRs.** 0003 (UTC): `finished_at`, `result_at`, `corrected_at` are `timestamptz`. 0005: no new Vercel API. 0007: see Database. 0013: finish and last game broadcast `event.changed` (nothing secret). 0014: the code matches its consequences (no pool, Tie warning, +1 in the recommendation, `game_count_range` at the maximum).
- **Housekeeping.** All 124 non-merge commits are Conventional Commits in English with the attribution line. No email address or id of a User in the diff, outside the published contact address and `@dev.compies.invalid` fixtures. Scripts are `node`.

## Release 0.8 „Punkte“ — Spec review (spec #272 and tickets #256–#261, #273–#280, #282)

Diff `v0.7.0...a68a7c9`, read against #272, its 15 tickets and every decision comment on them (the s5 findings F1, F3, F4, O4 and the Host's dead end after „Letztes Spiel hinzufügen“ are being fixed and are not repeated).

### Result

- **No Must-fix.** The Points rules, the Standings, the Result and the Correction paths, the Tie and the finish, the read-only rule, the migrations and #282's Home rule all hold, on the code and on the paths a second request can take (traced below under „Checked and sound“).
- **Secrecy holds.** Every place that names a game for a Result (the history, the feed entry and its room message, the Event read) goes through `drawGameKnown`/`stoppedDraws` or through the set Round, and a Round with a Result is set by construction. `standings`, `end` and the rank/points carry nothing about an unset game.
- **Three Should-fix.** The feed's group headers compare two clocks since #259 (a regression, confirms s5 O1); story 53's refusal is narrower than its sentence; `EventPage.vue` is 494 lines against #257's „under 400“.
- **Not fixed by the spec's own words:** story 78 („0.8 to need no Worker deploy“) is not true of the merge; it is accepted in the ticket comments, and the Release PR must say so (see Nit N4).

### Must-fix

None.

### Should-fix

#### S1. The feed's group headers compare the database clock with the app clock, so „Session gestartet“ and the finish entry land in the wrong group (regression of #259; confirms browser-report-s5 O1)

- **Where:** `server/utils/activity.ts:44` writes every entry's `at` with `sql\`clock_timestamp()\`` (database clock). Since #259 `start.post.ts` and `end.post.ts` (and `closeSessions`, `server/utils/sessions.ts:72`) stamp `startedAt` / `endedAt` with `EventChange.now` (the app clock). `groupActivity` (`app/utils/activity.ts:194–221`) places an entry by `segment.from <= at < segment.to` against exactly those Session instants.
- **Spec lines:** #259 „stamp a Session's start and end with `useClock(event).now()` instead of the database's `now()` … as ADR 0013 says for every instant a rule compares“; #272 story 58/59 „keep the history and the Activity feed … the Activity feed to name the winner … so that the end is recorded“ (the finish entry belongs under „Nach Session n“); #277 „the feed gets only `event_finished`“.
- **Failure case (measured in s5):** the `session_started` entry's `at` is a few ms after the start in the same transaction. In 0.7 both came from the database, so `at >= startedAt` always held. Now, when the database clock lags the app clock by more than the few ms between the request's `now` read and the insert, the entry's `at < startedAt` and it sits under „Vor dem Start“ instead of „Session n“. `event_finished` is written in the finish's own transaction right after `endedAt = now`; with the same lag it lands in the ended Session's group, not in „Nach Session n“. s5 saw both on dev at a constant 1.7 s skew. `session_ended` is the only type `groupActivity` already pins to its Session by id (`closed`), which shows the author knew the boundary is fragile. On production the skew is unknown; any lag larger than the in-transaction gap trips it, and no test uses a clock that differs from the database's.
- **Fix:** do not compare the two clocks. In `groupActivity`, key `session_started` (it carries `sessionId`) to that Session the way `session_ended` is keyed, and key `event_finished` to the segment after the last started Session's end; compare `at` only for the entries that have no Session of their own. A test with a clock 2 s behind and 2 s ahead of the Session instants. (Stamping `at` from `now` would break the entry order inside one change, which `clock_timestamp()` exists for.)

#### S2. The finish carries only winner-or-tie, so a Correction that changes the sole winner is not refused (story 53 is wider than its rule)

- **Where:** `shared/results.ts:171–180` (`outcomeOf`, `finishRejection`); `parseFinishBody` takes `{ outcome: 'winner' | 'tie' }`.
- **Spec lines:** story 53 „I want a finish refused with the reason when the Standings changed since I looked (a Correction in another tab made or ended a Tie), so that I never close the Event on Standings I didn't see.“ #272 Further Notes „the finish request carries the outcome the Host saw“; #277 „`standings_changed` (the outcome the Host saw is no longer the Standings' outcome)“.
- **Failure case:** Event complete, Party A leads alone. The Host holds „Event abschließen“ on a stale tab; in another tab a Correction makes Party B the sole leader. `outcome: 'winner'` still equals `outcomeOf(end)`, the finish passes, the feed says B won, and the Host closed the Event for good on a table he had not seen. The same for a Tie whose members changed (A+B becomes A+C). The spec's rule and the story disagree; the rule was implemented as written.
- **Fix (user's call, it widens the spec's request shape):** send the `winners` the Host saw (`leadersOf(standings)`) with the outcome and compare it with the Standings under the lock; keep `outcome` for the held label. `standings_changed` stays the one reason.

#### S3. `EventPage.vue` is 494 lines; #257's acceptance says „under 400“

- **Where:** `app/components/EventPage.vue` (`wc -l` = 494). #257 landed it at 399; #274–#278 added the Standings, the history, corrections, the finish/tie handlers and the live region.
- **Spec line:** #257 „The page is under 400 lines, and the existing component and page tests pass.“ (the end state review 0.7 Q6 asked for; 0.8 was meant to add stage pieces without regrowing it).
- **Fix:** move the stage's `TransitionGroup` with the block switch (the `v-else-if` chain) into one `EventStage.vue` that takes `data`, `pageState`, `news`, `corrections`, and the actions; the page keeps the shell, dock and tabs. Block types stay in `pageBlocks`.

### Nit

#### N1. A stale „Ergebnis eintragen“ sheet silently becomes a Correction (story 15 only half holds)

- **Where:** `server/utils/results.ts:25` (`if (round!.resultAt !== null) return correctResult(…)`); `shared/results.ts:149–153`.
- **Spec lines:** story 15 „saving to fail with the reason when the Round is no longer open“; #273 „A Round that already has a Result is refused (`round_not_open`) in this ticket; 0.8-03 (#275) turns that case into a Correction.“
- **Case:** the Host enters a Result in tab 1; tab 2 still shows the open Round and saves a different order. It is accepted as a Correction (marked „korrigiert“, feed `result_corrected`), no toast, no confirm. An identical retry is correctly a no-op (good). The s3 check's „second-tab race → `round_not_open`“ was true before #275 only. Accepted by #275; the Host is the only writer. If it matters: the entry sheet could send the Round's `resultAt: null` expectation and the server refuse a mismatch.

#### N2. `rounds` and `results` of the Event read come from two statements, so one read can list a Round as open and with its Result

- **Where:** `server/utils/event-read.ts:68–94` (`roundDraws` and `resultRows` are two queries in one `Promise.all`, i.e. two snapshots).
- **Spec line:** #261 / #274 decision „Spec N6: `readEventRows` reads Rounds and draws in one statement … so a draw is never seen without its Round“ (only the draws were folded).
- **Case:** a Result commits between the two statements: the Round shows in „Gerade dran“ with „Ergebnis eintragen“ and in the history, and `end.played` is one ahead of the open list, until the `event.changed` refetch that the same commit triggers. One frame, self-healing. Fix if wanted: select the Places in the Rounds statement (left join `round_places`), as the draws were.

#### N3. A 0.7 tab open across the switch-over throws on `pools.tiebreaker`

- **Where:** `shared/event.ts:114` (`EventPools` has only `main`); 0.7's `HowWePlayCard.vue` lists `props.pools.tiebreaker` and `einstellungen.vue` calls `view.pools.tiebreaker.filter(…)`.
- **Spec line:** #272 Schema „The 0.7 code serving during the switch-over … the new reads ignore it“ and migration 0022's note on what a 0.7 tab reads; 0021's header lists the server side only.
- **Case:** a Host's or a preview-on Member's tab that stayed open polls the new read, gets `pools: { main }`, and the 0.7 render reads `undefined.length`; the page errors until reload. The no-Session-day rule makes it unlikely. Cheapest remedy if wanted: one line in the 0021 header; keeping `tiebreaker: []` in the read for one Release would cure it but contradicts „reads know only the Game pool“.

#### N4. Story 78 („no Worker deploy“) is not what the merge does; ADR 0013 still says otherwise

- **Spec lines:** story 78 „I want 0.8 to need no Worker deploy, so that the Release can go out on any day without a Session“; Further Notes „No Worker deploy: every live update is the existing `event.changed` relay.“
- **Fact:** `shared/activity.ts` (three new types) and `shared/realtime.ts` (five messages deleted) are in `realtime-deploy.yml`'s paths, so the push to `staging` redeploys the staging Worker and the merge to `main` redeploys the production Worker (every socket drops; the game-day guard applies). No Worker code changed and the Worker relays by `type` string only (`realtime/src/room.ts:157`), so an old Worker passes the new activity types and a new Worker passes 0.7 messages: both orders of deploy are safe. #258 and #273 recorded this.
- **To do:** the Release PR must say it (story 79 asks it to name the migrations anyway), and the merge goes on a day without a Session (`docs/agents/release.md` § No game days). ADR 0013 lines 12 and 18 („no game data in 1.4“, „messages carry it as an explicit instant“) are still stale; that is #260, `ready-for-human`, not part of this branch.

#### N5. Home's pill says „Läuft“ for an Event the page calls „Kein Termin“, and #282 now keeps such an Event on Home for good

- **Where:** `app/components/HomeEventCard.vue:67` (`<PhasePill :phase="event.phase" />`); `server/domain/home.ts:44–48`.
- **Spec lines:** story 60 „the Phase pill „Beendet“ on a finished Event, on its page and on Home“ (met); story 61 „an Event whose Sessions are over but that isn't finished to no longer look finished“ (met on the page, and on Home it shows „Läuft“, not finished).
- **Case:** a running Event with a Result whose Sessions are all over: page pill „Kein Termin“ (grey), Home card „Läuft“, listed until the Host finishes it. Consistent with the rule as decided; only the word differs between the two screens.

#### N6. Process and tooling ride in the Release diff

`.github/workflows/ci.yml` (`push: branches: ['**']`), `scripts/ci-wait.mjs`, `.claude/skills/*`, `docs/agents/*`, `scripts/browser/standings.mjs` (the last is asked by #276 decision 6). None is in #272. They change what runs on every pushed branch and which docs agents read; the Release PR should list them apart from the product changes so the user approves them knowingly.

#### N7. A retried finish whose first answer was lost reads as a failure

`server/api/e/[slug]/finish.post.ts`: the second `POST /finish` answers `wrong_phase` (409), and the client shows „Das geht nicht mehr. Die Seite zeigt den neuen Stand.“ although the Event is finished. Story 54 asks idempotency for the last game only, and that is met (`results_missing`, quiet). Optional: treat `wrong_phase` after a finish the page can see as done, as the last-game path does.

### Leftovers: confirmed or refuted where my reading touched them

- **s5 O1 (feed group label compares the DB clock with the app clock): confirmed, and a regression of #259.** See S1.
- **`useHostActions.ts` header comment: confirmed.** The prose at lines 7–12 lists „Event abschließen“ but not „Unentschieden beenden“ or „Letztes Spiel hinzufügen“; the `HostActionHandlers` interface and `HostDockState.primary` docs do list them. One sentence.
- **s3 F1 (a strip under `AppSheet`'s sticky footer at 390 px): not confirmable from code.** The footer is `sticky bottom-0 … -mb-5` inside a `p-5` scroll container (`AppSheet.vue:64–66`), flush by construction, and the s3 note itself says the screenshot's strip was mostly the Nuxt devtools pill. `ResultEntry` uses it with `full`, no extra spacing. Leave it to the browser walk-through.
- **s3 O1–O3:** not touched by the spec reading (O1 the clip's missing `appear`, O2 the 0.3 s reload pose, O3 the A8 hint naming „Mehr“); all predate the Release.
- **s2 browser-report notes:** the four notes (clip opens 0.5 s after the stop, reduced-motion turn, invented names on a Hidden wheel, the veto bar drains) match #229/#230/#231 as built; none touches #272.
- **s5 O5 (long game name without spaces in the 1440 feed), O6 (the notice's × is 16 × 16 px), O7:** not spec items; O5 is the feed line not wrapping, O6 a hit target, both client-only.

### Checked and sound (so nobody re-traces it)

**Points and Standings (ADR 0014, GLOSSARY § Results)**
- `shared/results.ts`: `resultShapeValid` accepts 1,1,3 and 1,2,2 and refuses 1,1,2, 2,2,3 and 1,3,3, a missing or doubled team, a team outside 1..n, a non-integer, a Score over 7 graphemes or untrimmed; the body parser trims and maps empty to null. `pointsForPlace` gives a Shared place the better Place's points by construction; `standingsOf` ranks `1 + Parties with more points`, sorted by points then team; `winnersOf` is Place 1; `nextRoundNumber` is max + 1.
- `endOf`: `complete = played >= gameCount`, `tie` only when complete and more than one holds rank 1. `played`, the Standings and `end` are all computed from the Rounds with a Result (`rows.results`), so they cannot disagree with each other. The Points table, team count and Selection mode are locked once the Event runs (`LOCKED_WHEN_RUNNING`), so stored Places can never meet a different table or team count.
- The Game count floor stays „the Rounds started“; a Round with a Result cannot be put back (`putBackRound`, `rounds_result_stands_check`); so `played <= started <= gameCount` and a complete Event has no Round being drawn, waiting for a respin or open.

**Results, Corrections (story 1–18, 37–43)**
- `enterResult` runs under the Event lock (`changeEvent … lock: 'update'`) after the due draws are settled; the Round is looked up among the Event's own Rounds (no other Event's Round id works); the number comes from the locked read and the unique `(event_id, number)` backs it. Two concurrent saves: the second sees `resultAt` and answers 200 as a no-op (same body) or as a Correction (different body, N1). No gaps, no number reuse.
- A Correction keeps the number and `resultAt`, replaces the Places whole in one transaction, sets `correctedAt` on every changing save and never clears it, writes one `result_corrected`; an unchanged save writes nothing (`sameResult`).
- The refusal order of #272 holds for the Result (`not_host` from `loadEvent`, then `not_set_up`, `wrong_phase`, `round_not_found`, `round_not_open`, `invalid_result`); a finished Event answers `wrong_phase` before the rule (default-deny), as #277 decision 1 says.

**Tie and finish (story 44–54)**
- Both writes read the Standings after the lock (`readEnd(tx, …)`), so a racing Correction, Result, last game or finish is serialized; a finish after a finish gets `wrong_phase`; a last game after a last game gets `results_missing`; a `'tie'` finish on an incomplete count gets `results_missing` (decision 1 on #278), on a sole leader `standings_changed`; `'winner'` during a Tie gets `standings_changed`. `game_count_range` only at 30, 400 as the settings code. The 409/400 map in `shared/errors.ts` matches the decisions.
- `finishEvent` sets the Phase and `finishedAt` from `now`, ends the Running Session with `onSessionEnded`, withdraws every unstarted Session through the same `withdrawSession` the Host's removal uses (a dated one stays as a removed row with its notice and gets its calendar sequence raised; an undated one is deleted), never calls `changeSessions` (so the Phase is not overwritten), writes only `event_finished`. The Date poll closes because `datePollOpen` is true only in the Phases `poll` and `running`. A started Session always exists (a Result needs a Round, a Round a Running Session).
- Read-only (story 62): `changeEvent` refuses every write with `wrong_phase` unless `allowFinished` (only `rotate`); the routes that do not go through it are reads, the Invite join (works by design) and `room.post`. The slot and Session routes go through `changeEvent` via `changeSlots`/`changeSessions`. A guard test lists every write route.

**Secrecy (CODING_STANDARDS § Secrecy)**
- `resultsSection` filters each Result with `drawGameKnown({ isHost, draw: the set draw, now })`; the feed's `result_entered` / `result_corrected` name a game only through `namedGames` (`stoppedDraws` + the Round's set game); `activity.added` for them is built by the same `activityEntries`. No new comparison of `stopAt` exists (grep: only `pool-preview.ts:41` and `draws.ts:14`). A Result can only be entered on a set Round, so its game is already public.
- Standings, ranks, points, `end.tie` and `end.played` name no game. Host-only `end.finish` / `end.lastGame` are null for everyone else. No new room message exists; the five removed ones (`round.set`, `round.putBack`, `round.spun`, `countdown.changed`, `coin.tossed`) have no listener left, and the coin's side and the spin's placeholder labels no longer ride the room.
- The Datenschutzerklärung wording of #280 is in `de.json` word for word (Runde/Ergebnis sentence, the feed sentence, the visibility sentence with „Wer ein Veto eingelegt hat, sieht bis zum Aufdecken nur das eigene Team“, notes, retention), plus the approved sentence on `finished_at`; the three „oder Tiebreaker-Pool“ passages are gone; `Stand: 4. November 2026` must equal the cut day (set it at the version cut).

**Migrations (CODING_STANDARDS § Database, ADR 0007)**
- 0020: nullable `coin_tosses.session_id`, FK with cascade, index `(session_id, started_at)`; the 0.7 code inserts without it (NULL) and its tosses show in no Session, documented, on a no-Session day.
- 0021: deletes `pool = 'tiebreaker'` rows only; the enum value stays; every new read and write filters `pool = 'main'` (`eventPools`, `gameEventsOf`, `readGamePool`, `applySettingsChange`); a stray 0.7 row is ignored (tests in `event-pools`, `event-settings`, `drop-tiebreaker-pools-migration`). It is the one irreversible step: the Release PR must name it (story 79).
- 0022: all new columns nullable, the checks pass on NULLs (`number IS NULL = result_at IS NULL`), the unique `(event_id, number)` ignores NULL numbers, `round_places` is a new table (PK `(round_id, team)` serves the join), the three Activity types are added without being used in the same migration (as 0016). No pre-0.8 row violates any new check; the 0.7 code never writes a Result, so none can exist before the new code serves.
- 0023: nullable `events.finished_at`; the check `finished_at IS NULL OR phase IN ('finished','archived')` passes for every existing row; the 0.7 code never writes the Phase `finished`. Journal order and `when` are monotonic.

**#282 (Home on pre-0.8 Events)**
- `eventStaysOnHome`: a finished Event stays 24 h from `finishedAt` (inclusive), a `running` Event with at least one Result stays until finished, anything else keeps `staysOnHome`. Every Event played before 0.8 has no Result and so keeps today's 24 h rule; a 0.7 Event the Host continues in 0.8 joins the new rule only from its first Result. `finishedAt` is not on the Home wire. Tests cover 3 days / 23 h / 25 h and the no-Result case.

**Other tickets**
- #256: `stageSections`, `viewInstants`, `GAME_ACTIONS`, `eventHasWheel`, `shared/stage.ts` as asked; a guard test lists the stage keys. #258: `drawGameKnown` and `stoppedDraws` inclusive at `stopAt`, used by `wheelView`, `gameEventsOf`, `namedGames`, `readClip` and the Results. #259: `changeEvent` owns `now` and the settle for every `lock: 'update'` change; no write handler imports `useClock` (`handler-clock.test.ts`); `coin_tosses.session_id` replaces the time comparison. #261 Part A/B items present (NoticeBanners, `animateVeto`, `settleBeforeRead` row, `shared/instant.ts`, `startedIn`/`unevenNoticeIn`, the glossary lines on the coin and the Host's Veto privilege). #279: `tiePossible`, `recommendedPoolSize` (+1; 10 games × 2 teams × 5 Vetoes = 21), `poolHint.extra`, the Bonus Veto note, seven steps, `pools.tiebreaker` accepted and ignored. #280: see above. The stage's open Rounds are read whenever there are some, so story 4 holds between Sessions.

### For the Release PR (story 79 and the delivery rules)

Name the migrations 0020 (toss gets its Session), 0021 (**deletes the Tiebreaker pool rows**), 0022 (Results: three `rounds` columns, `round_places`, three Activity types), 0023 (`events.finished_at`); say that the staging push and the `main` merge redeploy the Worker (N4); set the Datenschutzerklärung's `Stand:` date and the roadmap row at the cut; list the tooling changes apart (N6).

## Quality and architecture review, Release 0.8 „Punkte“ (thermo-nuclear + improve-codebase-architecture)

Diff `v0.7.0...a68a7c9` (`origin/feat/272-punkte`, 167 commits, 251 files, about 23k lines added, a large share tests and drizzle snapshots). Read-only; no test run, no browser. Vocabulary from `codebase-design`: module, interface, depth, seam, adapter, leverage, locality. Known leftovers and the findings already being fixed (s5 F1, F3, F4, the dead end after „Letztes Spiel hinzufügen“, O4) are not repeated.

Severity: **must-fix** = before the Release reaches `main`; **should-fix** = before the cut, cheap; **later** = ticket, with the reason it can wait; **nit** = take it when the file is open anyway.

### Result

- **Must-fix: 0.** Nothing in this axis blocks the Release. No file crosses 1k lines: largest source files are `DateTimeField.vue` 495 (unchanged), `EventPage.vue` 494, `shared/settings.ts` 410, `shared/event.ts` 308 (down from 430); largest tests `vetoes.test.ts` 941 and `hidden-wheel.test.ts` 935 (both untouched this Release), `event-page-composition.test.ts` 899 (up from 365, see Q9). The migrations 0020-0023 are additive or delete only what the ADR retires, and each says why the 0.7 deployment is safe during the switch-over.
- **Should-fix: 3** (Q1-Q3). **Later: 9** (Q4-Q12). **Nit: 9** (N1-N9).
- **The 0.7 review paid off almost completely.** Of its 17 findings, 16 are done in the form it asked for, and the new code leans on them: Q1 `server/utils/stage-read.ts` with `stageSections` and one Veto read; Q2 `viewInstants`; Q3 `GAME_ACTIONS`, a named options object, the dead arm gone, the dock tests a table; Q4 the changelog rule in `docs/agents/release.md`; Q5 `useServerTicker` (all five stage components moved, `CpNum` is the one other frame loop and runs on the client clock on purpose); Q7 the five unlistened room messages deleted; Q8 `ActivityMoment` makes „instant type without `at`“ a compile error; Q9 `drawGameKnown` and `stoppedDraws`, in `CODING_STANDARDS.md` as a finding when copied; Q10 `coin_tosses.session_id` and `onSessionEnded`; Q11 `EventChange.now` with the settle inside `changeEvent`; Q12 `ACTIVITY_NAMES`; Q13 `shared/instant.ts`; Q14 the glossary terms; Q15 `StagePresent`; Q16 `roundForDraw`/`insertDraw`; Q17 `eventHasWheel`, `shared/stage.ts`, the FK comments. Q6 is done in substance (`useStageActions`, `useEventTabs`, `StageWheel`) but its target, a page under 400 lines, is missed: 494 (Q8).
- **What is not good yet** is smaller and mostly one theme: 0.8 moved a Session's start and end onto the request's clock (right, and 0.7 Q10 asked for it) but left the Activity feed's `at` on the database's clock, and the feed's grouping compares the two (Q1). The other two should-fixes are one-home gaps of the kind `CODING_STANDARDS.md` names: the Standings and the end of the Event are composed in two places (Q2), and the result sheet's lifetime is owned by a list that its own save empties (Q3).

---

### Must-fix

None.

### Should-fix

#### Q1. The feed's group boundaries compare the database's clock with the request's clock (should-fix; confirms s5 O1 and gives its cause)
- `server/utils/activity.ts:37` (`at: at ?? sql\`clock_timestamp()\``), `app/utils/activity.ts` `groupActivity` (`segment.from <= at && at < segment.to`), `server/api/e/[slug]/sessions/start.post.ts` and `sessions/end.post.ts` (`startedAt: now`, `endedAt: now`), `server/utils/sessions.ts` `closeSessions` (`endedAt: now`).
- Problem: in 0.7 a Session's `startedAt` and `endedAt` were `sql\`now()\``, and every entry's `at` was `clock_timestamp()`: one clock, and `now()` is never later than `clock_timestamp()` of the same transaction, so an entry written by the start or end always fell on the right side of the boundary. 0.8 moved the Session stamps to `EventChange.now` (the request's clock, Vercel) and left the feed on the database's clock. The grouping is a comparison of two instants from two clocks. The comparison is correct only when the database clock is at or ahead of the app clock by at least the time between `now` and the insert. s5 measured a constant 1.7 s skew on the dev machine and saw `event_finished` land inside the ended Session's group, and „Session gestartet“ and the first „Spiel gesetzt“ land under „Vor dem Start“. Production skew between Vercel and the database was not measured; any skew larger than the few ms to tens of ms between reading `now` and the insert gives the same result, and the entries that suffer are the ones the groups exist for (the start, the end, the finish).
- Concrete failure: app clock 300 ms ahead of the database clock. The Host starts Session 1: `startedAt` = 19:00:00.300, the `session_started` entry's `at` = 19:00:00.250. `groupActivity` puts that entry in „Vor dem Start“ and the header „Session 1“ opens with the next entry. Ending it: `endedAt` = 22:00:00.300; the `event_finished` entry written in the same request has `at` 22:00:00.250, so it sits in „Session 1“ instead of under „Nach Session n“. (`session_ended` is special-cased by session id and survives.)
- Fix (pick one, then add a test with a database clock behind the app clock):
  1. Make the two sources agree where it matters: `recordActivity` writes `at: sql\`greatest(clock_timestamp(), ${now.toISOString()}::timestamptz)\`` for the non-instant types (they carry `now`). With a database clock at or ahead of the app clock nothing changes, microsecond order inside a change stays, and with a lagging clock the entry is at least the Session's stamp. Cost: with the test clock in 2090 every non-instant entry of a request gets the same `at`, so entries of one change tie and the `(at, id)` keyset orders them by random uuid; tests that assert the order of two entries written by one change need an explicit order or a distinct `now`.
  2. Or stop comparing instants in the client: `groupActivity` takes its boundaries from the feed's own `session_started` and `session_ended` entries (same clock as every other entry) and falls back to the Session's stamps only for a boundary whose entry is not in the loaded pages. More code in the client, no change to the write side.
- Not a Must-fix: a mis-grouped header does not lose or leak anything, and with the clocks within a few ms (the normal case) the feed is right.

#### Q2. „The Standings and the end of the Event“ are composed in two places, one for the read and one for the write rule (should-fix, small)
- `server/utils/stage-read.ts:101-102` (`standingsOf(totalPoints(rows.results.map(entry => entry.places), …))` then `endOf(standings, rows.results.length, settings.gameCount)`) and `server/utils/finish.ts:44-45` (`readEnd`: the same two calls over `readResultPlaces`). The Places come from two different statements (`readEventRows`' results statement; `readResultPlaces`), the composition from two copies.
- Problem: the dock offers „Event abschließen“ from the read's `end.finish.rejection`; the route refuses from `readEnd`'s `end`. They must agree for ever, and they agree only because two three-line copies are the same today. The next thing that enters the Standings (a penalty point, a Result the ceremony treats differently) is a second edit, and a miss shows as a dock that offers a hold the route then refuses with `standings_changed`. `CODING_STANDARDS.md` names this failure: a feature repeating a pattern the codebase had one home for.
- Fix: one pure `standingsAndEnd(groups: readonly (readonly { team: number, place: number }[])[], settings: Pick<EventSettings, 'pointsTable' | 'teamCount' | 'gameCount'>): { standings: StandingView[], end: ReturnType<typeof endOf> }` in `shared/results.ts`, called by `resultsSection` and by `readEnd`. A unit test pins it once; the two integration tests (`results.test.ts`, `last-game.test.ts`) keep covering both callers. Name the return type of `endOf` (`EndFacts = Pick<EndView, 'played' | 'gameCount' | 'complete' | 'tie'>`) while there, so `readEnd`'s signature stops saying `ReturnType<typeof endOf>`.

#### Q3. The result sheet lives inside the list that its own save empties, so focus has nowhere to return to (should-fix; from reading, needs one look in a browser)
- `app/components/EventRounds.vue:43` (`<section v-if="rounds.length > 0">`) holds `ResultEntry` (line 108) next to the Round cards; the „Ergebnis eintragen“ button that opens it sits in the `<li>` of the Round. `app/composables/useEventMutation.ts` `send` refetches in `finally`, before it resolves, so by the time `ResultEntry.onSave` sees `true` and emits `close`, the Round has left `rounds`. `useDialog` returns focus in its `open` watcher to the element that had it on open (`returnFocus`).
- Problem: for the last open Round the whole `<section>`, sheet included, unmounts before the `open` watcher can run, so focus is never returned; for another Round the trigger is in a `<li>` that is leaving or gone, so `returnFocus.focus()` hits a detached element. Either way a keyboard or screen-reader Host lands on `<body>` after the central action of the Release, „Ergebnis speichern“. The Correction path (`GameHistory`) keeps its pencil and is fine. Ownership is the defect: a sheet's lifetime must not depend on the thing its save removes. `EventHostDialogs` already exists for exactly this (the Host's sheets outlive the cards that open them).
- Fix: render `ResultEntry` outside the `v-if` section (a root `<div>` in `EventRounds`, or in `EventHostDialogs` with the page opening it by Round id like `openSetGame`), and give `useDialog` a fallback when the trigger is gone: focus the Standings heading, or the first remaining „Ergebnis eintragen“, or the stage's `h1`. Add a nuxt test that after the save the active element is not `body`. The a11y reviewer should confirm the failure in a browser; the code path above is deterministic.

---

### Later (tickets)

#### Q4. Three functions of `stage-read.ts` take nine or ten positional arguments (later)
- `server/utils/stage-read.ts:118` `vetoView(eventRow, rows, viewer, draws, vetoRows, bonusTeams, windowDraw, game, now)` (9), `:154` `poolWarningOf(eventRow, settings, rows, viewer, roundRows, draws, vetoRows, bonusTeams, left, now)` (10), `:171` `wheelView(db, eventRow, rows, viewer, hidden, left, draws, now, vetoRows, bonusTeams)` (10). `roundsSection` assembles the same facts for all three.
- Problem: the facts of „the Rounds of this Event for this viewer“ (`eventRow`, `settings`, `rows`, `viewer`, `now`, `draws`, `vetoRows`, `bonusTeams`, `left`) are a missing type, and every one of these calls is a chance to swap two `readonly string[]`/`number[]` arguments of the same type that the compiler cannot tell apart (`left` and `bonusTeams` are both arrays). It is the positional-booleans finding of 0.7 Q3, one level up.
- Fix: `interface RoundFacts { eventRow, settings, rows, viewer, now, draws, roundRows, vetoRows, bonusTeams, left }` built once at the top of `roundsSection` (after the first `Promise.all`), and the three functions take `facts` plus what is theirs (`windowDraw`, `game`, `hidden`, `db`).
- Why it can wait: the three are private, each covered by `hidden-wheel`, `vetoes`, `pool-preview` and `rounds` integration tests, and no 0.8 behaviour changes. 0.9's ceremony reads the same facts: do it as the first commit of that ticket, before it adds an eleventh parameter.

#### Q5. `useRowDrag` is a second copy of `useBoardDrag`'s press-and-hold state machine (later)
- `app/composables/useRowDrag.ts` (105 lines) and `app/composables/useBoardDrag.ts`: the same `press` record, `listen`/`unlisten`, `finish`, `start`, `onMove` (touch long press, `SCROLL_DISTANCE`, mouse `DRAG_DISTANCE`), `end`, `onUp`/`onCancel`/`onKeydown`. `useRowDrag` even imports the three constants from `useBoardDrag`. Only what is under the pointer differs (`rowIndexAt` against `zoneAt`) and what the drop does.
- Problem: a fix to one (the touch non-passive `touchmove` guard exists only in `useBoardDrag`; `useRowDrag` leans on `touch-none` on its handle) is a second edit, and `CODING_STANDARDS.md` calls a second copy a finding even when it works.
- Fix: `usePointerPress({ canStart, track(event, press) => target, drop, cancel })` that owns the press, the listeners, the long press and Escape; both composables become 25-line adapters over it (two adapters now: a real seam).
- Why it can wait: both are tested through their own interface, neither has a bug today, and the extraction touches the released Game board's drag for no new behaviour. Do it when a third list is dragged or when either one gets its next bug fix.

#### Q6. `dockLayout`'s two finish arms repeat three Session layouts each (later)
- `app/utils/host-dock.ts:107-121` (`case 'finish'`, `case 'finishTie'`), and the `finishable`/`tied` conditions repeated in `hostDockState` at lines 43, 46, 53-54, 63, 67-68.
- Problem: `finish` in `running` is the `setGame`/`spin` layout with another primary, `finish` in `done` is the `default` layout, `finish` otherwise is `start`'s layout; `finishTie` repeats that with `lastGame` added to `secondary`. That is six arms that must follow every change to the other layouts, and `hostDockState` decides „finish“ or „tie“ in four separate places. 0.7 Q3 removed this shape once.
- Fix: in `hostDockState`, compute once `const closing = finishable ? 'finish' : tied ? 'finishTie' : null` and apply it to the kinds that play (`running`, `between`, `done`) at the end; in `dockLayout`, compute the layout for the state without the finish primary and replace `primary` (and add `lastGame` to `secondary` for the Tie). The table-driven tests in `host-dock.test.ts` already assert the contract and survive the change.
- Why it can wait: correct and tested; the next primary (0.9's ceremony) is the moment this costs, and doing it with that ticket shows whether `closing` generalises.

#### Q7. The Event read's stage sections are merged with a cast, so a missing field is no longer a compile error (later)
- `server/api/e/[slug].get.ts:46`: `Object.assign({}, ...await Promise.all(stageSections.map(…))) as Omit<EventView, keyof typeof fixed>`, with `StageSection = (ctx) => Promise<Partial<EventView>>` (`stage-read.ts:30`).
- Problem: 0.7 Q1 asked for the uniform signature and got it; the price is that the one place that knew the view is complete (the return type) is now an assertion. A new section that forgets its field, or a field two sections both write, type-checks. The comment points at the integration test „the stage sections of the Event read“, which is the right backstop but a runtime one.
- Fix: type the array as a tuple (`satisfies readonly StageSection[]`) and derive the merged type `UnionToIntersection<Awaited<ReturnType<(typeof stageSections)[number]>>>`; the handler's return type then fails to compile when a field is missing. Each section already returns a precise `Pick<EventView, …>`.
- Why it can wait: the integration test fails the same mistake in CI before any release; the Release adds no section whose field could be lost.

#### Q8. `EventPage.vue` missed the 400-line target and still wires every block (later)
- `app/components/EventPage.vue` 494 lines (537 in 0.7, target of 0.7 Q6 was under 400). Script about 140 lines, template a 17-branch `v-else-if` chain.
- What is left in the page that has a better home: the 17-line `useHostActions` handler object (nine of its entries are `() => actions.x` or `() => dialogs.value?.openX()`: let `useHostActions` take `actions` and `dialogs` and build them, which also deletes most of `HostActionHandlers`); the `corrections` computed (a pure `historyCorrections(view, save)` next to `HistoryCorrections` with a unit test); `seat`, `stay`, `pill`, `hostName`. And the Tie banner: the template checks `block === 'tie' && !data.event.isHost` (line 360), against its own comment „the template checks nothing of its own“. Put `isHost` into `PageInput.event` and fold it into `present.tie`, so `pageBlocks` lists the banner only for who reads it and the wrapper no longer relies on `empty:hidden`.
- Why it can wait: the page is boring and typed, the chain is the right shape (0.7 said so), nothing near 1k. 0.9 adds the ceremony block: do this at the start of that ticket so the new branch lands in a page that has room.

#### Q9. `test/nuxt/event-page-composition.test.ts` doubled in this Release and is at 899 lines (later)
- 365 lines in 0.7, 899 now (+534), one file for the page's composition in every state. The bar is 1000; 0.9 adds the ceremony states.
- Fix: split by what is composed: `event-page-stage.test.ts` (running, between, done: wheel, rounds, Countdown, coin), `event-page-standings.test.ts` (Standings block, tab, news, history, finished), and keep the base states (setup, poll, teams) here. Share the fixtures through `test/nuxt/event-page.ts` as now.
- Why it can wait: no test is wrong; the split is mechanical and best done by whoever adds the first 0.9 test, so it is not a drive-by.

#### Q10. The one-pool leftovers: `{ main }` wrappers on the wire, a `pool` column and a one-value enum (later, after the switch-over window)
- `shared/event.ts:113` `EventPools { main }`, `server/domain/pools.ts` `NewPools { main }` and `parsePoolChange` (`raw.main` only), `app/utils/event-draft.ts` `pools: { main }` and `settingsBody`, `server/db/schema.ts:205-209` (`pool_kind` still lists `tiebreaker`, `event_pool_games.pool` stays), and the `pool = 'main'` filter in five queries (`eventPools`, `readGamePool`, `gameEventsOf`, `applySettingsChange`).
- Problem: ADR 0014 left one pool; the code still carries the shape of two. A reader needs to know why every query filters `pool = 'main'` and why a body says `pools: { main: [...] }`.
- Fix: when no 0.7 client can be open, `EventPools` becomes the array, the body `pools: string[]`, and a migration drops `pool` from the primary key and the column (the enum value cannot go; the type can stay unused, or be recreated).
- Why it can wait: it cannot go before the switch-over has passed. The 0.7 client still sends `{ main, tiebreaker }` and the 0.7 code still writes `pool = 'tiebreaker'` rows after migration 0021; `parsePoolChange` ignores the extra key and the filter makes the stray row harmless on purpose (browser check s2 scenario 6). Schedule it for 0.9 or 1.0 with a line in the roadmap.

#### Q11. `useServerTicker` decides „the moment is over“ from the clock before it is synced (later)
- `app/composables/useServerTicker.ts` (`pending()`, `sample()`), `app/composables/useServerClock.ts` (`now = synced ? performance.now() + offset : Date.now()`).
- Problem: the first sample at mount is taken before the first `clock.pong`, so it is the User's own clock. If that clock is ahead of the server's by more than the time left in the moment, `now.value >= until` at once, the ticker stops (`sample` → `stop`), and the „first sample at or past `until` stays“ rule keeps the wrong value. After the sync nothing re-samples: `until` has not changed, so `watch(options.until)` does not fire. Failure case: a phone whose clock runs 5 s ahead is reloaded 3 s before a spin stops; it shows the stopped wheel and the result card while the server and every other Member are 3 s from the stop, until the next refetch changes `until`. (The pre-0.8 `useVetoClock` ran its interval for the life of the component and healed itself; the wheel, coin and Countdown loops had the same shape before 0.8 and are not worse.) The s3 observation O2 (wheel at 0° and the coin's stand pose for about 0.3 s after a reload) is the other half of the same seam: the null-before-mount rule is right for hydration, and what shows for 0.3 s is the server-rendered frame before the client has mounted, not a ticker bug.
- Fix: let the ticker know when the clock is usable: `options.ready?: () => boolean` (the page's `serverClock.synced`), read in a `watch` that calls `restart()` when it turns true; until then `now` stays null and the components keep their rest state. Test: a clock that jumps by 5 s on sync keeps a running moment running. For O2, hold the stage's moving parts at `visibility: hidden` until the ticker is non-null if the flash matters.
- Why it can wait: needs a device clock off by seconds and a reload inside a moment of a few seconds; the self-heal at the next refetch is at most one moment away; it predates this Release for three of the four components.

#### Q12. `shared/results.ts` has five reasons to change, and the type imports form a cycle (later)
- `shared/results.ts` (223 lines, 25 exports): Place shape and Score rules, points and Standings maths, the Result rule (`resultRejection`), the end (`endOf`, `outcomeOf`), the finish rule and the last-game rule. `shared/results.ts` imports types from `./event` and `./stage`; `./event` imports types from `./stage`; `./stage` imports types from `./results`. Type-only, so nothing breaks at run time.
- Fix: `shared/finish.ts` takes `leadersOf`, `endOf`, `outcomeOf`, `finishRejection`, `lastGameRejection` and their types; `results.ts` keeps Places, points and Standings. Q2's `standingsAndEnd` fits there. Move `EndView` and `StandingView` so the cycle breaks (they are views of the Standings: `shared/stage.ts` is right, so move the rules, not the views).
- Why it can wait: 223 lines is fine, the cycle is erased, `lint` is green. The ceremony (0.9) adds the first consumer that wants only the Standings and not the finish rules.

---

### Nit

- **N1.** `app/composables/useHostActions.ts:7-14`: the header comment lists the primaries („…Rad drehen, Event abschließen, or none after the last Session“) but not „Unentschieden beenden“ and „Letztes Spiel hinzufügen“ (confirms the leftover).
- **N2.** `app/utils/motion.ts:48` `animateVeto` now also drives the Standings' delta pill and winner stamp (`deltaPop`, `winnerStamp`). Rename to `animateOrFade`; the comment above it already says it is for „a stamp or a pill“.
- **N3.** `server/db/schema.ts:94` says `finished_at` is „Written, not read, in 0.8: nothing shows it yet“. Home reads it (`server/api/e/index.get.ts`, `eventStaysOnHome`, #282). Delete the sentence.
- **N4.** `app/utils/event-page.ts:11` `PageInput` makes `end` optional („the Host dock … has no use for the Standings“), but `DockInput` requires it and `eventPageState` computes `standings` and `tie` from it for every caller. One optional field that every real caller supplies hides a missing `end` as „no Standings“. Make it required and fix the fixtures.
- **N5.** `app/components/GameHistory.vue` calls `winnersOf(result.places)` five times per row in the template, `app/components/Leaderboard.vue` `pillOf(standing.team)` three times per row. Map the rows once in a computed (`rows = results.map(result => ({ result, winners, text, scores }))`).
- **N6.** `HistoryCorrections` (`app/utils/result-draft.ts:78`) is a page-to-history contract, not a rule of the draft; it belongs with `GameHistory` (a `.ts` next to it, or `app/utils/standings.ts`).
- **N7.** `finishEvent` and `addLastGame` both open with `if (settings === null) throw apiError('wrong_phase')` and the same comment. Fold it into `readEnd`'s caller, or into a `requireSettings(eventRow)` in `server/utils/settings.ts`.
- **N8.** `shared/settings.ts` `poolHint` recomputes `vetoes` and `extra` that `recommendedPoolSize` just computed, and `StepPool.vue` `HINT_KEYS` makes eight i18n keys for one sentence (wheel/admin × one/many × last game). One `poolNeed(settings)` returning `{ games, vetoes, extra }` that both use removes the copy; the next factor would double the keys again, so compose the sentence from parts when that comes.
- **N9.** `app/components/Leaderboard.vue:237` hard-codes `#151515` twice (stamp border and text); `CoinFlip.vue` does the same, so it is the codebase's habit, but a `--cp-ink-fixed` token (the comment says „fixed ink in both modes“) would make it one decision.

---

### Leftovers confirmed or refuted

- **s5 O1 (feed group label compares the DB clock with the app clock): confirmed**, and it is a regression of this Release's own change of stamps, not an environment quirk: Q1.
- **s5 O5 (a long game name without spaces does not wrap in the 1440 feed): confirmed.** `app/components/ActivityFeed.vue:206` is `<span class="min-w-0 flex-1 pt-[3px] text-[14px] leading-[1.4] text-pretty">` with no `overflow-wrap`; a name is up to `GAME_NAME_MAX` (60) characters and may have no break opportunity. Add `break-words` (or `wrap-anywhere`) to that span. One class, no ticket needed.
- **s5 O6 (the notice's × is a 16 × 16 px button): refuted as a hit-target defect.** `NoticeBanner.vue:59-70` gives the button `hit-44` (`compies-theme.css:205`: a 44 px `::after`), the codebase's convention for small visuals (`IconButton` is built the same way). The measured 16 px is the icon box. If the visual size matters, that is a design question, not a quality finding.
- **s5 O7 (a stale page heals itself on its first pointer event): not a code finding.** It is `usePollRefresh`'s refetch on interaction doing its job; nothing to change.
- **s3 F1 (a strip under `AppSheet`'s sticky footer at 390 px): not reproducible from the code.** The footer's `-mx-5 -mb-5` match the section's `p-5`, and `sticky bottom-0` in a padded scroll container sticks flush with the scrollport; the `full` variant only removes the rounding and handle. The handoff's own reading (the Nuxt devtools pill) is the likely one; a production-mode screenshot at 390 would settle it.
- **s3 O1-O3: not touched by what I read**, except O2 (wheel at 0° and the coin's stand pose for about 0.3 s after a reload): that is the server-rendered frame before the client has mounted, by the ticker's null-before-mount rule; see Q11.
- **s2 browser notes (4a-4g): nothing for this axis.** 4a (the clip opens about 0.5 s after the stop) is ADR 0013's settle-on-first-read, by design; 4f is the dev server's stale optimizer hash; 4b, 4c and 4e are copy and design questions for the walk-through.
- **`useHostActions.ts`'s header does not list the Tie actions: confirmed** (N1).

### Checked and sound

**Layering and atomicity**
- The write path: `finish`, `last-game` and `result.put` are plain `changeEvent(…, { lock: 'update' })` with the rule in `shared/results.ts`, the parser in `server/domain/`, the writes in `server/utils/`. Nothing is written before the rule passes; the Phase is set before `closeSessions`, which deliberately does not write it (the comment says why `changeSessions` would overwrite it). `beforeFinish` in `changeEvent` is the one read-only rule of a finished Event, with `allowFinished` only for the invite rotation; no write route can forget it.
- `rounds_one_drawn_per_event_idx`, `rounds_event_id_number_unique`, `rounds_number_result_check`, `rounds_result_stands_check`, `events_finished_at_phase_check` and `round_places` primary key keep the invariants in the database; `nextRoundNumber` runs under the Event lock, so numbers have no gaps.
- `settleDue` lives in `server/utils/settle.ts` (cycle avoided, the comment says why) and `changeEvent` calls it for every `lock: 'update'` change; `settleBeforeRead` stays the one place for a timed GET. No `useClock` import is left in a handler under `server/api/e/**` except the Event read itself.
- Instants: Session start, end, the finish, a Result and a Correction use `EventChange.now`; the coin has `session_id` and no time comparison; `onSessionEnded` is the one „what ends with a Session“ (the Countdown today; the line that sets `endedAt` is still spelled in `end.post.ts` and `closeSessions`, which is harmless).

**Secrecy**
- `resultsSection` filters each Result's game through `drawGameKnown`; Standings and count use every Round with a Result, which is right (points are not secret). `stoppedDraws` is used by `clip.ts`, `pools.ts` and `activity.ts`; no copy of `lte(draws.stopAt, now)` is left in `server`.
- `finish` and `lastGame` are Host-only objects, so null never means „you may“ (the comment says so); a Member gets the same `end` otherwise.

**Reuse and one home**
- `joinNames` replaced the inline `Intl.ListFormat`; `CpNum` got its count-up from `count-up.ts`; `StickerConfetti` is a layer that knows nothing of what it celebrates (the ceremony can use it); `useStandingsNews` is the one owner of „last seen“ for three mounted Leaderboards; `StandingsTab` is mounted by both the panel and the phone view, so one place says what the tab holds.
- `apiFailure`/`quiet` in `useEventMutation` is a one-caller option but typed on `ApiErrorCode` and documented; fine.

**Migrations**
- 0020 (nullable column, FK, index), 0021 (delete only), 0022 (nullable columns, new table, three enum values with nothing using them in the same transaction), 0023 (nullable column and a check old rows pass). Each file states what the 0.7 code does in the switch-over and why it stays correct (ADR 0007). No migration is edited after merge.

**Dead code and tooling**
- `knip` stays green; its one scoped ignore (`scripts/browser/kit.mjs`) was removed. `scripts/browser/standings.mjs` and `scripts/ci-wait.mjs` are entries with a reason. The CI change to run every pushed branch says why.

**Docs**
- `GLOSSARY.md` § Results is complete and uses `_Avoid_` lines; ADR 0014 records the Tiebreaker decision and its consequences; `CODING_STANDARDS.md` gained the Secrecy section and the two homes.

### Not checked
- Visual behaviour, accessibility in a browser (Q3 is from reading), query plans on production data, the clock skew between Vercel and the production database (Q1), the browser scripts' internals, `game-day-check.yml`, i18n copy beyond the strings quoted here.
