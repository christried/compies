# COMPIES stack research: Nuxt 4, Tailwind v4, color mode, i18n, PWA, fonts, testing, icons

Research date: 2026-10-22. Versions below were read from the npm registry (`registry.npmjs.org/<pkg>/latest` and dist-tags) on that date. Each claim cites a primary source (official docs, module repo, npm metadata, Postgres docs). Anything not confirmed from a primary source is marked **UNVERIFIED**.

Method caveat: pages were read through a summarising fetcher, so quoted wording is close to, not byte-identical with, the page. Several pages returned errors and could not be read: `fonts.nuxt.com/get-started/setup` and `fonts.nuxt.com/get-started/web-fonts` (HTTP 500), `i18n.nuxtjs.org/docs/guide/routing-strategies` and `i18n.nuxtjs.org/docs/setup` (HTTP 404), `lucide.dev/guide/packages/lucide-vue-next` (HTTP 404), `drizzle` `vitest-with-database` guide (HTTP 404).

---

## TL;DR

Recommended stack (all versions are npm `latest` on 2026-10-22):

| Concern | Use | Version | Verdict |
|---|---|---|---|
| Nuxt | `nuxt` | 4.6.2 | Current. Node `^22.22.3 \|\| ^24.15.0 \|\| >=26` per npm engines. |
| Tailwind | `tailwindcss` + `@tailwindcss/vite` | 4.3.3 + 4.3.3 | Use the Vite plugin, wired in `nuxt.config`. Not the Nuxt module. |
| Tailwind Nuxt module | `@nuxtjs/tailwindcss` | 6.14.0 (stable) | **Do not use.** Stable pins `tailwindcss ~3.4.17`. The v4 line is beta only. |
| Color mode | `@nuxtjs/color-mode` | 4.0.1 | Use with `dataValue: 'theme'`, `classSuffix: ''`. Depends on `@nuxt/kit ^4.6.2`. |
| i18n | `@nuxtjs/i18n` | 10.6.0 (pulls `vue-i18n` ^11.4.8) | Use. Locale file goes in `i18n/locales/de.json`. `lazy` option was removed in v10. |
| PWA (first try) | `@vite-pwa/nuxt` | 1.1.1 | Use only after a Nuxt 4 smoke test. Its docs and deps still say Nuxt 3. |
| PWA (fallback) | `@serwist/nuxt` | 9.5.13 | Alternative if `@vite-pwa/nuxt` fails on Nuxt 4. Depends on `@nuxt/kit 4.5.2`. |
| Fonts | `@nuxt/fonts` (+ optional `@fontsource/*`) | 1.0.1 (fontsource 5.3.0) | Self-host at build time. No runtime requests to Google. |
| Icons | `@lucide/vue` | 1.61.0 | **Use this.** `lucide-vue-next` 1.0.0 is npm-deprecated: "Please use @lucide/vue instead." |
| Unit/integration runner | `vitest` + `@nuxt/test-utils` | 5.0.5 + 4.3.4 | Use Nuxt docs' `projects` config (`defineVitestProject` for the nuxt environment). |
| DB in tests | `@electric-sql/pglite` + `drizzle-orm` + `drizzle-kit` | 0.5.11 + 0.45.4 + 0.31.11 | Stable line. Drizzle's PGlite docs currently show `@rc` (1.0.0-rc.5). Decide which line to pin. |

Concrete config sketch (not run; derived from the cited docs):

```ts
// nuxt.config.ts
import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  compatibilityDate: '<init date>',            // UNVERIFIED value; set to the date you init the project
  modules: ['@nuxtjs/color-mode', '@nuxtjs/i18n', '@nuxt/fonts'],
  css: ['~/assets/css/main.css'],              // Nuxt 4 srcDir is app/, so this is app/assets/css/main.css
  vite: { plugins: [tailwindcss()] },
  colorMode: { dataValue: 'theme', classSuffix: '', preference: 'system', fallback: 'light', storage: 'cookie' },
  i18n: {
    defaultLocale: 'de',
    strategy: 'no_prefix',
    locales: [{ code: 'de', language: 'de-DE', file: 'de.json' }],   // resolved to i18n/locales/de.json
  },
})
```

```css
/* app/assets/css/main.css */
@import "tailwindcss";            /* the theme file already imports tailwindcss; keep this as the single entry */
@import "./compies-theme.css";    /* compies-theme.css imports ./compies-tokens.css */
```

Drop-in verdict on the handoff tokens (`docs/design_handoff_compies/tokens/`): the two files **do drop in** with the documented Tailwind v4 patterns. I checked that every `var(--cp-*)` referenced by `compies-theme.css` is defined in `compies-tokens.css` (0 missing). Issues to fix, detailed in section 2:

1. The handoff docs (`01-tokens.md:69`) and `DS Handoff.dc.html` name a `border-memphis` utility. The theme does not generate it. It only defines `@utility outline-memphis` and an unused `--border-width-memphis` variable, which is not a Tailwind v4 theme namespace.
2. `i18n/de.json` must move to `i18n/locales/de.json` for `@nuxtjs/i18n` to find it.
3. CSS must live in `app/assets/css/` on Nuxt 4, not `assets/css/`.

