import type { ClipView, SpinView, StandingView, VetoDrawView } from '~~/shared/stage'
import { msOf } from '~~/shared/instant'
import { countTicks } from './count-up'
import { pointsDelta, rankMoves } from './standings-news'
import { REVEAL_AFTER_MS, removalStart } from './wheel'
import { pinCrossings } from './wheel-pins'
import { mascotMoments } from './wheel-mascot'

// Which sound cue is due at which server time (#530, spec #504 § The cue plan): a pure function of the viewer's own Event read, so every
// device, a late joiner included, holds the same plan (ADR 0013). Nothing here plays or knows a clock: the cue player (#531) schedules what
// `wheelCuePlan` and `vetoCuePlan` return, skips a cue that is too late and never works a time out itself. What the arrival of a read causes
// (the own Party's cast, the stamps, a set game's opening) is no time known ahead: `vetoArrivalCues` decides it (#532). So does what the
// Standings' sequence causes on this device: `standingsCues` (#741).

/**
 * The cue ids (#504, #718), = the cue id of `compibert-sound.md` and the file name in the sound folder. A new cue is one row in each table
 * keyed by `CueId` (volume and group here, `CUE_LENGTHS`, the listening brief and `MOMENT_OF`) and one recipe file (#740); the rows sit under
 * their group's comment line, so two tickets of different groups never touch the same lines. Two plain-Node scripts read this array from
 * the file's text (`make-cue-candidates.mjs`, `ship-cue-sound.mjs`): keep it one `[ ... ]` of quoted ids, and no quote or bracket in a comment.
 */
export const CUE_IDS = [
  // wheel
  'wheel-windup', 'wheel-tick', 'wheel-stop', 'wheel-morph', 'wheel-slice-out',
  'cb-hype', 'cb-gulp', 'cb-yay',
  // veto
  'veto-open', 'veto-clock', 'veto-clip-close', 'veto-seal', 'veto-drumroll', 'veto-reveal',
  // coin
  // standings
  'lb-swap', 'lb-count', 'lb-winner',
  // board
  'drag-pick', 'drag-snap', 'drag-reject',
  // ceremony
  // tour
] as const
export type CueId = (typeof CUE_IDS)[number]

/** `Vol` of `reference/docs/compibert-sound.md`, 0 to 100, relative to the loudest cue (the fanfare = 100); the player's gain is Vol / 100. */
export const CUE_VOLUME: Record<CueId, number> = {
  // wheel
  'wheel-windup': 45, 'wheel-tick': 30, 'wheel-stop': 70, 'wheel-morph': 50, 'wheel-slice-out': 35,
  'cb-hype': 40, 'cb-gulp': 40, 'cb-yay': 40,
  // veto
  'veto-open': 50, 'veto-clock': 25, 'veto-clip-close': 35, 'veto-seal': 55, 'veto-drumroll': 60, 'veto-reveal': 85,
  // coin
  // standings
  'lb-swap': 35, 'lb-count': 20, 'lb-winner': 60,
  // board
  'drag-pick': 30, 'drag-snap': 40, 'drag-reject': 40,
  // ceremony
  // tour
}

/** The moments whose cue files an Event page requests together (#740). Only `wheel` and `veto` have cues and a rule so far. */
export type CueGroup = 'wheel' | 'veto' | 'coin' | 'standings' | 'board' | 'ceremony' | 'tour'

/** The groups a cue's file is requested for, at least one: a cue that two moments play (a voice cue) names both, and its file comes once. */
export const CUE_GROUPS: Record<CueId, readonly [CueGroup, ...CueGroup[]]> = {
  // wheel
  'wheel-windup': ['wheel'], 'wheel-tick': ['wheel'], 'wheel-stop': ['wheel'], 'wheel-morph': ['wheel'], 'wheel-slice-out': ['wheel'],
  'cb-hype': ['wheel'], 'cb-gulp': ['wheel'], 'cb-yay': ['wheel'],
  // veto
  'veto-open': ['veto'], 'veto-clock': ['veto'], 'veto-clip-close': ['veto'], 'veto-seal': ['veto'], 'veto-drumroll': ['veto'], 'veto-reveal': ['veto'],
  // coin
  // standings
  'lb-swap': ['standings'], 'lb-count': ['standings'], 'lb-winner': ['standings'],
  // board
  'drag-pick': ['board'], 'drag-snap': ['board'], 'drag-reject': ['board'],
  // ceremony
  // tour
}

