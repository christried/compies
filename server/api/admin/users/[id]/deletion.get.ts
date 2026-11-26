import { defineEventHandler } from 'h3'
import { deleteAccount, Stopped } from '../../../../../scripts/prod/delete-account-core.mjs'
import * as schema from '../../../../db/schema'
import { requireDeletableUserId, requirePlatformAdmin } from '../../../../utils/admin'
import { useClock } from '../../../../utils/clock'
import { useDb } from '../../../../utils/db'
import { deleteUser, removeImages, UserNotDeletable } from '../../../../utils/delete-user'
import { apiError, apiNotFound } from '../../../../utils/errors'
import type { AdminUserDeletion } from '../../../../../shared/admin'

// What the deletion of one User's account would remove (#941, spec #938): the counts the operator's script prints in its dry run, from the same function
// (`deleteAccount` of scripts/prod/delete-account-core.mjs, #919). It runs the whole deletion inside a transaction that is rolled back, so it meets the module's
// refusal too: `games_held` answers `account_games_held` and the sheet shows its notice. Nothing is changed or published; only counts leave, never an id or a name.
// Everyone but a Platform admin gets the answer of a missing route, a Platform admin's id `platform_admin_not_deletable`.
export default defineEventHandler(async (event): Promise<AdminUserDeletion> => {
  await requirePlatformAdmin(event)
  const userId = await requireDeletableUserId(event)
  try {
    const report = await deleteAccount({ db: useDb(event), schema, userId, apply: false, now: useClock(event).now(), deletion: { deleteUser, removeImages, UserNotDeletable } })
    return { hostedEvents: report.hostedEvents.length, games: report.games, membershipsEnding: report.membershipsEnding, membershipsStaying: report.membershipsStaying, imageObjects: report.imageObjects }
  }
  catch (error) {
    if (error instanceof Stopped && error.reason === 'games_held') throw apiError('account_games_held')
    // Unknown or Deleted since the check above: a race, answered like a missing route.
    if (error instanceof Stopped) throw apiNotFound()
    throw error
  }
})
