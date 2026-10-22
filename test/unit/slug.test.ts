import { describe, expect, it } from 'vitest'
import { createInviteToken, createSlug } from '../../server/domain/slug'
import { parseSessionPath } from '../../shared/links'

describe('createSlug', () => {
  it('kebab-cases the name and appends the suffix', () => {
    expect(createSlug('Freitags-Zocken', 'k7q2')).toBe('freitags-zocken-k7q2')
    expect(createSlug('  Mario Kart   Abend ', 'a1b2')).toBe('mario-kart-abend-a1b2')
  })

  it('spells umlauts and ß out, and drops other accents', () => {
    expect(createSlug('Ärger um Straße', 'x9y8')).toBe('aerger-um-strasse-x9y8')
    expect(createSlug('Café Zocken', 'x9y8')).toBe('cafe-zocken-x9y8')
  })

  it('falls back to "session" when the name has no ASCII letters or digits', () => {
    expect(createSlug('🎮🎮', 'k7q2')).toBe('session-k7q2')
  })

  it('appends four lowercase letters or digits by default', () => {
    expect(createSlug('Abend')).toMatch(/^abend-[a-z0-9]{4}$/)
  })
})

describe('createInviteToken', () => {
  it('is 12 base62 characters', () => {
    expect(createInviteToken()).toMatch(/^[A-Za-z0-9]{12}$/)
  })

  it('draws a different token each time', () => {
    expect(createInviteToken()).not.toBe(createInviteToken())
  })
})

describe('parseSessionPath', () => {
  it('reads a Session link as the whole segment', () => {
    expect(parseSessionPath('freitags-zocken-k7q2')).toEqual({ kind: 'session', slug: 'freitags-zocken-k7q2' })
  })

  it('splits an Invite link on its last dash', () => {
    expect(parseSessionPath('freitags-zocken-k7q2-AbCdEf123456')).toEqual({
      kind: 'invite', slug: 'freitags-zocken-k7q2', token: 'AbCdEf123456',
    })
  })

  it('rejects segments that are neither a Session link nor an Invite link', () => {
    for (const segment of ['', 'Freitags-k7q2', 'a--b-k7q2', 'abc-', '-k7q2', 'abc-AbCdEf12345']) {
      expect(parseSessionPath(segment)).toBeNull()
    }
  })
})
