import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { pollSlots, eventMembers, events } from '../../db/schema'
import { parseNewEvent } from '../../domain/event'
import { createInviteToken, createSlug } from '../../domain/slug'
import { useDb, type Db } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { inviteUrl } from '../../utils/links'
import { requireUser } from '../../utils/user'

const SLUG_ATTEMPTS = 5

// Create an Event (screen M2). Only Users with the Host permission may create one (ADR 0002).
// The Event, its Slots and the Host's Bench membership are written in one transaction.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!user.canHost) throw apiError('no_host_permission')

  const parsed = parseNewEvent(await readBody(event), new Date())
  if (!parsed.ok) throw apiError(parsed.error)
  const input = parsed.event

  const db = useDb(event)
  const slug = await freeSlug(db, input.name)
  const inviteToken = createInviteToken()
  const initial = input.dateMode === 'poll'
    ? { phase: 'poll' as const, dateMode: 'poll' as const, startsAt: null }
    : { phase: 'date_set' as const, dateMode: 'direct' as const, startsAt: input.startsAt }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(events)
      .values({ slug, inviteToken, hostId: user.id, name: input.name, ...initial })
      .returning({ id: events.id })
    await tx.insert(eventMembers).values({ eventId: row!.id, userId: user.id })
    if (input.dateMode === 'poll') {
      await tx.insert(pollSlots).values(input.slots.map(startsAt => ({ eventId: row!.id, startsAt })))
    }
  })

  return { slug, inviteUrl: inviteUrl(event, slug, inviteToken) }
})

/** A slug that no Event uses yet. The random suffix makes a clash rare; the unique column is the last guard. */
async function freeSlug(db: Db, name: string): Promise<string> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = createSlug(name)
    const [taken] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug))
    if (!taken) return slug
  }
  throw createError({ statusCode: 500, statusMessage: 'Could not reserve an Event link' })
}
