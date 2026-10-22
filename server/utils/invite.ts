import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { sessionMembers, sessions } from '../db/schema'
import { parseSessionPath } from '../domain/slug'
import type { Db } from './db'

// Invite link lookups (ADR 0006). The Invite link is `<slug>-<token>`; it only matches while the
// token is the Session's current one, so a rotated link stops working at once.

/** The Session an Invite link addresses, deleted Sessions included; null for anything else. */
export async function sessionForInvite(db: Db, invite: string) {
  const link = parseSessionPath(invite)
  if (link?.kind !== 'invite') return null
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.slug, link.slug), eq(sessions.inviteToken, link.token)))
  return session ?? null
}

/** Whether the User is a Member of the Session, with or without a zone. */
export async function isMember(db: Db, sessionId: string, userId: string) {
  const [member] = await db
    .select({ userId: sessionMembers.userId })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
  return member !== undefined
}

/** The generic answer for every link that does not lead to a live Session (ADR 0006). */
export function sessionNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Session not found' })
}
