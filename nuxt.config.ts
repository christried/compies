import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxtjs/color-mode', '@nuxtjs/i18n', '@nuxt/fonts'],
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      title: 'COMPIES',
    },
  },
  css: ['~/assets/css/main.css'],

  // The token file switches every colour on <html data-theme="light|dark">.
  colorMode: {
    dataValue: 'theme',
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    storage: 'cookie',
  },
  compatibilityDate: '2026-10-22',
  vite: { plugins: [tailwindcss()] },
  typescript: { strict: true },

  eslint: { config: { stylistic: true } },

  // Resolved from the installed Fontsource packages at build time, never from a CDN or Google (GDPR).
  fonts: {
    provider: 'npm',
    npm: { remote: false },
    defaults: { subsets: ['latin', 'latin-ext'] },
    families: [
      { name: 'Lilita One', weights: [400], global: true },
      { name: 'Bungee', weights: [400], global: true },
      {
        name: 'Bricolage Grotesque',
        weights: ['400 800'],
        global: true,
        // The variable package names its face 'Bricolage Grotesque Variable'; naming the file maps it back.
        providerOptions: { npm: { package: '@fontsource-variable/bricolage-grotesque', file: 'opsz.css' } },
      },
      { name: 'JetBrains Mono', weights: [500, 700], global: true },
    ],
  },

  i18n: {
    defaultLocale: 'de',
    strategy: 'no_prefix',
    locales: [{ code: 'de', language: 'de-DE', file: 'de.json' }],
  },
})
