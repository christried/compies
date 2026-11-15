import { tagTranslation } from './key-tags'

// Puts the key tags on every translated text (#627). Registered by the `key-tags` module in nuxt.config.ts on the dev server only, and
// for SSR and client alike: both must tag the same text, or hydration compares different strings. `useI18n()` without options returns the
// global composer, which is `$i18n` here, so one handler covers every `t` in app/.
export default defineNuxtPlugin({
  name: 'compies-key-tags',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    nuxtApp.$i18n.setPostTranslationHandler(tagTranslation)
  },
})
