import { inArray } from 'drizzle-orm'
import { games } from '../db/schema'
import { WHEEL_UNKNOWN } from '../domain/wheel'
import { drawGameKnown, windowEnded } from '../../shared/draw-timeline'
import { isOpen, poolWarning, roundsStarted, waitsForRespin, type PoolWarning } from '../../shared/rounds'
import { runningOf } from '../../shared/session-state'
import type { EventView } from '../../shared/event'
import type { BonusVetoView, ResultView, RoundView, VetoView, WheelView } from '../../shared/stage'
import type { RoundGame } from '../../shared/game'
import { leadersOf, outcomeOf } from '../../shared/finish'
import { pointsForPlace } from '../../shared/results'
import { eventHasWheel } from '../../shared/settings'
import type { Db } from './db'
import type { EventRow } from './event-access'
import {
  bonusCountsOf,
  bonusVetoReason,
  finishReason,
  gamesLeftOf,
  hasParts,
  lastGameReason,
  partyOf,
  roundBeingDrawnOf,
  roundRowsOf,
  setReason,
  spinReason,
  vetoReason,
  vetoesLeftCounting,
  type EventState,
  type StatePart,
} from './event-state'
import type { Viewer } from './event-read'
import { roundGameView } from './library'
import { readClip } from './clip'
import { countdownView, readCountdown } from './countdown'
import { coinView } from './coin'
import { ceremonyShownOf, ceremonyViewOf } from './ceremony'
import type { DrawRow } from './rounds'
import { knownVetoRows } from './vetoes'

// The stage sections of the Event read (#256, review 0.7 Q1): the round family, the Results, the Standings and the end (#274),
// the Lucky Wheel, the clip, the Countdown, the Coin flip, the Award ceremony and the Bonus Vetoes. Each section takes the same context and returns
// its own fields of EventView; the handler (server/api/e/[slug].get.ts) runs them together. A new stage piece is one entry in `stageSections`.
// The facts come from the Event state the handler read once (event-state.ts, #416): the sections read no fact of their own, and every reason
// the dock shows is the state's rule that the route enforces. The state holds the writer's truth (all draws and their games, every Veto cast);
// what a viewer may know of it is the step each section takes on top (drawGameKnown, knownVetoRows). What stays a read of its own is what no
// rule asks: the wheel's slices and cards, the clip's draw and the Countdown's row.

/** The parts the Event read always reads, at the same time as the poll's rows. */
export const READ_PARTS = ['sessions', 'members', 'teams', 'rounds', 'toss'] as const satisfies readonly StatePart[]
export type ReadState = EventState<(typeof READ_PARTS)[number]>

/**
 * What every stage section reads from: the request's Event, its state, the viewer and the request's clock. The state has the parts of
 * READ_PARTS and, for the viewers who need them, `stageParts`.
 */
export interface StageContext { db: Db, eventRow: EventRow, state: ReadState, viewer: Viewer, now: Date }
/** One piece of the stage in the Event read: returns its own fields of the view. */
export type StageSection = (ctx: StageContext) => Promise<Partial<EventView>>

/**
 * The stage's sections, run together by the Event read. A new piece is one entry here. A tuple, not a `StageSection[]`,
 * so `StageFields` below can be derived from what each section returns (review 0.8 Q7).
 */
export const stageSections = [roundsSection, resultsSection, clipSection, countdownSection, coinSection, ceremonySection] as const satisfies readonly StageSection[]

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never

/**
 * The fields the stage sections give the view together, derived from their return types: the handler's `{ ...fixed, ...stage }` is checked
 * against EventView, so a section that forgets one of its fields fails `pnpm typecheck`, not only the integration test (review 0.8 Q7).
 */
export type StageFields = UnionToIntersection<Awaited<ReturnType<(typeof stageSections)[number]>>>

