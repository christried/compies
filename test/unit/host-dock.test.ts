import { describe, expect, it } from 'vitest'
import { GAME_ACTIONS, ceremonyBlockedKey, coinBlockedKey, dockLayout, hostDockState, lastGameBlockedKey, setBlockedKey, type DockInput, type DockKey, type DockLayout } from '../../app/utils/host-dock'

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
    wheel: null,
    countdown: null,
    coin: null,
    ceremony: null,
    start: { sessionId: 'a', number: null, rejection: null },
    end: null,
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

  it('has no primary after the last Session ended while the Event cannot be finished (#277)', () => {
    const state = hostDockState(input({
      sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }), dated('b', 2, { startedAt: '2090-11-06T19:30:00.000Z', endedAt: '2090-11-06T22:00:00.000Z' })],
      start: { sessionId: null, number: null, rejection: 'no_dated_session' },
    }))

    expect(state).toMatchObject({ kind: 'done', primary: null })
  })
})

// The end (#277): once the Rounds with a Result reach the Game count and first place is not shared, the Host finishes the Event.
describe('the primary when the Event can be finished (#277)', () => {
  const ENDED = { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }
  const end = (fields: Partial<NonNullable<DockInput['end']>> = {}): DockInput['end'] => ({ played: 3, gameCount: 3, complete: true, tie: null, finish: { rejection: null }, lastGame: null, ...fields })
  const NO_DATED = { sessionId: null, number: null, rejection: 'no_dated_session' as const }

  it('is Event abschließen in a running Session, with that Session\'s number for „Session n beenden“', () => {
    const state = hostDockState(input({ sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z' }), dated('b', 2)], end: end() }))

    expect(state).toMatchObject({ kind: 'running', primary: 'finish', number: 1 })
  })

  it('is Event abschließen between Sessions and after the last one', () => {
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED), dated('b', 2)], end: end() }))).toMatchObject({ kind: 'between', primary: 'finish' })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: end() }))).toMatchObject({ kind: 'done', primary: 'finish' })
  })

  it('is not offered while Results are missing, or the Standings call for something else', () => {
    const sessions = [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z' })]

    expect(hostDockState(input({ sessions, end: end({ complete: false, finish: { rejection: 'results_missing' } }) }))).toMatchObject({ primary: 'spin' })
    expect(hostDockState(input({ sessions, end: end({ finish: { rejection: 'standings_changed' } }) }))).toMatchObject({ primary: 'spin' })
  })

  it('is not offered to a Member, who has no finish object', () => {
    expect(hostDockState(input({ sessions: RUNNING, end: end({ finish: null }) }))).toMatchObject({ primary: 'spin' })
  })

  // A Tie has its own primary (#278): the Host holds „Unentschieden beenden“ or adds a last game. A Session that has not started cannot hold Results,
  // so `teams` has no Tie state (a started Session is never removed): the dock and the page's banner agree on running, between and done.
  it('is Unentschieden beenden in a Tie: in a running Session (with its number), between Sessions and after the last one', () => {
    const tie = end({ tie: [1, 2] })

    expect(hostDockState(input({ sessions: [dated('a', 1, { startedAt: '2090-10-30T19:30:00.000Z' }), dated('b', 2)], end: tie }))).toMatchObject({ kind: 'running', primary: 'finishTie', number: 1 })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED), dated('b', 2)], end: tie }))).toMatchObject({ kind: 'between', primary: 'finishTie' })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: tie }))).toMatchObject({ kind: 'done', primary: 'finishTie' })
  })

  it('keeps the old primary in a Tie the finish rule refuses, and for a Member', () => {
    expect(hostDockState(input({ sessions: RUNNING, end: end({ tie: [1, 2], finish: { rejection: 'wrong_phase' } }) }))).toMatchObject({ primary: 'spin' })
    expect(hostDockState(input({ sessions: RUNNING, end: end({ tie: [1, 2], finish: null }) }))).toMatchObject({ primary: 'spin' })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: end({ tie: [1, 2], finish: null }) }))).toMatchObject({ kind: 'done', primary: null })
  })

  it('stays Event abschließen with a sole leader, whatever the last game says', () => {
    expect(hostDockState(input({ sessions: RUNNING, end: end({ lastGame: { rejection: 'no_tie' } }) }))).toMatchObject({ primary: 'finish' })
  })

  it('carries the reason the last game cannot be added through: the maximum, or none', () => {
    expect(hostDockState(input({ sessions: RUNNING, end: end({ tie: [1, 2], lastGame: { rejection: 'game_count_range' } }) }))).toMatchObject({ primary: 'finishTie', lastGameRejection: 'game_count_range' })
    expect(hostDockState(input({ sessions: RUNNING, end: end({ tie: [1, 2], lastGame: { rejection: null } }) }))).toMatchObject({ primary: 'finishTie', lastGameRejection: null })
    expect(hostDockState(input({ sessions: RUNNING, end: end() }))).toMatchObject({ lastGameRejection: null })
  })

  it('has Siegerehrung starten as the primary in a finished Event, even though its Standings are a Tie (#309)', () => {
    const state = hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, event: { phase: 'finished' }, end: end({ tie: [1, 2], finish: { rejection: 'wrong_phase' }, lastGame: { rejection: 'wrong_phase' } }) }))

    expect(state).toMatchObject({ kind: 'finished', primary: 'ceremony', closing: null })
  })

  it('has the ceremony as the primary in a finished Event, whatever the Sessions say, and no number (#309)', () => {
    const state = hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, event: { phase: 'finished' }, end: end({ finish: { rejection: 'wrong_phase' } }) }))

    expect(state).toMatchObject({ kind: 'finished', primary: 'ceremony', number: null })
  })

  // The closing decision (#285): made once, the primary of the kinds that play; the others carry none.
  it('names the closing decision: finish or finishTie where it plays, none otherwise (#285)', () => {
    expect(hostDockState(input({ sessions: RUNNING, end: end() }))).toMatchObject({ kind: 'running', closing: 'finish', primary: 'finish' })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED), dated('b', 2)], end: end() }))).toMatchObject({ kind: 'between', closing: 'finish', primary: 'finish' })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: end() }))).toMatchObject({ kind: 'done', closing: 'finish', primary: 'finish' })
    expect(hostDockState(input({ sessions: RUNNING, end: end({ tie: [1, 2] }) }))).toMatchObject({ kind: 'running', closing: 'finishTie', primary: 'finishTie' })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED), dated('b', 2)], end: end({ tie: [1, 2] }) }))).toMatchObject({ kind: 'between', closing: 'finishTie', primary: 'finishTie' })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: end({ tie: [1, 2] }) }))).toMatchObject({ kind: 'done', closing: 'finishTie', primary: 'finishTie' })
    expect(hostDockState(input({ sessions: RUNNING, end: end({ finish: { rejection: 'standings_changed' } }) }))).toMatchObject({ kind: 'running', closing: null, primary: 'spin' })
    expect(hostDockState(input({ sessions: [undated('a')], start: NO_DATED, end: end() }))).toMatchObject({ kind: 'poll', closing: null })
    expect(hostDockState(input({ settings: null, end: end() }))).toMatchObject({ kind: 'setup', closing: null })
    expect(hostDockState(input({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, event: { phase: 'finished' }, end: end() }))).toMatchObject({ kind: 'finished', closing: null })
  })
})

