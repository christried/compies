import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      // Pure domain rules.
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' } },
      // HTTP handlers against PGlite with the committed migrations applied.
      { test: { name: 'integration', include: ['test/integration/**/*.test.ts'], environment: 'node' } },
      // Components and pages inside a Nuxt runtime.
      await defineVitestProject({
        test: { name: 'nuxt', include: ['test/nuxt/**/*.test.ts'], environment: 'nuxt' },
      }),
    ],
  },
})
