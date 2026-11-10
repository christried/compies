import { describe, expect, it } from 'vitest'
import { eventPageState } from '~/utils/event-page'
import { gamesToStart, stageInstants, stageUnsettled, type StageInput } from '~/utils/event-stage'
import type { EventView } from '~~/shared/event'
import type { RoundView, SpinView, VetoView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { SPIN } from '../draw-offsets'
import { viewWithSessions, type EventOverrides } from './event-page'

// The Stage module's interface (#415): which blocks a page kind lists for a view, in which order, and the instants the page reads again at.
// Function calls on the fixture's Event read, no mounting: the nuxt project only because the fixture imports the Nuxt runtime.
// The rendered order is pinned by event-page-composition, -stage and -standings tests.

const SAT = '2090-10-25T18:30:00.000Z'
const SUN = '2090-10-26T18:30:00.000Z'
const ENDED = { startedAt: SAT, endedAt: SUN }

type SessionSpec = Parameters<typeof viewWithSessions>[1][number]
const dated = (number: number | null, startsAt: string, times: { startedAt?: string, endedAt?: string } = {}): SessionSpec => ({ startsAt, number, ...times })
const undated = (): SessionSpec => ({ startsAt: null, number: null })

type Fields = Pick<EventOverrides, 'settings' | 'wheel' | 'countdown' | 'coin' | 'setGame' | 'end' | 'rounds'> & { phase?: string, isHost?: boolean }

/** The Event read of a page in this state, as the module takes it: the fixture types `phase` as a string. */
function viewOf(sessions: SessionSpec[], { phase = 'poll', isHost = false, ...fields }: Fields = {}): StageInput {
  const missing = sessions.filter(session => session.startsAt === null).length
  return viewWithSessions('stage', sessions, missing, { settings: defaultSettings(), event: { phase, isHost }, ...fields }) as unknown as StageInput
}

const blocks = (sessions: SessionSpec[], fields: Fields = {}) => eventPageState(viewOf(sessions, fields)).blocks

const ONE_RUNNING = [dated(1, SAT, { startedAt: SAT }), undated()]
const RUNNING: Fields = { phase: 'running' }
const WHEEL: Fields = { wheel: { count: 2, slices: null, spin: null, vetoes: { left: [2, 2], own: null, revealed: null, draw: null } } }
const COUNTDOWN: Fields = { countdown: { durationMs: 60_000, remainingMs: 60_000, startedAt: null } }
const TOSS: Fields = { coin: { id: 'toss-1', side: 'heads', startedAt: SAT, landsAt: SUN } }
const POOL_WARNING: Fields = { setGame: { rejection: null, spinRejection: null, respin: false, left: [], poolWarning: { needed: 10, have: 2 } } }
const endOf = (played: number, gameCount: number, tie: number[] | null = null): Fields => ({ end: { played, gameCount, complete: played >= gameCount, tie, finish: null, lastGame: null } })
const STANDINGS = endOf(1, 6)
const TIE = endOf(3, 3, [1, 2])
const LEFT_ONE = endOf(2, 3)
const round = (id: string): RoundView => ({ id, startedAt: SAT, setAt: SAT, game: { id: `g-${id}`, name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null } })

describe('the blocks of the stage', () => {
  it('puts the poll first while no Session is dated, then the Game board and the cards', () => {
    expect(blocks([undated(), undated()])).toEqual(['head', 'reopen', 'poll', 'board', 'cards'])
  })

  it('puts the Game board first once a Session is dated, with the poll of another one below it', () => {
    expect(blocks([dated(1, SAT), undated()])).toEqual(['head', 'reopen', 'seat', 'board', 'poll', 'cards'])
  })

  it('has no poll once every Session is dated', () => {
    expect(blocks([dated(1, SAT), dated(2, SUN)], { phase: 'date_set' })).toEqual(['head', 'reopen', 'seat', 'board', 'cards'])
  })

  it('shows the open Rounds above the Game board while a Session runs and between Sessions (#273), not before the first start', () => {
    expect(blocks(ONE_RUNNING, RUNNING)).toEqual(['head', 'reopen', 'rounds', 'board', 'poll', 'cards'])
    expect(blocks([dated(1, SAT, ENDED), dated(2, SUN)], RUNNING)).toContain('rounds')
    expect(blocks([dated(1, SAT)])).not.toContain('rounds')
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
    const cases: [SessionSpec[], Fields][] = [
      [[undated(), undated()], {}],
      [[dated(1, SAT)], {}],
      [[dated(1, SAT, ENDED), dated(2, SUN)], {}],
      [[dated(1, SAT, ENDED)], {}],
      [[undated()], { settings: null }],
    ]
    for (const [sessions, fields] of cases) {
      const list = blocks(sessions, { ...everything, ...fields })
      for (const block of ['wheel', 'pool', 'countdown', 'coin']) expect(list).not.toContain(block)
    }
  })

  it('puts the open Rounds and then the cards first between two Sessions, with the notice that the teams stay (#273)', () => {
    expect(blocks([dated(1, SAT, ENDED), dated(2, SUN)], RUNNING)).toEqual(['head', 'reopen', 'rounds', 'cards', 'stay', 'board'])
  })

  it('keeps the poll below the board between two Sessions while another one waits for its Date', () => {
    expect(blocks([dated(1, SAT, ENDED), undated()], RUNNING)).toEqual(['head', 'reopen', 'rounds', 'cards', 'stay', 'board', 'poll'])
  })

  it('ends with the open Rounds, the cards and the board after the last Session (#273)', () => {
    expect(blocks([dated(1, SAT, ENDED)], RUNNING)).toEqual(['head', 'reopen', 'rounds', 'cards', 'board'])
  })

  // The Standings (#274): a stage block once the first Result exists, right after the open Rounds, in every state a Result can exist in.
  it('lists the Standings right after the open Rounds once a Result exists, while a Session runs (#274)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).toEqual(['head', 'reopen', 'rounds', 'standings', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...WHEEL, ...POOL_WARNING, ...COUNTDOWN, ...TOSS, ...STANDINGS }))
      .toEqual(['head', 'reopen', 'wheel', 'rounds', 'standings', 'pool', 'countdown', 'coin', 'board', 'poll', 'cards'])
  })

  it('lists the Standings between two Sessions and after the last one, after the open Rounds (#274)', () => {
    expect(blocks([dated(1, SAT, ENDED), dated(2, SUN)], { ...RUNNING, ...STANDINGS })).toEqual(['head', 'reopen', 'rounds', 'standings', 'cards', 'stay', 'board'])
    expect(blocks([dated(1, SAT, ENDED)], { ...RUNNING, ...STANDINGS, isHost: true })).toEqual(['head', 'reopen', 'sessionNeeded', 'rounds', 'standings', 'cards', 'board'])
  })

  it('lists no Standings before the first Result, whether the view has an end with nothing played or none (#274)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...endOf(0, 6) })).not.toContain('standings')
    expect(blocks(ONE_RUNNING, { ...RUNNING, end: null })).not.toContain('standings')
  })

  it('lists no Standings in the poll, teams and setup states (#274)', () => {
    expect(blocks([undated(), undated()], STANDINGS)).not.toContain('standings')
    expect(blocks([dated(1, SAT)], STANDINGS)).not.toContain('standings')
    expect(blocks([undated()], { settings: null, ...STANDINGS })).not.toContain('standings')
  })

  // The finished Event (#277): the Standings and the history are the stage; no board, no open Rounds, no poll.
  const FINISHED: Fields = { phase: 'finished' }
  const FINISHED_END: Fields = { ...FINISHED, ...endOf(3, 3) }

  it('lists the actions, the Standings and the history on the finished stage, with the Sessions card at the end (#277)', () => {
    expect(blocks([dated(1, SAT, ENDED)], FINISHED_END)).toEqual(['head', 'reopen', 'actions', 'standings', 'history', 'cards'])
  })

  it('lists neither Standings nor history on the finished stage without a Result, and none of the live blocks in any case (#277)', () => {
    expect(blocks([dated(1, SAT, ENDED)], FINISHED)).toEqual(['head', 'reopen', 'cards'])
    const list = blocks([dated(1, SAT, ENDED)], { ...WHEEL, ...COUNTDOWN, ...TOSS, ...POOL_WARNING, ...FINISHED_END })
    for (const block of ['board', 'rounds', 'poll', 'wheel', 'pool', 'countdown', 'coin', 'stay', 'seat', 'setup']) expect(list).not.toContain(block)
  })

  it('lists the actions of the finished stage (Bild teilen, #313) right after the reopen notices, in no other kind, and not without a Result', () => {
    expect(blocks([dated(1, SAT, ENDED)], FINISHED_END).slice(0, 3)).toEqual(['head', 'reopen', 'actions'])
    expect(blocks([dated(1, SAT, ENDED)], FINISHED)).not.toContain('actions')
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).not.toContain('actions')
    expect(blocks([dated(1, SAT, ENDED)], { ...RUNNING, ...STANDINGS })).not.toContain('actions')
  })

  it('has no history block before the Event is finished (#277)', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).not.toContain('history')
  })

  // A Tie (#278): the banner is the news of the stage and sits right under the Head and the reopen notices, wherever the Host's dock offers
  // „Unentschieden beenden“ (running, between, done), and in no other kind: a finished Event keeps `end.tie`, but nobody decides any more.
  it('lists the Tie banner right after the reopen notices while a Session runs, between Sessions and after the last one', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'board', 'poll', 'cards'])
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...WHEEL, ...TIE })).toEqual(['head', 'reopen', 'tie', 'wheel', 'rounds', 'standings', 'board', 'poll', 'cards'])
    expect(blocks([dated(1, SAT, ENDED), dated(2, SUN)], { ...RUNNING, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'cards', 'stay', 'board'])
    expect(blocks([dated(1, SAT, ENDED)], { ...RUNNING, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'cards', 'board'])
  })

  it('lists the Tie banner from the Event read\'s tie, and no banner without a Tie, or in a finished Event', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })).not.toContain('tie')
    expect(blocks(ONE_RUNNING, { ...RUNNING, end: null })).not.toContain('tie')
    expect(blocks([dated(1, SAT, ENDED)], { ...FINISHED, ...TIE })).toEqual(['head', 'reopen', 'actions', 'standings', 'history', 'cards'])
  })

  // #283: the banner is for who reads it. The Host decides and has the dock, so the page state does not list it for the Host (the template checks nothing of its own).
  it('lists the Tie banner for a Member and not for the Host', () => {
    const states: [SessionSpec[], Fields][] = [
      [ONE_RUNNING, { ...RUNNING, ...TIE }],
      [[dated(1, SAT, ENDED), dated(2, SUN)], { ...RUNNING, ...TIE }],
      [[dated(1, SAT, ENDED)], { ...RUNNING, ...TIE }],
    ]
    for (const [sessions, fields] of states) {
      expect(blocks(sessions, { ...fields, isHost: false })).toContain('tie')
      expect(blocks(sessions, { ...fields, isHost: true })).not.toContain('tie')
    }
  })

  it('lists the banner in no state before a Session started', () => {
    expect(blocks([undated(), undated()], TIE)).not.toContain('tie')
    expect(blocks([dated(1, SAT)], TIE)).not.toContain('tie')
    expect(blocks([undated()], { settings: null, ...TIE })).not.toContain('tie')
  })

  // The dead end (#278): every Session ended, the Game count is not reached and no open Round fills it, so the last game needs a new Session.
  // The notice is the Host's piece (#415): a Member's list has none.
  const DONE_ONE = [dated(1, SAT, ENDED)]
  const HOST: Fields = { ...RUNNING, isHost: true }

  it('lists the session-needed notice right under the reopen notices after the last Session, before the open Rounds (#278)', () => {
    expect(blocks(DONE_ONE, { ...HOST, ...LEFT_ONE })).toEqual(['head', 'reopen', 'sessionNeeded', 'rounds', 'standings', 'cards', 'board'])
  })

  it('lists no session-needed notice for a Member in the same state (#415)', () => {
    expect(blocks(DONE_ONE, { ...RUNNING, ...LEFT_ONE })).toEqual(['head', 'reopen', 'rounds', 'standings', 'cards', 'board'])
  })

  it('counts the open Rounds against the Game count: they fill it and no notice shows, or they leave games to start (#278)', () => {
    expect(blocks(DONE_ONE, { ...HOST, ...LEFT_ONE, rounds: [round('o1')] })).not.toContain('sessionNeeded')
    expect(blocks(DONE_ONE, { ...HOST, ...endOf(3, 6), rounds: [round('o1'), round('o2'), round('o3')] })).not.toContain('sessionNeeded')
    expect(blocks(DONE_ONE, { ...HOST, ...endOf(0, 6), rounds: [round('o1'), round('o2'), round('o3'), round('o4')] })).toContain('sessionNeeded')
  })

  it('never shows a negative count: open Rounds past the Game count need no notice either (#278)', () => {
    expect(blocks(DONE_ONE, { ...HOST, ...endOf(2, 6), rounds: [1, 2, 3, 4, 5].map(n => round(`o${n}`)) })).not.toContain('sessionNeeded')
  })

  it('lists the notice only in the done state: not while a Session runs, between Sessions, before the first start, in the setup or the finished Event (#278)', () => {
    expect(blocks(ONE_RUNNING, { ...HOST, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([dated(1, SAT, ENDED), dated(2, SUN)], { ...HOST, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([dated(1, SAT, ENDED), undated()], { ...HOST, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([dated(1, SAT)], { isHost: true, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([undated(), undated()], { isHost: true, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks([undated()], { isHost: true, settings: null, ...LEFT_ONE })).not.toContain('sessionNeeded')
    expect(blocks(DONE_ONE, { isHost: true, ...FINISHED, ...LEFT_ONE })).not.toContain('sessionNeeded')
  })

  it('lists no notice without an end, and none at the maximum of 8 Sessions (#278)', () => {
    expect(blocks(DONE_ONE, HOST)).not.toContain('sessionNeeded')
    const seven = Array.from({ length: 7 }, (_, index) => dated(index + 1, SAT, ENDED))
    const eight = Array.from({ length: 8 }, (_, index) => dated(index + 1, SAT, ENDED))
    expect(blocks(seven, { ...HOST, ...LEFT_ONE })).toContain('sessionNeeded')
    expect(blocks(eight, { ...HOST, ...LEFT_ONE })).not.toContain('sessionNeeded')
  })

  it('never lists the notice together with the Tie banner (#278)', () => {
    for (const isHost of [true, false]) {
      const list = blocks(DONE_ONE, { ...RUNNING, ...TIE, isHost })
      expect(list.includes('tie') && list.includes('sessionNeeded')).toBe(false)
    }
    expect(blocks(DONE_ONE, { ...RUNNING, ...TIE })).toContain('tie')
  })

  it('asks the Event to be set up first, and shows the poll when one is open', () => {
    expect(blocks([undated()], { settings: null })).toEqual(['head', 'reopen', 'setup', 'poll', 'board', 'cards'])
  })

  it('lists no Event data in an Event with nothing in it: the setup and the finished stage without a Result', () => {
    expect(blocks([undated()], { settings: null })).toEqual(['head', 'reopen', 'setup', 'poll', 'board', 'cards'])
    expect(blocks([dated(1, SAT, ENDED)], FINISHED)).toEqual(['head', 'reopen', 'cards'])
  })

  it('still lists the pool warning for a Member view that carries one: the data decides, not who reads it', () => {
    expect(blocks(ONE_RUNNING, { ...RUNNING, ...POOL_WARNING, isHost: false })).toContain('pool')
  })

  it('counts open Rounds at 0, 1 and past the Game count against the notice, with 3 games played of 3', () => {
    const left = (rounds: RoundView[]) => blocks(DONE_ONE, { ...HOST, ...endOf(1, 3), rounds })
    expect(left([])).toContain('sessionNeeded')
    expect(left([round('o1')])).toContain('sessionNeeded')
    expect(left([round('o1'), round('o2')])).not.toContain('sessionNeeded')
    expect(left([round('o1'), round('o2'), round('o3')])).not.toContain('sessionNeeded')
  })

  // Every piece has its data: one list per page kind, the table of the module (#415). A new piece is a row there, and shows up here.
  describe('with every piece present', () => {
    const everything: Fields = { ...WHEEL, ...POOL_WARNING, ...COUNTDOWN, ...TOSS }

    it('lists the setup page', () => {
      expect(blocks([undated()], { settings: null, ...everything, ...STANDINGS })).toEqual(['head', 'reopen', 'setup', 'poll', 'board', 'cards'])
    })

    it('lists the poll page', () => {
      expect(blocks([undated(), undated()], { ...everything, ...STANDINGS })).toEqual(['head', 'reopen', 'poll', 'board', 'cards'])
    })

    it('lists the teams page', () => {
      expect(blocks([dated(1, SAT), undated()], { ...everything, ...STANDINGS })).toEqual(['head', 'reopen', 'seat', 'board', 'poll', 'cards'])
    })

    it('lists the running page', () => {
      expect(blocks(ONE_RUNNING, { ...RUNNING, ...everything, ...TIE })).toEqual(['head', 'reopen', 'tie', 'wheel', 'rounds', 'standings', 'pool', 'countdown', 'coin', 'board', 'poll', 'cards'])
    })

    it('lists the page between two Sessions', () => {
      expect(blocks([dated(1, SAT, ENDED), undated()], { ...RUNNING, ...everything, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'cards', 'stay', 'board', 'poll'])
    })

    it('lists the page after the last Session, with a Tie for a Member', () => {
      expect(blocks(DONE_ONE, { ...RUNNING, ...everything, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'cards', 'board'])
    })

    it('lists the page after the last Session, with games left for the Host', () => {
      expect(blocks(DONE_ONE, { ...HOST, ...everything, ...endOf(2, 3) })).toEqual(['head', 'reopen', 'sessionNeeded', 'rounds', 'standings', 'cards', 'board'])
    })

    it('lists the finished page', () => {
      expect(blocks(DONE_ONE, { ...FINISHED_END, ...everything })).toEqual(['head', 'reopen', 'actions', 'standings', 'history', 'cards'])
    })
  })
})

describe('the games to start', () => {
  it('counts the games to start, never below 0 (#278)', () => {
    expect(gamesToStart({ played: 3, gameCount: 6 }, 0)).toBe(3)
    expect(gamesToStart({ played: 3, gameCount: 6 }, 3)).toBe(0)
    expect(gamesToStart({ played: 2, gameCount: 6 }, 5)).toBe(0)
    expect(gamesToStart({ played: 2, gameCount: 3 }, 0)).toBe(1)
  })
})

// When a read still misses what a passed instant decides (review 0.7, F13): the page reads again while this holds. The edges of
// "passed" (stop, end, to the millisecond) are the Draw timeline's, pinned in draw-timeline.test.ts; here one case per branch.
const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const game = { id: 'g1', name: 'Halo' } as NonNullable<SpinView['game']>

const spin = (stopOffset: number, withGame: boolean): SpinView => ({
  roundId: 'r1', drawId: 'd1', spinStartAt: iso(stopOffset - 6000), stopAt: iso(stopOffset), slices: 4, resultIndex: 1, resultOffset: 0.5, labels: null, game: withGame ? game : null, current: true,
})
const vetoes = (draw: { endsOffset: number } | null, revealed: VetoView['revealed']): VetoView => ({
  left: [1, 1], own: null, revealed, draw: draw && { drawId: 'd1', kind: 'spin', stopAt: iso(draw.endsOffset - 60_000), vetoEndsAt: iso(draw.endsOffset), game },
})
const wheelView = (wheel: { spin?: SpinView | null, vetoes?: VetoView } | null): Pick<EventView, 'wheel'> => ({
  wheel: wheel && { count: 3, slices: null, spin: wheel.spin ?? null, vetoes: wheel.vetoes ?? vetoes(null, null) },
})

const coinOf = (landOffset: number): NonNullable<EventView['coin']> => ({ id: 'toss-1', side: 'heads', startedAt: iso(landOffset - 2000), landsAt: iso(landOffset) })
const ceremonyOf = (endOffset: number): NonNullable<EventView['ceremony']> => ({ startsAt: iso(endOffset - 5050), endsAt: iso(endOffset), gag: 'trip' })
const clipOf = (endOffset: number): NonNullable<EventView['clip']> => ({ drawId: 'd1', startAt: iso(endOffset - 60_000), endsAt: iso(endOffset), game })

/** The order of the instants is not meaningful: compare sorted. */
const instants = (view: Partial<EventView>) => stageInstants(view).sort((a, b) => a - b)

describe('the instants of the stage', () => {
  it('has the spin\'s stop as an instant (#256)', () => {
    expect(instants(wheelView({ spin: spin(1000, true) }))).toEqual([NOW + 1000])
  })

  it('has the Veto window\'s end as an instant (#256)', () => {
    expect(instants(wheelView({ vetoes: vetoes({ endsOffset: 2000 }, null) }))).toEqual([NOW + 2000])
  })

  it('has the coin\'s landing as an instant (#256)', () => {
    expect(instants({ coin: coinOf(3000) })).toEqual([NOW + 3000])
  })

  it('has the clip\'s end as an instant (#256)', () => {
    expect(instants({ clip: clipOf(4000) })).toEqual([NOW + 4000])
  })

  it('has the end of the ceremony as an instant, so the dock reads again when it is free (#309)', () => {
    expect(instants({ ceremony: ceremonyOf(5000) })).toEqual([NOW + 5000])
    expect(instants({ ceremony: null })).toEqual([])
  })

  it('has one instant per piece that has one', () => {
    const wheel = wheelView({ spin: spin(1000, true), vetoes: vetoes({ endsOffset: 2000 }, null) })
    expect(instants({ ...wheel, coin: coinOf(3000), clip: clipOf(4000), ceremony: ceremonyOf(5000) })).toEqual([NOW + 1000, NOW + 2000, NOW + 3000, NOW + 4000, NOW + 5000])
  })

  it('has none without a wheel, a toss or a clip, and none for a wheel without a spin or a window', () => {
    expect(instants({})).toEqual([])
    expect(instants({ wheel: null, coin: null, clip: null })).toEqual([])
    expect(instants(wheelView({ spin: null, vetoes: vetoes(null, null) }))).toEqual([])
  })
})

describe('a read that still waits for a passed instant', () => {
  it('waits for a spin whose stop has passed but which carries no game for this viewer', () => {
    expect(stageUnsettled(wheelView({ spin: spin(-1, false) }), NOW)).toBe(true)
  })

  it('is settled before the stop, and once the spin carries its game (the Host has it from the start)', () => {
    expect(stageUnsettled(wheelView({ spin: spin(5000, false) }), NOW)).toBe(false)
    expect(stageUnsettled(wheelView({ spin: spin(-1, true) }), NOW)).toBe(false)
  })

  it('waits for a Veto window whose end has passed but whose Vetoes are not revealed', () => {
    expect(stageUnsettled(wheelView({ vetoes: vetoes({ endsOffset: -1 }, null) }), NOW)).toBe(true)
  })

  it('is settled while the window runs, once the Vetoes are revealed (also none), and without a window', () => {
    expect(stageUnsettled(wheelView({ vetoes: vetoes({ endsOffset: 5000 }, null) }), NOW)).toBe(false)
    expect(stageUnsettled(wheelView({ vetoes: vetoes({ endsOffset: -1 }, []) }), NOW)).toBe(false)
    expect(stageUnsettled(wheelView({ vetoes: vetoes({ endsOffset: -1 }, [{ team: 1 }]) }), NOW)).toBe(false)
    expect(stageUnsettled(wheelView({}), NOW)).toBe(false)
  })

  // The edges of "passed" are inclusive: at the stop instant itself the game is known, and a window that ends exactly now has ended.
  it('waits at the stop instant itself and not one ms before it', () => {
    expect(stageUnsettled(wheelView({ spin: spin(SPIN.stop, false) }), NOW + SPIN.stop)).toBe(true)
    expect(stageUnsettled(wheelView({ spin: spin(SPIN.stop, false) }), NOW + SPIN.stop - 1)).toBe(false)
  })

  it('waits for a window that ends exactly now and not for one that ends the next ms', () => {
    expect(stageUnsettled(wheelView({ vetoes: vetoes({ endsOffset: SPIN.end }, null) }), NOW + SPIN.end)).toBe(true)
    expect(stageUnsettled(wheelView({ vetoes: vetoes({ endsOffset: SPIN.end }, null) }), NOW + SPIN.end - 1)).toBe(false)
  })

  it('is settled without a wheel', () => {
    expect(stageUnsettled(wheelView(null), NOW)).toBe(false)
  })
})