describe('dockLayout reads the closing decision (#285)', () => {
  it('lays a running Session out as closed when it is closed, whatever its primary is', () => {
    const spin = hostDockState(input({ settings, sessions: RUNNING }))

    expect(dockLayout({ ...spin, closing: 'finish' }, { pollOpen: false, bonusVetoOpen: false })).toEqual({ primary: ['finish'], secondary: ['end', 'invite'], more: ['coin', 'countdown', 'settings', 'delete'] })
  })
})

describe('the primary of a running Session (#228)', () => {
  it('is Nächstes Spiel setzen under Host pick, with the reason the rule gives', () => {
    expect(hostDockState(input({ settings: hostPick, sessions: RUNNING, setGame: { rejection: null, spinRejection: null, respin: false, left: [], poolWarning: null } }))).toMatchObject({ kind: 'running', primary: 'setGame', setRejection: null })
    expect(hostDockState(input({ settings: hostPick, sessions: RUNNING, setGame: { rejection: 'teams_uneven', spinRejection: 'teams_uneven', respin: false, left: [], poolWarning: null } }))).toMatchObject({ primary: 'setGame', setRejection: 'teams_uneven' })
  })

  it('is Rad drehen in the Lucky Wheel, with the reason the spin rule gives, where setting waits in Mehr (#229)', () => {
    expect(hostDockState(input({ settings, sessions: RUNNING, setGame: { rejection: null, spinRejection: null, respin: false, left: [], poolWarning: null } }))).toMatchObject({ kind: 'running', primary: 'spin', spinRejection: null })
    expect(hostDockState(input({ settings, sessions: RUNNING, setGame: { rejection: null, spinRejection: 'pool_empty', respin: false, left: [], poolWarning: null } }))).toMatchObject({ primary: 'spin', spinRejection: 'pool_empty' })
    expect(hostDockState(input({ settings, sessions: RUNNING, setGame: { rejection: 'round_being_drawn', spinRejection: 'round_being_drawn', respin: false, left: [], poolWarning: null } }))).toMatchObject({ primary: 'spin', spinRejection: 'round_being_drawn', setRejection: 'round_being_drawn' })
  })

  it('has no spin reason under Host pick: the wheel is not there', () => {
    expect(hostDockState(input({ settings: hostPick, sessions: RUNNING, setGame: { rejection: null, spinRejection: 'no_wheel', respin: false, left: [], poolWarning: null } }))).toMatchObject({ primary: 'setGame', spinRejection: null })
  })
})

