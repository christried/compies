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
  const colours = themeColours(themeCss)
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

// Competing colours (#562): a colour of an element's static `class` against one of its `:class` literals. The stylesheet
// emits same-property utilities in a fixed order, so one of two never shows (#496: `border-line` beat `border-focus`).

/** An element of a `.vue` template that has both a static `class` and a `:class`. */
export type ClassElement = {
  /** The tag as written: `section`, `GameCard`. */
  tag: string
  /** The static `class` attribute, whitespace as written (multi-line ok). Never empty. */
  static: string
  /** The string literals of the `:class` / `v-bind:class` expression, in order, unique. Never empty. */
  conditional: string[]
}

export type CompetingFinding = {
  /** The property both classes set: `border`, `border-t`, `bg` or `text`. */
  property: string
  /** The variants both carry, sorted, joined with `:`; empty at rest. */
  variants: string
  /** The class of the static attribute, as written, variants and `!` included: `border-line`. */
  staticClass: string
  /** The class of the conditional literal, as written: `border-focus`. */
  conditionalClass: string
}

/** The colour names of the theme: every `--color-<name>`; the `--color-*: initial` reset does not match, so the list is closed (#562). */
export function themeColours(themeCss: string): string[] {
  return [...themeCss.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map(m => m[1]!)
}

/** An arbitrary value with an explicit colour shape; `bg-[image:...]` and `bg-[url(...)]` are no colours. */
const ARBITRARY_COLOUR = /^(\[|\()(color:|#|rgba?\(|hsla?\(|oklch\(|color-mix\()/

/** The opacity of `ink/10` or `ink/[0.2]` is cut at the last slash outside brackets. */
function splitOpacity(value: string): { name: string, opacity: string } {
  let depth = 0
  let cut = -1
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (char === '[' || char === '(') depth++
    if (char === ']' || char === ')') depth--
    if (char === '/' && depth === 0) cut = i
  }
  return cut < 0 ? { name: value, opacity: '' } : { name: value.slice(0, cut), opacity: value.slice(cut + 1) }
}

type ColourClass = { property: string, variants: string, value: string, text: string }

/** A token that is a border, background or text colour utility, or null. A size, a width or another property is none. */
function colourClass(token: string, colours: string[]): ColourClass | null {
  const parts = splitVariants(token)
  const utility = (parts.pop() ?? '').replace(/^!|!$/g, '')
  const m = utility.match(/^(bg|text|border(?:-(?:x|y|t|r|b|l|s|e))?)-(.+)$/)
  if (!m) return null
  const value = m[2]!
  const isColour = ARBITRARY_COLOUR.test(value) || colours.includes(splitOpacity(value).name)
  return isColour ? { property: m[1]!, variants: [...parts].sort().join(':'), value, text: token } : null
}

/** The `.vue` opening tags with both attributes, in file order (#562). A `>` inside a quoted attribute does not end a tag. */
export function classElements(file: string, source: string): ClassElement[] {
  if (!file.endsWith('.vue')) return []
  const elements: ClassElement[] = []
  for (const tag of blankComments(source).matchAll(/<([A-Za-z][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const attributes = tag[2]!
    const staticClass = attributes.match(/(?<![\w:@#.-])class="([^"]*)"/)?.[1]
    const bound = attributes.match(/(?<![\w@#.-])(?::|v-bind:)class=(?:"([^"]*)"|'([^']*)')/)
    const expression = bound?.[1] ?? bound?.[2]
    if (!staticClass?.trim() || expression === undefined) continue
    const conditional: string[] = []
    literals(expression, conditional)
    if (conditional.length) elements.push({ tag: tag[1]!, static: staticClass, conditional: [...new Set(conditional)] })
  }
  return elements
}

/** A static colour against the conditional literals of its element: one finding per (static class, conditional class) with the same property and variants and another colour or opacity (#562). */
export function checkCompeting(staticClasses: string, conditional: string[], colours: string[]): CompetingFinding[] {
  const parse = (classString: string) => classString.split(/\s+/).filter(Boolean).flatMap((token) => {
    const found = colourClass(token, colours)
    return found ? [found] : []
  })
  const findings: CompetingFinding[] = []
  for (const fixed of parse(staticClasses)) {
    for (const other of conditional.flatMap(parse)) {
      if (fixed.property !== other.property || fixed.variants !== other.variants || fixed.value === other.value) continue
      if (findings.some(f => f.staticClass === fixed.text && f.conditionalClass === other.text)) continue
      findings.push({ property: fixed.property, variants: fixed.variants, staticClass: fixed.text, conditionalClass: other.text })
    }
  }
  return findings
}

/** `app/components/StandsZone.vue: <section>: border-line in class competes with border-focus in :class; move border-line into the :class branches` (#562). `file` is relative to the repo root, with forward slashes. */
export function competingMessage(file: string, tag: string, finding: CompetingFinding): string {
  return `${file}: <${tag}>: ${finding.staticClass} in class competes with ${finding.conditionalClass} in :class; move ${finding.staticClass} into the :class branches`
}
