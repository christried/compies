import { describe, expect, it } from 'vitest'
import { parseGameSort, sortGames, type GameView } from '../../shared/game'

// The order of the game browser's list (#901): „Name“ is the list as it comes, „Lange nicht gespielt“ sorts by the Berlin day of the
// latest Result (`lastPlayed`, #900), never played first. The day is Berlin's (ADR 0003): a tie of one day keeps the list's order.

function game(name: string, overrides: Partial<GameView> = {}): GameView {
  return {
    id: `id-${name}`,
    name,
    imageUrl: null,
    youtubeId: null,
    clipStart: 0,
    clipLength: 30,
    playersMin: null,
    playersMax: null,
    suitabilities: [],
    updatedAt: '2026-01-15T10:00:00.000Z',
    notes: null,
    tags: [],
    archived: false,
    price: null,
    ...overrides,
  }
}

const names = (games: GameView[]) => games.map(item => item.name)

describe('sortGames (#901)', () => {
  it('keeps the list as it comes for „Name“ and does not change the input', () => {
    const list = [game('C'), game('A'), game('B')]
    const sorted = sortGames(list, 'name', { [game('A').id]: '2026-11-05T10:00:00.000Z' })

    expect(names(sorted)).toEqual(['C', 'A', 'B'])
    expect(names(list)).toEqual(['C', 'A', 'B'])
  })

  it('puts the never played games first in the list\'s order, then the played ones by day, oldest first', () => {
    const list = [game('A'), game('B'), game('C'), game('D')]
    const lastPlayed = {
      [game('A').id]: '2026-11-05T10:00:00.000Z',
      [game('C').id]: '2026-11-01T10:00:00.000Z',
    }

    expect(names(sortGames(list, 'last_played', lastPlayed))).toEqual(['B', 'D', 'C', 'A'])
  })

  it('keeps the list\'s order for games of the same Berlin day, whatever the hour says', () => {
    // 3 Nov 09:00 and 2 Nov 23:30 UTC are both 3 Nov in Berlin (UTC+1 in November): A stays ahead of B although B's instant is earlier.
    const list = [game('A'), game('B')]
    const lastPlayed = {
      [game('A').id]: '2026-11-03T08:00:00.000Z',
      [game('B').id]: '2026-11-02T23:30:00.000Z',
    }

    expect(names(sortGames(list, 'last_played', lastPlayed))).toEqual(['A', 'B'])
    expect(names(sortGames([game('B'), game('A')], 'last_played', lastPlayed))).toEqual(['B', 'A'])
  })

  it('cuts the day at Berlin midnight, not at UTC midnight (winter and summer)', () => {
    // 22:59 UTC on 2 Nov is 23:59 on 2 Nov in Berlin; 23:00 UTC is 00:00 on 3 Nov: the later instant is the later day, even listed first.
    const first = game('first')
    const second = game('second')
    const winter = {
      [first.id]: '2026-11-02T22:59:00.000Z',
      [second.id]: '2026-11-02T23:00:00.000Z',
    }
    expect(names(sortGames([second, first], 'last_played', winter))).toEqual(['first', 'second'])

    // Summer (UTC+2): 22:30 UTC on 1 Jul is 00:30 on 2 Jul in Berlin, after 21:30 UTC on 1 Jul (23:30 on 1 Jul).
    const later = game('later')
    const earlier = game('earlier')
    const summer = {
      [later.id]: '2026-07-01T22:30:00.000Z',
      [earlier.id]: '2026-07-01T21:30:00.000Z',
    }
    expect(names(sortGames([later, earlier], 'last_played', summer))).toEqual(['earlier', 'later'])
  })

  it('compares the years too: 30 Dec 2025 comes before 2 Jan 2026, and one date in two years is two days', () => {
    const old = game('old')
    const newer = game('newer')
    const yearly = {
      [newer.id]: '2026-01-02T10:00:00.000Z',
      [old.id]: '2025-12-30T10:00:00.000Z',
    }
    expect(names(sortGames([newer, old], 'last_played', yearly))).toEqual(['old', 'newer'])

    const twoYears = game('2024')
    const twoYearsLater = game('2025')
    const sameDate = {
      [twoYearsLater.id]: '2025-03-01T10:00:00.000Z',
      [twoYears.id]: '2024-03-01T10:00:00.000Z',
    }
    expect(names(sortGames([twoYearsLater, twoYears], 'last_played', sameDate))).toEqual(['2024', '2025'])
  })

  it('handles the edges: an empty list, one game, no played game at all, one day for every game', () => {
    expect(sortGames([], 'last_played', {})).toEqual([])
    expect(names(sortGames([game('solo')], 'last_played', { [game('solo').id]: '2026-11-01T10:00:00.000Z' }))).toEqual(['solo'])

    // No Result in the answer (the previous deployment, or nothing played yet): the list keeps its order.
    expect(names(sortGames([game('C'), game('A'), game('B')], 'last_played', {}))).toEqual(['C', 'A', 'B'])

    const day = '2026-11-02T10:00:00.000Z'
    expect(names(sortGames([game('C'), game('A')], 'last_played', { [game('C').id]: day, [game('A').id]: day }))).toEqual(['C', 'A'])
  })

  it('ignores a key of a game that is not in the list', () => {
    const list = [game('A'), game('B')]

    expect(names(sortGames(list, 'last_played', { 'id-gone': '2026-11-01T10:00:00.000Z' }))).toEqual(['A', 'B'])
  })
})

describe('parseGameSort (#901)', () => {
  it('reads „last_played“ as itself and anything else as „name“', () => {
    expect(parseGameSort('last_played')).toBe('last_played')
    expect(parseGameSort('')).toBe('name')
    expect(parseGameSort('name')).toBe('name')
    expect(parseGameSort('bogus')).toBe('name')
    expect(parseGameSort(undefined)).toBe('name')
    expect(parseGameSort(['last_played'])).toBe('name')
  })
})
