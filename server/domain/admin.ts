import type { AdminUser } from '../../shared/admin'
import { profilePicture, SIGN_IN_PROVIDERS, type SignInProvider } from '../../shared/auth'

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
