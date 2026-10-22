import { defineConfig } from 'vitest/config'

// Checks on the production build output; `pnpm test:build` runs `nuxt build` first.
export default defineConfig({
  test: { name: 'build', include: ['test/build/**/*.test.ts'], environment: 'node' },
})
