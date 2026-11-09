import { describe, expect, it } from 'vitest'
import { berlinYear, formatFullDay, formatMonthYear, formatShortDay, formatSlotDay, formatSlotTime, formatSessionWhen, formatSlotWhen } from '../../app/utils/berlin-time'

describe('berlin-time', () => {
  it('formats a day as weekday and day.month in Berlin time', () => {
    // 24 Oct 2026 is a Saturday; 23:30 UTC is already the 25th in Berlin.
    expect(formatSlotDay(new Date('2026-10-24T18:00:00Z'))).toBe('Sa 24.10.')
    expect(formatSlotDay(new Date('2026-10-24T23:30:00Z'))).toBe('So 25.10.')
  })

  it('formats a time as HH:mm in Berlin time', () => {
    expect(formatSlotTime(new Date('2026-10-30T19:30:00Z'))).toBe('20:30')
  })

  it('formats a month and year in Berlin time (D8)', () => {
    expect(formatMonthYear(new Date('2026-10-15T12:00:00Z'))).toBe('Oktober 2026')
    // 23:30 UTC on 31 Oct is already 1 Nov in Berlin.
    expect(formatMonthYear(new Date('2026-10-31T23:30:00Z'))).toBe('November 2026')
  })

  it('formats a day in full, short and its year in Berlin time (#337, the Price line and the form)', () => {
    // 23:30 UTC on 2 Nov is already the 3rd in Berlin.
    expect(formatFullDay(new Date('2026-11-02T23:30:00Z'))).toBe('3. November 2026')
    expect(formatShortDay(new Date('2026-11-02T23:30:00Z'))).toBe('3. Nov.')
    // 23:30 UTC on New Year's Eve is already the new year in Berlin.
    expect(berlinYear(new Date('2025-12-31T23:30:00Z'))).toBe('2026')
  })

  it('formats a Slot as day and time, as cards and lists show it', () => {
    expect(formatSlotWhen(new Date('2026-10-24T18:30:00Z'))).toBe('Sa 24.10. 20:30')
  })

  it('formats the Date of a Session with a comma between day and time, as the Head and the Sessions card show it', () => {
    expect(formatSessionWhen(new Date('2026-10-24T18:30:00Z'))).toBe('Sa 24.10., 20:30')
  })
})
