import { and, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { games } from '../../../db/schema'
import { asRecord } from '../../../../shared/record'
import { useClock } from '../../../utils/clock'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { archivedGame, loadGame, notArchived, readGameViews, requireLibraryViewer } from '../../../utils/library'
import { liveEventsHolding } from '../../../utils/pools'
import { publishAfterResponse } from '../../../utils/room-notifier'
import { envelope } from '../../../../shared/realtime'
import type { GameView } from '../../../../shared/game'

// Archives or restores a game of the library (#467, spec #717 § B): `{ "archived": boolean }`, answered with the game. Only the owner may (#455: another
// User's game, the Platform admin's request included, and an unknown id answer as a missing route, before the body is read, so a probe learns nothing).
// A write to the library: no Event lock, no Activity entry, no change of any Event row (the pool rows stay, so a restore needs no write, #725). The Events that
// hold the game read their pool through the Archived term, so after the commit the room of each live one (the owner's, not finished, not deleted) hears the
// payload-free `event.changed` (ADR 0013), published after the response like a Host's pool change, and only when this request changed the row. Idempotent: a
// game that already is in the asked state is answered as it is and tells nobody, so a second archive keeps the first instant; a request that loses a race to a
// concurrent one answers the row as that one left it, and the concurrent one publishes.
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
      .where(and(eq(games.id, game.id), archived ? notArchived : archivedGame))
      .returning()
    if (changed) {
      game = changed
      const message = envelope({ type: 'event.changed' }, now.getTime())
      for (const eventId of await liveEventsHolding(db, game.id, viewer.id)) publishAfterResponse(event, eventId, [message])
    }
    else [game] = (await db.select().from(games).where(eq(games.id, game.id)).limit(1)) as [typeof game]
  }
  const [view] = await readGameViews(db, [game])
  return view!
})
