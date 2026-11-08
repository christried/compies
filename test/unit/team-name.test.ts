import { describe, expect, it } from 'vitest'
import { teamDisplayName } from '../../shared/team-name'

// The one rule of the name a team is shown with (#161, #329): its own Team name, else the colour's name („Team Rot“). The app's `teamName`
// (vue-i18n's t) and the Share image's model on the server (its carried copy) both read it; share-image.test.ts holds them equal.

const copy = {
  defaultName: (color: string) => `Team ${color}`,
  colorName: (position: number) => ['Rot', 'Orange', 'Gelb', 'Blau', 'Grün', 'Dunkelblau', 'Rosa', 'Lila'][position - 1] ?? '',
}

describe('teamDisplayName', () => {
  it('shows the Team name when the team has one', () => {
    expect(teamDisplayName('Die Füchse', 2, copy)).toBe('Die Füchse')
  })

  it('falls back to the colour\'s name without one', () => {
    expect(teamDisplayName(null, 2, copy)).toBe('Team Orange')
    expect(teamDisplayName(undefined, 8, copy)).toBe('Team Lila')
  })

  it('treats an empty or blank name as none', () => {
    expect(teamDisplayName('', 1, copy)).toBe('Team Rot')
    expect(teamDisplayName('   ', 4, copy)).toBe('Team Blau')
  })

  it('keeps the name as given, untrimmed, when it has content', () => {
    expect(teamDisplayName(' Füchse ', 1, copy)).toBe(' Füchse ')
  })
})
