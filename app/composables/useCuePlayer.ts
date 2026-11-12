import { createCuePlayer, type CueLogEntry, type CuePlayer } from '~/utils/cue-player'
import { reducedMotion } from '~/utils/motion'
import { CUE_IDS, cueFileUrl, wheelCuePlan, type Cue, type CueId } from '~/utils/sound-cues'
import type { EventView } from '~~/shared/event'

// The sound of the Event page (#531, spec #504 § The cue player): the page's one Web Audio context, the cue player on it, and the plan the
// Event read gives it. The page's read is what carries a plan to a device, so a refetch (the room's `event.changed`, which reaches a hidden
// tab too) is all the player needs: the watch below runs on Vue's microtask queue and hands every cue to the audio clock ahead of time. No
// timer, no frame and no visibility check here, because a hidden tab runs none of them on time.

/** The Event page's cue files: fetched and decoded when the read has a wheel (#531; #532 adds the Veto window's). */
const WHEEL_IDS: readonly CueId[] = CUE_IDS.filter(id => id.startsWith('wheel-'))

/**
 * The plan of a read: every cue the Event page has due, from the viewer's own read only (CODING_STANDARDS § Secrecy), so the five fields of the
 * spin are copied and the drawn game stays where it is. No spin or no wheel gives an empty plan. #532 adds the Veto window's plan here.
 */
function planOf(view: EventView): Cue[] {
  const spin = view.wheel?.spin
  return wheelCuePlan({
    spin: spin ? { spinStartAt: spin.spinStartAt, stopAt: spin.stopAt, slices: spin.slices, resultIndex: spin.resultIndex, resultOffset: spin.resultOffset } : null,
    hiddenWheel: view.settings?.hiddenWheel ?? false,
    isHost: view.event.isHost,
    reducedMotion: reducedMotion(),
  })
}

export function useCuePlayer(input: {
  view: () => EventView | null | undefined
  serverNow: () => number
  /** The server clock's readiness: nothing is planned before it, a device clock running ahead would start the cues early. */
  ready: () => boolean
}): { suspended: Readonly<Ref<boolean>>, resume: () => Promise<void> } {
  // Order matters: `useSound` registers its read of the stored switch first, so Ton has its stored value when `mounted` turns true.
  const { enabled } = useSound()
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  /** True until the player says it runs; true too with no context (Ton off, no Web Audio). #533 reads it with Ton and a running Session. */
  const suspended = ref(true)

  let context: AudioContext | null = null
  let player: CuePlayer | null = null
  // The log for the browser check (#537) is the page's own data: dev and staging builds only, never production.
  const exposeLog = import.meta.dev || Boolean(useRuntimeConfig().public.staging)
  const globals = globalThis as { __compiesCueLog?: () => readonly CueLogEntry[], webkitAudioContext?: typeof AudioContext }

  /** The page's one context and player, made on the first moment the page is mounted and Ton is on: never on the server, never with Ton off. */
  function ensure(): CuePlayer | null {
    if (player) return player
    if (!import.meta.client || !mounted.value || !enabled.value) return null
    const Context = globalThis.AudioContext ?? globals.webkitAudioContext
    if (!Context) return null
    let made: CuePlayer | null = null
    try {
      context = new Context()
      made = createCuePlayer({
        context,
        serverNow: input.serverNow,
        loadFile: id => $fetch<ArrayBuffer>(cueFileUrl(id), { responseType: 'arrayBuffer' }),
        onChange: () => {
          suspended.value = made?.suspended ?? true
        },
        enabled: enabled.value,
      })
    }
    catch {
      // A browser that refuses a context: no sound, no error.
      context = null
      return null
    }
    player = made
    suspended.value = made.suspended
    if (exposeLog) globals.__compiesCueLog = () => made.log
    return made
  }

  /** Gives the player the plan of the current read, and the files it needs once the read has a wheel. */
  function sync() {
    if (!mounted.value || !input.ready()) return
    if (!enabled.value) {
      player?.setEnabled(false)
      return
    }
    const made = ensure()
    if (!made) return
    made.setEnabled(true)
    const view = input.view()
    if (view?.wheel) made.preload(WHEEL_IDS)
    made.setPlan(view ? planOf(view) : [])
  }

  // Not a sync watch: a refetch of the same read is a new object every time, and the player diffs the plan, so it schedules nothing twice.
  watch([() => input.view(), () => input.ready(), () => enabled.value, mounted], sync)

  onScopeDispose(() => {
    player?.dispose()
    player = null
    if (exposeLog) Reflect.deleteProperty(globals, '__compiesCueLog')
    try {
      void context?.close().catch(() => {})
    }
    catch {
      // Closed already, or no `close`: the page is going anyway.
    }
    context = null
  })

  /** For #533's page-wide gesture listener: starts the context (made here when the gesture is the first moment it can be), inside the gesture. */
  async function resume() {
    sync()
    await ensure()?.resume()
  }

  return { suspended: readonly(suspended), resume }
}
