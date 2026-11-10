import { eq } from 'drizzle-orm'
import { events } from '../db/schema'
import type { EventFinished } from '../../shared/event'
import { leadersOf, type FinishRequest } from '../../shared/finish'
import { recordActivity } from './activity'
import { apiError } from './errors'
import type { ChangeCore } from './event-access'
import { finishReason, readEventState } from './event-state'
import { closeSessions } from './sessions'
import { requireSettings } from './settings'

// The Host finishes the Event (#277, spec #272): once every Round up to the Game count has its Result, the Event is finished for good. The
// finish ends the Running Session, withdraws the Sessions that have not started, sets the Phase and the end instant, and writes one feed
// entry. It runs under the Event lock (changeEvent, `lock: 'update'`), so a Result that races it waits and then answers wrong_phase.

/**
 * Finishes the Event with the outcome and the winners the Host saw (#277), or refuses with the reason of finishReason. Nothing is written
 * before the rule passes. The Phase is set before the Sessions close, and closeSessions does not write it (changeSessions would overwrite it).
 * The Standings come from the Event state's Rounds (#416), the composition the Event read uses too.
 */
export async function finishEvent({ tx, eventRow, user, publish, now }: ChangeCore, request: FinishRequest): Promise<EventFinished> {
  requireSettings(eventRow)
  const state = await readEventState(tx, eventRow, now, ['rounds'])
  const rejection = finishReason(state, eventRow.hostId === user.id, request)
  if (rejection) throw apiError(rejection)

  await tx.update(events).set({ phase: 'finished', finishedAt: now }).where(eq(events.id, eventRow.id))
  await closeSessions(tx, eventRow, now)
  // The rule above refused an Event without settings, so the Standings exist.
  const winners = leadersOf(state.standing!.standings)
  // Only this entry: the Sessions' removal and end are the finish's own, not a feed entry each (#277).
  await recordActivity(tx, publish, eventRow.id, { type: 'event_finished', actorId: user.id, params: { winners }, now })
  return { phase: 'finished', winners }
}
