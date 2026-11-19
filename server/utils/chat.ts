import { eq } from 'drizzle-orm'
import { messages } from '../db/schema'
import { isUuid } from '../domain/uuid'
import type { LiveMessage, Message } from '../../shared/chat'
import { parseMessageText } from '../../shared/message-text'
import { asRecord } from '../../shared/record'
import type { EventChange } from './event-access'
import { apiError } from './errors'

// The Chat (#758, spec #719 § A, GLOSSARY: Chat). A Message is not an Activity entry (ADR 0016): a write records none, and the room hears `chat.added`
// only. The page makes the Message's id, so a retry after a lost answer is told from a new Message.

/** A stored row as the wire has it: live while it holds text, else the deleted line that says who deleted it. */
export function messageOfRow(row: typeof messages.$inferSelect): Message {
  const base = { id: row.id, writerId: row.writerId, at: row.writtenAt.toISOString() }
  return row.text !== null ? { ...base, text: row.text } : { ...base, text: null, deletedBy: row.deletedBy! }
}

/**
 * Writes the body's `{ id, text }` as the User's Message in the Event and queues one `chat.added` to the whole room. An id that is stored already
 * stores and queues nothing and answers the stored Message (a deleted one in its deleted variant), whatever text the retry carries, when it is this
 * User's Message in this Event; any other row answers `invalid_value`, as an id that is no uuid does, so an id probe learns nothing about another Event or Member.
 */
export async function writeMessage({ tx, eventRow, user, now, body, publish }: Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'now' | 'body' | 'publish'>): Promise<Message> {
  const fields = asRecord(body)
  if (!isUuid(fields.id)) throw apiError('invalid_value')
  const id = fields.id.toLowerCase()
  const parsed = parseMessageText(fields.text)
  if (!parsed.ok) throw apiError(parsed.error)

  const [stored] = await tx
    .insert(messages)
    .values({ id, eventId: eventRow.id, writerId: user.id, text: parsed.text, writtenAt: now })
    .onConflictDoNothing({ target: messages.id })
    .returning()
  if (stored) {
    const message: LiveMessage = { id, writerId: user.id, text: parsed.text, at: stored.writtenAt.toISOString() }
    // To the whole room, the writer's socket included, and no named send (spec § A, Secrecy).
    publish({ type: 'chat.added', message })
    return message
  }

  // The id exists: a separate statement, which under READ COMMITTED sees a racing twin's committed row.
  const [existing] = await tx.select().from(messages).where(eq(messages.id, id))
  if (!existing || existing.eventId !== eventRow.id || existing.writerId !== user.id) throw apiError('invalid_value')
  return messageOfRow(existing)
}
