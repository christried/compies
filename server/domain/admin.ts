import type { AdminEvent, AdminUser } from '../../shared/admin'
import { profilePicture, SIGN_IN_PROVIDERS, type SignInProvider } from '../../shared/auth'
import type { Phase } from '../../shared/event'
import { eventPath } from '../../shared/links'

// The Admin page's rules (#682, spec #938). Pure functions: the read loads the rows and passes them in, as Home's and the Archive's reads do.

/** What the list needs of a User's row: never `name` or `email` (the provider's), so a column cannot slip into the answer by being on the row. */
export interface AdminUserRow {
  id: string
  displayName: string | null
  image: string | null
  profileImageKey: string | null
  createdAt: Date
  canHost: boolean
  isAdmin: boolean
}

/**
 * The Users of the Admin page's list, newest first (a tie by id, so the order is the same on every read). `accounts` are the linked provider accounts of
 * all Users and `openEvents` the number of live Events each Host has (`liveEventOf`): both are looked up by User, and a User with none has no entry.
 * An unknown provider id is left out of `providers`, which come in the order of `SIGN_IN_PROVIDERS` with no repeat.
 */
export function adminUsers({ rows, accounts, openEvents }: {
  rows: readonly AdminUserRow[]
  accounts: readonly { userId: string, providerId: string }[]
  openEvents: ReadonlyMap<string, number>
}): AdminUser[] {
  const providersOf = Map.groupBy(accounts, account => account.userId)
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
    .map((row) => {
      const linked = new Set((providersOf.get(row.id) ?? []).map(account => account.providerId))
      return {
        id: row.id,
        displayName: row.displayName,
        image: profilePicture(row),
        hasOwnImage: row.profileImageKey !== null,
        providers: SIGN_IN_PROVIDERS.filter((provider: SignInProvider) => linked.has(provider)),
        firstSignInAt: row.createdAt.toISOString(),
        canHost: row.canHost,
        isAdmin: row.isAdmin,
        openEvents: openEvents.get(row.id) ?? 0,
      }
    })
}

/** What the list needs of an Event's row (#876): `id` and `slug` stay on this side, they never reach an entry. */
export interface AdminEventRow {
  id: string
  slug: string
  name: string
  hostDisplayName: string | null
  phase: Phase
  createdAt: Date
  finishedAt: Date | null
  deletedAt: Date | null
}

/**
 * The Events of the Admin page's list, newest first by creation (a tie by id, so the order is the same on every read). `members` and `sessions` are the counts
 * per Event (an Event with none has no entry) and `memberOf` the Events the Platform admin is a Member of. The address (`eventPath`) is given only for an Event in
 * `memberOf` that is not deleted; any other entry has no `path` key at all, so nothing in it addresses the Event (ADR 0006, spec #938).
 */
export function adminEvents({ rows, members, sessions, memberOf }: {
  rows: readonly AdminEventRow[]
  members: ReadonlyMap<string, number>
  sessions: ReadonlyMap<string, number>
  memberOf: ReadonlySet<string>
}): AdminEvent[] {
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
    .map(row => ({
      name: row.name,
      hostName: row.hostDisplayName,
      phase: row.phase,
      memberCount: members.get(row.id) ?? 0,
      sessionCount: sessions.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      ...(memberOf.has(row.id) && row.deletedAt === null ? { path: eventPath(row.slug) } : {}),
    }))
}
