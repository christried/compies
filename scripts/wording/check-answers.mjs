// Checks an answers file of the wording review (#628, spec #620 § The answers file). Run by hand with node:
//   node scripts/wording/check-answers.mjs [<answers file>] [--locale <path>]
// The file defaults to the newest wording_<date>.json in docs/reviews/, the locale to i18n/locales/de.json (both found from this
// file's place, not the working directory). Prints one line per finding and exits 1 when a replacement is refused or the file has a problem:
//   REFUSED <key> <code> <reason>   a replacement or alternative the app would break on (a lost placeholder or plural form, bad syntax)
//   CHANGED <key> was „…“ now „…“   the message (or `fixed:<id>`, a fixed text of the files) was reworded since the sweep: a finding, not a failure, and its replacement is not checked
//   WARN <key> <code>               a copy rule the user may overrule; never changes the exit code
//   PROBLEM <text>                  the file itself is wrong
// An alternative is named `<key> alternative <n>`. The last line counts what was answered, refused and changed.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { answersFileName, changedSince, newestAnswersName, parseAnswers } from './answers.mjs'
import { checkReplacement } from './check-replacement.mjs'
import { flattenMessages } from './messages.mjs'
import { fixedTexts } from './where.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const reviewsDir = `${root}docs/reviews/`

/** @param {string[]} args */
function parseArgs(args) {
  /** @type {string | null} */
  let file = null
  let locale = `${root}i18n/locales/de.json`
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '--locale') locale = args[++i] ?? locale
    else if (!arg.startsWith('--')) file = arg
  }
  return { file, locale }
}

/** @param {string} message */
function fail(message) {
  console.log(message)
  process.exit(1)
}

const { file: fileArg, locale: localePath } = parseArgs(process.argv.slice(2))

let file = fileArg
if (!file) {
  /** @type {string[]} */
  let names = []
  try {
    names = readdirSync(reviewsDir)
  }
  catch {
    // no docs/reviews folder: the same as no file in it
  }
  const newest = newestAnswersName(names)
  if (!newest) fail(`NO ANSWERS FILE: make docs/reviews/${answersFileName(new Date())} (the review page writes it), or name a file`)
  file = `${reviewsDir}${newest}`
}

/**
 * @param {string} path
 * @param {string} what
 */
function read(path, what) {
  try {
    return readFileSync(path, 'utf8')
  }
  catch {
    return fail(`NO ${what}: ${path}`)
  }
}

const { answers, problems } = parseAnswers(read(file, 'ANSWERS FILE'))
for (const problem of problems) console.log(`PROBLEM ${problem}`)
if (!answers) process.exit(1)

let messages
try {
  messages = flattenMessages(JSON.parse(read(localePath, 'LOCALE FILE')))
}
catch (error) {
  fail(`PROBLEM ${localePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
}
const today = new Map(messages.map(({ key, text }) => [key, text]))

let refused = 0
/**
 * @param {string} label
 * @param {string} message the message today
 * @param {string} candidate
 */
function check(label, message, candidate) {
  const result = checkReplacement(message, candidate)
  for (const { code, reason } of result.refusals) {
    console.log(`REFUSED ${label} ${code} ${reason}`)
    refused++
  }
  for (const { code } of result.warnings) console.log(`WARN ${label} ${code}`)
}

// A text that changed since the sweep is reported below and not checked: its placeholders and forms may differ now.
for (const [key, entry] of Object.entries(answers.texts)) {
  const now = today.get(key)
  if (now === undefined || now !== entry.text) continue
  if (entry.answer === 'ersetzt' && entry.replacement !== null) check(key, now, entry.replacement)
  entry.alternatives.forEach((alternative, i) => check(`${key} alternative ${i + 1}`, now, alternative))
}

// The fixed texts are read out of the real files, as the walk does (where.mjs, #629), so a reworded one is a CHANGED like a message (#620).
const fixedNow = fixedTexts({
  offline: read(`${root}public/offline.html`, 'FIXED TEXT FILE'),
  nuxtConfig: read(`${root}nuxt.config.ts`, 'FIXED TEXT FILE'),
  utilsChangelog: read(`${root}app/utils/changelog.ts`, 'FIXED TEXT FILE'),
  sharedChangelog: read(`${root}shared/changelog.ts`, 'FIXED TEXT FILE'),
})
const changed = changedSince(answers, messages, fixedNow)
for (const { id, swept, now } of changed) console.log(`CHANGED ${id} was „${swept}“ now ${now === null ? 'gone' : `„${now}“`}`)

const answered = [...Object.values(answers.texts), ...Object.values(answers.fixed)].filter(entry => entry.answer !== null).length
console.log(`answered ${answered}, refused ${refused}, changed ${changed.length}`)
process.exit(refused > 0 || problems.length > 0 ? 1 : 0)
