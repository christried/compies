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
  const shown = (sessions: { id: string, startsAt: Date | null, startedAt?: Date | null }[]) => numberedSessions(sessions.map(session => ({ startedAt: null, ...session }))).map(session => [session.id, session.number])

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

  // Once a Session has started, its number never changes (#164): started ones come first, in the order they started.
  it('numbers the started Sessions first, in start order, then the waiting dated ones by Date', () => {
    // A (4 Dec) started on 31 Oct; B is then dated 15 Nov, before A's Date: A stays 1.
    expect(shown([
      { id: 'b', startsAt: at('2026-11-15T20:00') },
      { id: 'a', startsAt: at('2026-12-04T20:00'), startedAt: at('2026-10-31T20:00') },
      { id: 'c', startsAt: at('2026-11-20T20:00') },
      { id: 'd', startsAt: null },
    ])).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', null]])
  })

  it('keeps two started Sessions in their start order, whatever their Dates', () => {
    expect(shown([
      { id: 'a', startsAt: at('2026-11-01T20:00'), startedAt: at('2026-11-08T20:00') },
      { id: 'b', startsAt: at('2026-11-22T20:00'), startedAt: at('2026-11-01T20:00') },
    ])).toEqual([['b', 1], ['a', 2]])
  })

  it('does not renumber anything when the next Session starts', () => {
    const waiting = [
      { id: 'a', startsAt: at('2026-11-07T20:00') },
      { id: 'b', startsAt: at('2026-11-08T20:00') },
      { id: 'c', startsAt: at('2026-11-09T20:00') },
    ]
    const before = shown(waiting)
    // The start picks the earliest dated waiting Session, which already holds the next number.
    const after = shown(waiting.map(session => session.id === 'a' ? { ...session, startedAt: at('2026-11-07T20:30') } : session))
    expect(after).toEqual(before)
  })

  it('keeps the other fields of each Session', () => {
    const [session] = numberedSessions([{ id: 'a', startsAt: null, startedAt: null, slotId: 'fri' }])
    expect(session).toEqual({ id: 'a', startsAt: null, startedAt: null, slotId: 'fri', number: null })
  })
})

describe('sequenceRaises', () => {
  const at = (local: string) => berlinToUtc(local)
  const day1 = at('2026-11-07T20:00')
  const day2 = at('2026-11-08T20:00')
  const day3 = at('2026-11-09T20:00')

  it('raises nothing when no Date or number changes', () => {
    const sessions = [{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: day2, startedAt: null }]
    expect(sequenceRaises(sessions, sessions)).toEqual([])
  })

  it('raises the Session that moved and every Session whose number changed with it', () => {
    const before = [{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: day2, startedAt: null }, { id: 'c', startsAt: day3, startedAt: null }]
    // a moves after c: it goes from 1 to 3, b and c each move up one number. They come in their new order.
    const after = [{ id: 'a', startsAt: at('2026-11-10T20:00'), startedAt: null }, { id: 'b', startsAt: day2, startedAt: null }, { id: 'c', startsAt: day3, startedAt: null }]
    expect(sequenceRaises(before, after)).toEqual(['b', 'c', 'a'])
  })

  it('raises only the moved Session when it keeps its place in the order', () => {
    const before = [{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: day2, startedAt: null }, { id: 'c', startsAt: day3, startedAt: null }]
    const after = [{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: at('2026-11-08T21:00'), startedAt: null }, { id: 'c', startsAt: day3, startedAt: null }]
    expect(sequenceRaises(before, after)).toEqual(['b'])
  })

  it('leaves out a Session that is new or was removed, since it has no entry to replace', () => {
    const before = [{ id: 'a', startsAt: day2, startedAt: null }, { id: 'b', startsAt: day3, startedAt: null }]
    // c is new and takes number 1, so a goes from 1 to 2; b is gone.
    const after = [{ id: 'c', startsAt: day1, startedAt: null }, { id: 'a', startsAt: day2, startedAt: null }]
    expect(sequenceRaises(before, after)).toEqual(['a'])
  })

  it('raises a Session that gets a Date after it was undated, and never an undated one', () => {
    const before = [{ id: 'a', startsAt: day2, startedAt: null }, { id: 'b', startsAt: null, startedAt: null }]
    const after = [{ id: 'a', startsAt: day2, startedAt: null }, { id: 'b', startsAt: day1, startedAt: null }]
    expect(sequenceRaises(before, after)).toEqual(['b', 'a'])
    expect(sequenceRaises([{ id: 'a', startsAt: null, startedAt: null }], [{ id: 'a', startsAt: null, startedAt: null }])).toEqual([])
  })

  // The calendar title names the number only while the Event has several Sessions (#67), so crossing from one
  // Session to two, or back, changes the title of the dated Session, and a re-import must replace it.
  it('raises the dated Session when a second Session joins, since its title gains the number', () => {
    expect(sequenceRaises([{ id: 'a', startsAt: day1, startedAt: null }], [{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: null, startedAt: null }])).toEqual(['a'])
    expect(sequenceRaises([{ id: 'a', startsAt: day1, startedAt: null }], [{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: day2, startedAt: null }])).toEqual(['a'])
  })

  it('raises the Session that stays when the Event goes back to one Session, since its title loses the number', () => {
    expect(sequenceRaises([{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: day2, startedAt: null }], [{ id: 'a', startsAt: day1, startedAt: null }])).toEqual(['a'])
    expect(sequenceRaises([{ id: 'a', startsAt: day1, startedAt: null }, { id: 'b', startsAt: null, startedAt: null }], [{ id: 'a', startsAt: day1, startedAt: null }])).toEqual(['a'])
  })

  it('leaves a started Session alone when another Session is dated before it, since its number holds (#164)', () => {
    const started = { id: 'a', startsAt: day3, startedAt: day1 }
    const before = [started, { id: 'b', startsAt: null, startedAt: null }]
    const after = [started, { id: 'b', startsAt: day2, startedAt: null }]
    // b gets a Date earlier than a's, but a is started and stays 1: only b (new number 2) is raised.
    expect(sequenceRaises(before, after)).toEqual(['b'])
  })

  it('raises nothing when the only Session is undated on both sides of the change', () => {
    expect(sequenceRaises([{ id: 'a', startsAt: null, startedAt: null }], [{ id: 'a', startsAt: null, startedAt: null }, { id: 'b', startsAt: day1, startedAt: null }])).toEqual([])
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
