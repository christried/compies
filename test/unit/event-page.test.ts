import { describe, expect, it } from 'vitest'
import { dateBlockedKey, eventPageState, headerPill, pagePill, pollingNumber, seatNote, shownSessionNumbers, startedIn, teamsStay, type PageInput, unevenNoticeIn } from '../../app/utils/event-page'
import type { BoardTeam, MemberView } from '../../shared/event'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the order of the blocks
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too.

const settings = { format: 'teams', teamCount: 2, teamSize: 2 } as PageInput['settings']

const dated = (id: string, number: number | null, startsAt: string, times: { startedAt?: string, endedAt?: string } = {}): PageInput['sessions'][number] => ({
  id, number, startsAt, previousStartsAt: null, notes: [], startedAt: times.startedAt ?? null, endedAt: times.endedAt ?? null,
})
const undated = (id: string): PageInput['sessions'][number] => ({ id, number: null, startsAt: null, previousStartsAt: null, startedAt: null, endedAt: null })

function input(sessions: PageInput['sessions'], fields: Partial<PageInput> = {}): PageInput {
  return { settings, sessions, missingDates: sessions.filter(session => session.startsAt === null).length, event: { phase: 'poll' }, setGame: null, wheel: null, countdown: null, coin: null, ...fields }
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
    const state = eventPageState(input([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { event: { phase: 'running' } }))

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
    expect(pill([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)])).toEqual({ phase: 'running', ended: false })
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

// The stage's blocks per state (review 1.4 A4, #228): the state says which blocks the page shows and in which order, so a
// new block is one entry in pageBlocks.
describe('the blocks of the stage', () => {
  const blocks = (sessions: PageInput['sessions'], fields: Partial<PageInput> = {}) => eventPageState(input(sessions, fields)).blocks
  const ENDED = { startedAt: SAT, endedAt: SUN }

  it('puts the poll first while no Session is dated, then the Game board and the cards', () => {
    expect(blocks([undated('a'), undated('b')])).toEqual(['head', 'reopen', 'poll', 'board', 'cards'])
  })

  it('puts the Game board first once a Session is dated, with the poll of another one below it', () => {
    expect(blocks([dated('a', 1, SAT), undated('b')])).toEqual(['head', 'reopen', 'seat', 'board', 'poll', 'cards'])
  })

  it('has no poll once every Session is dated', () => {
    expect(blocks([dated('a', 1, SAT), dated('b', 2, SUN)], { event: { phase: 'date_set' } })).toEqual(['head', 'reopen', 'seat', 'board', 'cards'])
  })

  // A running Session, and the data each block shows (#256): a block is listed only while its data is in the view.
  const ONE_RUNNING = [dated('a', 1, SAT, { startedAt: SAT }), undated('b')]
  const RUNNING: Partial<PageInput> = { event: { phase: 'running' } }
  const WHEEL: Partial<PageInput> = { wheel: { count: 2, slices: null, spin: null, vetoes: { left: [2, 2], own: null, revealed: null, draw: null } } }
  const COUNTDOWN: Partial<PageInput> = { countdown: { durationMs: 60_000, remainingMs: 60_000, startedAt: null } }
  const TOSS: Partial<PageInput> = { coin: { id: 'toss-1', side: 'heads', startedAt: SAT, landsAt: SUN } }
  const POOL_WARNING: Partial<PageInput> = { setGame: { rejection: null, spinRejection: null, respin: false, left: [], poolWarning: { needed: 10, have: 2 } } }

  it('shows the open Rounds above the Game board while a Session runs and between Sessions (#273), not before the first start', () => {
    expect(blocks(ONE_RUNNING, RUNNING)).toEqual(['head', 'reopen', 'rounds', 'board', 'poll', 'cards'])
    expect(blocks([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], RUNNING)).toContain('rounds')
    expect(blocks([dated('a', 1, SAT)])).not.toContain('rounds')
  })

  it('lists the Countdown only when the view has one, right under the Rounds (#236)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...COUNTDOWN })).toEqual(['head', 'reopen', 'rounds', 'countdown', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, RUNNING)).not.toContain('countdown')
  })

  it('lists the coin only with a toss, and right under the Countdown (#235)', () => {
    const list = blocks(ONE_RUNNING, { ...RUNNING, ...COUNTDOWN, ...TOSS })

    expect(list.indexOf('coin')).toBe(list.indexOf('countdown') + 1)
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...TOSS })).toEqual(['head', 'reopen', 'rounds', 'coin', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, RUNNING)).not.toContain('coin')
  })

  it('lists the pool warning only with one, under the open Rounds (#234)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...POOL_WARNING })).toEqual(['head', 'reopen', 'rounds', 'pool', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, RUNNING)).not.toContain('pool')
  })

  it('lists the wheel only with wheel data, on top of the open Rounds (#229)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...WHEEL })).toEqual(['head', 'reopen', 'wheel', 'rounds', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, RUNNING)).not.toContain('wheel')
  })

  it('keeps the order of the stage when every block has its data', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...WHEEL, ...POOL_WARNING, ...COUNTDOWN, ...TOSS })).toEqual(['head', 'reopen', 'wheel', 'rounds', 'pool', 'countdown', 'coin', 'board', 'poll', 'cards'])
  })

  it('lists none of the data blocks outside the running state, even with their data', () => {
    const everything = { ...WHEEL, ...COUNTDOWN, ...TOSS, ...POOL_WARNING }
    const cases: [PageInput['sessions'], Partial<PageInput>][] = [
      [[undated('a'), undated('b')], {}],
      [[dated('a', 1, SAT)], {}],
      [[dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], {}],
      [[dated('a', 1, SAT, ENDED)], {}],
      [[undated('a')], { settings: null }],
    ]
    for (const [sessions, fields] of cases) {
      const list = blocks(sessions, { ...everything, ...fields })
      for (const block of ['wheel', 'pool', 'countdown', 'coin']) expect(list).not.toContain(block)
    }
  })

  it('puts the open Rounds and then the cards first between two Sessions, with the notice that the teams stay (#273)', () => {
    expect(blocks([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], { event: { phase: 'running' } })).toEqual(['head', 'reopen', 'rounds', 'cards', 'stay', 'board'])
  })

  it('keeps the poll below the board between two Sessions while another one waits for its Date', () => {
    expect(blocks([dated('a', 1, SAT, ENDED), undated('b')], { event: { phase: 'running' } })).toEqual(['head', 'reopen', 'rounds', 'cards', 'stay', 'board', 'poll'])
  })

  it('ends with the open Rounds, the cards and the board after the last Session (#273)', () => {
    expect(blocks([dated('a', 1, SAT, ENDED)], { event: { phase: 'running' } })).toEqual(['head', 'reopen', 'rounds', 'cards', 'board'])
  })

  it('asks the Event to be set up first, and shows the poll when one is open', () => {
    expect(blocks([undated('a')], { settings: null })).toEqual(['head', 'reopen', 'setup', 'poll', 'board', 'cards'])
  })

  it('keeps the poll quiet as soon as the page is about something else than the Date', () => {
    const compact = (sessions: PageInput['sessions'], fields: Partial<PageInput> = {}) => eventPageState(input(sessions, fields)).pollCompact

    expect(compact([undated('a')])).toBe(false)
    expect(compact([undated('a')], { settings: null })).toBe(false)
    expect(compact([dated('a', 1, SAT), undated('b')])).toBe(true)
  })

  it('lets the cards stand out between two Sessions and after the last', () => {
    const standOut = (sessions: PageInput['sessions'], fields: Partial<PageInput> = {}) => eventPageState(input(sessions, fields)).cardsStandOut

    expect(standOut([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)])).toBe(true)
    expect(standOut([dated('a', 1, SAT, ENDED)])).toBe(true)
    expect(standOut([dated('a', 1, SAT), dated('b', 2, SUN)])).toBe(false)
  })
})

