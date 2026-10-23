import { describe, expect, it } from 'vitest'
import { missingDates, openSlots, parseSessionCount, sessionNumbers } from '../../server/domain/session'
import { berlinToUtc } from '../../shared/time'

describe('parseSessionCount', () => {
  it('takes whole numbers from 1 to 8', () => {
    expect(parseSessionCount(1)).toBe(1)
    expect(parseSessionCount(8)).toBe(8)
    for (const raw of [0, 9, -1, 1.5, '2', null, undefined]) {
      expect(parseSessionCount(raw)).toBeNull()
    }
  })
})

describe('sessionNumbers', () => {
  const at = (local: string) => berlinToUtc(local)

  it('numbers the dated Sessions 1…n in Date order', () => {
    const dates = [at('2026-11-08T19:00'), at('2026-11-07T20:00'), at('2026-11-09T18:00')]
    expect(sessionNumbers(dates)).toEqual([2, 1, 3])
  })

  it('leaves Sessions without a Date unnumbered and does not count them in the order', () => {
    expect(sessionNumbers([null, at('2026-11-08T19:00'), null, at('2026-11-07T20:00')])).toEqual([null, 2, null, 1])
  })

  it('keeps the given order for equal Dates', () => {
    expect(sessionNumbers([at('2026-11-07T20:00'), at('2026-11-07T20:00')])).toEqual([1, 2])
  })

  it('gives no numbers when no Session has a Date', () => {
    expect(sessionNumbers([null, null])).toEqual([null, null])
    expect(sessionNumbers([])).toEqual([])
  })
})

describe('missingDates', () => {
  it('counts the Sessions without a Date', () => {
    expect(missingDates([null, new Date(), null])).toBe(2)
    expect(missingDates([new Date()])).toBe(0)
    expect(missingDates([])).toBe(0)
  })
})

describe('openSlots', () => {
  const slots = [{ id: 'fri' }, { id: 'sat' }, { id: 'sun' }]

  it('leaves out the Slots that a Session refers to, and keeps the order', () => {
    expect(openSlots(slots, ['sat', null])).toEqual([{ id: 'fri' }, { id: 'sun' }])
  })

  it('keeps every Slot while no Session has a Date', () => {
    expect(openSlots(slots, [null, null])).toEqual(slots)
  })
})
