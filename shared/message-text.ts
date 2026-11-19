// The text of a Message (GLOSSARY: Chat, #758, spec #719 § A): the Note's rule (`parseNote`) with every line break of Unicode turned into a space, so the
// composer and the server enforce one rule. A tab, other control characters and runs of spaces stay as typed.

import { characterCount } from './text'

/** The most characters a Message may hold, as `characterCount` counts them (graphemes), after the line breaks and the ends are normalised. */
export const MESSAGE_MAX = 500

export type MessageTextResult = { ok: true, text: string } | { ok: false, error: 'invalid_value' | 'invalid_message' }

// CRLF is one break; VT, FF, NEL, LS (U+2028) and PS (U+2029) are line breaks of Unicode that the Note's rule leaves.
const LINE_BREAK = /\r\n|[\r\n\v\f\u0085\u2028\u2029]/g

/**
 * The text a request carries: every line break becomes one space and the ends are trimmed. Not a string, or a U+0000 (which Postgres refuses in `text`,
 * so it would be a 500), is `invalid_value`; empty or longer than MESSAGE_MAX is `invalid_message`.
 */
export function parseMessageText(raw: unknown): MessageTextResult {
  if (typeof raw !== 'string' || raw.includes('\u0000')) return { ok: false, error: 'invalid_value' }
  const text = raw.replace(LINE_BREAK, ' ').trim()
  if (text === '' || characterCount(text) > MESSAGE_MAX) return { ok: false, error: 'invalid_message' }
  return { ok: true, text }
}
