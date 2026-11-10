import { settleAt, spinCommitAt, stopReached, windowEnded } from '~~/shared/draw-timeline'
import { tossCommitAt } from '~~/shared/coin'
import { datePollOpen, type EventView, SESSIONS_MAX } from '~~/shared/event'
import { msOf } from '~~/shared/instant'
import type { EndView } from '~~/shared/stage'

// The Stage module (#415): one row per piece of the Event page's stage (11-event-seite § EventPage). A row says which block the piece draws,
// where that block sits in each page kind, who sees it, whether the view has it, the moment it rises at, and the instants the page must read again at. A new piece is
// a row here and its component in EventStage.vue; nothing else decides which blocks the page lists or in which order (review 1.4 A4, #228).
// The order follows the game (#441): the pinned blocks first, then every block whose moment has been counted, newest first, then the rest by rank. It is a pure
// function of the stored instants the Event read carries and `now`, so a reload or a late join shows the order of someone who watched (stageBlocks).

/** The page's kind (#166): `setup`: no settings. `poll`: no Session is dated. `teams`: a Session is dated, none started. `running`: a Session runs. `between`: a Session ended, more are to come. `done`: every Session ended. `finished`: the Host finished the Event (#277). */
export type PageKind = 'setup' | 'poll' | 'teams' | 'running' | 'between' | 'done' | 'finished'

/**
 * The blocks of the stage (#166, #228). `head`: kicker and title. `reopen`: the notices of reopened Dates. `actions`: the finished stage's row of buttons (#313). `tie`: the banner „Gleichstand auf Platz 1“.
 * `sessionNeeded`: the Host's notice that the last game needs a new Session. `setup`: the Event is not set up. `seat`: where the Host sits. `poll`: the Date poll. `pool`: the Host's live pool warning (#234).
 * `wheel`: the Lucky Wheel (#229). `rounds`: the open Rounds. `standings`: the Standings (#274). `history`: the Spielverlauf of the finished stage (#277). `countdown`: the Countdown (#236). `coin`: the Coin flip (#235).
 * `board`: the Game board. `cards`: the Sessions and „So wird gespielt“. `stay`: the teams stay between two Sessions.
 * `pending`: the finished stage's card that says the Award ceremony is still to come (#445).
 */
export type Block = 'head' | 'reopen' | 'actions' | 'tie' | 'sessionNeeded' | 'setup' | 'seat' | 'poll' | 'pool' | 'wheel' | 'rounds' | 'standings' | 'history' | 'countdown' | 'coin' | 'board' | 'cards' | 'stay' | 'pending'

// `end` is required: the page reads it for the Standings and the finish (#274, #288). `rounds` and `results` are optional: the Host dock has neither, and a missing list counts as none (#278, #441). `ceremonyShown` is optional too, and a view without it counts as shown (#445); `ceremonyHeld` is the viewer's own hold, set by the page only.
export type StageInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates' | 'setGame' | 'wheel' | 'countdown' | 'coin' | 'end'> & Partial<Pick<EventView, 'rounds' | 'results' | 'ceremonyShown'>> & { ceremonyHeld?: boolean, event: Pick<EventView['event'], 'phase' | 'isHost'> }

/** A block takes its new place this long after its moment (#441), so the news is on the page before the stage moves under the viewer. */
export const RISE_DELAY_MS = 500

/**
 * The games still to start (#278): the Game count less the Results and the open Rounds, which each take one game. Never below 0:
 * open Rounds past the count (an old Event) leave none.
 */
export function gamesToStart(end: Pick<EndView, 'played' | 'gameCount'>, openRounds: number): number {
  return Math.max(0, end.gameCount - end.played - openRounds)
}

interface StagePiece {
  /** The block the piece draws; none for the Clip and the Award ceremony, which are overlays and only have instants. */
  block?: Block
  /** Where the block sits in each page kind, smaller = higher; for a block that has no counted moment. A kind that is missing does not have the block. */
  at?: Partial<Record<PageKind, number>>
  /** The block stays on top, in the order of its rank, whatever has a moment (#441). */
  pinned?: true
  /** The latest moment of the block (epoch ms, from instants the Event read carries), or null: the block rises to the top, newest first, at it plus RISE_DELAY_MS (#441). Never a Secret: the read has every instant for every Member. */
  moment?: (view: StageInput) => number | null
  /** Who sees the piece; omitted = everybody. */
  audience?: 'host' | 'members'
  /** Whether the view has the piece (a block that shows data is listed only while its data is there, #256); omitted = always. */
  present?: (view: StageInput, ctx: { kind: PageKind, pollOpen: boolean, waiting: boolean }) => boolean
  /** The instants (server time, epoch ms) at which the page must read the Event again (ADR 0013); a piece with a deadline adds them here (#256). */
  instants?: (view: Partial<EventView>) => number[]
  /** Whether a read taken at `nowMs` still misses what an instant that has passed decides. */
  unsettled?: (view: Pick<EventView, 'wheel'>, nowMs: number) => boolean
}

