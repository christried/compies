import { defineEventHandler } from 'h3'
import { isUuid } from '../../../domain/uuid'
import { lastToJoin, moveMember } from '../../../utils/board'
import { apiError } from '../../../utils/errors'
import { changeEvent } from '../../../utils/event-access'
import { moveReason, readEventState, seatOf } from '../../../utils/event-state'
import { parsePlace } from '../../../../shared/board'
import type { MovedMember } from '../../../../shared/event'
import { asRecord } from '../../../../shared/record'

// Move a Member to a place on the Game board (#160, spec #153 § Game board): `{ userId, to: { zone, team? } }`. A Player
// moves themselves, the Host anyone. The Event row is locked for update, so all moves of one Event queue up and each
// counts the seats after the one before it has committed: of two Players racing for the last place the second
// one finds the team full and is told who was faster. The rule is moveReason of the Event state (#416).
export default defineEventHandler((event): Promise<MovedMember> => changeEvent(event, { lock: 'update' }, async ({ tx, now, eventRow, user, body, publish }) => {
  const { userId, to: rawTo } = asRecord(body)
  const to = parsePlace(rawTo)
  if (!isUuid(userId) || !to) throw apiError('invalid_value')

  const state = await readEventState(tx, eventRow, now, ['members', 'sessions'])
  const rejection = moveReason(state, { actorId: user.id, userId, to })
  if (rejection === 'team_full' && to.zone === 'team') {
    const winnerId = await lastToJoin(tx, eventRow.id, to.team)
    throw apiError(rejection, winnerId === null ? undefined : { winnerId })
  }
  if (rejection) throw apiError(rejection)

  await moveMember(tx, publish, now, eventRow.id, user.id, userId, seatOf(state, userId)!, to)
  return { userId, to }
}))
