# COMPIES thermo-nuclear code quality review, 2026-10-24

Whole repo at `staging` 0f6db8f (staging and main were in sync, so there was no branch diff to review). Standard: `.claude/skills/thermo-nuclear-code-quality-review/SKILL.md`, an intentionally strict maintainability review. It asks whether the structure could be **dramatically** simpler, not whether the code works.

**Relation to the audit of the same day** (`docs/reviews/audit_2026-10-24.md`): the audit looked for bugs, security and load, and filed #64–#68. This review looks at structure. Where the two overlap, this review supersedes the audit's unfiled "Nice to have" findings 6, 7 and 8 (now in T1, T3 and T8). It does not repeat #64–#68, but it notes where a structural fix here removes the cause of one of them (#65, #67).

**What I did:** I read every file in `app/`, `server/` and `shared/` (about 8,000 lines), plus the shape of `test/`. I ran one experiment: I annotated the Event read handler with its shared contract type and ran `pnpm typecheck` (T4; it fails, output quoted there). Then I reverted it. No repo code was changed.

**How to use this document:** each finding T1–T8 is a fix specification. The GitHub issue holds the same spec plus acceptance criteria. When you pick one up, read its section here for the reasoning, the code sketch and the traps. Update the **Status** column below when an issue closes.

---

## Verdict

**Not approved as-is.** The core is healthy: the domain rules are pure and tested, locking is deliberate, and no production file is near 1,000 lines. But several of the skill's presumptive blockers are present:

