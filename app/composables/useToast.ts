// Transient feedback (02-components § ToastStack). Success and info toasts go after a few seconds;
// errors stay until dismissed. The stack keeps the newest three.

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
let lastId = 0

/** The toast stack. `toast()` shows one, `dismiss()` removes one by id. */
export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }

  function toast(input: ToastInput): number {
    const id = ++lastId
    toasts.value = [...toasts.value, { ...input, id }].slice(-MAX_STACKED)
    const duration = input.duration ?? (input.tone === 'error' ? null : DEFAULT_DURATION_MS)
    if (duration !== null) setTimeout(() => dismiss(id), duration)
    return id
  }

  return { toasts: readonly(toasts), toast, dismiss }
}
