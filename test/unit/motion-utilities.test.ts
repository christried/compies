import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The seam is the stylesheet: jsdom cannot compute CSS or run a TransitionGroup move. Vue's TransitionGroup
// runs a move only when the move class has a transform transition, and it reads the type from the longer of
// the transition and animation timeouts; a tie goes to „animation“, so a `dur-*` that also set
// `animation-duration` made every move skip (#273).
const css = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-theme.css'), 'utf8')
const durRule = css.match(/@utility dur-\*\s*\{([^}]*)\}/)?.[1] ?? ''

describe('dur-* utility', () => {
  it('a list that reorders glides instead of jumping (Vue\'s TransitionGroup skips a move whose transition and animation timeouts tie, #273)', () => {
    expect(durRule).toMatch(/transition-duration:\s*--value\(--dur-\*\)/)
    expect(durRule).not.toMatch(/animation-duration/)
  })
})
