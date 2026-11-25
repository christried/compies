import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { games, users } from '../../db/schema'
import { isProfileImageKey } from '../../domain/image'
import { canSeeImage, ownsImage } from '../../domain/image-access'
import { useClock } from '../../utils/clock'
import { useDb } from '../../utils/db'
import { useImageStore } from '../../utils/image-store'
import { libraryNotFound } from '../../utils/library'
import { gameEventsOf } from '../../utils/pools'
import { getUser } from '../../utils/user'

// Serves a Profile picture (#678) or a game's image (#143). A key with the profile prefix is served to anyone, signed in or not, while it is some User's
// current Profile picture; an older or made-up one answers like a missing route, and such a key never falls through to the games. The cache of a Profile
// picture is private like the game image's (below): Vercel's CDN kept a public one and served a replaced or removed picture for its year, while the origin
// answered 404 (#995). Browsers keep what they loaded; who may read it does not change.
//
// A game's image: only the game's current key counts, so a replaced image's URL is gone.
// Who may not see it, and an unknown key, get the same answer as a missing route. The cache is private
// because access depends on the viewer; the key changes with the image, so it can be kept for good.
// Copies of a game share a key (ADR 0018), so every row with the key counts: its owners see the image (#723), and nobody else
// does but the Members of an Event that uses such a game, not under a Hidden wheel (#148), and of a game a Round has set (#228) or a draw has stopped on (#229).
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const db = useDb(event)

  if (isProfileImageKey(key)) {
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.profileImageKey, key)).limit(1)
    if (!owner) throw libraryNotFound()
    const picture = await useImageStore(event).get(key)
    if (!picture) throw libraryNotFound()
    setHeader(event, 'content-type', 'image/webp')
    setHeader(event, 'cache-control', 'private, max-age=31536000, immutable')
    setHeader(event, 'x-content-type-options', 'nosniff')
    return picture
  }

  const viewer = await getUser(event)

  const rows = await db.select({ createdBy: games.createdBy }).from(games).where(eq(games.imageKey, key))
  if (rows.length === 0) throw libraryNotFound()
  const ownerIds = rows.map(row => row.createdBy)
  // An owner needs no Event lookup; for everyone else the Events they are Members of decide.
  const gameEvents = viewer && !ownsImage(viewer, ownerIds) ? await gameEventsOf(db, viewer.id, key, useClock(event).now()) : []
  if (!canSeeImage({ viewer, ownerIds, gameEvents })) throw libraryNotFound()

  const image = await useImageStore(event).get(key)
  if (!image) throw libraryNotFound()

  setHeader(event, 'content-type', 'image/webp')
  setHeader(event, 'cache-control', 'private, max-age=31536000, immutable')
  // The only check on an upload is its WebP marks, so the browser must not guess another type.
  setHeader(event, 'x-content-type-options', 'nosniff')
  return image
})
