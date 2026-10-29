import { describe, expect, it } from 'vitest'
import { poolsVisibleTo } from '../../server/domain/pool-visibility'
import { defaultSettings } from '../../shared/settings'

// Who sees the games of the pools and who only the counts (#146, #148).

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
