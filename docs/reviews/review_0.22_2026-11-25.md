Release review 0.22 „Host-Werkzeuge“: diff `v0.21.0...spec/894-host-werkzeuge`, tip 2da1c7b6 (2026-11-25).

## Standards

# Standards review, COMPIES 0.22 „Host-Werkzeuge“ (tip 2da1c7b6)

Scope: the whole diff v0.21.0...origin/spec/894-host-werkzeuge, read file by file. No must-fix found. The diff keeps the big homes (`changeEvent`, `endMembership`, `readPerson`, `useEventMutation`, `reasonKey`, `berlin-time.ts`, `NoticeBanner`, `GameBrowser`). Findings are few and small.

## Hard violations of a documented standard

### 1. should fix: `server/utils/game-events.ts:28` spells „an Event of this Host“ itself
`.where(and(inArray(events.id, ids), eq(events.hostId, game.createdBy), isNull(events.deletedAt)))`

`CODING_STANDARDS.md` § One home per concern, row „In this Host's library … an Event of this Host“, was extended in this very diff. It names `hostedEventOf(hostId)` (not deleted, finished ones too) as the home. It also says: „a query that spells … the live-Event rule … itself is a finding“. `hostedEventOf` is `and(eq(events.hostId, hostId), isNull(events.deletedAt))`, exactly the two predicates at line 28. The same diff already edits this file to import `playedRound` from `./library`, so the fix is one line: `and(inArray(events.id, ids), hostedEventOf(game.createdBy))`. It works as it is, but it is the second copy the standard forbids.

## Judgement calls

### 2. should fix / judgement: `app/composables/useRouteSort.ts` re-implements a part of `useAddressState`
Row „A list page's filters kept in the address“: „local state, a chip pushes … back and forward followed … a third list page is a third such file, never a copy of the rule“. `useRouteSort` is a second copy of that shape in 25 lines:

```ts
const state = ref<GameSort>(fromAddress())
watch(fromAddress, (sort) => { state.value = sort })
… set: (next) => { state.value = next; router.push({ query: { ...route.query, sort: … } }) }
```

The file's doc comment justifies it (`useAddressState<S extends { q: string }>` does not fit one parameter), and the sort is not a filter. So I rate it a judgement call, not a violation. The cleaner fix is to let `useAddressState` take a state without `q`, or to make the sort a member of the library's filter state in the address only (not in `GameFilters`). The standards table does not mention the new composable either. Whichever way it goes, the row should name it.

### 3. nit: stale „will“ in two places
- `CODING_STANDARDS.md` row „The rule that ends a membership“ still says „0.22's removal of a Member will (#697)“.
- `server/utils/invite.ts` (doc of `endMembership`) says „0.22's removal of a Member, #697“ as a future caller.

`remove-member.post.ts` now calls it. The `CODING_STANDARDS.md` hunk of this diff touched only the library row, so the endMembership row was missed.

### 4. nit: the rule of a removal sits inline in the route
`server/api/e/[slug]/remove-member.post.ts:17-19` holds the rule `userId === user.id` (the Host cannot remove themselves) and the membership check inside the handler. Row „The facts a rule runs on … and each rule's reason“ points the `…Reason` functions in `event-state.ts` as the home of a rule's reason (`moveReason` returns `member_not_found` there). Here two rejections come from the handler, and `invalid_value` stands for „you are the Host“. It is correct, because `endMembership` guards the finished Event and `changeEvent` the phase. It is also tiny. A `removeReason` would match `moveReason` and give the client the same reason for the menu row (`GameBoard.vue` `removable` repeats `!member.isHost` and `pageKind !== 'finished'` on its own). Judgement.

## Baseline smells (judgement calls)

### 5. nit, Duplicated Code: the Berlin day key
`shared/game.ts:213` computes `utcToBerlin(new Date(at)).slice(0, 10)`. `server/domain/game-day.ts:26` has `const berlinDay = (instant: Date) => utcToBerlin(instant).slice(0, 10)`, the same shape. `shared/time.ts:20` already exports a `berlinDay(instant, withYear)` with another meaning (a label), so a third spelling is easy to add. Move one `berlinDayKey` into `shared/time.ts` (ADR 0003 home: `shared/time.ts`) and call it from both.

