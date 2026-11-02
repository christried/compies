# Coding standards

What the Standards review checks in COMPIES, on top of `GLOSSARY.md`, the ADRs and `docs/agents/`. Rules a tool can check live in `eslint.config.mjs` and the tests; this file holds the judgement calls.

## One home per concern

Each concern below has one home. New code calls it; a second copy is a finding even when it works. The 1.3 review found the same failure as the review before it: a feature repeating a pattern the codebase had just collapsed (`docs/reviews/review_1.3_2026-10-28.md`, Part 3).

| Concern | Home |
|---|---|
| A change to an Event: user, body, transaction, locked Event load, publish after commit | `changeEvent` in `server/utils/event-access.ts` (#183; lint refuses `.transaction(` in `server/api/e/**`); Session changes through `changeSessions` in `server/utils/sessions.ts`, which calls it |
| A rule both sides enforce (name length, clip, player count, points table, settings) | a pure function in `shared/`, called by the form and by the server parser |
| Request input | `unknown` until a domain parser has checked it; `asRecord`/`isRecord` from `shared/record.ts`, no casts (lint) |
| A User's visible name | `shownName` in `shared/auth.ts` (lint) |
| Text length | `characterCount` in `shared/text.ts` |
| Dates and times shown to Users | `app/utils/berlin-time.ts`, `shared/time.ts` |
| An API error shown to Users | `apiErrorKey` and `CODE_COPY` in `app/utils/api-error.ts`; Event page actions through `useEventMutation` |
| A notice, hint or error line in a page | `NoticeBanner` with its tone |
| Searching and filtering games | `GameBrowser` |
| Creating or editing an Event's settings | `EventSetupWizard` |

A second page, flow or component that does what an existing one does needs its reason in the PR description. Without one, the review asks for the existing module to grow instead.

## Database

- A column a request filters or joins on gets its index in the same migration.
- An enum belongs to one glossary term. A concept with its own term gets its own enum, even when today's values match (games' Suitability is not the Event's Format).
- A migration that has run on staging is never edited; the fix is a new migration.
- Migrations run in the Vercel build while the previous deployment still serves (ADR 0007). A data migration keeps the app correct for the rows the old code writes after it ran: 0013 renumbered the seen versions, and the old code could store `1.4.0` again until the switch-over (#242).

## Secrecy

What a feature keeps from some Users (a sealed Veto, a Hidden wheel before its stop), and what it starts showing to Members. Every 0.7 miss sat on a surface the brief or the review had not named.

- A change whose existence is secret commits with `changeEvent(…, { broadcast: false })` (ADR 0013). The `event.changed` that follows every other commit tells every Party that something happened.
- A value derived from secret rows is secret too, in every section of the read and in every message, Host-only ones included. The Host's `floors.vetoAllowance` counted sealed casts (#231), and the Hidden wheel's slice order gave its result away (review 0.7, spec S1). `knownVetoRows` in `server/utils/vetoes.ts` is the one filter for what a viewer may know of the Vetoes.
- A feature that shows Members something they didn't see before (a player, a picture, a thumbnail, an image route) is checked against every section of the Datenschutzerklärung that says who sees what. In 0.7 both the YouTube section and the image section still said only Hosts; the user approves the new text (§ Copy).

## Motion

- An animation takes the curve and the duration that `docs/design_handoff_compies/04-motion.md` names for its moment, as that entry's tokens (`--cp-ease-pop`, `--cp-dur-slow`). The 1.4 walk-through found a Flip on `--cp-ease-out` that read as a jump where 04-motion asks for `EASE.pop` (#208).
- Its test asserts that easing and duration, as well as that something animated.
- An animation that lands on a result (the coin's face, the wheel's slice) also has a test that the landing shows that result. The coin landed on the wrong face in 0.7, and only the browser check saw it (#235).

## Tests

- Test data has the shape production data has. A Member that a test renders (avatar, Game board, lists of people) comes with a picture, as every Discord and Twitch account does: the 1.4 board tests drew only initials, so the picture's own drag reached the walk-through (#207). Tests that draw a Member build it with `memberView()` in `test/nuxt/event-page.ts`.
- A list, a wheel or a count is tested at its edges: 0, 1 and 2 items, and the longest name allowed (`GAME_NAME_MAX`; the wheel cuts at its `LABEL_MAX`). A wheel with one game drew a blank circle with „1 Spiele auf dem Rad“, and long names ran under the hub; the tests and three browser checks had used typical pools only (#263).
- A read section that grows with each ticket (`setGame`, the Event read's sections) is asserted with `toMatchObject` or a fixture builder, not `toEqual` on the whole object. #231's new `respin` field broke `rounds.test.ts`.

## Copy

- UI copy uses the glossary's UI word. When the glossary retires a word, it goes into `RETIRED` in `test/unit/copy.test.ts`.
- Copy promises only what the app does today. A string the spec prescribes word for word is decided; the review names it only when the app has changed since the spec.
- A new third party the browser or the server talks to goes into the Datenschutzerklärung; `test/unit/privacy-hosts.test.ts` names the host, and the user approves the text.
