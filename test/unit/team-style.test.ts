import { describe, expect, it } from 'vitest'
import { teamSurfaceStyle, teamVar } from '../../app/utils/team-style'

// The Team colour as CSS (#328): one place spells `--cp-team-N`, its `-pattern` and its `-ink`, so every surface reads the same tokens.

describe('a Team colour token', () => {
  it('spells the colour, its pattern and its ink', () => {
    expect(teamVar(3)).toBe('var(--cp-team-3)')
    expect(teamVar(3, 'pattern')).toBe('var(--cp-team-3-pattern)')
    expect(teamVar(3, 'ink')).toBe('var(--cp-team-3-ink)')
  })
})

describe('a surface in a Team colour', () => {
  it('is the colour, its pattern over it and the ink for the text on it', () => {
    expect(teamSurfaceStyle(6)).toEqual({
      backgroundColor: 'var(--cp-team-6)',
      backgroundImage: 'var(--cp-team-6-pattern)',
      color: 'var(--cp-team-6-ink)',
    })
  })
})
