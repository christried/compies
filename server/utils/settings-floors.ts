import { countSeats } from '../../shared/board'
import { teamSizeFloor, type SettingsFloors } from '../../shared/settings'
import { readSeats } from './board'
import type { Db } from './db'

/**
 * The lowest Team size and Veto allowance an Event allows now (#147, #183, #163, #197). The Team size floor is the
 * fullest team of the teams that remain: no Team size may push a Player out of their team (#163), and a lowered team
 * count sends the Players of the teams it removes to the Bench, so those teams don't count (teamSizeFloor). The floors
 * come per team count: the caller passes the count it has parsed. The Veto allowance floor stays 0 until Glücksrad (0.7), which
 * plugs the most Vetoes a Party has spent in here. Callers read it inside the transaction that writes the change, since
 * a move can race it.
 */
export async function settingsFloors(db: Db, eventId: string): Promise<(teamCount: number) => SettingsFloors> {
  const seats = countSeats((await readSeats(db, eventId)).map(seat => seat.place))
  const highest = Math.max(0, ...Object.keys(seats).map(Number))
  const playersPerTeam = Array.from({ length: highest }, (_, index) => seats[index + 1] ?? 0)
  return teamCount => ({ teamSize: teamSizeFloor(playersPerTeam, teamCount), vetoAllowance: 0 })
}
