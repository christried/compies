import { afterEach, describe, expect, it, vi } from 'vitest'
import { motionMs } from '../../app/utils/motion'

// The duration tokens in milliseconds (#370): the production CSS is minified, which writes `360ms` as `.36s`, and a Web Animation given
// `parseFloat('.36s')` ran for 0.36 ms. The seam is the computed style of `<html>`: a stub that answers with the token values the page sets.

/** The computed style of `<html>` with these custom properties set, as the tokens put them there. */
function tokens(values: Record<string, string>) {
  vi.stubGlobal('document', { documentElement: {} })
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => values[name] ?? '' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('motionMs', () => {
  it('reads the milliseconds spelling', () => {
    tokens({ '--cp-dur-slow': '360ms' })
    expect(motionMs('--cp-dur-slow', '140ms')).toBe(360)
  })

  it('reads the minified seconds spelling: .36s is 360 ms', () => {
    tokens({ '--cp-dur-slow': '.36s' })
    expect(motionMs('--cp-dur-slow', '140ms')).toBe(360)
  })

  it('reads a seconds spelling with a leading zero: 0.36s is 360 ms', () => {
    tokens({ '--cp-dur-slow': '0.36s' })
    expect(motionMs('--cp-dur-slow', '140ms')).toBe(360)
  })

  it('ignores the whitespace around the value', () => {
    tokens({ '--cp-dur-base': '  220ms ' })
    expect(motionMs('--cp-dur-base', '140ms')).toBe(220)
  })

  it('reads .6s as 600 ms', () => {
    tokens({ '--cp-dur-slower': '.6s' })
    expect(motionMs('--cp-dur-slower', '360ms')).toBe(600)
  })

  it('falls back when the value is not a time', () => {
    tokens({ '--cp-dur-fast': 'nonsense' })
    expect(motionMs('--cp-dur-fast', '140ms')).toBe(140)
  })

  it('falls back when the token is missing', () => {
    tokens({})
    expect(motionMs('--cp-dur-base', '220ms')).toBe(220)
  })
})
