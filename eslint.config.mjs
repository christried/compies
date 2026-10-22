import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // Design handoff and its prototype scripts are reference material, not app code.
  ignores: ['docs/**'],
})
