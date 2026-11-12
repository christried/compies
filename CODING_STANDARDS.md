# Coding standards

What the Standards review checks in COMPIES, on top of `GLOSSARY.md`, the ADRs and `docs/agents/`. Rules a tool can check live in `eslint.config.mjs` and the tests; this file holds the judgement calls.

## One home per concern

Each concern below has one home. New code calls it; a second copy is a finding even when it works. The 1.3 review found the same failure as the review before it: a feature repeating a pattern the codebase had just collapsed (`docs/reviews/review_1.3_2026-10-28.md`, Part 3).

| Concern | Home |
|---|---|
| A change to an Event: user, body, transaction, locked Event load, publish after commit | `changeEvent` in `server/utils/event-access.ts` (#183; lint refuses `.transaction(` in `server/api/e/**`); Session changes through `changeSessions` in `server/utils/sessions.ts`, which calls it |
| The facts a rule runs on (Sessions, seats, Rounds with draws and Places, Vetoes, Bonus Vetoes, Game pool, latest Coin flip) and each rule's reason for a User at `now` | `readEventState` and the `…Reason` functions in `server/utils/event-state.ts` (#416): the Event read and every write route under `changeEvent` take their facts from it, in the parts their rules need; `test/integration/lock-statements.test.ts` holds the statement budget under the lock |
| A rule both sides enforce (name length, clip, player count, points table, settings) | a pure function in `shared/`, called by the form and by the server parser |
| Request input | `unknown` until a domain parser has checked it; `asRecord`/`isRecord` from `shared/record.ts`, no casts (lint) |
| A User's visible name | `shownName` in `shared/auth.ts` (lint) |
| Text length | `characterCount` in `shared/text.ts` |
| Dates and times shown to Users | `app/utils/berlin-time.ts`, `shared/time.ts` |
| An API error shown to Users | `reasonKey` / `apiErrorKey` and their table in `app/utils/api-error.ts` (a screen's own words are a screen entry there, not an override at the call site; `test/unit/api-error.test.ts` checks every code × screen); Event page actions through `useEventMutation` |
| A notice, hint or error line in a page | `NoticeBanner` with its tone |
| Searching and filtering games | `GameBrowser` |
| Creating or editing an Event's settings | `EventSetupWizard` |
| What a viewer may know of a drawn game | `drawGameKnown` (pure) in `shared/draw-timeline.ts`, `stoppedDraws` (SQL) in `server/utils/draw-timeline.ts` (#258, #414) |
| What a viewer may know of the Veto allowance | `settingsForViewer` in `shared/settings.ts` (#453): the Event read's `settings` goes through it; the state and the rules keep the true number |
| A Draw's instants and what each decides (due, game known, window open or ended, Vetoes sealed, the Clip's window, a game's clip length (`clipLengthOf`)) | `shared/draw-timeline.ts`; its SQL twins `stoppedDraws`, `dueDraws` and `movedVetoEnd` (the window's end after a skip; JS side `vetoEndCap`, `vetoEndAfterSkip`) in `server/utils/draw-timeline.ts`, and the Activity feed's own `lte(activity.at, now)` for `INSTANT_ACTIVITY_TYPES` in `server/utils/activity.ts`, kept in step by `test/integration/draw-timeline.test.ts` (#413, #414, #506, #546) |
| A GET that must show a settled state (a draw whose instant has passed) | `settleBeforeRead` in `server/utils/rounds.ts` (#229): one cheap select when nothing is due, else a locked transaction that calls `settleDue`. A write goes through `changeEvent`, which settles by itself (#259); lint guards `server/api/e/**` only, so a new timed read calls `settleBeforeRead` instead of opening its own `for('update')` |
| A stage piece: its block and place per page state, who sees it, the moment it rises at, the instants the page reads again at | `app/utils/event-stage.ts` (#415: one row per piece; a new piece is a row there and its component) |

A second page, flow or component that does what an existing one does needs its reason in the PR description. Without one, the review asks for the existing module to grow instead.

## Database

- A column a request filters or joins on gets its index in the same migration.
- An enum belongs to one glossary term. A concept with its own term gets its own enum, even when today's values match (games' Suitability is not the Event's Format).
- A migration that has run on staging is never edited; the fix is a new migration.
- Migrations run in the Vercel build while the previous deployment still serves (ADR 0007). A data migration keeps the app correct for the rows the old code writes after it ran: 0013 renumbered the seen versions, and the old code could store `1.4.0` again until the switch-over (#242).
- A change of an Event takes its instants from `EventChange.now` and never calls `useClock` in a handler; `changeEvent` settles due draws for every `lock: 'update'` change, so a writer that reads round state cannot forget to (#259).

## Secrecy

What a feature keeps from some Users (a sealed Veto, a Hidden wheel before its stop), and what it starts showing to Members. Every 0.7 miss sat on a surface the brief or the review had not named.

- A change whose existence is secret commits with `changeEvent(…, { broadcast: false })` (ADR 0013). The `event.changed` that follows every other commit tells every Party that something happened.
- A value derived from secret rows is secret too, in every section of the read and in every message, Host-only ones included. The Host's `floors.vetoAllowance` counted sealed casts (#231), and the Hidden wheel's slice order gave its result away (review 0.7, spec S1). `knownVetoRows` in `server/utils/vetoes.ts` is the one filter for what a viewer may know of the Vetoes; it asks `vetoesSealed` in `shared/draw-timeline.ts` (#414) whether a window still seals them.
- The Veto allowance is secret from every Member but the Host until the Event's first Session starts (#453). Only the Event read's `poolsSection` masks it, through `settingsForViewer`; `test/integration/veto-allowance-secrecy.test.ts` searches the Player's reads, feed, room messages and every GET route for the number.
- A feature that shows Members something they didn't see before (a player, a picture, a thumbnail, an image route) is checked against every section of the Datenschutzerklärung that says who sees what. In 0.7 both the YouTube section and the image section still said only Hosts; the user approves the new text (§ Copy).
- A read, feed entry or message that names a drawn game goes through `drawGameKnown` (`shared/draw-timeline.ts`) or `stoppedDraws` (`server/utils/draw-timeline.ts`) (#258, #414). A copy of the `stopAt <= now` comparison is a finding: `<` instead of `<=` leaks under a Hidden wheel, and the room carries no game data but `activity.added`. The one copy that stays is the Activity feed's `lte(activity.at, now)` for `INSTANT_ACTIVITY_TYPES` in `server/utils/activity.ts` (a `game_drawn` entry's `at` is its draw's `stopAt`, #413); it is pinned against these two, so a new surface of the stop edge goes on the list in § One home per concern.

## Motion

- An animation takes the curve and the duration that `docs/design_handoff_compies/04-motion.md` names for its moment, as that entry's tokens (`--cp-ease-pop`, `--cp-dur-slow`). The 1.4 walk-through found a Flip on `--cp-ease-out` that read as a jump where 04-motion asks for `EASE.pop` (#208).
- Its test asserts that easing and duration, as well as that something animated.
- Inside the GSAP timelines (ADR 0015, the Award ceremony's Pokal-Lauf) the eases are GSAP's named eases as `04-motion.md` writes them (`back.out(2.2)`), not `--cp-ease-*`, and their test reads the tween vars (`ease`, `duration()`) off the built timeline.
- An animation that lands on a result (the coin's face, the wheel's slice) also has a test that the landing shows that result. The coin landed on the wrong face in 0.7, and only the browser check saw it (#235).
- A motion's static fallback (reduced motion, a failed chunk, a skip) has a test for its geometry, as `test/unit/ceremony-run.test.ts` pins where Compibert stops. In 0.9 a review fix put Compibert at left 0 under reduced motion, no test pinned the stop, and only a deviation note surfaced it.
- A `<Transition>` that mounts inside a pending Suspense runs no Transition hooks, so its enter does not play. #498 found it in the Event page's header on a client-side switch, where `setup` awaits the data; the fix mounts row 2's Transition once the header is mounted.
- A padding change on an ancestor, in the render that resizes a block above the scroll anchor, drops Chrome's scroll anchoring, and the anchored block jumps. #541 measured it on the stage group's `padding-bottom` for the Veto bar; the room is now a sibling element.

## Tests

- Test data has the shape production data has. A Member that a test renders (avatar, Game board, lists of people) comes with a picture, as every Discord and Twitch account does: the 1.4 board tests drew only initials, so the picture's own drag reached the walk-through (#207). Tests that draw a Member build it with `memberView()` in `test/nuxt/event-page.ts`.
- A list, a wheel or a count is tested at its edges: 0, 1 and 2 items, and the longest name allowed (`GAME_NAME_MAX`; the wheel cuts at its `LABEL_MAX`). A wheel with one game drew a blank circle with „1 Spiele auf dem Rad“, and long names ran under the hub; the tests and three browser checks had used typical pools only (#263).
- A read section that grows with each ticket (`setGame`, the Event read's sections) is asserted with `toMatchObject` or a fixture builder, not `toEqual` on the whole object. #231's new `respin` field broke `rounds.test.ts`.

## Copy

- UI copy uses the glossary's UI word. When the glossary retires a word, it goes into `RETIRED` in `test/unit/copy.test.ts`.
- Copy promises only what the app does today. A string the spec prescribes word for word is decided; the review names it only when the app has changed since the spec.
- A new third party the browser or the server talks to goes into the Datenschutzerklärung; `test/unit/privacy-hosts.test.ts` names the host, and the user approves the text.
