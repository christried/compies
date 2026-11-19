import type { Message } from '~~/shared/chat'
import { notesLinkHref } from '~~/shared/notes-doc'

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

/** A piece of a Message's text: plain, or a link (#762) whose `href` is the parsed address. */
interface MessagePiece { text: string, href?: string }

/** An address candidate: `http` or `https`, up to a space, `<`, `>` or a quote. One linear pattern, no nested quantifiers. */
const ADDRESS_CANDIDATE = /https?:\/\/[^\s<>"]+/gi
/** Punctuation a sentence puts after an address, not part of it. */
const TRAILING_PUNCTUATION = '.,;:!?\''
/** A closing bracket ends an address only when the address holds no opening one of its kind, so `Foo_(Bar)` keeps its `)`. */
const CLOSING_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

/** The address without the punctuation and the unmatched closing brackets at its end; what is cut off is text after it. */
function trimAddress(candidate: string): string {
  let address = candidate
  while (address !== '') {
    const last = address.slice(-1)
    const opener = CLOSING_BRACKETS[last]
    const cut = TRAILING_PUNCTUATION.includes(last) || (opener !== undefined && count(address, last) > count(address, opener))
    if (!cut) break
    address = address.slice(0, -1)
  }
  return address
}

/**
 * A Message's text in pieces: each `http` or `https` address that `notesLinkHref` accepts is a link piece, the rest is plain text, and the pieces joined give
 * the text back. The text is never markup, so it shows as typed; nothing is fetched (#762). The link's address is the one the notes use (shared/notes-doc).
 */
export function splitMessageText(text: string): MessagePiece[] {
  const pieces: MessagePiece[] = []
  let plain = ''
  let at = 0
  for (const match of text.matchAll(ADDRESS_CANDIDATE)) {
    const start = match.index
    const address = trimAddress(match[0])
    const href = notesLinkHref(address)
    plain += text.slice(at, start)
    if (href === null) {
      plain += address
    }
    else {
      if (plain !== '') pieces.push({ text: plain })
      plain = ''
      pieces.push({ text: address, href })
    }
    at = start + address.length
  }
  plain += text.slice(at)
  if (plain !== '') pieces.push({ text: plain })
  return pieces
}
