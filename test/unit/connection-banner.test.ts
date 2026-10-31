import { describe, expect, it } from 'vitest'
import { BACK_FOR_MS, LOST_AFTER_MS, RECONNECTING_AFTER_MS, bannerChangeIn, bannerFor } from '../../app/utils/connection-banner'

// The ConnectionBanner's timing (#156, 02-components § ConnectionBanner): nothing for the first 2 s without a
// connection, „wird wiederhergestellt“ from 2 s, „verloren“ from 15 s, „Wieder da“ for 2 s once it is back.
describe('bannerFor', () => {
  it('shows nothing while the connection is open', () => {
    expect(bannerFor({ open: true, downMs: null, recoveredMs: null })).toBe('ok')
  })

  it('shows nothing for a drop shorter than 2 s', () => {
    expect(bannerFor({ open: false, downMs: 0, recoveredMs: null })).toBe('ok')
    expect(bannerFor({ open: false, downMs: RECONNECTING_AFTER_MS - 1, recoveredMs: null })).toBe('ok')
  })

  it('is reconnecting from 2 s up to 15 s', () => {
    expect(bannerFor({ open: false, downMs: RECONNECTING_AFTER_MS, recoveredMs: null })).toBe('reconnecting')
    expect(bannerFor({ open: false, downMs: LOST_AFTER_MS - 1, recoveredMs: null })).toBe('reconnecting')
  })

  it('is lost from 15 s', () => {
    expect(bannerFor({ open: false, downMs: LOST_AFTER_MS, recoveredMs: null })).toBe('lost')
    expect(bannerFor({ open: false, downMs: 10 * 60_000, recoveredMs: null })).toBe('lost')
  })

  it('says it is back for 2 s after a connection that was noticed came back', () => {
    expect(bannerFor({ open: true, downMs: null, recoveredMs: 0 })).toBe('back')
    expect(bannerFor({ open: true, downMs: null, recoveredMs: BACK_FOR_MS - 1 })).toBe('back')
    expect(bannerFor({ open: true, downMs: null, recoveredMs: BACK_FOR_MS })).toBe('ok')
  })
})

describe('bannerChangeIn', () => {
  it('names how long until the banner next changes, or null when it will not on its own', () => {
    expect(bannerChangeIn({ open: false, downMs: 500, recoveredMs: null })).toBe(RECONNECTING_AFTER_MS - 500)
    expect(bannerChangeIn({ open: false, downMs: 3000, recoveredMs: null })).toBe(LOST_AFTER_MS - 3000)
    expect(bannerChangeIn({ open: false, downMs: 20_000, recoveredMs: null })).toBeNull()
    expect(bannerChangeIn({ open: true, downMs: null, recoveredMs: 500 })).toBe(BACK_FOR_MS - 500)
    expect(bannerChangeIn({ open: true, downMs: null, recoveredMs: null })).toBeNull()
  })
})
