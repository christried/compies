import { eq } from 'drizzle-orm'
import { roundPlaces, rounds } from '../db/schema'
import { nextRoundNumber, resultRejection, sameResult, winnersOf, type ResultPlace } from '../../shared/results'
import type { ResultEntered } from '../../shared/stage'
import { settingsFromRow } from '../../shared/settings'
import { recordActivity } from './activity'
import { apiError } from './errors'
import type { ChangeCore } from './event-access'
import { readRounds, type RoundRow } from './rounds'

// The Host enters a Result on an open Round (#273, spec #272, GLOSSARY: Result): the Round gets the next number and its Result's time,
// its Places and Scores are stored once, and the feed says who won. A Round that has a Result is corrected instead (#275): its Places
// and Scores are replaced, its number and Result time stay, `correctedAt` is set, and the feed says so; a save equal to the stored
// Result writes nothing. The rules are `shared/results.ts`; the instants come from the request's clock (ADR 0013), never from the
// database's `now()`.

/** Enters the Result of a Round of the Event, or corrects it (`places` as parseResultBody read them); refused with the reason of resultRejection. */
export async function enterResult({ tx, eventRow, user, publish, now }: ChangeCore, roundId: string | undefined, places: ResultPlace[] | null): Promise<ResultEntered> {
  const rows = await readRounds(tx, eventRow.id)
  const round = rows.find(row => row.id === roundId) ?? null
  const rejection = resultRejection({ isHost: eventRow.hostId === user.id, settings: settingsFromRow(eventRow), phase: eventRow.phase, round, places })
  if (rejection) throw apiError(rejection)
  // The rules above refused an Event without settings, a Round that is not open or correctable (so it has its game) and a body without Places.
  if (round!.resultAt !== null) return correctResult({ tx, eventRow, user, publish, now }, round!, places!)
  const number = nextRoundNumber(rows.map(row => row.number))
  await tx.insert(roundPlaces).values(places!.map(entry => ({ roundId: round!.id, team: entry.team, place: entry.place, score: entry.score })))
  await tx.update(rounds).set({ number, resultAt: now }).where(eq(rounds.id, round!.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'result_entered', actorId: user.id, params: { roundId: round!.id, number, gameId: round!.gameId!, first: winnersOf(places!) }, now })
  return { roundId: round!.id, number }
}

/**
 * Replaces the Places of a Round that has a Result (#275). The Round keeps its number and `resultAt`; `correctedAt` is the request's
 * instant, and stays set after later Corrections. A save equal to the stored Result changes nothing and writes no entry.
 */
async function correctResult({ tx, eventRow, user, publish, now }: ChangeCore, round: RoundRow, places: ResultPlace[]): Promise<ResultEntered> {
  const stored = await tx.select({ team: roundPlaces.team, place: roundPlaces.place, score: roundPlaces.score }).from(roundPlaces).where(eq(roundPlaces.roundId, round.id))
  const answer = { roundId: round.id, number: round.number! }
  if (sameResult(stored, places)) return answer
  // The primary key is (round, team): the old rows go first, in the same transaction as the new ones.
  await tx.delete(roundPlaces).where(eq(roundPlaces.roundId, round.id))
  await tx.insert(roundPlaces).values(places.map(entry => ({ roundId: round.id, team: entry.team, place: entry.place, score: entry.score })))
  await tx.update(rounds).set({ correctedAt: now }).where(eq(rounds.id, round.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'result_corrected', actorId: user.id, params: { roundId: round.id, number: round.number!, gameId: round.gameId! }, now })
  return answer
}
