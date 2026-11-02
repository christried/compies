import { inArray } from 'drizzle-orm'
import { games } from '../db/schema'
import { WHEEL_UNKNOWN } from '../domain/wheel'
import { drawGameKnown } from '../domain/pool-preview'
import { bonusVetoCounts, bonusVetoRejection, gamesLeft, isBeingDrawn, isOpen, poolWarning, roundsStarted, vetoRejection, waitsForRespin, type PoolWarning } from '../../shared/rounds'
import { runningOf } from '../../shared/session-state'
import { placeOf } from '../../shared/board'
import type { EventView } from '../../shared/event'
import type { BonusVetoView, RoundView, VetoView, WheelView } from '../../shared/stage'
import type { RoundGame } from '../../shared/game'
import { eventHasWheel, settingsFromRow, type EventSettings } from '../../shared/settings'
import type { Db } from './db'
import type { EventRow } from './event-access'
import type { EventRows, Viewer } from './event-read'
import { roundGameView } from './library'
import { readClip } from './clip'
import { countdownView, readCountdown } from './countdown'
import { coinView, readShownToss } from './coin'
import { readDraws, readGamePool, setRejectionOf, spinRejectionOf, type DrawRow, type RoundRow } from './rounds'
import { knownVetoRows, partyVetoesLeft, readBonusTeams, readVetoes, type VetoRow } from './vetoes'

// The stage sections of the Event read (#256, review 0.7 Q1): the round family, the Lucky Wheel, the clip, the Countdown,
// the Coin flip and the Bonus Vetoes. Each section takes the same context and returns its own fields of EventView;
// the handler (server/api/e/[slug].get.ts) runs them together. A new stage piece is one entry in `stageSections`.
// Rows that more than one section needs are read once, in roundsSection's first Promise.all (the Vetoes and the Bonus rows
// with the draws and the pool), and passed on; the other sections read what they need themselves.

/** What every stage section reads from: the request's Event, its shared rows, the viewer and the request's clock. */
export interface StageContext { db: Db, eventRow: EventRow, rows: EventRows, viewer: Viewer, now: Date }
/** One piece of the stage in the Event read: returns its own fields of the view. */
export type StageSection = (ctx: StageContext) => Promise<Partial<EventView>>

/** The stage's sections, run together by the Event read. A new piece (results, standings, end, ceremony) is one entry here. */
export const stageSections: StageSection[] = [roundsSection, clipSection, countdownSection, coinSection]

/**
 * The open Rounds (#228), in start order, and for the Host the answer to setting the next game. A set game is visible to
 * every Member from the moment it is set, with the Pool preview off and under a Hidden wheel alike, and its Game notes are
 * the Host's alone (decided 2026-11-01). Nothing else about the pools reaches a Member through here. A Round that is being drawn
 * is not listed: its game is not known yet; the read settles a draw that is due before this runs (settleBeforeRead, #229).
 * The Lucky Wheel (#229) comes with them, since it reads the same draws and the games left.
 */
