import { eq } from 'drizzle-orm'
import { defineEventHandler, getHeader, getRouterParam, readRawBody } from 'h3'
import { games, users } from '../../../db/schema'
import { imageKey, isWebp } from '../../../domain/image'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { useImageStore } from '../../../utils/image-store'
import { gameView, libraryNotFound, requireLibraryViewer } from '../../../utils/library'
import { GAME_IMAGE_MAX_BYTES, canEditGame, type GameView } from '../../../../shared/game'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Gives a game its image (#143): one WebP of up to GAME_IMAGE_MAX_BYTES as the raw body, from whoever may
// edit the game. Every upload gets a new key, so the old URL stops working and nothing serves stale.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID.test(id)) throw libraryNotFound()

  const db = useDb(event)
  const [row] = await db
    .select({ game: games, creatorName: users.name, creatorDisplayName: users.displayName })
    .from(games)
    .innerJoin(users, eq(games.createdBy, users.id))
    .where(eq(games.id, id))
  if (!row) throw libraryNotFound()
  if (!canEditGame(viewer, row.game)) throw apiError('not_game_editor')

  // The announced length is checked before the body is read, so a huge upload is not buffered.
  if (Number(getHeader(event, 'content-length') ?? 0) > GAME_IMAGE_MAX_BYTES) throw apiError('image_too_large')
  const body = await readRawBody(event, false)
  if (!body || !isWebp(body)) throw apiError('image_not_webp')
  if (body.length > GAME_IMAGE_MAX_BYTES) throw apiError('image_too_large')

  const key = imageKey(id)
  await useImageStore(event).put(key, new Uint8Array(body), 'image/webp')
  const [updated] = await db.update(games).set({ imageKey: key, updatedAt: new Date() }).where(eq(games.id, id)).returning()
  return gameView(updated!, row.creatorDisplayName ?? row.creatorName, viewer)
})
