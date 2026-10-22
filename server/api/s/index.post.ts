import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { pollSlots, sessionMembers, sessions } from '../../db/schema'
import { parseNewSession } from '../../domain/session'
import { createInviteToken, createSlug } from '../../domain/slug'
import { useDb, type Db } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { inviteUrl } from '../../utils/links'
import { requireUser } from '../../utils/user'

const SLUG_ATTEMPTS = 5

// Create a Session (screen M2). Only Users with the Host permission may create one (ADR 0002).
// The Session, its Slots and the Host's Bench membership are written in one transaction.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!user.canHost) throw apiError('no_host_permission')

  const parsed = parseNewSession(await readBody(event), new Date())
  if (!parsed.ok) throw apiError(parsed.error)
  const input = parsed.session

  const db = useDb(event)
  const slug = await freeSlug(db, input.name)
  const inviteToken = createInviteToken()
  const session = input.dateMode === 'poll'
    ? { phase: 'poll' as const, dateMode: 'poll' as const, startsAt: null }
    : { phase: 'date_set' as const, dateMode: 'direct' as const, startsAt: input.startsAt }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sessions)
      .values({ slug, inviteToken, hostId: user.id, name: input.name, ...session })
      .returning({ id: sessions.id })
    await tx.insert(sessionMembers).values({ sessionId: row!.id, userId: user.id })
    if (input.dateMode === 'poll') {
      await tx.insert(pollSlots).values(input.slots.map(startsAt => ({ sessionId: row!.id, startsAt })))
    }
  })

  return { slug, inviteUrl: inviteUrl(event, slug, inviteToken) }
})

/** A slug that no Session uses yet. The random suffix makes a clash rare; the unique column is the last guard. */
async function freeSlug(db: Db, name: string): Promise<string> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = createSlug(name)
    const [taken] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.slug, slug))
    if (!taken) return slug
  }
  throw createError({ statusCode: 500, statusMessage: 'Could not reserve a Session link' })
}
