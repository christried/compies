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

## Copy

- UI copy uses the glossary's UI word. When the glossary retires a word, it goes into `RETIRED` in `test/unit/copy.test.ts`.
- Copy promises only what the app does today.
- A new third party the browser or the server talks to goes into the Datenschutzerklärung; `test/unit/privacy-hosts.test.ts` names the host, and the user approves the text.
