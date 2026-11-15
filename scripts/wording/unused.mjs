// Lists every text of i18n/locales/de.json that no code of app/, server/ or shared/ refers to (#626, spec #620).
//
//   node scripts/wording/unused.mjs
//
// Reads the locale file and every .vue, .ts, .js and .mjs file under app/, server/ and shared/ (the scan itself is
// unused-scan.mjs). Prints the report per top-level group with a count per group, and always writes the same data to
// <tmpdir>/compies-browser/wording/unused.json ({ groups: [{ group, keys: [{ key, text }] }] }, the full text of each
// key), the file the review page reads. Reports, does not judge: the exit code is 0.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT } from '../browser/chrome.mjs'
import { dataOf, formatReport, messagesOf, scanUnused } from './unused-scan.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE_FOLDERS = ['app', 'server', 'shared']
const SOURCE_FILE = /\.(vue|ts|js|mjs)$/

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return SOURCE_FILE.test(entry.name) ? [path] : []
  })
}

const messages = messagesOf(JSON.parse(readFileSync(join(ROOT, 'i18n/locales/de.json'), 'utf8')))
const sources = SOURCE_FOLDERS.flatMap(folder => walk(join(ROOT, folder))).map(file => ({
  file,
  text: readFileSync(file, 'utf8'),
}))
const result = scanUnused(messages, sources)

console.log(formatReport(result, messages.length))

const folder = join(OUT, 'wording')
mkdirSync(folder, { recursive: true })
const out = join(folder, 'unused.json')
writeFileSync(out, JSON.stringify(dataOf(result), null, 2))
console.log(out)
