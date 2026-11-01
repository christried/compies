import { countSeats } from '../../shared/board'
import { roundsStarted } from '../../shared/rounds'
import { playersPerTeam, type FloorFacts } from '../../shared/settings'
import { readSeats } from './board'
import type { Db } from './db'
import { readRounds } from './rounds'

/**
 * What the lowest Team size, Veto allowance and Game count of an Event are read from (#147, #163, #197, #228): the Players
 * seated in each team and the Rounds started. The floors themselves are `floorsAt` (shared/settings.ts), measured at the
 * team count the caller has parsed. The Team size floor is the fullest team that remains (no Team size may push a Player
 * out of their team), the Game count floor is the Rounds started. Callers read the facts inside the transaction that writes
 * the change, since a move or a Round can race it.
 */
export async function floorFacts(db: Db, eventId: string): Promise<FloorFacts> {
  const seats = countSeats((await readSeats(db, eventId)).map(seat => seat.place))
  const highest = Math.max(0, ...Object.keys(seats).map(Number))
  return { playersPerTeam: playersPerTeam(seats, highest), roundsStarted: roundsStarted(await readRounds(db, eventId)) }
}
