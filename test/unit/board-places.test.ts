import { describe, expect, it } from 'vitest'
import { placeFromKey, placeKey, teamName } from '../../app/utils/board'
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
