import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { games } from '../../db/schema'
import { canSeeImage } from '../../domain/image-access'
import { canSeeLibrary } from '../../../shared/game'
import { useDb } from '../../utils/db'
import { useImageStore } from '../../utils/image-store'
import { libraryNotFound } from '../../utils/library'
import { poolEventsOf } from '../../utils/pools'
import { getUser } from '../../utils/user'

// Serves a game's image (#143). Only the game's current key counts, so a replaced image's URL is gone.
// Who may not see it, and an unknown key, get the same answer as a missing route. The cache is private
// because access depends on the viewer; the key changes with the image, so it can be kept for good.
// Members of an Event see the images of its pool games, but not under a Hidden wheel (#148).
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const viewer = await getUser(event)
  const db = useDb(event)

  const [game] = await db.select().from(games).where(eq(games.imageKey, key))
  if (!game) throw libraryNotFound()
  // Library viewers need no Event lookup; for everyone else the Events they are Members of decide.
  const poolEvents = viewer && !canSeeLibrary(viewer) ? await poolEventsOf(db, viewer.id, game.id) : []
  if (!canSeeImage({ viewer, game, poolEvents })) throw libraryNotFound()

  const image = await useImageStore(event).get(key)
  if (!image) throw libraryNotFound()

  setHeader(event, 'content-type', 'image/webp')
  setHeader(event, 'cache-control', 'private, max-age=31536000, immutable')
  return image.body
})
