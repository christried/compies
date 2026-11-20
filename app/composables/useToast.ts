// Transient feedback (02-components § ToastStack). Success and info toasts go after a few seconds;
// errors stay until dismissed. The stack keeps the newest three. A timed toast waits for the keyboard (#867):
// its timer holds while Tab presses go on or focus is on the stack, and runs on with the time it had left.

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastInput {
  tone: ToastTone
  text: string
  action?: ToastAction
  /** Milliseconds before it goes away. Errors default to staying. */
  duration?: number
}

export interface Toast extends ToastInput {
  id: number
}

const DEFAULT_DURATION_MS = 4000
const MAX_STACKED = 3
/** After the last Tab press anywhere on the page the timers wait this long more (#867). */
const TAB_HOLD_MS = 3000
let lastId = 0

/** How long a toast stays, or null when it stays until dismissed. */
export function toastDuration(input: ToastInput): number | null {
  return input.duration ?? (input.tone === 'error' ? null : DEFAULT_DURATION_MS)
}

/** One timed toast's timer: `left` ms remain, counted from `since` while `handle` runs; no handle means it is held. */
interface Timer {
  left: number
  since: number
  handle: ReturnType<typeof setTimeout> | null
}

// The timers and the hold are the page's, not a request's: nothing here is drawn, so none of it is reactive.
const timers = new Map<number, Timer>()
let focusInside = false
let tabHold: ReturnType<typeof setTimeout> | null = null

const held = () => focusInside || tabHold !== null

function pause(timer: Timer) {
  if (timer.handle === null) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.left -= Date.now() - timer.since
}

function forget(id: number) {
  const timer = timers.get(id)
  if (!timer) return
  if (timer.handle !== null) clearTimeout(timer.handle)
  timers.delete(id)
}

/** The toast stack. `toast()` shows one, `dismiss()` removes one by id. */
export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])
  /** Whether a toast with a timer is up: the stack listens for Tab only then. */
  const timed = computed(() => toasts.value.some(item => toastDuration(item) !== null))

  function start(id: number, timer: Timer) {
    timer.since = Date.now()
    timer.handle = setTimeout(() => dismiss(id), timer.left)
  }

  /** Runs every held timer on, unless something still holds. */
  function release() {
    if (held()) return
    for (const [id, timer] of timers) {
      if (timer.handle === null) start(id, timer)
    }
  }

  /** Drops the timers of toasts that left the list (the eviction by a fourth), and the hold once no timed toast is up. */
  function prune() {
    const ids = new Set(toasts.value.map(item => item.id))
    for (const id of timers.keys()) {
      if (!ids.has(id)) forget(id)
    }
    if (timers.size > 0) return
    if (tabHold !== null) clearTimeout(tabHold)
    tabHold = null
    focusInside = false
  }

  function dismiss(id: number) {
    forget(id)
    toasts.value = toasts.value.filter(item => item.id !== id)
    prune()
  }

  function toast(input: ToastInput): number {
    prune()
    const id = ++lastId
    toasts.value = [...toasts.value, { ...input, id }].slice(-MAX_STACKED)
    const duration = toastDuration(input)
    if (duration !== null) {
      const timer: Timer = { left: duration, since: Date.now(), handle: null }
      timers.set(id, timer)
      if (!held()) start(id, timer)
    }
    prune()
    return id
  }

  /** A Tab press somewhere on the page: every timed toast waits, and runs on 3 s after the last press (unless focus is on the stack by then). */
  function holdForTab() {
    if (timers.size === 0) return
    for (const timer of timers.values()) pause(timer)
    if (tabHold !== null) clearTimeout(tabHold)
    tabHold = setTimeout(() => {
      tabHold = null
      release()
    }, TAB_HOLD_MS)
  }

  /** Focus is on a button of the stack, or has left it. */
  function setFocusInside(inside: boolean) {
    focusInside = inside
    if (inside) {
      for (const timer of timers.values()) pause(timer)
    }
    else {
      release()
    }
  }

  return { toasts: readonly(toasts), toast, dismiss, timed, holdForTab, setFocusInside }
}