const played = (view: StageInput) => (view.end?.played ?? 0) > 0

/** The latest of the instants that are there (epoch ms), or null when none is. */
function latest(...instants: (number | null)[]): number | null {
  const known = instants.filter(at => at !== null)
  return known.length > 0 ? Math.max(...known) : null
}

/**
 * The pieces, in no order of their own: `at` is the order of what has no counted moment (the pinned blocks aside, see `stageBlocks`). What has to happen now goes on top: the poll while no Session is dated, the Game board from
 * the first Date on, the open Rounds above it while a Session runs (and between Sessions, where their Results are entered too, #273), the Standings
 * right after them once a Result exists (#274), the Sessions card between two Sessions. The Reopen notices sit right under the Head in every kind.
 */
const PIECES: StagePiece[] = [
  // Kicker and title.
  { block: 'head', at: { setup: 1, poll: 1, teams: 1, running: 1, between: 1, done: 1, finished: 1 }, pinned: true },
  // The notices of reopened Dates; the notices of removed Sessions stay in a finished Event too (story 56).
  { block: 'reopen', at: { setup: 2, poll: 2, teams: 2, running: 2, between: 2, done: 2, finished: 2 }, pinned: true },
  // The finished stage's row of buttons (#313: Bild teilen; #314: Siegerehrung ansehen) is the news of the page: right under the Head, with the Result it shows. Bild teilen needs the Standings.
  { block: 'actions', at: { finished: 3 }, pinned: true, present: (view, ctx) => played(view) && !ctx.waiting },
  // The finished stage waits for the Award ceremony (#445): the card stands in the place of the actions, the Standings and the history until the Host has started it, and for a viewer who
  // holds the first run until it is over. The Head, the notices and the cards stay. Nobody else asks why the page waits: the page asks `waitsForCeremony` (event-page.ts).
  { block: 'pending', at: { finished: 3 }, pinned: true, present: (_view, ctx) => ctx.waiting },
  // A Tie (#278) is the news of the stage, right under the reopen notices, wherever the Host's dock offers „Unentschieden beenden“ (running, between, done) and not in a
  // finished Event, where nobody decides any more. For Members only: the Host decides and has the dock (#283). A Tie needs a started Session, so `teams` never has one.
  { block: 'tie', at: { running: 3, between: 3, done: 3 }, pinned: true, audience: 'members', present: view => view.end?.tie != null },
  // The dead end (#278): every Session ended and games are still to start, with a Session left to play them in (the Event takes up to SESSIONS_MAX). It sits where the Tie banner does and
  // only in `done`, so never with a Tie. The notice is the Host's (#415): its action is the Host's.
  {
    block: 'sessionNeeded',
    at: { done: 4 },
    pinned: true,
    audience: 'host',
    present: view => view.end != null && gamesToStart(view.end, view.rounds?.length ?? 0) > 0 && view.sessions.length < SESSIONS_MAX,
  },
  // The Event is not set up.
  { block: 'setup', at: { setup: 3 } },
  // Where the Host sits (teams only, #160).
  { block: 'seat', at: { teams: 3 } },
  // The Date poll, while a Session waits for a Date. It is the quiet one below the board as soon as the page is about something else than the Date; `done` has none, as no Session polls any more.
  { block: 'poll', at: { setup: 4, poll: 3, teams: 5, running: 11, between: 9 }, present: (_view, ctx) => ctx.pollOpen },
  // The Lucky Wheel (#229), on top of the open Rounds. Its stop and the end of its Veto window are the instants (the Draw timeline's), and a read taken a hair before one
  // can still miss what it decides: a spin whose stop has passed but has no drawn game for this viewer yet, or a Veto window whose end has passed but whose Vetoes are not revealed (review 0.7, F13).
  // Only "passed but missing" waits: a Host's spin, or one before its stop, is settled as it is.
  {
    block: 'wheel',
    at: { running: 4 },
    present: view => Boolean(view.wheel),
    // The latest Draw's commit with a Veto window (#441): a spin's, or a set game's stop (a set game stops at its commit). A set game without a window has no `vetoes.draw` and lifts nothing. The Veto casts feed no moment (sealed, #355).
    moment: ({ wheel }) => latest(wheel?.spin ? spinCommitAt(wheel.spin) : null, wheel?.vetoes.draw?.kind === 'set' ? msOf(wheel.vetoes.draw.stopAt) : null),
    instants: view => [
      ...(view.wheel?.spin ? [msOf(view.wheel.spin.stopAt)] : []),
      ...(view.wheel?.vetoes.draw ? [settleAt(view.wheel.vetoes.draw).getTime()] : []),
    ],
    unsettled: (view, nowMs) => {
      const wheel = view.wheel
      if (!wheel) return false
      const spin = wheel.spin
      if (spin && stopReached(spin, nowMs) && spin.game === null) return true
      const draw = wheel.vetoes.draw
      return draw !== null && windowEnded(draw, nowMs) && wheel.vetoes.revealed === null
    },
  },
  // The open Rounds, whenever there are some (the Host enters their Results between Sessions too, #273); the component hides itself when empty.
  { block: 'rounds', at: { running: 5, between: 4, done: 5 }, moment: ({ rounds }) => latest(...(rounds ?? []).map(round => msOf(round.setAt))) },
  // The Standings, from the first Result on (#274), right after the open Rounds.
  {
    block: 'standings',
    at: { running: 6, between: 5, done: 6, finished: 4 },
    present: (view, ctx) => played(view) && !ctx.waiting,
    moment: ({ results }) => latest(...(results ?? []).flatMap(result => [msOf(result.resultAt), result.correctedAt === null ? null : msOf(result.correctedAt)])),
  },
  // The Spielverlauf, the Rounds with their Results, on the finished stage only (#277). It needs the first Result, which a finished Event has.
  { block: 'history', at: { finished: 5 }, present: (view, ctx) => played(view) && !ctx.waiting },
  // The Host's pool warning (#234) comes after the drawn Round: wheel and open Rounds first (story 15, review 0.7 F12). The data decides who has it: the read sends it to the Host.
  { block: 'pool', at: { running: 7 }, present: view => Boolean(view.setGame?.poolWarning) },
  // The Countdown (#236), under the Rounds.
  {
    block: 'countdown',
    at: { running: 8 },
    present: view => Boolean(view.countdown),
    // Its latest start or resume (#441): `lastStartedAt` survives a pause, which clears `startedAt`; the build before the switch-over wrote `startedAt` only, so the later of both.
    moment: ({ countdown }) => latest(countdown?.startedAt ? msOf(countdown.startedAt) : null, countdown?.lastStartedAt ? msOf(countdown.lastStartedAt) : null),
  },
  // The coin toss (#235), under the Countdown. The landing is an instant: the feed's entry and the toss's result come from then on.
  { block: 'coin', at: { running: 9 }, present: view => Boolean(view.coin), moment: ({ coin }) => (coin ? tossCommitAt(coin) : null), instants: view => (view.coin ? [Date.parse(view.coin.landsAt)] : []) },
  // The Game board, from the first Date on.
  { block: 'board', at: { setup: 5, poll: 4, teams: 4, running: 10, between: 8, done: 8 } },
  // The teams stay between two Sessions.
  { block: 'stay', at: { between: 7 } },
  // The Sessions and „So wird gespielt“, read-only already in a finished Event (#277).
  { block: 'cards', at: { setup: 6, poll: 5, teams: 6, running: 12, between: 6, done: 7, finished: 6 } },
  // The clip (#230): an overlay, no block. It closes at its end, and the read then drops it.
  { instants: view => (view.clip ? [Date.parse(view.clip.endsAt)] : []) },
  // The Award ceremony (#309): an overlay, no block. At its end the dock's „Siegerehrung starten“ is free again.
  { instants: view => (view.ceremony ? [Date.parse(view.ceremony.endsAt)] : []) },
]

