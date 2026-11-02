import { describe, expect, it } from 'vitest'
import { canSeePoolGames, drawGameKnown, poolFactsOf } from '../../server/domain/pool-preview'
import { defaultSettings } from '../../shared/settings'

// Who sees the games of the pools, and who learns nothing about them (#146, #148, #183, #222, #225).

const visibleWheel = { ...defaultSettings(), selectionMode: 'lucky_wheel' as const, hiddenWheel: false, vetoAllowance: 3 }
const hiddenWheel = { ...visibleWheel, hiddenWheel: true, poolPreview: false }

describe('canSeePoolGames (#183)', () => {
  it('gives the Host the games whatever the Pool preview is', () => {
    expect(canSeePoolGames({ isHost: true, poolPreview: true })).toBe(true)
    expect(canSeePoolGames({ isHost: true, poolPreview: false })).toBe(true)
  })

  it('gives another Member the games only while the Pool preview is on', () => {
    expect(canSeePoolGames({ isHost: false, poolPreview: true })).toBe(true)
    expect(canSeePoolGames({ isHost: false, poolPreview: false })).toBe(false)
  })
})

describe('poolFactsOf (#148, #225)', () => {
  it('gives the Host the games, also under a Hidden wheel', () => {
    expect(canSeePoolGames(poolFactsOf({ isHost: true, settings: hiddenWheel }))).toBe(true)
    expect(canSeePoolGames(poolFactsOf({ isHost: true, settings: visibleWheel }))).toBe(true)
  })

  it('gives another Member the games only while the Pool preview is on', () => {
    expect(canSeePoolGames(poolFactsOf({ isHost: false, settings: visibleWheel }))).toBe(true)
    expect(canSeePoolGames(poolFactsOf({ isHost: false, settings: defaultSettings() }))).toBe(true)
    expect(canSeePoolGames(poolFactsOf({ isHost: false, settings: hiddenWheel }))).toBe(false)
    expect(canSeePoolGames(poolFactsOf({ isHost: false, settings: { ...visibleWheel, poolPreview: false } }))).toBe(false)
    expect(canSeePoolGames(poolFactsOf({ isHost: false, settings: { ...defaultSettings(), poolPreview: false } }))).toBe(false)
  })

  it('gives another Member nothing for an Event that is not set up', () => {
    expect(canSeePoolGames(poolFactsOf({ isHost: false, settings: null }))).toBe(false)
    expect(canSeePoolGames(poolFactsOf({ isHost: true, settings: null }))).toBe(true)
  })
})

// The game of a draw is known from its stop on, to every Member, and to the Host before it (#258).
describe('drawGameKnown (#258)', () => {
  const now = new Date('2090-10-30T10:00:00.000Z')
  const at = (ms: number) => new Date(now.getTime() + ms)

  it('gives a Member the game at the exact stop instant', () => {
    expect(drawGameKnown({ isHost: false, draw: { stopAt: now }, now })).toBe(true)
  })

  it('keeps a Member from the game one millisecond before the stop', () => {
    expect(drawGameKnown({ isHost: false, draw: { stopAt: at(1) }, now })).toBe(false)
  })

  it('gives a Member the game from one millisecond after the stop', () => {
    expect(drawGameKnown({ isHost: false, draw: { stopAt: at(-1) }, now })).toBe(true)
  })

  it('gives the Host the game before the stop and after it', () => {
    expect(drawGameKnown({ isHost: true, draw: { stopAt: at(60 * 60_000) }, now })).toBe(true)
    expect(drawGameKnown({ isHost: true, draw: { stopAt: at(-60 * 60_000) }, now })).toBe(true)
  })
})
