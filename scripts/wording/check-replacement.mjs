// Whether a typed replacement of a message is allowed (#628, spec #620 § The review page). A refusal is a replacement the app
// would break on (a lost placeholder or plural form, syntax vue-i18n rejects); a warning is a copy rule the user may overrule
// (docs/design_handoff_compies/06-copy.md, tone line and § Rules for developers). The reasons are German: the review page shows them.
import { formsListOf, formsOf, hasBadSyntax, placeholdersOf, withoutLiterals } from './messages.mjs'
import { RETIRED } from './retired-words.mjs'

/** @typedef {{ code: string, reason: string }} Issue */
/** @typedef {{ ok: boolean, refusals: Issue[], warnings: Issue[] }} Check */

// A capitalised formal address that does not start the text, a form or a sentence. A sentence-initial „Sie“ is the feminine „sie“ in
// every case the locale file has, and „Ihr seid“ is the informal plural, so only the middle of a sentence is flagged; „Ihnen“ is
// formal wherever it stands. The gap (a formal „Sie können …“ at a sentence start) is accepted.
const FORMAL = /(?<!\p{L})(Sie|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres|Ihnen)(?!\p{L})/gu
const STARTS_SENTENCE = /(^\s*|[.!?:|]\s+|\n\s*|„)$/

/** @param {string} text */
function formalAddress(text) {
  return [...text.matchAll(FORMAL)].some((match) => {
    if (match[1] === 'Ihnen') return true
    return !STARTS_SENTENCE.test(text.slice(0, match.index))
  })
}

/**
 * @param {string} message the message as `de.json` has it
 * @param {string} replacement
 * @returns {Check}
 */
export function checkReplacement(message, replacement) {
  const text = replacement.trim()
  /** @type {Issue[]} */
  const refusals = []
  /** @type {Issue[]} */
  const warnings = []

  if (text === '') {
    refusals.push({ code: 'empty', reason: 'Der Text ist leer' })
    return { ok: false, refusals, warnings }
  }

  const had = placeholdersOf(message)
  const has = placeholdersOf(text)
  for (const name of had.filter(name => !has.includes(name))) {
    refusals.push({ code: 'placeholder-dropped', reason: `{${name}} fehlt` })
  }
  for (const name of has.filter(name => !had.includes(name))) {
    refusals.push({ code: 'placeholder-added', reason: `{${name}} gibt es in der Nachricht nicht` })
  }

  const formsWas = formsOf(message)
  const formsNow = formsOf(text)
  if (formsNow !== formsWas) {
    refusals.push({ code: 'forms', reason: `${formsNow} ${formsNow === 1 ? 'Form' : 'Formen'} statt ${formsWas}` })
  }
  else if (formsNow > 1 && formsListOf(text).some(form => form === '')) {
    refusals.push({ code: 'empty-form', reason: 'Eine Form ist leer' })
  }
  if (hasBadSyntax(text)) {
    refusals.push({ code: 'syntax', reason: 'Eine Klammer oder ein @ passt nicht zur Syntax (ein @ schreibt die Datei als {\'@\'})' })
  }

  const plain = withoutLiterals(text)
  if (plain.includes('"')) warnings.push({ code: 'straight-quote', reason: 'Gerades Anführungszeichen " statt „ und “' })
  if (plain.includes('\'')) warnings.push({ code: 'straight-apostrophe', reason: 'Gerader Apostroph \' statt ’' })
  if (text.includes('·')) warnings.push({ code: 'middot', reason: 'Der Mittelpunkt · steht nicht im Text' })
  for (const [word, successor] of Object.entries(RETIRED)) {
    if (text.includes(word)) warnings.push({ code: 'retired', reason: `„${word}“ ist abgelöst, jetzt „${successor}“` })
  }
  if (/compibert/i.test(text)) warnings.push({ code: 'compibert', reason: 'Compibert wird im Text nie genannt' })
  if (text.includes('COMPIES')) warnings.push({ code: 'compies-caps', reason: 'Die App heißt „Compies“, nicht „COMPIES“' })
  if (formalAddress(text)) warnings.push({ code: 'formal-address', reason: 'Förmliche Anrede (Sie, Ihr …) statt „du“ und „ihr“' })

  return { ok: refusals.length === 0, refusals, warnings }
}
