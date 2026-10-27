// Every page sets only its own title; the app name follows it, or stands alone while a page has none (#75).
// A plugin rather than app.vue, so it also holds where a page renders without the app around it (the Nuxt tests).
export default defineNuxtPlugin((nuxtApp) => {
  const { t } = nuxtApp.$i18n
  useHead({
    titleTemplate: (title) => {
      const name = t('app.name')
      // A page without its own title shows the default (nuxt.config), which is the app name itself.
      return title && title !== name ? `${title} | ${name}` : name
    },
  })
})
