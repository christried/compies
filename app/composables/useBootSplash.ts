import { bootSplashDue } from '~/utils/boot-splash'
import { BOOT_COOKIE } from '~~/shared/boot'

/**
 * Whether the installed app's splash layer is in this page load (#674, spec #927): decided once, by the first request on the server, and taken from the
 * payload by the client, so a client-side navigation to Home never decides again and never shows it. `app.vue`'s setup runs after the auth middleware, so the
 * User is loaded. The cookie is read-only and undecoded, as the Appearance plugin reads its own: only its presence counts, and the page writes it.
 */
export function useBootSplash() {
  return useState<boolean>('boot-splash-due', () => {
    const cookie = useCookie<string | null | undefined>(BOOT_COOKIE, { readonly: true, decode: value => value }).value
    return bootSplashDue({ path: useRoute().path, user: useAuthUser().value, cookie })
  })
}
