import { describe, expect, it } from 'vitest'
import { hasSpace, parseTeamWord, stripSpaces, TEAM_WORD_MAX } from '../../shared/team-word'

// The Team word rules (#161, GLOSSARY: Team word): one word, no spaces, at most 12 characters as the User sees them.

describe('parseTeamWord', () => {
  it('takes a word of 12 characters', () => {
    expect(TEAM_WORD_MAX).toBe(12)
    expect(parseTeamWord('Gurkenfreund')).toEqual({ ok: true, word: 'Gurkenfreund' })
  })

  it('refuses a word of 13 characters', () => {
    expect(parseTeamWord('Gurkenfreunde')).toEqual({ ok: false, error: 'invalid_team_word' })
  })

  it('counts an emoji as one character', () => {
    expect(parseTeamWord('👍🏽'.repeat(12))).toEqual({ ok: true, word: '👍🏽'.repeat(12) })
    expect(parseTeamWord('👍🏽'.repeat(13))).toEqual({ ok: false, error: 'invalid_team_word' })
  })

  it('refuses a space inside the word', () => {
    expect(parseTeamWord('Wilde Gurken')).toEqual({ ok: false, error: 'invalid_team_word' })
    expect(parseTeamWord('Wilde\tGurken')).toEqual({ ok: false, error: 'invalid_team_word' })
  })

  // The database check (`~ '^\S+$'`) counts a few more code points as space than JavaScript's \s does: NEL and the
  // Mongolian vowel separator. They must be refused here, as invalid_team_word, and not reach the database as a 500.
  it('refuses the spaces that Postgres knows and JavaScript\'s \\s does not', () => {
    expect(parseTeamWord('Wilde\u0085Gurken')).toEqual({ ok: false, error: 'invalid_team_word' })
    expect(parseTeamWord('Wilde᠎Gurken')).toEqual({ ok: false, error: 'invalid_team_word' })
  })

  it('turns an empty word into null, which removes the word', () => {
    expect(parseTeamWord('')).toEqual({ ok: true, word: null })
  })

  it('refuses what is not a string', () => {
    expect(parseTeamWord(undefined)).toEqual({ ok: false, error: 'invalid_team_word' })
    expect(parseTeamWord(12)).toEqual({ ok: false, error: 'invalid_team_word' })
  })
})

describe('hasSpace and stripSpaces', () => {
  it('see the same spaces as the word check, so the field and the server agree', () => {
    const typed = 'a b\tc\u0085d᠎e'
    expect(hasSpace(typed)).toBe(true)
    expect(stripSpaces(typed)).toBe('abcde')
    expect(hasSpace('abcde')).toBe(false)
    expect(parseTeamWord(stripSpaces(typed))).toEqual({ ok: true, word: 'abcde' })
  })
})
