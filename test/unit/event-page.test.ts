import { describe, expect, it } from 'vitest'
import { eventPageState, type PageInput } from '../../app/utils/event-page'

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

  it('is done for the only Session once it ended, without numbers', () => {
    const state = eventPageState(input([dated('a', null, SAT, { startedAt: SAT, endedAt: SUN })]))

    expect(state).toMatchObject({ kind: 'done', total: 1, lastEnded: { number: null } })
  })
})
