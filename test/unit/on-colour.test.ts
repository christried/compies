import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkClassString, checkCompeting, classElements, classStrings, competingMessage, findingMessage, onColourFills, themeColours } from './on-colour'
import { clean, theme } from './css-tokens'

// Ink is light in Dunkel and reads 1.26:1 on the yellow primary; the `--cp-on-*` tokens stay dark in both looks. The 0.11
// fixes pinned token values and passed before the fix (review S6, Q7), so this reads the class strings under `app/` (#481).
// A ticket that swaps a text class on a fill adds its broken string as a case of `checkClassString` first.
const FILLS = ['primary', 'hot', 'success', 'warning', 'error', 'info']

const root = resolve(import.meta.dirname, '../..')

function appFiles(): string[] {
  return readdirSync(join(root, 'app'), { recursive: true, encoding: 'utf8' }).filter(file => /\.(ts|vue)$/.test(file))
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

describe('the fills', () => {
  it('are the colours with an on-colour token in the theme', () => {
    const fills = onColourFills(clean(theme))
    expect(fills).toEqual(expect.arrayContaining(['primary', 'info', 'hot', 'warning', 'error', 'success']))
    for (const notFill of ['ink', 'paper', 'info-tint']) expect(fills).not.toContain(notFill)
  })
})

describe('the ticket cases', () => {
  it.each([
    ['hover:bg-primary focus-visible:bg-primary', ['b', 'b'], ['hover:text-on-primary', 'focus-visible:text-on-primary']],
    ['bg-info text-ink', ['a'], ['text-on-info']],
    ['bg-primary text-on-primary', [], []],
    ['hover:bg-primary hover:text-on-primary', [], []],
    ['bg-info', [], []],
  ])('%s', (classString, rules, use) => {
    const findings = checkClassString(classString, FILLS)
    expect(findings.map(f => f.rule)).toEqual(rules)
    expect(findings.map(f => f.use)).toEqual(use)
  })

  it('names the ink class of rule a', () => {
    expect(checkClassString('bg-info text-ink', FILLS)[0]?.text).toBe('text-ink')
  })
})

describe('the rule at its edges', () => {
  it.each<[string, Array<[string, string]>]>([
    ['size-2 rounded-full bg-hot', []],
    ['text-ink hover:bg-primary hover:text-on-primary', []],
    ['text-ink hover:bg-primary', [['a', 'hover:text-on-primary']]],
    ['hover:bg-primary text-on-primary', [['b', 'hover:text-on-primary']]],
    ['hover:bg-primary hover:text-ink', [['a', 'hover:text-on-primary']]],
    ['group-hover:bg-hot', [['b', 'group-hover:text-on-hot']]],
    ['hover:bg-hot hover:text-on-primary', [['b', 'hover:text-on-hot']]],
    ['aria-[current=page]:bg-primary aria-[current=page]:text-on-primary', []],
    ['data-[state=on]:bg-primary text-ink', [['a', 'data-[state=on]:text-on-primary']]],
    ['focus:bg-primary focus:text-ink', [['a', 'focus:text-on-primary']]],
    ['bg-primary/20 text-ink', []],
    ['bg-info-tint text-ink', []],
    ['bg-surface text-ink', []],
    ['border-primary text-ink', []],
    ['ring-primary text-ink', []],
    ['bg-primary text-ink-3', [['a', 'text-on-primary']]],
    ['bg-primary text-ink/60', [['a', 'text-on-primary']]],
    ['!bg-primary text-ink', [['a', 'text-on-primary']]],
    ['bg-primary! text-ink!', [['a', 'text-on-primary']]],
    ['dark:bg-primary text-ink', [['a', 'dark:text-on-primary']]],
    ['dark:bg-primary', []],
    ['bg-primary text-ink dark:text-on-primary', [['a', 'text-on-primary']]],
    ['md:bg-primary text-ink', [['a', 'md:text-on-primary']]],
    ['hover:bg-primary hover:text-on-primary dark:hover:bg-hot', [['b', 'dark:hover:text-on-hot']]],
    ['dark:hover:bg-primary hover:dark:text-on-primary', []],
    ['bg-primary text-on-primary hover:bg-surface hover:text-ink', []],
    ['bg-primary text-surface', []],
    ['text-[12px] bg-primary', []],
    ['bg-[image:linear-gradient(transparent_55%,var(--cp-primary)_55%)] text-ink', []],
  ])('%s', (classString, expected) => {
    expect(checkClassString(classString, FILLS).map(f => [f.rule, f.use])).toEqual(expected)
  })
})

describe('the message', () => {
  it('names the file, the string and the class to use', () => {
    const [a] = checkClassString('bg-info text-ink', FILLS)
    const [b] = checkClassString('hover:bg-primary\n   focus-visible:bg-primary', FILLS)
    expect(findingMessage('app/utils/notice.ts', 'bg-info text-ink', a!))
      .toBe('app/utils/notice.ts: "bg-info text-ink": text-ink on bg-info; use text-on-info')
    expect(findingMessage('app/components/ReleaseCard.vue', 'hover:bg-primary\n   focus-visible:bg-primary', b!))
      .toBe('app/components/ReleaseCard.vue: "hover:bg-primary focus-visible:bg-primary": hover:bg-primary without hover:text-on-primary; use hover:text-on-primary')
  })
})

describe('the class strings of a file', () => {
  it('reads a multi-line static class attribute as one string', () => {
    const strings = classStrings('A.vue', '<template>\n  <div class="a\n    bg-primary text-on-primary\n    b" />\n</template>').map(collapse)
    expect(strings).toContain('a bg-primary text-on-primary b')
  })

  it('reads each branch of a ternary alone', () => {
    const strings = classStrings('A.vue', `<div :class="active ? 'bg-primary text-on-primary' : 'bg-surface text-ink'" />`)
    expect(strings).toContain('bg-primary text-on-primary')
    expect(strings).toContain('bg-surface text-ink')
    expect(strings.filter(s => s.includes('bg-primary') && s.includes('bg-surface'))).toEqual([])
  })

  it('reads an object key of a bound class', () => {
    expect(classStrings('A.vue', `<div :class="[{ 'bg-success text-on-success': ok }, 'p-2']" />`)).toContain('bg-success text-on-success')
  })

  it('reads a literal of a ts file', () => {
    expect(classStrings('a.ts', `const MAP = { info: 'bg-info text-ink' }`)).toContain('bg-info text-ink')
  })

  it('replaces an interpolation of a template literal', () => {
    const strings = classStrings('a.ts', 'const c = `rounded bg-${tone} px-2`')
    expect(strings.some(s => s.includes('bg-') && s.includes('px-2'))).toBe(true)
    expect(strings.filter(s => s.includes('${'))).toEqual([])
  })

  it.each([
    ['a.ts', '// bg-info text-ink'],
    ['A.vue', '<!-- bg-info text-ink -->'],
    ['a.ts', '/* bg-info text-ink */'],
  ])('skips a comment: %s %s', (file, source) => {
    expect(classStrings(file, source).filter(s => s.includes('bg-info'))).toEqual([])
  })

  it('returns the same string once', () => {
    expect(classStrings('a.ts', `const a = 'bg-info text-on-info'\nconst b = 'bg-info text-on-info'`)).toEqual(['bg-info text-on-info'])
  })
})

// A static colour beside a conditional one of the same property: the stylesheet emits same-property utilities in a fixed
// order, so one of the two never shows. #496: `border-line` static, `border-focus` conditional, a drop target never showed
// its focus border (#562).
const COLOURS = ['line', 'focus', 'surface', 'paper-2', 'ink', 'paper', 'primary', 'on-primary', 'transparent']
const pairs = (staticClasses: string, conditional: string[]) =>
  checkCompeting(staticClasses, conditional, COLOURS).map(f => [f.staticClass, f.conditionalClass])

const STANDS_STATIC = 'flex min-w-0 flex-col gap-2 rounded-[18px] border-line bg-surface p-3 text-ink transition-[box-shadow,border-color] dur-fast'
const TEAM_STATIC = 'flex min-w-0 flex-col rounded-[14px] border-line bg-surface text-ink transition-[box-shadow,border-color] dur-fast'

describe('the competing colours', () => {
  it('fails the Stands zone of #496 before its fix', () => {
    expect(pairs(STANDS_STATIC, ['border-[3px] border-focus shadow-card', 'border-(length:--cp-bw)'])).toEqual([['border-line', 'border-focus']])
  })

  it('passes the Stands zone with the colour in the branches', () => {
    const fixed = STANDS_STATIC.replace(' border-line', '')
    expect(pairs(fixed, ['border-[3px] border-focus shadow-card', 'border-(length:--cp-bw) border-line'])).toEqual([])
  })

  it('fails the team zone of #496 before its fix', () => {
    expect(pairs(TEAM_STATIC, ['border-[3px] border-focus shadow-card', 'border-[3px] shadow-card', 'border-(length:--cp-bw)'])).toEqual([['border-line', 'border-focus']])
  })

  it('passes the team zone with the colour in the branches', () => {
    const fixed = TEAM_STATIC.replace(' border-line', '')
    expect(pairs(fixed, ['border-[3px] border-focus shadow-card', 'border-[3px] border-line shadow-card', 'border-(length:--cp-bw) border-line'])).toEqual([])
  })

  it('passes colours of different properties', () => {
    expect(pairs('bg-surface text-ink', ['border-focus'])).toEqual([])
    expect(pairs('bg-ink', ['text-paper'])).toEqual([])
  })

  it('passes the same property at rest against hover', () => {
    expect(pairs('border-line', ['hover:border-focus'])).toEqual([])
    expect(pairs('hover:border-line', ['border-focus'])).toEqual([])
  })

  it('fails the same property in the same variant', () => {
    expect(pairs('hover:border-line', ['hover:border-focus'])).toEqual([['hover:border-line', 'hover:border-focus']])
  })

  it('reads the pre-fix Stands element of #496 whole', () => {
    const tag = `<section
    class="${STANDS_STATIC}"
    :class="dropTarget ? 'border-[3px] border-focus shadow-card' : 'border-(length:--cp-bw)'"
    role="group"
    :aria-label="t('board.stands')"
    data-drop-zone="stands"
  >`
    const elements = classElements('StandsZone.vue', tag)
    expect(elements).toHaveLength(1)
    const [el] = elements
    expect(el!.tag).toBe('section')
    expect(checkCompeting(el!.static, el!.conditional, COLOURS).map(f => [f.staticClass, f.conditionalClass])).toEqual([['border-line', 'border-focus']])
  })
})

describe('the competing colours at their edges', () => {
  it.each<[string, string[], Array<[string, string]>]>([
    ['border-2 border-line', ['border-[3px] border-focus'], [['border-line', 'border-focus']]],
    ['border-(length:--cp-bw)', ['border-focus'], []],
    ['text-small', ['text-ink'], []],
    ['text-[12px]', ['text-ink'], []],
    ['text-left', ['text-ink'], []],
    ['text-ink', ['text-paper'], [['text-ink', 'text-paper']]],
    ['bg-cover bg-surface', ['bg-paper-2'], [['bg-surface', 'bg-paper-2']]],
    ['bg-ink', ['bg-ink'], []],
    ['bg-ink', ['bg-ink/10'], [['bg-ink', 'bg-ink/10']]],
    ['bg-ink/10', ['bg-primary/20'], [['bg-ink/10', 'bg-primary/20']]],
    ['bg-ink/10', ['bg-ink/10'], []],
    ['dark:bg-surface', ['dark:bg-paper-2'], [['dark:bg-surface', 'dark:bg-paper-2']]],
    ['bg-surface', ['dark:bg-ink'], []],
    ['md:bg-surface', ['bg-ink'], []],
    ['dark:hover:bg-surface', ['hover:dark:bg-ink'], [['dark:hover:bg-surface', 'hover:dark:bg-ink']]],
    ['focus-visible:border-line', ['focus-visible:border-focus'], [['focus-visible:border-line', 'focus-visible:border-focus']]],
    ['focus:border-line', ['focus-visible:border-focus'], []],
    ['group-hover:bg-surface', ['group-hover:bg-ink'], [['group-hover:bg-surface', 'group-hover:bg-ink']]],
    ['aria-[current=page]:bg-surface', ['aria-[current=page]:bg-ink'], [['aria-[current=page]:bg-surface', 'aria-[current=page]:bg-ink']]],
    ['data-[state=on]:bg-surface', ['bg-ink'], []],
    ['!bg-surface', ['bg-ink'], [['!bg-surface', 'bg-ink']]],
    ['border-t-line', ['border-t-focus'], [['border-t-line', 'border-t-focus']]],
    ['border-line', ['border-t-focus'], []],
    ['border-r-(length:--cp-bw-thin) border-r-line', ['border-r-line'], []],
    ['bg-surface', ['bg-[#fff]'], [['bg-surface', 'bg-[#fff]']]],
    ['bg-surface', ['bg-[image:linear-gradient(transparent_55%,var(--cp-primary)_55%)]'], []],
    ['text-ink', ['text-[color:var(--cp-hot)]'], [['text-ink', 'text-[color:var(--cp-hot)]']]],
    ['bg-red-500', ['bg-ink'], []],
    ['border-line bg-surface text-ink', ['border-focus bg-paper-2'], [['border-line', 'border-focus'], ['bg-surface', 'bg-paper-2']]],
    ['border-line', ['border-focus', 'border-focus shadow-card'], [['border-line', 'border-focus']]],
    ['border-line border-focus', ['p-2'], []],
    ['border-line', ['border-focus border-ink'], [['border-line', 'border-focus'], ['border-line', 'border-ink']]],
    ['', ['border-focus'], []],
  ])('%s against %j', (staticClasses, conditional, expected) => {
    expect(pairs(staticClasses, conditional)).toEqual(expected)
  })

  it('names the property and the variants of a finding', () => {
    const [f] = checkCompeting('dark:hover:border-t-line', ['hover:dark:border-t-focus'], COLOURS)
    expect(f).toMatchObject({ property: 'border-t', variants: 'dark:hover' })
  })
})

describe('the elements of a file', () => {
  const read = (source: string) => classElements('A.vue', source)

  it('reads a multi-line static class whole', () => {
    const [el] = read('<div class="a\n    border-line bg-surface\n    b" :class="x ? \'c\' : \'d\'" />')
    expect(collapse(el!.static)).toBe('a border-line bg-surface b')
  })

  it('reads the literals of an array and an object', () => {
    expect(read(`<div class="p-2" :class="[x ? 'a' : 'b', { 'c d': e }]" />`)[0]!.conditional).toEqual(['a', 'b', 'c d'])
  })

  it('reads v-bind:class', () => {
    expect(read(`<div class="p-2" v-bind:class="'bg-ink'" />`)[0]!.conditional).toEqual(['bg-ink'])
  })

  it('keeps an element whole around a > in an attribute', () => {
    const elements = read(`<div class="p-2" :class="a > b ? 'bg-ink' : 'bg-paper-2'" role="group">`)
    expect(elements).toHaveLength(1)
    expect(elements[0]!.conditional).toEqual(['bg-ink', 'bg-paper-2'])
  })

  it('replaces the interpolation of a template literal with a space', () => {
    const [el] = read('<div class="p-2" :class="`bg-${tone} p-2`" />')
    expect(el!.conditional).toHaveLength(1)
    expect(collapse(el!.conditional[0]!)).toBe('bg- p-2')
  })

  it('gives no element for a tag with one attribute only', () => {
    expect(read('<div class="bg-ink" />')).toEqual([])
    expect(read(`<div :class="'bg-ink'" />`)).toEqual([])
  })

  it('does not take enter-active-class for a static class', () => {
    expect(read(`<Transition enter-active-class="bg-ink" :class="'bg-paper-2'" />`)).toEqual([])
  })

  it('skips a commented-out element', () => {
    expect(read(`<!-- <div class="bg-ink" :class="'bg-paper-2'" /> -->`)).toEqual([])
  })

  it('reads a self-closing component', () => {
    const [el] = read(`<GameCard class="bg-ink" :class="'bg-paper-2'" />`)
    expect(el!.tag).toBe('GameCard')
  })

  it('returns two elements with the same strings twice', () => {
    expect(read(`<div class="bg-ink" :class="'bg-paper-2'" />\n<div class="bg-ink" :class="'bg-paper-2'" />`)).toHaveLength(2)
  })

  it('reads a .vue file only', () => {
    expect(classElements('a.ts', `<div class="bg-ink" :class="'bg-paper-2'" />`)).toEqual([])
  })
})

describe('the theme colours', () => {
  const names = themeColours(clean(theme))

  it('are the colour names of the theme', () => {
    expect(names).toEqual(expect.arrayContaining(['line', 'focus', 'surface', 'paper-2', 'on-primary', 'team-1-ink', 'transparent']))
    expect(names).not.toContain('*')
  })

  it('keep a size apart from a colour', () => {
    const sizes = [...clean(theme).matchAll(/--(?:text|border-width)-([a-z0-9-]+?)\s*:/g)].map(m => m[1]!)
    expect(sizes.length).toBeGreaterThan(10)
    for (const size of sizes) expect(names).not.toContain(size)
  })
})

describe('the competing message', () => {
  it('names the file, the static class and the conditional class', () => {
    const finding = { property: 'border', variants: '', staticClass: 'border-line', conditionalClass: 'border-focus' }
    expect(competingMessage('app/components/StandsZone.vue', 'section', finding))
      .toBe('app/components/StandsZone.vue: <section>: border-line in class competes with border-focus in :class; move border-line into the :class branches')
  })
})

describe('the app', () => {
  const VUE_FLOOR = 3077
  const TS_FLOOR = 652
  const files = appFiles()
  const stringsOf = (file: string) => classStrings(file, readFileSync(join(root, 'app', file), 'utf8'))

  it('finds what it checks', () => {
    const strings = (extension: string) => files.filter(file => file.endsWith(extension)).flatMap(stringsOf)
    expect(files.length).toBeGreaterThan(100)
    expect(strings('.vue').length).toBeGreaterThan(VUE_FLOOR)
    expect(strings('.ts').length).toBeGreaterThan(TS_FLOOR)
    expect([...strings('.vue'), ...strings('.ts')].some(s => /\bbg-\S+/.test(s) && /\btext-on-\S+/.test(s))).toBe(true)
  })

  const elementsOf = (file: string) => classElements(file, readFileSync(join(root, 'app', file), 'utf8'))

  it('finds the elements it checks', () => {
    const ELEMENT_FLOOR = 100
    const elements = files.flatMap(elementsOf)
    expect(elements.length).toBeGreaterThan(ELEMENT_FLOOR)
    const hasColour = (classString: string) => /(?:^|\s)(?:bg|border|text)-(?:line|surface|ink|paper|primary)(?:\s|$)/.test(classString)
    expect(elements.some(el => hasColour(el.static) && el.conditional.some(hasColour))).toBe(true)
  })

  it('finds no static colour beside a competing conditional one', () => {
    const colours = themeColours(clean(theme))
    const messages = files.flatMap((file) => {
      const name = `app/${file.replace(/\\/g, '/')}`
      return elementsOf(file).flatMap(el => checkCompeting(el.static, el.conditional, colours).map(finding => competingMessage(name, el.tag, finding)))
    })
    expect(messages).toEqual([])
  })

  it('finds no dark text on a coloured fill', () => {
    const fills = onColourFills(clean(theme))
    const messages = files.flatMap((file) => {
      const name = `app/${file.replace(/\\/g, '/')}`
      return stringsOf(file).flatMap(s => checkClassString(s, fills).map(finding => findingMessage(name, s, finding)))
    })
    expect(messages).toEqual([])
  })
})
