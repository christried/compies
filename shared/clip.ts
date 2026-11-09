// The synced clip (GLOSSARY: Clip; spec #218 § Clip, #230). Pure, so the server decides which clip runs and the client plays the
// same second as every other Member. A clip starts at a draw's stop (a set draw's commit is its stop) and runs for the game's
// clip length; the video is the game's, from its start second.

import { clipRunning } from './draw-timeline'
import { msOf, type Instant } from './instant'

// The clip's window (`clipWindow`) and whether it runs (`clipRunning`) are in shared/draw-timeline.ts, with the Draw's other instants.

/**
 * The second of the video to play at `now`: the game's start second plus the time since the clip began, so a late
 * joiner lands where the others are. Null before the clip starts and from its end on.
 */
export function clipPosition(clip: { startAt: Instant, endsAt: Instant, game: { clipStart: number } }, now: Instant): number | null {
  if (!clipRunning(clip, now)) return null
  return clip.game.clipStart + (msOf(now) - msOf(clip.startAt)) / 1000
}
