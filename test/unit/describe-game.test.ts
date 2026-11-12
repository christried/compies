import { describe, expect, it } from 'vitest'
import { describeGame } from '../../app/utils/describe-game'
import type { Suitability } from '../../shared/game'
import de from '~~/i18n/locales/de.json'

// The words for a game's player count and Suitabilities (D8): GameCard (compact) and the game page (spelled out).

/** vue-i18n's `t` for the real copy, with `{name}` placeholders. */
function t(key: string, named: Record<string, unknown> = {}): string {
  const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], de) as string
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name]))
}

const game = (playersMin: number | null, playersMax: number | null, suitabilities: Suitability[] = []) => ({ playersMin, playersMax, suitabilities })

describe('describeGame', () => {
  it('says nothing about a count the game does not have', () => {
    expect(describeGame(game(null, null), t)).toEqual({ players: null, playersCompact: null, suitabilities: null })
  })

  it.each([
    [2, 10, 'bis 10', 'bis 10'],
    [1, 10, 'bis 10', 'bis 10'],
    [2, 4, 'bis 4', 'bis 4'],
    [1, 4, 'bis 4', 'bis 4'],
    [2, null, null, null],
    [1, null, null, null],
    [3, null, 'ab 3', '3'],
    [3, 6, '3 bis 6', '3–6'],
    [null, 10, 'bis 10', '10'],
    [1, 1, '1 Spieler', '1'],
    [2, 2, '2 Spieler', '2'],
    [3, 3, '3 Spieler', '3'],
    [4, 4, '4 Spieler', '4'],
  ])('describes %j to %j players as „%s“, compact „%s“', (min, max, players, playersCompact) => {
    expect(describeGame(game(min, max), t)).toMatchObject({ players, playersCompact })
  })

  it('shows nothing for a minimum of 1 or 2 without a maximum, and keeps a minimum of 3 (#458)', () => {
    expect(describeGame(game(1, null), t)).toMatchObject({ players: null, playersCompact: null })
    expect(describeGame(game(2, null), t)).toMatchObject({ players: null, playersCompact: null })
    expect(describeGame(game(3, null), t)).toMatchObject({ players: 'ab 3', playersCompact: '3' })
  })

  it('lists the Suitabilities in the order given, comma-joined', () => {
    expect(describeGame(game(null, null, ['teams', 'ffa']), t).suitabilities).toBe('Teams, Jeder gegen jeden')
  })
})
