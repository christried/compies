import { describe, expect, it } from 'vitest'
import { canSeePoolGames, poolFactsOf } from '../../server/domain/pool-preview'
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
