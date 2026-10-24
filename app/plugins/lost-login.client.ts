// Nuxt's $fetch and useFetch call the global fetch at request time (ofetch's browser build), so wrapping it
// covers every API call the pages make (#66).
export default defineNuxtPlugin(() => {
  globalThis.fetch = signOutOn401(globalThis.fetch)
})
