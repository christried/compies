import { describe, expect, it } from 'vitest'
import { dockLayout, hostDockState, setBlockedKey, type DockInput } from '../../app/utils/host-dock'

// The state of the Host dock (#164, 11-event-seite § HostDock): which primary action the Event offers now, derived from
// the Event read, and which actions sit where (the layout, review 1.4 A4, #228).

const settings = { format: 'teams', teamCount: 2, teamSize: 2, selectionMode: 'lucky_wheel' } as DockInput['settings']
const hostPick = { ...settings, selectionMode: 'admin_pick' } as DockInput['settings']
const RUNNING = [{ id: 'a', number: null, startsAt: '2090-10-30T19:00:00.000Z', previousStartsAt: null, notes: [], startedAt: '2090-10-30T19:30:00.000Z', endedAt: null }]

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
    event: { phase: 'poll' },
    setGame: null,
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

  it('is running while a Session runs: Rad drehen in the Lucky Wheel, with that Session\'s number', () => {
    const state = hostDockState(input({
      sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z' }), dated('b', 2)],
      start: { sessionId: 'b', number: 2, rejection: 'session_running' },
    }))

    expect(state).toMatchObject({ kind: 'running', primary: 'spin', number: 1 })
  })

  it('says no number for the only Session of an Event', () => {
    const state = hostDockState(input({ sessions: [dated('a', null, { startedAt: '2090-10-30T19:30:00.000Z' })], start: { sessionId: null, number: null, rejection: 'session_running' } }))

    expect(state).toMatchObject({ kind: 'running', primary: 'spin', number: null })
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

describe('the primary of a running Session (#228)', () => {
  it('is Nächstes Spiel setzen under Host pick, with the reason the rule gives', () => {
    expect(hostDockState(input({ settings: hostPick, sessions: RUNNING, setGame: { rejection: null, spinRejection: null, left: [] } }))).toMatchObject({ kind: 'running', primary: 'setGame', setRejection: null })
    expect(hostDockState(input({ settings: hostPick, sessions: RUNNING, setGame: { rejection: 'teams_uneven', spinRejection: 'teams_uneven', left: [] } }))).toMatchObject({ primary: 'setGame', setRejection: 'teams_uneven' })
  })

  it('is Rad drehen in the Lucky Wheel, with the reason the spin rule gives, where setting waits in Mehr (#229)', () => {
    expect(hostDockState(input({ settings, sessions: RUNNING, setGame: { rejection: null, spinRejection: null, left: [] } }))).toMatchObject({ kind: 'running', primary: 'spin', spinRejection: null })
    expect(hostDockState(input({ settings, sessions: RUNNING, setGame: { rejection: null, spinRejection: 'pool_empty', left: [] } }))).toMatchObject({ primary: 'spin', spinRejection: 'pool_empty' })
    expect(hostDockState(input({ settings, sessions: RUNNING, setGame: { rejection: 'round_being_drawn', spinRejection: 'round_being_drawn', left: [] } }))).toMatchObject({ primary: 'spin', spinRejection: 'round_being_drawn', setRejection: 'round_being_drawn' })
  })

  it('has no spin reason under Host pick: the wheel is not there', () => {
    expect(hostDockState(input({ settings: hostPick, sessions: RUNNING, setGame: { rejection: null, spinRejection: 'no_wheel', left: [] } }))).toMatchObject({ primary: 'setGame', spinRejection: null })
  })
})

describe('dockLayout', () => {
  const layout = (fields: Partial<DockInput>, pollOpen = false) => dockLayout(hostDockState(input(fields)), pollOpen)

  it('puts Event einrichten first while the Event is not set up, with the Dates in Mehr', () => {
    expect(layout({ settings: null }, true)).toEqual({ primary: ['settings'], secondary: ['invite'], more: ['setDate', 'slots'] })
    expect(layout({ settings: null })).toEqual({ primary: ['settings'], secondary: ['invite'], more: [] })
  })

  it('puts Termin festlegen first while no Session is dated', () => {
    expect(layout({ sessions: [undated('a')], start: { sessionId: null, number: null, rejection: 'no_dated_session' } }, true))
      .toEqual({ primary: ['setDate'], secondary: ['invite'], more: ['slots', 'settings'] })
  })

  it('puts Session starten first with Termin festlegen beside it while another Session polls', () => {
    expect(layout({ sessions: [dated('a', 1), undated('b')] }, true)).toEqual({ primary: ['start'], secondary: ['setDate', 'invite'], more: ['slots', 'settings'] })
    expect(layout({ sessions: [dated('a', 1), dated('b', 2)] })).toEqual({ primary: ['start'], secondary: ['invite'], more: ['settings'] })
  })

  it('under Host pick puts Nächstes Spiel setzen first in a running Session, with Session beenden beside it', () => {
    expect(layout({ settings: hostPick, sessions: RUNNING })).toEqual({ primary: ['setGame'], secondary: ['end', 'invite'], more: ['countdown', 'settings'] })
  })

  it('in the Lucky Wheel puts Rad drehen first, Session beenden beside it and Nächstes Spiel setzen in Mehr (#229)', () => {
    expect(layout({ settings, sessions: RUNNING })).toEqual({ primary: ['spin'], secondary: ['end', 'invite'], more: ['setGame', 'countdown', 'settings'] })
    expect(layout({ settings, sessions: [...RUNNING, undated('b')] }, true)).toEqual({ primary: ['spin'], secondary: ['end', 'invite'], more: ['setGame', 'setDate', 'slots', 'countdown', 'settings'] })
  })

  it('puts Countdown in Mehr in both running layouts (#236), and in no other state', () => {
    expect(layout({ settings: hostPick, sessions: RUNNING }).more).toContain('countdown')
    expect(layout({ settings, sessions: RUNNING }).more).toContain('countdown')
    expect(layout({ sessions: [dated('a', 1), dated('b', 2)] }).more).not.toContain('countdown')
    expect(layout({ sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' })], start: { sessionId: null, number: null, rejection: 'no_dated_session' } }).more).not.toContain('countdown')
  })

  it('has only Einladen and Einstellungen after the last Session', () => {
    const ended = { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }

    expect(layout({ sessions: [dated('a', 1, ended)], start: { sessionId: null, number: null, rejection: 'no_dated_session' } })).toEqual({ primary: [], secondary: ['invite'], more: ['settings'] })
  })
})

describe('setBlockedKey', () => {
  it('uses the start rule\'s words for the teams and the dock\'s own for the rest', () => {
    expect(setBlockedKey('teams_uneven')).toBe('dock.startBlocked.teams_uneven')
    expect(setBlockedKey('teams_empty')).toBe('dock.startBlocked.teams_empty')
    expect(setBlockedKey('game_count_reached')).toBe('dock.setBlocked.game_count_reached')
    expect(setBlockedKey('round_being_drawn')).toBe('dock.setBlocked.round_being_drawn')
    expect(setBlockedKey('no_running_session')).toBe('dock.setBlocked.no_running_session')
    expect(setBlockedKey('no_wheel')).toBe('dock.setBlocked.no_wheel')
    expect(setBlockedKey('pool_empty')).toBe('dock.setBlocked.pool_empty')
  })
})
