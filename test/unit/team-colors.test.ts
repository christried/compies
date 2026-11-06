import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TEAM_COLORS, teamColor } from '../../shared/team-colors'

// The Share image draws in a fixed light look from a hex table; the tokens stay the source (#313).
const tokens = readFileSync(new URL('../../app/assets/css/compies-tokens.css', import.meta.url), 'utf8')

function token(name: string): string {
  const value = new RegExp(`--cp-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(tokens)?.[1]
  if (!value) throw new Error(`token ${name} not found`)
  return value.toLowerCase()
}

describe('TEAM_COLORS', () => {
  it('has the eight Team colours', () => {
    expect(TEAM_COLORS).toHaveLength(8)
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('equals the tokens of team %i', (position) => {
    expect(TEAM_COLORS[position - 1]).toEqual({ fill: token(`team-${position}`), ink: token(`team-${position}-ink`) })
  })
})

describe('teamColor', () => {
  it('reads a position as the table does', () => {
    expect(teamColor(3)).toEqual(TEAM_COLORS[2])
  })

  it('clamps to 1..8 as TeamMark does', () => {
    expect(teamColor(0)).toEqual(TEAM_COLORS[0])
    expect(teamColor(9)).toEqual(TEAM_COLORS[7])
    expect(teamColor(2.6)).toEqual(TEAM_COLORS[2])
  })
})
