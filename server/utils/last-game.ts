import { eq } from 'drizzle-orm'
import { events } from '../db/schema'
import type { LastGameAdded } from '../../shared/event'
import { lastGameRejection } from '../../shared/finish'
import { recordActivity } from './activity'
import { apiError } from './errors'
import type { ChangeCore } from './event-access'
import { readEnd } from './finish'
import { requireSettings } from './settings'

// The Host adds the last game (#278, spec #272): while the Standings hold a Tie, the Game count goes up by one, so every Party plays one
// more Round. It runs under the Event lock (changeEvent, `lock: 'update'`): a second press that waits finds the count incomplete and is
// refused with results_missing, so a double press adds one game.

/** Raises the Game count by one when lastGameRejection passes; refuses with its reason otherwise. Nothing is written before the rule passes. */
export async function addLastGame({ tx, eventRow, user, publish, now }: ChangeCore): Promise<LastGameAdded> {
  const settings = requireSettings(eventRow)
  const { end } = await readEnd(tx, eventRow.id, settings)
  const rejection = lastGameRejection({ isHost: eventRow.hostId === user.id, phase: eventRow.phase, end, gameCount: settings.gameCount })
  if (rejection) throw apiError(rejection)

  const gameCount = settings.gameCount + 1
  // Not applySettingsChange: it validates a whole settings change and the pools; the rule above is the whole check here.
  await tx.update(events).set({ gameCount }).where(eq(events.id, eventRow.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'game_count_changed', actorId: user.id, params: { from: settings.gameCount, to: gameCount }, now })
  return { gameCount }
}
