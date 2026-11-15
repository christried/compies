import type { Appearance } from '~~/shared/appearance'
import type { SavedAppearance } from '~~/shared/auth'

// The signed-in User's Appearance for the row „Darstellung“ on the Profil page (#404, GLOSSARY: Appearance). A choice shows
// at once: it goes into the User's state, which app/plugins/appearance.ts draws onto <html> and the browser bar. Then it is
// saved; the route also sets or removes this device's cookie (#403). A failed save puts back the Appearance the server holds
// and raises `failed`. Quick taps: while a save is on its way the later choices show but wait, and only the newest is sent
// once the first is back, as Votes do (#50). `onFailed` is for the header's menus, which say a failed save in a toast (#617); the
// Profil page shows the notice from `failed` instead.
export function useAppearance(options?: { onFailed?: () => void }) {
  const user = useAuthUser()
  /** The Appearance the page shows, by the one render rule (light for a User state without a valid one). */
  const appearance = computed(() => renderedAppearance({ user: user.value }))
  const failed = ref(false)
  /** What the server holds: read when no save is in flight, then each answer. */
  let saved: Appearance = 'light'
  let sending = false

  function show(value: Appearance) {
    if (user.value) user.value = { ...user.value, appearance: value }
  }

  async function choose(next: Appearance) {
    if (!user.value || next === appearance.value) return
    if (!sending) saved = appearance.value
    failed.value = false
    show(next)
    if (sending) return
    sending = true
    try {
      let sent: Appearance | undefined = next
      while (sent !== undefined) {
        saved = (await $fetch<SavedAppearance>('/api/me/appearance', { method: 'POST', body: { appearance: sent } })).appearance
        // Signed out meanwhile: nothing left to send.
        const newest: Appearance | undefined = user.value ? appearance.value : undefined
        sent = newest === sent ? undefined : newest
      }
    }
    catch {
      show(saved)
      failed.value = true
      options?.onFailed?.()
    }
    finally {
      sending = false
    }
  }

  return { appearance, failed: readonly(failed), choose }
}
