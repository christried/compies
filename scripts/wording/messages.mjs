// What a locale message is made of, for the wording review (#628, spec #620): its key, its placeholders and its plural forms.
// Pure, no dependency. vue-i18n's syntax in short: `{name}` is a placeholder, `a | b` are plural forms, `{'@'}` is a literal
// (an escape for text that would otherwise be syntax), `@:key` is a link. Every rule below looks at a message without its literals.

const LITERAL = /\{\s*'[^']*'\s*\}/g
const PLACEHOLDER = /\{\s*(\w+)\s*\}/g

/**
 * The messages of a locale tree in file order, as `copy.test.ts` collects them: only strings are messages, a key is the
 * dotted path, and an array item's index is its path segment (`wheel.placeholders.0`).
 * @param {unknown} tree
 * @param {string[]} [path]
 * @returns {{ key: string, text: string }[]}
 */
export function flattenMessages(tree, path = []) {
  if (typeof tree === 'string') return [{ key: path.join('.'), text: tree }]
  if (tree && typeof tree === 'object') {
    return Object.entries(tree).flatMap(([segment, child]) => flattenMessages(child, [...path, segment]))
  }
  return []
}

/**
 * The text with each literal replaced by a plain letter: it can no longer be syntax, and a form that holds only a literal
 * is still not empty.
 * @param {string} text
 */
export function withoutLiterals(text) {
  return text.replace(LITERAL, 'x')
}

/**
 * The sorted set of placeholder names over the whole message, all forms together, without multiplicity.
 * @param {string} text
 * @returns {string[]}
 */
export function placeholdersOf(text) {
  const names = [...withoutLiterals(text).matchAll(PLACEHOLDER)].map(match => match[1] ?? '')
  return [...new Set(names)].sort()
}

/**
 * The `|`-separated parts: a message without `|` is one form. vue-i18n trims the parts, so spaces around `|` do not matter.
 * @param {string} text
 * @returns {string[]}
 */
export function formsListOf(text) {
  return withoutLiterals(text).split('|').map(form => form.trim())
}

/**
 * The number of forms.
 * @param {string} text
 */
export function formsOf(text) {
  return withoutLiterals(text).split('|').length
}

/**
 * Whether vue-i18n would reject the text: a brace left over once literals and placeholders are gone, or a bare `@`
 * (it starts a linked message; the file writes `{'@'}`).
 * @param {string} text
 */
export function hasBadSyntax(text) {
  const rest = withoutLiterals(text).replace(PLACEHOLDER, 'x')
  return /[{}@]/.test(rest)
}
