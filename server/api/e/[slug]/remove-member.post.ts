import { defineEventHandler } from 'h3'
import { isUuid } from '../../../domain/uuid'
import { recordActivity } from '../../../utils/activity'
import { apiError } from '../../../utils/errors'
import { changeEvent } from '../../../utils/event-access'
import { endMembership, rotateInviteToken } from '../../../utils/invite'
import { inviteUrl } from '../../../utils/links'
import type { RemovedMember } from '../../../../shared/event'
import { asRecord } from '../../../../shared/record'

// The Host removes a Member from the Event (#697, spec #894): `{ userId, rotateInvite }`. The membership ends through the rule the Deleted User shares (`endMembership`, ADR 0020):
// the Seat, the Team word and the Votes with their Notes go; Messages, Activity entries and Vetoes stay. The feed gets a `member_removed` entry (the actor is the Host), and with
// `rotateInvite` the Invite link is rotated in the same transaction, so a failure leaves the Member in. The removed User gets one last message and their sockets are closed
// (`publishLast`, #913); everybody else hears the usual `event.changed` and `activity.added`. A removed User is no Member: their next read answers 404, never 410 (ADR 0006).
// The Host cannot remove themselves. A finished Event is read-only, so `changeEvent` answers wrong_phase (after not_host).
export default defineEventHandler((event): Promise<RemovedMember> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, now, eventRow, user, body, publish, publishLast }) => {
  const { userId, rotateInvite } = asRecord(body)
  if (!isUuid(userId) || typeof rotateInvite !== 'boolean' || userId === user.id) throw apiError('invalid_value')

  if (!(await endMembership(tx, eventRow.id, userId))) throw apiError('member_not_found')
  await recordActivity(tx, publish, eventRow.id, { type: 'member_removed', actorId: user.id, params: { userId }, now })
  const inviteToken = rotateInvite ? await rotateInviteToken(tx, eventRow.id) : null
  publishLast([userId], { type: 'member.removed' })

  return { userId, inviteUrl: inviteToken === null ? null : inviteUrl(event, eventRow.slug, inviteToken) }
}))
