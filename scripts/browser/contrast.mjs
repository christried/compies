// The rules of the Dunkel-Check (#407): what is PASS, FAIL or SKIP. The page only reads computed styles (`dark-read.mjs`)
// and judges nothing; everything that decides lives here as pure functions, so test/unit/contrast.test.ts pins it. A
// colour is [r, g, b, a] with r g b 0-255 and a 0-1; a verdict is decided on the unrounded ratio.

/**
 * @typedef {[number, number, number, number]} Rgba
 * @typedef {{ color: Rgba, image: 'none' | 'texture' | 'picture', stops: Rgba[] }} Layer One element's background on the way up from what a
 *   text sits on; `stops` are the colours of a `'texture'`'s gradients (the page texture).
 * @typedef {{ outcome: 'pass' | 'fail' | 'skip', why: 'contrast' | 'picture' | 'inactive' | 'no-ring' | 'same-as-behind' | null,
 *   fg: string | null, bg: string, ratio: number | null, need: number | null }} Verdict fg and bg as '#rrggbb'.
 * @typedef {Verdict & { kind: string, role: string, texts: string[], count: number, keys: string[] }} Line
 * @typedef {{ key: string, role: string, text: string, what: string, dark: string, system: string }} Difference
 * @typedef {{ color: Rgba, kind: 'flat' | 'texture' | 'picture', worst: Rgba[] }} Backdrop
 */

/** Source-over of two colours: `top` on `bottom`. */
export function over(top, bottom) {
  const a = top[3] + bottom[3] * (1 - top[3])
  if (a === 0) return [0, 0, 0, 0]
  const channel = i => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a
  return [channel(0), channel(1), channel(2), a]
}

/** '#rrggbb' of a colour; the alpha is not part of it (composite first). */
export function hex(rgba) {
  return `#${[0, 1, 2].map(i => Math.round(rgba[i]).toString(16).padStart(2, '0')).join('')}`
}

const luminance = rgba => [0, 1, 2]
  .map(i => rgba[i] / 255)
  .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)

/** WCAG 2 contrast of two opaque colours, unrounded. */
export function ratio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** A ratio printed cut, not rounded, to two decimals: 4.499 must never read as a passing „4.50“. */
export function cut(value) {
  return (Math.floor(value * 100 + 1e-9) / 100).toFixed(2)
}

/** WCAG's large text: 24 px, or 18.66 px (14 pt) bold. */
export function isLarge(size, weight) {
  return size >= 24 || (size >= 18.66 && weight >= 700)
}

/**
 * What a thing sits on: `behind` is nearest first, up to the first opaque layer or the canvas. Composited from the last
 * up. A `'texture'` layer (the page's dotted or glowing paper) adds one backdrop per gradient stop to `worst`, because
 * the colour under a text there varies and the worst place counts.
 * @param {Layer[]} behind
 * @returns {Backdrop}
 */
export function backdrop(behind) {
  /** @type {Rgba} */
  let color = [255, 255, 255, 1]
  /** @type {Rgba[]} */
  let worst = []
  let kind = 'flat'
  for (const layer of [...behind].reverse()) {
    if (layer.image === 'picture') kind = 'picture'
    else if (layer.image === 'texture' && kind !== 'picture') kind = 'texture'
    if (layer.image === 'texture') {
      const sources = worst.length ? worst : [color]
      worst = sources.flatMap((source) => {
        const base = over(layer.color, source)
        return layer.stops.map(stop => over(stop, base))
      })
    }
    else {
      worst = worst.map(source => over(layer.color, source))
    }
    color = over(layer.color, color)
  }
  return { color, kind: /** @type {Backdrop['kind']} */ (kind), worst }
}

/** The colours a thing can sit on: the flat backdrop and, on a texture, every worst one. */
const grounds = back => back.kind === 'texture' ? [back.color, ...back.worst] : [back.color]

/** @returns {Verdict} */
const skip = (why, back) => ({ outcome: 'skip', why, fg: null, bg: hex(back.color), ratio: null, need: null })

/** @returns {Verdict} */
function decide(fg, ground, need) {
  const value = ratio(fg, ground)
  return value >= need
    ? { outcome: 'pass', why: null, fg: hex(fg), bg: hex(ground), ratio: value, need }
    : { outcome: 'fail', why: 'contrast', fg: hex(fg), bg: hex(ground), ratio: value, need }
}

