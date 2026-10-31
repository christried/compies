import { countSeats, fullestTeam } from '../../shared/board'
import { TEAM_SIZE_MIN, type SettingsFloors } from '../../shared/settings'
import { readSeats } from './board'
import type { Db } from './db'

/**
 * The lowest Team size and Veto allowance an Event allows now (#147, #183, #163). The Team size floor is the fullest
 * team: no Team size may push a Player out of their team (#163). With `teamCount`, only the teams up to it count: the
 * Players of the teams a lowering removes go to the Bench, so a request that lowers both may lower the Team size too. The Veto allowance floor stays 0 until 1.5, which
 * plugs the most Vetoes a Party has spent in here. Callers read it inside the transaction that writes the change, since
 * a move can race it.
 */
export async function settingsFloors(db: Db, eventId: string, teamCount?: number): Promise<SettingsFloors> {
  const places = (await readSeats(db, eventId)).map(seat => seat.place)
  const remaining = places.filter(place => place.zone !== 'team' || teamCount === undefined || place.team <= teamCount)
  return { teamSize: Math.max(TEAM_SIZE_MIN, fullestTeam(countSeats(remaining))), vetoAllowance: 0 }
}
