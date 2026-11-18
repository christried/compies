// The wording review's answers file (#628, spec #620 § The answers file): one JSON file per sweep under docs/reviews/, committed.
// Copy only: no field can hold what a recording's picture shows (a rendered text, an account, a User). Pure functions over its
// shape; reading and writing the file is the caller's. No dependency.

/** @typedef {'passt' | 'ersetzt' | 'alternativen'} Answer */
/**
 * The answer to one text. `answer` is null while only a comment exists; `replacement` is set exactly when `answer` is 'ersetzt'.
 * @typedef {{ text: string, answer: Answer | null, replacement: string | null, comment: string, alternatives: string[] }} TextAnswer
 */
/**
 * `texts` is by message key, `fixed` by fixed id (no `fixed:` prefix), `unused` by top-level group, `mono` by component path. A `mono`
 * entry with an empty comment means „seen, no remark“ (the step is answered by existing).
 * @typedef {{ version: 1, sweptAt: string, texts: Record<string, TextAnswer>, fixed: Record<string, TextAnswer>, unused: Record<string, 'loeschen' | 'behalten'>, mono: Record<string, { comment: string }> }} AnswersFile
 */
/** @typedef {{ id: string, swept: string, replacement: string | null, now: string | null }} Changed */

export const ANSWERS = ['passt', 'ersetzt', 'alternativen']
export const UNUSED_ANSWERS = ['loeschen', 'behalten']
const NAME = /^wording_\d{4}-\d{2}-\d{2}\.json$/
// The one home of the step-id prefixes (#620): a step's id is a message key, or one of these kinds' prefix and a name. Served to the
// review page with this file, so the page, the model, the server and the recording all say them the same way.
const STEP_PREFIX = { mono: 'mono:', fixed: 'fixed:', unused: 'unused:' }

/**
 * @param {'mono' | 'fixed' | 'unused'} kind
 * @param {string} name a component path, a fixed id or a top-level group
 * @returns {string} the step id
 */
export function stepId(kind, name) {
  return `${STEP_PREFIX[kind]}${name}`
}

/**
 * @param {string} id a step id
 * @param {'mono' | 'fixed' | 'unused'} kind
 */
export function isStepId(id, kind) {
  return id.startsWith(STEP_PREFIX[kind])
}

/**
 * The name of a step id of that kind (the id without its prefix).
 * @param {string} id
 * @param {'mono' | 'fixed' | 'unused'} kind
 */
export function stepName(id, kind) {
  return id.slice(STEP_PREFIX[kind].length)
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {string} sweptAt 'YYYY-MM-DD'
 * @returns {AnswersFile}
 */
export function emptyAnswers(sweptAt) {
  return { version: 1, sweptAt, texts: {}, fixed: {}, unused: {}, mono: {} }
}

/**
 * Sorted keys, plain code-point order, so the same answers always make the same bytes.
 * @template T
 * @param {Record<string, T>} record
 * @param {(value: T) => unknown} [shape]
 */
function sorted(record, shape = value => value) {
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, shape(/** @type {T} */ (record[key]))]))
}

/**
 * Keys sorted, two spaces, a trailing newline: every answer is a small diff.
 * @param {AnswersFile} answers
 * @returns {string}
 */
