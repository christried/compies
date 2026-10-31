import tailwindcss from '@tailwindcss/vite'
import { addServerHandler, createResolver, defineNuxtModule } from 'nuxt/kit'
import { isStagingBuild, stageBranding } from './stage'

// Staging names itself and wears tinted icons (#178). Production and local builds keep the defaults.
const staging = isStagingBuild()
const brand = stageBranding(staging)

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint', '@nuxtjs/i18n', '@nuxt/fonts',
    // Its client plugin imports a virtual module the Nuxt test environment cannot load;
    // test/build/pwa.test.ts checks the PWA against the production build instead.
    ...(process.env.VITEST ? [] : ['@vite-pwa/nuxt']),
    // The sign-in without Discord or Twitch exists in the dev server only (server/dev/sign-in.ts);
    // test/build/dev-sign-in.test.ts checks that no production build carries it.
    defineNuxtModule({
      meta: { name: 'dev-sign-in' },
      setup(_options, nuxt) {
        if (!nuxt.options.dev) return
        addServerHandler({ route: '/api/dev/sign-in', method: 'get', handler: createResolver(import.meta.url).resolve('./server/dev/sign-in') })
      },
    }),
  ],
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      title: brand.name,
      // The manifest link comes from <NuxtPwaManifest /> in app.vue.
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: `${brand.iconDir}/favicon.svg` },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${brand.iconDir}/favicon-32.png` },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${brand.iconDir}/favicon-16.png` },
        { rel: 'apple-touch-icon', sizes: '180x180', href: `${brand.iconDir}/apple-touch-icon.png` },
      ],
      meta: [
        { name: 'theme-color', content: '#fff3df' },
        { name: 'apple-mobile-web-app-title', content: brand.appleTitle },
      ],
    },
  },
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      // Read by <StagingBadge /> (#178).
      staging,
      // The realtime Worker the Event page connects to (#156). Empty: no live connection, the page polls. Vercel sets
      // either REALTIME_URL (read here at build time) or NUXT_PUBLIC_REALTIME_URL (Nuxt reads it at runtime).
      realtimeUrl: process.env.REALTIME_URL ?? '',
    },
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
      name: brand.name,
      short_name: brand.shortName,
      description: 'Spieleabende mit Glücksrad, Vetos und Siegerehrung.',
      lang: 'de',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#fff3df',
      background_color: '#fff3df',
      icons: [
        { src: `${brand.iconDir}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${brand.iconDir}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${brand.iconDir}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/monochrome.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'monochrome' },
      ],
    },
    workbox: {
      // Pages are server-rendered per request, so there is no app shell to fall back to.
      navigateFallback: null,
      // The favicon the pages link, so an offline tab keeps the staging icon too.
      globPatterns: ['offline.html', `${brand.iconDir.slice(1)}/favicon.svg`],
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
