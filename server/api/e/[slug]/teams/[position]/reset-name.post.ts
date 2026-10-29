import { and, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { eventMembers } from '../../../../../db/schema'
import { recordActivity } from '../../../../../utils/activity'
import { teamChoiceOf } from '../../../../../utils/board'
import { apiError } from '../../../../../utils/errors'
import { changeEvent } from '../../../../../utils/event-access'
import { eventSessions } from '../../../../../utils/sessions'
import type { TeamNameReset } from '../../../../../../shared/event'

// The Host resets a team's name to its colour name (#161, spec #153 § API contracts). Before the first start that
// clears every Team word of the team; the entry says who did it. A team without words is reset all the same: the
// Host sees the same answer, and the feed shows what they did.
export default defineEventHandler((event): Promise<TeamNameReset> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow, user, publish }) => {
  const { settings, started } = teamChoiceOf(eventRow, await eventSessions(tx, eventRow.id))
  const raw = getRouterParam(event, 'position') ?? ''
  const position = /^\d+$/.test(raw) ? Number(raw) : 0
  if (settings === null || position < 1 || position > settings.teamCount) throw apiError('no_such_team')

  // #164 (Session start): after the first start the name is frozen, so `started` sets the frozen name to null here
  // instead of clearing words.
  if (!started) {
    await tx
      .update(eventMembers)
      .set({ teamWord: null })
      .where(and(eq(eventMembers.eventId, eventRow.id), eq(eventMembers.team, position)))
  }
  await recordActivity(tx, publish, eventRow.id, { type: 'team_name_reset', actorId: user.id, params: { team: position } })
  publish({ type: 'team.nameReset', team: position })
  return { team: position }
}))