export function serializeAnswers(answers) {
  /** @param {TextAnswer} entry */
  const text = entry => ({ text: entry.text, answer: entry.answer, replacement: entry.replacement, comment: entry.comment, alternatives: [...entry.alternatives] })
  const file = {
    version: answers.version,
    sweptAt: answers.sweptAt,
    texts: sorted(answers.texts, text),
    fixed: sorted(answers.fixed, text),
    unused: sorted(answers.unused),
    mono: sorted(answers.mono, entry => ({ comment: entry.comment })),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * One entry of `texts` or `fixed`, or null with the problem named.
 * @param {string} where
 * @param {unknown} value
 * @param {string[]} problems
 * @returns {TextAnswer | null}
 */
function parseTextAnswer(where, value, problems) {
  if (!isRecord(value)) {
    problems.push(`${where}: kein Eintrag`)
    return null
  }
  const { text, answer, replacement, comment, alternatives } = value
  if (typeof text !== 'string') {
    problems.push(`${where}: text fehlt`)
    return null
  }
  if (answer !== null && answer !== undefined && !ANSWERS.includes(/** @type {string} */ (answer))) {
    problems.push(`${where}: unbekannte Antwort ${JSON.stringify(answer)}`)
    return null
  }
  if (replacement !== null && replacement !== undefined && typeof replacement !== 'string') {
    problems.push(`${where}: replacement ist kein Text`)
    return null
  }
  if (answer === 'ersetzt' && (typeof replacement !== 'string' || replacement.trim() === '')) {
    problems.push(`${where}: „ersetzt“ ohne replacement`)
    return null
  }
  if (answer !== 'ersetzt' && typeof replacement === 'string') {
    problems.push(`${where}: replacement ohne „ersetzt“`)
    return null
  }
  if (comment !== undefined && typeof comment !== 'string') {
    problems.push(`${where}: comment ist kein Text`)
    return null
  }
  if (alternatives !== undefined && !(Array.isArray(alternatives) && alternatives.every(item => typeof item === 'string'))) {
    problems.push(`${where}: alternatives ist keine Liste von Texten`)
    return null
  }
  return {
    text,
    answer: /** @type {Answer | null} */ (answer ?? null),
    replacement: typeof replacement === 'string' ? replacement : null,
    comment: typeof comment === 'string' ? comment : '',
    alternatives: Array.isArray(alternatives) ? [...alternatives] : [],
  }
}

/**
 * Never throws. A file that cannot be read at all (broken JSON, not an object, another version) gives `answers: null`; an entry
 * that is wrong is named and left out, so nothing invalid reaches the model. Unknown extra fields are dropped.
 * @param {string} text
 * @returns {{ answers: AnswersFile | null, problems: string[] }}
 */
export function parseAnswers(text) {
  /** @type {string[]} */
  const problems = []
  /** @type {unknown} */
  let value
  try {
    value = JSON.parse(text)
  }
  catch (error) {
    return { answers: null, problems: [`Kein gültiges JSON: ${error instanceof Error ? error.message : String(error)}`] }
  }
  if (!isRecord(value)) return { answers: null, problems: ['Die Datei enthält kein Objekt'] }
  if (value.version !== 1) return { answers: null, problems: [`Unbekannte version ${JSON.stringify(value.version)}, erwartet 1`] }

  const answers = emptyAnswers(typeof value.sweptAt === 'string' ? value.sweptAt : '')
  if (typeof value.sweptAt !== 'string') problems.push('sweptAt fehlt')

  for (const section of /** @type {const} */ (['texts', 'fixed'])) {
    const entries = value[section]
    if (entries === undefined) continue
    if (!isRecord(entries)) {
      problems.push(`${section}: kein Objekt`)
      continue
    }
    for (const [key, entry] of Object.entries(entries)) {
      const parsed = parseTextAnswer(`${section}.${key}`, entry, problems)
      if (parsed) answers[section][key] = parsed
    }
  }

  if (isRecord(value.unused)) {
    for (const [group, answer] of Object.entries(value.unused)) {
      if (UNUSED_ANSWERS.includes(/** @type {string} */ (answer))) answers.unused[group] = /** @type {'loeschen' | 'behalten'} */ (answer)
      else problems.push(`unused.${group}: unbekannte Antwort ${JSON.stringify(answer)}`)
    }
  }
  else if (value.unused !== undefined) problems.push('unused: kein Objekt')

  if (isRecord(value.mono)) {
    for (const [component, entry] of Object.entries(value.mono)) {
      if (isRecord(entry) && typeof entry.comment === 'string') answers.mono[component] = { comment: entry.comment }
      else problems.push(`mono.${component}: kein Eintrag mit comment`)
    }
  }
  else if (value.mono !== undefined) problems.push('mono: kein Objekt')

  return { answers, problems }
}

/**
 * A new file with the patch merged into the text's entry (created from the patch's `text` when there is none). `id` is a step's
 * id: a message key, or `fixed:<id>`. The replacement is dropped unless the answer is 'ersetzt'.
 * @param {AnswersFile} answers
 * @param {string} id
 * @param {Partial<TextAnswer>} patch
 * @returns {AnswersFile}
 */
export function answerText(answers, id, patch) {
  const fixed = isStepId(id, 'fixed')
  const section = fixed ? 'fixed' : 'texts'
  const key = fixed ? stepName(id, 'fixed') : id
  /** @type {TextAnswer} */
  const empty = { text: '', answer: null, replacement: null, comment: '', alternatives: [] }
  const merged = { ...empty, ...answers[section][key], ...patch }
  if (merged.answer !== 'ersetzt') merged.replacement = null
  return { ...answers, [section]: { ...answers[section], [key]: merged } }
}

/**
 * @param {AnswersFile} answers
 * @param {string} group top-level group
 * @param {'loeschen' | 'behalten'} answer
 * @returns {AnswersFile}
 */
export function answerUnused(answers, group, answer) {
  return { ...answers, unused: { ...answers.unused, [group]: answer } }
}

/**
 * @param {AnswersFile} answers
 * @param {string} component the repo path of the .vue file
 * @param {string} comment
 * @returns {AnswersFile}
 */
export function answerMono(answers, component, comment) {
  return { ...answers, mono: { ...answers.mono, [component]: { comment } } }
}

/**
 * Whether a text today (null: it is gone) is neither what was swept nor its replacement: someone reworded it since.
 * @param {{ text: string, replacement: string | null }} entry
 * @param {string | null} now
 */
export function isReworded(entry, now) {
  return now !== entry.text && (now === null || now !== entry.replacement)
}

/**
 * The `texts` and `fixed` entries whose text today is neither what was swept nor its replacement: someone reworded it since. A
 * key the locale (or a fixed text the files) no longer has has `now: null`. A fixed text's `id` is its step id, `fixed:<id>`.
 * @param {AnswersFile} answers
 * @param {{ key: string, text: string }[]} messagesNow
 * @param {{ id: string, text: string }[]} [fixedNow] `fixedTexts` of where.mjs, as the walk reads them from the real files
 * @returns {Changed[]}
 */
export function changedSince(answers, messagesNow, fixedNow = []) {
  const today = new Map(messagesNow.map(({ key, text }) => [key, text]))
  const fixedToday = new Map(fixedNow.map(({ id, text }) => [id, text]))
  /** @type {Changed[]} */
  const changed = []
  for (const [id, entry] of Object.entries(answers.texts)) {
    const now = today.get(id) ?? null
    if (isReworded(entry, now)) changed.push({ id, swept: entry.text, replacement: entry.replacement, now })
  }
  for (const [id, entry] of Object.entries(answers.fixed)) {
    const now = fixedToday.get(id) ?? null
    if (isReworded(entry, now)) changed.push({ id: stepId('fixed', id), swept: entry.text, replacement: entry.replacement, now })
  }
  return changed
}

/**
 * The answers of several sweeps as one baseline (#810): `files` oldest first (the caller sorts by name, as `newestAnswersName`
 * compares). `texts`, `fixed`, `unused` and `mono` merge per key, a later file's entry replacing an earlier one's entirely (an entry
 * that is only a comment still counts as held), `sweptAt` and `version` are the last file's. Throws on an empty list: the caller
 * passes `null` as the baseline then. Never mutates its input.
 * @param {AnswersFile[]} files
 * @returns {AnswersFile}
 */
export function mergeAnswers(files) {
  const last = files[files.length - 1]
  if (!last) throw new Error('mergeAnswers: no files to merge')
  /** @type {AnswersFile} */
  const merged = { version: last.version, sweptAt: last.sweptAt, texts: {}, fixed: {}, unused: {}, mono: {} }
  for (const file of files) {
    for (const [key, entry] of Object.entries(file.texts)) merged.texts[key] = { ...entry, alternatives: [...entry.alternatives] }
    for (const [key, entry] of Object.entries(file.fixed)) merged.fixed[key] = { ...entry, alternatives: [...entry.alternatives] }
    Object.assign(merged.unused, file.unused)
    for (const [key, entry] of Object.entries(file.mono)) merged.mono[key] = { ...entry }
  }
  return merged
}

/**
 * @param {string | Date} date 'YYYY-MM-DD', or a Date (its local day)
 */
export function answersFileName(date) {
  if (typeof date === 'string') return `wording_${date}.json`
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `wording_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

/**
 * The greatest answers file name by plain string comparison (the date sorts as text), leaving out the file being filled. The `.md`
 * reviews in the folder never match.
 * @param {string[]} names
 * @param {{ except?: string }} [options]
 * @returns {string | null}
 */
export function newestAnswersName(names, { except } = {}) {
  const matching = names.filter(name => NAME.test(name) && name !== except).sort()
  return matching.length === 0 ? null : (matching[matching.length - 1] ?? null)
}
