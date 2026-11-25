import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { useImageStore } from '../../utils/image-store'
import { requireUser } from '../../utils/user'
import { profilePicture } from '../../../shared/auth'
import type { RemovedProfileImage } from '../../../shared/auth'

// Takes the signed-in User's uploaded Profile picture away (#911): the provider's picture shows again, or the initial. Nothing is published (ADR 0013).
// The key goes first and the object second, the reverse of the PUT on purpose: a failed delete leaves an orphan, never a key that points nowhere. No
// rate limit: the ticket does not ask for one, and the PUT's limiter is not shared.
export default defineEventHandler(async (event): Promise<RemovedProfileImage> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const [row] = await db.select({ key: users.profileImageKey, image: users.image }).from(users).where(eq(users.id, user.id))
  const key = row?.key ?? null
  if (key) {
    await db.update(users).set({ profileImageKey: null }).where(eq(users.id, user.id))
    await useImageStore(event).delete(key).catch(failure => console.error('Image cleanup failed', key, failure))
  }
  return { image: profilePicture({ image: row?.image, profileImageKey: null }) }
})
