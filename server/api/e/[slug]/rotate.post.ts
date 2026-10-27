import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { events } from '../../../db/schema'
import { createInviteToken } from '../../../domain/slug'
import { useDb } from '../../../utils/db'
import { inviteUrl } from '../../../utils/links'
import { loadEvent } from '../../../utils/event-access'
import { requireUser } from '../../../utils/user'
import type { RotatedInvite } from '../../../../shared/event'

// Rotate the Invite link (#16, ADR 0006): a new token and the same slug. The old Invite link answers
// the generic 404 from now on. Members keep their Event link, because they are in event_members,
// which rotation does not touch. Only the Host may rotate (ADR 0002: losing canHost keeps the Event).
// Non-Members get the same 404 as an unknown slug, so Events cannot be probed.
export default defineEventHandler(async (event): Promise<RotatedInvite> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true })

  const inviteToken = createInviteToken()
  await db.update(events).set({ inviteToken }).where(eq(events.id, eventRow.id))

  return { inviteUrl: inviteUrl(event, eventRow.slug, inviteToken) }
})
