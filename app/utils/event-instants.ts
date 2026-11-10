import { settleAt, stopReached, windowEnded } from '~~/shared/draw-timeline'
import type { EventView } from '~~/shared/event'
import { msOf } from '~~/shared/instant'

// The instants of the Event read and what a read after them must carry (review 0.7, F13; viewInstants lists them, #256).
// No timer runs on the server: the first read after an instant settles it, but a read that reached the server a hair before the
// instant, or a slow replica, answers the unsettled page. The page then reads again (useInstantRefresh).

/**
 * The instants (server time, epoch ms) at which the page must read the Event again: one expression per piece that has a deadline.
 * The wheel's stop and the end of its Veto window (settleAt, the Draw timeline's), the coin's landing (#235: the feed's entry and the toss's result from then on),
 * the clip's end (#230: the overlay closes at it, and the read then drops the clip), the ceremony's end (#309: the dock's „Siegerehrung starten“ is free again). A piece with a deadline adds one line here (#256).
 */
export function viewInstants(view: Partial<EventView>): number[] {
  return [
    ...(view.wheel?.spin ? [msOf(view.wheel.spin.stopAt)] : []),
    ...(view.wheel?.vetoes.draw ? [settleAt(view.wheel.vetoes.draw).getTime()] : []),
    ...(view.coin ? [Date.parse(view.coin.landsAt)] : []),
    ...(view.clip ? [Date.parse(view.clip.endsAt)] : []),
    ...(view.ceremony ? [Date.parse(view.ceremony.endsAt)] : []),
  ]
}

/**
 * Whether a read taken at `nowMs` (server time, epoch ms) still misses what an instant that has passed decides: a spin whose stop
 * has passed but which has no drawn game for this viewer yet, or a Veto window whose end has passed but whose Vetoes are not
 * revealed. Only "passed but missing" counts: a Host's spin, or one before its stop, is settled as it is.
 */
export function waitsForSettle(view: Pick<EventView, 'wheel'>, nowMs: number): boolean {
  const wheel = view.wheel
  if (!wheel) return false
  const spin = wheel.spin
  if (spin && stopReached(spin, nowMs) && spin.game === null) return true
  const draw = wheel.vetoes.draw
  return draw !== null && windowEnded(draw, nowMs) && wheel.vetoes.revealed === null
}
