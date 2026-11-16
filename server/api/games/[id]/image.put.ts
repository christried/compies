import { eq } from 'drizzle-orm'
import { defineEventHandler, getHeader, getRequestWebStream, getRouterParam } from 'h3'
import { games } from '../../../db/schema'
import { imageKey, isWebp, readUpTo } from '../../../domain/image'
import { useClock } from '../../../utils/clock'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { useImageStore } from '../../../utils/image-store'
import { loadGame, readGameViews, requireLibraryViewer } from '../../../utils/library'
import { GAME_IMAGE_MAX_BYTES, type GameView } from '../../../../shared/game'

// Gives a game its image (#143): one WebP of up to GAME_IMAGE_MAX_BYTES as the raw body, from the game's
// creator (#455: another User's game answers as a missing one). Every upload gets a new key, so the old URL stops working and nothing serves stale; the
// replaced object is deleted from the store once the new one is in the database.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const { game, creatorName } = await loadGame(db, getRouterParam(event, 'id') ?? '', viewer.id)

  // The announced length is checked before the body is read, so a huge upload is not buffered; a body
  // without a length is read through a counter that stops at the maximum.
  if (Number(getHeader(event, 'content-length') ?? 0) > GAME_IMAGE_MAX_BYTES) throw apiError('image_too_large')
  const body = await readUpTo(getRequestWebStream(event), GAME_IMAGE_MAX_BYTES)
  if (!body) throw apiError('image_too_large')
  if (!isWebp(body)) throw apiError('image_not_webp')

  const store = useImageStore(event)
  const key = imageKey(game.id)
  await store.put(key, body, 'image/webp')
  let updated
  try {
    ;[updated] = await db.update(games).set({ imageKey: key, updatedAt: useClock(event).now() }).where(eq(games.id, game.id)).returning()
  }
  catch (error) {
    // The row still points at the old object, so the new one would be an orphan.
    await store.delete(key).catch(failure => console.error('Image cleanup failed', key, failure))
    throw error
  }
  // The replaced object goes only when no other game row names its key: copies share one (#723, ADR 0018). The lookup runs after the update, so
  // this row no longer counts. A failed lookup or delete only leaves an orphan behind; the Host's save went through.
  if (game.imageKey) {
    const oldKey = game.imageKey
    try {
      const [stillUsed] = await db.select({ id: games.id }).from(games).where(eq(games.imageKey, oldKey)).limit(1)
      if (!stillUsed) await store.delete(oldKey)
    }
    catch (failure) {
      console.error('Image cleanup failed', oldKey, failure)
    }
  }
  const [view] = await readGameViews(db, [{ game: updated!, creatorName }], viewer)
  return view!
})
