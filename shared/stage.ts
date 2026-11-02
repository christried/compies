// The stage views (#256): what the Event read shows of the open Rounds, the Lucky Wheel, the clip, the Countdown,
// the Coin flip and the Bonus Vetoes, and what the stage's actions answer. shared/event.ts reads them into EventView.
import type { RoundGame } from './game'
import type { BonusVetoRejection, PoolWarning, SetRejection, SpinRejection, VetoRejection } from './rounds'

/**
 * An open Round on the stage (#228, GLOSSARY: Round): its game is set and it was not put back. It has no number (0.8 numbers a
 * Round when its result is entered). `notes` are the game's Game notes, only for the Host and only when it has some.
 */
export interface RoundView {
  id: string
  startedAt: string
  setAt: string
  game: RoundGame
  notes?: string
}

/**
 * What the Host sees of setting the next game (#228): why it cannot be set now, or null, and the games of the Game pool that
 * are still left (shared/rounds.ts gamesLeft), which the picker lists first.
 */
export interface SetGameView {
  rejection: SetRejection | null
  /** Why the wheel cannot be spun now, or null (#229): the dock's „Rad drehen“. A Selection mode without a wheel says `no_wheel`. */
  spinRejection: SpinRejection | null
  /** Whether a Round waits for a respin (#231): every draw of it was vetoed. The dock then says „Neu drehen“, and the next spin or set goes into that Round. */
  respin: boolean
  left: string[]
  /** The live pool warning (#234): for the Host of a running Event only; null when the games left cover the worst case, and in every other Phase. */
  poolWarning: PoolWarning | null
}

/**
 * A spin of the Lucky Wheel as a Member reads it (#229, spec #218 § Hidden wheel on the wire): the instants (ISO), the slice count,
 * the result slice and where the pointer rests in it, and the slices' labels. `labels` are the real names for the Host and on
 * a visible wheel; for a Member under a Hidden wheel the placeholders shuffled for this spin, the result slice's label turning
 * into the real name from `stopAt` on. `game` is the drawn game: for a Member only from `stopAt` on, for the Host always. `current`
 * says the spin is still the Event's latest draw, its Round stands and it was not vetoed: the wheel's result card shows only then
 * (review 0.7, F6). A draw settles as vetoed at the end of its window, so this tells nothing before it.
 */
export interface SpinView {
  roundId: string
  drawId: string
  spinStartAt: string
  stopAt: string
  slices: number
  resultIndex: number
  resultOffset: number
  labels: string[] | null
  game: RoundGame | null
  current: boolean
}

/** A Veto of a Party and the Player who cast it (#231); the Event read shows it from the end of the window on. */
export interface VetoCastView { team: number, userId: string }

/**
 * The viewer's own Party in the Veto window (#231): its team, the Player of it who cast (null: not yet, the Party's Players learn it
 * at once, nobody else before the end of the window), and why the Party cannot cast on the window's draw (VetoView.draw) now, or null when it may.
 * Only a Player of a Party gets it: the Bench, the Stands and a Host outside the teams get `own: null`.
 */
export interface OwnVetoView { team: number, castBy: string | null, rejection: VetoRejection | null }

/**
 * The Vetoes of the Lucky Wheel (#231, spec #218 § Vetoes, sealed until the end of the window). `left` is every Party's Vetoes left
 * (index 0 = team 1) as THIS viewer may know them: a Veto cast on a draw whose window still runs counts only for the Players of the
 * casting Party, for everybody else from the end of the window on, so no number gives a sealed Veto away. `draw` is the Event's latest
 * draw of any kind (#232: a spin or a game the Host set), and only when it has a Veto window; null when the latest draw has none, so
 * the window's panel goes away. `own` and `revealed` follow that draw: `revealed` holds every Party's Veto on it from the end of its
 * window on (null before, and without a window).
 */
export interface VetoView {
  left: number[]
  own: OwnVetoView | null
  revealed: VetoCastView[] | null
  draw: VetoDrawView | null
}

/**
 * The draw a Veto window belongs to (#232). `stopAt` is where the window opens (the wheel's stop for a `spin`, the set instant for a
 * `set`, so everybody sees a set game at once) and `vetoEndsAt` where it ends (ISO). `game` is the drawn or set game's card: the
 * Host's always, everybody else's from `stopAt` on; a set draw reveals only that game (Hidden wheel, story 54).
 */
export interface VetoDrawView {
  drawId: string
  kind: 'spin' | 'set'
  stopAt: string
  vetoEndsAt: string
  game: RoundGame | null
}

/**
 * The Lucky Wheel of a running Session (#229). `count` is how many slices it has now (the games left). `slices` are those games
 * in slice order, for the Host and on a visible wheel (also with the Pool preview off); null for a Member under a Hidden wheel,
 * who learns the count from the wheel only. `spin` is the Event's latest spin, null before the first.
 */
export interface WheelView {
  count: number
  slices: { id: string, name: string }[] | null
  spin: SpinView | null
  vetoes: VetoView
}

/**
 * The clip that runs now (#230, GLOSSARY: Clip, spec #218 § Clip): the latest draw's, from its stop to the end of the game's clip length,
 * for every Member alike. The instants are ISO; the client plays `clipPosition` of them against the server clock. `game.youtubeId`
 * may be null: then the client shows the game's card for the clip's length. It is keyed by the draw, not by the Round: a Veto
 * window (0.7-06) plays the clip of a draw that is not set yet.
 */
export interface ClipView { drawId: string, startAt: string, endsAt: string, game: RoundGame }

/**
 * The Event's Countdown (#236, spec #218 § Countdown): its stored facts, the duration and either the remaining time (paused, ready)
 * or the start instant (running, ISO). The page computes the time left from them and the server clock (remainingMsAt).
 */
export interface CountdownView { durationMs: number, remainingMs: number, startedAt: string | null }

/**
 * The Coin flip (#235, spec #218 § Coin flip): the Event's latest toss while a Session runs, for every Member, null otherwise. The
 * stored facts (ISO instants); the side shows in the UI only from `landsAt`.
 */
export interface CoinView { id: string, side: 'heads' | 'tails', startedAt: string, landsAt: string }
/** What `POST /api/e/:slug/coin` returns: the toss and its instants (ISO), #235. */
export interface CoinTossed { tossId: string, side: 'heads' | 'tails', startedAt: string, landsAt: string }
/** The Bonus Vetoes of the Event (#233): one count per Party, index 0 = team 1, and the Event-level reason the Host cannot grant one now (null when it can). */
export interface BonusVetoView { granted: number[], rejection: BonusVetoRejection | null }
/** What `POST /api/e/:slug/bonus-vetoes` returns: the Party and its Bonus Vetoes after the grant (#233). */
export interface BonusVetoGranted { team: number, granted: number }

/** What `POST /api/e/:slug/rounds` returns: the Round that was opened (#228). */
export interface RoundSet { roundId: string }
/** What `POST /api/e/:slug/rounds/spin` returns: the Round being drawn and its draw (#229). */
export interface RoundSpun { roundId: string, drawId: string }
/** What `POST /api/e/:slug/draws/:drawId/veto` returns: the draw and the Party whose Veto was cast (#231). */
export interface VetoCast { drawId: string, team: number }
/** What `POST /api/e/:slug/clip/skip` returns: the draw whose clip was skipped (#230). */
export interface ClipSkipped { drawId: string }
/** What `DELETE /api/e/:slug/rounds/:id` returns: the Round that was put back (#228). */
export interface RoundPutBack { roundId: string }