/**
 * The parts the stage and the floors need on top of READ_PARTS for this viewer (#416): nothing for a Member who does not see the wheel
 * (roundsSection reads and returns the open Rounds only), the Vetoes and the Game pool for the Host (the floors count the Vetoes, the games left
 * come from the pool), and the Bonus Vetoes with them on a Lucky Wheel Event; the same for a Member of a Lucky Wheel Event with a Running Session.
 */
export function stageParts(state: ReadState, viewer: Viewer): StatePart[] {
  const lucky = eventHasWheel(state.settings)
  const onWheel = lucky && runningOf(state.sessions) !== undefined
  if (!viewer.isHost && !onWheel) return []
  return lucky ? ['vetoes', 'bonus', 'pool'] : ['vetoes', 'pool']
}

/** A state that lacks a part the viewer needs: the handler did not read `stageParts` (a bug, not a request's fault). */
function lacking(parts: string): never {
  throw new Error(`The Event state lacks ${parts} for this viewer: the Event read reads stageParts first (#416)`)
}

/**
 * The open Rounds (#228), in start order, and for the Host the answer to setting the next game. A set game is visible to
 * every Member from the moment it is set, with the Pool preview off and under a Hidden wheel alike, and its Game notes are
 * the Host's alone (decided 2026-11-01). Nothing else about the pools reaches a Member through here. A Round that is being drawn
 * is not listed: its game is not known yet; the read settles a draw that is due before this runs (settleBeforeRead, #229).
 * The Lucky Wheel (#229) comes with them, since it reads the same draws and the games left. The Host's reasons are the state's rules
 * (setReason, spinReason), the ones the routes enforce.
 */
export async function roundsSection({ db, state, viewer, now }: StageContext): Promise<Pick<EventView, 'rounds' | 'setGame' | 'wheel' | 'roundBeingDrawn' | 'bonusVetoes'>> {
  const roundRows = roundRowsOf(state)
  const open: RoundView[] = state.rounds.flatMap(({ round, game }) => (isOpen(round) && game
    ? [{ id: round.id, startedAt: round.startedAt.toISOString(), setAt: round.setAt!.toISOString(), game: roundGameView(game), ...(viewer.isHost && game.notes ? { notes: game.notes } : {}) }]
    : []))
  const { settings } = state
  const lucky = eventHasWheel(settings)
  const onWheel = lucky && runningOf(state.sessions) !== undefined
  if (!viewer.isHost && !onWheel) return { rounds: open, setGame: null, wheel: null, roundBeingDrawn: false, bonusVetoes: null }
  if (!hasParts(state, ['vetoes', 'pool'])) return lacking('the Vetoes and the Game pool')
  const withBonus = lucky ? (hasParts(state, ['bonus']) ? state : lacking('the Bonus Vetoes')) : null
  const draws = state.draws
  const left = gamesLeftOf(state)
  // Another Party's cast on a draw whose window still runs does not exist for this viewer (knownVetoRows, shared with the pool warning): the
  // Vetoes left a viewer reads are counted from the casts they may know, never from vetoesLeftOf, which counts the sealed ones (CODING_STANDARDS § Secrecy).
  const vetoesLeft = withBonus ? vetoesLeftCounting(withBonus, knownVetoRows(withBonus.vetoes, draws, partyOf(state, viewer.id), now)) : null
  return {
    rounds: open,
    roundBeingDrawn: viewer.isHost && roundBeingDrawnOf(state),
    setGame: viewer.isHost
      ? { rejection: setReason(state, true), spinRejection: spinReason(state, true), respin: roundRows.some(round => waitsForRespin(round, draws)), left, poolWarning: poolWarningOf(state, viewer, vetoesLeft, left) }
      : null,
    wheel: settings !== null && withBonus && vetoesLeft && onWheel ? await wheelView(db, withBonus, viewer, now, settings.hiddenWheel, left, vetoesLeft) : null,
    bonusVetoes: withBonus && viewer.isHost ? bonusVetoView(withBonus) : null,
  }
}

