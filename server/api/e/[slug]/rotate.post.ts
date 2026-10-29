import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { events } from '../../../db/schema'
import { createInviteToken } from '../../../domain/slug'
import { inviteUrl } from '../../../utils/links'
import { changeEvent } from '../../../utils/event-access'
import type { RotatedInvite } from '../../../../shared/event'

// Rotate the Invite link (#16, ADR 0006): a new token and the same slug. The old Invite link answers
// the generic 404 from now on. Members keep their Event link, because they are in event_members,
// which rotation does not touch. Only the Host may rotate (ADR 0002: losing canHost keeps the Event).
// Non-Members get the same 404 as an unknown slug, so Events cannot be probed.
export default defineEventHandler((event): Promise<RotatedInvite> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow }) => {
  const inviteToken = createInviteToken()
  await tx.update(events).set({ inviteToken }).where(eq(events.id, eventRow.id))

  return { inviteUrl: inviteUrl(event, eventRow.slug, inviteToken) }
}))
