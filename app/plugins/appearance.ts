// The page's Appearance (#401): `data-theme` on <html> and the browser bar's colour, from the User the auth middleware loaded.
// A plugin rather than app.vue, like title.ts, so it also holds where a page renders without the app around it (the Nuxt tests).
// The values are computed: the plugin runs before the route middleware has loaded the User, and the server renders the head
// only after it, so the first byte already carries the User's look; on the client they follow the User's state (#404 sets it).
export default defineNuxtPlugin(() => {
  const user = useAuthUser()
  const appearance = computed(() => renderedAppearance({ user: user.value }))
  useHead({
    htmlAttrs: { 'data-theme': appearance },
    meta: computed(() => themeColorMetas(appearance.value)),
  })
})
