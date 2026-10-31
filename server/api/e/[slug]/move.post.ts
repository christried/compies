import { defineEventHandler } from 'h3'
import { isUuid } from '../../../domain/uuid'
import { lastToJoin, moveMember, readSeats, teamChoiceOf } from '../../../utils/board'
import { apiError, memberNotFound } from '../../../utils/errors'
import { changeEvent } from '../../../utils/event-access'
import { eventSessions } from '../../../utils/sessions'
import { countSeats, moveRejection, parsePlace } from '../../../../shared/board'
import type { MovedMember } from '../../../../shared/event'
import { asRecord } from '../../../../shared/record'

// Move a Member to a place on the Game board (#160, spec #153 § Game board): `{ userId, to: { zone, team? } }`. A Player
// moves themselves, the Host anyone. The Event row is locked for update, so all moves of one Event queue up and each
// counts the seats after the one before it has committed: of two Players racing for the last place the second
// one finds the team full and is told who was faster.
export default defineEventHandler((event): Promise<MovedMember> => changeEvent(event, { lock: 'update' }, async ({ tx, eventRow, user, body, publish }) => {
  const { userId, to: rawTo } = asRecord(body)
  const to = parsePlace(rawTo)
  if (!isUuid(userId) || !to) throw apiError('invalid_value')

  const seats = await readSeats(tx, eventRow.id)
  const from = seats.find(seat => seat.userId === userId)?.place
  if (!from) throw memberNotFound()

  const { settings, started, open } = teamChoiceOf(eventRow, await eventSessions(tx, eventRow.id))
  const rejection = moveRejection({
    actorId: user.id,
    actorIsHost: eventRow.hostId === user.id,
    userId,
    from,
    to,
    settings,
    teamChoiceOpen: open,
    started,
    seats: countSeats(seats.map(seat => seat.place)),
  })
  if (rejection === 'team_full' && to.zone === 'team') {
    const winnerId = await lastToJoin(tx, eventRow.id, to.team)
    throw apiError(rejection, winnerId === null ? undefined : { winnerId })
  }
  if (rejection) throw apiError(rejection)

  await moveMember(tx, publish, eventRow.id, user.id, userId, from, to)
  return { userId, to }
}))
