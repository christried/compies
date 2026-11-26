// The device's memory of the installed app's splash (#674, spec #927, screen 01). The page writes this cookie itself, once the layer has shown: no
// route and no server code sets it (the device cookies of `server/utils/device-cookie.ts` are written by the server; this one is not). The server
// only reads its presence, to decide whether the layer is in the first byte (`bootSplashDue`).

/** The cookie's name. Its value carries nothing: only that the animation ran on this device. */
export const BOOT_COOKIE = 'compies-boot'

const BOOT_SEEN = 'seen'
/** The splash comes at most once in 24 hours. */
const BOOT_MAX_AGE_S = 24 * 60 * 60

/**
 * The line the page assigns to `document.cookie`. `Secure` where the page is served over https: that is the session cookie's own rule
 * (`BETTER_AUTH_URL` is the https origin), so the page's protocol is the same fact.
 */
export function bootCookie(secure: boolean): string {
  return `${BOOT_COOKIE}=${BOOT_SEEN}; Max-Age=${BOOT_MAX_AGE_S}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}
