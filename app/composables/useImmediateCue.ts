import type { InjectionKey } from 'vue'
import type { CuePlayer } from '~/utils/cue-player'

// The Event page's immediate-play function, handed down (#741, spec #718): the cue composable is called in the Event page only, and a component
// that shows something a cue goes with (the Standings' sequence, later the Game board's drop and the Tour) asks for it here instead of making a
// player of its own. The pair is `provide` and `inject`, as `provideEventNotes` and its reader are (useEventNotes.ts).

/** The player's immediate-play function, whatever its signature is: `(id, delayMs?)` today, and a rate later (#743) with no edit here. */
export type ImmediateCue = CuePlayer['playNow']

export const immediateCueKey: InjectionKey<ImmediateCue> = Symbol('immediateCue')

/** The Event page's one call: makes `playNow` of the cue composable available to everything below it. */
export function provideImmediateCue(playNow: ImmediateCue): void {
  provide(immediateCueKey, playNow)
}

/**
 * The function a component calls where it shows something a cue goes with. Where nothing was provided (a component on its own, a test) it does
 * nothing and throws nothing. Gating is the player's: with Ton off nothing is scheduled, logged or requested, and a context that does not run
 * or a file not decoded yet is logged `skipped`. The files come with the component's group (`reachableGroups`), not with the call.
 */
export function useImmediateCue(): ImmediateCue {
  return inject(immediateCueKey, null) ?? (() => {})
}