export async function roundsSection({ db, eventRow, rows, viewer, now }: StageContext): Promise<Pick<EventView, 'rounds' | 'setGame' | 'wheel' | 'roundBeingDrawn' | 'bonusVetoes'>> {
  const roundRows = rows.rounds.map(({ round }) => round)
  const open: RoundView[] = rows.rounds.flatMap(({ round, game }) => (isOpen(round) && game
    ? [{ id: round.id, startedAt: round.startedAt.toISOString(), setAt: round.setAt!.toISOString(), game: roundGameView(game), ...(viewer.isHost && game.notes ? { notes: game.notes } : {}) }]
    : []))
  const settings = settingsFromRow(eventRow)
  const lucky = eventHasWheel(settings)
  const onWheel = lucky && runningOf(rows.sessions) !== undefined
  if (!viewer.isHost && !onWheel) return { rounds: open, setGame: null, wheel: null, roundBeingDrawn: false, bonusVetoes: null }
  // The Vetoes and the Bonus rows are read once here, for the pool warning, the wheel's Veto view and the Bonus Veto section (review 0.7, Q1).
  const [draws, pool, vetoRows, bonusTeams] = await Promise.all([
    readDraws(db, eventRow.id),
    readGamePool(db, eventRow.id),
    lucky ? readVetoes(db, eventRow.id) : [],
    lucky ? readBonusTeams(db, eventRow.id) : [],
  ])
  const left = gamesLeft(pool, draws, roundRows)
  const places = rows.members.map(row => placeOf(row))
  // The Host's pool warning (#234): only the Host reads it, and only while the Event runs (the setup hint covers the rest).
  const warning = viewer.isHost && eventRow.phase === 'running' && settings !== null ? poolWarningOf(eventRow, settings, rows, viewer, roundRows, draws, vetoRows, bonusTeams, left.length, now) : null
  return {
    rounds: open,
    roundBeingDrawn: viewer.isHost && roundRows.some(round => isBeingDrawn(round, draws)),
    setGame: viewer.isHost
      ? { rejection: setRejectionOf(eventRow, rows.sessions, places, roundRows, draws, true), spinRejection: spinRejectionOf(eventRow, rows.sessions, places, roundRows, draws, left, true), respin: roundRows.some(round => waitsForRespin(round, draws)), left, poolWarning: warning }
      : null,
    wheel: settings !== null && onWheel ? await wheelView(db, eventRow, rows, viewer, settings.hiddenWheel, left, draws, now, vetoRows, bonusTeams) : null,
    bonusVetoes: bonusVetoView(eventRow, settings, viewer, bonusTeams),
  }
}

/**
 * The Vetoes of the Lucky Wheel for one viewer (#231, spec #218 § Vetoes: sealed until the end of the window). A Veto cast on a
 * draw whose window still runs is the casting Party's own business: it counts toward `left` and shows as cast only for that
 * Party's Players. From `vetoEndsAt` on (the draw is settled by then, settleBeforeRead) every Party's Vetoes count and the
 * Vetoes of the window's draw are listed with who cast them. Bench and Stands, and a Host outside the teams, get no own part.
 * The window's draw (#232) is the Event's latest draw of any kind, a spin or a game the Host set, and only while it has a window
 * (wheelView picks it): a later draw without one takes the panel away. `game` is its card, already cut to what the viewer may know.
 */
function vetoView(eventRow: EventRow, rows: EventRows, viewer: Viewer, draws: readonly DrawRow[], vetoRows: readonly VetoRow[], bonusTeams: readonly number[], windowDraw: DrawRow | undefined, game: RoundGame | null, now: Date): VetoView {
  const viewerTeam = partyOf(rows, viewer)
  const windowOpen = (draw: Pick<DrawRow, 'vetoEndsAt'>) => draw.vetoEndsAt !== null && draw.vetoEndsAt > now
  // Another Party's cast on a draw whose window still runs does not exist for this viewer (knownVetoRows, shared with the pool warning).
  const left = partyVetoesLeft(eventRow, knownVetoRows(vetoRows, draws, viewerTeam, now), bonusTeams)
  const castOnDraw = vetoRows.filter(row => row.drawId === windowDraw?.id)
  const own = viewerTeam === null
    ? null
    : {
        team: viewerTeam,
        castBy: castOnDraw.find(row => row.team === viewerTeam)?.userId ?? null,
        rejection: vetoRejection({
          viewerTeam,
          draw: windowDraw ? { stopAt: windowDraw.stopAt, vetoEndsAt: windowDraw.vetoEndsAt, outcome: windowDraw.outcome } : null,
          now,
          running: runningOf(rows.sessions) !== undefined,
          castTeams: castOnDraw.map(row => row.team),
          left: left[viewerTeam - 1] ?? 0,
        }),
      }
  const revealed = windowDraw && !windowOpen(windowDraw) ? castOnDraw.map(({ team, userId }) => ({ team, userId })).sort((a, b) => a.team - b.team) : null
  const draw = windowDraw ? { drawId: windowDraw.id, kind: windowDraw.kind, stopAt: windowDraw.stopAt.toISOString(), vetoEndsAt: windowDraw.vetoEndsAt!.toISOString(), game } : null
  return { left, own, revealed, draw }
}

