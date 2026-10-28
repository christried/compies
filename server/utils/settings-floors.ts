import type { SettingsFloors } from '../../shared/settings'

/**
 * The lowest Team size and Veto allowance an Event allows now (#147). No Player is in a team before 1.4 and no Veto is
 * spent before 1.5; those releases pass the real numbers.
 */
export const SETTINGS_FLOORS: SettingsFloors = { teamSize: 1, vetoAllowance: 0 }
