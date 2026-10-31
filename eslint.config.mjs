import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'
import withNuxt from './.nuxt/eslint.config.mjs'

// One home per concern (CODING_STANDARDS.md): a second copy of these is an error, not a review comment.
const shownNameCopy = {
  selector: 'LogicalExpression[operator="??"][left.property.name="displayName"]',
  message: 'Use shownName() from shared/auth.ts.',
}
// Request bodies and queries are `unknown` until a parser has checked them.
const recordCast = {
  selector: 'TSAsExpression > TSTypeReference[typeName.name="Record"] > TSTypeParameterInstantiation > TSUnknownKeyword',
  message: 'Use asRecord() or isRecord() from shared/record.ts instead of a cast.',
}

export default withNuxt(
  {
    // Design handoff and its prototype scripts are reference material, not app code. The realtime Worker runs in
    // workerd with its own globals and its own typecheck and tests (realtime/package.json).
    ignores: ['docs/**', 'realtime/**'],
  },
  {
    // ADR 0005: no Vercel-only runtime APIs, so the app can move off Vercel cheaply.
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@vercel/*'], message: 'Vercel-only runtime APIs are not allowed (ADR 0005).' }],
      }],
    },
  },
  {
    // The one exception ADR 0005 amends (#202): waitUntil keeps the room publish alive on Vercel, in one file.
    files: ['server/utils/after-response.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@vercel/*', '!@vercel/functions'], message: 'Vercel-only runtime APIs are not allowed (ADR 0005); only @vercel/functions in server/utils/after-response.ts (#202).' }],
      }],
    },
  },
  {
    files: ['app/**', 'server/**', 'shared/**'],
    ignores: ['shared/auth.ts'],
    rules: {
      'no-restricted-syntax': ['error', shownNameCopy],
      'vue/no-restricted-syntax': ['error', shownNameCopy],
    },
  },
  {
    files: ['server/**', 'shared/**'],
    ignores: ['shared/auth.ts', 'shared/record.ts'],
    rules: { 'no-restricted-syntax': ['error', shownNameCopy, recordCast] },
  },
  {
    // An Event changes through changeEvent: it owns the transaction, the locked load and the step after the commit (#183).
    // A later block with the same rule replaces the one above for these files, so the selectors above are repeated.
    files: ['server/api/e/**'],
    rules: {
      'no-restricted-syntax': ['error', shownNameCopy, recordCast, {
        selector: 'CallExpression[callee.property.name="transaction"]',
        message: 'Change an Event through changeEvent() in server/utils/event-access.ts (#183).',
      }],
    },
  },
  // Accessibility of the Vue templates (a spinbutton that could not take focus reached the 1.3 review).
  ...pluginVueA11y.configs['flat/recommended'],
  {
    // A label names its control by nesting it or by `for`; either is enough.
    rules: { 'vuejs-accessibility/label-has-for': ['error', { required: { some: ['nesting', 'id'] } }] },
  },
  {
    // The mascot keeps its one-word name from the design handoff.
    files: ['app/components/Compibert.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
)