/** A block the view lists for a kind: its rank there, whether it is pinned and its moment (null: none; a finished Event has none, so it never reorders). */
interface Listed { block: Block, rank: number, pinned: boolean, moment: number | null }

/** The pieces whose block sits in the kind, that the viewer sees and the view has, with what the order reads of each. */
function listed(view: StageInput, kind: PageKind): Listed[] {
  // `waiting` is the finished kind's only (#445): a view without `ceremonyShown` counts as shown (other fixtures build one without it), and `ceremonyHeld` is the viewer's own hold (useCeremonyHold).
  const ctx = { kind, pollOpen: datePollOpen(view.event.phase, view.missingDates), waiting: kind === 'finished' && (view.ceremonyShown === false || view.ceremonyHeld === true) }
  return PIECES.flatMap(({ block, at, audience, present, pinned, moment }) => {
    const rank = at?.[kind]
    if (!block || rank === undefined) return []
    if (audience === 'host' && !view.event.isHost) return []
    if (audience === 'members' && view.event.isHost) return []
    if (present && !present(view, ctx)) return []
    return [{ block, rank, pinned: pinned === true, moment: kind === 'finished' ? null : (moment?.(view) ?? null) }]
  })
}

const byRank = (a: Listed, b: Listed) => a.rank - b.rank

