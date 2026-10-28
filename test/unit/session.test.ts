import { describe, expect, it } from 'vitest'
import { hasDateAt, missingDates, numberedSessions, openPoll, parseSessionCount, sequenceRaises } from '../../server/domain/session'
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

describe('numberedSessions', () => {
  const at = (local: string) => berlinToUtc(local)
  const shown = (sessions: { id: string, startsAt: Date | null }[]) => numberedSessions(sessions).map(session => [session.id, session.number])

  it('numbers the dated Sessions 1…n in Date order and puts them in that order', () => {
    expect(shown([
      { id: 'a', startsAt: at('2026-11-08T19:00') },
      { id: 'b', startsAt: at('2026-11-07T20:00') },
      { id: 'c', startsAt: at('2026-11-09T18:00') },
    ])).toEqual([['b', 1], ['a', 2], ['c', 3]])
  })

  it('puts the Sessions without a Date after the dated ones, in the given order, with no number', () => {
    expect(shown([
      { id: 'a', startsAt: null },
      { id: 'b', startsAt: at('2026-11-08T19:00') },
      { id: 'c', startsAt: null },
      { id: 'd', startsAt: at('2026-11-07T20:00') },
    ])).toEqual([['d', 1], ['b', 2], ['a', null], ['c', null]])
  })

  it('keeps the given order for equal Dates', () => {
    expect(shown([
      { id: 'a', startsAt: at('2026-11-07T20:00') },
      { id: 'b', startsAt: at('2026-11-07T20:00') },
    ])).toEqual([['a', 1], ['b', 2]])
  })

  it('gives the Session of an Event with one Session no number, since there is nothing to tell apart', () => {
    expect(shown([{ id: 'a', startsAt: at('2026-11-07T20:00') }])).toEqual([['a', null]])
  })

  it('numbers a single dated Session once the Event has several Sessions', () => {
    expect(shown([{ id: 'a', startsAt: at('2026-11-07T20:00') }, { id: 'b', startsAt: null }])).toEqual([['a', 1], ['b', null]])
  })

  it('gives no numbers when no Session has a Date', () => {
    expect(shown([{ id: 'a', startsAt: null }, { id: 'b', startsAt: null }])).toEqual([['a', null], ['b', null]])
    expect(shown([])).toEqual([])
  })

  it('keeps the other fields of each Session', () => {
    const [session] = numberedSessions([{ id: 'a', startsAt: null, slotId: 'fri' }])
    expect(session).toEqual({ id: 'a', startsAt: null, slotId: 'fri', number: null })
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
    // a moves after c: it goes from 1 to 3, b and c each move up one number. They come in their new order.
    const after = [{ id: 'a', startsAt: at('2026-11-10T20:00') }, { id: 'b', startsAt: day2 }, { id: 'c', startsAt: day3 }]
    expect(sequenceRaises(before, after)).toEqual(['b', 'c', 'a'])
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
    expect(sequenceRaises(before, after)).toEqual(['b', 'a'])
    expect(sequenceRaises([{ id: 'a', startsAt: null }], [{ id: 'a', startsAt: null }])).toEqual([])
  })

  // The calendar title names the number only while the Event has several Sessions (#67), so crossing from one
  // Session to two, or back, changes the title of the dated Session, and a re-import must replace it.
  it('raises the dated Session when a second Session joins, since its title gains the number', () => {
    expect(sequenceRaises([{ id: 'a', startsAt: day1 }], [{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: null }])).toEqual(['a'])
    expect(sequenceRaises([{ id: 'a', startsAt: day1 }], [{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: day2 }])).toEqual(['a'])
  })

  it('raises the Session that stays when the Event goes back to one Session, since its title loses the number', () => {
    expect(sequenceRaises([{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: day2 }], [{ id: 'a', startsAt: day1 }])).toEqual(['a'])
    expect(sequenceRaises([{ id: 'a', startsAt: day1 }, { id: 'b', startsAt: null }], [{ id: 'a', startsAt: day1 }])).toEqual(['a'])
  })

  it('raises nothing when the only Session is undated on both sides of the change', () => {
    expect(sequenceRaises([{ id: 'a', startsAt: null }], [{ id: 'a', startsAt: null }, { id: 'b', startsAt: day1 }])).toEqual([])
  })
})

describe('missingDates', () => {
  it('counts the Sessions without a Date', () => {
    expect(missingDates([null, new Date(), null])).toBe(2)
    expect(missingDates([new Date()])).toBe(0)
    expect(missingDates([])).toBe(0)
  })
})

describe('openPoll', () => {
  const slots = [{ id: 'fri' }, { id: 'sat' }, { id: 'sun' }]
  const annFri = { slotId: 'fri', userId: 'ann', value: 'yes' as const }
  const annSat = { slotId: 'sat', userId: 'ann', value: 'no' as const }
  const benSat = { slotId: 'sat', userId: 'ben', value: 'maybe' as const }
  const benSun = { slotId: 'sun', userId: 'ben', value: 'yes' as const }
  const votes = [annFri, annSat, benSat, benSun]

  it('leaves out the Slots that a Session refers to with their Votes, and keeps the order', () => {
    expect(openPoll(slots, ['sat', null], votes)).toEqual({
      slots: [{ id: 'fri' }, { id: 'sun' }],
      votes: [annFri, benSun],
    })
  })

  it('keeps every Slot and Vote while no Session has a Date', () => {
    expect(openPoll(slots, [null, null], votes)).toEqual({ slots, votes })
  })
})

describe('hasDateAt', () => {
  const sessions = [
    { id: 'a', startsAt: berlinToUtc('2026-11-07T20:00') },
    { id: 'b', startsAt: null },
  ]

  it('finds a Session whose set Date is this instant', () => {
    expect(hasDateAt(sessions, berlinToUtc('2026-11-07T20:00'))).toBe(true)
    expect(hasDateAt(sessions, berlinToUtc('2026-11-08T20:00'))).toBe(false)
  })

  it('ignores the excepted Session, so a Session may keep its own Date', () => {
    expect(hasDateAt(sessions, berlinToUtc('2026-11-07T20:00'), 'a')).toBe(false)
  })
})