// The page's text lines (#257, B1): pure, with a fake `t` that names the key and its parameters, so a case reads the key it picks.
const fakeT = (key: string, named?: Record<string, unknown>) => (named ? `${key}(${Object.entries(named).map(([k, v]) => `${k}=${v}`).join(',')})` : key)
const HOST_ID = 'host'
const hostView = (fields: Partial<MemberView> & Pick<MemberView, 'zone'>, teams: BoardTeam[] = []) => ({
  members: [{ id: HOST_ID, name: 'Sanne', image: null, isHost: true, team: null, teamWord: null, ...fields }],
  viewerId: HOST_ID,
  teams,
  event: { isHost: true },
})

// Which page kinds have started the first Session (#164) and which ones show the notice about uneven teams (#166).
describe('startedIn and unevenNoticeIn', () => {
  it.each([
    // kind,      started, uneven notice
    ['setup',   false,   true],
    ['poll',    false,   true],
    ['teams',   false,   true],
    ['running', true,    false],
    ['between', true,    true],
    ['done',    true,    false],
  ] as const)('the %s page: started %s, uneven notice %s', (kind, started, uneven) => {
    expect(startedIn(kind)).toBe(started)
    expect(unevenNoticeIn(kind)).toBe(uneven)
  })
})

describe('seatNote', () => {
  it('is null for a Member, whatever zone they sit in', () => {
    expect(seatNote({ ...hostView({ zone: 'stands' }), event: { isHost: false } }, fakeT)).toBeNull()
  })

  it('names the Tribüne for a Host who sits there', () => {
    expect(seatNote(hostView({ zone: 'stands' }), fakeT)).toBe('event.notice.seatStands')
  })

  it('names the Team by its name for a Host in a named Team', () => {
    expect(seatNote(hostView({ zone: 'team', team: 1 }, [{ position: 1, name: 'Rot', frozen: false }]), fakeT)).toBe('event.notice.seatTeam(team=Rot)')
  })

  it('names a Team without a name by its default name and colour', () => {
    expect(seatNote(hostView({ zone: 'team', team: 2 }, [{ position: 2, name: null, frozen: false }]), fakeT))
      .toBe('event.notice.seatTeam(team=team.defaultName(color=team.colors.2))')
  })

  it('is null for a Host on the Bench', () => {
    expect(seatNote(hostView({ zone: 'bench' }), fakeT)).toBeNull()
  })

  it('is null when the viewer is not among the Members', () => {
    expect(seatNote({ ...hostView({ zone: 'stands' }), viewerId: 'nobody' }, fakeT)).toBeNull()
  })
})

