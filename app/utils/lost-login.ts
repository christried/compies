import { guardRoute } from '~/utils/auth-guard'
import { ARCHIVE_KEY } from '~/utils/event-data'

/**
 * Wraps a fetch so that an API answer 401 (login ran out, or signed out in another tab) clears the
 * signed-in User and sends the visitor to sign-in with the page they were on (#66).
 */
export function signOutOn401(fetchFn: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetchFn(input, init)
    if (response.status === 401 && new URL(response.url || String(input), location.href).pathname.startsWith('/api/')) {
      useAuthUser().value = null
      clearNuxtData(ARCHIVE_KEY) // the Archive keeps its list for the way back (#984); it is not the next User's
      const redirect = guardRoute(useRoute(), null)
      if (redirect) await navigateTo(redirect)
    }
    return response
  }
}
