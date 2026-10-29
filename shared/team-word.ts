// The Team word rules (GLOSSARY: Team word, #161): one word per Player in a team, no spaces, at most 12 characters as
// the User sees them (characterCount). The server refuses a space; the field strips it before sending.

import { characterCount } from './text'

export const TEAM_WORD_MAX = 12

export type TeamWordResult = { ok: true, word: string | null } | { ok: false, error: 'invalid_team_word' }

/** The word a request carries: an empty string removes the word (`null`), anything else must be one word of at most TEAM_WORD_MAX characters. */
export function parseTeamWord(raw: unknown): TeamWordResult {
  if (typeof raw !== 'string' || /\s/.test(raw) || characterCount(raw) > TEAM_WORD_MAX) return { ok: false, error: 'invalid_team_word' }
  return { ok: true, word: raw === '' ? null : raw }
}
