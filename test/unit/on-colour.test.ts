import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkClassString, classStrings, findingMessage, onColourFills } from './on-colour'
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

  it('finds no dark text on a coloured fill', () => {
    const fills = onColourFills(clean(theme))
    const messages = files.flatMap((file) => {
      const name = `app/${file.replace(/\\/g, '/')}`
      return stringsOf(file).flatMap(s => checkClassString(s, fills).map(finding => findingMessage(name, s, finding)))
    })
    expect(messages).toEqual([])
  })
})
