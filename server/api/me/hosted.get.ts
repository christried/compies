import { count, eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { events, games } from '../../db/schema'
import type { HostedCounts } from '../../../shared/auth'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'

// What the Profil page's „Konto löschen“ sheet says goes with an Event host's account (#918, spec #907): the signed-in User's own Events and games, counted as the two
// sets `deleteUser` removes (server/utils/delete-user.ts, ADR 0020), so Deleted and finished Events and archived games count. No User id, no query: the count is the caller's
// own, so no Member learns anything new, and nothing is published (ADR 0013).
export default defineEventHandler(async (event): Promise<HostedCounts> => {
  const { id } = await requireUser(event)
  const db = useDb(event)
  const [hostedEvents] = await db.select({ n: count() }).from(events).where(eq(events.hostId, id))
  const [ownedGames] = await db.select({ n: count() }).from(games).where(eq(games.createdBy, id))
  return { events: hostedEvents!.n, games: ownedGames!.n }
})
