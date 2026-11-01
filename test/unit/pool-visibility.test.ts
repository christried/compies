import { describe, expect, it } from 'vitest'
import { canSeePoolGames, poolsVisibleTo } from '../../server/domain/pool-visibility'
import { defaultSettings } from '../../shared/settings'

// Who sees the games of the pools, and who learns nothing about them (#146, #148, #222).

const visibleWheel = { ...defaultSettings(), selectionMode: 'lucky_wheel' as const, hiddenWheel: false, vetoAllowance: 3 }
const hiddenWheel = { ...visibleWheel, hiddenWheel: true }

describe('poolsVisibleTo (#148)', () => {
  it('gives the Host the games, also under a Hidden wheel', () => {
    expect(poolsVisibleTo({ isHost: true, settings: hiddenWheel })).toBe(true)
    expect(poolsVisibleTo({ isHost: true, settings: visibleWheel })).toBe(true)
  })

  it('gives another Member the games only while the wheel is not hidden', () => {
    expect(poolsVisibleTo({ isHost: false, settings: visibleWheel })).toBe(true)
    expect(poolsVisibleTo({ isHost: false, settings: defaultSettings() })).toBe(true)
    expect(poolsVisibleTo({ isHost: false, settings: hiddenWheel })).toBe(false)
  })

  it('gives another Member nothing for an Event that is not set up', () => {
    expect(poolsVisibleTo({ isHost: false, settings: null })).toBe(false)
    expect(poolsVisibleTo({ isHost: true, settings: null })).toBe(true)
  })
})

describe('canSeePoolGames (#183)', () => {
  it('gives the Host the games whatever the stored Hidden wheel is', () => {
    expect(canSeePoolGames({ isHost: true, hiddenWheel: true })).toBe(true)
    expect(canSeePoolGames({ isHost: true, hiddenWheel: false })).toBe(true)
    expect(canSeePoolGames({ isHost: true, hiddenWheel: null })).toBe(true)
  })

  it('gives another Member the games only while the wheel is known not to be hidden', () => {
    expect(canSeePoolGames({ isHost: false, hiddenWheel: false })).toBe(true)
    expect(canSeePoolGames({ isHost: false, hiddenWheel: true })).toBe(false)
  })

  it('gives another Member nothing when the Event is not set up', () => {
    expect(canSeePoolGames({ isHost: false, hiddenWheel: null })).toBe(false)
  })
})