/**
 * The Results, the Standings and the end of the Event (#274, spec #272). Every Member reads the same Standings and end, the Host and a
 * Player alike. A Result names a game, so each one goes through #258's one rule: its game is listed only when `drawGameKnown` says the
 * viewer may know it (the Host always, a Player from the draw's stop on; a Round's game is the one of its set draw). The Standings and
 * the count take every Round with a Result, also one the gate leaves out: points are not secret. `end` says whether the Host may finish (#277)
 * and add the last game (#278): the Host's rejections only (finishReason, lastGameReason, the rules the routes enforce); a Member gets `finish: null` and `lastGame: null`.
 */
export async function resultsSection({ state, viewer, now }: { state: EventState<'rounds'>, viewer: Viewer, now: Date }): Promise<Pick<EventView, 'results' | 'standings' | 'end'>> {
  const { settings, standing } = state
  if (settings === null || standing === null) return { results: [], standings: null, end: null }
  const results: ResultView[] = []
  for (const { round, game, places } of state.results) {
    const draw = state.draws.find(row => row.roundId === round.id && row.gameId === round.gameId)
    if (!game || !draw || !drawGameKnown({ isHost: viewer.isHost, draw, now })) continue
    // The last Correction's instant goes on the wire (#276): a second Correction of a Round changes nothing else a Member can see.
    const correctedAt = round.correctedAt?.toISOString() ?? null
    results.push({
      roundId: round.id,
      number: round.number!,
      game: roundGameView(game),
      places: places.map(({ team, place, score }) => ({ team, place, points: pointsForPlace(place, settings.pointsTable), score })),
      corrected: correctedAt !== null,
      correctedAt,
      resultAt: round.resultAt!.toISOString(),
    })
  }
  const { standings, end } = standing
  // The Host's part (#277): why the finish is refused now, for the outcome and the winners the Standings call for. Nobody else gets one, so null never means „you may“.
  const finish = viewer.isHost ? { rejection: finishReason(state, true, { outcome: outcomeOf(end), winners: leadersOf(standings) }) } : null
  // The Host's part (#278): why the last game cannot be added now. The rule the route checks too, so the dock and the route agree.
  const lastGame = viewer.isHost ? { rejection: lastGameReason(state, true) } : null
  return { results, standings, end: { ...end, finish, lastGame } }
}

/**
 * The Vetoes of the Lucky Wheel for one viewer (#231, spec #218 § Vetoes: sealed until the end of the window). A Veto cast on a
 * draw whose window still runs is the casting Party's own business: it counts toward `left` and shows as cast only for that
 * Party's Players. From `vetoEndsAt` on (the draw is settled by then, settleBeforeRead) every Party's Vetoes count and the
 * Vetoes of the window's draw are listed by Party. Which Player cast one never leaves the server (#355). The Stands, and a Host outside the teams, get no own part.
 * The window's draw (#232) is the Event's latest draw of any kind, a spin or a game the Host set, and only while it has a window
 * (wheelView picks it): a later draw without one takes the panel away. `game` is its card, already cut to what the viewer may know.
 * `left` is counted from the casts the viewer may know. `own.rejection` is the state's vetoReason: it depends on the viewer's own Party only (its cast
 * on the draw, its Vetoes left), which the seal never changes.
 */
