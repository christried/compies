import { APPEARANCE_COOKIE } from '~~/shared/auth'

// The page's Appearance (#401): `data-theme` on <html> and the browser bar's colour, from the User the auth middleware loaded,
// or signed out from the device's `compies-appearance` cookie (#403).
// A plugin rather than app.vue, like title.ts, so it also holds where a page renders without the app around it (the Nuxt tests).
// The values are computed: the plugin runs before the route middleware has loaded the User, and the server renders the head
// only after it, so the first byte already carries the User's look; on the client they follow the User's state (#404 sets it)
// and the cookie, which follows the route's Set-Cookie through the browser's CookieStore, so Abmelden keeps the look.
export default defineNuxtPlugin(() => {
  const user = useAuthUser()
  // Read-only and undecoded: the server alone writes the cookie (#403), and the rule wants its raw value.
  const cookie = useCookie<string | null | undefined>(APPEARANCE_COOKIE, { readonly: true, decode: value => value })
  const appearance = computed(() => renderedAppearance({ user: user.value, cookie: cookie.value }))
  useHead({
    htmlAttrs: { 'data-theme': appearance },
    meta: computed(() => themeColorMetas(appearance.value)),
  })
})
