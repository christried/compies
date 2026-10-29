import { describe, expect, it } from 'vitest'
import { placeFromKey, placeKey, placeOfMember, teamName } from '../../app/utils/board'
import de from '../../i18n/locales/de.json'

// The Game board's places as the client names them (#160): the Member row to a place, the zone key in the DOM and back,
// and the name of a team before it has a Team word.
function t(key: string, named: Record<string, unknown> = {}): string {
  const template = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], de) as string
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name]))
}

describe('placeOfMember', () => {
  it('reads the zone and, for a team, its position', () => {
    expect(placeOfMember({ zone: 'bench', team: null })).toEqual({ zone: 'bench' })
    expect(placeOfMember({ zone: 'stands', team: null })).toEqual({ zone: 'stands' })
    expect(placeOfMember({ zone: 'team', team: 3 })).toEqual({ zone: 'team', team: 3 })
  })
})

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
