import { describe, expect, it } from 'vitest'
import { TEAM_COUNT_MAX, teamPosition } from '../../shared/settings'
import { TEAM_COLORS, teamColor } from '../../shared/team-colors'
import { TEAM_SYMBOLS, teamSymbol } from '../../shared/team-marks'

// One clamp of a Team position to 1..TEAM_COUNT_MAX (#329, review 0.9 S5): the colours, the symbols and TeamMark all read it.

describe('teamPosition', () => {
  it.each([
    [0, 1],
    [1, 1],
    [8, 8],
    [9, 8],
    [3.6, 4],
    [-2, 1],
  ])('clamps %s to %s', (position, expected) => {
    expect(teamPosition(position)).toBe(expected)
  })

  it('clamps to TEAM_COUNT_MAX, not a number of its own', () => {
    expect(teamPosition(100)).toBe(TEAM_COUNT_MAX)
  })

  it('is the clamp the colours and the symbols use', () => {
    expect(teamColor(9)).toBe(TEAM_COLORS[7])
    expect(teamColor(0)).toBe(TEAM_COLORS[0])
    expect(teamSymbol(9)).toBe(TEAM_SYMBOLS[7])
    expect(teamSymbol(2.5)).toBe(TEAM_SYMBOLS[2])
  })
})
