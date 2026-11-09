import { mountSuspended } from '@nuxt/test-utils/runtime'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { BoardTeam, MemberView } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import type { ResultView, RoundView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { kitty } from './auth'
import { LARSI, memberView, restoreScreen, SANNE, serve, viewWithSessions, type EventOverrides } from './event-page'

// What the composition tests of the Event page share (event-page-composition, -stage and -standings tests, #283): an Event in one state of the page,
// the page mounted one at a time, and the read after a Result. The Event read's own fixtures are event-page.ts's.

export const FIRST = '2026-10-30T19:00:00.000Z'
export const SECOND = '2026-10-31T19:00:00.000Z'
export const STARTED = '2026-10-30T19:34:00.000Z'
export const ENDED = '2026-10-30T22:12:00.000Z'

export type Seat = { zone: 'bench' | 'stands' | 'team', team?: number }
export const team = (position: number, name: string | null = null): BoardTeam => ({ position, name, frozen: false })

/** Kitty, Larsi and Sanne (the Host) with the seats a test gives them; everyone else sits on the Bench. */
export function members(seats: { kitty?: Seat, larsi?: Seat, sanne?: Seat } = {}): MemberView[] {
  const member = (id: string, name: string, isHost: boolean, seat: Seat = { zone: 'bench' }) => memberView({
    id, name, isHost, zone: seat.zone, team: seat.zone === 'team' ? seat.team ?? 1 : null,
  })
  return [member(kitty.id, 'Kitty', false, seats.kitty), member(LARSI, 'Larsi', false, seats.larsi), member(SANNE, 'Sanne', true, seats.sanne)]
}

export type SessionSpec = Parameters<typeof viewWithSessions>[1]
export interface Setup {
  sessions: SessionSpec
  missing: number
  host?: boolean
  settings?: boolean
  phase?: string
  teamChoiceOpen?: boolean
  running?: number
  overrides?: EventOverrides
}

/** An Event in one state of the page: the Sessions as the server sends them, set up unless the test says not. */
export function serveState({ sessions, missing, host = false, settings = true, phase = 'poll', teamChoiceOpen = false, running, overrides = {} }: Setup) {
  return serve(slug => viewWithSessions(slug, sessions, missing, {
    event: { phase, isHost: host },
    settings: settings ? defaultSettings() : null,
    teams: settings ? [team(1), team(2)] : [],
    teamChoiceOpen,
    members: members(),
    ...(running === undefined ? {} : { runningSessionId: `session-${slug}-${running}` }),
    ...overrides,
  }))
}

export const SESSION = (number: number, startsAt: string | null, times: { startedAt?: string, endedAt?: string } = {}) => ({ number: startsAt === null ? null : number, startsAt, ...times })

// One page at a time: the page follows the route, so a second mount would move the first, and an old page only slows the tests down.
let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined
/** The page `mount` mounted last. */
export const mountedPage = () => mounted

/** Unmounts it and puts the screen and the body back: every composition file's `afterEach`. */
export function unmountPage() {
  mounted?.unmount()
  mounted = undefined
  restoreScreen()
  document.body.innerHTML = ''
}

export async function mount(slug: string) {
  mounted?.unmount()
  // Vue Test Utils stubs TransitionGroup with an element of its own, which would take the place of the Leaderboard's `tbody`: the real one renders it.
  const page = await mountSuspended(EventPage, { route: `/e/${slug}`, global: { stubs: { TransitionGroup: false } } })
  mounted = page
  return page
}

export const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
/** A Round that is open with the Event's first Result entered: the Standings are there and the Rounds follow the Host's next game. */
export const openRound: RoundView = { id: 'r2', startedAt: STARTED, setAt: STARTED, game: { ...halo, id: 'g-kart', name: 'Kart' } }
export const played: ResultView = { roundId: 'r1', number: 1, game: halo, places: [{ team: 2, place: 1, points: 1, score: null }, { team: 1, place: 2, points: 0, score: null }], corrected: false, correctedAt: null, resultAt: STARTED }
/** The read after one Result (team 2 won) with one more Round open. */
export const afterResult: EventOverrides = {
  rounds: [openRound],
  results: [played],
  standings: [{ team: 2, rank: 1, points: 1 }, { team: 1, rank: 2, points: 0 }],
  end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
}
