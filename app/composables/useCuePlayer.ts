import { createCuePlayer, exposesCueLog, type CueLogEntry, type CuePlayer } from '~/utils/cue-player'
import { reducedMotion } from '~/utils/motion'
import { coinCuePlan, cueFileUrl, cueFilesOf, reachableGroups, vetoArrivalCues, vetoCuePlan, wheelCuePlan, wheelVoicePlan, type Cue, type GroupInput, type VetoArrivalState } from '~/utils/sound-cues'
import type { EventView } from '~~/shared/event'

// The sound of the Event page (#531, spec #504 § The cue player): the page's one Web Audio context, the cue player on it, and the plan the
// Event read gives it. The page's read is what carries a plan to a device, so a refetch (the room's `event.changed`, which reaches a hidden
// tab too) is all the player needs: the watch below runs on Vue's microtask queue and hands every cue to the audio clock ahead of time. No
// timer and no frame here, because a hidden tab runs none of them on time. The one `visibilitychange` listener only tells the player to look
// again at what it holds (#594, a slept laptop can have an audio clock and a `performance.now()` that stopped apart): no cue is scheduled
// from it, a timer or a frame.

/**
 * What the group rule reads of a read (#740): three flags, so no file is requested from anything the viewer may not know. Which groups they
 * reach and which files each group holds are `reachableGroups` and `CUE_GROUPS` in sound-cues.ts (#531, #532).
 */
function groupInputOf(view: EventView | null | undefined): GroupInput {
  return {
    wheel: view?.wheel != null,
    vetoAllowance: view?.settings?.vetoAllowance ?? 0,
    vetoWindow: view?.wheel?.vetoes.draw != null,
    // Both are the same for every viewer's read; `view.coin` is only tested for null, its side is never read (#669).
    sessionRunning: view?.runningSessionId != null,
    toss: view?.coin != null,
  }
}

/**
 * The plan of a read: every cue the Event page has due, from the viewer's own read only (CODING_STANDARDS § Secrecy), so the five fields of the
 * spin go to the wheel's plan and its two instants to the voice's (#671), the window's four and the Clip's two are copied; the drawn game, `own`, `left` and `revealed` stay where they are. No spin and no
 * window give an empty plan. The two plans may overlap in time; the player diffs by key, so no sort across them is needed.
 */
function planOf(view: EventView): Cue[] {
  const spin = view.wheel?.spin
  const draw = view.wheel?.vetoes.draw
  return [
    ...wheelCuePlan({
      spin: spin ? { spinStartAt: spin.spinStartAt, stopAt: spin.stopAt, slices: spin.slices, resultIndex: spin.resultIndex, resultOffset: spin.resultOffset } : null,
      hiddenWheel: view.settings?.hiddenWheel ?? false,
      isHost: view.event.isHost,
      reducedMotion: reducedMotion(),
    }),
    ...wheelVoicePlan({
      spin: spin ? { spinStartAt: spin.spinStartAt, stopAt: spin.stopAt } : null,
      hiddenWheel: view.settings?.hiddenWheel ?? false,
      reducedMotion: reducedMotion(),
    }),
    ...vetoCuePlan({
      draw: draw ? { drawId: draw.drawId, kind: draw.kind, stopAt: draw.stopAt, vetoEndsAt: draw.vetoEndsAt } : null,
      clip: view.clip ? { drawId: view.clip.drawId, endsAt: view.clip.endsAt } : null,
      reducedMotion: reducedMotion(),
    }),
    // The Coin flip: the toss's two instants only, never its side (ADR 0013 amendment).
    ...coinCuePlan({ toss: view.coin ? { startedAt: view.coin.startedAt, landsAt: view.coin.landsAt } : null, reducedMotion: reducedMotion() }),
  ]
}

/** What the arrival cues read of a read: the window, the viewer's own Party's cast (`own` is the viewer's only) and how many Vetoes were revealed. */
function arrivalOf(view: EventView): VetoArrivalState {
  const vetoes = view.wheel?.vetoes
  const draw = vetoes?.draw
  return {
    draw: draw ? { drawId: draw.drawId, kind: draw.kind, stopAt: draw.stopAt, vetoEndsAt: draw.vetoEndsAt } : null,
    ownCast: vetoes?.own?.cast ?? false,
    revealedCount: vetoes?.revealed?.length ?? null,
  }
}

export function useCuePlayer(input: {
  view: () => EventView | null | undefined
  serverNow: () => number
  /** The server clock's readiness: nothing is planned before it, a device clock running ahead would start the cues early. */
  ready: () => boolean
  /** Grows when the server clock's offset changed (`useServerClock().moves`): the pending cues are looked at again (#594). */
  moved: () => number
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
  const exposeLog = exposesCueLog(import.meta.dev, Boolean(useRuntimeConfig().public.staging))
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

  /** Gives the player the plan of the current read, and the files of the groups the read reaches. */
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
    made.preload(cueFilesOf(reachableGroups(groupInputOf(view))))
    made.setPlan(view ? planOf(view) : [])
  }

  // Not a sync watch: a refetch of the same read is a new object every time, and the player diffs the plan, so it schedules nothing twice.
  watch([() => input.view(), () => input.ready(), () => enabled.value, mounted], sync)

  // The server clock's offset changed (the first answer, a re-sync): a cue scheduled on the old reading moves with it (#594).
  watch(input.moved, () => player?.refresh())
  const onVisibility = () => {
    if (document.visibilityState === 'visible') player?.refresh()
  }
  if (import.meta.client) {
    onMounted(() => document.addEventListener('visibilitychange', onVisibility))
    onScopeDispose(() => document.removeEventListener('visibilitychange', onVisibility))
  }

  // What the arrival of a read causes (#532): the own Party's cast, the stamps, a set game's opening. After `sync`, so the player exists. The
  // state is kept with Ton off or a suspended context too, so switching either on later replays nothing; `playNow` is the gate.
  let previous: VetoArrivalState | null = null
  watch(() => input.view(), (view) => {
    if (!view) return
    const next = arrivalOf(view)
    if (input.ready()) {
      for (const cue of vetoArrivalCues(previous, next, input.serverNow())) player?.playNow(cue.id, cue.delayMs)
    }
    previous = next
  }, { immediate: true })

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
