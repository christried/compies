import { describe, expect, it } from 'vitest'
import { missingDates, openSlots, parseSessionCount, sequenceRaises, sessionNumbers } from '../../server/domain/session'
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

describe('sequenceRaises', () => {
  const at = (local: string) => berlinToUtc(local)
  const day1 = at('2026-11-07T20:00')
  const day2 = at('2026-11-08T20:00')
  const day3 = at('2026-11-09T20:00')

  it('raises nothing when no Date or number changes', () => {
    const sessions = [{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: day2 }]
    expect(sequenceRaises(sessions, sessions)).toEqual([])
  })

  it('raises the Session that moved and every Session whose number changed with it', () => {
    const before = [{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: day2 }, { id: 'c', startsAt: day3 }]
    // a moves after c: it goes from 1 to 3, b and c each move up one number.
    const after = [{ id: 'a', startsAt: at('2026-11-10T20:00') }, { id: 'b', startsAt: day2 }, { id: 'c', startsAt: day3 }]
    expect(sequenceRaises(before, after)).toEqual(['a', 'b', 'c'])
  })

  it('raises only the moved Session when it keeps its place in the order', () => {
    const before = [{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: day2 }, { id: 'c', startsAt: day3 }]
    const after = [{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: at('2026-11-08T21:00') }, { id: 'c', startsAt: day3 }]
    expect(sequenceRaises(before, after)).toEqual(['b'])
  })

  it('leaves out a Session that is new or was removed, since it has no entry to replace', () => {
    const before = [{ id: 'a', startsAt: day2 }, { id: 'b', startsAt: day3 }]
    // c is new and takes number 1, so a goes from 1 to 2; b is gone.
    const after = [{ id: 'c', startsAt: day1 }, { id: 'a', startsAt: day2 }]
    expect(sequenceRaises(before, after)).toEqual(['a'])
  })

  it('raises a Session that gets a Date after it was undated, and never an undated one', () => {
    const before = [{ id: 'a', startsAt: day2 }, { id: 'b', startsAt: null }]
    const after = [{ id: 'a', startsAt: day2 }, { id: 'b', startsAt: day1 }]
    expect(sequenceRaises(before, after)).toEqual(['a', 'b'])
    expect(sequenceRaises([{ id: 'a', startsAt: null }], [{ id: 'a', startsAt: null }])).toEqual([])
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
