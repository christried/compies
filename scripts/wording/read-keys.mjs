// Reads the message keys a dev-server page carries (#627, spec #620 § Telling the texts apart): the page was started with COMPIES_WORDING=1,
// so every translated text holds its key in invisible characters (shared/key-tag.ts). `readKeys(tab)` is for scripts/wording/keys.mjs
// and for a later walk (#629); it has no side effects at import. Node runs the .ts module natively.
import { decodeTags } from '../../shared/key-tag.ts'

/** @typedef {{ x: number, y: number, width: number, height: number }} Box */
/** @typedef {'text' | 'aria-label' | 'title' | 'alt' | 'placeholder'} Kind (`data-placeholder` is read as `placeholder`) */
/** @typedef {{ i: number, kind: Kind, element: string, raw: string }} Candidate */
/** @typedef {{ key: string, text: string, kind: Kind, element: string, box: Box | null, partial: boolean }} Row */

// One pass over the document in document order: a text node or an attribute value that holds the open marker of a tag (U+2060 and a bit) is a candidate and is
// kept in window.__wordingNodes[i] for the second call; a visible non-blank text node without one is counted as untagged. The devtools
// container and the elements that hold no page text are skipped. `data-placeholder` (#810) is the Tiptap Placeholder extension's attribute on the empty paragraph, which the CSS
// paints: it is read like `placeholder` and its candidate says `placeholder`, so the recording's `via` stays inside its enum.
const FIND = `(() => {
  const OPEN = /\\u2060[\\u2062\\u2063]/
  const SKIP = new Set(['script', 'style', 'noscript', 'template'])
  const ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder', 'data-placeholder']
  const nodes = (window.__wordingNodes = [])
  const candidates = []
  let untagged = 0
  const describe = el => el.localName + (el.id ? '#' + el.id : '')
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.nodeType === 1 && (SKIP.has(node.localName) || node.id === 'nuxt-devtools-container') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) {
      const raw = node.nodeValue ?? ''
      if (OPEN.test(raw)) {
        candidates.push({ i: nodes.push(node) - 1, kind: 'text', element: describe(node.parentElement), raw })
      }
      else if (raw.trim() !== '') untagged++
      continue
    }
    for (const name of ATTRIBUTES) {
      const raw = node.getAttribute(name)
      if (raw && OPEN.test(raw)) candidates.push({ i: nodes.push(node) - 1, kind: name === 'data-placeholder' ? 'placeholder' : name, element: describe(node), raw })
    }
  }
  return { candidates, untagged }
})()`

// The boxes in CSS px, document-relative: a text node's tag by a Range over its visible region (the union of its client rects), an attribute
// by the element's own rect. null when nothing is painted (no rect, or zero size). `spans` is data: [{ i, kind, tags: [{ from, to }] }].
const boxesScript = spans => `((spans) => {
  const box = (rects) => {
    const painted = rects.filter(r => r.width > 0 && r.height > 0)
    if (!painted.length) return null
    const left = Math.min(...painted.map(r => r.left))
    const top = Math.min(...painted.map(r => r.top))
    const right = Math.max(...painted.map(r => r.right))
    const bottom = Math.max(...painted.map(r => r.bottom))
    const round = n => Math.round(n * 100) / 100
    return { x: round(left + scrollX), y: round(top + scrollY), width: round(right - left), height: round(bottom - top) }
  }
  return spans.map(({ i, kind, tags }) => {
    const node = window.__wordingNodes[i]
    if (kind !== 'text') {
      const own = node.isConnected ? box([node.getBoundingClientRect()]) : null
      return tags.map(() => own)
    }
    return tags.map(({ from, to }) => {
      try {
        const range = document.createRange()
        range.setStart(node, from)
        range.setEnd(node, to)
        return box([...range.getClientRects()])
      }
      catch { return null }
    })
  })
})(${JSON.stringify(spans)})`

