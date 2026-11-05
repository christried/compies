import { and, eq, isNotNull } from 'drizzle-orm'
import { events, roundPlaces, rounds } from '../db/schema'
import type { EventFinished } from '../../shared/event'
import { finishRejection, leadersOf, standingsAndEnd, type FinishRequest } from '../../shared/finish'
import type { EventSettings } from '../../shared/settings'
import { recordActivity } from './activity'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange } from './event-access'
import { closeSessions } from './sessions'
import { requireSettings } from './settings'

// The Host finishes the Event (#277, spec #272): once every Round up to the Game count has its Result, the Event is finished for good. The
// finish ends the Running Session, withdraws the Sessions that have not started, sets the Phase and the end instant, and writes one feed
// entry. It runs under the Event lock (changeEvent, `lock: 'update'`), so a Result that races it waits and then answers wrong_phase.

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish' | 'now'>

/**
 * The Places of every Round with a Result, one list per Round (#277): the Standings and the count are computed from them. One statement
 * for the Event, not the whole read: the finish needs nothing else.
 */
export async function readResultPlaces(db: Db, eventId: string): Promise<{ team: number, place: number }[][]> {
  const rows = await db
    .select({ roundId: roundPlaces.roundId, team: roundPlaces.team, place: roundPlaces.place })
    .from(roundPlaces)
    .innerJoin(rounds, eq(roundPlaces.roundId, rounds.id))
    .where(and(eq(rounds.eventId, eventId), isNotNull(rounds.resultAt)))
  const byRound = new Map<string, { team: number, place: number }[]>()
  for (const row of rows) {
    const places = byRound.get(row.roundId) ?? []
    places.push({ team: row.team, place: row.place })
    byRound.set(row.roundId, places)
  }
  return [...byRound.values()]
}

/**
 * The Standings and the end of the Event under the lock (#278, shared by the finish and the last game): the Places of the Rounds with a
 * Result, through standingsAndEnd, the composition the Event read uses too. The finish and the last game both refuse on it.
 */
export async function readEnd(db: Db, eventId: string, settings: Pick<EventSettings, 'pointsTable' | 'teamCount' | 'gameCount'>): Promise<ReturnType<typeof standingsAndEnd>> {
  return standingsAndEnd(await readResultPlaces(db, eventId), settings)
}

/**
 * Finishes the Event with the outcome and the winners the Host saw (#277), or refuses with the reason of finishRejection. Nothing is written
 * before the rule passes. The Phase is set before the Sessions close, and closeSessions does not write it (changeSessions would overwrite it).
 */
export async function finishEvent({ tx, eventRow, user, publish, now }: Change, { outcome, winners: seen }: FinishRequest): Promise<EventFinished> {
  const settings = requireSettings(eventRow)
  const { standings, end } = await readEnd(tx, eventRow.id, settings)
  const rejection = finishRejection({ isHost: eventRow.hostId === user.id, phase: eventRow.phase, end, standings, outcome, winners: seen })
  if (rejection) throw apiError(rejection)

  await tx.update(events).set({ phase: 'finished', finishedAt: now }).where(eq(events.id, eventRow.id))
  await closeSessions(tx, eventRow, now)
  const winners = leadersOf(standings)
  // Only this entry: the Sessions' removal and end are the finish's own, not a feed entry each (#277).
  await recordActivity(tx, publish, eventRow.id, { type: 'event_finished', actorId: user.id, params: { winners }, now })
  return { phase: 'finished', winners }
}