describe('dockLayout', () => {
  const ENDED = { startedAt: '2090-10-30T19:30:00.000Z', endedAt: '2090-10-30T22:00:00.000Z' }
  const NO_DATED = { sessionId: null, number: null, rejection: 'no_dated_session' as const }
  const layout = (fields: Partial<DockInput>, open: { pollOpen: boolean, bonusVetoOpen: boolean }) => dockLayout(hostDockState(input(fields)), open)
  const OPENS = [
    { pollOpen: false, bonusVetoOpen: false },
    { pollOpen: true, bonusVetoOpen: false },
    { pollOpen: false, bonusVetoOpen: true },
    { pollOpen: true, bonusVetoOpen: true },
  ]
  // The dock's states as the Event read gives them: the fields that make the state, its primary (with the Date poll open), whether a
  // Session runs, and whether the Date poll can still offer Dates and Slots.
  const COMPLETE: DockInput['end'] = { played: 3, gameCount: 3, complete: true, tie: null, finish: { rejection: null }, lastGame: null }
  const TIE: DockInput['end'] = { ...COMPLETE!, tie: [1, 2] }
  const STATES: { name: string, fields: Partial<DockInput>, primary: DockKey[], running: boolean, polls: boolean, finished?: boolean }[] = [
    { name: 'setup', fields: { settings: null }, primary: ['settings'], running: false, polls: true },
    { name: 'poll', fields: { sessions: [undated('a')], start: NO_DATED }, primary: ['setDate'], running: false, polls: true },
    { name: 'teams', fields: { sessions: [dated('a', 1)] }, primary: ['start'], running: false, polls: true },
    { name: 'between, another Session polls', fields: { sessions: [dated('a', 1, ENDED), dated('b', 2), undated('c')], start: { sessionId: 'b', number: 2, rejection: null } }, primary: ['start'], running: false, polls: true },
    { name: 'running under Host pick', fields: { settings: hostPick, sessions: RUNNING }, primary: ['setGame'], running: true, polls: true },
    { name: 'running in the Lucky Wheel', fields: { settings, sessions: RUNNING }, primary: ['spin'], running: true, polls: true },
    { name: 'after the last Session', fields: { sessions: [dated('a', 1, ENDED)], start: NO_DATED }, primary: [], running: false, polls: false },
    { name: 'complete, a Session runs', fields: { sessions: RUNNING, end: COMPLETE }, primary: ['finish'], running: true, polls: true },
    { name: 'complete, between Sessions', fields: { sessions: [dated('a', 1, ENDED), dated('b', 2)], start: { sessionId: 'b', number: 2, rejection: null }, end: COMPLETE }, primary: ['finish'], running: false, polls: true },
    { name: 'complete after the last Session', fields: { sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: COMPLETE }, primary: ['finish'], running: false, polls: false },
    { name: 'complete in the Lucky Wheel, a Session runs', fields: { settings, sessions: RUNNING, end: COMPLETE }, primary: ['finish'], running: true, polls: true },
    { name: 'complete, between Sessions with none left to start and one polling', fields: { sessions: [dated('a', 1, ENDED), undated('b')], start: NO_DATED, end: COMPLETE }, primary: ['finish'], running: false, polls: true },
    { name: 'a Tie, a Session runs', fields: { settings, sessions: RUNNING, end: TIE }, primary: ['finishTie'], running: true, polls: true },
    { name: 'a Tie between Sessions', fields: { sessions: [dated('a', 1, ENDED), dated('b', 2)], start: { sessionId: 'b', number: 2, rejection: null }, end: TIE }, primary: ['finishTie'], running: false, polls: true },
    { name: 'a Tie after the last Session', fields: { sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: TIE }, primary: ['finishTie'], running: false, polls: false },
    // A finished Event offers the ceremony and Einladen only (#277, #309), so the checks that expect Mehr to end with the settings skip it.
    { name: 'finished', fields: { sessions: [dated('a', 1, ENDED)], start: NO_DATED, event: { phase: 'finished' }, end: COMPLETE }, primary: ['ceremony'], running: false, polls: false, finished: true },
  ]

  it.each(STATES)('has $primary as the primary in $name, with the Date poll open', ({ fields, primary }) => {
    for (const bonusVetoOpen of [false, true]) expect(layout(fields, { pollOpen: true, bonusVetoOpen }).primary).toEqual(primary)
  })

  it.each(STATES.filter(state => !state.finished))('ends Mehr with the settings and then delete in $name, and keeps the settings out of Mehr in setup, where they are the primary (#333)', ({ fields, primary }) => {
    for (const open of OPENS) {
      const { more } = layout(fields, open)
      expect(more.at(-1)).toBe('delete')
      if (primary.includes('settings')) expect(more).not.toContain('settings')
      else expect(more.at(-2)).toBe('settings')
    }
  })

  // „Event löschen“ (#333): last in Mehr in every state and every open part, never in the pill, and once.
  it.each(STATES)('lists delete last in Mehr and never in the pill in $name, for every open part (#333)', ({ fields }) => {
    for (const open of OPENS) {
      const { primary, secondary, more } = layout(fields, open)
      expect(more.at(-1)).toBe('delete')
      expect(more.filter(key => key === 'delete')).toHaveLength(1)
      expect(primary).not.toContain('delete')
      expect(secondary).not.toContain('delete')
    }
  })

  it('leaves Siegerehrung starten and Einladen in a finished Event, and Event löschen in Mehr (#277, #309, #333)', () => {
    const finished = STATES.find(state => state.finished)!

    for (const open of OPENS) expect(layout(finished.fields, open)).toEqual({ primary: ['ceremony'], secondary: ['invite'], more: ['delete'] })
  })

  it('puts Event abschließen first and keeps Session beenden next to it in a running Session, without the actions that could only be disabled (#277)', () => {
    for (const open of OPENS) {
      const { primary, secondary, more } = layout({ sessions: RUNNING, end: COMPLETE }, open)
      expect(primary).toEqual(['finish'])
      expect(secondary).toEqual(['end', 'invite'])
      expect(more).not.toContain('setGame')
      expect(more).not.toContain('spin')
    }
  })

  it('offers no Session starten once the Event can be finished, between Sessions or after the last (#277)', () => {
    for (const open of OPENS) {
      expect(layout({ sessions: [dated('a', 1, ENDED), dated('b', 2)], end: COMPLETE }, open).primary).not.toContain('start')
      expect(layout({ sessions: [dated('a', 1, ENDED), dated('b', 2)], end: COMPLETE }, open).more).not.toContain('start')
    }
  })

  it.each(STATES)('holds Letztes Spiel hinzufügen in the dock exactly where Unentschieden beenden is the primary: $name', ({ fields, primary }) => {
    for (const open of OPENS) {
      const { secondary, more } = layout(fields, open)
      expect(secondary.includes('lastGame')).toBe(primary.includes('finishTie'))
      expect(more).not.toContain('lastGame')
    }
  })

  // HostDock lists every action of Mehr without its hold, so a hold there would run at once.
  it.each(STATES)('keeps every hold out of Mehr: $name', ({ fields }) => {
    for (const open of OPENS) {
      const { more } = layout(fields, open)
      for (const key of ['end', 'finish', 'finishTie'] as DockKey[]) expect(more).not.toContain(key)
    }
  })

  it('lays the Tie out for each state: both holds and the last game in the pill, the rest behind Mehr (#278)', () => {
    for (const open of OPENS) {
      const dates: DockKey[] = open.pollOpen ? ['setDate'] : []
      const slots: DockKey[] = open.pollOpen ? ['slots'] : []
      const bonus: DockKey[] = open.bonusVetoOpen ? ['bonusVeto'] : []
      const game = GAME_ACTIONS.filter(key => key !== 'bonusVeto' || open.bonusVetoOpen)
      expect(layout({ sessions: RUNNING, end: TIE }, open)).toEqual({ primary: ['finishTie'], secondary: ['lastGame', 'end', 'invite'], more: [...dates, ...slots, ...game, 'settings', 'delete'] })
      expect(layout({ sessions: [dated('a', 1, ENDED), dated('b', 2)], start: { sessionId: 'b', number: 2, rejection: null }, end: TIE }, open)).toEqual({ primary: ['finishTie'], secondary: ['lastGame', 'invite'], more: [...dates, ...slots, ...bonus, 'settings', 'delete'] })
      expect(layout({ sessions: [dated('a', 1, ENDED)], start: NO_DATED, end: TIE }, open)).toEqual({ primary: ['finishTie'], secondary: ['lastGame', 'invite'], more: [...bonus, 'settings', 'delete'] })
    }
  })

  it('offers no game to set or spin in a Tie: only the last game adds one', () => {
    for (const open of OPENS) {
      for (const fields of [{ sessions: RUNNING, end: TIE }, { settings: hostPick, sessions: RUNNING, end: TIE }]) {
        const { primary, secondary, more } = layout(fields, open)
        for (const key of ['setGame', 'spin', 'start'] as DockKey[]) expect([...primary, ...secondary, ...more]).not.toContain(key)
      }
    }
  })

  it.each(STATES)('holds Einladen in the dock in $name, and Session beenden there only while a Session runs', ({ fields, running }) => {
    for (const open of OPENS) {
      const { secondary } = layout(fields, open)
      expect(secondary).toContain('invite')
      expect(secondary.includes('end')).toBe(running)
    }
  })

  it.each(STATES)('has the coin toss and the Countdown in Mehr while a Session runs, and in no other state: $name', ({ fields, running }) => {
    for (const open of OPENS) {
      const { more } = layout(fields, open)
      expect(more.includes('coin')).toBe(running)
      expect(more.includes('countdown')).toBe(running)
    }
  })

  it.each(STATES)('has the Bonus Veto in Mehr whenever the Host may grant one, except in setup and in a finished Event: $name', ({ fields, primary, finished }) => {
    for (const open of OPENS) {
      const { more } = layout(fields, open)
      expect(more.includes('bonusVeto')).toBe(!primary.includes('settings') && !finished && open.bonusVetoOpen)
    }
  })

  it.each(STATES.filter(state => state.running))('lists the game actions in GAME_ACTIONS order right before the settings: $name', ({ fields }) => {
    for (const open of OPENS) {
      const { more } = layout(fields, open)
      const game = GAME_ACTIONS.filter(key => key !== 'bonusVeto' || open.bonusVetoOpen)
      expect(more.filter(key => GAME_ACTIONS.includes(key))).toEqual(game)
      const withoutDelete = more.slice(0, -1)
      expect(withoutDelete.slice(withoutDelete.length - game.length - 1)).toEqual([...game, 'settings'])
    }
  })

  it.each(STATES)('lists no action twice, in any part: $name', ({ fields }) => {
    for (const open of OPENS) {
      const { primary, secondary, more } = layout(fields, open)
      const all = [...primary, ...secondary, ...more]
      expect(new Set(all).size).toBe(all.length)
    }
  })

  it('offers Nächstes Spiel setzen in Mehr under the Lucky Wheel only, and as the primary under Host pick (#229)', () => {
    for (const open of OPENS) {
      expect(layout({ settings: hostPick, sessions: RUNNING }, open).more).not.toContain('setGame')
      expect(layout({ settings, sessions: RUNNING }, open).more).toContain('setGame')
      expect(layout({ sessions: [dated('a', 1)] }, open).more).not.toContain('setGame')
    }
  })

  it.each(STATES)('offers the Dates and the Slots only while the Date poll is open, and in a state that polls: $name', ({ fields, polls }) => {
    for (const pollOpen of [false, true]) {
      const { primary, secondary, more } = layout(fields, { pollOpen, bonusVetoOpen: false })
      const shown = [...primary, ...secondary, ...more]
      expect(shown.includes('setDate')).toBe(pollOpen && polls)
      expect(shown.includes('slots')).toBe(pollOpen && polls)
    }
  })

  // Today's layout of every state for each open part (#285), spelled out per state: the closing refactor must keep each one.
  type Open = { pollOpen: boolean, bonusVetoOpen: boolean }
  const dates = (open: Open): DockKey[] => (open.pollOpen ? ['setDate'] : [])
  const slots = (open: Open): DockKey[] => (open.pollOpen ? ['slots'] : [])
  const bonus = (open: Open): DockKey[] => (open.bonusVetoOpen ? ['bonusVeto'] : [])
  const game = (open: Open): DockKey[] => GAME_ACTIONS.filter(key => key !== 'bonusVeto' || open.bonusVetoOpen)
  const PINNED: Record<string, (open: Open) => DockLayout> = {
    'setup': open => ({ primary: ['settings'], secondary: ['invite'], more: [...dates(open), ...slots(open), 'delete'] }),
    'poll': open => ({ primary: dates(open), secondary: ['invite'], more: [...slots(open), ...bonus(open), 'settings', 'delete'] }),
    'teams': open => ({ primary: ['start'], secondary: [...dates(open), 'invite'], more: [...slots(open), ...bonus(open), 'settings', 'delete'] }),
    'between, another Session polls': open => ({ primary: ['start'], secondary: [...dates(open), 'invite'], more: [...slots(open), ...bonus(open), 'settings', 'delete'] }),
    'running under Host pick': open => ({ primary: ['setGame'], secondary: ['end', 'invite'], more: [...dates(open), ...slots(open), ...game(open), 'settings', 'delete'] }),
    'running in the Lucky Wheel': open => ({ primary: ['spin'], secondary: ['end', 'invite'], more: ['setGame', ...dates(open), ...slots(open), ...game(open), 'settings', 'delete'] }),
    'after the last Session': open => ({ primary: [], secondary: ['invite'], more: [...bonus(open), 'settings', 'delete'] }),
    'complete, a Session runs': open => ({ primary: ['finish'], secondary: ['end', 'invite'], more: [...dates(open), ...slots(open), ...game(open), 'settings', 'delete'] }),
    'complete in the Lucky Wheel, a Session runs': open => ({ primary: ['finish'], secondary: ['end', 'invite'], more: [...dates(open), ...slots(open), ...game(open), 'settings', 'delete'] }),
    'complete, between Sessions': open => ({ primary: ['finish'], secondary: [...dates(open), 'invite'], more: [...slots(open), ...bonus(open), 'settings', 'delete'] }),
    'complete, between Sessions with none left to start and one polling': open => ({ primary: ['finish'], secondary: [...dates(open), 'invite'], more: [...slots(open), ...bonus(open), 'settings', 'delete'] }),
    'complete after the last Session': open => ({ primary: ['finish'], secondary: ['invite'], more: [...bonus(open), 'settings', 'delete'] }),
    'a Tie, a Session runs': open => ({ primary: ['finishTie'], secondary: ['lastGame', 'end', 'invite'], more: [...dates(open), ...slots(open), ...game(open), 'settings', 'delete'] }),
    'a Tie between Sessions': open => ({ primary: ['finishTie'], secondary: ['lastGame', 'invite'], more: [...dates(open), ...slots(open), ...bonus(open), 'settings', 'delete'] }),
    'a Tie after the last Session': open => ({ primary: ['finishTie'], secondary: ['lastGame', 'invite'], more: [...bonus(open), 'settings', 'delete'] }),
    'finished': () => ({ primary: ['ceremony'], secondary: ['invite'], more: ['delete'] }),
  }

  it.each(STATES)('pins the layout of $name for every open part, as today (#285)', ({ name, fields }) => {
    const pinned = PINNED[name]
    expect(pinned).toBeDefined()
    for (const open of OPENS) expect(layout(fields, open)).toEqual(pinned?.(open))
  })
})

