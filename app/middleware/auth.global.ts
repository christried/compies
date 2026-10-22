import { appendResponseHeader } from 'h3'
import type { AuthUser } from '~/composables/useAuthUser'
import { guardRoute } from '~/utils/auth-guard'

// Loads the signed-in User once per page load (server-side on the first request), then guards
// every navigation. Sign-in, sign-out and profile setup update the state themselves.
export default defineNuxtRouteMiddleware(async (to) => {
  const user = useAuthUser()
  const loaded = useState('auth-user-loaded', () => false)
  if (!loaded.value) {
    user.value = await loadUser()
    loaded.value = true
  }
  const redirect = guardRoute(to, user.value)
  if (redirect) return navigateTo(redirect)
})

async function loadUser(): Promise<AuthUser | null> {
  if (import.meta.client) return (await $fetch<{ user: AuthUser | null }>('/api/me')).user
  // Better Auth may extend the login session while reading it; pass its cookie on to the browser.
  const event = useRequestEvent()!
  const response = await $fetch.raw<{ user: AuthUser | null }>('/api/me', { headers: useRequestHeaders(['cookie']) })
  for (const cookie of response.headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie)
  return response._data!.user
}
