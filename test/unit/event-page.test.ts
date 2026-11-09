import { describe, expect, it } from 'vitest'
import { dateBlockedKey, eventPageState, gamesToStart, headerPill, pagePill, pollingNumber, seatNote, shownSessionNumbers, startedIn, teamsStay, type PageInput, unevenNoticeIn } from '../../app/utils/event-page'
import type { BoardTeam, MemberView } from '../../shared/event'
import type { RoundView } from '../../shared/stage'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the order of the blocks
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too.

const settings = { format: 'teams', teamCount: 2, teamSize: 2 } as PageInput['settings']

const dated = (id: string, number: number | null, startsAt: string, times: { startedAt?: string, endedAt?: string } = {}): PageInput['sessions'][number] => ({
  id, number, startsAt, previousStartsAt: null, notes: [], startedAt: times.startedAt ?? null, endedAt: times.endedAt ?? null,
})
const undated = (id: string): PageInput['sessions'][number] => ({ id, number: null, startsAt: null, previousStartsAt: null, startedAt: null, endedAt: null })

function input(sessions: PageInput['sessions'], fields: Partial<PageInput> = {}): PageInput {
  return { settings, sessions, missingDates: sessions.filter(session => session.startsAt === null).length, event: { phase: 'poll', isHost: false }, setGame: null, wheel: null, countdown: null, coin: null, end: null, ...fields }
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
    const state = eventPageState(input([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { event: { phase: 'running', isHost: false } }))

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

    expect(pill([undated('a')])).toEqual({ phase: 'poll', noDate: false })
    expect(pill([dated('a', 1, SAT), undated('b')])).toEqual({ phase: 'date_set', noDate: false })
    expect(pill([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)])).toEqual({ phase: 'running', noDate: false })
    expect(pill([ended, dated('b', 2, SUN)])).toEqual({ phase: 'date_set', noDate: false })
    expect(pill([ended, undated('b')])).toEqual({ phase: 'poll', noDate: false })
    // No Session left, Event not finished (#277): the grey draft dot with „Kein Termin“; „Beendet“ is the finished Phase's own word.
    expect(pill([ended])).toEqual({ phase: 'draft', noDate: true })
    expect(pill([ended], { event: { phase: 'finished', isHost: false } })).toEqual({ phase: 'finished', noDate: false })
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
    expect(blocks([dated('a', 1, SAT), dated('b', 2, SUN)], { event: { phase: 'date_set', isHost: false } })).toEqual(['head', 'reopen', 'seat', 'board', 'cards'])
  })

  // A running Session, and the data each block shows (#256): a block is listed only while its data is in the view.
  const ONE_RUNNING = [dated('a', 1, SAT, { startedAt: SAT }), undated('b')]
  const RUNNING: Partial<PageInput> = { event: { phase: 'running', isHost: false } }
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
    expect(blocks([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], { event: { phase: 'running', isHost: false } })).toEqual(['head', 'reopen', 'rounds', 'cards', 'stay', 'board'])
  })

  it('keeps the poll below the board between two Sessions while another one waits for its Date', () => {
    expect(blocks([dated('a', 1, SAT, ENDED), undated('b')], { event: { phase: 'running', isHost: false } })).toEqual(['head', 'reopen', 'rounds', 'cards', 'stay', 'board', 'poll'])
  })

  it('ends with the open Rounds, the cards and the board after the last Session (#273)', () => {
    expect(blocks([dated('a', 1, SAT, ENDED)], { event: { phase: 'running', isHost: false } })).toEqual(['head', 'reopen', 'rounds', 'cards', 'board'])
  })

  // The Standings (#274): a stage block once the first Result exists, right after the open Rounds, in every state a Result can exist in.
  const STANDINGS: Partial<PageInput> = { end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } }

  it('lists the Standings right after the open Rounds once a Result exists, while a Session runs (#274)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).toEqual(['head', 'reopen', 'rounds', 'standings', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...WHEEL, ...POOL_WARNING, ...COUNTDOWN, ...TOSS, ...STANDINGS }))
      .toEqual(['head', 'reopen', 'wheel', 'rounds', 'standings', 'pool', 'countdown', 'coin', 'board', 'poll', 'cards'])
  })

  it('lists the Standings between two Sessions and after the last one, after the open Rounds (#274)', () => {
    expect(blocks([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], { ...RUNNING, ...STANDINGS })).toEqual(['head', 'reopen', 'rounds', 'standings', 'cards', 'stay', 'board'])
    expect(blocks([dated('a', 1, SAT, ENDED)], { ...RUNNING, ...STANDINGS })).toEqual(['head', 'reopen', 'sessionNeeded', 'rounds', 'standings', 'cards', 'board'])
  })

  it('lists no Standings before the first Result, whether the view has an end with nothing played or none (#274)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } })).not.toContain('standings')
    expect(blocks(ONE_RUNNING, { ...RUNNING, end: null })).not.toContain('standings')
  })

  it('lists no Standings in the poll, teams and setup states (#274)', () => {
    expect(blocks([undated('a'), undated('b')], STANDINGS)).not.toContain('standings')
    expect(blocks([dated('a', 1, SAT)], STANDINGS)).not.toContain('standings')
    expect(blocks([undated('a')], { settings: null, ...STANDINGS })).not.toContain('standings')
  })

  // The finished Event (#277): the Standings and the history are the stage; no board, no open Rounds, no poll.
  const FINISHED: Partial<PageInput> = { event: { phase: 'finished', isHost: false } }
  const FINISHED_END: Partial<PageInput> = { ...FINISHED, end: { played: 3, gameCount: 3, complete: true, tie: null, finish: null, lastGame: null } }

  it('is finished for the finished Phase, with a Session still in the list or no end at all (#277)', () => {
    expect(eventPageState(input([dated('a', 1, SAT, ENDED)], FINISHED))).toMatchObject({ kind: 'finished', running: null })
    expect(eventPageState(input([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], FINISHED)).kind).toBe('finished')
    expect(eventPageState(input([dated('a', 1, SAT, ENDED)], { ...FINISHED, end: null })).kind).toBe('finished')
  })

  it('lists the actions, the Standings and the history on the finished stage, with the Sessions card at the end (#277)', () => {
    expect(blocks([dated('a', 1, SAT, ENDED)], FINISHED_END)).toEqual(['head', 'reopen', 'actions', 'standings', 'history', 'cards'])
  })

  it('lists neither Standings nor history on the finished stage without a Result, and none of the live blocks in any case (#277)', () => {
    expect(blocks([dated('a', 1, SAT, ENDED)], FINISHED)).toEqual(['head', 'reopen', 'cards'])
    const everything = { ...WHEEL, ...COUNTDOWN, ...TOSS, ...POOL_WARNING, ...FINISHED_END }
    const list = blocks([dated('a', 1, SAT, ENDED)], everything)
    for (const block of ['board', 'rounds', 'poll', 'wheel', 'pool', 'countdown', 'coin', 'stay', 'seat', 'setup']) expect(list).not.toContain(block)
  })

  it('lists the actions of the finished stage (Bild teilen, #313) right after the reopen notices, in no other kind, and not without a Result', () => {
    expect(blocks([dated('a', 1, SAT, ENDED)], FINISHED_END).slice(0, 3)).toEqual(['head', 'reopen', 'actions'])
    expect(blocks([dated('a', 1, SAT, ENDED)], FINISHED)).not.toContain('actions')
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).not.toContain('actions')
    expect(blocks([dated('a', 1, SAT, ENDED)], { ...RUNNING, ...STANDINGS })).not.toContain('actions')
  })

  it('has no history block before the Event is finished (#277)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).not.toContain('history')
  })

  // A Tie (#278): the banner is the news of the stage and sits right under the Head and the reopen notices, wherever the Host's dock offers
  // „Unentschieden beenden“ (running, between, done), and in no other kind: a finished Event keeps `end.tie`, but nobody decides any more.
  const TIE: Partial<PageInput> = { end: { played: 3, gameCount: 3, complete: true, tie: [1, 2], finish: null, lastGame: null } }

  it('lists the Tie banner right after the reopen notices while a Session runs, between Sessions and after the last one', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...WHEEL, ...TIE })).toEqual(['head', 'reopen', 'tie', 'wheel', 'rounds', 'standings', 'board', 'poll', 'cards'])
    expect(blocks([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], { ...RUNNING, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'cards', 'stay', 'board'])
    expect(blocks([dated('a', 1, SAT, ENDED)], { ...RUNNING, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'cards', 'board'])
  })

  it('sets present.tie from the Event read\'s tie, and lists no banner without a Tie, or in a finished Event', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).not.toContain('tie')
    expect(blocks(ONE_RUNNING, { ...RUNNING, end: null })).not.toContain('tie')
    expect(blocks([dated('a', 1, SAT, ENDED)], { ...FINISHED, ...TIE })).toEqual(['head', 'reopen', 'actions', 'standings', 'history', 'cards'])
  })

  // #283: the banner is for who reads it. The Host decides and has the dock, so the page state does not list it for the Host (the template checks nothing of its own).
  it('lists the Tie banner for a Member and not for the Host', () => {
    const states: [PageInput['sessions'], Partial<PageInput>][] = [
      [ONE_RUNNING, { ...RUNNING, ...TIE }],
      [[dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], { ...RUNNING, ...TIE }],
      [[dated('a', 1, SAT, ENDED)], { ...RUNNING, ...TIE }],
    ]
    for (const [sessions, fields] of states) {
      expect(blocks(sessions, { ...fields, event: { phase: 'running', isHost: false } })).toContain('tie')
      expect(blocks(sessions, { ...fields, event: { phase: 'running', isHost: true } })).not.toContain('tie')
    }
  })

  it('lists the banner in no state before a Session started', () => {
    expect(blocks([undated('a'), undated('b')], TIE)).not.toContain('tie')
    expect(blocks([dated('a', 1, SAT)], TIE)).not.toContain('tie')
    expect(blocks([undated('a')], { settings: null, ...TIE })).not.toContain('tie')
  })

  // The dead end (#278): every Session ended, the Game count is not reached and no open Round fills it, so the last game needs a new Session.
  // Only in `done`; a Member's page lists it too and renders nothing (the Host check is the page's).
  const LEFT_ONE: Partial<PageInput> = { end: { played: 2, gameCount: 3, complete: false, tie: null, finish: null, lastGame: null } }
  const DONE_ONE = [dated('a', 1, SAT, ENDED)]
  const round = (id: string): RoundView => ({ id, startedAt: SAT, setAt: SAT, game: { id: `g-${id}`, name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null } })

  it('lists the session-needed notice right under the reopen notices after the last Session, before the open Rounds (#278)', () => {
    expect(blocks(DONE_ONE, { ...RUNNING, ...LEFT_ONE })).toEqual(['head', 'reopen', 'sessionNeeded', 'rounds', 'standings', 'cards', 'board'])
  })

  it('counts the open Rounds against the Game count: they fill it and no notice shows, or they leave games to start (#278)', () => {
    expect(blocks(DONE_ONE, { ...RUNNING, ...LEFT_ONE, rounds: [round('o1')] })).not.toContain('sessionNeeded')
    expect(blocks(DONE_ONE, { ...RUNNING, end: { played: 3, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null }, rounds: [round('o1'), round('o2'), round('o3')] })).not.toContain('sessionNeeded')
    expect(blocks(DONE_ONE, { ...RUNNING, end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null }, rounds: [round('o1'), round('o2'), round('o3'), round('o4')] })).toContain('sessionNeeded')
  })

  it('never shows a negative count: open Rounds past the Game count need no notice either (#278)', () => {
    expect(blocks(DONE_ONE, { ...RUNNING, end: { played: 2, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null }, rounds: [1, 2, 3, 4, 5].map(n => round(`o${n}`)) })).not.toContain('sessionNeeded')
  })

  it('lists the notice only in the done state: not while a Session runs, between Sessions, before the first start, in the setup or the finished Event (#278)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)], { ...RUNNING, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([dated('a', 1, SAT, ENDED), undated('b')], { ...RUNNING, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([dated('a', 1, SAT)], LEFT_ONE)).not.toContain('sessionNeeded')
    expect(blocks([undated('a'), undated('b')], LEFT_ONE)).not.toContain('sessionNeeded')
    expect(blocks([undated('a')], { settings: null, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks(DONE_ONE, { ...FINISHED, ...LEFT_ONE })).not.toContain('sessionNeeded')
  })

  it('lists no notice without an end, and none at the maximum of 8 Sessions (#278)', () => {
    expect(blocks(DONE_ONE, RUNNING)).not.toContain('sessionNeeded')
    const seven = Array.from({ length: 7 }, (_, index) => dated(`s${index}`, index + 1, SAT, ENDED))
    const eight = Array.from({ length: 8 }, (_, index) => dated(`s${index}`, index + 1, SAT, ENDED))
    expect(blocks(seven, { ...RUNNING, ...LEFT_ONE })).toContain('sessionNeeded')
    expect(blocks(eight, { ...RUNNING, ...LEFT_ONE })).not.toContain('sessionNeeded')
  })

  it('never lists the notice together with the Tie banner (#278)', () => {
    const list = blocks(DONE_ONE, { ...RUNNING, ...TIE })
    expect(list).toContain('tie')
    expect(list).not.toContain('sessionNeeded')
  })

  it('counts the games to start, never below 0 (#278)', () => {
    expect(gamesToStart({ played: 3, gameCount: 6 }, 0)).toBe(3)
    expect(gamesToStart({ played: 3, gameCount: 6 }, 3)).toBe(0)
    expect(gamesToStart({ played: 2, gameCount: 6 }, 5)).toBe(0)
    expect(gamesToStart({ played: 2, gameCount: 3 }, 0)).toBe(1)
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
    // The news of a finished Event is its winner, not the Sessions card (#277).
    expect(standOut([dated('a', 1, SAT, ENDED)], { event: { phase: 'finished', isHost: false } })).toBe(false)
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
    // kind, started, uneven notice
    ['setup', false, true],
    ['poll', false, true],
    ['teams', false, true],
    ['running', true, false],
    ['between', true, true],
    ['done', true, false],
    ['finished', true, false],
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

  it('shows Kein Termin once the last Session ended and the Host has not finished the Event (#277)', () => {
    expect(headerPill(state([dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })]), 'running', fakeT)).toEqual({ phase: 'draft', label: 'phase.noDate' })
  })

  it('shows the finished Phase\'s own word, Beendet, once the Event is finished (#277)', () => {
    expect(headerPill(state([dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })], { event: { phase: 'finished', isHost: false } }), 'finished', fakeT)).toEqual({ phase: 'finished', label: undefined })
  })

  it('counts the running Session in an Event with several', () => {
    const running = state([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { event: { phase: 'running', isHost: false } })

    expect(headerPill(running, 'running', fakeT)).toEqual({ phase: 'running', label: 'event.pill.running(n=1,total=2)' })
  })

  it('shows no label for the running Session of an Event with one', () => {
    const running = state([dated('a', 1, SAT, { startedAt: SAT })], { event: { phase: 'running', isHost: false } })

    expect(headerPill(running, 'running', fakeT)).toEqual({ phase: 'running', label: undefined })
  })

  it('shows the poll without a label', () => {
    expect(headerPill(state([undated('a'), undated('b')]), 'poll', fakeT)).toEqual({ phase: 'poll', label: undefined })
  })
})
