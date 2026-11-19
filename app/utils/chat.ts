import type { Message } from '~~/shared/chat'

// The Chat's pure rules (#761, spec #719 § A), kept out of `ChatPanel` so they are tested without a page.

/** How long after the previous Message of the same writer a Message still joins its group; not exported, only the tests would use it. */
const GROUP_WINDOW_MS = 120_000

/** The Messages of one writer that sit under one name line. */
export interface MessageGroup {
  writerId: string
  messages: Message[]
}

/**
 * The Messages, oldest first, in groups: a Message joins the group above it when the same writer wrote it at most two minutes after the previous Message
 * (measured from that one, not from the group's first, so a talk that goes on stays one group). Another writer's Message between starts a new group.
 * A deleted Message groups like any other: it keeps its writer and its time.
 */
export function groupMessages(messages: readonly Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let previous: Message | undefined
  for (const message of messages) {
    const last = groups[groups.length - 1]
    if (last && previous && previous.writerId === message.writerId && Date.parse(message.at) - Date.parse(previous.at) <= GROUP_WINDOW_MS) {
      last.messages.push(message)
    }
    else {
      groups.push({ writerId: message.writerId, messages: [message] })
    }
    previous = message
  }
  return groups
}

/** The order of the read, reversed: by time, and by id where two Messages share a millisecond (`readMessagePage` orders `written_at`, then `id`). */
function byTimeThenId(a: Message, b: Message): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * What the Chat holds after Messages arrive, by id, oldest first. A Message the Chat does not know is added. A live Message that arrives deleted is replaced (a read after a missed
 * `chat.deleted`); a deleted Message stays deleted when a stale page brings its text again. Any other known id keeps what is held.
 */
export function mergeMessages(held: readonly Message[], incoming: readonly Message[]): Message[] {
  const byId = new Map(held.map(message => [message.id, message]))
  for (const message of incoming) {
    const known = byId.get(message.id)
    if (!known || (known.text !== null && message.text === null)) byId.set(message.id, message)
  }
  return [...byId.values()].sort(byTimeThenId)
}
