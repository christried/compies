import { defineEventHandler } from 'h3'
import { inviteUrl } from '../../../utils/links'
import { changeEvent } from '../../../utils/event-access'
import { rotateInviteToken } from '../../../utils/invite'
import type { RotatedInvite } from '../../../../shared/event'

// Rotate the Invite link (#16, ADR 0006): a new token and the same slug. The old Invite link answers
// the generic 404 from now on. Members keep their Event link, because they are in event_members,
// which rotation does not touch. Only the Host may rotate (ADR 0002: losing canHost keeps the Event).
// Non-Members get the same 404 as an unknown slug, so Events cannot be probed. A finished Event is read-only (#277), except that the
// Host may still rotate its Invite link: the link is how a new Member joins it. The rotation itself is `rotateInviteToken` (#697: the removal of a Member shares it).
export default defineEventHandler((event): Promise<RotatedInvite> => changeEvent(event, { hostOnly: true, lock: 'update', allowFinished: true }, async ({ tx, eventRow }) => {
  const inviteToken = await rotateInviteToken(tx, eventRow.id)

  return { inviteUrl: inviteUrl(event, eventRow.slug, inviteToken) }
}))
