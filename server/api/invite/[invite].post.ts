import { defineEventHandler, getRouterParam } from 'h3'
import { recordActivity } from '../../utils/activity'
import { useDb } from '../../utils/db'
import { eventDeleted, eventNotFound } from '../../utils/errors'
import { afterCommit } from '../../utils/event-access'
import { addMember, isMember, eventForInvite } from '../../utils/invite'
import { requireUser } from '../../utils/user'
import type { JoinedEvent } from '../../../shared/event'
import type { RoomMessage } from '../../../shared/realtime'

// Join an Event through its Invite link (#10, ADR 0006): the signed-in User becomes a Member on
// the Bench. Joining again changes nothing and keeps the zone. The answer names the Event link
// the page moves on to, and whether this call added the Member.
export default defineEventHandler(async (event): Promise<JoinedEvent> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await eventForInvite(db, getRouterParam(event, 'invite') ?? '')
  if (!eventRow) throw eventNotFound()

  if (eventRow.deletedAt) {
    // Only a former Member learns that the Event was deleted; everyone else gets the generic answer.
    if (await isMember(db, eventRow.id, user.id)) throw eventDeleted()
    throw eventNotFound()
  }

  // The Member and the entry that says so are written together; only a join that added the Member writes one (#159).
  const messages: RoomMessage[] = []
  const joined = await db.transaction(async (tx) => {
    const added = await addMember(tx, eventRow.id, user.id)
    if (added) {
      await recordActivity(tx, (...queued) => void messages.push(...queued), eventRow.id, { type: 'member_joined', actorId: user.id, params: {} })
      messages.push({ type: 'member.joined', userId: user.id })
    }
    return added
  })
  // The join loads the Event by its Invite link, not by slug, so it cannot go through changeEvent; it reaches the
  // same step after its write (#183). A repeated join changed nothing, so nothing is announced.
  if (joined) afterCommit(event, eventRow, messages)
  return { slug: eventRow.slug, joined }
})
