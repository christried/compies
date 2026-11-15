import { describe, expect, it } from 'vitest'
import { build, theme, themeBlock } from './css-tokens'

// The lift on hover (#33, #608). Like the hover tint, it is pinned at Tailwind's compiler: jsdom computes no cascade, so no
// test can read the transform or the shadow of a rendered element. The output keeps its nesting, so the helper below reads
// it as a tree and hands back every rule with the chain of at-rules and selectors around it.
const tint = themeBlock(/@utility tint/)
const lift = themeBlock(/@utility lift/)

type Rule = { chain: string[], decls: string[] }

/** Every block of a compiled stylesheet, with the headers around it (outermost first) and its own declarations. */
function parse(css: string): Rule[] {
  const rules: Rule[] = []
  const stack: Rule[] = []
  let buffer = ''
  for (const char of css) {
    if (char === '{') {
      stack.push({ chain: [...(stack.at(-1)?.chain ?? []), buffer.trim()], decls: [] })
      buffer = ''
    }
    else if (char === ';' || char === '}') {
      if (buffer.trim()) stack.at(-1)?.decls.push(buffer.trim())
      buffer = ''
      if (char === '}') {
        const closed = stack.pop()
        if (closed) rules.push(closed)
      }
    }
    else buffer += char
  }
  return rules
}

const header = (rule: Rule) => rule.chain.join(' | ')
const sets = (rule: Rule, declaration: string) => rule.decls.includes(declaration)

describe('lift', () => {
  const rules = async () => parse(await build(`${tint}\n${lift}`, ['lift']))

  it('presses onto its shadow, right and down (#608)', async () => {
    const press = (await rules()).find(rule => header(rule).endsWith('&:active'))
    expect(press?.decls).toContain('translate: var(--spacing) var(--spacing)')
    expect(press?.decls).toContain('box-shadow: none')
  })

  it('rises only where the device hovers and motion is not reduced, in the OS and in the app (#608)', async () => {
    const rises = (await rules()).filter(rule => rule.decls.some(decl => decl.startsWith('box-shadow: var(--shadow-card)')))
    expect(rises).toHaveLength(1)
    const [rise] = rises
    expect(sets(rise!, 'translate: 0 calc(var(--spacing) * -0.5)')).toBe(true)
    expect(header(rise!)).toContain('(hover: hover)')
    expect(header(rise!)).toContain('(prefers-reduced-motion: no-preference)')
    expect(header(rise!)).toMatch(/:not\(\[data-motion=reduced\] \*\)/)
  })

  it('shows the tint and nothing that moves or grows under reduced motion (#608)', async () => {
    const all = await rules()
    const reduced = all.filter(rule => /prefers-reduced-motion: reduce|\[data-motion=reduced\] &/.test(header(rule)))
    const hovers = reduced.filter(rule => header(rule).endsWith('&:hover'))
    expect(hovers).toHaveLength(2)
    for (const rule of hovers) {
      expect(rule.decls).toContain('translate: none')
      expect(rule.decls.some(decl => decl.startsWith('background-image: linear-gradient'))).toBe(true)
    }
    for (const rule of reduced) expect(rule.decls.some(decl => decl.startsWith('box-shadow'))).toBe(false)
  })
})

describe('the hold button hover (#608)', () => {
  const reducedVariant = theme.match(/@custom-variant reduced .*/)?.[0]
  const source = `${reducedVariant}\n@theme { --spacing: 0.25rem; --shadow-btn: 4px 4px 0 #000; --shadow-card: 6px 6px 0 #000; }`
  const classes = ['hover:-translate-y-0.5', 'hover:shadow-card', 'reduced:hover:shadow-btn', 'motion-reduce:hover:shadow-btn']
  const compiled = async () => parse(await build(source, classes))
  const named = (rules: Rule[], className: string) => rules.findIndex(rule => header(rule).includes(`.${className}`))

  it('has the custom variant it compiles from', () => {
    expect(reducedVariant).toBeDefined()
  })

  it('lifts only where the device hovers: no lift on a device without hover', async () => {
    const rules = await compiled()
    for (const name of ['hover\\:-translate-y-0\\.5', 'hover\\:shadow-card']) {
      const at = named(rules, name)
      expect(at).toBeGreaterThanOrEqual(0)
      expect(header(rules[at]!)).toContain('(hover: hover)')
    }
  })

  it('keeps the resting shadow under reduced motion, in the OS and in the app, after the growing one', async () => {
    const rules = await compiled()
    const growing = named(rules, 'hover\\:shadow-card')
    for (const name of ['reduced\\:hover\\:shadow-btn', 'motion-reduce\\:hover\\:shadow-btn']) {
      const at = named(rules, name)
      expect(at).toBeGreaterThan(growing)
      expect(rules[at]!.decls).toContain('--tw-shadow: 4px 4px 0 var(--tw-shadow-color, #000)')
    }
  })
})