Open risk: `@nuxtjs/color-mode` injects an inline no-flash script into `<head>`, but the module source shows no server-side cookie read. The tokens comment "Persist in a cookie so SSR renders the right theme" is therefore not supported by the module code. Verify with `curl` on the built HTML (UNVERIFIED).

---

## 1. Nuxt 4 + Tailwind CSS v4: which integration

**Verdict: use `tailwindcss` + `@tailwindcss/vite` in `nuxt.config`. Do not use `@nuxtjs/tailwindcss`.**

Official Tailwind Nuxt guide (page is for Tailwind v4.3, Nuxt 4.x docs):
- Install: `npm install tailwindcss @tailwindcss/vite`
- `nuxt.config.ts`: `import tailwindcss from "@tailwindcss/vite"` with `vite: { plugins: [tailwindcss()] }` and `css: ['~/assets/css/main.css']`
- CSS file at `./app/assets/css/main.css` with `@import "tailwindcss";`
- Sources: https://tailwindcss.com/docs/installation/framework-guides/nuxt , https://tailwindcss.com/docs/installation/using-vite (same install and `@import "tailwindcss";`, Vite config shown)
- Registry: `tailwindcss` latest 4.3.3, `@tailwindcss/vite` latest 4.3.3 (https://registry.npmjs.org/tailwindcss/latest , https://registry.npmjs.org/@tailwindcss/vite/latest). `@tailwindcss/vite` peer: `vite ^5.2.0 || ^6 || ^7 || ^8`.

`@nuxtjs/tailwindcss` status:
- npm `latest` = 6.14.0, and it depends on `tailwindcss ~3.4.17` (https://registry.npmjs.org/@nuxtjs/tailwindcss/latest). Dist-tags: `latest` 6.14.0, `prerelease` 5.0.0-0, `alpha` 4.0.0-12, `nightly` 6.14.1-… (https://registry.npmjs.org/-/package/@nuxtjs/tailwindcss/dist-tags). No v7 on npm dist-tags.
- GitHub releases: v6.14.0 notes say "Add initial tw4 support in v6". v7.0.0-beta.0 notes say "Update to Tailwind CSS v4" (https://github.com/nuxt-modules/tailwindcss/releases).
- Repo `main` package.json: version 7.0.0-beta.1, `tailwindcss ^4.1.12` (https://raw.githubusercontent.com/nuxt-modules/tailwindcss/main/package.json).
- The module page does not state a Tailwind version (https://nuxt.com/modules/tailwindcss).

Conclusion: the module's only stable release targets Tailwind v3. v4 exists only in a beta line. Using the official Vite plugin avoids the module entirely.

Other details:
- Nuxt 4 layout: `app/` is the srcDir, and `public/`, `layers/`, `modules/` resolve against the project root (https://nuxt.com/docs/4.x/getting-started/upgrade).
- Nuxt 4 install: `npm create nuxt@latest <name>`; Node 22.x or newer, LTS recommended (https://nuxt.com/docs/4.x/getting-started/installation).

---

## 2. Tailwind v4 `@theme` with CSS variables, light/dark

**`@theme inline` vs `@theme`** (https://tailwindcss.com/docs/theme):
- "When defining theme variables that reference other variables, use the `inline` option." With `inline`, the utility inlines the value, e.g. `font-family: var(--font-inter)`.
- "Without using `inline`, your utility classes might resolve to unexpected values because of how variables are resolved in CSS." Plain `@theme` is for literal values.
- Theme variables are emitted as CSS variables on `:root`, but only used ones by default. `@theme static` emits all.

**Namespace reset:** `--color-*: initial;` is documented. "all of the default utilities that use that namespace ... will be removed" (https://tailwindcss.com/docs/theme). The page does not show `--breakpoint-*: initial` explicitly, but the same rule covers any namespace (UNVERIFIED for that exact case, low risk).

**Dark mode via a custom variant** (https://tailwindcss.com/docs/dark-mode). Documented exact forms:
- Class-based: `@import "tailwindcss";@custom-variant dark (&:where(.dark, .dark *));`
- Data-attribute: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` ("dark mode utilities will be applied whenever the `data-theme` attribute is set to `dark` somewhere up the tree.")
- The page leaves toggling mechanics to you. Our tokens use the data-attribute form, which is one of the two documented forms.

**Keyframes in `@theme`** are documented: `@theme { --animate-wiggle: wiggle 1s ease-in-out infinite; @keyframes wiggle { ... } }` (https://tailwindcss.com/docs/animation).

**Checking the handoff tokens** (`tokens/compies-theme.css`, `tokens/compies-tokens.css`):
- Structure matches the documented pattern: `@import "tailwindcss"` first, then the tokens, then `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`. Mode-dependent values (`--color-*`, `--shadow-*`) are in `@theme inline`, mode-independent values are in plain `@theme`. Correct per the docs.
- Mode switching: `:root, [data-theme="light"]` and `[data-theme="dark"]` in the token file. This needs `<html data-theme>`, i.e. `colorMode.dataValue: 'theme'` (section 3).
- All `var(--cp-*)` references in the theme resolve to defined tokens (checked by script, 0 missing).
- Dark-overridden tokens that are also referenced from plain `@theme` (non-inline): only `--cp-bw` and `--cp-bw-thin`. Both are consumed only through `--border-width-*`, which is not a documented v4 namespace (namespace list in https://tailwindcss.com/docs/theme: `--color`, `--font`, `--text`, `--font-weight`, `--tracking`, `--leading`, `--tab-size`, `--breakpoint`, `--container`, `--spacing`, `--radius`, `--shadow`, `--inset-shadow`, `--drop-shadow`, `--blur`, `--perspective`, `--zoom`, `--aspect`, `--ease`, `--animate`). So these are plain custom properties that no utility consumes. The working utility is `outline-memphis` (`border: var(--cp-bw) solid var(--cp-line)`), which resolves on the element, so it does flip in dark mode.

Issues to fix before dropping in:
1. **`border-memphis` does not exist as a class.** `01-tokens.md:69` says "Borders: `border-memphis` 3 px light / 2.5 px dark, thin 2 px," and `DS Handoff.dc.html` lists `border-memphis` as an added utility. The theme only defines `@utility outline-memphis`. Either rename the docs and components to `outline-memphis`, or add `@utility border-memphis { border: var(--cp-bw) solid var(--cp-line); }` (derived; not built).
2. `--border-width-memphis` and `--border-width-thin` are dead variables. Remove them or move them into `@utility` bodies.
3. `@utility` syntax (`@utility layer-* { z-index: --value(--layer-*) }`) was not checked against the docs page. It is the standard v4 pattern. **UNVERIFIED** from a fetched page.
4. Keep the CSS entry order: `@import "tailwindcss"` must come before the custom variants (matches the docs examples).

---

## 3. `@nuxtjs/color-mode` with Tailwind v4

Package: `@nuxtjs/color-mode` 4.0.1 (https://registry.npmjs.org/@nuxtjs/color-mode/latest). Dependencies: `@nuxt/kit ^4.6.2`, `defu`, `exsolve`, `pathe`, `pkg-types`, `verkit` (https://raw.githubusercontent.com/nuxt-modules/color-mode/main/package.json). README: "v4 of `@nuxtjs/color-mode` is compatible with Nuxt 3+" (https://github.com/nuxt-modules/color-mode). Nuxt 4 compatibility is inferred from the `@nuxt/kit ^4` dependency, **not** a stated Nuxt 4 test.

Defaults, read from `src/module.ts` (https://raw.githubusercontent.com/nuxt-modules/color-mode/main/src/module.ts):
- `preference: "system"`, `fallback: "light"`, `classPrefix: ""`, `classSuffix: ""`, `dataValue: ""`, `storageKey: "nuxt-color-mode"`, `storage: "localStorage"`, `disableTransition: false`.
- Documented options: `dataValue` "Optional dataset attribute to add to `<html>`", example `dataValue: 'theme'` produces `data-theme="dark"` (https://color-mode.nuxtjs.org/usage/configuration). `storage` accepts `localStorage`, `sessionStorage`, `cookie`. `cookieAttrs` defaults to `{ maxAge: 31536000, path: '/' }`.

Config for our tokens:
- `colorMode: { dataValue: 'theme', classSuffix: '', preference: 'system', fallback: 'light', storage: 'cookie' }`. The config key is `colorMode`, per `runtimeConfig.public.colorMode` in the module source.
- `classSuffix: ''` is already the default. Setting it is harmless.
- The `[class~="dark"]` Tailwind selector logic in the module only runs in its `tailwindcss:config` hook (`@nuxtjs/tailwindcss` path), so it has no effect with `@tailwindcss/vite`. Derived from reading the source; UNVERIFIED at runtime.

No-flash / SSR behaviour:
- The module injects an inline script into `<head>` (via a Vite `transformIndexHtml` hook, or a Nitro plugin when the Nitro builder is used). This runs before paint, so the client-side flash is avoided (module source).
- The visible module code does not read the cookie on the server or set any `<html>` attribute during SSR. So the server HTML probably ships without `data-theme`, and the inline script sets it on the client. **UNVERIFIED:** check with `curl` on a built page.
- Therefore the claim in `tokens/compies-tokens.css` header and `01-tokens.md:12` ("Persist in a cookie so SSR renders the right theme") is not supported by the module. If the server must render the right theme, add a server read of the cookie and set `htmlAttrs: { 'data-theme': … }` with `useHead` (design option, UNVERIFIED).
- `disableTransition` exists and is documented (https://color-mode.nuxtjs.org/usage/configuration).

---

## 4. `@nuxtjs/i18n` on Nuxt 4

**Current version:** `@nuxtjs/i18n` 10.6.0, with `vue-i18n ^11.4.8`, `@nuxt/kit ^4.5.1`, and `vue-router ^5.2.0` as dependencies (https://registry.npmjs.org/@nuxtjs/i18n/latest , https://registry.npmjs.org/@nuxtjs/i18n/10.6.0). Engines: `node >=20.11.1`. Release notes for v10.x mention "Improved Nuxt 4 Support" and "Upgraded to vue-i18n v11" (https://github.com/nuxt-modules/i18n/releases/tag/v10.0.0). Nuxt 4 compatibility is inferred from the kit dependency and that note. The docs do not name a Nuxt version.

Setup (https://i18n.nuxtjs.org/docs/getting-started):
- `npx nuxi@latest module add @nuxtjs/i18n`
- Module options go under `i18n` in `nuxt.config`. Snippet in the README: `locales: [{ code: 'en', language: 'en-US' }], defaultLocale: 'en'` (https://github.com/nuxt-modules/i18n).

Our config:
```ts
i18n: {
  defaultLocale: 'de',
  strategy: 'no_prefix',
  locales: [{ code: 'de', language: 'de-DE', file: 'de.json' }],
}
```

Locale directory:
- `restructureDir` default `'i18n'`, `langDir` default `locales`. "The path is resolved relative to the project `restructureDir` at the root of a project" (https://i18n.nuxtjs.org/docs/api/options). So files go in `<project root>/i18n/locales/de.json`. Because this is the project root, not `app/`, it is a placement inference. **UNVERIFIED** whether `restructureDir` is under `app/` on Nuxt 4.
- `file` key: "Will be resolved relative to `langDir` path" (same page). The lazy-loading guide's example layout is `i18n/locales/en-US.json` (https://i18n.nuxtjs.org/docs/guide/lazy-load-translations).
- Handoff file `docs/design_handoff_compies/i18n/de.json` must be copied to `i18n/locales/de.json`.

Strategy:
- Default `'prefix_except_default'`. `'no_prefix'`: "routes won't have a locale prefix" (https://i18n.nuxtjs.org/docs/api/options).

Lazy loading:
- The `lazy` option is removed in v10. "Lazy loading of locale messages is now enabled for all locale files" (https://i18n.nuxtjs.org/docs/guide/migrating). Do not set `lazy`. With one locale, the effect is negligible (derived).

Breaking changes v9 → v10 relevant to us (https://i18n.nuxtjs.org/docs/guide/migrating):
- `lazy`, `bundle.optimizeTranslationDirective`, `experimental.generatedLocaleFilePathFormat` removed.
- `experimental.hmr` → `hmr`, `experimental.autoImportTranslationFunctions` → `autoDeclare`. `restructureDir` can no longer be disabled.
- `onLanguageSwitched()` / `onBeforeLanguageSwitch()` removed → `i18n:localeSwitched` / `i18n:beforeLocaleSwitch` hooks. `$resolveRoute()` and `$localeLocation()` removed → `$localeRoute()`.
- Runtime options such as `strategy` and `lazy` became compile-time constants.
- `strategy: 'prefix'` with `redirectOn: 'root'` no longer redirects other paths.
- vue-i18n 11: Legacy API mode deprecated; `tc()` / `$tc()` removed from Legacy API mode.

Pluralization in our `de.json` (the file uses `|`):
- Example: `"slotsFree": "{n} Platz frei | {n} Plätze frei"`, plus `"point": "Punkt | Punkte"`.
- vue-i18n supports pipe plurals and predefined named args `{n}` and `{count}` (https://vue-i18n.intlify.dev/guide/essentials/pluralization). Call as `t('slotsFree', n)`.
- German 0 handling: the docs example shows `0` mapping to the first form only for a 3-form message. For a 2-form message the default choice rule for 0 is **UNVERIFIED**. Check `t('slotsFree', 0)` in a unit test; it may need a third form.
- The file parses as valid JSON (checked locally) and has no `@` or stray `|` outside plural strings that vue-i18n would interpret as linked messages.

---

## 5. PWA: `@vite-pwa/nuxt`, manifest, icons, offline page

**`@vite-pwa/nuxt` status**
- npm `latest` 1.1.1 (description "Zero-config PWA for Nuxt 3"). Dependencies: `@nuxt/kit ^3.9.0`, `vite-plugin-pwa ^1.2.0` (https://registry.npmjs.org/@vite-pwa/nuxt/latest).
- Docs: "The page is written for Nuxt 3" and it does not mention Nuxt 4 (https://vite-pwa-org.netlify.app/frameworks/nuxt). The README says "From v0.4.0, `@vite-pwa/nuxt` requires Vite 5 and Nuxt 3.9.0+" (https://github.com/vite-pwa/nuxt). The Nuxt modules listing says the same (https://nuxt.com/modules/pwa).
- Known issues:
  - #222 "Nuxt 4 friendly?" (open, Dec 2025). Users report it works on Nuxt 4, and one reports a failure fixed by upgrading. The only maintainer comment asks for a minimal repro. No maintainer statement on Nuxt 4 support (https://github.com/vite-pwa/nuxt/issues/222).
  - #228 "Production build fails to serve PWA assets ... on Nuxt 4 with node-server preset" (open, May 2026). Reporter on 0.9.0; maintainer asked them to try v1.1.1, which is the current version. No fix confirmed. Vercel is not mentioned (https://github.com/vite-pwa/nuxt/issues/228).
- `vite-plugin-pwa` latest is 2.0.0 (https://registry.npmjs.org/-/package/vite-plugin-pwa/dist-tags). Peer `vite ^3.1 … ^8.0.0`, deps `workbox-build ^7.4.1` (https://registry.npmjs.org/vite-plugin-pwa/2.0.0). `@vite-pwa/nuxt` 1.1.1 still pins the 1.x line (`^1.2.0`).
- Module docs say the module only works with Vite, and `$pwa` is `undefined` when PWA is disabled or the dev server runs without dev options (https://vite-pwa-org.netlify.app/frameworks/nuxt).

**Alternative: `@serwist/nuxt`** 9.5.13 (https://registry.npmjs.org/@serwist/nuxt/latest). Dependencies: `@nuxt/kit 4.5.2`, `@serwist/vite 9.5.13`, `@serwist/build 9.5.13`. Peer `vite >=5`. Install: `npm i -D @serwist/nuxt @serwist/vite serwist`, config `modules: ["@serwist/nuxt"], serwist: {}` (https://serwist.pages.dev/docs/nuxt/getting-started). Its docs do not state Nuxt versions and do not cover offline fallback pages.

**Offline fallback (Workbox)**
- `navigateFallback`: "all navigation requests for URLs that aren't precached will be fulfilled with the HTML at the URL provided. You must pass in the URL of an HTML document that is listed in your precache manifest." Default `null`. `navigateFallbackDenylist` takes regexes; the denylist wins over the allowlist (https://developer.chrome.com/docs/workbox/modules/workbox-build).
- Therefore the offline page must be precached. In practice: a static `public/offline.html` included via `globPatterns`, or a prerendered `/offline` route (https://vercel.com/docs/frameworks/full-stack/nuxt documents `routeRules: { '/offline': { prerender: true } }`). Whether `@vite-pwa/nuxt` picks up Nuxt-prerendered routes in its manifest: **UNVERIFIED**.
- Exclude `/api/**` from the fallback with `navigateFallbackDenylist` (Workbox doc above). Denylisted URLs show the browser offline error, so the app needs its own offline handling for them (https://vite-pwa-org.netlify.app/workbox/generate-sw).

**Manifest and icons:** the vite-pwa Nuxt page does not show manifest or icon config (it is a placeholder `pwa: {}`). Manifest and icon details: **UNVERIFIED** from a primary source. Use the standard Web App Manifest in `public/`, linked via `app.head`, and check against the Nuxt output.

**Vercel:** Nuxt is zero-config on Vercel; `nuxt build` is the default, SSR is default, and `routeRules.prerender` is supported (https://vercel.com/docs/frameworks/full-stack/nuxt). The docs say nothing PWA-specific. The only known deployment issue is #228, which concerns the node-server preset, not Vercel. **UNVERIFIED** whether the Vercel preset has the same asset path issue; test with a Vercel preview.

**Recommendation:** start with `@vite-pwa/nuxt@1.1.1`, run a Nuxt 4 smoke test (build, `nuxt preview`, and a Vercel preview) that checks `manifest.webmanifest`, icons, `sw.js`, and offline navigation. If it fails, use `@serwist/nuxt@9.5.13`. Push notifications later need a service worker either way.

---

## 6. Fonts: self-hosting Lilita One, Bungee, Bricolage Grotesque (and JetBrains Mono)

**`@nuxt/fonts`** 1.0.1 (https://registry.npmjs.org/@nuxt/fonts/latest). Dependencies include `@nuxt/kit ^4.6.1`, `unifont`, `fontless` (https://registry.npmjs.org/@nuxt/fonts/1.0.1). Its homepage describes it as a module that "locates the font, serves the files from your own site, and generates fallback metrics", and says it "downloads font files during the build" (https://fonts.nuxt.com/). Its homepage also says "served from your own origin, so production makes no third-party requests" (https://fonts.nuxt.com/). That is the GDPR-relevant property: fonts are fetched at build time, never at runtime.

Providers (https://fonts.nuxt.com/get-started/providers): `local` (scans `public/`), `google`, `googleicons`, `bunny`, `fontshare`, `fontsource`, `npm`, `adobe`. Setting a top-level `provider` disables all others. Custom providers exist.

Caveats for GDPR:
- Build-time fetching from Google happens only if the `google` provider is used. It does not touch the browser.
- Do not add any `<link>` to `fonts.googleapis.com` anywhere. Check that the CSP and `<head>` do not include one.
- `bunny` is a Google Fonts mirror that "focuses on privacy" (https://fonts.nuxt.com/get-started/providers). It is an option if the `fontsource` route is unavailable, but it is an extra third party. Not recommended here.

**Recommended approach:** Fontsource npm packages (self-contained, no build-time network, reproducible):
- `@fontsource/lilita-one` 5.3.0 (400)
- `@fontsource/bungee` 5.3.0 (400)
- `@fontsource-variable/bricolage-grotesque` 5.3.0 (variable, covers 400–800)
- `@fontsource/jetbrains-mono` 5.3.0 (500, 700)
Source: npm metadata, each description "Self-host ... in a neatly bundled NPM package" (https://registry.npmjs.org/@fontsource/lilita-one/latest and siblings). Weights per `01-tokens.md:14`.

Then either:
- import the Fontsource CSS in `main.css` (import path per Fontsource docs, **UNVERIFIED**, not fetched), or
- use `@nuxt/fonts` with the `npm` or `fontsource` provider, or `local` with files in `public/`. The exact config syntax could not be read (fonts.nuxt.com config pages returned HTTP 500), so **config syntax is UNVERIFIED**.

Choice for COMPIES: Fontsource packages plus `@nuxt/fonts` only if its auto-metrics are needed. Keep the build free of any Google network calls.

---

## 7. Testing: Vitest, Nuxt environment, PGlite + Drizzle

**Versions (npm latest)**
- `vitest` 5.0.5. Peers: `vite ^6.4.0 || ^7.0.0 || ^8.0.0`. Engines `node ^22.12.0 || ^24.0.0 || >=26.0.0` (https://registry.npmjs.org/vitest/latest).
- `@nuxt/test-utils` 4.3.4. Peers: `nuxt ^3.21.0 || ^4.0.0 || ^5.0.0-0`, `vitest ^4.0.2 || ^5.0.0`, `vue ^3.5.0`, `h3`, `jsdom >=27.4.0`, `happy-dom >=20.0.11`, `@vue/test-utils ^2.4.2` (optional extras) (https://registry.npmjs.org/@nuxt/test-utils/latest).
- Nuxt docs install command: `npm i --save-dev @nuxt/test-utils vitest @vue/test-utils happy-dom playwright-core` (https://nuxt.com/docs/4.x/getting-started/testing).

**Vitest projects (Nuxt docs, https://nuxt.com/docs/4.x/getting-started/testing):**
```ts
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/*.{test,spec}.ts'], environment: 'node' } },
      { test: { name: 'e2e', include: ['test/e2e/*.{test,spec}.ts'], environment: 'node' } },
      await defineVitestProject({
        test: { name: 'nuxt', include: ['test/nuxt/*.{test,spec}.ts'], environment: 'nuxt' },
      }),
    ],
  },
})
```
- "`defineVitestProject` is only for Nuxt-environment tests." Unit and e2e stay in `environment: 'node'`.
- Rename to `vitest.config.mts` if `package.json` lacks `"type": "module"`.
- Run: `npx vitest --project unit` / `--project nuxt`.
- Nuxt docs warn against `// @vitest-environment` comments because they skip Nuxt's Vite plugins.
- Vitest docs: "The `workspace` is deprecated since 3.2 and replaced with the `projects` configuration" (https://vitest.dev/guide/projects).

**PGlite + Drizzle**
- Install per Drizzle docs: `npm i drizzle-orm@rc @electric-sql/pglite` and `npm i -D drizzle-kit@rc`. Import `drizzle` from `drizzle-orm/pglite`. In-memory: `drizzle()`. From a client: `new PGlite()` then `drizzle({ client })` (https://orm.drizzle.team/docs/connect-pglite).
- Registry: `drizzle-orm` latest = 0.45.4, `rc` = 1.0.0-rc.5, `beta` = 1.0.0-beta.22 (https://registry.npmjs.org/-/package/drizzle-orm/dist-tags). `drizzle-kit` latest = 0.31.11 (https://registry.npmjs.org/drizzle-kit/latest). `@electric-sql/pglite` latest = 0.5.11, `next` = 0.3.0-next.1 (https://registry.npmjs.org/-/package/@electric-sql/pglite/dist-tags).
- Decision needed: the Drizzle PGlite docs install `@rc`. Stable 0.45.4 exports `./pglite/migrator` (verified in `exports` of the 0.45.4 package, https://registry.npmjs.org/drizzle-orm/0.45.4). Pick one line and pin it. Stable is the conservative choice; confirm the migrator API against the chosen version.

**Applying drizzle-kit migrations to PGlite**
- `drizzle-kit generate` writes SQL migrations to the `out` folder (default `./drizzle`). Each migration is a timestamped folder containing `migration.sql` and `snapshot.json` (https://orm.drizzle.team/docs/migrations).
- `migrate` signature in `drizzle-orm/pglite/migrator` source: `export async function migrate<TSchema>(db: PgliteDatabase<TSchema>, config: MigrationConfig)`. `MigrationConfig` is `{ migrationsFolder: string; migrationsTable?: string; migrationsSchema?: string }`. The function reads `config.migrationsFolder` (https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/drizzle-orm/src/pglite/migrator.ts , https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/drizzle-orm/src/migrator.ts).
- Usage (derived from those signatures; not run):
  ```ts
  import { PGlite } from '@electric-sql/pglite'
  import { drizzle } from 'drizzle-orm/pglite'
  import { migrate } from 'drizzle-orm/pglite/migrator'
  const client = new PGlite()
  const db = drizzle({ client })
  await migrate(db, { migrationsFolder: 'drizzle' })
  ```
  Run it from the repo root so the `drizzle/` folder resolves.
- Single-user caveat: the PGlite docs say "PGlite is single user/connection" and "operates strictly in a single-process mode" (https://raw.githubusercontent.com/electric-sql/pglite/main/packages/pglite/README.md).

**Per-test isolation strategy (recommendation, derived):**
- One in-memory `PGlite` per test file, created and migrated in `beforeAll`.
- Per test, either (a) `TRUNCATE` every app table with `RESTART IDENTITY CASCADE` in `beforeEach`, or (b) wrap the test in a transaction and roll back. Drizzle documents `tx.rollback()`: "This throws an exception that rollbacks the transaction" (https://orm.drizzle.team/docs/transactions). Nested transactions use savepoints (same page).
- Vitest runs each file in its own worker, so each file gets its own PGlite instance.
- The server handlers must receive the test DB. Inject it, or `vi.mock` the DB module. Design choice; UNVERIFIED in this repo.

**Known PGlite vs Neon differences** (see Neon note below):
- Neon supports Postgres 14, 15, 16, 17, 18 (https://neon.com/docs/reference/compatibility). The PGlite Postgres version is **UNVERIFIED**. Neither the PGlite docs nor the README state it (https://pglite.dev/docs/about , https://pglite.dev/ , the README). Verify with `SELECT version();` in a test.
- Concurrency: PGlite is single-connection, so row-lock contention, `FOR UPDATE SKIP LOCKED`, advisory-lock races, and deadlocks cannot be reproduced. Keep Neon-based checks for those.
- Session state: Neon loses prepared statements, advisory locks, temp tables, and `LISTEN/NOTIFY` when the compute suspends or restarts (https://neon.com/docs/reference/compatibility). PGlite does not model this, so tests will not catch these failures.
- Roles: Neon provides `neon_superuser` in place of superuser and forbids `CREATE TABLESPACE` (same page). Migrations that use these will fail on Neon but pass in PGlite.
- Extensions: PGlite bundles 33 contrib modules including `pgcrypto`, `uuid-ossp`, `citext`, `pg_trgm`. Others are separate packages: `@electric-sql/pglite-pgvector`, `pglite-postgis`, etc. (https://pglite.dev/extensions/). Neon supports "numerous" extensions but the page does not list them (https://neon.com/docs/reference/compatibility). Check any extension used against Neon's list before relying on it.
- `gen_random_uuid()`: available in core since Postgres 13 (https://www.postgresql.org/docs/13/release-13.html). Drizzle's `uuid().defaultRandom()` emits `DEFAULT gen_random_uuid()` (https://orm.drizzle.team/docs/column-types/pg). Works on both.
- `timestamptz`: Drizzle's `timestamp({ withTimezone: true })` returns "a string converted to a timezone set in your Postgres instance" (same Drizzle page). The session timezone can differ between PGlite and Neon. **UNVERIFIED** for each. Set the timezone explicitly and assert in UTC.
- Collation: Neon defaults to `C.UTF-8` (https://neon.com/docs/reference/compatibility). The PGlite default collation is **UNVERIFIED**. This matters for German `ORDER BY` with umlauts (ä, ö, ü, ß). Add an explicit ordering test.
- Locale/ICU: Neon offers predefined ICU locales. Not checked for PGlite.

---

## 8. Lucide icons

- `lucide-vue-next` 1.0.0 is **deprecated** on npm: "Package deprecated. Please use @lucide/vue instead." (https://registry.npmjs.org/lucide-vue-next/latest).
- `@lucide/vue` latest = 1.61.0, peer `vue >=3.0.1`, description "A Lucide icon library package for Vue applications" (https://registry.npmjs.org/@lucide/vue/latest). Install command in the package README: `npm install @lucide/vue` (https://raw.githubusercontent.com/lucide-icons/lucide/main/packages/vue/README.md).
- Note: the source file `packages/vue/package.json` on lucide `main` shows `version: 0.0.1`, which is older than the npm 1.61.0. Trust npm for installs.
- The Lucide site guide URLs returned HTTP 404 and no import-syntax example was read. Import style (`import { Heart } from '@lucide/vue'`) is **UNVERIFIED**. Confirm with the installed package's type declarations.
- Lucide is tree-shakable: "Only the icons you use are included in your final bundle" (https://lucide.dev/ feature list via the package guide page).

---

## Items still UNVERIFIED (summary)

1. `@nuxtjs/i18n` and `@nuxt/fonts` and `@nuxtjs/color-mode` have no stated Nuxt 4 test; compatibility is inferred from `@nuxt/kit ^4` dependencies. Confirm with a smoke build.
2. `restructureDir` location on Nuxt 4 (`i18n/` at root vs `app/i18n/`).
3. `@vite-pwa/nuxt` on Nuxt 4: no maintainer confirmation (issues #222, #228 open). Offline-page precache with Nuxt prerendered routes: not verified.
4. `@nuxtjs/color-mode` SSR output: whether the server HTML includes `data-theme` with `storage: 'cookie'`.
5. `de.json` plural `0` form for 2-form messages (vue-i18n default choice rule).
6. PGlite Postgres version, default collation, and default timezone (none stated in PGlite docs).
7. Fontsource CSS import path and `@nuxt/fonts` config syntax (fonts.nuxt.com config pages returned HTTP 500).
8. Lucide import syntax in `@lucide/vue` (lucide.dev guide returned HTTP 404).
9. `@utility` syntax in the handoff theme file (standard v4 pattern, not checked against a fetched docs page).
10. `--breakpoint-*: initial` as an explicit example (covered by the general namespace rule only).
11. Manifest and icon configuration for `@vite-pwa/nuxt`, which the module docs do not show.
12. Whether the `border-memphis` utility should be added or the docs renamed to `outline-memphis`: a design decision, not a verified bug in Tailwind.

## Sources (all visited 2026-10-22)

- Tailwind: https://tailwindcss.com/docs/installation/framework-guides/nuxt , https://tailwindcss.com/docs/installation/using-vite , https://tailwindcss.com/docs/theme , https://tailwindcss.com/docs/dark-mode , https://tailwindcss.com/docs/animation
- Nuxt modules: https://nuxt.com/modules/tailwindcss , https://github.com/nuxt-modules/tailwindcss , https://github.com/nuxt-modules/tailwindcss/releases , https://raw.githubusercontent.com/nuxt-modules/tailwindcss/main/package.json , https://nuxt.com/modules/color-mode , https://nuxt.com/modules/pwa
- Color mode: https://color-mode.nuxtjs.org/ , https://color-mode.nuxtjs.org/usage/configuration , https://github.com/nuxt-modules/color-mode , https://raw.githubusercontent.com/nuxt-modules/color-mode/main/src/module.ts , https://raw.githubusercontent.com/nuxt-modules/color-mode/main/package.json
- i18n: https://i18n.nuxtjs.org/docs/getting-started , https://i18n.nuxtjs.org/docs/api/options , https://i18n.nuxtjs.org/docs/guide/lazy-load-translations , https://i18n.nuxtjs.org/docs/guide/migrating , https://github.com/nuxt-modules/i18n , https://github.com/nuxt-modules/i18n/releases , https://github.com/nuxt-modules/i18n/releases/tag/v10.0.0 , https://vue-i18n.intlify.dev/guide/essentials/pluralization
- PWA: https://vite-pwa-org.netlify.app/frameworks/nuxt , https://github.com/vite-pwa/nuxt , https://github.com/vite-pwa/nuxt/issues/222 , https://github.com/vite-pwa/nuxt/issues/228 , https://serwist.pages.dev/docs/nuxt/getting-started , https://developer.chrome.com/docs/workbox/modules/workbox-build
- Fonts: https://fonts.nuxt.com/ , https://fonts.nuxt.com/get-started/providers , https://github.com/nuxt/fonts
- Nuxt: https://nuxt.com/docs/4.x/getting-started/installation , https://nuxt.com/docs/4.x/getting-started/upgrade , https://nuxt.com/docs/4.x/getting-started/testing , https://vercel.com/docs/frameworks/full-stack/nuxt
- Testing/DB: https://vitest.dev/guide/projects , https://orm.drizzle.team/docs/connect-pglite , https://orm.drizzle.team/docs/migrations , https://orm.drizzle.team/docs/column-types/pg , https://orm.drizzle.team/docs/transactions , https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/drizzle-orm/src/pglite/migrator.ts , https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/drizzle-orm/src/migrator.ts , https://pglite.dev/docs/ , https://pglite.dev/docs/orm-support , https://pglite.dev/extensions/ , https://raw.githubusercontent.com/electric-sql/pglite/main/packages/pglite/README.md , https://neon.com/docs/reference/compatibility , https://www.postgresql.org/docs/13/release-13.html
- Icons: https://registry.npmjs.org/lucide-vue-next/latest , https://registry.npmjs.org/@lucide/vue/latest , https://raw.githubusercontent.com/lucide-icons/lucide/main/packages/vue/README.md
- npm registry metadata for all version pins: `https://registry.npmjs.org/<pkg>/latest` and `https://registry.npmjs.org/-/package/<pkg>/dist-tags`.