describe('coinBlockedKey (#235)', () => {
  const LANDS = '2090-10-30T20:00:05.100Z'
  const flying = { sessions: RUNNING, coin: { id: 'c', side: 'heads' as const, startedAt: '2090-10-30T20:00:01.500Z', landsAt: LANDS } }

  it('says why the Host cannot toss while the coin flies: „Die Münze fliegt noch.“', () => {
    expect(coinBlockedKey(flying, Date.parse(LANDS) - 1)).toBe('error.coinInAir')
  })

  it('has no reason once the coin has landed, without a toss, or when no Session runs', () => {
    expect(coinBlockedKey(flying, Date.parse(LANDS))).toBeNull()
    expect(coinBlockedKey({ sessions: RUNNING, coin: null }, Date.parse(LANDS) - 1)).toBeNull()
    expect(coinBlockedKey({ sessions: [dated('a', 1)], coin: flying.coin }, Date.parse(LANDS) - 1)).toBe('error.noRunningSession')
  })
})

describe('ceremonyBlockedKey (#309)', () => {
  const ENDS = '2090-10-30T20:00:05.050Z'
  const run = { event: { phase: 'finished' as const }, ceremony: { startsAt: '2090-10-30T20:00:00.000Z', endsAt: ENDS, gag: 'trip' as const } }

  it('says why the Host cannot start while a run plays, the lead included: „Die Siegerehrung läuft noch.“', () => {
    expect(ceremonyBlockedKey(run, Date.parse(ENDS) - 1)).toBe('error.ceremonyRunning')
    expect(ceremonyBlockedKey(run, Date.parse(run.ceremony.startsAt) - 1500)).toBe('error.ceremonyRunning')
  })

  it('has no reason before the first start, nor at the end of the run', () => {
    expect(ceremonyBlockedKey({ event: run.event, ceremony: null }, Date.parse(ENDS))).toBeNull()
    expect(ceremonyBlockedKey(run, Date.parse(ENDS))).toBeNull()
  })
})

describe('lastGameBlockedKey (#278)', () => {
  it('says the maximum in the dock\'s own words and every other reason in the shared copy', () => {
    expect(lastGameBlockedKey('game_count_range')).toBe('dock.lastGameBlocked.game_count_range')
    expect(lastGameBlockedKey('results_missing')).toBe('error.resultsMissing')
    expect(lastGameBlockedKey('no_tie')).toBe('error.noTie')
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
