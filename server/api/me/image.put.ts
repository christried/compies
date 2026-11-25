import { eq } from 'drizzle-orm'
import { defineEventHandler, getHeader, getRequestWebStream } from 'h3'
import { users } from '../../db/schema'
import { isWebp, profileImageKey, readUpTo, webpInfo } from '../../domain/image'
import { useClock } from '../../utils/clock'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { useImageStore } from '../../utils/image-store'
import { createRateLimiter } from '../../utils/rate-limit'
import { requireUser, signInRequired } from '../../utils/user'
import { liveUser } from '../../utils/live-user'
import type { SavedProfileImage } from '../../../shared/auth'
import { IMAGE_PATH, PROFILE_IMAGE_MAX_BYTES, PROFILE_IMAGE_SIZE } from '../../../shared/image'

// Gives the signed-in User a Profile picture (#678, spec #907): one still WebP of 256 × 256 pixels as the raw body, up to PROFILE_IMAGE_MAX_BYTES, from
// any User (no Host permission). Every upload gets a new key, so the old address stops working and nothing serves stale (the image route's profile
// branch serves a current key only); the replaced object is deleted once the new key is written. Nothing is published: others read the new picture at
// their next load (ADR 0013).
// 10 uploads in 10 minutes per User, in memory per server instance like the other limiters. `take` runs for every authenticated request, a refused one
// included, as the Messages limiter does; a request refused with 429 adds no hit.
const uploadLimiter = createRateLimiter({ limit: 10, windowMs: 600_000 })

export default defineEventHandler(async (event): Promise<SavedProfileImage> => {
  const user = await requireUser(event)
  if (!uploadLimiter.take(user.id, useClock(event).now())) throw apiError('rate_limited')

  // The announced length is checked before the body is read, so a huge upload is not buffered; a body without a length is read through a counter
  // that stops at the maximum.
  if (Number(getHeader(event, 'content-length') ?? 0) > PROFILE_IMAGE_MAX_BYTES) throw apiError('image_too_large')
  const body = await readUpTo(getRequestWebStream(event), PROFILE_IMAGE_MAX_BYTES)
  if (!body) throw apiError('image_too_large')
  if (!isWebp(body)) throw apiError('image_not_webp')
  // The browser makes a still of exactly this size; the server reads the header and trusts the marks beyond that, as for a game image.
  const info = webpInfo(body)
  if (!info || info.animated || info.width !== PROFILE_IMAGE_SIZE || info.height !== PROFILE_IMAGE_SIZE) throw apiError('image_unsupported')

  const db = useDb(event)
  const store = useImageStore(event)
  const key = profileImageKey()
  await store.put(key, body, 'image/webp')
  let oldKey: string | null
  try {
    // The old key is read under the row lock and the new one set in the same transaction, so two PUTs of one User run one after the other and each deletes
    // the object the other left; a User deleted since `requireUser` has no live row, and nothing is set (#991).
    oldKey = await db.transaction(async (tx) => {
      const [current] = await tx.select({ key: users.profileImageKey }).from(users).where(liveUser(user.id)).for('update')
      if (!current) throw signInRequired()
      await tx.update(users).set({ profileImageKey: key }).where(eq(users.id, user.id))
      return current.key
    })
  }
  catch (error) {
    // The row still points at the old object, so the new one would be an orphan.
    await store.delete(key).catch(failure => console.error('Image cleanup failed', key, failure))
    throw error
  }
  // A failed delete only leaves an orphan behind; the User's save went through.
  if (oldKey) await store.delete(oldKey).catch(failure => console.error('Image cleanup failed', oldKey, failure))

  return { image: `${IMAGE_PATH}${key}` }
})
