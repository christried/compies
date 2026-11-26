import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { profilePicture } from '../../shared/auth'
import { useDb } from './db'
import { useImageStore } from './image-store'
import { liveUser } from './live-user'

/**
 * Takes one User's uploaded Profile picture away (#911, #940): the key goes from the User under the row lock, then the object from the store. The reverse
 * of the PUT on purpose: a failed delete leaves an orphan, never a key that points nowhere. A User without an upload keeps the row untouched. Returns the
 * picture the User shows now (`image`, the provider's or null) and the key that was taken (null when there was none), or undefined when no live row
 * matches (a Deleted User, an unknown id), so each route answers its own way. Nothing is published (ADR 0013).
 */
export async function removeProfileImage(event: H3Event, userId: string): Promise<{ key: string | null, image: string | null } | undefined> {
  const row = await useDb(event).transaction(async (tx) => {
    const [current] = await tx.select({ key: users.profileImageKey, image: users.image }).from(users).where(liveUser(userId)).for('update')
    if (!current) return undefined
    if (current.key) await tx.update(users).set({ profileImageKey: null }).where(eq(users.id, userId))
    return current
  })
  if (!row) return undefined
  const { key } = row
  if (key) await useImageStore(event).delete(key).catch(failure => console.error('Image cleanup failed', key, failure))
  return { key, image: profilePicture({ image: row.image, profileImageKey: null }) }
}
