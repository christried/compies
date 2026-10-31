// The Team word rules (GLOSSARY: Team word, #161): one word per Player in a team, no spaces, at most 12 characters as
// the User sees them (characterCount). The server refuses a space; the field strips it before sending.

import { characterCount } from './text'

export const TEAM_WORD_MAX = 12

// What counts as a space is one rule for the parser, the field and the database check (migration 0011, `~ '^\S+$'`).
// Postgres counts NEL (U+0085) and the Mongolian vowel separator (U+180E, a space in older Unicode) as space, which JavaScript's
// `\s` does not, so a word with one would pass the API check and fail the database check as a 500.
const SPACE = '[\\s\\u0085\\u180E]'

/** Whether the text holds a space, as the database sees it. */
export function hasSpace(text: string): boolean {
  return new RegExp(SPACE).test(text)
}

/** The text without any space: what the field keeps of what the User typed. */
export function stripSpaces(text: string): string {
  return text.replace(new RegExp(SPACE, 'g'), '')
}

export type TeamWordResult = { ok: true, word: string | null } | { ok: false, error: 'invalid_team_word' }

/** The word a request carries: an empty string removes the word (`null`), anything else must be one word of at most TEAM_WORD_MAX characters. */
export function parseTeamWord(raw: unknown): TeamWordResult {
  if (typeof raw !== 'string' || hasSpace(raw) || characterCount(raw) > TEAM_WORD_MAX) return { ok: false, error: 'invalid_team_word' }
  return { ok: true, word: raw === '' ? null : raw }
}
