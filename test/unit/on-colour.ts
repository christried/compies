// The scan for dark text on a coloured fill (#481). No imports, so `node` runs it directly for a calibration run.
// In Dunkel `--cp-ink` is light and reads 1.26:1 on the yellow primary, while the `--cp-on-*` tokens stay dark in both
// looks. The 0.11 fixes pinned token values and passed before the fix (review S6, Q7); this reads the class strings.

export type OnColourFinding = {
  rule: 'a' | 'b'
  /** The fill class as written in the string, variants included: `hover:bg-primary`. */
  fill: string
  /** Rule a only: the ink text class that sits on the fill, as written: `text-ink`. */
  text?: string
  /** The class to use, same variants as the fill, as written: `hover:text-on-primary`. */
  use: string
}

/** Context variants do not change what a fill is drawn under; every other variant, unknown ones included, is a state (a false alarm costs one edit, a silent pass a review). */
const CONTEXT_VARIANT = /^(dark|reduced|sm|md|lg|xl|2xl|max-.+|min-.+|@.+|motion-safe|motion-reduce|print|portrait|landscape|ltr|rtl|supports-.+|forced-colors|contrast-.+|starting)$/

/** The coloured fills: every name with a `--color-on-<name>` token next to its `--color-<name>` (#481). A new on-colour token is covered without an edit to the test. */
export function onColourFills(themeCss: string): string[] {
  const colours = [...themeCss.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map(m => m[1]!)
  return [...themeCss.matchAll(/--color-on-([a-z0-9-]+)\s*:/g)].map(m => m[1]!).filter(name => colours.includes(name))
}

/** Colons inside `[...]` or `(...)` belong to the value (`aria-[current=page]:`, `bg-[image:linear-gradient(...)]`), not to a variant. */
function splitVariants(raw: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of raw) {
    if (char === '[' || char === '(') depth++
    if (char === ']' || char === ')') depth--
    if (char === ':' && depth === 0) {
      parts.push(current)
      current = ''
    }
    else current += char
  }
  parts.push(current)
  return parts
}

const subset = (a: string[], b: string[]) => a.every(v => b.includes(v))

/**
 * Ink on a fill in the same state (rule a), and a fill under a state variant without its own on-colour (rule b). One
 * finding per fill token. Each string is checked alone: a class passed to another component is out of reach, which is
 * why rule b fails a state fill with no text at all (#481).
 */
export function checkClassString(classString: string, fills: string[]): OnColourFinding[] {
  const tokens = classString.split(/\s+/).filter(Boolean).map((raw) => {
    const parts = splitVariants(raw)
    const utility = (parts.pop() ?? '').replace(/^!|!$/g, '')
    return { raw, variants: parts, key: [...parts].sort(), utility }
  })
  const findings: OnColourFinding[] = []
  for (const fill of tokens) {
    const name = fill.utility.match(/^bg-([a-z0-9-]+)$/)?.[1]
    if (!name || !fills.includes(name)) continue
    const use = [...fill.variants, `text-on-${name}`].join(':')
    // Ink sits on the fill when its variants are the fill's or fewer, unless an on-colour with more of them, still within the fill's, overrides it.
    const ink = tokens.find(i => /^text-ink(-2|-3)?(\/.+)?$/.test(i.utility) && subset(i.key, fill.key)
      && !tokens.some(t => /^text-on-[a-z0-9-]+$/.test(t.utility) && t.key.length > i.key.length && subset(i.key, t.key) && subset(t.key, fill.key)))
    if (ink) {
      findings.push({ rule: 'a', fill: fill.raw, text: ink.raw, use })
      continue
    }
    const stateful = fill.variants.some(v => !CONTEXT_VARIANT.test(v))
    const ownOnColour = tokens.some(t => t.utility === `text-on-${name}` && t.key.length === fill.key.length && subset(t.key, fill.key))
    if (stateful && !ownOnColour) findings.push({ rule: 'b', fill: fill.raw, use })
  }
  return findings
}

const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g

/** A comment names classes the app never draws; its newlines stay. `//` counts only at a line start or after whitespace, so `https://` stays. */
function blankComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ')
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\s)\/\/[^\n]*/gm, (_, lead: string) => lead)
}

/** Every string literal of a literal's content, recursed: a double-quoted `:class="c ? 'a b' : 'c'"` holds single-quoted literals, a template literal holds literals inside `${…}`. */
function literals(text: string, out: string[]) {
  for (const m of text.matchAll(LITERAL)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? ''
    const flat = raw.replace(/\$\{[^}]*\}/g, ' ')
    // A string that still holds a quote is an expression (`c ? 'a' : 'b'`): its pieces come out of the recursion, each alone.
    if (!/['"`]/.test(flat)) out.push(flat)
    literals(raw, out)
  }
}

/** Every string of a `.vue` or `.ts` file that could be a class string, unique, in order (#481). */
export function classStrings(file: string, source: string): string[] {
  const text = blankComments(source)
  const out: string[] = []
  // A static attribute may span lines, which the literal scan does not match; the lookbehind skips `:class` and `enter-active-class`.
  if (file.endsWith('.vue')) for (const m of text.matchAll(/(?<![\w:@#.-])class="([^"]*)"/g)) out.push(m[1]!)
  literals(text, out)
  return [...new Set(out)]
}

/** `app/utils/notice.ts: "bg-info text-ink": text-ink on bg-info; use text-on-info` (#481). `file` is relative to the repo root, with forward slashes. */
export function findingMessage(file: string, classString: string, finding: OnColourFinding): string {
  const shown = classString.replace(/\s+/g, ' ').trim()
  const what = finding.rule === 'a' ? `${finding.text} on ${finding.fill}` : `${finding.fill} without ${finding.use}`
  return `${file}: "${shown}": ${what}; use ${finding.use}`
}
