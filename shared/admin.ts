import type { SignInProvider } from './auth'

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

/** What `GET /api/admin` answers: the Users who are not deleted, newest first, and how many Deleted Users there are. 0.24-3 (#876) adds the Events here. */
export interface AdminView {
  users: AdminUser[]
  deletedUsers: number
}

/** What `PUT /api/admin/users/:id/host` answers: the Host permission the User has now. */
export interface SavedHostPermission {
  canHost: boolean
}
