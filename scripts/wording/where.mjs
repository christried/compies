// Where a text lives that the walk cannot read off a tag (#629, spec #620 § The walk): the fixed table (texts that never pass `t`) with file and
// line, and the first place code names a message key. Pure functions over file text, so the walk reads the files and a unit test runs them on the
// real ones. Node cannot import the app's `.ts` (extensionless imports), so the texts are read out with patterns; wording-where.test.ts pins
// that the patterns find 4 + 1 + 12 + 5 entries in the real files.

/** @typedef {{ id: string, text: string, file: string, line: number | null }} FixedText */

const OFFLINE_FILE = 'public/offline.html'
const MANIFEST_FILE = 'nuxt.config.ts'
const MONTHS_FILE = 'app/utils/changelog.ts'
const GROUPS_FILE = 'shared/changelog.ts'

/** The 1-based line of the character at `index`. @param {string} text @param {number} index */
export const lineAt = (text, index) => text.slice(0, index).split('\n').length

/** @param {string} text */
const unescape = text => text.replace(/\\(.)/g, '$1')

/**
 * The string items of an array literal that follows `anchor` (`const MONTHS = [` …), with the line each is on.
 * @param {string} source
 * @param {RegExp} anchor
 * @returns {{ text: string, line: number }[]}
 */
function arrayItems(source, anchor) {
  const open = anchor.exec(source)
  if (!open) return []
  const start = open.index + open[0].length
  const end = source.indexOf(']', start)
  const body = source.slice(start, end)
  return [...body.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(item => ({ text: unescape(item[1] ?? ''), line: lineAt(source, start + (item.index ?? 0)) }))
}

/**
 * The fixed texts of the review (#628's `fixed` ids): `offline.title|heading|text|button`, `manifest.description`, `changelog.month.1` … `.12` and
 * `changelog.group.<name>`. An entry whose text a file does not hold is left out.
 * @param {{ offline: string, nuxtConfig: string, utilsChangelog: string, sharedChangelog: string }} files the contents of the four files
 * @returns {FixedText[]}
 */
export function fixedTexts({ offline, nuxtConfig, utilsChangelog, sharedChangelog }) {
  /** @type {FixedText[]} */
  const out = []
  const offlineParts = /** @type {const} */ ([
    ['offline.title', /<title>([^<]*)<\/title>/],
    ['offline.heading', /<h1>([^<]*)<\/h1>/],
    ['offline.text', /<p>([^<]*)<\/p>/],
    ['offline.button', /<button[^>]*>([^<]*)<\/button>/],
  ])
  for (const [id, pattern] of offlineParts) {
    const match = pattern.exec(offline)
    if (match) out.push({ id, text: (match[1] ?? '').trim(), file: OFFLINE_FILE, line: lineAt(offline, (match.index ?? 0) + match[0].indexOf(match[1] ?? '')) })
  }
  const manifest = /^\s*description:\s*'((?:[^'\\]|\\.)*)'/m.exec(nuxtConfig)
  if (manifest) out.push({ id: 'manifest.description', text: unescape(manifest[1] ?? ''), file: MANIFEST_FILE, line: lineAt(nuxtConfig, manifest.index + manifest[0].indexOf(manifest[1] ?? '')) })
  arrayItems(utilsChangelog, /const MONTHS\s*=\s*\[/).forEach((month, i) => out.push({ id: `changelog.month.${i + 1}`, text: month.text, file: MONTHS_FILE, line: month.line }))
  for (const group of arrayItems(sharedChangelog, /CHANGE_GROUPS\s*=\s*\[/)) out.push({ id: `changelog.group.${group.text}`, text: group.text, file: GROUPS_FILE, line: group.line })
  return out
}

/**
 * The pattern of a release date line holding the month: `7. Nov. 2026`.
 * @param {string} month
 */
export const MONTH_PATTERN = month => new RegExp(`^\\d{1,2}\\. ${month.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d{4}$`)

/**
 * Where code first names a key (best effort): the key itself, else its nearest named ancestor (a group, or the array an item belongs to, or the
 * server's `de.mvp.ics`), else a prefix that code builds (`team.colors.` of `team.colors.${at}`). Null when nothing names it.
 * @param {string} key
 * @param {Map<string, { file: string, line: number }>} references `firstReferences` of unused-scan.mjs
 * @returns {{ file: string, line: number } | null}
 */
export function locationOf(key, references) {
  for (let path = key; ; path = path.slice(0, path.lastIndexOf('.'))) {
    const place = references.get(path)
    if (place) return place
    if (!path.includes('.')) break
  }
  for (const [name, place] of references) {
    if (name.endsWith('.') && key.startsWith(name)) return place
  }
  return null
}
