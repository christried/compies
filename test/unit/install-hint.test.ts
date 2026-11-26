import { describe, expect, it } from 'vitest'
import { installHint, laterEntry, parseEntry, platformOf, PWA_LATER_DAYS, PWA_STORAGE_KEY, type PwaEntry } from '../../app/utils/install-hint'

// The install hint's deciding rule is pure: the device facts, the stored entry and `now` come in (#676, spec #927 § The install hint).

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('platformOf', () => {
  it('reads an iPhone and an iPad by the user agent', () => {
    expect(platformOf({ userAgent: IPHONE, maxTouchPoints: 5, coarsePointer: true })).toBe('ios')
    expect(platformOf({ userAgent: IPAD, maxTouchPoints: 5, coarsePointer: true })).toBe('ios')
  })

  it('reads an iPad that reports itself as a Mac by its touch points, and a real Mac as a computer', () => {
    expect(platformOf({ userAgent: MAC, maxTouchPoints: 5, coarsePointer: true })).toBe('ios')
    expect(platformOf({ userAgent: MAC, maxTouchPoints: 0, coarsePointer: false })).toBe('computer')
  })

  it('reads a coarse primary pointer as Android, whatever the user agent says', () => {
    expect(platformOf({ userAgent: ANDROID, maxTouchPoints: 5, coarsePointer: true })).toBe('android')
    expect(platformOf({ userAgent: WINDOWS, maxTouchPoints: 10, coarsePointer: true })).toBe('android')
  })

  it('reads a fine pointer as a computer, also with an Android user agent', () => {
    expect(platformOf({ userAgent: ANDROID, maxTouchPoints: 0, coarsePointer: false })).toBe('computer')
    expect(platformOf({ userAgent: WINDOWS, maxTouchPoints: 0, coarsePointer: false })).toBe('computer')
    expect(platformOf({ userAgent: LINUX, maxTouchPoints: 0, coarsePointer: false })).toBe('computer')
  })
})

describe('the stored entry', () => {
  it('names the key and the days of „Später“', () => {
    expect(PWA_STORAGE_KEY).toBe('compies-pwa')
    expect(PWA_LATER_DAYS).toBe(14)
  })

  it('reads done and a later day', () => {
    expect(parseEntry('done')).toEqual({ kind: 'done' })
    expect(parseEntry('later:2026-11-26')).toEqual({ kind: 'later', day: '2026-11-26' })
  })

  it.each([null, '', 'later:', 'later:2026-13-45', 'later:2026-02-30', 'later:26-11-26', 'done ', 'Done', 'later', 'x'])(
    'reads %j as no entry, so broken storage shows the banner',
    (raw) => {
      expect(parseEntry(raw)).toEqual({ kind: 'none' })
    },
  )

  it('writes the Berlin day of now, and reads it back', () => {
    const now = new Date('2026-11-26T12:00:00Z')

    expect(laterEntry(now)).toBe('later:2026-11-26')
    expect(parseEntry(laterEntry(now))).toEqual({ kind: 'later', day: '2026-11-26' })
  })

  it('takes the day in Berlin, not in UTC (ADR 0003)', () => {
    expect(laterEntry(new Date('2026-11-26T23:30:00Z'))).toBe('later:2026-11-27')
  })
})

const ON_PROMPT = { platform: 'android', installed: false, promptHeld: true, accepted: false, entry: { kind: 'none' }, hasPlayed: true } as const
const NOW = new Date('2026-11-26T12:00:00Z')
const later = (day: string): PwaEntry => ({ kind: 'later', day })

