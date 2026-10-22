// Who may open a Session (ADR 0006, #1 § Auth and permissions). Pure: the loader in
// server/utils/session-access.ts reads the rows and asks this rule.

export type SessionAccessRejection = 'not_found' | 'deleted' | 'not_host'

export interface SessionAccessInput {
  /** The Session the slug names, deleted ones included; null when there is none. */
  session: { hostId: string, deletedAt: Date | null } | null
  isMember: boolean
  userId: string
  /** The request is one only the Host of this Session may make. */
  hostOnly: boolean
}

/**
 * Why the User may not go on, or null. A non-Member and an unknown slug get the same answer, so
 * nobody can probe which Sessions exist; only a former Member learns that a Session was deleted.
 * Host-only requests need the Host of this Session, whatever the User's Host permission (ADR 0002).
 */
export function sessionAccessRejection(input: SessionAccessInput): SessionAccessRejection | null {
  if (!input.session || !input.isMember) return 'not_found'
  if (input.session.deletedAt) return 'deleted'
  if (input.hostOnly && input.session.hostId !== input.userId) return 'not_host'
  return null
}
