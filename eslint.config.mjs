import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // Design handoff and its prototype scripts are reference material, not app code.
    ignores: ['docs/**'],
  },
  {
    // ADR 0005: no Vercel-only runtime APIs, so the app can move off Vercel cheaply.
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@vercel/*'], message: 'Vercel-only runtime APIs are not allowed (ADR 0005).' }],
      }],
    },
  },
)