const lowest = verdicts => verdicts.reduce((worse, verdict) => verdict.ratio < worse.ratio ? verdict : worse)

/**
 * A text: 4.5:1, or 3:1 when large, of its colour (times the opacity of its ancestors) against what it sits on. On a
 * picture it is not judged; on the page texture the lowest ratio of the flat colour and every stop counts.
 * @returns {Verdict}
 */
export function judgeText(raw) {
  const back = backdrop(raw.behind)
  if (raw.inactive) return skip('inactive', back)
  if (back.kind === 'picture' || raw.over === 'picture') return skip('picture', back)
  const need = isLarge(raw.size, raw.weight) ? 3 : 4.5
  const [r, g, b, a] = raw.color
  return lowest(grounds(back).map(ground => decide(over([r, g, b, a * raw.opacity], ground), ground, need)))
}

/** The edge of a thing: the higher ratio of its `layers` (border, fill) against what it sits on (`back`), 3:1, the lowest over a texture's grounds. */
function edgeVerdict(layers, back) {
  const best = ground => layers
    .filter(Boolean)
    .map(layer => decide(over(layer, ground), ground, 3))
    .reduce((higher, verdict) => verdict.ratio > higher.ratio ? verdict : higher, { outcome: 'fail', why: 'contrast', fg: null, bg: hex(ground), ratio: 1, need: 3 })
  return lowest(grounds(back).map(best))
}

/**
 * A control's edge: its border and its fill, each composited over what it sits on, are compared with it; 3:1 for the
 * higher of the two (WCAG 1.4.11 asks for one of them to show where the control is). `raw.group` is the border of the
 * `radiogroup` a radio sits in: a segmented control's options have no edge of their own, the boundary WCAG 1.4.11 asks for is
 * the group's, so a radio that fails alone passes when the group's border reaches 3:1 on the group's own backdrop (#430).
 * @returns {Verdict}
 */
export function judgeBox(raw) {
  const back = backdrop(raw.behind)
  if (raw.inactive) return skip('inactive', back)
  if (back.kind === 'picture') return skip('picture', back)
  const own = edgeVerdict([raw.border, raw.fill], back)
  if (own.outcome === 'pass' || !raw.group?.border) return own
  const groupBack = backdrop(raw.group.behind)
  if (groupBack.kind === 'picture') return own
  const byGroup = edgeVerdict([raw.group.border], groupBack)
  return byGroup.outcome === 'pass' ? byGroup : own
}

/**
 * The focus ring: FAIL when there is none (or `:focus-visible` does not show it); else 3:1 against what it sits on.
 * @returns {Verdict}
 */
export function judgeRing(raw) {
  const back = backdrop(raw.behind)
  if (raw.on === 'none' || !raw.visible || !raw.width || !raw.ring || raw.ring[3] === 0) {
    return { outcome: 'fail', why: 'no-ring', fg: null, bg: hex(back.color), ratio: null, need: 3 }
  }
  if (back.kind === 'picture') return skip('picture', back)
  return lowest(grounds(back).map(ground => decide(over(raw.ring, ground), ground, 3)))
}

/**
 * A card, dialog or menu must stand off what it sits on: PASS when its fill, its border or its shadow, composited, is
 * another colour than the backdrop. No threshold: #398 says „differs“. `ratio` is the fill against the backdrop, for the
 * walk-through to read.
 * @returns {Verdict}
 */
export function judgeSurface(raw) {
  const back = backdrop(raw.behind)
  if (back.kind === 'picture') return skip('picture', back)
  const ground = back.color
  const composited = [raw.fill, raw.border, raw.shadow].map(layer => layer ? over(layer, ground) : null)
  const [fill] = composited
  const differs = composited.some(layer => layer && hex(layer) !== hex(ground))
  return {
    outcome: differs ? 'pass' : 'fail',
    why: differs ? null : 'same-as-behind',
    fg: fill ? hex(fill) : null,
    bg: hex(ground),
    ratio: fill ? ratio(fill, ground) : null,
    need: null,
  }
}

/**
 * One Line per distinct (outcome, why, role, fg, bg, need): its element count, the labels of the first three through
 * `name`, and the key of every one. A check is a colour pairing, not an element.
 * @returns {Line[]}
 */
