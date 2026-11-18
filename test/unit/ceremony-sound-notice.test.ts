import { describe, expect, it } from 'vitest'
import { ceremonyAwaitsSound } from '../../app/utils/ceremony'
import { PHASES, type Phase } from '../../shared/phase'
import { defaultSettings } from '../../shared/settings'
import type { CeremonyView } from '../../shared/stage'

// When the page asks for the tap that lets sound through before the Award ceremony (#755, spec #718 § Engine changes, „„Ton aktivieren“ at
// the Award ceremony“): a finished Event whose ceremony the Host has not started, or whose latest run has not reached its stored end. The rule
// has no role and no device: the Host's read and a Member's are the same, and so is a phone that ends its grid early. Instants are epoch ms.

const NOW = 1_000_000
const iso = (ms: number) => new Date(ms).toISOString()
/** A run that started 1000 ms before `NOW` and ends 5000 ms after it. */
const RUNNING = { startsAt: iso(NOW - 1000), endsAt: iso(NOW + 5000), gag: 'trip' as const }

const viewOf = (phase: Phase, ceremony: CeremonyView | null, settings: ReturnType<typeof defaultSettings> | null = defaultSettings()) => ({ event: { phase }, settings, ceremony })

describe('a finished Event', () => {
  it('awaits sound while its ceremony is pending, at any instant', () => {
    expect(ceremonyAwaitsSound(viewOf('finished', null), 0)).toBe(true)
    expect(ceremonyAwaitsSound(viewOf('finished', null), NOW)).toBe(true)
    expect(ceremonyAwaitsSound(viewOf('finished', null), 9_000_000_000_000)).toBe(true)
  })

  it('awaits sound while the ceremony runs, up to its stored end and not at it', () => {
    expect(ceremonyAwaitsSound(viewOf('finished', RUNNING), NOW)).toBe(true)
    expect(ceremonyAwaitsSound(viewOf('finished', RUNNING), Date.parse(RUNNING.endsAt) - 1)).toBe(true)
    expect(ceremonyAwaitsSound(viewOf('finished', RUNNING), Date.parse(RUNNING.endsAt))).toBe(false)
    expect(ceremonyAwaitsSound(viewOf('finished', RUNNING), Date.parse(RUNNING.endsAt) + 60_000)).toBe(false)
  })

  it('counts the lead before the start as running', () => {
    const lead = { startsAt: iso(NOW + 1500), endsAt: iso(NOW + 6500), gag: 'bonk' as const }
    expect(ceremonyAwaitsSound(viewOf('finished', lead), NOW)).toBe(true)
  })

  it('awaits nothing without settings, which an Event from before 1.3 lacks', () => {
    expect(ceremonyAwaitsSound(viewOf('finished', null, null), NOW)).toBe(false)
  })
})

describe('an Event that is not finished', () => {
  const NOT_FINISHED = PHASES.filter(phase => phase !== 'finished')

  it.each(NOT_FINISHED)('awaits nothing in the phase %s', (phase) => {
    expect(ceremonyAwaitsSound(viewOf(phase, null), NOW)).toBe(false)
    expect(ceremonyAwaitsSound(viewOf(phase, RUNNING), NOW)).toBe(false)
  })

  it('awaits nothing on the pages a Tour may start on: draft, poll, date_set and running (#747 shows no notice)', () => {
    for (const phase of ['draft', 'poll', 'date_set', 'running'] as const) expect(ceremonyAwaitsSound(viewOf(phase, null), NOW), phase).toBe(false)
  })
})
