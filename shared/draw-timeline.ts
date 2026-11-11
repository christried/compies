// The Draw's timeline (#414; ADR 0013, amendment 2026-10-31): a Draw's instants and what each decides at `now`, in one place.
// A Draw goes commit -> spin start -> stop (the drawn game becomes known) -> end of the Veto window (the Vetoes are revealed, the
// Draw settles); the Clip runs from the stop. The seam is "what does this Draw's instant decide at `now`"; it has two adapters:
// this file (pure, used by the server and the client) and the SQL twins in server/utils/draw-timeline.ts, which
// test/integration/draw-timeline.test.ts checks against it. Every comparison here keeps its edge, pinned by
// test/unit/draw-timeline.test.ts: a `<` where `<=` belongs leaks the drawn game under a Hidden wheel (CODING_STANDARDS.md § Secrecy).

import { msOf, type Instant } from './instant'

/** The spin starts this long after the commit, so every client has the message and starts together (#229, spec #218 § Drawing). */
const SPIN_LEAD_MS = 1500
/** How long the wheel spins (04-motion § Lucky Wheel: 3 to 10 s); there is no setting for it. The stop is the start plus this. */
const SPIN_DURATION_MS = 6000
/** The Veto window lasts the drawn game's clip length plus this long: every Party with a Veto left may reject the game until then (#231, #505, spec #501). */
const VETO_AFTER_CLIP_MS = 30_000

/** The instants of a new Draw, as the columns store them (Dates). */
export interface DrawInstants { spinStartAt: Date | null, stopAt: Date, vetoEndsAt: Date | null }

/** What a reader needs of a Draw's window: its two instants, as a row, a view or `DrawInstants` carry them. */
export interface DrawWindow { stopAt: Instant, vetoEndsAt: Instant | null }

/** What a writer tells the timeline about a new Draw. */
export interface NewDraw {
  kind: 'spin' | 'set'
  commitAt: Instant
  windowOpens: boolean
  /** The drawn game's clip length in seconds, null for a game without a video; ignored without a window. Required, so a writer cannot forget it (#505). Not stored: only the resulting end is. */
  clipLength: number | null
}

/**
 * WRITER. A spin starts SPIN_LEAD_MS after the commit and stops SPIN_DURATION_MS later; a set draw stops at the commit
 * (`spinStartAt` null). With `windowOpens` the Veto window ends the clip length plus VETO_AFTER_CLIP_MS after the stop (a game
 * without a video: VETO_AFTER_CLIP_MS), else `vetoEndsAt` is null.
 */
export function drawInstants({ kind, commitAt, windowOpens, clipLength }: NewDraw): DrawInstants {
  const commit = msOf(commitAt)
  const spinStart = kind === 'spin' ? commit + SPIN_LEAD_MS : null
  const stop = spinStart === null ? commit : spinStart + SPIN_DURATION_MS
  // The Veto window's length is decided here and only here (#505): the readers, `windowFraction` included, work from the stored end.
  const end = windowOpens ? stop + (clipLength ?? 0) * 1000 + VETO_AFTER_CLIP_MS : null
  return { spinStartAt: spinStart === null ? null : new Date(spinStart), stopAt: new Date(stop), vetoEndsAt: end === null ? null : new Date(end) }
}

/** READER. The commit of a spin, in epoch ms: the inverse of `drawInstants` (the spin starts SPIN_LEAD_MS after it). The stage lifts the wheel's block at it (#441). */
export function spinCommitAt(spin: { spinStartAt: Instant }): number {
  return msOf(spin.spinStartAt) - SPIN_LEAD_MS
}

/**
 * READER. The one rule for who may know the game of a draw (#258, ADR 0013 amendment: reads are gated by time). The Host always;
 * every other Member from the draw's stop instant on, inclusive: at `stopAt` itself the game is known. A Hidden wheel needs
 * nothing more: this is the only thing of the pool it ever shows. The SQL side is `stoppedDraws`.
 */
