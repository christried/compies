import { defineEventHandler } from 'h3'
import { afterUserDeletion } from '../../../utils/after-user-deletion'
import { requireDeletableUserId, requirePlatformAdmin } from '../../../utils/admin'
import { useClock } from '../../../utils/clock'
import { useDb } from '../../../utils/db'
import { deleteUser, UserNotDeletable } from '../../../utils/delete-user'
import { apiError, apiNotFound } from '../../../utils/errors'
import type { AccountDeleted } from '../../../../shared/auth'

// Deletes another User's account on the Platform admin's behalf, on that User's request (#941, spec #938, ADR 0020): the module of #681 and #917, then the same
// work after the commit as the User's own route (`afterUserDeletion`: the store's objects, the rooms). The admin's own session is not touched: no sign-out, no cookie.
// The User's sessions are gone with their rows, so their open pages read 401 at the next read and go to the sign-in page; no notice is sent. A Platform admin's id
// (the admin's own included) is refused with `platform_admin_not_deletable`, nothing changed; an unknown id, text that is no id and a Deleted User answer like a
// missing route, and so does everyone who is not a Platform admin. `account_games_held` refuses as on the Profil page. The log line holds the action and the
// two User ids, never a name.
export default defineEventHandler(async (event): Promise<AccountDeleted> => {
  const admin = await requirePlatformAdmin(event)
  const id = await requireDeletableUserId(event)
  let deletion
  try {
    deletion = await deleteUser(useDb(event), id, useClock(event).now())
  }
  catch (error) {
    if (error instanceof UserNotDeletable) {
      if (error.reason === 'games_held') throw apiError('account_games_held')
      // Unknown or deleted since the check above (a second call at once): like a missing route.
      throw apiNotFound()
    }
    throw error
  }
  await afterUserDeletion(event, id, deletion)
  console.info('admin.user.delete', admin.id, id)
  return { deleted: true }
})
