import type { SettingsFloors } from '../../shared/settings'
import type { Db } from './db'

/**
 * The lowest Team size and Veto allowance an Event allows now (#147, #183). No Player is in a team before 1.4 and no
 * Veto is spent before 1.5, so these are constants for now. 1.4 plugs the fullest team in here (#163), 1.5 the most
 * Vetoes a Party has spent. Callers read it inside the transaction that writes the change, since a move can race it.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the seam: db and eventId are what 1.4 and 1.5 read the numbers from
export async function settingsFloors(db: Db, eventId: string): Promise<SettingsFloors> {
  return { teamSize: 1, vetoAllowance: 0 }
}
