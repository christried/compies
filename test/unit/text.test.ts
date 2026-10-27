import { describe, expect, it } from 'vitest'
import { characterCount, cutToCharacters } from '../../shared/text'

describe('characterCount', () => {
  it('counts what the User sees: one per emoji, flag, family and skin tone', () => {
    expect(characterCount('')).toBe(0)
    expect(characterCount('abc')).toBe(3)
    expect(characterCount('🎲')).toBe(1)
    expect(characterCount('👍🏽')).toBe(1)
    expect(characterCount('🇩🇪')).toBe(1)
    expect(characterCount('👨‍👩‍👧')).toBe(1)
    expect(characterCount('👍🏽'.repeat(32))).toBe(32)
    expect(characterCount('Ä')).toBe(1)
  })
})

describe('cutToCharacters', () => {
  it('cuts by characters, never through an emoji', () => {
    expect(cutToCharacters('👍🏽'.repeat(40), 32)).toBe('👍🏽'.repeat(32))
    expect(cutToCharacters('abc', 5)).toBe('abc')
    expect(cutToCharacters('👨‍👩‍👧x', 1)).toBe('👨‍👩‍👧')
  })
})
