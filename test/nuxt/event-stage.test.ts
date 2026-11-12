import { describe, expect, it } from 'vitest'
import { eventPageState } from '~/utils/event-page'
import { gamesToStart, RISE_DELAY_MS, risen, stageArrival, stageArrivals, stageBlocks, stageCounted, stageInstants, stageMoments, stageRises, stageUnsettled, type Block, type StageCounted, type StageInput } from '~/utils/event-stage'
import type { EventView } from '~~/shared/event'
import type { ResultView, RoundView, SpinView, VetoView } from '~~/shared/stage'
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

type Fields = Pick<EventOverrides, 'settings' | 'wheel' | 'countdown' | 'coin' | 'setGame' | 'end' | 'rounds' | 'results' | 'bonusVetoes' | 'ceremonyShown'> & { phase?: string, isHost?: boolean, ceremonyHeld?: boolean }

/** The Event read of a page in this state, as the module takes it: the fixture types `phase` as a string. */
function viewOf(sessions: SessionSpec[], { phase = 'poll', isHost = false, ceremonyHeld: _held, ...fields }: Fields = {}): StageInput {
  const missing = sessions.filter(session => session.startsAt === null).length
  return viewWithSessions('stage', sessions, missing, { settings: defaultSettings(), event: { phase, isHost }, ...fields }) as unknown as StageInput
}

// The tests below this line read today's per-state order: `now` 0 lies before every moment of a fixture (#441), so none is counted and nothing lifts.
// The moments and the lifted order are the last describes of the file.
const blocks = (sessions: SessionSpec[], fields: Fields = {}) => eventPageState({ ...viewOf(sessions, fields), ceremonyHeld: fields.ceremonyHeld }, 0).blocks

