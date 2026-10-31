import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      // Pure domain rules. App utils import shared code through Nuxt's `~~` alias, so it is set here too.
      {
        resolve: { alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) } },
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
      },
      // HTTP handlers against PGlite with the committed migrations applied. The PGlite load in `beforeAll` can pass the
      // default 10 s when several test runs share a machine, hence the longer hook timeout.
      { test: { name: 'integration', include: ['test/integration/**/*.test.ts'], environment: 'node', hookTimeout: 30_000 } },
      // Components and pages inside a Nuxt runtime.
      await defineVitestProject({
        test: { name: 'nuxt', include: ['test/nuxt/**/*.test.ts'], environment: 'nuxt' },
      }),
    ],
  },
})
