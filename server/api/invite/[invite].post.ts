import { defineEventHandler, getRouterParam } from 'h3'
import { eventMembers } from '../../db/schema'
import { useDb } from '../../utils/db'
import { eventDeleted, eventNotFound } from '../../utils/errors'
import { isMember, eventForInvite } from '../../utils/invite'
import { requireUser } from '../../utils/user'

// Join an Event through its Invite link (#10, ADR 0006): the signed-in User becomes a Member on
// the Bench. Joining again changes nothing and keeps the zone. The answer names the Event link
// the page moves on to, and whether this call added the Member.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await eventForInvite(db, getRouterParam(event, 'invite') ?? '')
  if (!eventRow) throw eventNotFound()

  if (eventRow.deletedAt) {
    // Only a former Member learns that the Event was deleted; everyone else gets the generic answer.
    if (await isMember(db, eventRow.id, user.id)) throw eventDeleted()
    throw eventNotFound()
  }

  const added = await db
    .insert(eventMembers)
    .values({ eventId: eventRow.id, userId: user.id })
    .onConflictDoNothing({ target: [eventMembers.eventId, eventMembers.userId] })
    .returning({ userId: eventMembers.userId })

  return { slug: eventRow.slug, joined: added.length > 0 }
})
