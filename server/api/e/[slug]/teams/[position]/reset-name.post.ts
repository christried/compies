import { and, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { eventMembers } from '../../../../../db/schema'
import { recordActivity } from '../../../../../utils/activity'
import { apiError } from '../../../../../utils/errors'
import { changeEvent } from '../../../../../utils/event-access'
import type { TeamNameReset } from '../../../../../../shared/event'
import { parseTeamPosition } from '../../../../../../shared/board'
import { settingsFromRow } from '../../../../../../shared/settings'

// The Host resets a team's name to its colour name (#161, spec #153 § API contracts): at any time before the Finish it
// clears every Team word of the team (#438; the name is composed from the words). The entry says who did it. A team without words is reset all the same: the
// Host sees the same answer, and the feed shows what they did.
export default defineEventHandler((event): Promise<TeamNameReset> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow, user, publish, now }) => {
  const settings = settingsFromRow(eventRow)
  const position = parseTeamPosition(getRouterParam(event, 'position') ?? '')
  if (settings === null || position === null || position > settings.teamCount) throw apiError('no_such_team')

  await tx
    .update(eventMembers)
    .set({ teamWord: null })
    .where(and(eq(eventMembers.eventId, eventRow.id), eq(eventMembers.team, position)))
  await recordActivity(tx, publish, eventRow.id, { type: 'team_name_reset', actorId: user.id, params: { team: position }, now })
  return { team: position }
}))
