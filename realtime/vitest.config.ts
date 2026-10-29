import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// The tests run inside workerd with the real Worker and its Durable Object (#156).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          ALLOWED_ORIGINS: 'https://app.test',
          ROOM_TOKEN_SECRET: 'test-token-secret',
          ROOM_INTERNAL_SECRET: 'test-internal-secret',
          ROOM_TOKEN_SECRET_PREVIOUS: 'old-token-secret',
          ROOM_INTERNAL_SECRET_PREVIOUS: 'old-internal-secret',
        },
      },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
})
