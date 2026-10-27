import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { eventNotFound } from '../../utils/errors'
import { eventForInvite } from '../../utils/invite'
import type { InvitePreview } from '../../../shared/event'

// Signed-out preview of an Invite link (screen 07, ADR 0006): the Event name and the Host's
// Display name and avatar. Nothing else, so no Slots, Votes or Members leak to a visitor.
export default defineEventHandler(async (event): Promise<InvitePreview> => {
  const db = useDb(event)
  const eventRow = await eventForInvite(db, getRouterParam(event, 'invite') ?? '')
  if (!eventRow || eventRow.deletedAt) throw eventNotFound()

  const [host] = await db
    .select({ name: users.name, displayName: users.displayName, image: users.image })
    .from(users)
    .where(eq(users.id, eventRow.hostId))

  return {
    eventName: eventRow.name,
    host: { name: host!.displayName ?? host!.name, image: host!.image },
  }
})
