# Review 1.4 „Teams“ (2026-10-31)

Diff `v1.3.0...origin/staging` (db21e5b). Per `docs/agents/release.md` § Review, walk-through, retro, three read-only `sonnet` subagents reviewed it:
- Standards;
- Spec (#153, with #155–#157, #159–#166, #183 and #184);
- thermo-nuclear with architecture.

Before it, a two-axis review (Standards + Spec) ran on the integration branch `feat/153-teams` at 5c351cd. Its fix pass `5c351cd..c5bb1c8` (merge c5bb1c8, in PR #194) did these:
- the Event page actions through `useEventMutation`;
- one space rule, one `moveMember`, one start rule, one UUID check;
- the shared Session predicates;
- the Team size floor on the server;
- `SILENT_AFTER_MS` 75 s;
- the Session numbering;
- the locks on „So wird gespielt“;
- the Datenschutz text.

The three reviews below were told what that pass had fixed or decided, and don't repeat it. The user's staging walk-through of 1.4 comes after the fix pass of this review (§ Result).

## Result

- **No blocker in the code.** These hold:
  - authorization (Host-only, members-only);
  - the Event row lock on every seat and Session write;
  - Hidden wheel secrecy across the room, the feed and the Event read;
  - the migrations 0008–0012.
- **Fixed before the cut** in the fix spec #195 „1.4 Nachbesserung“ (user's choice, 2026-10-31):

  | Ticket | Findings | What |
  |---|---|---|
  | #196 | Home card (orchestrator), S5, N1, N2, P6, A7 | Copy: Home's construction card no longer promises the Spielbrett, and its chip says „Kommt in einer der nächsten Versionen“; the feed's empty text promises no Votes; „Compies“ in the changelog; „Event läuft“ / „seit dem Start“ instead of „Spiel“ in the board copy; the README env var; dead code |
  | #197 | S1, S2 (= P4) | One Team size floor rule in `shared/` for the editor and the server; the server stops reading `teamCount` from the raw body |
  | #198 | P1, P5 | Refetch on return whatever the room state; no banner on a slow first connect |
  | #199 | P2 | Home keeps an Event until every Session has ended, for 24 h after the last end |
  | #200 | P3 | The deploy guard counts a Running Session only within 16 h of its start |
  | #201 | S4 | One helper for the number of a Session that still polls; GLOSSARY matches the screen |
  | #202 | A5 | The room publish runs after the response (`waitUntil` from `@vercel/functions`) |

- **User decisions (2026-10-31):**
  - **P2:** a Session that has not started keeps its Event on Home for ever, whatever its Date, as a Session without a Date already does. Known consequence: every Session from before 1.4 has `started_at` null, so older Events on production come back to Home with the 1.4 deploy.
  - **P3:** cap at 16 h. `release.md` keeps the workflow's `override` as the last resort.
  - **Copy:** the texts in the #196 row of the table above.
- **To the 1.5 planning** (`docs/roadmap.md` § 1.5):
  - **A1:** one home for a Session's state, as „1.5 ticket zero“. It also covers S3 and S6.
  - **A2:** who owns the wheel and veto deadlines. Settle it in the 1.5 grilling and amend ADR 0013.
  - **A3:** a settings lock that depends on round state.
  - **A4:** the block and dock lists of the Event page.
  - **A6:** activity people by declaration; the enum migration per Release.
  - **A8:** `useBoardPlaces`, when the board is next touched.
  - **Nits:** N3–N12, A9, and „Ersatz“ in `board.benchSub`.

## Standards review: Release 1.4 "Teams" (v1.3.0...origin/staging, db21e5b)

Sources: `CODING_STANDARDS.md` (the "one home per concern" table), `GLOSSARY.md`, `docs/adr/` (0001, 0012, 0013 for this Release), `docs/agents/release.md` (changelog lines), `CLAUDE.md`, `docs/reviews/review_1.3_2026-10-28.md`, and the smell baseline of the `code-review` skill (every smell is a judgement call; the repo's documented rules win).

Method: I read the fix pass (`git diff 5c351cd c5bb1c8`) in full and the Release diff (104 commits, 260 files without the drizzle snapshots) by concern, with greps for each row of the home table. Read-only; no tests run.

### Result

No blocking finding. The structure the 1.3 review asked for holds: every Event mutation runs through `changeEvent` (lint refuses `.transaction(` in `server/api/e/**`, and the one carve-out is the create endpoint with its reason), request bodies stay `unknown` until a parser (`asRecord`, `parseTeamWord`, `parsePlace`, `parsePoolChange`), `shownName` is the only name source, the 1.3 pool-parsing split (old S7) is closed by `parsePoolChange`, and the Event page actions go through `useEventMutation`. Migrations 0008 to 0012 each have one commit (none edited after staging) and the new filter columns have their indexes in the same migration (`event_members(event_id, team)`, `activity(event_id, at)`, partial unique index for the one Running Session).

The failure the 1.3 review named (a feature repeating a pattern the codebase just learned to collapse) shows up again, in a smaller form, in the fix pass itself: it made one home for "has started / is running" and one for the team name, and left a second copy of each next to them. Findings below: 0 blocking, 6 should-fix, 12 nits.

---

### Should-fix

#### S1. The Team size floor rule exists twice, and the fix pass changed only the server's copy (CODING_STANDARDS: "A rule both sides enforce … a pure function in `shared/`")

- `server/utils/settings-floors.ts:13-16` (fix pass f40ae1c): with `teamCount`, only the teams up to it count, so a request that lowers the team count may lower the Team size too.
- `app/pages/e/[slug]/einstellungen.vue:31-37` and `app/components/stepper/StepFormat.vue:41` still use the Event read's `settingsFloors.teamSize`, which `poolsSection` computes without a team count (`server/utils/event-read.ts:149`): the fullest of all teams as saved.
- Cost: the editor's Team size stepper refuses a value the server now accepts, so the Host cannot reach the case the fix pass made legal (4 to 2 teams with a full team 3). The editor already holds everything the pure rule needs: `locks.teamPlayers` (players per saved team) and the draft's team count. The two copies will drift again.
- Fix: one pure `teamSizeFloor(playersPerTeam, teamCount)` in `shared/` (next to `fullestTeam`); `settingsFloors` calls it with the counted seats, `StepFormat` calls it with `locks.teamPlayers` and the draft's `teamCount`. Add a nuxt test for the stepper floor with a lowered count.

#### S2. `applySettingsChange` reads `teamCount` from the raw body before the parser has checked it (CODING_STANDARDS "Request input"; repeats the shape of 1.3 S7 "re-read the raw body")

- `server/utils/settings.ts:41-43`: `asRecord(change).teamCount` with `typeof === 'number' && Number.isInteger` is a second, weaker copy of "what is a valid teamCount", used to build the floors that `checkSettingsChange` then consumes. Order is inverted: the floor needs the parsed count, the parser needs the floor.
- Cost: a request with a fractional or out-of-range count takes the "undefined" branch and gets the wrong floor first, then fails on the parser; harmless today, wrong as soon as another field (`teamSize` bound) feeds the floor. It is also the only place in the server that peeks inside a body for a value a rule module owns.
- Fix: hand `checkSettingsChange` a floors function, `floors: teamCount => ...`, built once from the seats read under the lock (S1's pure function). The parser then calls it with the count it just validated, and the peek goes away.

#### S3. "Started" and "running" still have more than one home after the fix pass (CODING_STANDARDS: "a second copy is a finding even when it works"; 1.3 Part 3 pattern)

The fix pass (0fbb5a6) created `hasStarted`, `isRunning`, `runningOf` in `shared/board.ts:139-153` and moved four callers. These stay outside:

- `server/domain/session.ts:19-21` `isStarted` (a second "has started" predicate, used only inside `numberedSessions`; line 43 `waiting` then spells `startedAt === null` again).
- `server/api/e/[slug]/sessions/[id]/reopen.post.ts:17`, `.../reschedule.post.ts:21`, `.../sessions/[id].delete.ts:20`: `started: session.startedAt !== null`.
- Client: `app/utils/event-page.ts:59` (`endedAt !== null`), `:66` (`runningSession?.startedAt ?`, while the same function already has `runningSessionId`), `app/components/EventSessions.vue:54` (`endedAt ? … : startedAt ? …`), `app/utils/activity.ts:174`.
- Also `shared/board.ts` is the Game board's rule module (its header says so and that the Worker imports it), and now carries the Session lifecycle predicates; `server/domain/session.ts` is where Session predicates already live. The two modules each own half.
- Fix: put `isStarted` (single, type-guard) and `hasStarted`/`isRunning`/`runningOf` side by side in one file the Worker does not need to import (a `shared/session-state.ts`, or keep them in `shared/board.ts` and have `server/domain/session.ts` import `isStarted` from there). Replace the inline tests listed above. `hasStarted(sessions: { startedAt: unknown }[])` should take `Instant | null`, not `unknown`: `unknown` lets `undefined` count as started.

#### S4. The number a polling Session is shown with is computed on the client in two places, against the glossary the fix pass just wrote and the server-sends-the-number rule (1.3 Part 3 T2)

- `app/utils/event-page.ts:34` `pollingNumber` (dock label, Head, jump link) and `app/components/EventSessions.vue:53` (`polling += 1` per undated row) both derive "dated count + n".
- `shared/event.ts` documents the number as server-made ("The client shows it as it is"). GLOSSARY (changed in 7bdeef2): "a Session still waiting for a Date has no number". The UI nevertheless shows "Session 3" for it (`Termin für Session {n}`).
- Cost: two derivations of one number, and a glossary that says the opposite of the screen. If the numbering rule changes again (it changed once in this Release), the two copies and the server can disagree.
- Fix: one function (extend `pollingNumber` to return the n-th polling number, used by `EventSessions` too), and amend the GLOSSARY sentence to say a Session without a Date is shown with the number it will get, after the dated ones, but keeps none until it has a Date. Or let the server send `pollNumber` per undated Session view.

#### S5. The Activity feed's empty text promises Votes (CODING_STANDARDS Copy: "Copy promises only what the app does today")

- `i18n/locales/de.json:539` `activity.empty`: "Ab jetzt steht hier, wer dazukommt, wechselt und abstimmt." There is no vote entry type in `shared/activity.ts` (`ACTIVITY_TYPES` has 12 types, none for a Vote), and the spec's Activity feed ticket does not add one. The text comes from the design hand-off (`11-event-seite.md:83`), so the design promised it, not the code.
- Cost: the first thing a Member of an old Event reads about the feed is untrue. The 1.3 review S4 was the same rule (pool suggestions).
- Fix: "Ab jetzt steht hier, wer dazukommt und wechselt." (or the true list: dazukommt, wechselt, Termine und Sessions), and tell Claude Design to mirror it.

#### S6. `startOf` and `StartSession` are a leftover of the fix pass's own generalisation (Middle Man / Speculative Generality; stale comment)

- 0fbb5a6 made `nextSession` accept `Instant` (`number | Date | string`) so "rows, the Event read's Sessions and the start rule's StartSessions all take it" (`shared/board.ts:155-158`). But `server/utils/board.ts:73-92` still maps every row to a `StartSession` in ms (`startSessionOf`), calls `nextSession(rules)?.id`, and then finds the row again by id. `nextSession(sessions)` on the rows would give the row directly.
- `shared/board.ts:127` still says StartSession exists so there is "no `Date` parsing in here", while `msOf` now does `new Date(at)` and `TeamMember.teamJoinedAt` is a `Date` in the same file. The comment is false.
- `server/utils/event-read.ts:142` finds the same Session's number a second time with a third `numberedSessions(rows.sessions)` pass (the Event read already builds it at `:95`).
- Cost: two time representations to keep in step; the first thing the next reader asks is why both exist.
- Fix: `startOf` calls `nextSession(sessions)`; `startRejection` takes the rows through `Instant` too (or keep `StartSession` only if the Worker needs it, and then say so). Return the next Session's `number` from `startOf` instead of recomputing it in `startSection`.

---

### Nits

Documented-rule nits first, then baseline smells.

#### N1. `COMPIES` in a User-facing changelog line (copy rule: the app is "Compies" in every text)
`CHANGELOG.md:13` ("zeigt dir COMPIES einmal"). The fix pass rewrote this line (Update to "neuen Version") and kept the capitals; `test/unit/copy.test.ts` checks only the locale file and the offline page, and Neuigkeiten shows the changelog. Older lines write "Compies". Fix: "zeigt dir Compies"; consider extending the copy test to the Unreleased lines like the RETIRED check does.

#### N2. Board copy says "Spiel" for what the glossary calls a Session
`i18n/locales/de.json:230-232`: "Das Spiel läuft.", "Spiel läuft: nur du kannst noch tauschen.", "Gesperrt seit Spielstart.", `board.reason.runningLocked` "das Spiel läuft", `board.notice.uneven` "Das Spiel startet erst, wenn …". The dock, Head and feed say "Session starten / läuft". A Game (one played game) and a Session are different glossary terms; these strings conflate them. Also `board.benchSub` "Ersatz, unbegrenzt" (`:180`) is the German for the Bench's `_Avoid_: reserve`. Fix: "Die Session läuft.", "seit dem Start"; "Wartebank" is no better, so "Bench, unbegrenzt" or "Wer gerade nicht spielt, unbegrenzt".

#### N3. GLOSSARY: the `_Avoid_` line of Session sits under Running Session
`GLOSSARY.md` "Running Session" has two `_Avoid_` lines; the second (`Game night, evening, round`) belongs to **Session**, which has none. Not new in 1.4, but the fix pass edited the Session entry. Fix: move the line up.

#### N4. `utils/board.ts` claims one home for the Team word, two handlers write it directly
`server/utils/board.ts:10-14` ("every write of a Member's … Team word … goes through seatMember") against `server/api/e/[slug]/team-word.post.ts:26` and `.../teams/[position]/reset-name.post.ts:30`, which `update(eventMembers).set({ teamWord })` themselves. Fix the comment ("every change of a seat") or add `setTeamWord` / `clearTeamWords` to `utils/board.ts`.

#### N5. Request parsing inline in handlers, one with the wrong code
`server/api/e/[slug]/activity.get.ts:19-20` parses cursor and limit in the handler and throws `invalid_cursor` for a bad `limit`; `.../reset-name.post.ts:18` hand-parses the position with `/^\d+$/`. Other handlers hand this to a domain parser (`parsePlace`, `parseTeamWord`). Fix: `parseActivityQuery` and `parseTeamPosition` next to the types; a `limit` error gets `invalid_value`.

#### N6. The wire shape of a failed `$fetch` is read outside `api-error.ts`
`app/composables/useBoardMoves.ts:48`: `asRecord(asRecord(asRecord(failure).data).data).winnerId`. `api-error.ts` owns "what a failed API call tells the UI" (CODING_STANDARDS row) and `apiFailure` still casts (`as {…}`, flagged in 1.3 T4). Fix: `apiFailure` also returns `data` (the apiError payload), so the board reads `failure.data?.winnerId`.

#### N7. Menu keyboard code is a third copy (Duplicated Code, judgement)
Arrow-key walking and outside-click closing: `UserMenu.vue:32-42`, `HostDock.vue:86-93,100-106` (its own comment says "as UserMenu does"), `MoveToMenuList.vue:23-30`, plus `MoveToMenu.vue:38-43` for the outside click. Fix: a `useMenuNavigation` composable, when the next menu comes.

#### N8. A new media-query composable, one new caller ignores it
`app/composables/useMediaQuery.ts` (added this Release) is used by `EventPage.vue:151`; `MoveToMenu.vue:29` calls `window.matchMedia('(max-width: 979px)')` for the same breakpoint (980 px = 61.25rem, so 979.5 px falls in neither); `ReleaseCard.vue:51` is older. Fix: `useMediaQuery('(min-width: 61.25rem)')` in `MoveToMenu`.

#### N9. Names: four things called team name
`shared/board.ts` `teamNameOf(members, position, frozen)` (composes), `app/utils/board.ts` `teamName(team, t)` (shows, with the colour fallback), `GameBoard.vue:47` `nameOfTeam(position)`, and `BoardPeople.teamNameOf(position)` in `useBoardMoves.ts:15`. Same word, three behaviours, and `teamNameOf` is also the name of the callback in `useBoardMoves`. Fix: rename the shared one `composeTeamName` (it sits next to `composedTeamName`, which is the real compose), keep `teamName` for the shown name, and have `BoardPeople.teamName`.

#### N10. `EventPageState` is a flat state with a `kind`, so the Head asserts non-null (Primitive Obsession / Speculative flexibility)
`app/components/EventPageHead.vue:27,32,33,34` use `next!` and `running!`; `eventPageState` guarantees them by `kind`. A discriminated union by `kind` removes the `!` and makes `pagePill`, `hostDockState` and the Head total.

#### N11. GameBoard props that the page decides by `kind`
`GameBoard.vue` takes `started`, `lockedNotice`, `unevenNotice` (tri-state: `undefined` means `!started`, line `props.unevenNotice ?? !props.started`). `EventPage.vue:316-317` computes both from `pageState.kind`. Fix: pass `pageState.kind` (or one `notice: 'locked' | 'uneven' | null`) and let the board stop deriving it. Same family: `GameBoard.vue:50` and `TeamNameBuilder.vue:38` each rebuild `refreshNuxtData(eventDataKey(slug))`; give `useEventView.ts` a `refreshEvent(slug)` they share.

#### N12. Small leftovers from the fix pass
- `shared/realtime.ts:11` comment: "a union that later tickets extend with presence, moves, Sessions, the Activity feed and the clock": all of them are in the union.
- `app/components/HowWePlayCard.vue:42` `(LOCKED_WHEN_RUNNING as readonly string[])`: cast to compare a literal tuple; `ROW_SETTINGS` repeats the settings keys the stepper steps already group. A `lockedRows` helper in `shared/settings.ts` next to `LOCKED_WHEN_RUNNING` would be the one home.
- `EventHostDialogs.vue:86` and `EventPage.vue:50` both compute `datePollOpen(phase, missingDates)`; `EventSessions.vue:40` and `EventHostDialogs.vue:77` both call `sessionsEditable`. One per page, passed down, is enough.
- `server/utils/settings-floors.ts:6-12` doc comment: the lines run past 120 characters, unlike the neighbours.

---

### Checked and fine

- **changeEvent home:** every Event mutation (move, team-word, reset-name, sessions start/end/add/reopen/reschedule/delete, settings, slots, confirm, rotate, vote) goes through `changeEvent` or `changeSessions`/`changeSlots`; `activity.get` and `room.post` are reads and use `loadEvent`. The only other `.transaction(` are `index.post.ts` (carved out in lint with a reason) and the invite join (no Event loaded yet).
- **Request input:** no `Record<string, unknown>` casts in new server code (lint); the three `as` on trusted data are commented (`activityEntries`, `readEntry`, `paramUserIds` one-liner). Non-null `!` in server code follow a guard in the same function.
- **One space rule:** `hasSpace` and `stripSpaces` in `shared/team-word.ts` are the only space tests (parser, field, hint); matches the migration's `~ '^\S+$'`.
- **`moveMember`:** the move endpoint and `benchRemovedTeams` both end in it; seat, feed entry and `member.moved` cannot drift.
- **Errors:** `member_not_found` is in `API_ERROR_STATUS` and `CODE_COPY` with copy; `memberNotFound()` is gone, no stale users left (grep).
- **`useEventMutation`:** the Team word, the name reset and board moves use `refused` / `refusalText`; no `$fetch` for an Event action remains in components (the remaining `$fetch` calls are reads, the room ticket, settings page, sign-in, news-seen, games).
- **User name, text length, dates:** no new `displayName ??`, no manual length counting (`characterCount`), no `toLocale*`/`Intl.DateTimeFormat` for dates (`Intl.ListFormat` in `TeamNameBuilder.vue:70` is a list, not a date).
- **Notices:** board, Event page, settings floor hint and connection banner all use `NoticeBanner` with tones; the one inline hint (Team word "no spaces") is a field hint tied to its input by `aria-describedby`.
- **Database:** indexes in the same migration for every new filter column; the activity enum is one glossary term; no edited migration; `activity.actor_id` without `onDelete` is a recorded decision.
- **Release workflow:** CHANGELOG groups in order (Neu, Geändert), links to tickets, German for Users, `[Unreleased]` only; the Release PR has no version cut yet (correct: step 3 of `release.md` comes after the walk-through). The privacy text covers the new third party (Cloudflare Worker) and `privacy-hosts.test.ts` names it (approved by the user).
- **Layering:** `shared/board.ts` and `shared/realtime.ts` import only `./record` and `./activity` (the Worker deploy path test pins it); `server/domain/*` stays pure; the Worker keeps no Event state (ADR 0012/0013).
- **ADRs:** 0001 has its closing note; 0012/0013 match the code (token TTL 60 s, signed publish, Nuxt decides). No contradiction found.
- **Repeats from 1.3:** the old S7 (pool parsing split) and S3 (casts) are closed; the old "repeat of a freshly collapsed pattern" returns as S1/S3/S4/S6 and N7, in the fix pass and the menus.
- **Not checked:** visual and accessibility behaviour, query plans, `scripts/wizards/realtime-setup.sh`, the deploy workflow's YAML, and test code beyond a grep for `.only`/`.skip`/`console.log` (none).


## Spec review: Release 1.4 „Teams“ (v1.3.0...origin/staging, db21e5b)

Reviewer axis: Spec only (#153 and #155, #156, #157, #159–#166, #183, #184; #158 and #167 out of scope). Read-only. Code read from the working tree, which equals `origin/staging` (db21e5b). I did not run `pnpm test` or the app. Ticket comments were read for agreed deviations (the `{ url, room, token }` ticket, `SILENT_AFTER_MS` 75 s, no „Bis dahin: … Chat“, no `done` state with „Event beenden“, reason order in the start rule, Date poll keeps running after the first start); they are not findings.

Severity: **blocking** = must not reach `main` as is. **should-fix** = before the Release PR or right after. **nit** = optional.

**No blocking findings.** Authorization (Host-only, members-only), the lock discipline of every seat or Session write, the Hidden wheel secrecy across the room and the feed, and the fix pass (Session numbering, Team size floor, moved dialogs) all check out. Two should-fix items and four nits follow.

---

### Should-fix

#### P1. A phone that slept does not resync its state when it comes back while the socket still looks open
- `app/composables/useEventView.ts:28`, `app/composables/usePollRefresh.ts:31-36`.
- Spec, User story 12: „As a Member whose phone slept, I want the page to resync **its clock and state** when I come back, so that timing stays right.“ Spec § Protocol: „there is no replay of missed messages.“
- What happens: the clock resyncs on `visibilitychange` and `online` (`useServerClock.ts`, fine). The state refetch on return goes through `usePollRefresh(…, () => room.state.value !== 'open')`, so `useRefreshOnReturn` only refetches while the room is NOT open. A socket that died while the phone slept (the usual mobile case: no `close` event reaches the page until the browser notices, and the client has no pong timeout, it only sends `ping`) still reads `open`. Then the visibility handler does nothing, the polling timer is off, and every message sent while the phone slept is lost. The page stays stale until PartySocket notices the dead socket. Only on reconnect does `watch(room.state)` refetch.
- Cost: a Player comes back to the lock screen, sees the old board (a team that is already full, a Session that already started) and acts on it. The server refuses safely, but story 12 and story 1 („never act on an old state“) are not met.
- Fix: in `useEventView`, refetch on `visibilitychange` to visible and on `online` regardless of `room.state` (one cheap read), or have `useRefreshOnReturn` ignore `active` for the return handlers and keep `active` only for the interval.

#### P2. Home drops a running Event as soon as every Session Date is more than 24 h old
- `server/domain/home.ts:14` (`staysOnHome`), called from `arrangeHome`; `server/api/e/index.get.ts` passes only `sessionStarts`.
- Spec, User stories 49, 53, 54, 55: the Host starts a Session „whenever we're all there, without a time check“; „I want the Event to show as running from the first start“. Spec § Sessions: „Event stays running“ after an end. 1.4 turned the Date into something that no longer says whether an Event is over: a Session can start days after its Date, and an Event stays running between Sessions.
- What happens: `staysOnHome` is still the 1.3 rule (every Session dated and all more than 24 h past → gone). Examples that now leave Home although the Event is live: (a) Session 2's Date passed two days ago and the group plays it today, so the Event vanishes from Home during the evening; (b) a Session is started and the Host forgets „Session beenden“ for a day; (c) all Sessions are dated, one has ended, the other is overdue and not yet started. The Event stays reachable by link only.
- Cost: Home is where Members find the Event again on game night. Silent loss of the entry.
- Fix: pass `startedAt` and `endedAt` to the rule: an Event stays while it has a Running Session or a dated Session that has not started (whatever its Date), and leaves only when every Session has ended or is over by 24 h. `HomeOrderable` would need `hasRunning`/`hasWaiting`. Needs a small decision from the user on the „overdue but unstarted“ case (stay forever vs. cap).

---

### Nit

#### P3. A forgotten „Session beenden“ blocks the production Worker deploy and the Release merge indefinitely
- `server/api/internal/deploy-check.get.ts:29`, `server/domain/game-day.ts` (`deployCheck`), `docs/agents/release.md` § No game days.
- Spec § API contracts: the deploy check is „not ok when any Event that isn't deleted has a Session dated today (Europe/Berlin) or a Running Session.“ Implemented exactly as written.
- The consequence the spec does not spell out: ending a Session is a manual hold-button. One forgotten end on any Event, months old, makes the guard refuse every production deploy until the Host ends it (the `override` input of the workflow is the only way around, and the release rule says to ask for the merge only „while no Session runs“). Together with P2 such an Event is also gone from Home, so nobody sees it.
- Fix (optional): count a Running Session only if it started within the last ~16 h, or show the Host a reminder; or record the override as the operator's answer in `docs/agents/release.md`.

#### P4. The settings editor still blocks lowering the Team size when only a removed team is fullest
- `app/components/stepper/StepFormat.vue:41` (`teamSizeMin` from `locks.floors.teamSize`), `server/utils/event-read.ts` `poolsSection` → `settingsFloors(db, id)` without `teamCount`.
- Spec, User story 60/61: „Team size never below the fullest team“ and „lowering the team count before the first start, I want the Players of the removed teams moved to the Bench“. The fix pass made the API accept one save that lowers both (`settings-floors.ts` takes `teamCount`; `settings.ts:40-42`), which is correct and holds under the Event lock (see „Checked and fine“).
- The UI does not follow: the floor it gets is still the fullest of all teams, so the Team size stepper cannot go below it even when the fullest team is one the Host is removing in the same save. The Bench hint shows the Players that will move, but the Team size stays pinned. Not a dead end: two saves (count first, then size) work.
- Fix: compute the floor in the editor from `locks.teamPlayers.slice(0, draft.teamCount)` (the remaining teams), as the server does.

#### P5. ConnectionBanner treats the first connect like a drop
- `app/composables/useConnectionBanner.ts:12` (`downSince = Date.now()` at setup, state starts `connecting`).
- Spec, User stories 6-9: the banners are about a connection that is lost and comes back: „Verbindung wird wiederhergestellt …“ after 2 s without connection, „Wieder da“ once the connection is back.
- On a first load where the token fetch plus the WebSocket handshake take more than 2 s (cold Durable Object, slow mobile network), the page says „Verbindung wird wiederhergestellt …“ (nothing was lost yet) and then „Wieder da“ for 2 s.
- Fix: start `downSince` as null until the room has been open once, or skip the banner until the first `open`.

#### P6. `NUXT_PUBLIC_REALTIME_URL` is documented as an alternative, but the server reads only `REALTIME_URL`
- `README.md:27` („Nuxt also reads `NUXT_PUBLIC_REALTIME_URL` at runtime“), `server/utils/room-notifier.ts:73` (`realtimeUrl()` = `process.env.REALTIME_URL`), `nuxt.config.ts:52`.
- Spec § Room access: „Vercel gets … the Worker URL (public runtime config)“. The wizard sets `REALTIME_URL`, so the intended path works. Someone who follows the README and sets only the public variable gets a client that connects (`enabled` true) and a server where `room.post.ts` answers `no_live_connection` (503) and the notifier is a no-op. The client treats a 5xx as retryable and asks again every 5 s for ever (`useEventRoom.ts`, `TICKET_RETRY_MS`).
- Fix: drop the sentence from the README, or read `useRuntimeConfig().public.realtimeUrl` on the server too.

#### P7. Behaviour not in the spec (all low risk, listed for the record)
- `server/dev/sign-in.ts` + module in `nuxt.config.ts` (PR #193, retro 1.3): a dev-only sign-in. Registered only when `nuxt.options.dev`, the handler also refuses when `NODE_ENV === 'production'`, and `test/build/dev-sign-in.test.ts` scans the production build for the route. No finding; it is outside #153.
- The Worker's publish endpoint (`realtime/src/room.ts` `onRequest`) fans out any well-formed envelope from Nuxt, including `presence.*` and `clock.pong`. Only a signed call from Nuxt gets there, so no exposure.
- `HowWePlayCard` keeps „Bearbeiten“ after the start (user decision, listed as decided).

---

### Spec check of the fix pass (`git diff 5c351cd c5bb1c8`)

**Session numbering is consistent in every place that shows or uses it.** One function, `numberedSessions` (`server/domain/session.ts:39`), started Sessions in start order, then dated ones by Date, then undated ones without number; a single Session has no number.
- Server Event read: `sessionSection` and `startSection` (`event-read.ts:95`, `:142`) both call it on `SessionRow`s, which carry `startedAt`.
- Home: `index.get.ts:43` selects `startedAt` and passes the rows through `numberedSessions` before `homeSession`.
- .ics: `ics.get.ts` passes `eventSessions()` rows (full `SessionRow`) to `sessionEntries`, which numbers through the same function and titles entries by it; `CalendarSession` gained `startedAt`.
- SEQUENCE: `changeSessions` compares `numberedSessions(before)` with `numberedSessions(after)`, so every change that can renumber (add, remove, set Date, reschedule, reopen) raises the right entries. The start itself does not need to: it picks the earliest dated unstarted Session, which already holds the next number after the started ones, so no number moves. I walked through added-earlier-than-started, two started in a row and undated→dated cases; none renumbers a started Session.
- Feed: `shownNumber` reads the Sessions after the write inside the same transaction (`start.post.ts:28`, `end.post.ts:18`); the group headers read the Event read's `number` (`feedSessions`).
- Page head and dock: `eventPageState` and `hostDockState` read `number` from the view; the „Session m“ for a Session that still polls is `dated Sessions + 1` (`pollingNumber`), which equals the next number because started Sessions are always dated.
- Stored numbers in older feed entries (`date_set`, `session_removed`, …) are the number at the time of the write by design (#159); they can be stale after a later renumber. Not a finding.

**The Team size floor change holds under the lock.** `settings.patch.ts` runs through `changeEvent({ hostOnly, lock: 'update' })`; `loadEvent` takes `SELECT … FOR UPDATE` on the Event row; `settingsFloors(tx, id, teamCount)` then reads the seats in the same transaction. Every writer of seats takes the same lock (`move`, `team-word`, `reset-name`, `sessions/start`, the settings change itself), so no move can land between the floor and the write (the invite join only adds Members on the Bench). A malformed `teamCount` in the body falls back to „all teams count“ and then fails `parseSettings`, so the lenient pre-parse cannot loosen the floor. The benching runs after the settings write in the same transaction and throws as one. In a running Event `teamCount` is locked, so the shortcut cannot be used to move locked Players.

**The moved dialogs keep their behaviour.** `EventHostDialogs.vue` and `useHostActions.ts` are a move: the same send options (`busy`, `done` closes only on success), the same `v-if` conditions (`pollOpen` for the Slot editor, `view.settings` for the start dialog, `canChangeSessions` for the add sheet, a dated `rescheduleSession` for the reschedule dialog), the same preselect order (picked Slot → Best slot → earliest future Slot), the same disabled reason for „Termin festlegen“ (`dateBlockedKey` equals the old „no Slots / none in the future“ pair), and the same action sets per state. `firstStart` is now `!hasStarted(sessions)`, the old `every(startedAt === null)`. The page opens the dialogs through the exposed methods; an unmounted ref (non-Host) makes the call a no-op, which the Host-only dock never triggers.

---

### Checked and fine

- **Room access** (stories 13, 72, 73): `room.post.ts` uses `loadEvent` (401 / 404 / 410); the token is HS256 with `sub`, `evt`, `host`, `exp` (60 s), `jti`; the Worker checks Origin (exact match), signature against current and previous key, expiry and `evt` = room name; the Durable Object is reachable only through `routePartykitRequest` with `onBeforeConnect` / `onBeforeRequest`; publish calls need a timestamp within 60 s and an HMAC over `timestamp.body`. Every refusal is the same status class.
- **Hidden wheel secrecy** (stories 69, 71): the room has one data-carrying message (`activity.added`) and its params hold ids, numbers and instants only; `event.changed` has no payload; the Event read keeps `poolsSection` as the only place with pool games, filtered by `canSeePoolGames`, which the image route shares; Host-only fields (`start`, `settingsFloors`, `inviteUrl`) are null for Members.
- **Authorization:** `move` (Player only themselves, Host anyone, non-Member id → 404 `member_not_found`), `team-word` (own seat only, Player in a team), `reset-name`, `sessions/start`, `sessions/end`, settings, slots, confirm, reschedule, reopen, remove and rotate are `hostOnly`; the feed and the room token are members-only; deploy-check is 401 without a valid signature.
- **Races:** all Event writes serialize on the Event row lock (`for update`); votes take a share lock, so they wait for a Date being set; the last-slot race re-counts under the lock and answers `team_full` with the winner; `unique index sessions_one_running_per_event_idx` backs „at most one Running Session“; `team_word` and `team` checks in 0010/0011 match what `seatMember` writes, and `hasSpace` is a superset of Postgres `\S`, so the API refuses before the database does.
- **Start/end rules:** earliest dated Session that has not started, no time check, first start freezes names into `event_teams` and sets the Phase, later starts do not; started Sessions refuse remove, reschedule and reopen (`session_started`); adding stays allowed; Date poll keeps running after the first start (`datePollOpen` gates vote, Slot edits, set Date, Home).
- **Teams and names:** Team choice rule, `moveRejection` order, Reopen leaves Players in teams, Bench ↔ Tribüne always free, frozen name vs. reset after the start (`null` = colour even with words), `seatMember` clears the word on every seat change, composed name in joining order.
- **Activity feed:** every type of story 64 is written in the transaction of its change; keyset paging on `(at, id)`; `role="log"`; empty state; groups „Vor dem Start“ / „Session n“; „{name} ist dem Event beigetreten“.
- **Deploys and operator:** workflow `paths` match the Worker's imports (unit test), production deploy refused on a game day with `workflow_dispatch` override, staging and production Workers separate with `JURISDICTION=eu`; wizard exists; `release.md` has „No game days“.
- **Housekeeping from the spec:** ADR 0001 closing note present; „Spielbrett im Rohbau“ zone and `brett` route gone (`/e/<slug>/brett` falls to the generic Construction page); migrations 0008–0012 have migration tests for 0010-0012; „Was ist neu“ (#184) accepts only well-formed versions up to the current Release and never lowers the stored value.
- **Known and excluded:** Home construction card copy (orchestrator's list), the decided items of the context file.


## Thermo-nuclear + architecture review: Release 1.4 "Teams" (v1.3.0...origin/staging)

Reviewer axis: thermo-nuclear code quality plus deepening opportunities (vocabulary of `codebase-design`: module, interface, depth, seam, adapter, leverage, locality). Read-only. Code read from a `git archive` of `origin/staging` (scratchpad `stg/`). The diff is 260 files, about 19k added lines, of which a large share is tests. Drizzle `meta/*.json` ignored. What the fix pass `5c351cd..c5bb1c8` already did is not repeated.

Severity: **blocking** = must not reach `main` as it is. **should-fix** = before the Release PR or right after. **nit** = optional. Findings are numbered A1... in rank order of payoff.

### Result

- **Blocking: 0. Nothing in this axis has to change before 1.4 reaches production.** No file crosses 1k lines (largest touched files: `DateTimeField.vue` 495 and untouched, `EventPage.vue` 461, `GameBoard.vue` 390, `HostDock.vue` 352). No migration (0008-0012) carries a design trap: the checks and the partial unique index in the schema hold the invariants, and the only structural cost, the `activity_type` enum, needs a migration per release but not a fix now (A6).
- **Before the Release PR (optional, minutes):** delete two pieces of dead code (A7: the unused `sentence` prop of `EventSettingsSummary` with its stale comment, and the test-only `activityText`).
- **1.5 planning:** A1 to A6 are the places where the Glücksrad work (`docs/roadmap.md` § 1.5) will step on today's structure. A1 is the one worth doing as the first, preparatory ticket of 1.5, because every later 1.5 ticket touches it. A2 is a design decision that must be settled in the 1.5 grilling before tickets are cut, because ADR 0013 and the Worker as built disagree about who owns timers.
- The 1.4 architecture is good. The Event mutation seam (`changeEvent`), the section-builder Event read, the `RoomNotifier` seam, the pure shared rules and the stateless Worker are deep modules that 1.5 can build on without rework. See "Checked and fine".

---

### Must change before 1.4 reaches production

None.

---

### Ranked by payoff for 1.5 (planning, not release gates)

#### A1. "A Session's state" has no home, and its rules sit in the Game board file (should-fix; do as 1.5 ticket zero)

The Session lifecycle is `undated -> set -> running -> ended`, and it is the thing 1.5 hangs everything on (a game round belongs to a running Session; the Coin flip is "any time during a running Session"; Bonus Veto is "before the Event runs"; the Hidden wheel lock depends on it). Today there is no module for it. The question "has this Session started / is it running / which is next" is answered in nine places, three of them with different spellings:

- `shared/board.ts:139-175`: `hasStarted`, `isRunning`, `runningOf`, `nextSession`, `startRejection`, in a file whose header says "Game board rules". Roughly the last 60 lines of that file are Session rules, not board rules.
- `server/domain/session.ts:20`: `isStarted` (a second predicate for the same fact, a type guard for `Date`s).
- Inline `session.startedAt !== null` at `server/api/e/[slug]/sessions/[id]/reopen.post.ts:17`, `.../reschedule.post.ts:21`, `.../[id].delete.ts:20`.
- `app/components/EventSessions.vue:54`: `session.startsAt === null ? 'poll' : session.endedAt ? 'ended' : session.startedAt ? 'running' : 'set'` (the four-state model exists, but only as a local ternary).
- `app/utils/event-page.ts:55-72`: `eventPageState` re-derives `running`, `ended`, `started`, `next` from the same rows; the view also ships `runningSessionId` next to `startedAt`/`endedAt`, which the client can derive.
- Two sources for "the first Session has started": `settingsLocked(phase)` (`shared/settings.ts:249`, used by the server's lock) against `hasStarted(sessions)` (used by `HowWePlayCard` for the lock icons and by `GameBoard`). They agree today only because `start.post.ts` writes `phase = 'running'` in the same transaction.
- `teamChoiceOf(...).started` is used as a "has started" probe in `team-word.post.ts:19` and `reset-name.post.ts:18`: it loads settings and Sessions to read one boolean, and its name does not say so.

Deletion test: delete `isStarted`, `hasStarted`, the three inline `!== null` and the ternary, and the knowledge reappears in nine callers. A module would concentrate it.

Fix (code judo, behaviour unchanged): one `shared/session-state.ts` whose interface is `sessionState(s): 'undated' | 'set' | 'running' | 'ended'` plus `hasStarted`, `runningOf`, `nextSession`, `startRejection` moved out of `shared/board.ts` (which keeps places, moves, seats, Team names). Rows and views both satisfy it structurally (they already use `unknown` for the instants). The three `*Rejection` inputs take a `state` instead of three booleans; `EventSessions` and `eventPageState` read the state instead of redoing the ternary; `settingsLocked` stays the Phase rule but gets a one-line note that it equals `hasStarted`. A small `eventHasStarted(tx, eventId)` in `server/utils/sessions.ts` replaces the `teamChoiceOf().started` probe. Leverage: 1.5 adds "round" and "Coin flip is allowed" as one more arm instead of a tenth call site. Locality: the start rule, the lock rule and the page states stop drifting.

#### A2. The realtime room has no timer seam, and ADR 0013 says timers are the room's job (should-fix; settle in the 1.5 grilling before tickets)

ADR 0013 states that timed moments needing a single clock "(the 1.5 wheel stop and veto window alarms) are the room's job, but their outcome is still written through Nuxt". The Worker as built cannot take that job without a redesign:

- `realtime/src/room.ts:106` `onAlarm` is hard-wired to the presence sweep. A Durable Object has one alarm slot; `#keepSweeping` (line 97) sets it and `onAlarm` re-arms it only `if (open > 0)`. A veto-window alarm would have to share that slot, and a sweep that finds no open socket ends the alarm chain.
- `onRequest` (line 127) accepts only `{ messages: Envelope[] }` and broadcasts them verbatim and at once. There is no "send this at instant T".
- "The room keeps no Event state" (ADR 0012) is what makes a Worker deploy safe. A scheduled message in DO storage is Event state. Either the room stores a tiny schedule (and the deploy guard must treat a pending schedule like a running Session), or Nuxt stays the owner of the deadline and the clients react to `serverTime`-stamped instants (a wheel stop at `T`, a veto window until `T`), with the room only relaying. The second needs no Worker change and fits "Nuxt decides, the room relays", but then the ADR sentence should be amended and the Event read must be time-gated (see below).
- Two clocks feed one `serverTime` field: `afterCommit` stamps Nuxt's `Date.now()` (`event-access.ts:66`, the Vercel clock) while the room stamps its own for `clock.pong` and presence (`room.ts:44`, Cloudflare). The client's offset is estimated only from the Worker's `pong` (`useServerClock.ts`). A 1.5 instant stamped by Nuxt and shown against a Worker-derived `now()` has the inter-platform skew inside the 50 ms budget of the spec. Pick one stamp source for "moments" (Nuxt, written into the message as an explicit `at`) and say so in the protocol.
- Hidden wheel: the room sends identical bytes to every socket (`this.broadcast`), so there is no per-viewer filter at the room. The only secrecy-safe shape is: messages carry no game data, and the Event read returns the drawn game only once `serverNow >= revealAt` (for non-Hosts). `canSeePoolGames` in `server/domain/pool-visibility.ts` already says "1.5 adds the drawn games branch here"; that branch needs a `now`/`revealAt` input, which today's `{ isHost, hiddenWheel }` signature does not have.

Fix: not code now. Put "who owns the deadline" as the first question of the 1.5 grilling, and amend ADR 0013 with the answer. If the answer is "Nuxt owns it", 1.5 needs no Worker deploy at all (which also dodges the game-day guard).

#### A3. The settings lock is phase-only, and the "So wird gespielt" card keeps its own copy of the summary (should-fix; before the 1.5 Hidden wheel lock)

1.5 requires "The Hidden wheel can't be switched during a spin or veto window" and a Veto allowance floor from spent Vetoes. Today:

- `checkSettingsChange(current, change, { phase, floors })` (`shared/settings.ts:285-306`) can only lock by Phase (`LOCKED_WHEN_RUNNING` is a static key list). A lock that depends on round state has no place to attach. `settingsFloors` returns `vetoAllowance: 0` as a stub with the comment "plugs the most Vetoes a Party has spent in here" (`server/utils/settings-floors.ts:16`). Extend the context (`{ phase, floors, round }`) as part of the first 1.5 ticket that adds a round, and make the lock list a per-key function `lockOf(key, ctx): 'open' | 'locked'` instead of a constant, so the server rule and the UI read the same thing.
- `app/components/HowWePlayCard.vue:36-55` rebuilds the summary rows next to `summaryRows` (`app/utils/settings-summary.ts`), appends the Vetos into the Mode string, and keeps `ROW_SETTINGS` (row to setting keys) to decide which row shows a lock. That mapping is the client's own copy of what `LOCKED_WHEN_RUNNING` means; the day 1.5 adds a state-dependent lock, the icons and the server rule can silently diverge. Let `summaryRows` return the keys each row stands for (or the row's lock state from the shared function) and let `HowWePlayCard` render them. That deletes `ROW_SETTINGS`, `fixedWhenRunning` and the parallel row list.

#### A4. Adding a block, a dock action or a page state to the Event page touches four places (should-fix; worth doing when the first 1.5 block lands, not before)

`EventPage.vue` (461 lines, fine in size) is the orchestrator the 1.5 round surface will plug into. Each new block currently means: the `Block` union (`EventPage.vue:97`), the `order` switch (line 99), a `v-else-if` branch in the template, and for dock actions the per-primary arrays in `useHostActions.ts` (`[start, ...dates, invite, ...datesOnly, settings]`, `[end, invite, ...]`). 1.5 adds a round block, "Nächstes Spiel setzen", Coin flip and Countdown, all inside the `running` kind, so the `running` arm of both lists grows.

Shape to aim for: `eventPageState` returns `blocks: Block[]` (and `pollCompact`, `cardsStandOut`), since it already knows the kind. Then `order`, `pollCompact` and `cardsStandOut` leave the component, become pure and are unit-tested in `test/unit/event-page.test.ts` (which already exists). For the dock, build each kind's list from named parts (`primary`, `secondary`, `more`) rather than hand-ordered spreads, so a new action is one entry plus a `place`. Also move the phone view/tab/unread block (`EventPage.vue:150-185`, about 35 lines of leaf state) into a `useEventTabs(room)` composable and the four text computeds (`seatNote`, `teamsStay`, `pill`) next to `pagePill` in `utils/event-page.ts`. None of this is urgent; do it with the first 1.5 ticket that adds a block, so it is shaped by a real second use.

#### A5. Every committed change waits up to 2 s for the Worker inside the HTTP request (should-fix; check for 1.5)

`changeEvent` awaits `afterCommit` (`server/utils/event-access.ts:52`), which awaits the signed POST to the Worker with a 2 s timeout (`ROOM_PUBLISH_TIMEOUT_MS`, `room-notifier.ts:21`). The response, and so the actor's `send` and its refetch, wait for it. With the Worker healthy that is tens of ms. With the Worker down, slow or mid-deploy, every write (vote, move, start) takes 2 s longer, and the fallback polling is the only recovery. For 1.5 the Host's "draw" call adds this hop to a moment the whole room watches. The notifier already never throws and a missed message is made up by the refetch, so nothing depends on waiting. Hand the publish to `event.waitUntil` (Nitro supports it on the Vercel preset; verify with a staging check, and note that `memoryRoomNotifier` in tests keeps working because it records synchronously). Interface change: none.

#### A6. Activity: people are found by a naming convention, and every release needs an enum migration (should-fix for 1.5; two small points)

- `server/utils/activity.ts:34-38` `paramUserIds` resolves names for any params key literally called `userId`. Only `member_moved` has one today. 1.5's Bonus Veto ("the Host grants one Party a Veto") and any entry that names a Member, a Party or a team under another key will render an empty name (`people.get(id) ?? ''`). Make it explicit: one `ACTIVITY_PEOPLE: { [T in ActivityType]: (p: ActivityParams[T]) => string[] }` next to `ACTIVITY_TYPES` in `shared/activity.ts`, so adding a type forces the author to say who is named (a missing entry is a type error, which the current convention is not).
- `activity_type` is a Postgres enum built from `ACTIVITY_TYPES` (`server/db/schema.ts:207`, migration 0009). The comment says "later tickets need no enum migration", true for 1.4, but 1.5, 1.6 and 1.7 each add types (draw, veto, bonus veto, coin flip, countdown, result, finish, ceremony), so each release needs an `ALTER TYPE ... ADD VALUE` and a lockstep edit of the TS list, with no gain: `readEntry` already validates the type on the client and `recordActivity` is typed per type on the server. Consider turning the column into `text` in the first 1.5 migration that touches activity. If the enum stays, accept the migration per release knowingly.
- The `params` rule "ids, numbers and instants only, never a game" (stories 69, 71) is enforced only by the `ActivityParams` types and a comment. 1.5 is the first release where a draw entry is tempting to write with the game's name. A type constraint on `ActivityParams` (values limited to ids, numbers, instants and `Place`) would make the rule mechanical; otherwise state it in the 1.5 spec as a review rule.

#### A7. Dead code and test-only wrappers left in the diff (nit; do before the Release PR if desired)

- `app/components/EventSettingsSummary.vue:14-16,25-31`: the `sentence` prop is never passed (`HowWePlayCard` dropped it; `neu.vue:79` renders `settingsSentence` itself). The header comment (lines 5-8, "the Event page reuses it as „So wird gespielt“ (#148)") is now false. Delete the prop, its branch and the comment sentence.
- `app/utils/activity.ts:18-20`: `activityText` is a pass-through to `sentence` that only `test/unit/activity.test.ts` calls; the feed uses `activityParts`. Either point the tests at `activityParts` (join the parts) or export `sentence` under that name. A thin wrapper kept alive for tests is exactly the indirection the skill flags.
- `app/utils/activity.ts:24-26`: the bold markers are control characters `\u0001`/`\u0002` injected into i18n parameters and split out again. A display name containing U+0001 breaks the bolding; the names are user data. Low risk, but a magic mechanism where `<i18n-t>` slots (or splitting on the `{name}` placeholders) would be direct. Only worth changing if the feed grows; note it.

#### A8. GameBoard carries three layers of "where is everybody" (worth exploring; do not generalise yet)

`GameBoard.vue` (390 lines, script about 230) composes the server's places (`placeOf(member)`), `heard` (moves the room announced, kept up to `HEARD_MS` = 5 s with per-user timers, `GameBoard.vue:51-80`) and `pending` (the viewer's own optimistic moves, in `useBoardMoves`). Its `people` computed (line 53) merges them. The FLIP measuring (`layout` watchers) and the menu/announce logic live in the same file. A `useBoardPlaces(members, room)` returning `placeOf(userId)`, `move`, `bounced` would shrink the component by the first two layers and make "the room says X now, the refetch confirms it" testable without mounting the board.

Rule from `codebase-design`: one adapter is a hypothetical seam. 1.5 may need the same provisional-until-confirmed pattern for a veto or a wheel stop, but not necessarily in this shape. Extract the board-internal part when GameBoard is next touched; extract the generic mechanism only when 1.5 has a second user.

---

### Nits

#### A9. Smaller things, in one list (nit)

- `shared/board.ts:14` `placeOf`: `row.zone === 'team' && row.team !== null ? ... : { zone: row.zone === 'stands' ? 'stands' : 'bench' }`. A `team` row with a null `team` silently becomes the Bench. The DB check `event_members_team_zone_check` makes that impossible, so the fallback hides an invariant instead of stating it. Fine to keep as the defensive default, but say so in the comment, or return the invariant in the type.
- The zone literal `'bench' | 'stands' | 'team'` is written four times (`shared/board.ts:14`, `shared/event.ts:149`, `server/utils/event-read.ts:39`, `server/db/schema.ts:128`), unlike `PHASES`, `ACTIVITY_TYPES` and `SUITABILITIES`, which are one shared constant that the schema imports. Add `ZONES` to `shared/board.ts`, import it in the schema.
- `app/components/EventSessions.vue:50-52` recomputes the number a still-polling Session "will have" with `polling += 1`, next to `pollingNumber` in `app/utils/event-page.ts:35`. Use the helper in both.
- `server/utils/board.ts:60-72` `teamChoiceOf` returns `{ settings, started, open }` for three different callers; two of them want only `started` (see A1). It is fine as a read-model helper once `eventHasStarted` exists.
- `realtime/scripts/deploy-check.mjs:10` hard-codes the production URL as the default `DEPLOY_CHECK_URL`. Acceptable for a one-site product, but a staging run of the script without the variable will ask production.
- `shared/activity.ts` and `shared/realtime.ts` import types from `shared/board.ts` and each other. They are type-only and erased, so the Worker bundle is safe (`test/unit/realtime-deploy-paths.test.ts` guards the paths), but `shared/realtime.ts` importing `ActivityEntry` ties the protocol file to the whole Activity feed shape. Fine today.

---

### 1.5 hooks that are already in the right place (so the planning can lean on them)

- `canSeePoolGames` carries a comment for the drawn-games branch (needs `now`/`revealAt`, see A2).
- `RoomMessage` is an open union that Nuxt can extend without a Worker deploy; the Worker validates only `v` and `type`. New 1.5 messages cost no deploy.
- `settingsFloors` already has the `vetoAllowance` slot, `veto_allowance_below_spent` exists in `shared/errors.ts`, and `recordActivity` is typed per type through `ActivityParams`.
- `useServerClock` exposes `now()` and `synced` and is already mounted on the page's one socket.
- `eventPageState` returns a `running` kind with the Running Session's number, the natural parent for a round block.

---

### Checked and fine

- **`changeEvent` is a deep module.** One entry point, fixed order (401, body, transaction, `loadEvent`, rule, commit, room), queued `publish` that a throwing change drops with its transaction, `event.changed` added automatically so an endpoint cannot forget it. The Event handlers shrank because of it; the invite join is the one justified exception and says why.
- **The Event read as section builders** (`server/utils/event-read.ts`): `readEventRows` runs the six reads in parallel with the pools; each section is a pure function of the rows and the viewer. Adding a 1.5 `roundSection` is one function and one spread in `[slug].get.ts`. The Hidden-wheel comment sits at the exact place that needs it.
- **The `RoomNotifier` seam is real** (rule: two adapters is a real seam): `httpRoomNotifier`, `memoryRoomNotifier`, and the no-op default, selected in `useRoomNotifier`. The tests cross the same interface the handlers use.
- **Rules are pure and shared.** `moveRejection`, `startRejection`, `teamChoiceOpen`, `composedTeamName` live once in `shared/` and are imported by the server (to enforce), by the board (to show the same reason) and by the Worker's type imports. After the fix pass there is one `moveMember`, one `seatMember`, one UUID check.
- **Database invariants are in the database.** `event_members_team_zone_check`, `team_joined_at` and `team_word` checks, `sessions_ended_after_started_check`, the partial unique index `sessions_one_running_per_event_idx`, `event_teams` primary key. A lost race ends in the row lock plus these checks, not in client trust. Migrations 0008-0012 are additive and ordered.
- **Atomicity.** Start, first-start freeze (`freezeTeamNames`), phase write, Activity entry and queued messages are one transaction under `lock: 'update'`; the lowered team count benches Players in the same transaction as the settings write (`applySettingsChange`).
- **The Worker is small and stateless.** 143 lines in `room.ts`, presence derived from the open sockets (survives hibernation), auth checked once in `index.ts` before the room sees a request, `jurisdiction` and Origin allowlist set. It imports only `shared/`.
- **Single owners on the client.** `useEventView` is the one owner of the Event read (page and settings editor share the key), `useEventMutation` the one write path, `useEventRoom`/`createRoomSocket` the one socket (tests swap the factory), `useEventMutation`'s `refused`/`refusalText` replaced three hand-rolled catch blocks.
- **`HostDock` is data-driven** (`DockAction[]` with `place`, `primary`, `hold`, `disabledReason`); the dock itself does not need to change for 1.5, only its builder (A4).
- **Sizes.** No file near 1k. New components are small and single-purpose (`TeamChip`, `TeamMark`, `BenchZone`, `TeamZone`, `SidePanel`, `TabBar`, `ConnectionBanner`), and the fix pass already took `EventHostDialogs` and `useHostActions` out of `EventPage`.
- **No casts that hide design.** The two intentional ones are commented where they sit (`activityEntries` pairing type and params once; `receive` in `useEventRoom` for the handler map).
- **Dead-code sweep** found only A7. `slotsEditable`, `canStartSession`, `DateSetCard.vue` are gone with no leftover references.