- **Incidental complexity with a visible code-judo move:** five Session handlers rebuild one pipeline by hand, including a hand-written copy of the state they just wrote (T1).
- **A rule scattered across shared code:** "number only with several Sessions" exists three times, and the copy that decides the calendar SEQUENCE got it wrong (#67, cause in T2).
- **Spaghetti growth from a missing state:** a `:key`-remount trick is copied into three components because `HoldToConfirmButton` can't reset (T6).
- **An unchecked boundary that has already drifted:** the Event read is not checked against `EventView` and doesn't match it (T4).
- **One file past 1k:** `test/nuxt/event-page.test.ts` (1016 lines), mirroring a page that does five jobs (T5).

## Findings

Ordered by the skill's priority: structural problems and missed simplifications first, then boundaries and decomposition, then legibility.

| ID | Finding | Category | Issue | Est. size | Status |
|---|---|---|---|---|---|
| T1 | One pipeline for every Session change | Missed code-judo move, non-atomic orchestration | #69 | ≈ -50 lines, -1 file | open |
| T2 | Number the Sessions once, one "several Sessions" rule | Repeated conditionals → missing model; boundary type | #70 | ≈ -25 lines | open |
| T3 | Open Slots and their Votes decided once | Copy-pasted logic that must change together | #71 | ≈ -10 lines | open |
| T4 | API answer types in `shared/`, every handler checked | Boundary / type contract | #72 | ≈ +10 lines | open |
| T5 | Split the Event page (and its 1016-line test) | Decomposition, file size, dead code | #73 | ≈ -30 lines, mostly moves | open |
| T6 | Self-resetting hold button, one mutation path | Spaghetti growth, two owners for one job | #74 | ≈ -30 lines | open |
| T7 | Use the canonical helpers on the client (7 items) | Bespoke copies of canonical helpers, identity adapter | #75 | ≈ -40 lines | open |
| T8 | Name length counted once, setup page uses `TextField` | Duplicated rule plus duplicated component | #76 | ≈ -25 lines | open |

Sizes are my estimates, not measurements. Together: roughly -200 lines net, with no behaviour change except the #67 fix that T2 brings with it.

---

### T1. One pipeline for every Session change (#69)

**Category:** missed code-judo move; non-atomic orchestration by convention.

**Where:** `server/api/e/[slug]/confirm.post.ts`, `server/api/e/[slug]/sessions/index.post.ts`, `server/api/e/[slug]/sessions/[id].delete.ts`, `server/api/e/[slug]/sessions/[id]/reopen.post.ts`, `server/api/e/[slug]/sessions/[id]/reschedule.post.ts`, `server/utils/sessions.ts`, `server/utils/new-date.ts`, `server/domain/phase.ts`, `server/api/e/index.post.ts`.

**What's wrong.** `server/utils/sessions.ts:9-11` describes a convention: *every* handler that changes Sessions reads them under the Event lock, writes, then calls `finishSessionChange` in the same transaction. Five handlers follow it by hand. The convention has three weak points:

1. **`after` is a hand-built copy of what was just written.** `finishSessionChange(db, event, before, after)` raises the calendar SEQUENCEs and writes the Phase from `after`, but `after` is not read from the database. Each handler builds it in its own way:
   - `confirm.post.ts:44` patches `startsAt`, but not `slotId`.
   - `reopen.post.ts:36` spreads `reopenValues()`.
   - `sessions/index.post.ts:45` appends `{ id, startsAt }`.
   - `[id].delete.ts:31` filters.
   - `moveSessionDate` (`sessions.ts:61`) patches `startsAt`.

   All five are correct today. But they are five places where the SEQUENCE and the Phase can be computed from a state that isn't in the database, and nothing tests that they agree with their UPDATEs.
2. **Reschedule goes its own way.** It is the only handler that reads its body inside the transaction (`readNewDate`, `new-date.ts:11-18`), so the Event row lock (which Votes wait on) is held while the body arrives. `readNewDate` and `moveSessionDate` (`sessions.ts:53-64`) each have one caller. `readNewDate`'s comment claims Set Date uses it, which it doesn't.
3. **Defensive noise under the lock.** `confirm.post.ts:40-42` (`isNull(startsAt)` → `wrong_phase`) and `moveSessionDate`'s `isNotNull` (`sessions.ts:57-59`) re-check what the locked rule already decided. They can't fire, but a reader has to work out why. `confirm.post.ts:32` and `sessions/index.post.ts:39` query `isSlotTaken` although `before` already holds every `slotId`.

On top of that, there is repetition and drift:

- "Another Session has this Date" is written three times (`confirm.post.ts:33`, `sessions/index.post.ts:33`, `reschedule.post.ts:29`), and "find the Session or 404" three times.
- `setDateValues`, `rescheduleValues` and `reopenValues` (`phase.ts:43-78`) return object literals, and their unit tests (`test/unit/phase.test.ts:46-122`) assert those literals. They are identity wrappers. What a Reopen writes is split between `reopenValues()` and the handler's `previousStartsAt: sql…` (`reopen.post.ts:33`), so neither place tells the whole story.
- Stale comments: `phase.ts:6` and `phase.ts:58` say the handlers add `icsSequence + 1` (that moved into `sequenceRaises`), and `api/e/index.post.ts:14` says "its one Session".
- `api/e/index.post.ts:28` decides `poll` versus `date_set` by hand, although `phaseOf(startsAt)` (`phase.ts:11`) is that rule.

**The move.** Turn the convention into a function, and read `after` instead of building it. One extra SELECT per Host action is the price. Host actions are rare, and the Event lock is already held.

```ts
// server/utils/sessions.ts
/** What the Session endpoints accept; each handler parses its own field. */
type SessionChangeBody = { startsAt?: unknown, slotId?: unknown } | null

/** One Host change to an Event's Sessions, under the Event lock (#53, #55). Raises the calendar
 *  sequences and writes the Phase from the Sessions as they are once `change` has written. */
export async function changeSessions<T extends object>(
  event: H3Event,
  change: (ctx: { tx: Db, eventRow: EventRow, sessions: SessionRow[], body: SessionChangeBody }) => Promise<T>,
): Promise<T & { phase: Phase }> {
  const user = await requireUser(event)
  const body = await readBody<SessionChangeBody>(event)   // before the lock, for every handler
  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true, lock: 'update' })
    const before = await eventSessions(tx, eventRow.id)
    const result = await change({ tx, eventRow, sessions: before, body })
    const after = await eventSessions(tx, eventRow.id)   // the truth, not a copy
    await raiseSequences(tx, sequenceRaises(before, after))
    const phase = phaseAfterChange(eventRow.phase, after.map(row => row.startsAt))
    await tx.update(events).set({ phase }).where(eq(events.id, eventRow.id))
    return { ...result, phase }
  })
}
```

Reschedule then reads:

```ts
export default defineEventHandler(event => changeSessions(event, async ({ tx, sessions, body }) => {
  const session = findSession(sessions, getRouterParam(event, 'id'))
  const startsAt = parseLocalTime(body?.startsAt)
  if (!startsAt) throw apiError('invalid_time')
  const rejection = rescheduleRejection({ hasDate: session.startsAt !== null, startsAt, now: new Date(), duplicate: hasDateAt(sessions, startsAt, session.id) })
  if (rejection) throw apiError(rejection)
  await tx.update(sessionsTable).set({ startsAt, previousStartsAt: null }).where(eq(sessionsTable.id, session.id))
  return { startsAt }
}))
```

What disappears: `server/utils/new-date.ts`, `moveSessionDate`, `finishSessionChange`, the three `*Values` helpers and their tests, the two dead guards, two `isSlotTaken` calls and five hand-built `after` arrays. What appears: `changeSessions`, `findSession`, and `hasDateAt(sessions, instant, exceptId?)` in `server/domain/session.ts`.

**Traps.**
- Keep the error precedence: `requireUser` before `readBody`, so a signed-out request still gets 401 whatever its body.
- The response bodies change shape (each gains `phase`). The client ignores them (`useHostActions.send` only awaits), but some integration tests assert them. Update those assertions, nothing else.
- #65 (removed Sessions keep their notice) touches the same handlers. With `changeSessions`, its `removed_at` filter is one `WHERE` in `eventSessions`. Land T1 first or together (comment posted on #65).

**Considered and rejected:** deriving `poll`/`date_set` on read instead of storing the Phase. The column is still needed for `running`/`finished`/`archived`, and the vote handler reads it under a share lock. After T1 the Phase is written in exactly one place, which removes the drift risk that would justify the bigger change.

---

### T2. Number the Sessions once, and decide "several Sessions" in one place (#70)

**Category:** repeated conditionals that signal a missing model; boundary type hiding an invariant. Removes the cause of #67.

**Where:** `server/domain/session.ts:16-26, 48-68`, `server/domain/ics.ts:125-143`, `server/api/e/[slug].get.ts:49-54`, `server/api/e/index.get.ts:64-65, 86`, `shared/event.ts:50-58, 70-71`, `app/pages/e/[slug].vue:247, 254-255, 489`, `app/components/HomeEventCard.vue:16, 33`.

**What's wrong.**

1. **Parallel arrays.** `sessionNumbers(startsAt[])` returns `(number | null)[]` aligned by index with its input. Every caller re-zips it, with `?? null` and `!`:
   - the Event read zips and then sorts with `Number.MAX_SAFE_INTEGER` standing in for "no number";
   - ics zips, filters with a hand-written tuple type guard and sorts;
   - Home indexes two arrays with the same index;
   - `numbersById` zips into a Map.

   Four callers, four zips. The model is missing: "a Session with its number".
2. **One display rule, three copies.** "Show the number only when the Event has several Sessions" lives in `ics.ts:137` (`length === 1`), `[slug].vue:255` (`length > 1 ? … : null`) and `HomeEventCard.vue:33` (`hasSeveralSessions && …`). `sequenceRaises` compares *raw* numbers, so the rule's effect on the title is invisible to it. That is exactly #67: going from one Session to two changes the title and raises nothing. The audit's proposed fix (`titleFormChanged`) would add a fourth copy of the rule.
3. **The wire type hides the invariant.** `SessionView` makes `number`, `startsAt` and `previousStartsAt` independently nullable. Really a Session is either dated (`startsAt` and `number` set, `previousStartsAt` null, since Set Date and Reschedule clear it) or undated (`number` and `startsAt` null, `previousStartsAt` maybe set by a Reopen). The page compensates with `?? ''` three times. `EventView.missingDates` repeats what `sessions` already says.

**The move.**

```ts
// server/domain/session.ts
/** The Sessions with the number they are shown with (#49, #53): dated ones first in Date order, numbered 1…n
 *  only when the Event has several Sessions; undated ones after them, in the given order, with no number. */
export function numberedSessions<S extends SessionDate>(sessions: S[]): (S & { number: number | null })[]
```

- The server sends the **shown** number, and the client just renders it. The rule leaves `[slug].vue` and `HomeEventCard.vue`.
- `sessionEntries` keeps dated Sessions by `startsAt !== null` (no longer by `number`, which is now null for a single Session) and picks the title from `number === null`.
- `sequenceRaises` compares `(startsAt, number)` between `numberedSessions(before)` and `numberedSessions(after)`. From one Session to two, or back, the dated Session's shown number changes (null ↔ 1), so it is raised. **#67 is fixed by construction.** Keep #67's test.
- `SessionView` becomes `{ id, number, startsAt: string, previousStartsAt: null } | { id, number: null, startsAt: null, previousStartsAt: string | null }`. A type-guard filter for `datedSessions` removes the `?? ''`.

**Traps.** Client fixtures that give a one-Session Event `number: 1` and expect no number to show must now give `number: null`. That is the point of the change, not a regression. `HomeEvent.nextSession.number` changes meaning the same way.

---

### T3. Open Slots and their Votes decided once (#71)

**Category:** copy-pasted logic that has to change together (it did in #52).

**Where:** `server/api/e/[slug].get.ts:31-38`, `server/api/e/index.get.ts:61-96`, `server/domain/poll.ts:67-79`, `server/domain/home.ts:59-62`.

**What's wrong.** Since #52, a Slot that became a Session's Date leaves the Date poll with its Votes. Both readers run `openSlots`, build an id `Set` and filter Votes by hand, then call `pollStanding`. `pollStanding` trusts the caller to have filtered. If a caller forgets, the Best slot and the progress are silently wrong, and no type stops it.

The Home handler also filters four flat lists by `eventId` for every card, computes `homeSessionIndex` for the card and again inside `arrangeHome` (via `homeDate`), and carries a second copy of each card's ordering facts beside the card (`index.get.ts:95`).

**The move.** Let the poll own its rule: `pollStanding` takes the Sessions' slot ids and returns the open `slots` and `votes` with the standing. Or, as the audit suggested, add `openPoll(slots, sessionSlotIds, votes) → { slots, votes }` beside `openSlots`. Either way, no handler filters Votes by hand any more. In Home, build one `Map` per list keyed by Event, and compute the Session index once.

---

### T4. API answer types live in `shared/`, and every handler is checked (#72)

**Category:** boundary and type contract; an unchecked contract that has already drifted.

**Where:** `shared/event.ts` (`EventView`, `HomeView`), `app/components/SignInCard.vue:6-9` (`InvitePreview`), `app/composables/useAuthUser.ts:4-11` (`AuthUser`) and `server/utils/user.ts:8-15` (`userColumns`), inline generics at `app/pages/neu.vue:104`, `app/components/InviteEntry.vue:30`, `app/components/InviteSheet.vue:37`.

**What's wrong.** Response shapes are declared four ways: in `shared/`, in a component, in a composable (a hand copy of the server's column list) and as call-site generics. Only `GET /api/e` checks its handler against its type. The experiment:

```
$ # add `: Promise<EventView>` to server/api/e/[slug].get.ts, then
$ pnpm typecheck
server/api/e/[slug].get.ts(74,5): error TS2322: Type '{ id: string; startsAt: Date; past: boolean; }[]'
  is not assignable to type '{ id: string; startsAt: string; past: boolean; }[]'.
```

The same answer sends `sessions[].startsAt` as `toISOString()` and `slots[].startsAt` as a raw `Date`, which works only because JSON serialises it. The next drift may not be so lucky.

**The move.** All answer types live in `shared/` (`InvitePreview`, `AuthUser`, `CreatedEvent`, `JoinedEvent`, `RotatedInvite`). Every handler annotates its return type with them, `getUser` returns `AuthUser | null`, and the client imports instead of declaring. Optional: `apiFailure` (`app/utils/api-error.ts:11-14`) narrows `ofetch`'s `FetchError` instead of casting `unknown` to a hand-written shape.

**Not chosen:** relying on Nuxt's inferred `$fetch` types. The app calls dynamic routes through template strings (`` `/api/e/${slug}` ``), which TypeScript types as `string`, so inference would fall back to `unknown`. Explicit shared types are the boring, reliable option here.

---

### T5. Split the Event page, which does five jobs in 512 lines (#73)

**Category:** decomposition, file size (its test file is 1016 lines), dead and stringly-typed code.

**Where:** `app/pages/e/[slug].vue`, `app/components/HostDock.vue:10-31`, `test/nuxt/event-page.test.ts`.

**What's wrong.** The page is:

1. **Two pages.** Invite link and Event link share the route. `immediate: !invite` (`:25`) and the polling guard (`:211-214`) thread an `invite` flag through Event logic that never handles invites.
2. **An optimistic vote state machine** (`:33-101`), the subtlest client code in the repo (#50). It can only be tested by mounting the whole page.
3. **The Session cards with their Host actions** (`:122-178`, `:250-330`).
4. **The Date poll section** (`:332-417`).
5. **The error states.** The `notFound` and `deleted` blocks (`:426-454`) are identical except for `kind`.

Dead code: `slots[].label` (`:39`) is never read. `onHostAction` (`:204-209`) dispatches on string keys declared at `:198-202`, and its `else comingSoon()` can't be reached.

`test/nuxt/event-page.test.ts` (1016 lines) has four `describe` blocks, and they are exactly these seams.

**The move.** `[slug].vue` becomes a dispatcher: `InviteEntry` or `EventPage`. Then:

- `useOptimisticVotes(slug, data, refresh)` takes `:33-101` and gets its own test.
- `EventSessions.vue` and `EventPoll.vue` take the two sections.
- One `FullScreenState` with a computed `kind`.
- Dock actions carry `run` instead of `key`.
- Split the test along its `describe` blocks.

This is a move, not a redesign. Keep every behaviour and every test assertion.

**Trap.** `await useFetch` moves from the page into `EventPage`'s setup. That is fine under the page's Suspense, but the `useHead` title must move along with it (or come from T7's `titleTemplate`).

---

### T6. HoldToConfirmButton resets itself; every Event mutation goes through one `send` (#74)

**Category:** spaghetti growth from a missing state; one job with two owners.

**Where:** `app/components/HoldToConfirmButton.vue:8, 38-62`, `app/pages/e/[slug].vue:107-133, 262, 271`, `app/components/SlotEditSheet.vue:36-37, 67-92, 134`, `app/components/InviteSheet.vue:22-23, 35-47, 127`, `app/composables/useHostActions.ts`.

**What's wrong.** `HoldToConfirmButton` has no way back from "done" ("the parent removes or replaces it"). So every parent whose request can fail bumps a counter inside the button's `:key` to force a remount: `holdEpoch` (`[slug].vue`), `epoch` (`SlotEditSheet`) and `attempt` (`InviteSheet`). On the Event page, one refused Reopen remounts every hold button. `useHostActions` returns a success boolean, plus the `reopenOne`/`removeOne` wrappers, only to feed that counter.

Mutations also have two owners. The Session dialogs emit to the page, which posts through `useHostActions.send` (busy flag, `apiErrorKey` toast, refetch). `SlotEditSheet` and `InviteSheet` take a `slug` prop and post themselves, each with its own try/catch/toast. `useHostActions` returns 13 values mixing three dialogs' UI state with network calls.

**The move.** The button takes `action: () => Promise<boolean>` and goes back to idle on `false`. All three counters, the wrappers and the key tricks are deleted. `send` moves into a small `useEventMutation(slug, refresh)`, which `SlotEditSheet` and `InviteSheet` use too. Their copy overrides pass through as `errorKeys`. Dialog open state stays where the dialog is rendered.

---

### T7. Use the canonical helpers on the client (#75)

**Category:** bespoke copies of canonical helpers; an identity adapter. Each item is mechanical. Together they are why a small design change touches eight files.

| # | Copy | Canonical home |
|---|---|---|
| 1 | Vote look ×3: `PollSlotCard.vue:32-36`, `PollMatrix.vue:41-46`, `VoteLegend.vue:8-12` | one `VOTE_LOOK` record in `app/utils/` |
| 2 | Code→copy ×4: `neu.vue:51-55`, `:57-61`, `:64-78`, `SlotEditSheet.vue:54-58` | `CODE_COPY` in `app/utils/api-error.ts:17-31` |
| 3 | Title template ×8 (`[slug].vue:31` shows „COMPIES \| COMPIES“ while loading) | one `titleTemplate` in `app.vue` |
| 4 | `/e/${slug}` built by hand ×5, `.slice('/e/'.length)` in `anmelden.vue:22` | `eventPath()` / `parseEventPath()` in `shared/links.ts` |
| 5 | `PhasePill.vue:5` redeclares `Phase` | `shared/event.ts` |
| 6 | `ConstructionViewer` + `viewerOf` (`construction.ts:17-26`) rename `canHost` → `hasHostPermission` | delete; take `AuthUser` directly |
| 7 | `DateTimeField.vue:141` builds a Berlin "today" formatter | `utcToBerlin` in `shared/time.ts` |

---

### T8. Count name length once, and let the setup page use `TextField` (#76)

**Category:** a duplicated rule plus a duplicated component.

**What's wrong.** "An emoji counts as one" is `[...text].length` in four places (`shared/event.ts:13-15`, `server/domain/profile.ts:7`, `einrichten.vue:15`, `TextField.vue:24`). That counts code points, so 👍🏽 is 2 and 👨‍👩‍👧 is 5 (audit finding 8). Separately, `einrichten.vue:85-113` re-implements `TextField` (label, input, help, counter, invalid border), and the two already behave differently:

- counter announcement: from 80 % in `TextField`, hidden on the setup page;
- error display: an error line in `TextField`, swapped help text on the setup page;
- over the limit: the setup page cuts the value, the create form shows an error.

**The move.** One `characterCount` on `Intl.Segmenter` in `shared/`. The setup page uses `TextField`, with whatever it lacks added as a prop.

---

## Smaller notes (not filed)

Real but low-value. Pick them up when touching the code anyway.

- **S1. Two error mechanisms.** Refusals go through `apiError(code)` with `API_ERROR_STATUS`. Next to it, `eventNotFound`, `eventDeleted`, `slotNotFound` and `sessionNotFound` (`server/utils/errors.ts`), profile setup's English 400 (`api/profile/setup.post.ts:13`), ics's „No Date set“ 404 and the 401 are hand-made `createError`s. Keep ADR 0006's generic link answers, but `slot_not_found`, `session_not_found` and `invalid_display_name` could be codes, so the client has one way to read a refusal.
- **S2. `isMember` lives in `server/utils/invite.ts`**, but it is an access fact, used by `event-access.ts`. Move it there.
- **S3. Casts in the parsers.** `parseNewEvent` (`server/domain/event.ts:60, 72, 83`) and `parseSessionCount` (`server/domain/session.ts:8`, three `as number`). Type-guard filters (`.filter((d): d is Date => d !== null)` plus a length check) remove them. Keep the `unknown` input: it is a trust boundary.
- **S4. Rejection-type zoo.** `EventInputError`, `SlotError`, `SlotProblem`, `PhaseRejection`, `SetDateRejection`, `SessionRejection`, `VoteRejection` and `EventAccessRejection`. The narrow unions document what each rule can say, so keep them. But `SetDateRejection`/`SessionRejection` could be inlined where they are used once.
- **S5. Rate limiter** (audit leftover): an interface with one implementation across two files (`server/domain/rate-limit.ts`, `server/utils/rate-limit.ts`). One file, no interface.
- **S6. `DateTimeField.vue` (463 lines).** `fieldPopover` already shares the popover logic, but the date and time halves still repeat about 70 lines of anchor/input/button/popover template. A `FieldPopover.vue` with a panel slot would halve that, and the digit parsers (`parseDateDigits`, `parseTimeDigits`, …) could move to `app/utils/` with unit tests. Not urgent: the file is well under 1k and well commented.
- **S7. `freeSlug`** (`api/e/index.post.ts:49-56`) runs up to five SELECTs outside the transaction, then falls back on the unique constraint as a 500. An `INSERT … ON CONFLICT (slug) DO NOTHING RETURNING` retry inside the transaction makes check and write one step.
- **S8. `displayName ?? name` ×5**: `[slug].get.ts:82`, `index.get.ts:82`, `invite/[invite].get.ts:22`, `index.vue:19`, `UserMenu.vue:12`. One `coalesce(display_name, name)` column expression on the server, and `AuthUser` could carry the shown name.
- **S9. `ConfirmModal.vue:74`** borrows the create page's `mvp.create.saving` key. A `common.saving` key fits a shared component.

## Checked and fine

These parts meet the approval bar. Don't churn them.

- **File sizes.** No production file is near 1k lines. The largest are `app/pages/e/[slug].vue` (512) and `DateTimeField.vue` (463). `i18n/locales/de.json` (1143) is copy data, so the rule is waived. The one breach is a test file (T5).
- **Layering.** `server/domain/` is pure with an injected `now`, `server/utils/` runs the queries and `server/api/` orchestrates. Each rule (access, poll, home, phase, ics, slug, time, allowlist) has unit tests. Apart from T1 and T3, handlers keep to that split.
- **Concurrency.** Slot edits and Session changes take `FOR UPDATE`, Votes `FOR SHARE`. This is documented at each handler and tested with an interleaving database (`test/integration/harness.ts:57`).
- **Trust boundaries.** Every handler parses `unknown` bodies through domain parsers. The Better Auth surface is allow-listed (`server/api/auth/[...all].ts`), and the email never leaves the server.
- **Small composables.** `useDialog`, `usePollRefresh`, `useToast`, `useReopenNotices` and `useHostDock` each do one thing.

## Order of work

1. **Bugs first:** #64 (login cookie) and #66 (401 → sign-in) are independent. Then **#69 (T1) together with #65**, then **#70 (T2) together with #67**.
2. **#71 (T3) and #72 (T4)**: small and independent. T4 is best before T5, so the split components import shared types.
3. **#73 (T5) and #74 (T6) together**: both rewrite the Session cards' Host actions.
4. **#75 (T7) and #76 (T8)**: mechanical, any time. T7's `titleTemplate` simplifies T5.

## Not checked

- Template markup and Tailwind classes were only skimmed. No visual or accessibility review (the audit and earlier review rounds covered behaviour).
- Test code quality beyond structure and file size.
- `drizzle/` migrations, CI workflow and deploy config.
- None of the proposed refactors was implemented or measured. Line estimates are estimates. The one executed check was the T4 typecheck experiment, reverted afterwards.
