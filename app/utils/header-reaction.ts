import type { EmoteId } from '~~/shared/emote'
import type { RigState } from './compibert-rig'
import type { BannerState } from './connection-banner'
import type { Reaction } from './rig-reaction'
import { ARRIVAL_LATE_MS, revealedOnArrival, type VetoArrivalState } from './sound-cues'

// What the header's Compibert does on the Event page (#673, spec #927, 04-motion § Compibert): a pure plan beside the cue plans. The Event page
// decides (`useHeaderReaction`), the header shows; the rig owns the timer and the priorities (rig-reaction.ts). Nothing here plays a sound, and
// nothing maps a wheel stop, a Draw or another Member's Emote: Compibert beside the wheel cheers at the Draw's stop.

/** The state each Emote makes the sender's Compibert show; a fifth Emote fails typecheck until it has one. */
export const EMOTE_STATE: Record<EmoteId, RigState> = { clap: 'clap', tears: 'laugh', angry: 'angry', roar: 'roar' }

/** What the head does while no reaction runs: confused while the connection is down (the banner shows), idle else. */
export type HeaderBase = 'idle' | 'confused'

export function baseFor(banner: BannerState): HeaderBase {
  return banner === 'reconnecting' || banner === 'lost' ? 'confused' : 'idle'
}

/**
 * The reaction of the viewer's own Emote: none for another Member's, none for one more than `ARRIVAL_LATE_MS` old (a page that slept through it,
 * the rule of `emoteCue`). The room's `sound` flag is no input: the sound is dropped for the fourth Emote in a second, the reaction is not.
 * `serverTime` and `now` are the server's, in ms. A new object every time: the rig reads a new object as a new reaction.
 */
export function emoteReaction(input: { emote: EmoteId, own: boolean, serverTime: number, now: number }): Reaction | null {
  if (!input.own || input.now - input.serverTime > ARRIVAL_LATE_MS) return null
  return { state: EMOTE_STATE[input.emote] }
}

/** `angry` when the reveal arrives with at least one Veto, under the rule of the stamps (`revealedOnArrival`), else none. */
export function vetoReaction(previous: VetoArrivalState | null, next: VetoArrivalState, now: number): Reaction | null {
  return revealedOnArrival(previous, next, now) >= 1 ? { state: 'angry' } : null
}

/** One `wave` when the connection is back (the banner was `reconnecting` or `lost`, now it is neither): `back` to `ok` is no recovery. */
export function connectionReaction(before: BannerState, now: BannerState): Reaction | null {
  return (before === 'reconnecting' || before === 'lost') && now !== 'reconnecting' && now !== 'lost' ? { state: 'wave' } : null
}
