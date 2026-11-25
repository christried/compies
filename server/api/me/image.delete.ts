import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { useImageStore } from '../../utils/image-store'
import { requireUser, signInRequired } from '../../utils/user'
import { liveUser } from '../../utils/live-user'
import { profilePicture } from '../../../shared/auth'
import type { RemovedProfileImage } from '../../../shared/auth'

// Takes the signed-in User's uploaded Profile picture away (#911): the provider's picture shows again, or the initial. Nothing is published (ADR 0013).
// The key goes first and the object second, the reverse of the PUT on purpose: a failed delete leaves an orphan, never a key that points nowhere. No
// rate limit: the ticket does not ask for one, and the PUT's limiter is not shared.
export default defineEventHandler(async (event): Promise<RemovedProfileImage> => {
  const user = await requireUser(event)
  const db = useDb(event)
  // The row is read and cleared under one lock, as the PUT does, so a PUT of the same User cannot slip between and leave its object an orphan; a User deleted
  // since `requireUser` has no live row and the answer is 401 (#991).
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select({ key: users.profileImageKey, image: users.image }).from(users).where(liveUser(user.id)).for('update')
    if (!current) throw signInRequired()
    if (current.key) await tx.update(users).set({ profileImageKey: null }).where(eq(users.id, user.id))
    return current
  })
  const key = row.key
  if (key) await useImageStore(event).delete(key).catch(failure => console.error('Image cleanup failed', key, failure))
  return { image: profilePicture({ image: row.image, profileImageKey: null }) }
})