/** What the group rule reads of the viewer's Event read: three flags, nothing of the draw (§ Secrecy), so it cannot carry a game, a label or a toss. */
export interface GroupInput {
  /** `view.wheel != null`. */
  wheel: boolean
  /** `view.settings?.vetoAllowance ?? 0`. */
  vetoAllowance: number
  /** `view.wheel?.vetoes.draw != null`. */
  vetoWindow: boolean
  /** `view.standings != null && view.event.phase !== 'finished'`: the Event is set up and not finished (#741). Absent = not reached; no Result is needed, no game. */
  standings?: boolean
  /** `view.standings != null && view.event.phase !== 'finished'`: the Event is set up and not finished. The Game board's own field though the rule is the Standings' today, so the two groups can part later (#742). Absent = not reached. */
  board?: boolean
}

/**
 * The groups whose files this read can need, ascending in the order of the `CueGroup` union. The wheel's are reached with a wheel. The Veto
 * window's too when the Event allows Vetoes (the early signal: a set game's window opens at its commit and the files must be decoded by
 * then) or has a window (the late one). Everyone gets all of a group's files, whether their Party casts or not: no request may depend on a cast.
 */
export function reachableGroups(input: GroupInput): CueGroup[] {
  const groups: CueGroup[] = []
  if (input.wheel) groups.push('wheel')
  if (input.wheel && (input.vetoAllowance > 0 || input.vetoWindow)) groups.push('veto')
  if (input.standings) groups.push('standings')
  if (input.board) groups.push('board')
  return groups
}

/** The cue files of these groups, in the order of `CUE_IDS`, each once. */
export function cueFilesOf(groups: readonly CueGroup[]): CueId[] {
  return CUE_IDS.filter(id => CUE_GROUPS[id].some(group => groups.includes(group)))
}

/** Where the cue files are served from (`public/sounds/cues/`) and their extension: the one place that names either (#531). */
export const CUE_FILE_FOLDER = '/sounds/cues'
export const CUE_FILE_EXTENSION = 'wav'

/** The URL of a cue's file. Only the cue player's composable fetches it. */
export function cueFileUrl(id: CueId): string {
  return `${CUE_FILE_FOLDER}/${id}.${CUE_FILE_EXTENSION}`
}

/** One cue of a plan: which, and when (server time, epoch ms). Its volume is `CUE_VOLUME[id]`, not a field: the plan holds only what a time decides. */
export interface Cue { id: CueId, at: number }

/** What the plan reads: the viewer's own Event read and the viewer's reduced-motion setting, nothing of the draw's game (§ Secrecy). */
export interface WheelCueInput {
  /**
   * `view.wheel.spin`, only the five fields that locate the spin: null before the first spin gives no cues. The five are what the Event read
   * sends every viewer from the spin's commit on; the draw's game (`game`, `labels`) stays out of the type, so it cannot be read by mistake.
   */
  spin: Pick<SpinView, 'spinStartAt' | 'stopAt' | 'slices' | 'resultIndex' | 'resultOffset'> | null
  /** The Event's Hidden wheel setting, `view.settings?.hiddenWheel ?? false`. It delays the removal for every viewer. */
  hiddenWheel: boolean
  /** `view.event.isHost`: the Host sees the real names under a Hidden wheel and has no morph (LuckyWheel `concealed = hidden && !isHost`). */
  isHost: boolean
  /** `reducedMotion()` of `app/utils/motion.ts`, passed in: this module reads no DOM. */
  reducedMotion: boolean
}

/**
 * Two ticks closer than this overlap and smear into a buzz: the tick sample is 30 ms long (`compibert-sound.md`), so 40 ms leaves ten
 * milliseconds of gap and 25 ticks a second at most. The operator kept it by ear in the listening session (#535); the one
 * constant, nothing else knows it. The flapper keeps kicking at every crossing: the cap thins the sound only.
 */
export const TICK_MIN_GAP_MS = 40

/**
 * Greedy thinning of ascending times: the first is kept, then each time that is at least `minGapMs` after the last KEPT one (a gap of exactly
 * the cap keeps). The crossings' gaps widen toward the stop, so the late ticks always survive and the last tick is the last crossing.
 */
