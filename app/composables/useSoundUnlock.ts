// Letting sound through on the Event page (#533, spec #504 § Ton and „Ton aktivieren“): a browser plays nothing before the first gesture on the
// page. The listener below is the page-wide one: while the cue player's audio context is held back it takes any gesture a browser counts as an
// activation and calls the cue player's `resume` inside it (never building a context itself). The notice's condition lives here too, and the page's
// gesture flag the Clip reads on a phone.

/** The events a browser counts as a user activation that may start audio (iOS Safari: `click`, `keydown`; Chrome: `pointerup` too). Not `pointerdown`, `touchstart`, a scroll or a wheel. */
const GESTURE_EVENTS = ['pointerup', 'click', 'keydown'] as const
const LISTENER_OPTIONS = { capture: true, passive: true } as const

/** A context a browser lets run may read `suspended` for a moment after it is made: the notice waits this long, so such a browser shows no flash. */
export const NOTICE_SETTLE_MS = 300

/** „This document has had a gesture“ (a browser's user activation is per document and sticky): the Clip on a phone starts with sound after it. */
export const useSoundGesture = () => readonly(useState<boolean>('sound-gestured', () => false))

export function useSoundUnlock(input: {
  /** The cue player's: true until its context runs, and true with no context. */
  suspended: Readonly<Ref<boolean>>
  resume: () => Promise<void>
  /** The server clock's readiness: the cue player makes its context only after it. */
  ready: () => boolean
  sessionRunning: () => boolean
}): { noticeShown: Readonly<Ref<boolean>>, unlock: () => void } {
  // Order matters: `useSound` registers its read of the stored switch first, so Ton has its stored value when `mounted` turns true.
  const { enabled } = useSound()
  const gestured = useState<boolean>('sound-gestured', () => false)
  const mounted = ref(false)
  const hasAudio = ref(false)
  onMounted(() => {
    hasAudio.value = Boolean(globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext)
    mounted.value = true
  })
  /** This gesture was taken: the notice goes at once, the context itself turns running a promise tick later. */
  const tapped = ref(false)
  watch(input.suspended, (held) => {
    if (!held) tapped.value = false
  })

  /** The listener's handler and the notice's button. Synchronous: iOS only starts a context from inside the gesture. */
  function unlock() {
    gestured.value = true
    // Ton off: there is no context to start, and the gesture is noted only. The Ton switch's own click comes back here with Ton on.
    if (!enabled.value) return
    tapped.value = true
    // One resume per gesture: a click on the notice's button reaches the document's listener and the button's own handler.
    if (resuming) return
    resuming = true
    void input.resume().finally(() => {
      resuming = false
    })
  }
  let resuming = false

  function onGesture(event: Event) {
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') return
    unlock()
  }

  // With Ton off the cue player has no context and `suspended` stays true: the listener stays on purpose, so the Ton switch works from the first tap.
  const listening = computed(() => mounted.value && hasAudio.value && input.suspended.value)
  let attached = false
  function detach() {
    if (!attached) return
    attached = false
    for (const type of GESTURE_EVENTS) document.removeEventListener(type, onGesture, LISTENER_OPTIONS)
  }
  watch(listening, (on) => {
    detach()
    if (!on) return
    attached = true
    for (const type of GESTURE_EVENTS) document.addEventListener(type, onGesture, LISTENER_OPTIONS)
  }, { immediate: true })

  // Ton switched on after mount: the context is made by the cue player's watch a microtask after the click, where iOS may leave it suspended.
  // This runs inside the click, so `resume` makes the context and starts it inside that gesture. `mounted` is still false while `useSound`'s own
  // read of the stored switch runs, so that read does not come here.
  watch(enabled, (on) => {
    if (on && mounted.value) unlock()
  }, { flush: 'sync' })

  const wanted = computed(() => mounted.value && hasAudio.value && enabled.value && input.ready() && input.sessionRunning() && input.suspended.value && !tapped.value)
  const settled = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(wanted, (now) => {
    clearTimeout(timer)
    settled.value = false
    if (now) {
      timer = setTimeout(() => {
        settled.value = true
      }, NOTICE_SETTLE_MS)
    }
  }, { immediate: true })

  onScopeDispose(() => {
    clearTimeout(timer)
    detach()
  })

  return { noticeShown: computed(() => wanted.value && settled.value), unlock }
}
