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
// The showing runs inside the Theme reveal (#931, app/utils/theme-reveal.ts): with View Transitions the browser takes the old picture
// first and calls the showing a frame later, so the User state is not yet the choice just made. `newest` is therefore the choice made
// last, set at once: it is what a later tap, the save and the showing itself read while a save is on its way, and the showing shows it,
// not the choice it was made for. The save never waits for the reveal.

/** What one save needs, shared by every control: the answer the server last gave and whether a save is on its way. */
interface SaveState {
  saved: Appearance
  sending: boolean
  /** The choice made last, set at once (the User state follows a frame later under a reveal): the one to show, to compare with and to send next. */
  newest: Appearance
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
  const state = useState<SaveState>('appearance-save', () => ({ saved: 'light', sending: false, newest: 'light', latest: 0, failedFor: 0 }))
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

  /** What the device shows for System. */
  const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

  /**
   * The showing of the newest choice, called by the reveal: the newest, not the choice it was made for, since the callbacks of quick
   * taps run in order and the last one must leave the newest on screen. `<html data-theme>` is written by unhead after Vue's flush; when
   * it does not carry the look yet, it is written here, with the value app/plugins/appearance.ts gives a signed-in User, so the View
   * Transition's new picture has it.
   */
  async function applyNewest() {
    const newest = state.value.newest
    show(newest)
    await nextTick()
    if (user.value && document.documentElement.getAttribute('data-theme') !== newest) document.documentElement.setAttribute('data-theme', newest)
  }

  /** `origin` is the tapped option, where the Theme reveal spreads from; none cross-fades. */
  async function choose(next: Appearance, origin?: HTMLElement | null) {
    const shared = state.value
    if (!user.value) return
    const current = shared.sending ? shared.newest : appearance.value
    if (next === current) return
    if (!shared.sending) shared.saved = appearance.value
    shared.failedFor = 0
    shared.latest = id
    const dark = systemDark()
    const changes = shownLook(next, dark) !== shownLook(current, dark)
    shared.newest = next
    // The look the circle spreads to carries its edge (#933).
    void revealTheme(origin ?? null, changes, applyNewest, shownLook(next, dark))
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
          if (!user.value || shared.newest === sent) throw error
        }
        // Signed out meanwhile: nothing left to send.
        const newest: Appearance | undefined = user.value ? shared.newest : undefined
        sent = newest === shared.saved ? undefined : newest
      }
    }
    catch {
      // Back to what the server holds: a cross-fade, there is no tapped option to spread from.
      shared.newest = shared.saved
      const dark = systemDark()
      void revealTheme(null, !!user.value && shownLook(shared.saved, dark) !== shownLook(appearance.value, dark), applyNewest)
      shared.failedFor = shared.latest
      onFailure.get(shared.latest)?.()
    }
    finally {
      shared.sending = false
    }
  }

  return { appearance, failed, choices, icons: ICONS, choose }
}
