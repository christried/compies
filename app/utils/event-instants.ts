import type { EventView } from '~~/shared/event'

// The instants of the Event read and what a read after them must carry (review 0.7, F13; #256 adds the list of instants beside this).
// No timer runs on the server: the first read after an instant settles it, but a read that reached the server a hair before the
// instant, or a slow replica, answers the unsettled page. The page then reads again (useInstantRefresh).

/**
 * Whether a read taken at `nowMs` (server time, epoch ms) still misses what an instant that has passed decides: a spin whose stop
 * has passed but which has no drawn game for this viewer yet, or a Veto window whose end has passed but whose Vetoes are not
 * revealed. Only "passed but missing" counts: a Host's spin, or one before its stop, is settled as it is.
 */
export function waitsForSettle(view: Pick<EventView, 'wheel'>, nowMs: number): boolean {
  const wheel = view.wheel
  if (!wheel) return false
  const spin = wheel.spin
  if (spin && Date.parse(spin.stopAt) <= nowMs && spin.game === null) return true
  const draw = wheel.vetoes.draw
  return draw !== null && Date.parse(draw.vetoEndsAt) <= nowMs && wheel.vetoes.revealed === null
}
