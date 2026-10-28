import { eq } from 'drizzle-orm'
import { defineEventHandler, getHeader, getRouterParam, readRawBody } from 'h3'
import { games } from '../../../db/schema'
import { imageKey, isWebp } from '../../../domain/image'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { useImageStore } from '../../../utils/image-store'
import { gameView, loadGame, requireLibraryViewer } from '../../../utils/library'
import { GAME_IMAGE_MAX_BYTES, canEditGame, type GameView } from '../../../../shared/game'

// Gives a game its image (#143): one WebP of up to GAME_IMAGE_MAX_BYTES as the raw body, from whoever may
// edit the game. Every upload gets a new key, so the old URL stops working and nothing serves stale.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const { game, creatorName } = await loadGame(db, getRouterParam(event, 'id') ?? '')
  if (!canEditGame(viewer, game)) throw apiError('not_game_editor')

  // The announced length is checked before the body is read, so a huge upload is not buffered.
  if (Number(getHeader(event, 'content-length') ?? 0) > GAME_IMAGE_MAX_BYTES) throw apiError('image_too_large')
  const body = await readRawBody(event, false)
  if (!body || !isWebp(body)) throw apiError('image_not_webp')
  if (body.length > GAME_IMAGE_MAX_BYTES) throw apiError('image_too_large')

  const key = imageKey(game.id)
  await useImageStore(event).put(key, new Uint8Array(body), 'image/webp')
  const [updated] = await db.update(games).set({ imageKey: key, updatedAt: new Date() }).where(eq(games.id, game.id)).returning()
  return gameView(updated!, creatorName, viewer)
})
