// The synced clip (GLOSSARY: Clip; spec #218 § Clip, #230). Pure, so the server decides which clip runs and the client plays the
// same second as every other Member. A clip starts at a draw's stop (a set draw's commit is its stop) and runs for the game's
// clip length; the video is the game's, from its start second.

import type { Instant } from './session-state'

const msOf = (at: Instant): number => (typeof at === 'number' ? at : new Date(at).getTime())

/** The clip's two instants, in epoch ms: it starts at the draw's stop and ends the game's clip length (seconds) later. */
export function clipWindow(draw: { stopAt: Instant }, game: { clipLength: number }): { startAt: number, endsAt: number } {
  const startAt = msOf(draw.stopAt)
  return { startAt, endsAt: startAt + game.clipLength * 1000 }
}

/**
 * The second of the video to play at `nowMs` (epoch ms): the game's start second plus the time since the clip began, so a late
 * joiner lands where the others are. Null before the clip starts and from its end on.
 */
export function clipPosition(clip: { startAt: Instant, endsAt: Instant, game: { clipStart: number } }, nowMs: number): number | null {
  const startAt = msOf(clip.startAt)
  if (nowMs < startAt || nowMs >= msOf(clip.endsAt)) return null
  return clip.game.clipStart + (nowMs - startAt) / 1000
}
