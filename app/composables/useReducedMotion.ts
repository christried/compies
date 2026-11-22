import { MOTION_COOKIE, MOTION_REDUCED } from '~~/shared/motion'
import type { SavedMotion } from '~~/shared/auth'

// This device's Reduced motion for the row „Weniger Bewegung“ on the Profil page and for `data-motion` on <html> (#680, GLOSSARY:
// Reduced motion). What is stored is the cookie `compies-motion`, which only the server writes (the route /api/me/motion). A choice shows
// at once: it is kept in `motion-choice` and wins over the cookie, so the switch and the page follow the tap without waiting for the
// save. Then it is saved; a failed save puts back what was shown before and raises `failed`. Quick taps: while a save is on its way the
// later choices show but wait, and only the newest is sent once the first is back, as the Appearance's are (#657). The save's state is
// shared, so a card mounted again while a save is on its way joins it instead of sending a second one. The device's own setting plays
// no part here: the switch shows what is stored, and the media queries and tokens handle the device.

/** What one save needs: the answer the server last gave, whether a save is on its way, and whether the last one failed. */
interface SaveState {
  saved: boolean
  sending: boolean
  failed: boolean
}

/** What the page and the switch show: a choice not yet saved, else the stored cookie. Read-only and undecoded: the server alone writes it. */
export function useReducedMotion() {
  const cookie = useCookie<string | null | undefined>(MOTION_COOKIE, { readonly: true, decode: value => value })
  const choice = useState<boolean | null>('motion-choice', () => null)
  return computed(() => choice.value ?? cookie.value === MOTION_REDUCED)
}

export function useReducedMotionSetting() {
  const reduced = useReducedMotion()
  const choice = useState<boolean | null>('motion-choice', () => null)
  const state = useState<SaveState>('motion-save', () => ({ saved: false, sending: false, failed: false }))
  const failed = computed(() => state.value.failed)

  async function choose(next: boolean) {
    if (next === reduced.value) return
    const shared = state.value
    if (!shared.sending) shared.saved = reduced.value
    shared.failed = false
    choice.value = next
    if (shared.sending) return
    shared.sending = true
    try {
      while (choice.value !== null && choice.value !== shared.saved) {
        const sent: boolean = choice.value
        try {
          shared.saved = (await $fetch<SavedMotion>('/api/me/motion', { method: 'POST', body: { reduced: sent } })).reduced
        }
        catch (error) {
          // A choice made meanwhile is the one that counts: it is sent next, and only its failure is said.
          if (choice.value === sent) throw error
        }
      }
    }
    catch {
      choice.value = shared.saved
      shared.failed = true
    }
    finally {
      shared.sending = false
    }
  }

  return { reduced, failed, choose }
}