export function drawGameKnown({ isHost, draw, now }: { isHost: boolean, draw: { stopAt: Instant }, now: Instant }): boolean {
  return isHost || stopReached(draw, now)
}

/**
 * READER. The draw's stop has been reached: `stopAt <= now`, inclusive. The same edge `drawGameKnown` has for a non-Host, for the
 * client's own checks (the wheel has stopped, the read must carry the game): a copy of this comparison next to a component is the
 * `<` that leaks (CODING_STANDARDS.md § Secrecy).
 */
export function stopReached(draw: { stopAt: Instant }, now: Instant): boolean {
  return msOf(draw.stopAt) <= msOf(now)
}

/** READER. The window is open for casts: from the stop (inclusive) to its end (exclusive). A draw without a window never is. */
export function windowOpen(draw: DrawWindow, now: Instant): boolean {
  if (draw.vetoEndsAt === null) return false
  const at = msOf(now)
  return msOf(draw.stopAt) <= at && at < msOf(draw.vetoEndsAt)
}

/** READER. The window has ended: from its end on, inclusive. Before the stop it is neither open nor ended. A draw without a window never has. */
export function windowEnded(draw: { vetoEndsAt: Instant | null }, now: Instant): boolean {
  return draw.vetoEndsAt !== null && msOf(draw.vetoEndsAt) <= msOf(now)
}

/**
 * READER. The Vetoes of the draw are still sealed: until the end of the window, end exclusive (at the end they are known). There is
 * no stop check, since before the stop no cast exists. ADR 0013, amendment 2026-10-31: "a Party sees other Parties' Vetoes only
 * from the end of the window on". A draw without a window has nothing sealed.
 */
export function vetoesSealed(draw: { vetoEndsAt: Instant | null }, now: Instant): boolean {
  return draw.vetoEndsAt !== null && msOf(now) < msOf(draw.vetoEndsAt)
}

/** READER. The instant the draw settles at: the end of its window, or the stop for a draw without one. */
export function settleAt(draw: DrawWindow): Date {
  return new Date(msOf(draw.vetoEndsAt ?? draw.stopAt))
}

/** @public JS twin of `dueDraws`, checked against it by the parity test (knip: no production caller; same wording as server/utils/clock.ts). */
export function isDue(draw: DrawWindow & { outcome: string | null }, now: Instant): boolean {
  return draw.outcome === null && settleAt(draw).getTime() <= msOf(now)
}

/**
 * READER. How much of the window is left, from the Draw's own two instants: 1 at the stop, 0 at the end, clamped to 0..1 (before the
 * stop, and before the page has mounted and its clock is 0: 1). 0 for no window and for a zero-length one.
 */
export function windowFraction(draw: DrawWindow, now: Instant): number {
  if (draw.vetoEndsAt === null) return 0
  const end = msOf(draw.vetoEndsAt)
  const length = end - msOf(draw.stopAt)
  if (length <= 0) return 0
  return Math.min(1, Math.max(0, (end - msOf(now)) / length))
}

/** CLIP (GLOSSARY: Clip; spec #218 § Clip, #230). The clip's two instants, in epoch ms: it starts at the draw's stop and ends the game's clip length (seconds) later. */
export function clipWindow(draw: { stopAt: Instant }, game: { clipLength: number }): { startAt: number, endsAt: number } {
  const startAt = msOf(draw.stopAt)
  return { startAt, endsAt: startAt + game.clipLength * 1000 }
}

/** CLIP. The clip runs from its start (inclusive) to its end (exclusive). */
export function clipRunning(clip: { startAt: Instant, endsAt: Instant }, now: Instant): boolean {
  const at = msOf(now)
  return msOf(clip.startAt) <= at && at < msOf(clip.endsAt)
}

/** CLIP. The clip has ended: from its end on, inclusive (the overlay closes at `endsAt` itself). Before its start it is neither running nor ended. */
export function clipEnded(clip: { endsAt: Instant }, now: Instant): boolean {
  return msOf(clip.endsAt) <= msOf(now)
}
