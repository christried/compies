import { TOUR_VERSION } from '~~/shared/tour'
import type { SavedTourSeen } from '~~/shared/auth'

// The one home of the User's stored Tour version (`user.tourSeen`, #785; GLOSSARY: Tour): who reads it and who writes it, with the routes. `useTour`
// finishes or skips with `markSeen`, the Profil's „Rundgang“ row sets it back with `reset`. Like useNewsSeen, the number is shown at once and the
// server's number comes back with the next `GET /api/me`.

export function useTourSeen() {
  const user = useAuthUser()

  /** The stored version; null when nobody is signed in. */
  const stored = computed(() => user.value?.tourSeen ?? null)

  /** The current version is seen at once and never lowered, like the server; the save runs in the background and is never awaited. */
  function markSeen() {
    const current = user.value
    if (!current) return
    user.value = { ...current, tourSeen: Math.max(current.tourSeen, TOUR_VERSION) }
    void save()
  }

  async function save() {
    try {
      await $fetch('/api/me/tour-seen', { method: 'POST', body: { version: TOUR_VERSION } })
    }
    catch {
      // The client stays „seen“ until the next page load, whose `GET /api/me` brings the server's number back: the Tour shows again at the next visit.
    }
  }

  /** Sets the number back to what the server says (0). A failed reset throws and changes nothing: the caller says so. */
  async function reset() {
    const saved = await $fetch<SavedTourSeen>('/api/me/tour-reset', { method: 'POST' })
    if (user.value) user.value = { ...user.value, tourSeen: saved.tourSeen }
  }

  return { stored, markSeen, reset }
}
