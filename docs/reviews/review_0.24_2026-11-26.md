# Release review 0.24 „Admin-Seite“ (2026-11-26)

Diff `v0.23.1...spec/938-admin-seite`, tip e0638e5b (spec #938, tickets #939, #942, #682, #876, #940, #941). Two `sonnet` reviewers, `code-review` Standards and Spec. No must-fix on either axis; the findings taken are #1018 and #1019.

## Standards

Diff `v0.23.1...origin/spec/938-admin-seite`, tip e0638e5b, 56 files. Read: server routes and utils, `server/domain/admin.ts`, `shared/admin.ts`, `scripts/prod/delete-account-core.mjs`, the allowlist/auth change, all Admin components, the sheet, composable, test helpers (`sign-in.ts`, `scenario.ts`, `permission-sync.test.ts`); skimmed the integration/nuxt tests. No must-fix found. Secrecy, lock and one-home rules otherwise hold: the read selects named columns only, the host route locks under `liveUser`, `deleteUser` and `afterUserDeletion` are the one deletion path, and the table row for it was updated.

## The two candidates

1. **`['HOST','PROVIDER','IDS'].join('_')`, `test/integration/permission-sync.test.ts:48`: confirmed, but a nit, not a defect.** The grep criterion of #939 is vacuous for this one file, as the orchestrator says. But the ticket's own first criterion needs a test that sets the retired variable ("whatever `HOST_PROVIDER_IDS` holds"), and its second says no test sets it. The two cannot both hold literally. The test says why in its comment, and the name appears nowhere else (grep of the branch: only ADRs, research, `docs/design_handoff`, and the gitignored `.env`). Keep the test; the ticket's grep criterion should read "outside the one test that pins the retirement". **nit.**
2. **`setAllowlist({ hosts })`, `test/integration/sign-in.ts:35-47`: confirmed.** The parameter, `stubAuthEnv(allowlist: { hosts?… })` and about 30 call sites still say allowlist, but `hosts` now means "set `users.canHost` after sign-in" through a module-level `hostAccounts` set. The JSDoc says so. Mysterious Name, plus Duplicated Code: three ways now put `canHost` on a row (`grantHosts` in `sign-in.ts`, `hostSignsIn` in `scenario.ts:120-125`, `setCanHost` in `permission-sync.test.ts:52`). **nit** (cost of renaming 30 call sites outweighs it; rename `hosts` to `hostAccounts` if touched again).

## Findings

**1. should-fix: the live-Event rule is spelled by hand.** `server/api/admin/index.get.ts:40`: `.where(and(isNull(events.deletedAt), inArray(events.phase, LIVE_PHASES)))`, with `LIVE_PHASES` newly exported from `server/utils/library.ts:32`. `CODING_STANDARDS.md` § One home, row "In this Host's library…": "a query that spells … the live-Event rule … itself is a finding"; `liveEventOf(hostId)` is the home. The route needs the rule without a host (grouped by host), so the fix is a hostless `liveEvent` in `library.ts` that `liveEventOf` composes, not a second spelling plus an exported constant (Shotgun Surgery next time the rule moves). `server/domain/admin.ts:21` even cites `liveEventOf` for it.

**2. should-fix (nit-leaning): the id-parameter guard exists three times.** `host.put.ts:19-20`, `image.delete.ts:14-15`, `server/utils/admin.ts:348-349` each do `getRouterParam(event,'id')` then `if (!isUuid(id)) throw apiNotFound()`. Duplicated Code; `requireDeletableUserId` already sits in `utils/admin.ts`, so a `userIdParam(event)` next to it takes two of them.

**3. nit: `AccountDeleteSheet.vue` became a two-mode component.** The `person` prop switches title, count source, notice and i18n key group (`${group}.…`); `hosted`/`hostedFailed` became optional and are unused in the admin mode. Smell: flag-argument / Divergent Change. The file's header still says "a second copy of EventDeleteSheet's shape on purpose", yet it now carries a variant. Lines 63-90 repeat five identical `<p v-if="person.counts && person.counts.X > 0">` blocks; a `v-for` over `[key, count]` pairs removes them (Duplicated Code). The admin mode reuses `accountDelete.countFailed`/`counting` for its reason line while its other lines use `admin.delete.*`, which splits the wording across two groups.

**4. nit: the search rule now lives four times.** `shared/admin.ts:51-58` adds two more `trim().toLocaleLowerCase('de').includes(term)` filters beside `shared/archive.ts:47` and `shared/game.ts:181`. The sort comparator `b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)` is also written twice (`server/domain/admin.ts:225, 266`), and `AdminUsers.vue`/`AdminEvents.vue` repeat the same search-field + two-EmptyState markup. Duplicated Code; a `matchesSearch(text, query)` in `shared/text.ts` would be the one home for the normalisation.

**5. nit: `AdminUserRow.vue` names a local computed `shownName`** (line ~22), the home name of § One home "A User's visible name" (`shared/auth.ts`). The comment justifies not calling the shared one (no provider name on the entry), but a reader will take it for the shared rule. Mysterious Name; rename (`nameLabel`).

**6. nit: `app/utils/construction.ts`: `ConstructionArea = 'generic'`**, `ConstructionSite.area` is now a constant, and `ConstructionPage` still keys `mvp.site.${area}`. Speculative Generality (the header comment keeps the door open for areas "announced before built"). Acceptable if intended; otherwise drop `area`.

**7. nit: the admin guard is checked outside the deleting transaction.** `requireDeletableUserId` (`server/utils/admin.ts:350`) reads `isAdmin` unlocked, then `deleteUser` runs; a sign-in that sets the admin mark in between lets a Platform admin be deleted. `host.put.ts:25` locks the row for the very same race. Window is tiny (admin mark only changes at sign-in); noting the asymmetry.

**8. nit: small repeats in the client.** `AdminUsers.vue` `save` and `confirmRemoveImage` share the try / toast `apiErrorKey` / finally `emit('changed')` shape; `useAdminUserDelete.ts:34,47` writes the literal `'account_games_held'` twice and copies `useAccountDelete`'s late-answer token (`reads`). `AdminEvents.vue:46` keys rows by `index` (entries carry no id by design, rows are stateless, so harmless). `Stopped` in the operator script gained a `reason` field only for the HTTP route (`delete-account-core.mjs:61-69`); the one-home row documents the sharing, so this is fine, just a coupling to watch.

## Checked, no finding

- `permissionsFor` / `syncPermissions` (`allowlist.ts`, `auth.ts`): the role is recomputed, `canHost` only ever set on for an admin; matches ADR 0002 amendment (present in the ADR) and schema comment. `.env.example`, README, CHANGELOG, `03-screens.md` and the one-home row for deleting a User are updated; `platform_admin_*` codes are in `API_ERROR_STATUS` and the `api-error.ts` table.
- Secrecy: `index.get.ts` and `deletion.get.ts` return counts and no id/slug beyond `path` for Events the admin is a Member of; `hidden-wheel-world.ts` lists both new GETs.
- `server/domain/admin.ts` imports nothing from `server/utils/`. Dates go through `berlin-time`/`shared/time`.
- Copy: out of scope.

## Spec

Scope: `git diff v0.23.1...origin/spec/938-admin-seite` (56 files), tickets #939, #942, #682, #876, #940, #941. Browser checks, walk-through and wording were not rated. Nothing was run; this is a read of the diff against the spec.

Verdict: no must-fix. The six tickets are built as the spec words them. One stale legal sentence outside the four prescribed sections is the one finding that matters.

## (a) Missing or partial

**1. should-fix, #942 / spec "The Datenschutzerklärung": § 17 still describes the retired host list.**
`i18n/locales/de.json:1500` (`legal.datenschutz.obligation.text`) ends: "der Abgleich mit der Host-Liste (Abschnitt 6) ist eine reine Berechtigungsprüfung."
- Spec story 12: "the sign-in stops reading the host list".
- The new § 6 says the Host permission is granted on the Admin page and no longer mentions a list or a comparison.
- The Datenschutzerklärung therefore states a comparison that is no longer built, and points to a § 6 that no longer describes it.
- #942 names only §§ 6, 7, 11 and 16 and says "the ticket reads each anchor sentence ... again". § 17 was not in its list, so it is the operator's call. The fix is one clause, and the `legal-pages` test does not cover § 17.

**2. nit, #682 / "text says ... their Events that have not finished stay theirs, with the number".**
`app/components/AdminUsers.vue` (ConfirmModal, `v-if="revoking && revoking.openEvents > 0"`) leaves the "stays" sentence out when the User has no open Event. The test "names no Events when the User hosts none" pins this. It is reasonable, but the ticket asks for the number.

**3. nit, #939 AC "no test or helper sets `HOST_PROVIDER_IDS` any more (grep finds only ADRs and research)".**
- `test/integration/permission-sync.test.ts` builds the name from parts (`['HOST','PROVIDER','IDS'].join('_')`) and stubs the env var, so the grep passes while a test still sets it. This is the intended "whatever the retired list holds" test, but it is a grep workaround.
- `docs/design_handoff_compies/07-scope-and-tickets.md:53,55` still names the variable (old handoff docs).
- `test/integration/sign-in.ts` keeps a `hosts` option on `setAllowlist`, now an in-memory host list used only by the test helpers.

## (b) Behaviour not asked for

**4. nit, #682 / "the tab loses its marker".** The diff removes the whole "soon" mechanism, not just Admin's marker:
- `HUB_SITES` in `app/utils/construction.ts`;
- `soon()` and the `NavSoonMarker` use in `app/components/HubNav.vue`;
- `TabBar`'s `description` prop and its `marker` slot.

This follows from "admin leaves the Construction page's list of areas" (nothing is left in the list). The spec's own statement is "no area is under construction now", and `NavSoonMarker` is still used elsewhere. `constructionSite(path)` also lost its viewer argument. Worth a mention for the changelog and Release PR. The generic-state behaviour for `/admin/...` is covered by the test "has no Admin state of its own any more".

**5. nit, #941.** `GET /api/admin/users/:id/deletion` runs the whole deletion inside a rolled-back transaction. This is how the script's dry run works, and the spec says "the same function", so it is not creep. It takes row locks on the target's User and Events while the sheet is open. Noted only because the spec says "read when the sheet opens".

Nothing else outside the tickets: no extra routes, no notice to Users, no action on an Event row, no `Bibliothek verwalten`.

## (c) Looks implemented but may be wrong

No must-fix and no should-fix here. Each item below was checked against the spec line and holds.

- **Guard.** Every admin route calls `requirePlatformAdmin` first (`server/utils/admin.ts`), before the id is read or the body validated. It reads the flags from the database via `getUser`. A signed-out request, a User and a Host get `apiNotFound` (spec: "answer like a missing route"). `test/integration/hidden-wheel-world.ts` records both GET routes as 404 for every viewer.
- **Host switch** (`host.put.ts`). The row is locked `FOR UPDATE`, so a sign-in racing the write is waited for. Order of checks:
  - unknown id or a Deleted User → not found;
  - taking from a Platform admin → `platform_admin_hosts`;
  - same value → success with no write;
  - nothing is published.
- **Sign-in sync.** `permissionsFor` returns `{isAdmin, canHost: true}` only for a Platform admin and `{isAdmin: false}` otherwise, so the stored flag is untouched.
  - Story 10 holds: losing the role keeps the permission.
  - A Deleted User who signs in again is a new row and starts without it.
  - `HOST_PROVIDER_IDS` is read nowhere in `app/`, `server/`, `scripts/` or `.github/`, and has left `.env.example` and the README table.
- **The read.** Eight fixed queries.
  - Users: only `displayName`, `image`, `profileImageKey`, `createdAt`, `canHost` and `isAdmin` are selected, never `name` or `email`. Deleted Users are left out and counted.
  - Events: the entry carries no id or slug. The `path` key exists only where the admin is a Member and `deletedAt` is null, and is absent otherwise (story 56). The secrecy test asserts this on the raw response.
  - Order: both lists newest first, ties by id.
  - Open-Event count: `LIVE_PHASES` plus `isNull(deletedAt)`, as specified.
- **Picture removal.** `removeProfileImage` is shared with `/api/me/image` (key first, object second, a failed delete logged and left). No live row, or no key, answers not found.
- **Deletion.**
  - `requireDeletableUserId` checks in this order: malformed id → unknown or Deleted → not found; Platform admin, the caller included → `platform_admin_not_deletable`.
  - The after-commit work is `afterUserDeletion`, shared with `me.delete.ts`: objects, `chat.deleted` / `event.changed` with the target's sockets closed, `event.gone` for hosted Events.
  - The admin's own cookie is not touched.
  - `account_games_held` is mapped from both the module's refusal and the dry run.
  - The script's `Stopped` gained a `reason`, and its message is unchanged.
- **Log lines.** `console.info('<action>', adminId, targetId)` for host grant and take, image removal and user deletion. No name or count.
- **Datenschutzerklärung.** I compared the five prescribed texts to the German locale: all five appear word for word.
  - The two old sentences in § 6 are gone.
  - § 14 is unchanged, as the spec wants.
  - "Stand: 26. November 2026." is today's date, and the date-pin comment in `legal-pages.test.ts` is updated.
  - What the page shows matches § 6 and § 11. The only extra visible fact is the open-Event count in the revoke dialog, which the spec itself asks for.
- **Page.**
  - The key groups `admin.library`, `admin.searchGames`, `admin.by`, `admin.edit`, `admin.duplicate`, `admin.platform` and `mvp.site.admin.*` are removed, as #682 and the spec say.
  - `03-screens.md` § 26 has the deviation note.
  - Changelog: one line for #682 and one for #942 under `### Geändert`; the Admin page itself gets none.
  - The row menu omits "Konto löschen" for every Platform admin, and "Profilbild entfernen" only where `hasOwnImage` is true.
  - The Platform admin's switch shows on (`canHost || isAdmin`) and is locked, with the hint.
  - `admin.vue` fetches only for an admin and refetches on return to the tab.

## Test coverage against the ticket ACs

The ACs of all six tickets have a matching test (integration or component); a title-by-title read found no AC without one. The recording notifier is used for the rooms. The secrecy assertion runs on the raw response. A fixed-queries test exists for the Events.