function vetoView(state: ReadState & EventState<'vetoes' | 'bonus'>, viewer: Viewer, now: Date, windowDraw: DrawRow | undefined, game: RoundGame | null, left: number[]): VetoView {
  const viewerTeam = partyOf(state, viewer.id)
  const castOnDraw = state.vetoes.filter(row => row.drawId === windowDraw?.id)
  const own = viewerTeam === null
    ? null
    : {
        team: viewerTeam,
        // The viewer's own Party only (the seal): castOnDraw holds other Parties' sealed casts while the window runs.
        cast: castOnDraw.some(row => row.team === viewerTeam),
        rejection: vetoReason(state, viewer.id, windowDraw ?? null),
      }
  const revealed = windowDraw && windowEnded(windowDraw, now) ? castOnDraw.map(({ team }) => ({ team })).sort((a, b) => a.team - b.team) : null
  const draw = windowDraw ? { drawId: windowDraw.id, kind: windowDraw.kind, stopAt: windowDraw.stopAt.toISOString(), vetoEndsAt: windowDraw.vetoEndsAt!.toISOString(), game } : null
  return { left, own, revealed, draw }
}

/**
 * The Host's pool warning (#234, spec #218 § Pool warning): the games left against the games the Host may still need. The Vetoes count
 * as the Host may know them (`vetoesLeft`, counted from knownVetoRows): a Veto cast on a draw whose window still runs counts only when the Host plays in that
 * Party, so the warning does not flip when someone casts a sealed Veto. Under Host pick the Vetoes part drops out (`vetoesLeft` null). Only the Host reads it,
 * and only while the Event runs (the setup hint covers the rest).
 */
function poolWarningOf(state: EventState<'rounds'>, viewer: Viewer, vetoesLeft: number[] | null, left: readonly string[]): PoolWarning | null {
  const { settings, draws } = state
  if (!viewer.isHost || state.eventRow.phase !== 'running' || settings === null) return null
  const roundRows = roundRowsOf(state)
  return poolWarning({
    left: left.length,
    gameCount: settings.gameCount,
    roundsStarted: roundsStarted(roundRows),
    roundsWaiting: roundRows.filter(round => waitsForRespin(round, draws)).length,
    vetoesLeft,
  })
}

/**
 * The Lucky Wheel of a running Session, for one viewer (#229, spec #218 § Hidden wheel on the wire). The Host and every Member
 * of a visible wheel get the names of the slices; a Member under a Hidden wheel gets the count and, for a spin, the placeholders
 * of that spin, and the drawn game's name and card only from the stop instant on, the Host's always. Nothing about any other
 * game reaches that Member: the games are selected only when the viewer may read them.
 */
async function wheelView(db: Db, state: ReadState & EventState<'vetoes' | 'bonus'>, viewer: Viewer, now: Date, hidden: boolean, left: readonly string[], vetoesLeft: number[]): Promise<WheelView> {
  const { draws } = state
  const latestFirst = [...draws].sort((a, b) => b.committedAt.getTime() - a.committedAt.getTime() || (a.id < b.id ? 1 : -1))
  const spin = latestFirst.find(draw => draw.kind === 'spin')
  // The Veto window's draw (#232): the latest draw of any kind, when it has a window.
  const windowDraw = latestFirst[0]?.vetoEndsAt ? latestFirst[0] : undefined
  const spinKnown = spin !== undefined && drawGameKnown({ isHost: viewer.isHost, draw: spin, now })
  const sees = viewer.isHost || !hidden
  const ids = new Set<string>()
  if (sees) for (const id of [...left, ...(spin?.sliceGameIds ?? [])]) ids.add(id)
  if (spin && spinKnown) ids.add(spin.gameId)
  // A game the Host set is known from its stop (the set instant) on, the one thing of the pool a Member under a Hidden wheel learns from it.
  const windowGameKnown = windowDraw !== undefined && drawGameKnown({ isHost: viewer.isHost, draw: windowDraw, now })
  if (windowDraw && windowGameKnown) ids.add(windowDraw.gameId)
  const found = ids.size === 0 ? [] : await db.select().from(games).where(inArray(games.id, [...ids]))
  const byId = new Map(found.map(game => [game.id, game]))
  const nameOf = (id: string) => byId.get(id)?.name ?? ''
  const drawn = spin ? byId.get(spin.gameId) : undefined
  const windowGame = windowDraw && windowGameKnown ? byId.get(windowDraw.gameId) : undefined
  return {
    count: left.length,
    slices: sees ? left.map(id => ({ id, name: nameOf(id) })) : null,
    spin: spin
      ? {
          roundId: spin.roundId,
          drawId: spin.id,
          spinStartAt: spin.spinStartAt!.toISOString(),
          stopAt: spin.stopAt.toISOString(),
          slices: spin.sliceGameIds!.length,
          resultIndex: spin.resultIndex!,
          resultOffset: spin.resultOffset!,
          // The stored placeholders keep their order; the result slice's turns real at the stop. A spin from a visible wheel that was hidden since has none.
          labels: sees
            ? spin.sliceGameIds!.map(nameOf)
            : (spin.sliceLabels ?? spin.sliceGameIds!.map(() => WHEEL_UNKNOWN)).map((label, index) => (spinKnown && index === spin.resultIndex ? nameOf(spin.gameId) : label)),
          // The names of a visible wheel are public, the drawn card is not: a Member gets it from the stop on.
          game: drawn && spinKnown ? roundGameView(drawn) : null,
          // The result card follows the latest draw: a later set, a veto or a put back takes it away (F6).
          current: latestFirst[0]?.id === spin.id && spin.outcome !== 'vetoed' && state.rounds.some(({ round }) => round.id === spin.roundId && round.putBackAt === null),
        }
      : null,
    vetoes: vetoView(state, viewer, now, windowDraw, windowGame ? roundGameView(windowGame) : null, vetoesLeft),
  }
}