/**
 * The rows of a page, in document order: one per tag, so a text that code joined (`a, b`) reads as several rows.
 * `boxes[j]` holds the boxes of candidate `j`'s tags, in the order `decodeTags` gives them.
 * @param {Candidate[]} candidates
 * @param {Array<Array<Box | null>>} boxes
 * @returns {Row[]}
 */
export function rowsFrom(candidates, boxes) {
  return candidates.flatMap((candidate, j) => decodeTags(candidate.raw).tags.map((tag, k) => ({
    key: tag.key,
    text: tag.text,
    kind: candidate.kind,
    element: candidate.element,
    box: boxes[j]?.[k] ?? null,
    partial: tag.partial,
  })))
}

/**
 * Reads the keys off the tab's page. Returns the rows and the number of untagged text nodes (visible text that did not come through `t()`:
 * the texts the tags do not cover, the spec's fixed table and the literals of a template), which a walk reports instead of dropping.
 * @param {{ evaluate: (expression: string) => Promise<any> }} tab
 * @returns {Promise<{ rows: Row[], untagged: number }>}
 */
export async function readKeys(tab) {
  const { candidates, untagged } = await findCandidates(tab)
  return { rows: rowsFrom(candidates, await measureCandidates(tab, candidates)), untagged }
}

/**
 * The first step of `readKeys` on its own (#629: the walk reads the page's candidates once and measures what it needs): the tagged text nodes
 * and attributes in document order, kept in `window.__wordingNodes[candidate.i]` for `measureCandidates`, and the untagged count.
 * @param {{ evaluate: (expression: string) => Promise<any> }} tab
 * @returns {Promise<{ candidates: Candidate[], untagged: number }>}
 */
export function findCandidates(tab) {
  return tab.evaluate(FIND)
}

/**
 * The second step: `boxes[j]` holds the boxes of candidate `j`'s tags (document-relative CSS px, null where nothing is painted).
 * @param {{ evaluate: (expression: string) => Promise<any> }} tab
 * @param {Candidate[]} candidates
 * @returns {Promise<Array<Array<Box | null>>>}
 */
export async function measureCandidates(tab, candidates) {
  if (!candidates.length) return []
  const spans = candidates.map(candidate => ({ i: candidate.i, kind: candidate.kind, tags: decodeTags(candidate.raw).tags.map(({ from, to }) => ({ from, to })) }))
  return tab.evaluate(boxesScript(spans))
}

/**
 * The leaves of a messages object as `{ 'a.b.c': 'text' }`.
 * @param {unknown} node
 * @param {string[]} [path]
 * @returns {Record<string, string>}
 */
export function flatten(node, path = []) {
  if (typeof node === 'string') return { [path.join('.')]: node }
  if (node && typeof node === 'object') return Object.assign({}, ...Object.entries(node).map(([key, value]) => flatten(value, [...path, key])))
  return {}
}

const boxOf = box => (box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'not painted')

/**
 * One line of the command's output: `key  kind  <element>  x,y WxH  "text"`. The text prints only when it equals the message verbatim; an
 * interpolated text can carry a name or a number, and nothing of a User's data leaves the page (CLAUDE.md § Personal data).
 * @param {Row} row
 * @param {Record<string, string>} messages
 */
export function lineOf(row, messages) {
  const verbatim = messages[row.key] !== undefined && row.text === messages[row.key]
  const shown = verbatim ? `"${row.text.replaceAll('\n', '\\n')}"` : '‹eingesetzt›'
  return `${row.key}  ${row.kind}  <${row.element}>  ${boxOf(row.box)}  ${shown}${row.partial ? '  [partial]' : ''}`
}

/**
 * The counts of the command's last line.
 * @param {Row[]} rows
 * @param {Record<string, string>} messages
 * @param {number} untagged
 */
export function summaryOf(rows, messages, untagged) {
  return {
    rows: rows.length,
    keys: new Set(rows.map(row => row.key)).size,
    missing: rows.filter(row => messages[row.key] === undefined).length,
    untagged,
    partial: rows.filter(row => row.partial).length,
  }
}
