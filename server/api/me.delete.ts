import { appendResponseHeader, defineEventHandler } from 'h3'
import { useAuth } from '../utils/auth'
import { useClock } from '../utils/clock'
import { useDb } from '../utils/db'
import { deleteUser, removeImages, UserNotDeletable, type UserDeletion } from '../utils/delete-user'
import { apiError } from '../utils/errors'
import { afterCommit } from '../utils/event-access'
import { useImageStore } from '../utils/image-store'
import { requireUser } from '../utils/user'
import type { AccountDeleted } from '../../shared/auth'

// Deletes the signed-in User's account (#681, spec #907, ADR 0020): no body and no User id, so nobody can delete anybody but themselves, and no second
// sign-in. `deleteUser` does the database in one transaction; this route owns what comes after: the uploaded Profile picture's object, the rooms and the
// session cookie. The Profil page's button is 0.21-12 (#918).
// A Host (an Event or a game of theirs) is refused with `account_hosts` until 0.21-11 (#917) deletes those with the account. Any other reason is a 500: a
// session that passed `requireUser` has a live row, and the deletion's own race (two calls at once) lands there too.
export default defineEventHandler(async (event): Promise<AccountDeleted> => {
  const user = await requireUser(event)
  let deletion: UserDeletion
  try {
    deletion = await deleteUser(useDb(event), user.id, useClock(event).now())
  }
  catch (error) {
    if (error instanceof UserNotDeletable && (error.reason === 'hosts_events' || error.reason === 'has_games')) throw apiError('account_hosts')
    throw error
  }

  // Nothing below fails the answer: the deletion is committed. A deployment without R2 configuration has no store to ask, and a User with no picture needs none.
  if (deletion.imageKeys.length > 0) {
    try {
      await removeImages(useImageStore(event), deletion.imageKeys)
    }
    catch (failure) {
      console.error('Image cleanup failed', deletion.imageKeys, failure)
    }
  }

  // Everyone in the room learns the Event changed and which Messages lost their text; the Deleted User's own sockets get `event.changed` last and are closed,
  // in a finished Event too (ADR 0013, amendment of 2026-11-20). Their page refetches, reads 401 (the session is gone) and goes to the sign-in page.
  for (const { eventId, deletedMessageIds } of deletion.events) {
    afterCommit(event, { id: eventId }, deletedMessageIds.map(id => ({ type: 'chat.deleted', id, deletedBy: 'writer' })), [], true, [{ users: [user.id], messages: [{ type: 'event.changed' }] }])
  }

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