/** The clip that runs now (#230, spec #218 § Clip): every Member gets the same one while a Session runs, from the draw's stop on. */
export async function clipSection({ db, eventRow, state, now }: StageContext): Promise<Pick<EventView, 'clip'>> {
  return { clip: await readClip(db, eventRow.id, state.sessions, now) }
}

/**
 * The Countdown (#236, spec #218 § Countdown): every Member gets it while a Session runs, and nothing otherwise, even when a row
 * was left behind (the Session end deletes it, but the read does not rely on that).
 */
export async function countdownSection({ db, eventRow, state }: StageContext): Promise<Pick<EventView, 'countdown'>> {
  if (!runningOf(state.sessions)) return { countdown: null }
  const row = await readCountdown(db, eventRow.id)
  return { countdown: row ? countdownView(row) : null }
}

/**
 * The Coin flip (#235, spec #218 § Coin flip): the Event's latest toss while a Session runs, for every Member; null otherwise. Its
 * side is in the read for everybody, since the page shows it only from the landing on (the room carries it too).
 */
export async function coinSection({ state }: StageContext): Promise<Pick<EventView, 'coin'>> {
  return { coin: state.toss ? coinView(state.toss) : null }
}

/** The Award ceremony (#309, spec #308): the latest start of a finished Event, identical for every viewer (nothing in it is secret); null before the first start. */
export async function ceremonySection({ eventRow, state }: StageContext): Promise<Pick<EventView, 'ceremony' | 'ceremonyShown'>> {
  // The end of a run depends on how many Parties are on rank 1 (#315): the Standings of the Results, which a finished Event never changes.
  const winners = state.standing === null ? 0 : leadersOf(state.standing.standings).length
  return { ceremony: ceremonyViewOf(eventRow, winners), ceremonyShown: ceremonyShownOf(eventRow) }
}

/**
 * The Bonus Vetoes (#233, spec #218 § Bonus Vetoes): the Host gets how many each Party has, and the Event-level reason it cannot grant
 * one now, while the Event has a Lucky Wheel (the caller asks only then). Null for every other viewer, and for an Event without the wheel or without settings.
 */
function bonusVetoView(state: EventState<'bonus'>): BonusVetoView | null {
  if (state.settings === null || !eventHasWheel(state.settings)) return null
  return { granted: bonusCountsOf(state), rejection: bonusVetoReason(state, true, null) }
}
