import type { SignInProvider } from './auth'
import type { Phase } from './event'

// What the Admin page reads and writes (#682, spec #938). The Platform admin's alone: every route answers like a missing route to anyone else.

/**
 * One User of the list: who they are as the Platform admin may see it. Never the provider's name, never the email (ADR 0008, Datenschutzerklärung § 6).
 * `displayName` is null until the User has picked one. `image` is the Profile picture shown (the uploaded one, else the provider's, `profilePicture`)
 * and `hasOwnImage` says it is an uploaded one. `firstSignInAt` is the row's creation. `openEvents` counts the Events the User hosts that have not finished
 * and are not deleted.
 */
export interface AdminUser {
  id: string
  displayName: string | null
  image: string | null
  hasOwnImage: boolean
  providers: SignInProvider[]
  firstSignInAt: string
  canHost: boolean
  isAdmin: boolean
  openEvents: number
}

/**
 * One Event of the list (#876, spec #938): what the Platform admin may see of it and nothing else, so no Members, no Team names, no Chat, no Votes, no Notes, no
 * games and no Invite link, and no id or slug. `hostName` is the Host's Display name, null until they picked one (never the provider's name, ADR 0008).
 * `finishedAt` is the Finish and `deletedAt` the deletion of a Deleted Event. `path` is the Event's address (the one the Archive card links to) and the key is
 * left out where the Platform admin is no Member or the Event is deleted: such an entry carries nothing that addresses the Event (ADR 0006).
 */
export interface AdminEvent {
  name: string
  hostName: string | null
  phase: Phase
  memberCount: number
  sessionCount: number
  createdAt: string
  finishedAt: string | null
  deletedAt: string | null
  path?: string
}

/** What `GET /api/admin` answers: the Users who are not deleted, newest first, how many Deleted Users there are, and every Event, Deleted Events included, newest first by creation (#876). */
export interface AdminView {
  users: AdminUser[]
  deletedUsers: number
  events: AdminEvent[]
}

/** The Events whose name holds the search, in the server's order: a part of the name, case and outer spaces ignored (`filterAdminUsers`' rule). */
export function filterAdminEvents(events: readonly AdminEvent[], query: string): AdminEvent[] {
  const term = query.trim().toLocaleLowerCase('de')
  return events.filter(entry => !term || entry.name.toLocaleLowerCase('de').includes(term))
}

/** The Users whose Display name holds the search, in the server's order: a part of the name, case and outer spaces ignored (`filterArchive`'s rule). A User with no Display name is found by no search. */
export function filterAdminUsers(users: readonly AdminUser[], query: string): AdminUser[] {
  const term = query.trim().toLocaleLowerCase('de')
  return users.filter(user => !term || (user.displayName?.toLocaleLowerCase('de').includes(term) ?? false))
}

/** What `PUT /api/admin/users/:id/host` answers: the Host permission the User has now. */
export interface SavedHostPermission {
  canHost: boolean
}

/**
 * What `GET /api/admin/users/:id/deletion` answers (#941, spec #938): the counts the deletion of the User's account would remove or end, the ones the operator's
 * script prints in its dry run (`scripts/prod/delete-account-core.mjs`). Counts only: no Event id, no name. `hostedEvents` counts finished and Deleted Events too;
 * `membershipsEnding` the Memberships of other Hosts' Events that have not finished, `membershipsStaying` those of finished ones (their Seat stays).
 */
export interface AdminUserDeletion {
  hostedEvents: number
  games: number
  membershipsEnding: number
  membershipsStaying: number
  imageObjects: number
}
