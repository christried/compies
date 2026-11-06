import { describe, expect, it } from 'vitest'
import { berlinDay, berlinToUtc, utcToBerlin } from '../../shared/time'

// 2026: summer time starts Sun 29 March (02:00 → 03:00), ends Sun 25 October (03:00 → 02:00).
describe('berlinToUtc', () => {
  it('reads a winter time as CET (UTC+1)', () => {
    expect(berlinToUtc('2026-01-15T20:00').toISOString()).toBe('2026-01-15T19:00:00.000Z')
  })

  it('reads a summer time as CEST (UTC+2)', () => {
    expect(berlinToUtc('2026-07-15T20:00').toISOString()).toBe('2026-07-15T18:00:00.000Z')
  })

  it('switches offset at the spring-forward change', () => {
    expect(berlinToUtc('2026-03-29T01:30').toISOString()).toBe('2026-03-29T00:30:00.000Z')
    expect(berlinToUtc('2026-03-29T03:30').toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('moves a time in the skipped spring-forward hour one hour later', () => {
    expect(berlinToUtc('2026-03-29T02:30').toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('reads the doubled hour at the fall-back change as its first occurrence (CEST)', () => {
    expect(berlinToUtc('2026-10-25T02:30').toISOString()).toBe('2026-10-25T00:30:00.000Z')
    expect(berlinToUtc('2026-10-25T03:30').toISOString()).toBe('2026-10-25T02:30:00.000Z')
  })
})

describe('utcToBerlin', () => {
  it('shows an instant as Berlin wall-clock time in winter and summer', () => {
    expect(utcToBerlin(new Date('2026-01-15T19:00:00Z'))).toBe('2026-01-15T20:00')
    expect(utcToBerlin(new Date('2026-07-15T18:00:00Z'))).toBe('2026-07-15T20:00')
  })

  it('shows both instants of the doubled fall-back hour as the same wall-clock time', () => {
    expect(utcToBerlin(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25T02:30')
    expect(utcToBerlin(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25T02:30')
  })
})

// The day as the Share image and the Slot cards print it (#313): the one home of the format.
describe('berlinDay', () => {
  it('reads the day without a year', () => {
    expect(berlinDay(new Date('2026-10-24T18:00:00Z'), false)).toBe('Sa 24.10.')
  })

  it('adds the year when asked', () => {
    expect(berlinDay(new Date('2026-10-24T18:00:00Z'), true)).toBe('Sa 24.10.2026')
  })

  it('counts the Berlin day, not the UTC day', () => {
    expect(berlinDay(new Date('2026-07-24T23:30:00Z'), true)).toBe('Sa 25.07.2026')
  })

  it('zero-pads day and month', () => {
    expect(berlinDay(new Date('2027-01-01T12:00:00Z'), true)).toBe('Fr 01.01.2027')
  })
})
