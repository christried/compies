import { defineEventHandler } from 'h3'
import { requireUser, signInRequired } from '../../utils/user'
import { removeProfileImage } from '../../utils/profile-image'
import type { RemovedProfileImage } from '../../../shared/auth'

// Takes the signed-in User's uploaded Profile picture away (#911): the provider's picture shows again, or the initial. Nothing is published (ADR 0013).
// The key goes first and the object second, the reverse of the PUT on purpose: a failed delete leaves an orphan, never a key that points nowhere. No
// rate limit: the ticket does not ask for one, and the PUT's limiter is not shared. The steps sit in `removeProfileImage`, shared with the Admin page's
// removal (#940); a User deleted since `requireUser` has no live row and the answer is 401 (#991).
export default defineEventHandler(async (event): Promise<RemovedProfileImage> => {
  const user = await requireUser(event)
  const removed = await removeProfileImage(event, user.id)
  if (!removed) throw signInRequired()
  return { image: removed.image }
})