describe('teamsStay', () => {
  const next = { number: 2, startsAt: SUN }

  it('names the next Session by its number, to the Host and to a Member', () => {
    expect(teamsStay(next, true, fakeT)).toBe('event.notice.teamsStay(n=2)')
    expect(teamsStay(next, false, fakeT)).toBe('event.notice.teamsStayMember(n=2)')
  })

  it('says „der nächsten“ when the next Session has no number yet', () => {
    expect(teamsStay({ number: null, startsAt: SUN }, true, fakeT)).toBe('event.notice.teamsStayNext(n=null)')
    expect(teamsStay({ number: null, startsAt: SUN }, false, fakeT)).toBe('event.notice.teamsStayMemberNext(n=null)')
  })

  it('uses the next-Session keys without a next Session at all', () => {
    expect(teamsStay(null, true, fakeT)).toBe('event.notice.teamsStayNext(n=null)')
  })
})

describe('headerPill', () => {
  const state = (list: PageInput['sessions'], fields: Partial<PageInput> = {}) => eventPageState(input(list, fields))

  it('falls back to the Event\'s Phase, or poll, without a page state', () => {
    expect(headerPill(null, 'date_set', fakeT)).toEqual({ phase: 'date_set', label: undefined })
    expect(headerPill(null, undefined, fakeT)).toEqual({ phase: 'poll', label: undefined })
  })

  it('falls back to the Event\'s Phase in setup, where the page state has no pill', () => {
    expect(headerPill(state([undated('a')], { settings: null }), 'date_set', fakeT)).toEqual({ phase: 'date_set', label: undefined })
  })

  it('shows Vorbei once the last Session ended', () => {
    expect(headerPill(state([dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })]), 'running', fakeT)).toEqual({ phase: 'finished', label: 'phase.ended' })
  })

  it('counts the running Session in an Event with several', () => {
    const running = state([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { event: { phase: 'running' } })

    expect(headerPill(running, 'running', fakeT)).toEqual({ phase: 'running', label: 'event.pill.running(n=1,total=2)' })
  })

  it('shows no label for the running Session of an Event with one', () => {
    const running = state([dated('a', 1, SAT, { startedAt: SAT })], { event: { phase: 'running' } })

    expect(headerPill(running, 'running', fakeT)).toEqual({ phase: 'running', label: undefined })
  })

  it('shows the poll without a label', () => {
    expect(headerPill(state([undated('a'), undated('b')]), 'poll', fakeT)).toEqual({ phase: 'poll', label: undefined })
  })
})
