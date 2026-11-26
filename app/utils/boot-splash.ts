import type { AuthUser } from '~~/shared/auth'

/**
 * Whether the installed app's splash layer is in the first byte (#674, spec #927): Home, a signed-in User, and no `compies-boot` cookie (its presence,
 * any value). A signed-out User and one without a display name are redirected before the page renders, so `/` is the whole path rule; the query is
 * ignored. Whether the layer then shows is the stylesheet's (`display-mode: standalone`): a browser tab never sees it.
 */
export function bootSplashDue({ path, user, cookie }: { path: string, user: AuthUser | null, cookie: string | null | undefined }): boolean {
  return path === '/' && user !== null && (cookie === null || cookie === undefined)
}
