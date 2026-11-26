import { defineEventHandler } from 'h3'
import { adminUserIdParam, requirePlatformAdmin } from '../../../../utils/admin'
import { apiNotFound } from '../../../../utils/errors'
import { removeProfileImage } from '../../../../utils/profile-image'
import type { RemovedProfileImage } from '../../../../../shared/auth'

// Takes one User's uploaded Profile picture away on the Admin page (#940, spec #938): the same function as the User's own removal (#911), so the two cannot
// drift. A User without an uploaded picture, an unknown id, text that is no id and a Deleted User answer like a missing route, and so does everyone who is
// not a Platform admin. Nothing is published: the User and other Members see the provider's picture at their next load (ADR 0013). No notice to the User.
// The log line holds the action and the two User ids, never a name.
export default defineEventHandler(async (event): Promise<RemovedProfileImage> => {
  const admin = await requirePlatformAdmin(event)
  const id = adminUserIdParam(event)
  const removed = await removeProfileImage(event, id)
  if (!removed?.key) throw apiNotFound()
  console.info('admin.image.remove', admin.id, id)
  return { image: removed.image }
})