const ONE_RUNNING = [dated(1, SAT, { startedAt: SAT }), undated()]
const RUNNING: Fields = { phase: 'running' }
const WHEEL: Fields = { wheel: { count: 2, slices: null, spin: null, vetoes: { left: [2, 2], own: null, revealed: null, draw: null } } }
const COUNTDOWN: Fields = { countdown: { durationMs: 60_000, remainingMs: 60_000, startedAt: null, lastStartedAt: null } }
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

  // The finished page waits for the Award ceremony (#445): the card in the place of the actions, the Standings and the history; the Head, the notices and the cards stay.
  describe('the finished page before the Award ceremony has been shown (#445)', () => {
    const WAITING = ['head', 'reopen', 'pending', 'cards']
    const SHOWN = ['head', 'reopen', 'actions', 'standings', 'history', 'cards']

    it('lists the pending card instead of the actions, the Standings and the history while the ceremony has not been started', () => {
      expect(blocks([dated(1, SAT, ENDED)], { ...FINISHED_END, ceremonyShown: false })).toEqual(WAITING)
    })

    it('lists today\'s page once the ceremony has been shown', () => {
      expect(blocks([dated(1, SAT, ENDED)], { ...FINISHED_END, ceremonyShown: true })).toEqual(SHOWN)
    })

    it('counts a view without the field as shown', () => {
      const view: Record<string, unknown> = { ...viewOf([dated(1, SAT, ENDED)], FINISHED_END) }
      delete view.ceremonyShown
      expect(eventPageState(view as unknown as StageInput).blocks).toEqual(SHOWN)
    })

    it('waits for a viewer who holds the first run, although the ceremony has been shown', () => {
      expect(blocks([dated(1, SAT, ENDED)], { ...FINISHED_END, ceremonyShown: true, ceremonyHeld: true })).toEqual(WAITING)
    })

    it('lists the pending card without a Result too', () => {
      expect(blocks([dated(1, SAT, ENDED)], { ...FINISHED, ceremonyShown: false })).toEqual(WAITING)
    })

    it('lists the same blocks for the Host and for a Member', () => {
      const asHost = blocks([dated(1, SAT, ENDED)], { ...FINISHED_END, ceremonyShown: false, isHost: true })
      expect(asHost).toEqual(blocks([dated(1, SAT, ENDED)], { ...FINISHED_END, ceremonyShown: false }))
      expect(asHost).toEqual(WAITING)
    })

    it('changes nothing in the other kinds, whatever the hold says', () => {
      const running = blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS })
      expect(blocks(ONE_RUNNING, { ...RUNNING, ...STANDINGS, ceremonyHeld: true })).toEqual(running)
      expect(running).toContain('standings')
      expect(running).not.toContain('pending')
    })
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

  // A Member's read before the stop carries neither the game nor the window's end (#505): the stop is its only instant, and a read that
  // missed both at the stop waits through the spin's missing game, so the page reads again and gets the end.
  it('reads again at the stop for a Member\'s read before it, with no end of the window yet, and waits there until the game and the end arrive', () => {
    const before = wheelView({
      spin: spin(5000, false),
      vetoes: { left: [1, 1], own: null, revealed: null, draw: { drawId: 'd1', kind: 'spin', stopAt: iso(5000), vetoEndsAt: null, game: null } },
    })

    expect(new Set(instants(before))).toEqual(new Set([NOW + 5000]))
    expect(stageUnsettled(before, NOW + 4999)).toBe(false)
    expect(stageUnsettled(before, NOW + 5000)).toBe(true)
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

// The stage follows the game (#441): a block with a moment that has been counted (moment + 0.5 s <= now) rises under the pinned blocks, newest first; what has no counted
// moment keeps today's order. The moments are the instants the Event read carries, one per piece (event-stage.ts); nothing here reads the game, the Vetoes or a seat.
const at = (epoch: number) => new Date(epoch).toISOString()
/** The epoch ms of a moment `ms` before NOW. */
const ago = (ms: number) => NOW - ms

const wheelWith = ({ spun, set, ...veto }: { spun?: number, set?: number } & Partial<VetoView> = {}): NonNullable<EventView['wheel']> => ({
  count: 3,
  slices: null,
  // A spin written at `spun` starts 1.5 s later and stops 6 s after that.
  spin: spun === undefined ? null : spin(spun - NOW + 7500, true),
  vetoes: {
    left: [1, 1],
    own: null,
    revealed: null,
    draw: set === undefined ? null : { drawId: 'd2', kind: 'set', stopAt: at(set), vetoEndsAt: at(set + 60_000), game },
    ...veto,
  },
})
const roundAt = (id: string, setAt: number): RoundView => ({ ...round(id), setAt: at(setAt) })
const resultAt = (resultAtMs: number, correctedAt: number | null = null): ResultView => ({
  roundId: 'r1', number: 1, game: round('r1').game, places: [], corrected: correctedAt !== null, correctedAt: correctedAt === null ? null : at(correctedAt), resultAt: at(resultAtMs),
})
const countdownAt = (startedAt: number | null, lastStartedAt: number | null = null): NonNullable<EventView['countdown']> => ({
  durationMs: 60_000, remainingMs: 60_000, startedAt: startedAt === null ? null : at(startedAt), lastStartedAt: lastStartedAt === null ? null : at(lastStartedAt),
})
const tossAt = (commit: number): NonNullable<EventView['coin']> => ({ id: 'toss-2', side: 'heads', startedAt: at(commit + 1500), landsAt: at(commit + 5100) })

// A running page with the pieces that have no moment of their own: the wheel (no draw), the pool warning, the Standings' end and a Countdown that never started.
const LIVE: Fields = { ...RUNNING, ...POOL_WARNING, ...STANDINGS, wheel: wheelWith(), countdown: countdownAt(null) }
const BETWEEN = [dated(1, SAT, ENDED), dated(2, SUN)]
const DONE = [dated(1, SAT, ENDED)]
const FINISHED_STAGE: Fields = { phase: 'finished', ...endOf(3, 3) }
/** The blocks of a page at `now` (null: the server render, every moment counted). */
const listAt = (now: number | null, sessions: SessionSpec[], fields: Fields) => eventPageState(viewOf(sessions, fields), now).blocks
const running = (fields: Fields, now: number | null = NOW) => listAt(now, ONE_RUNNING, { ...LIVE, ...fields })
/** Today's order of the same page: `now` 0 lies before every moment. */
const today = (fields: Fields) => listAt(0, ONE_RUNNING, { ...LIVE, ...fields })
const momentsOf = (fields: Fields) => stageMoments(viewOf(ONE_RUNNING, { ...LIVE, ...fields }), 'running')
const PINNED_ON_TOP: Block[] = ['head', 'reopen']
/** `list` with `first` taken to the top under the Head and the Reopen notices, the rest as it was. */
const lifted = (list: Block[], ...first: Block[]) => [...PINNED_ON_TOP, ...first, ...list.filter(block => !PINNED_ON_TOP.includes(block) && !first.includes(block))]

describe('the stage follows the game (#441)', () => {
  it('has today\'s order for every kind when no block has a moment', () => {
    const everything: Fields = { ...WHEEL, ...POOL_WARNING, ...COUNTDOWN, ...STANDINGS }
    const cases: [SessionSpec[], Fields][] = [
      [[undated()], { settings: null }],
      [[undated(), undated()], {}],
      [[dated(1, SAT), undated()], {}],
      [ONE_RUNNING, RUNNING],
      [BETWEEN, RUNNING],
      [DONE, RUNNING],
      [DONE, FINISHED_STAGE],
    ]
    for (const [sessions, fields] of cases) {
      const view = { ...everything, ...fields }
      expect(listAt(NOW, sessions, view)).toEqual(listAt(0, sessions, view))
      expect(listAt(null, sessions, view)).toEqual(listAt(0, sessions, view))
    }
    expect(running({})).toEqual(['head', 'reopen', 'wheel', 'rounds', 'standings', 'pool', 'countdown', 'board', 'poll', 'cards'])
  })

  describe('the moment of each trigger lifts its block', () => {
    const cases: [string, Fields, Block][] = [
      ['a spin (its commit)', { wheel: wheelWith({ spun: ago(1000) }) }, 'wheel'],
      ['a set game with a Veto window (its stop, which is its commit)', { wheel: wheelWith({ set: ago(1000) }) }, 'wheel'],
      ['a settled Round', { rounds: [roundAt('o1', ago(1000))] }, 'rounds'],
      ['a Result', { results: [resultAt(ago(1000))] }, 'standings'],
      ['a Correction', { results: [resultAt(ago(60_000), ago(1000))] }, 'standings'],
      ['a Countdown start or resume', { countdown: countdownAt(ago(1000), ago(1000)) }, 'countdown'],
      ['a Countdown start by the build before the switch-over (startedAt only)', { countdown: countdownAt(ago(1000), null) }, 'countdown'],
      ['a toss (its commit)', { coin: tossAt(ago(1000)) }, 'coin'],
    ]
    for (const [name, fields, block] of cases) {
      it(`lifts ${block} for ${name}, under the Head and the Reopen notices`, () => {
        expect(running(fields)).toEqual(lifted(today(fields), block))
        expect(running(fields).indexOf(block)).toBe(2)
      })
    }

    it('lifts a Countdown above the wheel, the open Rounds and the Standings, where today it sits below them', () => {
      expect(running({ countdown: countdownAt(ago(1000), ago(1000)) })).toEqual(['head', 'reopen', 'countdown', 'wheel', 'rounds', 'standings', 'pool', 'board', 'poll', 'cards'])
    })

    it('lifts the Standings above the wheel and an older open Round, where today they sit below', () => {
      expect(running({ results: [resultAt(ago(1000))], rounds: [roundAt('o1', ago(9000))] })).toEqual(['head', 'reopen', 'standings', 'rounds', 'wheel', 'pool', 'countdown', 'board', 'poll', 'cards'])
    })

    it('reads a spin\'s commit and not its stop: a spin with a window lifts at the commit, 7.5 s before the wheel stops', () => {
      const wheel = wheelWith({ spun: ago(10_000), draw: { drawId: 'd1', kind: 'spin', stopAt: at(ago(2500)), vetoEndsAt: at(ago(2500) + 60_000), game } })
      expect(momentsOf({ wheel })).toEqual({ wheel: ago(10_000) })
    })

    it('takes the later of a spin and a set game for the wheel', () => {
      expect(momentsOf({ wheel: wheelWith({ spun: ago(10_000), set: ago(3000) }) })).toEqual({ wheel: ago(3000) })
      expect(momentsOf({ wheel: wheelWith({ spun: ago(3000), set: ago(10_000) }) })).toEqual({ wheel: ago(3000) })
    })
  })

  describe('the order of several moments', () => {
    it('puts the newest first', () => {
      expect(running({ results: [resultAt(ago(2000))], countdown: countdownAt(ago(1000), ago(1000)) }))
        .toEqual(['head', 'reopen', 'countdown', 'standings', 'wheel', 'rounds', 'pool', 'board', 'poll', 'cards'])
      expect(running({ results: [resultAt(ago(1000))], countdown: countdownAt(ago(2000), ago(2000)) }))
        .toEqual(['head', 'reopen', 'standings', 'countdown', 'wheel', 'rounds', 'pool', 'board', 'poll', 'cards'])
    })

    it('puts three in the order of their moments, and the blocks without one after them in today\'s order', () => {
      expect(running({ coin: tossAt(ago(3000)), results: [resultAt(ago(2000))], rounds: [roundAt('o1', ago(1000))] }))
        .toEqual(['head', 'reopen', 'rounds', 'standings', 'coin', 'wheel', 'pool', 'countdown', 'board', 'poll', 'cards'])
      expect(running({ coin: tossAt(ago(1000)), results: [resultAt(ago(2000))], rounds: [roundAt('o1', ago(3000))] }))
        .toEqual(['head', 'reopen', 'coin', 'standings', 'rounds', 'wheel', 'pool', 'countdown', 'board', 'poll', 'cards'])
    })

    it('keeps today\'s order for equal moments', () => {
      const same: Fields = { wheel: wheelWith({ spun: ago(1000) }), rounds: [roundAt('o1', ago(1000))], results: [resultAt(ago(1000))] }
      expect(running(same)).toEqual(['head', 'reopen', 'wheel', 'rounds', 'standings', 'pool', 'countdown', 'board', 'poll', 'cards'])
      const later: Fields = { results: [resultAt(ago(1000))], countdown: countdownAt(ago(1000), ago(1000)), coin: tossAt(ago(1000)) }
      expect(running(later)).toEqual(['head', 'reopen', 'standings', 'countdown', 'coin', 'wheel', 'rounds', 'pool', 'board', 'poll', 'cards'])
    })

    it('counts a moment at exactly now - 500 ms and not at now - 499 ms', () => {
      expect(running({ results: [resultAt(ago(RISE_DELAY_MS))] }).indexOf('standings')).toBe(2)
      expect(running({ results: [resultAt(ago(RISE_DELAY_MS - 1))] })).toEqual(today({ results: [resultAt(ago(RISE_DELAY_MS - 1))] }))
    })

    it('counts every moment at now null (the server render, a hidden tab), also one that lies after the page\'s clock', () => {
      const fields = { results: [resultAt(NOW + 10_000)] }
      expect(running(fields, null).indexOf('standings')).toBe(2)
      expect(running(fields, NOW)).toEqual(today(fields))
    })

    it('reads the same at any later time: news that arrives late is counted at once, and a reload shows the order of someone who watched', () => {
      const fields = { results: [resultAt(ago(2000))], coin: tossAt(ago(5000)) }
      expect(running(fields, NOW + 60_000)).toEqual(running(fields, null))
      expect(running(fields, NOW)).toEqual(running(fields, null))
    })
  })

  describe('what stays where it is', () => {
    const MOMENTS: Fields = {
      wheel: wheelWith({ spun: ago(1000) }),
      rounds: [roundAt('o1', ago(2000))],
      results: [resultAt(ago(3000))],
      countdown: countdownAt(ago(4000), ago(4000)),
      coin: tossAt(ago(5000)),
    }

    it('keeps the Head, the Reopen notices and the Tie banner in front of every moment, for a Member', () => {
      expect(listAt(NOW, ONE_RUNNING, { ...LIVE, ...MOMENTS, ...TIE })).toEqual(['head', 'reopen', 'tie', 'wheel', 'rounds', 'standings', 'countdown', 'coin', 'pool', 'board', 'poll', 'cards'])
      expect(listAt(NOW, DONE, { ...RUNNING, ...MOMENTS, ...TIE })).toEqual(['head', 'reopen', 'tie', 'rounds', 'standings', 'cards', 'board'])
      expect(listAt(NOW, BETWEEN, { ...RUNNING, ...TIE, results: [resultAt(ago(1000))] })).toEqual(['head', 'reopen', 'tie', 'standings', 'rounds', 'cards', 'stay', 'board'])
    })

    it('keeps the Host\'s Session notice in front of every moment', () => {
      const host: Fields = { ...RUNNING, isHost: true, ...endOf(2, 3), results: [resultAt(ago(1000))] }
      expect(listAt(NOW, DONE, host)).toEqual(['head', 'reopen', 'sessionNeeded', 'standings', 'rounds', 'cards', 'board'])
      expect(listAt(0, DONE, host)).toEqual(['head', 'reopen', 'sessionNeeded', 'rounds', 'standings', 'cards', 'board'])
    })

    it('never raises the Game board, the Date poll or the Sessions cards, with every moment present: while a Session runs, between Sessions and after the last', () => {
      expect(listAt(NOW, ONE_RUNNING, { ...LIVE, ...MOMENTS }).slice(-3)).toEqual(['board', 'poll', 'cards'])
      expect(listAt(NOW, [dated(1, SAT, ENDED), undated()], { ...RUNNING, ...MOMENTS, ...STANDINGS })).toEqual(['head', 'reopen', 'rounds', 'standings', 'cards', 'stay', 'board', 'poll'])
      expect(listAt(NOW, BETWEEN, { ...RUNNING, ...MOMENTS, ...STANDINGS })).toEqual(['head', 'reopen', 'rounds', 'standings', 'cards', 'stay', 'board'])
      expect(listAt(NOW, DONE, { ...RUNNING, ...MOMENTS, ...STANDINGS })).toEqual(['head', 'reopen', 'rounds', 'standings', 'cards', 'board'])
    })

    it('never reorders a finished Event: no moment is read', () => {
      const withMoments: Fields = { ...FINISHED_STAGE, ...MOMENTS }
      expect(listAt(NOW, DONE, withMoments)).toEqual(['head', 'reopen', 'actions', 'standings', 'history', 'cards'])
      expect(listAt(null, DONE, withMoments)).toEqual(listAt(0, DONE, withMoments))
      expect(stageMoments(viewOf(DONE, withMoments), 'finished')).toEqual({})
      expect(stageRises(viewOf(DONE, withMoments), 'finished')).toEqual([])
    })

    it('has no moment for a block the kind does not list: the wheel, the Countdown and the coin between Sessions', () => {
      expect(stageMoments(viewOf(BETWEEN, { ...RUNNING, ...STANDINGS, ...MOMENTS }), 'between')).toEqual({ rounds: ago(2000), standings: ago(3000) })
    })
  })

  describe('what is not a moment', () => {
    it('keeps a paused Countdown where it rose: its last start survives the pause', () => {
      const started = countdownAt(ago(10_000), ago(10_000))
      const paused: NonNullable<EventView['countdown']> = { ...started, startedAt: null, remainingMs: 40_000 }
      expect(momentsOf({ countdown: paused })).toEqual({ countdown: ago(10_000) })
      expect(running({ countdown: paused })).toEqual(running({ countdown: started }))
      expect(running({ countdown: paused }).indexOf('countdown')).toBe(2)
    })

    it('keeps a Countdown that reached zero where it is, and does not lift it again', () => {
      const countdown = countdownAt(ago(70_000), ago(70_000))
      expect(momentsOf({ countdown })).toEqual({ countdown: ago(70_000) })
      expect(running({ countdown }, NOW - 65_000)).toEqual(running({ countdown }, NOW + 65_000))
    })

    it('takes the later of startedAt and lastStartedAt: the build before the switch-over writes startedAt only', () => {
      expect(momentsOf({ countdown: countdownAt(ago(1000), ago(5000)) }).countdown).toBe(ago(1000))
      expect(momentsOf({ countdown: countdownAt(ago(5000), ago(1000)) }).countdown).toBe(ago(1000))
      expect(momentsOf({ countdown: countdownAt(null, ago(5000)) }).countdown).toBe(ago(5000))
      expect(momentsOf({ countdown: countdownAt(ago(5000), null) }).countdown).toBe(ago(5000))
      expect(momentsOf({ countdown: countdownAt(null, null) }).countdown).toBeUndefined()
    })

    it('does not lift the wheel for a set game without a Veto window (it has no draw in the read)', () => {
      expect(momentsOf({})).toEqual({})
      expect(running({ wheel: wheelWith({ draw: null }) })).toEqual(today({}))
    })

    it('does not move for a Bonus Veto', () => {
      const bonus = { bonusVetoes: { left: [1, 0], granted: [] } } as unknown as Fields
      const moments: Fields = { results: [resultAt(ago(1000))], countdown: countdownAt(ago(2000), ago(2000)) }
      expect(running({ ...moments, ...bonus })).toEqual(running(moments))
      expect(momentsOf({ ...moments, ...bonus })).toEqual(momentsOf(moments))
    })

    it('does not move for a Veto cast: the Vetoes left, the own cast and the revealed ones feed no moment (a lift would tell the other Parties, #355)', () => {
      const before = wheelWith({ spun: ago(1000) })
      const cast = wheelWith({ spun: ago(1000), left: [0, 1], own: { team: 1, cast: true, rejection: null }, revealed: [{ team: 1 }] })
      expect(momentsOf({ wheel: cast })).toEqual(momentsOf({ wheel: before }))
      const moments: Fields = { results: [resultAt(ago(500))] }
      expect(running({ ...moments, wheel: cast })).toEqual(running({ ...moments, wheel: before }))
    })

    it('reads the latest settle of the open Rounds: a put-back of the older of two moves nothing', () => {
      const two = [roundAt('o1', ago(5000)), roundAt('o2', ago(2000))]
      expect(momentsOf({ rounds: two })).toEqual({ rounds: ago(2000) })
      expect(momentsOf({ rounds: [two[1]!] })).toEqual({ rounds: ago(2000) })
    })
  })

  describe('the edges', () => {
    it('has no moment for no open Round, and the latest settle for one or two', () => {
      expect(momentsOf({ rounds: [] }).rounds).toBeUndefined()
      expect(momentsOf({ rounds: [roundAt('o1', ago(4000))] }).rounds).toBe(ago(4000))
      expect(momentsOf({ rounds: [roundAt('o1', ago(4000)), roundAt('o2', ago(1000))] }).rounds).toBe(ago(1000))
      expect(momentsOf({ rounds: [roundAt('o2', ago(1000)), roundAt('o1', ago(4000))] }).rounds).toBe(ago(1000))
    })

    it('has no moment for no Result, and the latest Result or Correction for one or two', () => {
      expect(momentsOf({ results: [] }).standings).toBeUndefined()
      expect(momentsOf({ results: [resultAt(ago(4000))] }).standings).toBe(ago(4000))
      expect(momentsOf({ results: [resultAt(ago(9000), ago(2000))] }).standings).toBe(ago(2000))
      expect(momentsOf({ results: [resultAt(ago(9000), ago(2000)), resultAt(ago(4000))] }).standings).toBe(ago(2000))
      expect(momentsOf({ results: [resultAt(ago(9000), ago(5000)), resultAt(ago(1000))] }).standings).toBe(ago(1000))
    })

    it('has no moment for a wheel with no spin, no wheel, or a coin with no toss', () => {
      expect(momentsOf({ wheel: wheelWith() }).wheel).toBeUndefined()
      expect(momentsOf({ wheel: null }).wheel).toBeUndefined()
      expect(momentsOf({ coin: null }).coin).toBeUndefined()
    })

    it('reads the moment of a toss as its commit, 1.5 s before the coin flies', () => {
      expect(momentsOf({ coin: tossAt(ago(4000)) }).coin).toBe(ago(4000))
    })

    it('reads a missing list of Rounds and Results as none (the Host dock passes neither)', () => {
      const view = { ...viewOf(ONE_RUNNING, LIVE), rounds: undefined, results: undefined } as StageInput
      expect(stageMoments(view, 'running')).toEqual({})
      expect(stageBlocks(view, 'running', NOW)).toEqual(today({}))
    })
  })

  describe('the instants the page waits for', () => {
    it('lists one rise per moment, half a second after it', () => {
      const view = viewOf(ONE_RUNNING, { ...LIVE, results: [resultAt(ago(2000))], coin: tossAt(ago(1000)) })
      expect(stageRises(view, 'running').sort()).toEqual([ago(2000) + RISE_DELAY_MS, ago(1000) + RISE_DELAY_MS])
    })

    it('lists none without a moment, and none for a finished Event', () => {
      expect(stageRises(viewOf(ONE_RUNNING, LIVE), 'running')).toEqual([])
      expect(stageRises(viewOf(DONE, { ...FINISHED_STAGE, results: [resultAt(ago(1000))] }), 'finished')).toEqual([])
    })

    it('has the moments of the blocks the kind lists only', () => {
      const view = viewOf(BETWEEN, { ...RUNNING, ...STANDINGS, coin: tossAt(ago(1000)), results: [resultAt(ago(3000))] })
      expect(stageRises(view, 'between')).toEqual([ago(3000) + RISE_DELAY_MS])
    })
  })

  describe('the blocks that moved up', () => {
    it('names a block that rose past another', () => {
      expect(risen(['head', 'wheel', 'rounds', 'standings'], ['head', 'standings', 'wheel', 'rounds'])).toEqual(['standings'])
    })

    it('names two blocks that each rose', () => {
      expect(risen(['wheel', 'rounds', 'standings', 'pool'], ['rounds', 'wheel', 'pool', 'standings']).sort()).toEqual(['pool', 'rounds'])
    })

    it('does not name a block that only shifted down because another rose, or up because another left', () => {
      expect(risen(['head', 'wheel', 'rounds', 'standings'], ['head', 'standings', 'wheel', 'rounds'])).not.toContain('wheel')
      expect(risen(['head', 'wheel', 'rounds'], ['head', 'rounds'])).toEqual([])
    })

    it('names nothing for equal lists, and nothing for a block that is in one list only', () => {
      expect(risen(['head', 'wheel'], ['head', 'wheel'])).toEqual([])
      expect(risen(['head', 'rounds'], ['head', 'coin', 'rounds'])).toEqual([])
      expect(risen(['head', 'coin', 'rounds'], ['head', 'rounds'])).toEqual([])
      expect(risen([], ['head'])).toEqual([])
    })

    it('names the block that rose when another sank below it', () => {
      expect(risen(['head', 'standings', 'wheel'], ['head', 'wheel', 'standings'])).toEqual(['wheel'])
    })
  })
})

// What the page has counted (#442): a read never lowers a block the page already shows risen, and the Standings' arrival on top is the instant their sequence waits for.
describe('what the page has counted (#442)', () => {
  const SETTLE = 410
  const view = (fields: Fields = {}) => viewOf(ONE_RUNNING, { ...LIVE, ...fields })
  const blocksAt = (now: number | null, fields: Fields, counted?: StageCounted) => stageBlocks(view(fields), 'running', now, counted)
  const standingsNew: Fields = { results: [resultAt(ago(100))] }

  describe('the order with `counted`', () => {
    it('keeps a block whose newer moment is not counted yet where its last counted moment put it', () => {
      expect(blocksAt(NOW, standingsNew, { standings: ago(60_000) })).toEqual(lifted(today(standingsNew), 'standings'))
    })

    it('drops the block into its rank place without `counted`: today\'s behaviour, pinned', () => {
      expect(blocksAt(NOW, standingsNew)).toEqual(today(standingsNew))
    })

    it('orders equal keys by rank, and by key before that', () => {
      const fields: Fields = { ...standingsNew, countdown: countdownAt(ago(100)) }
      expect(blocksAt(NOW, fields, { standings: ago(5000), countdown: ago(5000) })).toEqual(lifted(today(fields), 'standings', 'countdown'))
      expect(blocksAt(NOW, fields, { standings: ago(5000), countdown: ago(4000) })).toEqual(lifted(today(fields), 'countdown', 'standings'))
    })

    it('counts a moment that is counted at `now` whatever `counted` says: the truth wins', () => {
      expect(blocksAt(NOW, { results: [resultAt(ago(2000))] }, { standings: ago(60_000) })).toEqual(lifted(today({}), 'standings'))
      expect(blocksAt(null, { countdown: countdownAt(ago(100)) }, {})).toEqual(lifted(today({}), 'countdown'))
    })

    it('does not change a finished Event, which has no moments', () => {
      const finished = viewOf(DONE, { ...FINISHED_STAGE, results: [resultAt(ago(100))] })
      expect(stageBlocks(finished, 'finished', NOW, { standings: ago(5000) })).toEqual(stageBlocks(finished, 'finished', NOW))
    })
  })

  describe('the counted moments', () => {
    it('counts the moments that are counted at `now`, and all of them for a null clock', () => {
      const fields: Fields = { results: [resultAt(ago(2000))], countdown: countdownAt(ago(100)) }
      expect(stageCounted(view(fields), 'running', NOW)).toEqual({ standings: ago(2000) })
      expect(stageCounted(view(fields), 'running', null)).toEqual({ standings: ago(2000), countdown: ago(100) })
    })

    it('keeps what was counted for a moment that is not counted yet, and never lowers it', () => {
      const before = { standings: ago(60_000) }
      expect(stageCounted(view(standingsNew), 'running', NOW, before)).toBe(before)
      expect(stageCounted(view(standingsNew), 'running', NOW + RISE_DELAY_MS, before)).toEqual({ standings: ago(100) })
    })

    it('takes a lower moment that is counted: a put-back lowers a block, as #441 accepts', () => {
      expect(stageCounted(view({ results: [resultAt(ago(5000))] }), 'running', NOW, { standings: ago(1000) })).toEqual({ standings: ago(5000) })
    })

    it('drops the blocks the kind does not list and the pieces without a moment', () => {
      const before = { coin: ago(9000), wheel: ago(9000), standings: ago(9000) }
      expect(stageCounted(view({ results: [resultAt(ago(2000))] }), 'running', NOW, before)).toEqual({ standings: ago(2000) })
      expect(stageCounted(viewOf(BETWEEN, { ...RUNNING, ...STANDINGS, results: [resultAt(ago(2000))] }), 'between', NOW, { coin: ago(1) })).toEqual({ standings: ago(2000) })
    })

    it('returns `before` itself when nothing changed', () => {
      const before = { standings: ago(2000) }
      expect(stageCounted(view({ results: [resultAt(ago(2000))] }), 'running', NOW, before)).toBe(before)
    })
  })

  describe('the arrival of a block on top', () => {
    const resultNow = ago(100)
    const moving: Fields = { results: [resultAt(resultNow)], countdown: countdownAt(ago(5000)) }

    it('is the end of the glide when the rise moves the block: the rise plus the settle', () => {
      expect(stageArrival(view(moving), 'running', 'standings', SETTLE)).toBe(resultNow + RISE_DELAY_MS + SETTLE)
    })

    it('is the rise itself when the block is on top already', () => {
      expect(stageArrival(view({ results: [resultAt(resultNow)] }), 'running', 'standings', SETTLE, { standings: ago(60_000) })).toBe(resultNow + RISE_DELAY_MS)
    })

    it('moves for a block that another one rose above after its last Result', () => {
      // The Countdown rose after the first Result and sits above the Standings; the second Result lifts them above it.
      expect(stageArrival(view(moving), 'running', 'standings', SETTLE, { standings: ago(60_000), countdown: ago(5000) })).toBe(resultNow + RISE_DELAY_MS + SETTLE)
    })

    it('is its own rise when another block is rising: a Countdown at T and a Result at T + 200', () => {
      const countdownMoment = ago(1000)
      const own = countdownMoment + 200
      expect(stageArrival(view({ countdown: countdownAt(countdownMoment), results: [resultAt(own)] }), 'running', 'standings', SETTLE, { standings: ago(60_000) }))
        .toBe(own + RISE_DELAY_MS + SETTLE)
    })

    it('is null without a moment, for a block the kind does not list and for a finished Event', () => {
      expect(stageArrival(view(), 'running', 'standings', SETTLE)).toBeNull()
      expect(stageArrival(view(), 'running', 'coin', SETTLE)).toBeNull()
      expect(stageArrival(viewOf(DONE, { ...FINISHED_STAGE, results: [resultAt(ago(100))] }), 'finished', 'standings', SETTLE)).toBeNull()
    })

    it('says an instant in the past for a Result read late: nothing is left to wait for', () => {
      expect(stageArrival(view({ results: [resultAt(ago(60_000))], countdown: countdownAt(ago(70_000)) }), 'running', 'standings', SETTLE)).toBeLessThan(NOW)
    })

    it('lists the arrival of the blocks something waits for, and of the listed ones only', () => {
      expect(stageArrivals(view(moving), 'running', SETTLE)).toEqual({ standings: resultNow + RISE_DELAY_MS + SETTLE })
      expect(stageArrivals(view({ countdown: countdownAt(ago(100)) }), 'running', SETTLE)).toEqual({})
      expect(stageArrivals(viewOf([dated(1, SAT), undated()], { results: [resultAt(ago(100))] }), 'teams', SETTLE)).toEqual({})
    })
  })
})
