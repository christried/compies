import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint', '@nuxtjs/color-mode', '@nuxtjs/i18n', '@nuxt/fonts',
    // Its client plugin imports a virtual module the Nuxt test environment cannot load;
    // test/build/pwa.test.ts checks the PWA against the production build instead.
    ...(process.env.VITEST ? [] : ['@vite-pwa/nuxt']),
  ],
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      title: 'Compies',
      // The manifest link comes from <NuxtPwaManifest /> in app.vue.
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/icons/favicon-16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'theme-color', content: '#fff3df', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#17121d', media: '(prefers-color-scheme: dark)' },
        { name: 'apple-mobile-web-app-title', content: 'Compies' },
      ],
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

  // Installable shell + offline fallback only: no push, and the service worker never caches API responses.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Compies',
      short_name: 'Compies',
      description: 'Spieleabende mit Glücksrad, Vetos und Siegerehrung.',
      lang: 'de',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#fff3df',
      background_color: '#fff3df',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/monochrome.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'monochrome' },
      ],
    },
    workbox: {
      // Pages are server-rendered per request, so there is no app shell to fall back to.
      navigateFallback: null,
      globPatterns: ['offline.html', 'icons/favicon.svg'],
      // The module adds Nuxt's build manifest; a cached copy would hide new deployments.
      globIgnores: ['_nuxt/builds/**'],
      // Keep URLs as they are: the module's default transform turns `offline.html` into `offline`
      // (meant for prerendered pages), which the server would answer with the SSR catch-all page.
      manifestTransforms: [async entries => ({ manifest: entries })],
      runtimeCaching: [{
        // Navigations always go to the network; only a failed one gets the precached offline page.
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkOnly',
        options: { precacheFallback: { fallbackURL: '/offline.html' } },
      }],
    },
  },
})
