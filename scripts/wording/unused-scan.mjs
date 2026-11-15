// The scan for unused texts (#626, spec #620): which messages of the locale file does no code refer to. Pure: strings and
// objects in, objects and strings out; scripts/wording/unused.mjs reads the files and writes the result.

/**
 * @typedef {{ key: string, text: string }} Message
 * @typedef {{ group: string, keys: Message[], total: number }} UnusedGroup
 * @typedef {{ groups: UnusedGroup[], total: number }} UnusedResult
 * @typedef {{ file: string, text: string }} Source
 */

// A literal key: a whole quoted token. The quote on each side is the only anchor, not a pairing of quotes: a Vue
// attribute `:title="t('empty.library.title')"` has its key between `'` and `'` inside a `"` string.
const LITERAL = /['"`]([A-Za-z][\w-]*(?:\.[\w-]+)+)(?=['"`])/g
// A prefix that code builds: a quoted string that continues with `${` or ends right before a `+`.
const BUILT = /['"`]([A-Za-z][\w-]*\.[\w.-]*)(?=\$\{|['"`]\s*\+)/g
// A member chain read off the server's import of the locale file (`de.mvp.ics`); only in a file that imports it. The
// `/` in the lookbehind keeps the import path `…/locales/de.json` from reading as the chain `json`.
const IMPORT_OF_LOCALE = 'locales/de.json'
const MEMBER_CHAIN = /(?<![\w.$/])de((?:\.[A-Za-z_]\w*)+)/g

/**
 * Every leaf message of the locale tree, in file order. An array of strings is one message per item, keyed by its
 * index (`wheel.placeholders.0`), as the review model keys them. Any other leaf type throws, naming the key.
 * @param {unknown} tree
 * @returns {Message[]}
 */
export function messagesOf(tree) {
  /** @type {Message[]} */
  const out = []
  /** @param {unknown} node @param {string} key */
  const walk = (node, key) => {
    if (typeof node === 'string') {
      out.push({ key, text: node })
    }
    else if (Array.isArray(node)) {
      node.forEach((item, i) => {
        if (typeof item !== 'string') throw new Error(`Message ${key} holds a non-string item at ${i}`)
        out.push({ key: `${key}.${i}`, text: item })
      })
    }
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, key ? `${key}.${k}` : k)
    }
    else {
      throw new Error(`Message ${key} is neither a string nor an array of strings`)
    }
  }
  walk(tree, '')
  return out
}

/**
 * Which messages no source refers to, per top-level group (locale-file order, a fully used group left out). `total` is
 * the number of unused messages; a group's `total` is its number of messages, used or not.
 * @param {Message[]} messages
 * @param {Source[]} sources
 * @returns {UnusedResult}
 */
export function scanUnused(messages, sources) {
  // A key that names a message, a group or an array marks it and everything under it (exact or `key + '.'`).
  const named = new Set()
  const prefixes = []
  for (const { text } of sources) {
    for (const m of text.matchAll(LITERAL)) named.add(m[1])
    for (const m of text.matchAll(BUILT)) prefixes.push(m[1])
    if (!text.includes(IMPORT_OF_LOCALE)) continue
    for (const m of text.matchAll(MEMBER_CHAIN)) named.add(m[1].slice(1))
  }
  const builtPrefixes = [...new Set(prefixes)]

  /** @param {string} key */
  const isUsed = (key) => {
    for (let path = key; ; path = path.slice(0, path.lastIndexOf('.'))) {
      if (named.has(path)) return true
      if (!path.includes('.')) break
    }
    return builtPrefixes.some(p => key.startsWith(p))
  }

  /** @type {Map<string, UnusedGroup>} */
  const groups = new Map()
  const totals = new Map()
  let total = 0
  for (const message of messages) {
    const group = message.key.split('.')[0]
    totals.set(group, (totals.get(group) ?? 0) + 1)
    if (isUsed(message.key)) continue
    if (!groups.has(group)) groups.set(group, { group, keys: [], total: 0 })
    groups.get(group).keys.push(message)
    total++
  }
  for (const g of groups.values()) g.total = totals.get(g.group)
  return { groups: [...groups.values()], total }
}

/**
 * The first place code names each key, name or prefix the scan reads (#629, for the walk's `locations`): the same three patterns as
 * `scanUnused`, in source order. A literal key, a prefix code builds (`team.colors.` of `team.colors.${at}`) and a member chain off the
 * locale import (`mvp.ics` of `de.mvp.ics`) are all names here; `locationOf` in where.mjs reads the map.
 * @param {Source[]} sources
 * @returns {Map<string, { file: string, line: number }>}
 */
export function firstReferences(sources) {
  /** @type {Map<string, { file: string, line: number }>} */
  const first = new Map()
  for (const { file, text } of sources) {
    const lineAt = (/** @type {number} */ index) => text.slice(0, index).split('\n').length
    /** @param {RegExpMatchArray} match @param {number} drop */
    const note = (match, drop = 0) => {
      const name = (match[1] ?? '').slice(drop)
      if (!first.has(name)) first.set(name, { file, line: lineAt(match.index ?? 0) })
    }
    for (const m of text.matchAll(LITERAL)) note(m)
    for (const m of text.matchAll(BUILT)) note(m)
    if (!text.includes(IMPORT_OF_LOCALE)) continue
    for (const m of text.matchAll(MEMBER_CHAIN)) note(m, 1)
  }
  return first
}

const CUT = 100

/** @param {string} text */
const oneLine = (text) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > CUT ? `${flat.slice(0, CUT - 1)}…` : flat
}

/**
 * What the command prints: per group a heading and one line per key, then a count per group and the total.
 * @param {UnusedResult} result
 * @param {number} messageCount the number of messages in the locale file
 */
export function formatReport(result, messageCount) {
  if (result.groups.length === 0) return 'No unused texts.'
  const lines = []
  for (const g of result.groups) {
    lines.push(`${g.group}  ${g.keys.length} of ${g.total} unused`)
    for (const { key, text } of g.keys) lines.push(`  ${key}  ${oneLine(text)}`)
    lines.push('')
  }
  for (const g of result.groups) lines.push(`${g.group}  ${g.keys.length} / ${g.total}`)
  lines.push(`Total  ${result.total} of ${messageCount} messages unused in ${result.groups.length} groups`)
  return lines.join('\n')
}

/**
 * The data file: exactly what the review model reads (#628), the full text of each key. No other field.
 * @param {UnusedResult} result
 */
export function dataOf(result) {
  return {
    groups: result.groups.map(({ group, keys }) => ({
      group,
      keys: keys.map(({ key, text }) => ({ key, text })),
    })),
  }
}
