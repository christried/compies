import { eq } from 'drizzle-orm'
import { roundPlaces, rounds } from '../db/schema'
import { nextRoundNumber, resultRejection, winnersOf, type ResultPlace } from '../../shared/results'
import type { ResultEntered } from '../../shared/stage'
import { settingsFromRow } from '../../shared/settings'
import { recordActivity } from './activity'
import { apiError } from './errors'
import type { EventChange } from './event-access'
import { readRounds } from './rounds'

// The Host enters a Result on an open Round (#273, spec #272, GLOSSARY: Result): the Round gets the next number and its Result's time,
// its Places and Scores are stored once, and the feed says who won. The rules are `shared/results.ts`; the instants come from the
// request's clock (ADR 0013), never from the database's `now()`.

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish' | 'now'>

/** Enters the Result of a Round of the Event (`places` as parseResultBody read them); refused with the reason of resultRejection. */
export async function enterResult({ tx, eventRow, user, publish, now }: Change, roundId: string | undefined, places: ResultPlace[] | null): Promise<ResultEntered> {
  const rows = await readRounds(tx, eventRow.id)
  const round = rows.find(row => row.id === roundId) ?? null
  const rejection = resultRejection({ isHost: eventRow.hostId === user.id, settings: settingsFromRow(eventRow), phase: eventRow.phase, round, places })
  if (rejection) throw apiError(rejection)
  // The rules above refused an Event without settings, a Round that is not open (so it has its game) and a body without Places.
  const number = nextRoundNumber(rows.map(row => row.number))
  await tx.insert(roundPlaces).values(places!.map(entry => ({ roundId: round!.id, team: entry.team, place: entry.place, score: entry.score })))
  await tx.update(rounds).set({ number, resultAt: now }).where(eq(rounds.id, round!.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'result_entered', actorId: user.id, params: { roundId: round!.id, number, gameId: round!.gameId!, first: winnersOf(places!) }, now })
  return { roundId: round!.id, number }
}