export function thinTicks(at: readonly number[], minGapMs: number): number[] {
  const kept: number[] = []
  for (const time of at) {
    if (kept.length === 0 || time - kept[kept.length - 1]! >= minGapMs) kept.push(time)
  }
  return kept
}

/**
 * The cues of a spin, ascending by `at`: wind-up at the start, a tick at each pin crossing (capped), the stop, for a Member under a Hidden
 * wheel the morph at the reveal, and the slice leaving at the removal. Reduced motion leaves out the wind-up and the ticks, as the spin
 * itself is then a calm turn that ends at the same stop. It has no `now` and drops nothing for being past: the player skips a late cue.
 *
 * The crossings come from `pinCrossings`, the one place they are worked out. The morph's presence depends on `hiddenWheel` and `isHost`
 * only, and the slice leaves later on a Hidden wheel for every viewer (the reveal must come first), so the devices stay in step. Nothing here
 * depends on the drawn game, so no cue's presence or time before the stop does either.
 */
export function wheelCuePlan(input: WheelCueInput): Cue[] {
  const { spin, hiddenWheel, isHost, reducedMotion } = input
  if (spin === null) return []

  const start = msOf(spin.spinStartAt)
  const stop = msOf(spin.stopAt)
  const cues: Cue[] = []

  if (!reducedMotion) {
    cues.push({ id: 'wheel-windup', at: start })
    const crossings = pinCrossings({ spinStartAt: start, stopAt: stop, slices: spin.slices, resultIndex: spin.resultIndex, resultOffset: spin.resultOffset })
    for (const at of thinTicks(crossings.map(crossing => crossing.at), TICK_MIN_GAP_MS)) cues.push({ id: 'wheel-tick', at })
  }
  cues.push({ id: 'wheel-stop', at: stop })
  if (hiddenWheel && !isHost) cues.push({ id: 'wheel-morph', at: stop + REVEAL_AFTER_MS })
  cues.push({ id: 'wheel-slice-out', at: removalStart({ stopAt: stop }, hiddenWheel) })
  return cues
}

/** What the voice's plan reads: the spin's two instants, the Event's Hidden wheel setting and reduced motion: exactly what Compibert is told (`mascotMoments`). */
export interface WheelVoiceInput {
  /** `view.wheel.spin`, only the two instants the read sends every viewer from the spin's commit on (ISO strings); null before the first spin. No slice, no result, no label, no game, and no `isHost`. */
  spin: Pick<SpinView, 'spinStartAt' | 'stopAt'> | null
  /** `view.settings?.hiddenWheel ?? false`. It delays his cheer for EVERY viewer, the Host included: do not use the Host's `concealed`. */
  hiddenWheel: boolean
  /** `reducedMotion()`, passed in; this module reads no DOM. */
  reducedMotion: boolean
}

/**
 * Compibert's voice at the wheel (#671, spec #718): `cb-hype` when the spin starts, `cb-gulp` at his brake and `cb-yay` at his cheer, ascending
 * by `at`. The instants are `mascotMoments`' own (the 3/5 of the spin and the reveal's half second are never worked out here), so a change of
 * his beats moves his voice with them. Reduced motion leaves only the cheer, at the same instant. No slice, result, label or game can reach it
 * (the type has none, § Secrecy), and no cue's presence or time depends on `isHost`: the Host's and a Member's voice are the same, only the
 * wheel's morph differs. It has no `now` and drops nothing for being past: the player skips a cue more than `CUE_LATE_MS` late.
 */
export function wheelVoicePlan(input: WheelVoiceInput): Cue[] {
  const { spin, hiddenWheel, reducedMotion } = input
  if (spin === null) return []

  const spinStartAt = msOf(spin.spinStartAt)
  const moments = mascotMoments({ spinStartAt, stopAt: msOf(spin.stopAt) }, hiddenWheel, reducedMotion)
  const yay: Cue = { id: 'cb-yay', at: moments.cheerAt }
  if (reducedMotion) return [yay]
  return [{ id: 'cb-hype', at: spinStartAt }, { id: 'cb-gulp', at: moments.brakeAt }, yay]
}

/**
 * What the Veto window's plan reads (#532): the fields of the viewer's own Event read that locate the window, nothing of the Vetoes. `own`,
 * `left`, `revealed` and the draw's `game` are not in the type, so the plan cannot read another Party's Veto, or a cast, by mistake (§ Secrecy).
 */
