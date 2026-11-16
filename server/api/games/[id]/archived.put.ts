import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { games } from '../../../db/schema'
import { asRecord } from '../../../../shared/record'
import { useClock } from '../../../utils/clock'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadGame, readGameViews, requireLibraryViewer } from '../../../utils/library'
import type { GameView } from '../../../../shared/game'

// Archives or restores a game of the library (#467, spec #717 § B): `{ "archived": boolean }`, answered with the game. Only the owner may (#455: another
// User's game, the Platform admin's request included, and an unknown id answer as a missing route, before the body is read, so a probe learns nothing).
// A write to the library only: no Event lock, no Activity entry, no room message; an archive changes no Event. Idempotent: a game that already is in the
// asked state is answered as it is, so a second archive keeps the first instant; a request that loses a race to a concurrent one answers the row as
// that one left it.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  let game = await loadGame(db, getRouterParam(event, 'id') ?? '', viewer.id)

  const archived = asRecord(await readBody(event)).archived
  if (typeof archived !== 'boolean') throw apiError('invalid_value')

  if ((game.archivedAt !== null) !== archived) {
    const now = useClock(event).now()
    const [changed] = await db
      .update(games)
      .set({ archivedAt: archived ? now : null, updatedAt: now })
      // The state the request read: a concurrent request that already moved the game wins and this one writes nothing.
      .where(and(eq(games.id, game.id), archived ? isNull(games.archivedAt) : isNotNull(games.archivedAt)))
      .returning()
    if (changed) game = changed
    else [game] = (await db.select().from(games).where(eq(games.id, game.id)).limit(1)) as [typeof game]
  }
  const [view] = await readGameViews(db, [game])
  return view!
})