export function lines(kind, raws, verdicts, name) {
  const groups = new Map()
  raws.forEach((raw, index) => {
    const verdict = verdicts[index]
    const id = JSON.stringify([verdict.outcome, verdict.why, raw.role, verdict.fg, verdict.bg, verdict.need])
    if (!groups.has(id)) groups.set(id, { ...verdict, kind, role: raw.role, texts: [], count: 0, keys: [] })
    const line = groups.get(id)
    line.count++
    line.keys.push(raw.key)
    if (line.texts.length < 3) line.texts.push(name(raw))
  })
  return [...groups.values()]
}

const show = value => !value
  ? 'none'
  : typeof value === 'string'
    ? value
    : Array.isArray(value) && typeof value[0] === 'number'
      ? hex(value) + (value[3] < 1 ? `/${value[3].toFixed(2)}` : '')
      : Array.isArray(value)
        ? value.map(layer => hex(layer.color) + (layer.image === 'none' ? '' : `:${layer.image}`)).join(' > ')
        : String(value)

const FIELDS = ['color', 'behind', 'border', 'fill', 'ring']

/**
 * What differs between the Dunkel reading and the System reading of one state: the items (each with its `kind` and its
 * `key`) are joined and their raw computed colours compared. An item only one reading has is `'missing'`.
 * @returns {Difference[]}
 */
export function same(dark, system) {
  const id = item => `${item.kind}:${item.key}`
  const byId = new Map(system.map(item => [id(item), item]))
  const found = []
  const seen = new Set()
  for (const item of dark) {
    seen.add(id(item))
    const twin = byId.get(id(item))
    if (!twin) {
      found.push({ key: item.key, role: item.role, text: item.text, what: 'missing', dark: 'present', system: 'absent' })
      continue
    }
    for (const field of FIELDS) {
      if (!(field in item) && !(field in twin)) continue
      const [a, b] = [show(item[field]), show(twin[field])]
      if (a !== b) found.push({ key: item.key, role: item.role, text: item.text, what: field, dark: a, system: b })
    }
  }
  for (const item of system) {
    if (!seen.has(id(item))) found.push({ key: item.key, role: item.role, text: item.text, what: 'missing', dark: 'absent', system: 'present' })
  }
  return found
}

const NAMES = new Set(['Dev Host', 'Dev Member', 'Dev Admin'])
// The script's own data: „R011 Dunkel-Check Spiel“, the Event, the long game name (R011 and 56 W).
const OWN = /^R011(?: .*|W{56})$/
const compiled = new WeakMap()
const squash = text => text.replace(/\s+/g, ' ').trim()
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The copy strings of `i18n/locales/de.json` split into plain strings and patterns: a placeholder `{x}` or a link `@:key` is a wildcard. */
function compile(copy) {
  const plain = new Map()
  const patterns = []
  for (const message of copy) {
    for (const alternative of message.split('|').map(squash)) {
      if (!alternative) continue
      const parts = alternative.split(/\{[^}]*\}|@[.:][\w.:-]+/)
      if (parts.length === 1) {
        plain.set(alternative, alternative)
        continue
      }
      // A string that is little more than its placeholders would name every text.
      if (parts.join('').replace(/\s/g, '').length < 3) continue
      const source = parts.map(escape).join('.+?')
      patterns.push({ alternative, open: new RegExp(`^${source}`), closed: new RegExp(`^${source}$`) })
    }
  }
  return { plain, patterns }
}

/**
 * The text for a log line: results.log, findings.json and report.md reach a public issue, so a text is named only when
 * it is committed copy (a value of de.json; a placeholder one is printed as the copy, never with what filled it), one of
 * the three dev Users, one of the script's own „R011 …“ names, or of a `static` state. Any other text comes from the
 * database and is `‹n Zeichen›`. The page reads at most 60 characters of a text, so one of 60 matches by its beginning.
 */
export function label(text, copy, isStatic) {
  const named = value => `„${value}“`
  if (isStatic || NAMES.has(text) || OWN.test(text)) return named(text)
  if (!compiled.has(copy)) compiled.set(copy, compile(copy))
  const { plain, patterns } = compiled.get(copy)
  const value = squash(text)
  const cutOff = [...value].length >= 60
  if (plain.has(value) || (cutOff && [...plain.keys()].some(known => known.startsWith(value)))) return named(value)
  const hit = patterns.find(pattern => (cutOff ? pattern.open : pattern.closed).test(value))
  return hit ? named(hit.alternative) : `‹${[...text].length} Zeichen›`
}
