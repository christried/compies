import { describe, expect, it } from 'vitest'
import { isApplePlatform } from '../../app/utils/platform'

// The save shortcut is ⌘ on an Apple platform and Strg elsewhere (#465): the hint's text follows this check.
describe('isApplePlatform', () => {
  it('is true for a Mac', () => {
    expect(isApplePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe(true)
  })

  it('is true for an iPhone', () => {
    expect(isApplePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(true)
  })

  it('is false for Windows', () => {
    expect(isApplePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36')).toBe(false)
  })

  it('is false for Linux', () => {
    expect(isApplePlatform('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36')).toBe(false)
  })

  it('is false without a user agent', () => {
    expect(isApplePlatform('')).toBe(false)
  })
})