export interface VetoCueInput {
  /**
   * `view.wheel?.vetoes.draw`: the Event's latest draw, only while it has a Veto window; null = no window = no veto cue. `vetoEndsAt` is
   * null for a Member before the stop (the read sends it with the read that follows), the Host has it always.
   */
  draw: Pick<VetoDrawView, 'drawId' | 'kind' | 'stopAt' | 'vetoEndsAt'> | null
  /** `view.clip`: the Clip that runs now (null once it ended, was skipped or none runs). */
  clip: Pick<ClipView, 'drawId' | 'endsAt'> | null
  /**
   * `reducedMotion()`, passed in like the wheel's. It leaves out the drumroll: the reveal's hit at the end is then the one hit (spec #504).
   * Whether that hit wants a short sample of its own is the listening session's question (#535).
   */
  reducedMotion: boolean
}

/** How long before the window's end each `veto-clock` tick is: once a second from 10 s to 6 s, twice a second from 5 s to 0.5 s. No tick at the end, that is the reveal. */
const CLOCK_TICKS_BEFORE_END_MS = [10_000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 500]
/** `veto-drumroll` is one sample of 1.2 s that ends at the reveal. */
const DRUMROLL_BEFORE_END_MS = 1200

/**
 * The cues of a Veto window, ascending by `at`: the opening of a spin's window at the stop (a set game's is an arrival cue, its window opens
 * as the read arrives), then from the end, when it is known, the clock's fifteen ticks, the drumroll and the reveal, and the Clip's close at
 * the Clip's own end. A moved end (the Host skipped the Clip) is just the plan of the read that follows: new instants, no Clip. A cue that
 * would be before the stop is left out (a window is 30 s at least, so none is). It never holds `veto-seal`: the own Party's cast and the
 * stamps are arrival cues, so no plan, at any time, has a trace of any Party's Vetoes.
 */
export function vetoCuePlan(input: VetoCueInput): Cue[] {
  const { draw, clip, reducedMotion } = input
  if (draw === null) return []

  const stop = msOf(draw.stopAt)
  const cues: Cue[] = []
  if (draw.kind === 'spin') cues.push({ id: 'veto-open', at: stop })
  if (draw.vetoEndsAt !== null) {
    const end = msOf(draw.vetoEndsAt)
    for (const before of CLOCK_TICKS_BEFORE_END_MS) cues.push({ id: 'veto-clock', at: end - before })
    if (!reducedMotion) cues.push({ id: 'veto-drumroll', at: end - DRUMROLL_BEFORE_END_MS })
    cues.push({ id: 'veto-reveal', at: end })
  }
  if (clip !== null && clip.drawId === draw.drawId) cues.push({ id: 'veto-clip-close', at: msOf(clip.endsAt) })
  // The sort is stable: on one instant the order above stays.
  return cues.filter(cue => cue.at >= stop).sort((a, b) => a.at - b.at)
}

/** What the arrival cues read of one Event read (the viewer's own): the page keeps the previous one. `draw: null` = no window. */
export interface VetoArrivalState {
  draw: Pick<VetoDrawView, 'drawId' | 'kind' | 'stopAt' | 'vetoEndsAt'> | null
  /** `vetoes.own?.cast ?? false`: the viewer's own Party's cast, nobody else's (a Party's casts are sealed from every other until the end). */
  ownCast: boolean
  /** `vetoes.revealed?.length ?? null`: null before the window's end. */
  revealedCount: number | null
}

/** A cue to play `delayMs` from now. */
export interface ArrivalCue { id: CueId, delayMs: number }

/** The stamps of the reveal, one per Veto, are this far apart. */
export const STAMP_GAP_MS = 80
/** An arrival cue whose moment is further past than this is skipped, not played late (a page that slept through it). */
export const ARRIVAL_LATE_MS = 2000

/**
 * The cues that the arrival of a read causes (#532, spec #504): the own Party's cast (`veto-seal`), the stamps of the reveal (one `veto-seal`
 * per Veto) and a set game's opening, which are no server time known ahead. A pure function of the page's previous read and its new one, so
 * a page's first read is the baseline (a reload, a late join and a page opened after the moment play nothing), a refetch of the same read
 * plays nothing again and a new draw starts a new baseline. `now` is the server's now in ms. Only `ownCast` of the viewer's own Party is read,
 * never another Party's data.
 */
