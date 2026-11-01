import { countSeats } from '../../shared/board'
import { roundsStarted } from '../../shared/rounds'
import { playersPerTeam, type FloorFacts } from '../../shared/settings'
import { readSeats } from './board'
import type { Db } from './db'
import { readRounds } from './rounds'
import { readVetoes } from './vetoes'

/**
 * What the floors of an Event's settings are read from (#147, #163, #197, #228, #231): the Players seated in each team, the
 * Rounds started and the most Vetoes any Party has cast. The floors themselves are `floorsAt` (shared/settings.ts), measured at
 * the team count the caller has parsed. The Team size floor is the fullest team that remains (no Team size may push a Player out
 * of their team), the Game count floor is the Rounds started, the Veto allowance floor is the most Vetoes one Party has cast,
 * counted from every cast, settled or not (spent stays spent). Callers read the facts inside the transaction that writes the
 * change, since a move or a Round can race it.
 */
export async function floorFacts(db: Db, eventId: string): Promise<FloorFacts> {
  const seats = countSeats((await readSeats(db, eventId)).map(seat => seat.place))
  const highest = Math.max(0, ...Object.keys(seats).map(Number))
  const castPerTeam = new Map<number, number>()
  for (const { team } of await readVetoes(db, eventId)) castPerTeam.set(team, (castPerTeam.get(team) ?? 0) + 1)
  return {
    playersPerTeam: playersPerTeam(seats, highest),
    roundsStarted: roundsStarted(await readRounds(db, eventId)),
    vetoesSpent: Math.max(0, ...castPerTeam.values()),
  }
}
