import { describe, expect, it } from 'vitest'
import { hostDockState, type DockInput } from '../../app/utils/host-dock'

// The state of the Host dock (#164, 11-event-seite § HostDock): which primary action the Event offers now, derived from
// the Event read.

const settings = { format: 'teams', teamCount: 2, teamSize: 2 } as DockInput['settings']

const dated = (id: string, number: number | null, times: { startedAt?: string, endedAt?: string } = {}): DockInput['sessions'][number] => ({
  id, number, startsAt: '2090-10-30T19:00:00.000Z', previousStartsAt: null, notes: [], startedAt: times.startedAt ?? null, endedAt: times.endedAt ?? null,
})
const undated = (id: string): DockInput['sessions'][number] => ({ id, number: null, startsAt: null, previousStartsAt: null, startedAt: null, endedAt: null })

function input(fields: Partial<DockInput>): DockInput {
  const sessions = fields.sessions ?? [dated('a', null)]
  return {
    settings,
    sessions,
    missingDates: sessions.filter(session => session.startsAt === null).length,
    runningSessionId: null,
    start: { sessionId: 'a', number: null, rejection: null },
    ...fields,
  }
}

describe('hostDockState', () => {
  it('is setup without settings: Event einrichten comes first', () => {
    expect(hostDockState(input({ settings: null }))).toMatchObject({ kind: 'setup', primary: 'setup' })
  })

  it('is the poll while no Session is dated: Termin festlegen', () => {
    const state = hostDockState(input({ sessions: [undated('a')], start: { sessionId: null, number: null, rejection: 'no_dated_session' } }))

    expect(state).toMatchObject({ kind: 'poll', primary: 'setDate', pollNumber: null })
  })

  it('offers Session starten once a Session is dated, with the number the server shows, and no second action while nothing polls', () => {
    const state = hostDockState(input({ sessions: [dated('a', 1), dated('b', 2)], start: { sessionId: 'a', number: 1, rejection: null } }))

    expect(state).toMatchObject({ kind: 'teams', primary: 'start', number: 1, startRejection: null, pollNumber: null })
  })

  it('names the Session that still polls, as the next number after the dated ones', () => {
    const state = hostDockState(input({ sessions: [dated('a', 1), undated('b')], start: { sessionId: 'a', number: 1, rejection: null } }))

    expect(state).toMatchObject({ kind: 'teams', primary: 'start', number: 1, pollNumber: 2 })
  })

  it('carries the reason the start is blocked', () => {
    const state = hostDockState(input({ start: { sessionId: 'a', number: null, rejection: 'teams_uneven' } }))

    expect(state).toMatchObject({ kind: 'teams', primary: 'start', startRejection: 'teams_uneven' })
  })

  it('is running while a Session runs: Session beenden, with that Session\'s number', () => {
    const state = hostDockState(input({
      sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z' }), dated('b', 2)],
      runningSessionId: 'a',
      start: { sessionId: 'b', number: 2, rejection: 'session_running' },
    }))

    expect(state).toMatchObject({ kind: 'running', primary: 'end', number: 1 })
  })

  it('says no number for the only Session of an Event', () => {
    const state = hostDockState(input({ sessions: [dated('a', null, { startedAt: '2090-10-30T19:30:00.000Z' })], runningSessionId: 'a', start: { sessionId: null, number: null, rejection: 'session_running' } }))

    expect(state).toMatchObject({ kind: 'running', primary: 'end', number: null })
  })

  it('is between Sessions when one ended and another is dated: the next one starts', () => {
    const state = hostDockState(input({
      sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }), dated('b', 2)],
      start: { sessionId: 'b', number: 2, rejection: null },
    }))

    expect(state).toMatchObject({ kind: 'between', primary: 'start', number: 2, pollNumber: null })
  })

  it('is between Sessions with Termin für Session m while another one polls', () => {
    const state = hostDockState(input({
      sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }), dated('b', 2), undated('c')],
      start: { sessionId: 'b', number: 2, rejection: null },
    }))

    expect(state).toMatchObject({ kind: 'between', primary: 'start', number: 2, pollNumber: 3 })
  })

  it('offers the poll\'s Date as the primary when a Session ended and only an undated one is left', () => {
    const state = hostDockState(input({
      sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }), undated('b')],
      start: { sessionId: null, number: null, rejection: 'no_dated_session' },
    }))

    expect(state).toMatchObject({ kind: 'between', primary: 'setDate', pollNumber: 2 })
  })

  it('has no primary after the last Session ended (the Event ends in 1.6)', () => {
    const state = hostDockState(input({
      sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }), dated('b', 2, { startedAt: '2090-11-06T19:30:00.000Z', endedAt: '2090-11-06T22:00:00.000Z' })],
      start: { sessionId: null, number: null, rejection: 'no_dated_session' },
    }))

    expect(state).toMatchObject({ kind: 'done', primary: null })
  })
})