describe('installHint', () => {
  it('shows the prompt banner on Android while the prompt is held', () => {
    expect(installHint({ ...ON_PROMPT, now: NOW })).toEqual({ kind: 'banner', via: 'prompt' })
  })

  it('shows nothing on Android without a held prompt', () => {
    expect(installHint({ ...ON_PROMPT, promptHeld: false, now: NOW })).toEqual({ kind: 'none' })
  })

  it('shows nothing on a computer, even with everything else in place', () => {
    expect(installHint({ ...ON_PROMPT, platform: 'computer', now: NOW })).toEqual({ kind: 'none' })
    expect(installHint({ ...ON_PROMPT, platform: 'computer', accepted: true, now: NOW })).toEqual({ kind: 'none' })
  })

  it.each(['android', 'ios'] as const)('shows nothing in the installed app on %s', (platform) => {
    expect(installHint({ ...ON_PROMPT, platform, installed: true, now: NOW })).toEqual({ kind: 'none' })
  })

  it('shows nothing before the User has played, even with a held prompt or an accepted install', () => {
    expect(installHint({ ...ON_PROMPT, hasPlayed: false, now: NOW })).toEqual({ kind: 'none' })
    expect(installHint({ ...ON_PROMPT, hasPlayed: false, accepted: true, now: NOW })).toEqual({ kind: 'none' })
  })

  it('says installed after an accepted install, with or without the prompt and whatever the entry says', () => {
    expect(installHint({ ...ON_PROMPT, accepted: true, now: NOW })).toEqual({ kind: 'done' })
    expect(installHint({ ...ON_PROMPT, accepted: true, promptHeld: false, now: NOW })).toEqual({ kind: 'done' })
    expect(installHint({ ...ON_PROMPT, accepted: true, promptHeld: false, entry: later('2026-11-26'), now: NOW })).toEqual({ kind: 'done' })
  })

  it('shows nothing once the iOS steps are done, on either platform', () => {
    expect(installHint({ ...ON_PROMPT, entry: { kind: 'done' }, now: NOW })).toEqual({ kind: 'none' })
    expect(installHint({ ...ON_PROMPT, platform: 'ios', entry: { kind: 'done' }, now: NOW })).toEqual({ kind: 'none' })
  })

  it('shows the iOS sheet on an iPhone or iPad in any browser, with no prompt (#929)', () => {
    expect(installHint({ ...ON_PROMPT, platform: 'ios', promptHeld: false, now: NOW })).toEqual({ kind: 'banner', via: 'sheet' })
  })

  describe('„Später“ keeps the banner away for 14 days from the stored day', () => {
    it.each([
      ['today', '2026-11-26', false],
      ['13 days ago', '2026-11-13', false],
      ['14 days ago', '2026-11-12', true],
      ['15 days ago', '2026-11-11', true],
      ['tomorrow (the device clock was set back)', '2026-11-27', true],
    ])('%s (%s) -> shown %s', (_label, stored, shown) => {
      expect(installHint({ ...ON_PROMPT, entry: later(stored), now: NOW })).toEqual(shown ? { kind: 'banner', via: 'prompt' } : { kind: 'none' })
    })

    it('counts across a month and year boundary: hidden on 2027-01-07, shown on 2027-01-08 for 2026-12-25', () => {
      expect(installHint({ ...ON_PROMPT, entry: later('2026-12-25'), now: new Date('2027-01-07T12:00:00Z') })).toEqual({ kind: 'none' })
      expect(installHint({ ...ON_PROMPT, entry: later('2026-12-25'), now: new Date('2027-01-08T12:00:00Z') })).toEqual({ kind: 'banner', via: 'prompt' })
    })

    it('counts calendar days in Berlin, so a DST change does not shift the count', () => {
      // 29 Mar 2026 is the 23-hour day, 25 Oct 2026 the 25-hour one.
      expect(installHint({ ...ON_PROMPT, entry: later('2026-03-20'), now: new Date('2026-04-02T10:00:00Z') })).toEqual({ kind: 'none' })
      expect(installHint({ ...ON_PROMPT, entry: later('2026-03-20'), now: new Date('2026-04-03T10:00:00Z') })).toEqual({ kind: 'banner', via: 'prompt' })
      expect(installHint({ ...ON_PROMPT, entry: later('2026-10-12'), now: new Date('2026-10-25T10:00:00Z') })).toEqual({ kind: 'none' })
      expect(installHint({ ...ON_PROMPT, entry: later('2026-10-12'), now: new Date('2026-10-26T10:00:00Z') })).toEqual({ kind: 'banner', via: 'prompt' })
    })

    it('hides on the sheet platform too', () => {
      expect(installHint({ ...ON_PROMPT, platform: 'ios', entry: later('2026-11-26'), now: NOW })).toEqual({ kind: 'none' })
    })
  })

  it('shows the banner for no entry', () => {
    expect(installHint({ ...ON_PROMPT, entry: parseEntry('garbage'), now: NOW })).toEqual({ kind: 'banner', via: 'prompt' })
  })
})
