import { Monitor, Moon, Sun } from '@lucide/vue'
import type { Component } from 'vue'
import { APPEARANCES } from '~~/shared/appearance'
import type { Appearance } from '~~/shared/appearance'
import type { SavedAppearance } from '~~/shared/auth'

// The signed-in User's Appearance for the row „Darstellung“ on the Profil page (#404, GLOSSARY: Appearance). A choice shows
// at once: it goes into the User's state, which app/plugins/appearance.ts draws onto <html> and the browser bar. Then it is
// saved; the route also sets or removes this device's cookie (#403). A failed save puts back the Appearance the server holds
// and raises `failed`. Quick taps: while a save is on its way the later choices show but wait, and only the newest is sent
// once the first is back, as Votes do (#50). That holds across every control of the page, because the header's menu, the avatar
// menu's row and the Profil card show one Appearance and share one save (#657). A newer choice made while a save is on its way
// outlives that save's failure: it is the one sent next. `toast` is for the header's menus, which say a failed save in a toast
// (#617); the Profil page shows the notice from `failed` instead.

/** What one save needs, shared by every control: the answer the server last gave and whether a save is on its way. */
interface SaveState {
  saved: Appearance
  sending: boolean
  /** The control whose choice was the latest, and the one that hears of a failure (it has the User's eye). */
  latest: number
  /** The control that shows the notice of a failed save, none after a new choice. */
  failedFor: number
}

// Typed by the Appearance, so a fourth one without an icon fails the typecheck.
const ICONS: Record<Appearance, Component> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

let controls = 0
/** What each mounted control does on a failed save. */
const onFailure = new Map<number, () => void>()

export function useAppearance(options?: { toast?: boolean }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const user = useAuthUser()
  const state = useState<SaveState>('appearance-save', () => ({ saved: 'light', sending: false, latest: 0, failedFor: 0 }))
  // Only the browser registers: a choice and its failure happen there, and on the server a component's scope is never disposed,
  // so every request would leave its closure (and through it its app) in the module-level Map for good. The server render
  // writes no module-level state; its id (-1) matches no `failedFor`.
  const id = import.meta.client ? ++controls : -1
  if (import.meta.client) {
    if (options?.toast) onFailure.set(id, () => toast({ tone: 'error', text: t('settings.appearanceSaveFailed') }))
    onScopeDispose(() => onFailure.delete(id))
  }

  /** The Appearance the page shows, by the one render rule (light for a User state without a valid one). */
  const appearance = computed(() => renderedAppearance({ user: user.value }))
  const failed = computed(() => state.value.failedFor === id)
  /** The three choices, written once from the list (#603): value and label for a control, icon for a menu. */
  const choices = computed(() => APPEARANCES.map(value => ({ value, label: t(`settings.${value}`) })))

  function show(value: Appearance) {
    if (user.value) user.value = { ...user.value, appearance: value }
  }

  async function choose(next: Appearance) {
    if (!user.value || next === appearance.value) return
    const shared = state.value
    if (!shared.sending) shared.saved = appearance.value
    shared.failedFor = 0
    shared.latest = id
    show(next)
    if (shared.sending) return
    shared.sending = true
    try {
      let sent: Appearance | undefined = next
      while (sent !== undefined) {
        try {
          shared.saved = (await $fetch<SavedAppearance>('/api/me/appearance', { method: 'POST', body: { appearance: sent } })).appearance
        }
        catch (error) {
          // A choice made meanwhile is the one that counts: it is sent next, and only its failure is said.
          if (!user.value || appearance.value === sent) throw error
        }
        // Signed out meanwhile: nothing left to send.
        const newest: Appearance | undefined = user.value ? appearance.value : undefined
        sent = newest === shared.saved ? undefined : newest
      }
    }
    catch {
      show(shared.saved)
      shared.failedFor = shared.latest
      onFailure.get(shared.latest)?.()
    }
    finally {
      shared.sending = false
    }
  }

  return { appearance, failed, choices, icons: ICONS, choose }
}
