import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TEAM_COUNT_MAX as settingsMax } from '../../shared/settings'
import { TEAM_COUNT_MAX, teamPosition } from '../../shared/team-position'
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

  it('is the same TEAM_COUNT_MAX the settings rules read (#366)', () => {
    expect(settingsMax).toBe(TEAM_COUNT_MAX)
  })
})

// The clamp is a leaf (#366, review 0.10 Q13): the Share renderer's data modules reach nothing but this file, so `settings.ts` and what it
// imports (`phase`, `board`, `record`) stay out of the Share image's graph.
describe('the clamp stays a leaf (#366)', () => {
  const shared = resolve(fileURLToPath(new URL('../../shared/', import.meta.url)))
  const leafPath = resolve(fileURLToPath(new URL('../../shared/team-position.ts', import.meta.url)))
  const colorsPath = resolve(fileURLToPath(new URL('../../shared/team-colors.ts', import.meta.url)))
  const marksPath = resolve(fileURLToPath(new URL('../../shared/team-marks.ts', import.meta.url)))

  /** The shared files a file imports by relative path, followed through the shared files themselves. */
  function sharedImports(file: string, found = new Set<string>()): Set<string> {
    const source = readFileSync(file, 'utf8')
    for (const [, specifier] of source.matchAll(/from '(\.[^']+)'/g)) {
      const path = `${resolve(file, '..', specifier!)}.ts`
      if (!path.startsWith(shared) || found.has(path)) continue
      found.add(path)
      sharedImports(path, found)
    }
    return found
  }

  it('imports nothing', () => {
    expect(readFileSync(leafPath, 'utf8')).not.toMatch(/^\s*import\b|\bfrom\s+['"]/m)
  })

  it('is the only shared file the Share renderer data modules reach', () => {
    expect([...sharedImports(colorsPath)]).toEqual([leafPath])
    expect([...sharedImports(marksPath)]).toEqual([leafPath])
  })
})