/**
 * The one place that arranges the blocks of a kind (#441): (1) the pinned blocks, by rank; (2) every block whose moment is counted (`moment + RISE_DELAY_MS <= now`),
 * newest first, equal moments by rank; (3) the rest by rank (a stable sort, so equal ranks keep the table's order). `now` null counts every moment: the server render,
 * the first client render, a hidden tab and a reload show the order that is settled. A pure function of the view and `now`.
 */
function arranged(pieces: Listed[], now: number | null): Block[] {
  const counted = (piece: Listed) => piece.moment !== null && (now === null || piece.moment + RISE_DELAY_MS <= now)
  const pinned = pieces.filter(piece => piece.pinned).sort(byRank)
  const lifted = pieces.filter(piece => !piece.pinned && counted(piece)).sort((a, b) => b.moment! - a.moment! || byRank(a, b))
  const rest = pieces.filter(piece => !piece.pinned && !counted(piece)).sort(byRank)
  return [...pinned, ...lifted, ...rest].map(piece => piece.block)
}

/** The blocks of the stage for a page kind, top to bottom, at `now` (epoch ms, server time; null: every moment counted): the pieces whose block sits in the kind, that the viewer sees and the view has. */
export function stageBlocks(view: StageInput, kind: PageKind, now: number | null): Block[] {
  return arranged(listed(view, kind), now)
}

/** The moments (epoch ms) of the blocks the kind lists that have one; none for a finished Event, which never reorders (#441). */
export function stageMoments(view: StageInput, kind: PageKind): Partial<Record<Block, number>> {
  return Object.fromEntries(listed(view, kind).flatMap(({ block, moment }) => (moment === null ? [] : [[block, moment]])))
}

/** The instants (epoch ms) at which a moment is counted: one per moment plus RISE_DELAY_MS. The page's order clock sleeps until the next one (useStageOrder, #441). */
export function stageRises(view: StageInput, kind: PageKind): number[] {
  return Object.values(stageMoments(view, kind)).map(moment => moment + RISE_DELAY_MS)
}

/**
 * The blocks that moved up between two lists: each moved above a block that both lists hold and that it stood below before. A block that only shifts down because another
 * rose, or up because another left, is not one, and a block in one list only is not. Reduced motion fades these in instead of gliding (04-motion § UI enters, #441).
 */
export function risen(before: Block[], after: Block[]): Block[] {
  return after.filter((block) => {
    if (!before.includes(block)) return false
    return after.some(other => other !== block && before.includes(other) && before.indexOf(other) < before.indexOf(block) && after.indexOf(other) > after.indexOf(block))
  })
}

/**
 * The instants (server time, epoch ms) at which the page must read the Event again: every piece that has a deadline adds its own (#256).
 * No timer runs on the server: the first read after an instant settles it, but a read that reached the server a hair before the instant, or a
 * slow replica, answers the unsettled page (stageUnsettled). The page then reads again (useInstantRefresh).
 */
export function stageInstants(view: Partial<EventView>): number[] {
  return PIECES.flatMap(piece => piece.instants?.(view) ?? [])
}

/** Whether a read taken at `nowMs` (server time, epoch ms) still misses what an instant that has passed decides: one piece waiting is enough. */
export function stageUnsettled(view: Pick<EventView, 'wheel'>, nowMs: number): boolean {
  return PIECES.some(piece => piece.unsettled?.(view, nowMs))
}
