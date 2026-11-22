import { MOTION_REDUCED } from '~~/shared/motion'

// The page's Reduced motion (#680): `data-motion="reduced"` on <html> from the device's `compies-motion` cookie, signed in or out, so the
// tokens and the calm variants of every stylesheet rule have their twin of the device's own setting from the first paint (the server
// renders it in the first byte). Nothing ever sets `full`: it would override the device's setting for script alone. A plugin rather than
// app.vue, like appearance.ts, so it also holds where a page renders without the app around it (the Nuxt tests).
export default defineNuxtPlugin(() => {
  const reduced = useReducedMotion()
  useHead({ htmlAttrs: { 'data-motion': computed(() => reduced.value ? MOTION_REDUCED : undefined) } })
})