/** The Party a viewer plays in: the team of a Member on a team seat; null on the Bench, in the Stands and for a viewer without a Member. */
function partyOf(rows: EventRows, viewer: Viewer): number | null {
  const member = rows.members.find(row => row.id === viewer.id)
  return member?.zone === 'team' ? member.team : null
}

/**
 * The Host's pool warning (#234, spec #218 § Pool warning): the games left against the games the Host may still need. The Vetoes count
 * as the Host may know them (knownVetoRows): a Veto cast on a draw whose window still runs counts only when the Host plays in that
 * Party, so the warning does not flip when someone casts a sealed Veto. Under Host pick the Vetoes part drops out.
 */
function poolWarningOf(eventRow: EventRow, settings: EventSettings, rows: EventRows, viewer: Viewer, roundRows: RoundRow[], draws: DrawRow[], vetoRows: readonly VetoRow[], bonusTeams: readonly number[], left: number, now: Date): PoolWarning | null {
  const vetoesLeft = eventHasWheel(settings) ? partyVetoesLeft(eventRow, knownVetoRows(vetoRows, draws, partyOf(rows, viewer), now), bonusTeams) : null
  return poolWarning({
    left,
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
async function wheelView(db: Db, eventRow: EventRow, rows: EventRows, viewer: Viewer, hidden: boolean, left: string[], draws: DrawRow[], now: Date, vetoRows: readonly VetoRow[], bonusTeams: readonly number[]): Promise<WheelView> {
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
          current: latestFirst[0]?.id === spin.id && spin.outcome !== 'vetoed' && rows.rounds.some(({ round }) => round.id === spin.roundId && round.putBackAt === null),
        }
      : null,
    vetoes: vetoView(eventRow, rows, viewer, draws, vetoRows, bonusTeams, windowDraw, windowGame ? roundGameView(windowGame) : null, now),
  }
}

/** The clip that runs now (#230, spec #218 § Clip): every Member gets the same one while a Session runs, from the draw's stop on. */
export async function clipSection({ db, eventRow, rows, now }: StageContext): Promise<Pick<EventView, 'clip'>> {
  return { clip: await readClip(db, eventRow.id, rows.sessions, now) }
}

/**
 * The Countdown (#236, spec #218 § Countdown): every Member gets it while a Session runs, and nothing otherwise, even when a row
 * was left behind (the Session end deletes it, but the read does not rely on that).
 */
export async function countdownSection({ db, eventRow, rows }: StageContext): Promise<Pick<EventView, 'countdown'>> {
  if (!runningOf(rows.sessions)) return { countdown: null }
  const row = await readCountdown(db, eventRow.id)
  return { countdown: row ? countdownView(row) : null }
}

/**
 * The Coin flip (#235, spec #218 § Coin flip): the Event's latest toss while a Session runs, for every Member; null otherwise. Its
 * side is in the read for everybody, since the page shows it only from the landing on (the room carries it too).
 */
export async function coinSection({ db, eventRow, rows }: StageContext): Promise<Pick<EventView, 'coin'>> {
  const toss = await readShownToss(db, eventRow, rows.sessions)
  return { coin: toss ? coinView(toss) : null }
}

/**
 * The Bonus Vetoes (#233, spec #218 § Bonus Vetoes): the Host gets how many each Party has, and the Event-level reason it cannot grant
 * one now, while the Event has a Lucky Wheel. Null for every other viewer, and for an Event without the wheel or without settings.
 */
function bonusVetoView(eventRow: EventRow, settings: EventSettings | null, viewer: Viewer, bonusTeams: readonly number[]): BonusVetoView | null {
  if (!viewer.isHost || settings === null || !eventHasWheel(settings)) return null
  const granted = bonusVetoCounts(bonusTeams, settings.teamCount)
  return { granted, rejection: bonusVetoRejection({ isHost: viewer.isHost, settings, phase: eventRow.phase, team: null, granted }) }
}
