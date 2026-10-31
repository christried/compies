import { describe, expect, it } from 'vitest'
import { dateBlockedKey, eventPageState, pagePill, pollingNumber, shownSessionNumbers, type PageInput } from '../../app/utils/event-page'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the order of the blocks
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too.

const settings = { format: 'teams', teamCount: 2, teamSize: 2 } as PageInput['settings']

const dated = (id: string, number: number | null, startsAt: string, times: { startedAt?: string, endedAt?: string } = {}): PageInput['sessions'][number] => ({
  id, number, startsAt, previousStartsAt: null, notes: [], startedAt: times.startedAt ?? null, endedAt: times.endedAt ?? null,
})
const undated = (id: string): PageInput['sessions'][number] => ({ id, number: null, startsAt: null, previousStartsAt: null, startedAt: null, endedAt: null })

function input(sessions: PageInput['sessions'], fields: Partial<PageInput> = {}): PageInput {
  return { settings, sessions, missingDates: sessions.filter(session => session.startsAt === null).length, runningSessionId: null, ...fields }
}

const SAT = '2090-10-25T18:30:00.000Z'
const SUN = '2090-10-26T18:30:00.000Z'

describe('eventPageState', () => {
  it('is setup without settings, whatever the Sessions are', () => {
    expect(eventPageState(input([dated('a', null, SAT)], { settings: null })).kind).toBe('setup')
  })

  it('is the poll while no Session is dated; one Session has no numbers', () => {
    expect(eventPageState(input([undated('a')]))).toMatchObject({ kind: 'poll', total: 1, pollNumber: null, next: null, running: null, lastEnded: null })
  })

  it('numbers the Session that polls first when several Sessions have no Date', () => {
    expect(eventPageState(input([undated('a'), undated('b')]))).toMatchObject({ kind: 'poll', total: 2, pollNumber: 1 })
  })

  it('is teams once a Session is dated, with its number and Date', () => {
    expect(eventPageState(input([dated('a', 1, SAT), dated('b', 2, SUN)]))).toMatchObject({
      kind: 'teams', total: 2, pollNumber: null, next: { number: 1, startsAt: SAT },
    })
  })

  it('names the Session that still polls after the dated ones', () => {
    expect(eventPageState(input([dated('a', 1, SAT), undated('b')]))).toMatchObject({ kind: 'teams', next: { number: 1 }, pollNumber: 2 })
  })

  it('takes the earliest dated Session that has not started as the next one', () => {
    const state = eventPageState(input([dated('a', 1, SAT, { startedAt: SAT, endedAt: SAT }), dated('c', 3, '2090-11-02T18:30:00.000Z'), dated('b', 2, SUN)]))

    expect(state).toMatchObject({ kind: 'between', next: { number: 2 } })
  })

  it('is running while a Session runs, with its number and when it started', () => {
    const state = eventPageState(input([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { runningSessionId: 'a' }))

    expect(state).toMatchObject({ kind: 'running', total: 2, running: { number: 1, startedAt: SAT }, next: { number: 2 } })
  })

  it('is between Sessions after one ended: the next one dated, or one that still waits for a Date', () => {
    const ended = dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })

    expect(eventPageState(input([ended, dated('b', 2, SUN)]))).toMatchObject({ kind: 'between', lastEnded: { number: 1 }, next: { number: 2, startsAt: SUN }, pollNumber: null })
    expect(eventPageState(input([ended, undated('b')]))).toMatchObject({ kind: 'between', lastEnded: { number: 1 }, next: null, pollNumber: 2 })
  })

  it('names the last Session that ended', () => {
    const state = eventPageState(input([
      dated('a', 1, SAT, { startedAt: SAT, endedAt: '2090-10-25T22:00:00.000Z' }),
      dated('b', 2, SUN, { startedAt: SUN, endedAt: '2090-10-26T22:00:00.000Z' }),
    ]))

    expect(state).toMatchObject({ kind: 'done', lastEnded: { number: 2 }, next: null, pollNumber: null })
  })

  it('follows the Sessions in the header pill, not the Event\'s Phase: poll, Date stands, running, over (#166)', () => {
    const ended = dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })
    const pill = (sessions: PageInput['sessions'], fields: Partial<PageInput> = {}) => pagePill(eventPageState(input(sessions, fields)))

    expect(pill([undated('a')])).toEqual({ phase: 'poll', ended: false })
    expect(pill([dated('a', 1, SAT), undated('b')])).toEqual({ phase: 'date_set', ended: false })
    expect(pill([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { runningSessionId: 'a' })).toEqual({ phase: 'running', ended: false })
    expect(pill([ended, dated('b', 2, SUN)])).toEqual({ phase: 'date_set', ended: false })
    expect(pill([ended, undated('b')])).toEqual({ phase: 'poll', ended: false })
    expect(pill([ended])).toEqual({ phase: 'finished', ended: true })
  })

  it('leaves the pill to the Event\'s own Phase in setup', () => {
    expect(pagePill(eventPageState(input([undated('a')], { settings: null })))).toBeNull()
  })

  it('is done for the only Session once it ended, without numbers', () => {
    const state = eventPageState(input([dated('a', null, SAT, { startedAt: SAT, endedAt: SUN })]))

    expect(state).toMatchObject({ kind: 'done', total: 1, lastEnded: { number: null } })
  })
})

describe('pollingNumber', () => {
  it('numbers the polling Sessions after the dated ones, in list order (#201)', () => {
    const sessions = [dated('a', 1, SAT), undated('b'), dated('c', 2, SUN), undated('d')]

    expect(pollingNumber(sessions, 2, 1)).toBe(3)
    expect(pollingNumber(sessions, 2, 2)).toBe(4)
    expect(pollingNumber(sessions, 2, 3)).toBeNull()
  })

  it('is null for the only Session of an Event, polling or not', () => {
    expect(pollingNumber([undated('a')], 1)).toBeNull()
  })

  it('is null when no Session polls', () => {
    expect(pollingNumber([dated('a', 1, SAT), dated('b', 2, SUN)], 0)).toBeNull()
  })
})

describe('shownSessionNumbers', () => {
  it('numbers the polling Sessions of the list after the dated one, in list order (#201)', () => {
    expect(shownSessionNumbers([dated('a', 1, SAT), undated('b'), undated('c')], 2)).toEqual([1, 2, 3])
  })

  it('shows the only Session of an Event with no number', () => {
    expect(shownSessionNumbers([undated('a')], 1)).toEqual([null])
  })
})

describe('dateBlockedKey', () => {
  it('says why Termin festlegen cannot set a Date: no Slot at all, or none in the future', () => {
    expect(dateBlockedKey([])).toBe('mvp.set.noSlots')
    expect(dateBlockedKey([{ past: true }, { past: true }])).toBe('mvp.set.noFutureSlot')
  })

  it('is null while one open future Slot can become a Date', () => {
    expect(dateBlockedKey([{ past: true }, { past: false }])).toBeNull()
  })
})
