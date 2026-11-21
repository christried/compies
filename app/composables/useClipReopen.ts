import type { InjectionKey } from 'vue'

// „Zum Video“ (#956, spec #961 § Clip reopen): a device that closed the Clip opens it again while it runs. The Event page keeps the closed state,
// keyed by the draw, and hands the action down; the wheel's result card asks for it here, as `useImmediateCue` asks for the cue player. The Veto
// bar, a layer of the page itself, gets it as a prop.

/** Opens this device's closed Clip again, or null while there is none to open (not closed, not running, skipped). */
export type ClipReopen = (() => void) | null

const clipReopenKey: InjectionKey<() => ClipReopen> = Symbol('clipReopen')

/** The Event page's one call: makes its „Zum Video“ action available to everything below it. */
export function provideClipReopen(source: () => ClipReopen): void {
  provide(clipReopenKey, source)
}

/** The action where a component offers „Zum Video“; null where nothing was provided (a component on its own, a test) and while nothing is to open. */
export function useClipReopen(): ComputedRef<ClipReopen> {
  const source = inject(clipReopenKey, null)
  return computed(() => source?.() ?? null)
}
