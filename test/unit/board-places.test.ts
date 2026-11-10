import { describe, expect, it } from 'vitest'
import { placeFromKey, placeKey, teamName, teamNameAt } from '../../app/utils/board'
import { parseTeamPosition } from '../../shared/board'
import de from '../../i18n/locales/de.json'

// The Game board's places as the client names them (#160): the zone key in the DOM and back,
// and the name of a team before it has a Team word.
function t(key: string, named: Record<string, unknown> = {}): string {
  const template = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], de) as string
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name]))
}

describe('placeKey and placeFromKey', () => {
  it('are each other\'s inverse for every place', () => {
    for (const place of [{ zone: 'bench' }, { zone: 'stands' }, { zone: 'team', team: 1 }, { zone: 'team', team: 8 }] as const) {
      expect(placeFromKey(placeKey(place))).toEqual(place)
    }
    expect(placeKey({ zone: 'team', team: 4 })).toBe('team-4')
  })

  it('knows no place for a key that is none', () => {
    expect(placeFromKey(undefined)).toBeNull()
    expect(placeFromKey('moon')).toBeNull()
    expect(placeFromKey('team-')).toBeNull()
    expect(placeFromKey('team-x')).toBeNull()
  })
})

describe('teamName', () => {
  it('names a team after its colour', () => {
    expect(teamName(1, t)).toBe('Team Rot')
    expect(teamName(8, t)).toBe('Team Nacht')
  })

  it('names a team with its Team name, and with its colour when the name is null', () => {
    expect(teamName({ position: 1, name: 'Wilde Gurken' }, t)).toBe('Wilde Gurken')
    expect(teamName({ position: 1, name: null }, t)).toBe('Team Rot')
  })
})

describe('teamNameAt', () => {
  // The name of a team by its position (#288): the Event's teams where the position has one, else the colour's name.
  const teams = [{ position: 1, name: 'Wilde Gurken' }, { position: 2, name: null }]

  it('names the team at a position with its Team name', () => {
    expect(teamNameAt(teams, 1, t)).toBe('Wilde Gurken')
  })

  it('names a team with a null name after its colour', () => {
    expect(teamNameAt(teams, 2, t)).toBe('Team Orange')
  })

  it('names a position that the teams lack after its colour', () => {
    expect(teamNameAt([], 3, t)).toBe('Team Gelb')
    expect(teamNameAt(teams.slice(0, 1), 3, t)).toBe('Team Gelb')
  })
})

describe('parseTeamPosition', () => {
  // The team position in a request path (N5): a whole number from 1; its range is the Event's team count.
  it('reads a whole number from 1', () => {
    expect(parseTeamPosition('1')).toBe(1)
    expect(parseTeamPosition('12')).toBe(12)
  })

  it('refuses zero, signs, decimals, words and the empty path with null', () => {
    for (const raw of ['0', '', '-1', '1.5', 'eins', ' 2']) expect(parseTeamPosition(raw), raw).toBeNull()
  })
})
