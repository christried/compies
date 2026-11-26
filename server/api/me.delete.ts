import { appendResponseHeader, defineEventHandler } from 'h3'
import { afterUserDeletion } from '../utils/after-user-deletion'
import { useAuth } from '../utils/auth'
import { useClock } from '../utils/clock'
import { useDb } from '../utils/db'
import { deleteUser, UserNotDeletable, type UserDeletion } from '../utils/delete-user'
import { apiError } from '../utils/errors'
import { requireUser } from '../utils/user'
import type { AccountDeleted } from '../../shared/auth'

// Deletes the signed-in User's account (#681, spec #907, ADR 0020): no body and no User id, so nobody can delete anybody but themselves, and no second
// sign-in. `deleteUser` does the database in one transaction; this route owns what comes after: the uploaded Profile picture's object, the rooms and the
// session cookie. The Profil page's „Konto löschen“ sheet calls it (#918). The Platform admin's route for another User (#941) shares `afterUserDeletion`.
// A Host's Events and library go with the account (#917, ADR 0020); each removed Event's room hears `event.gone`. The one refusal is `account_games_held` (a game of
// the User named by another Host's Event). Any other reason is a 500: a session that passed `requireUser` has a live row, and the deletion's own race (two calls at
// once) lands there too.
export default defineEventHandler(async (event): Promise<AccountDeleted> => {
  const user = await requireUser(event)
  let deletion: UserDeletion
  try {
    deletion = await deleteUser(useDb(event), user.id, useClock(event).now())
  }
  catch (error) {
    if (error instanceof UserNotDeletable && error.reason === 'games_held') throw apiError('account_games_held')
    throw error
  }

  await afterUserDeletion(event, user.id, deletion)

  // The sessions are gone with the rows already; this only expires the cookie.
  try {
    const { headers } = await useAuth(event).api.signOut({ headers: event.headers, returnHeaders: true })
    for (const cookie of headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie)
  }
  catch (failure) {
    console.error('Sign-out after the deletion failed', failure)
  }
  return { deleted: true }
})