### 6. nit, Duplicated Code: `hiddenCount(loaded)` twice in the template
`app/components/stepper/StepPool.vue` (the `#notice` slot) calls `hiddenCount(loaded)` in the `v-if` and again in the `t(...)` call. Each call filters the whole library twice (about 1500 games). Bind it once, for example with a computed over the slot's `games`, or `v-for`/`v-slot` on a one-item list. A `<template v-if>` with a local alias would do.

### 7. nit, Mysterious Name: `own` and `following` in StepPool
`const own = ref<GameFilters>(…)` and `const following = ref(true)` (`StepPool.vue`) read only with the comment above them. `own` is „the Host's own filters“. `followsPreset` and `hostFilters` would carry it without the comment.

### 8. nit, Divergent Change (watch): `GameBoard.vue`
It now holds the move menu, the drag, and the removal request (`REMOVE_KEY`, `removing`, `removeOpen`, `removeMember`, a members watcher, a `useEventMutation`). The sheet itself is its own component, so the growth is modest (+59 lines). Not worth a change in this Release. If a third Host action lands on the menu, move the removal request into a `useMemberRemoval` composable.

### 9. nit, Tests: whole-object `toEqual` on the `GameList` read
`test/integration/library-event-counts.test.ts`, `library-ownership.test.ts` and `library.test.ts` assert `toEqual({ games: [], tagsInUse: [], eventCounts: {}, lastPlayed: {} })` (five places). § Tests: „A read section that grows with each ticket … is asserted with `toMatchObject` or a fixture builder, not `toEqual` on the whole object (#231 … broke `rounds.test.ts`)“. `GameList` grew by `lastPlayed`, and these lines had to be edited for it. They pin „a non-Host gets an empty list“, so a closed shape may be what is wanted. A `toMatchObject({ games: [] })` plus the shape pin in one place would follow the standard.

## Checked, no finding
- Migration `0045_member_removed.sql`: enum value only, snapshot and journal in step, switch-over reasoning written down (ADR 0007, § Database).
- Lock order and live-user rules: the removal runs under `changeEvent` (`hostOnly`, `lock: 'update'`), so the Event lock comes first. `rotateInviteToken` runs in the caller's transaction and `rotate.post.ts` shares it (one home).
- Secrecy: `member.removed` goes through `publishLast` to one User and carries no data. The lastPlayed date is read only from the Host's library route, and the test `last-played-secrecy.test.ts` pins it.
- Dates shown to Users: `formatShortDayYear` lives in `app/utils/berlin-time.ts`. `sortGames` goes through `shared/time.ts`.
- API errors: `member_not_found` is in the `api-error.ts` table and `shared/errors.ts`. `useEventMutation` carries the toast and the refresh.
- Tests draw Members with `memberView()`. Edge counts (0, 1, 2) appear in the sort and preset tests. Motion and Copy: strings are the spec's.
- The lint warning at `EventStepper.vue:139` is known and not rated.

## Spec

# Spec review, Release 0.22 „Host-Werkzeuge“ (tip 2da1c7b6)

Scope: spec #894 and tickets #697, #896, #897, #898, #899, #690, #900, #901, with their comments. I read the full diff of server, shared, app, i18n and the migration. I traced the removal from the HTTP route through `changeEvent`, `endMembership`, `recordActivity` and `publishLast`, then to the room message, `useEventView`, `EventLoadState` and `FullScreenState`. I also traced the Chat writer read, `lastPlayedAt` to `GET /api/games` to the card, and the preset and the sort through `StepPool` and `GameBrowser`.

**Result: no must-fix finding.** Two should-fix or nit findings, one scope note.

## (a) Missing or partial

1. **nit / should-fix: the chosen games in the „Spiele“ step show no „zuletzt am“ pill.** `app/components/stepper/StepPool.vue:108-118` renders the Pool list with `<GameCard ... layout="row">` and passes no `last-played`. Spec story 52: „I want every game's card to say when I last played it“. Spec § Last played: „in the „Spiele“ step, where that pill does not show, on its own“. #900 says the pill shows „in the „Spiele“ step“. The change adds the pill only to the browser's cards (`marks-played` on `GameBrowser`), so a game the Host already put in the pool loses its date. The data is in `useGameLibrary().lastPlayed`, but `StepPool` does not read it. The other reading is that only the browser's cards were meant. The ticket text does not say which, so the Host or user should decide.

2. **nit: typing in the search does not end the preset (`StepPool.vue:26-37`, `ENDS_PRESET = ['players','suitability','tag']`).** Spec: „The first change of any filter by the Host, „Alle“ included, ends that.“ The search is a field of `GameFilters` (`q`). The decision is written on #690 („Typing in the search does not“), so it overrides the spec and I do not rate it. One side effect to know: while the Host searches, the line „Auf dein Event eingestellt…“ stays and `following` stays true, so the player and Suitability filters keep tracking the draft during a search.

## (b) Behaviour nobody asked for

- **nit: `GameBoard.vue` `watch(() => props.members)` closes an open menu or sheet when the Member vanishes.** It is not in the spec, and the #896 comment records it as the drafter's proposal, accepted. It is small and sensible. I list it only so the Release PR notes carry it.
- **nit: the sort select is tied to `marksPlayed` (`GameBrowser.vue`, `v-if="marksPlayed"` and `props.marksPlayed ? sortGames(...)`).** The spec asks for the sort „in the library and the „Spiele“ step, not in „Nächstes Spiel setzen““. The code gets that by reusing the pill's flag, so the two features cannot be switched on separately. This is correct today. It is only coupling.
- Not scope creep: the shared `rotateInviteToken`, `hostedEventOf` and `playedRound` extractions, and the `formatShortDayYear` year. Each follows the „one home“ rule or a ticket text.

## (c) Looks implemented, checked against the code path

All the following hold:

- **Removal write** (`server/api/e/[slug]/remove-member.post.ts`):
  - It runs `changeEvent` with `hostOnly` and `lock: 'update'`, so the order is not_host, then wrong_phase, then the body rules.
  - The check `userId === user.id` is the same as „is the Host“, because the route is host-only.
  - A User the Event does not have gives `member_not_found` (`endMembership` returns false).
  - The membership, the Votes and the rotation share one transaction, so a failing rotation leaves the Member in.
  - The rotation writes no Activity entry.
  - `endMembership` is the 0.21 rule and has no second copy. Its SQL guard `phase <> 'finished'` backs up `changeEvent`'s refusal.
  - `rotate.post.ts` now calls the same `rotateInviteToken`, with no change in behaviour.
- **Room:** `publishLast([userId], member.removed)` runs after commit. Everyone else gets the broadcast `event.changed` and `activity.added`. The Worker is untouched. This matches the spec and the #697 comment, including the unordered fetches.
- **Removed User's page:**
  - `removedByRoom` is sticky and wins over a 404, a 410 and `event.gone`.
  - `room.stop()` and the `!ended` guard in `refreshLoaded` stop later reads.
  - `EventLoadState` mounts the `removed` kind in a branch of its own, so the focus goes to the title.
- **Activity entry:** it carries the removed User in `people`, the Host only as actor, and no team name. The text takes the name from `people`, so a later account deletion reads „Gelöschtes Konto“. The migration is the enum value only, and the journal timestamp is monotonic.
- **Chat writer:** `readWriters` (0.21) takes every writer who is no Member, with name and picture, so tests-only is right for #898.
- **Last played:** `lastPlayedAt` uses `hostedEventOf` (not deleted, finished ones included) and `playedRound` (has a Result, not put back), grouped by game. The date is only in `GET /api/games` (the Host's own library read), so a Hidden wheel leaks nothing.
- **Sort:**
  - `sortGames` keys by Berlin day, puts never-played first, and is stable, so ties keep the by-name order from the server's `ORDER BY lower(name)`.
  - The address keeps `sort` in the library: `useRouteSort` and `useAddressState.write` both spread `route.query`, so neither drops the other's parameter.
  - „Alle“ leaves the sort. The sort resets the paging limit.
  - The sort covers the Archived list as well.
- **Preset:**
  - `eventPreset` is correct, and the draft's `teamCount` and `teamSize` are the real settings.
  - `hiddenCount` counts non-Archived games minus the games that fit the two filters, which is the spec's „normal list“.
  - The stray value above 24 is appended to the options.
  - The step and the settings editor share `StepPool`.
  - The Host without permission still sees the sentence, because `library` gates the browser.
- **Datenschutzerklärung:** the §11 and §16 insertions are word for word the ticket's, and the position in §16 is after the Terminvorschlag sentence.
- **Changelog:** lines exist for #896, #897, #899, #900, #690 and #901. #697 and #898 carry none, as their tickets say.

Known and accepted, not re-reported: #897's 404-before-message limit, and the `StepPool` remount and preset-above-24 notes on #690.
