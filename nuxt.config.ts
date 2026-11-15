import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { addServerHandler, createResolver, defineNuxtModule } from 'nuxt/kit'
import { carriesDevSignIn, carriesListeningPage, isStagingBuild, stageBranding } from './stage'

// Staging names itself and wears tinted icons (#178). Production and local builds keep the defaults.
const staging = isStagingBuild()
const brand = stageBranding(staging)

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint', '@nuxtjs/i18n', '@nuxt/fonts',
    // Its client plugin imports a virtual module the Nuxt test environment cannot load;
    // test/build/pwa.test.ts checks the PWA against the production build instead.
    ...(process.env.VITEST ? [] : ['@vite-pwa/nuxt']),
    // The sign-in without Discord or Twitch (server/dev/sign-in.ts), in the builds carriesDevSignIn names (stage.ts, #247);
    // test/build/dev-sign-in.test.ts checks that no production build carries it.
    defineNuxtModule({
      meta: { name: 'dev-sign-in' },
      setup(_options, nuxt) {
        if (!carriesDevSignIn(nuxt.options.dev)) return
        addServerHandler({ route: '/api/dev/sign-in', method: 'get', handler: createResolver(import.meta.url).resolve('./server/dev/sign-in') })
      },
    }),
    // The listening page for the cue sounds (#534, the session of #535): the page /dev/ton and the handler that serves the candidate files,
    // on the dev server only (carriesListeningPage, stage.ts). The page sits in app/dev/, a folder Nuxt does not scan, so nothing imports it
    // unless this module registers it and no production build bundles it; test/build/listening-page.test.ts checks the build output.
    defineNuxtModule({
      meta: { name: 'listening-page' },
      setup(_options, nuxt) {
        if (!carriesListeningPage(nuxt.options.dev)) return
        const { resolve } = createResolver(import.meta.url)
        nuxt.hook('pages:extend', (pages) => {
          pages.push({ name: 'dev-listening', path: '/dev/ton', file: resolve('./app/dev/listening-page.vue') })
        })
        addServerHandler({ route: '/_dev/cue-candidates/**', method: 'get', handler: resolve('./server/dev/cue-candidates') })
      },
    }),
    // GSAP loads through `loadGsap()` on the lead before a run only (ADR 0015). Vite's manifest marks the chunk of every dynamic import
    // `prefetch`, and vue-bundle-renderer then writes `<link rel="prefetch">` for it on every page that reaches the `import()`: the Event page
    // does (ceremony layer), so a finished Event fetched 70 kB of GSAP although no run plays. Only GSAP's chunk loses the flag; other
    // prefetches stay. test/build/gsap-lazy.test.ts checks the hints the build renders.
    defineNuxtModule({
      meta: { name: 'gsap-no-prefetch' },
      setup(_options, nuxt) {
        nuxt.hook('build:manifest', (manifest) => {
          for (const chunk of Object.values(manifest)) {
            if (chunk.src && /[\\/]node_modules[\\/]gsap[\\/]/.test(chunk.src)) chunk.prefetch = chunk.preload = false
          }
        })
      },
    }),
    // The Share image's PNG is made by resvg's WebAssembly (#313). Its binary ships with the server as storage `assets:resvg`, which
    // server/utils/share-assets.ts reads. It is copied out of node_modules into the build folder first: Nitro rewrites a path inside
    // node_modules to a package specifier, which the raw-asset loader cannot open (a Vercel-preset build failed on it).
    defineNuxtModule({
      meta: { name: 'resvg-wasm' },
      setup(_options, nuxt) {
        const dir = join(nuxt.options.buildDir, 'resvg')
        // After Nuxt has cleaned the build folder.
        nuxt.hook('build:before', () => {
          mkdirSync(dir, { recursive: true })
          copyFileSync(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm'), join(dir, 'index_bg.wasm'))
        })
        nuxt.options.nitro.serverAssets ||= []
        nuxt.options.nitro.serverAssets.push({ baseName: 'resvg', dir })
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
