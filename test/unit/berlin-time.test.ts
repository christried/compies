import { describe, expect, it } from 'vitest'
import { berlinLocalNow, formatSlotDay, formatSlotTime } from '../../app/utils/berlin-time'

describe('berlin-time', () => {
  it('formats a day as weekday and day.month in Berlin time', () => {
    // 24 Oct 2026 is a Saturday; 23:30 UTC is already the 25th in Berlin.
    expect(formatSlotDay(new Date('2026-10-24T18:00:00Z'))).toBe('Sa 24.10.')
    expect(formatSlotDay(new Date('2026-10-24T23:30:00Z'))).toBe('So 25.10.')
  })

  it('formats a time as HH:mm in Berlin time', () => {
    expect(formatSlotTime(new Date('2026-10-30T19:30:00Z'))).toBe('20:30')
  })

  it('gives the current Berlin wall-clock time in the form a datetime field uses', () => {
    expect(berlinLocalNow(new Date('2026-10-22T10:00:00Z'))).toBe('2026-10-22T12:00')
  })
})
