import type { InjectionKey } from 'vue'
import { CLIP_VOLUME, type ClipDuck } from '~/utils/clip-duck'

// The Event page's one Clip duck, handed down (#670, spec #927): the page makes it, the cue player tells it which cue sounds, and the Clip
// overlay attaches the YouTube player's volume to it. The pair is `provide` and `inject`, as `provideImmediateCue` and its reader are
// (useImmediateCue.ts).

export const clipDuckKey: InjectionKey<ClipDuck> = Symbol('clipDuck')

/** The Event page's one call: makes its duck available to the Clip overlay below it. */
export function provideClipDuck(duck: ClipDuck): void {
  provide(clipDuckKey, duck)
}

/** The no-op duck of a component on its own (a test): it moves nothing and calls no sink. */
const noDuck: ClipDuck = {
  note: () => {},
  attach: () => () => {},
  level: CLIP_VOLUME,
  dispose: () => {},
}

/** The duck the overlay attaches to. Where nothing was provided it does nothing and throws nothing. */
export function useClipDuck(): ClipDuck {
  return inject(clipDuckKey, null) ?? noDuck
}
