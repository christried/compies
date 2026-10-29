import { countSeats, fullestTeam } from '../../shared/board'
import { TEAM_SIZE_MIN, type SettingsFloors } from '../../shared/settings'
import { readSeats } from './board'
import type { Db } from './db'

/**
 * The lowest Team size and Veto allowance an Event allows now (#147, #183, #163). The Team size floor is the fullest
 * team: no Team size may push a Player out of their team (#163). The Veto allowance floor stays 0 until 1.5, which
 * plugs the most Vetoes a Party has spent in here. Callers read it inside the transaction that writes the change, since
 * a move can race it.
 */
export async function settingsFloors(db: Db, eventId: string): Promise<SettingsFloors> {
  const seats = await readSeats(db, eventId)
  return { teamSize: Math.max(TEAM_SIZE_MIN, fullestTeam(countSeats(seats.map(seat => seat.place)))), vetoAllowance: 0 }
}
