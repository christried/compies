import type { EventSettings } from '../../shared/settings'

/** A valid settings payload for POST /api/e (#144): 2 teams of 3, linear points, Host pick, 10 Games. */
export const TEST_SETTINGS: EventSettings = {
  format: 'teams',
  teamCount: 2,
  teamSize: 3,
  gameCount: 10,
  pointsTable: { preset: 'linear', values: [1, 0] },
  selectionMode: 'admin_pick',
  hiddenWheel: false,
  vetoAllowance: null,
}
