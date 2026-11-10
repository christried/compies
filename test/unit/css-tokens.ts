import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile } from 'tailwindcss'
import { ratio } from '../../scripts/browser/contrast.mjs'

// The one home of what the stylesheet tests share (#409, #411, #431, #433, #402): the token file and the theme as text, a
// token's colour, the contrast of two colours, and Tailwind's compiler with the `dark` variant. jsdom computes no cascade,
// so a Dunkel fix is pinned at the stylesheet, not at a rendered colour. The next Dunkel fix adds a case, not a helper.
const cssFile = (name: string) => readFileSync(resolve(import.meta.dirname, `../../app/assets/css/${name}`), 'utf8')

export const tokens = cssFile('compies-tokens.css')
export const theme = cssFile('compies-theme.css')

/** Comments do not count. */
export const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
/** `[data-theme="dark"]` and `[data-theme=dark]` read alike, and whitespace does not count. */
export const normalise = (text: string) => text.replace(/\[data-theme="(\w+)"\]/g, '[data-theme=$1]').replace(/\s+/g, ' ').trim()

/** The light block (`:root, [data-theme="light"]`) and the dark one (`[data-theme="dark"]`), up to the closing brace at line start. */
export const light = tokens.match(/:root, \[data-theme="light"\] \{[\s\S]*?\n\}/)?.[0] ?? ''
export const dark = tokens.match(/\[data-theme="dark"\] \{[\s\S]*?\n\}/)?.[0] ?? ''

/** The value of a token in a block; the colon right after the name keeps `--cp-on-primary` and `--cp-ink-2` apart from `--cp-ink`. */
export const colour = (block: string, name: string) => {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
  if (!value) throw new Error(`--${name} is not in its block`)
  return value
}

const rgba = (value: string): [number, number, number, number] => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
  1,
]
/** The contrast ratio of two `#rrggbb` colours. */
export const contrast = (a: string, b: string) => ratio(rgba(a), rgba(b))

/** A block of the theme file (`@custom-variant dark { ... }`, `@utility tint { ... }`), comments removed. Undefined when it is not there. */
export const themeBlock = (header: RegExp) => clean(theme).match(new RegExp(`${header.source}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0]

/** The `dark` variant the app compiles its `dark:` utilities from. */
export const darkVariant = themeBlock(/@custom-variant dark/)

/** What Tailwind emits for the candidates, from the dark variant plus `source` (a `@theme` or `@utility` text), normalised. */
export async function build(source: string, candidates: string[]) {
  const compiler = await compile(`${darkVariant}\n${source}\n@tailwind utilities;`)
  return normalise(compiler.build(candidates))
}