export function vetoArrivalCues(previous: VetoArrivalState | null, next: VetoArrivalState, now: number): ArrivalCue[] {
  if (previous === null || next.draw === null) return []
  const cues: ArrivalCue[] = []
  const sameDraw = previous.draw?.drawId === next.draw.drawId

  if (next.draw.kind === 'set' && !sameDraw && now - msOf(next.draw.stopAt) <= ARRIVAL_LATE_MS) cues.push({ id: 'veto-open', delayMs: 0 })
  if (sameDraw && !previous.ownCast && next.ownCast) cues.push({ id: 'veto-seal', delayMs: 0 })
  if (sameDraw && previous.revealedCount === null && next.revealedCount !== null
    && next.draw.vetoEndsAt !== null && now - msOf(next.draw.vetoEndsAt) <= ARRIVAL_LATE_MS) {
    for (let index = 0; index < next.revealedCount; index++) cues.push({ id: 'veto-seal', delayMs: index * STAMP_GAP_MS })
  }
  return cues
}

/**
 * What the Standings' cues read (#741): ranks, points and team positions of the Standings the page saw and the ones it shows now, the winners'
 * team positions and the two settings of the picture. No game, label, name, score or Result field, so a cue cannot depend on what the viewer
 * may not know yet (§ Secrecy): the Result that makes the news is already in the picture.
 */
export interface StandingsCueInput {
  /** `news.before`: the Standings the page saw before the Result. */
  before: readonly StandingView[]
  /** The Standings shown now. */
  after: readonly StandingView[]
  /** `news.winners`: team positions on Place 1. */
  winners: readonly number[]
  /** The stamp is drawn here (the stage block). */
  celebrate: boolean
  /** `reducedMotion()`, passed in: this module reads no DOM. */
  reducedMotion: boolean
  /** How long the counter counts (`countDurationMs()` of motion.ts). */
  countMs: number
  /** How long after the sequence's start the stamp lands (`STAMP_DELAY_MS` of motion.ts). */
  stampDelayMs: number
}

/**
 * The cues of one Standings sequence (#741), `delayMs` from its start, ascending and stable: `lb-swap` when some Party's rank changed (the glide, or
 * under reduced motion the highlight, start there), `lb-count` once per displayed change of the Party that changed most (absolute: a Correction
 * can lower points; a tie goes to the first in the order of `after`), and `lb-winner` where the stamp is drawn. Reduced motion has no count, so no
 * ticks, and the stamp is a fade with no delay, so the winner goes with it at once. The beats are the picture's own (`countTicks`, the counter's
 * duration, the stamp's delay): nothing here is a number of its own.
 */
export function standingsCues(input: StandingsCueInput): ArrivalCue[] {
  const { before, after, winners, celebrate, reducedMotion, countMs, stampDelayMs } = input
  const cues: ArrivalCue[] = []
  if (rankMoves(before, after).length > 0) cues.push({ id: 'lb-swap', delayMs: 0 })
  if (!reducedMotion) {
    let most: { team: number, change: number } | null = null
    for (const [team, change] of pointsDelta(before, after)) {
      if (change !== 0 && (most === null || Math.abs(change) > Math.abs(most.change))) most = { team, change }
    }
    if (most !== null) {
      const to = after.find(standing => standing.team === most.team)!.points
      for (const delayMs of countTicks(to - most.change, to, countMs)) cues.push({ id: 'lb-count', delayMs })
    }
  }
  if (celebrate && winners.length > 0) cues.push({ id: 'lb-winner', delayMs: reducedMotion ? 0 : stampDelayMs })
  // The sort is stable: on one instant the order above stays.
  return cues.sort((a, b) => a.delayMs - b.delayMs)
}

/**
 * The cues whose id this news has not asked for yet, and the ids marked as asked (#741): the stage block and the side panel's tab are both
 * mounted on a wide screen and each plays the sequence, but one Result sounds once per page. One id is claimed for all of its ticks.
 */
export function claimCues(asked: Set<CueId>, cues: readonly ArrivalCue[]): ArrivalCue[] {
  const own = cues.filter(cue => !asked.has(cue.id))
  for (const cue of own) asked.add(cue.id)
  return own
}
