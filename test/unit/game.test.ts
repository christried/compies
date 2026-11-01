import { describe, expect, it } from 'vitest'
import {
  CLIP_LENGTH_MAX, CLIP_LENGTH_MIN, CLIP_START_MAX, GAME_NAME_MAX, NO_FILTERS, SUITABILITIES, canEditGame, canSeeLibrary, clipTime, filterGames, gameNameProblem,
  isClipLength, parseClipLength, parseClipTime, parseGameInput, parsePlayerCount,
  type GameFilters, type GameView, type Suitability,
} from '../../shared/game'

describe('clipTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [72, '1:12'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [43_199, '11:59:59'],
  ])('writes %i s as %s', (seconds, text) => {
    expect(clipTime(seconds)).toBe(text)
  })

  it('rounds down fractions of a second', () => {
    expect(clipTime(72.9)).toBe('1:12')
  })
})

describe('parseClipTime', () => {
  it.each([
    ['72', 72],
    ['0', 0],
    ['1:12', 72],
    ['0:05', 5],
    ['1:2', 62],
    ['75:00', 4500],
    ['1:01:05', 3665],
    ['11:59:59', 43_199],
    ['  1:12 ', 72],
  ])('reads %j as %i seconds', (text, seconds) => {
    expect(parseClipTime(text)).toBe(seconds)
  })

  it.each([[''], ['   '], ['bald'], ['1:60'], ['1:12:60'], ['1:60:00'], ['-5'], ['1.5'], ['1:'], [':30'], ['1:2:3:4'], ['12:00:00'], ['43200']])('refuses %j', (text) => {
    expect(parseClipTime(text)).toBeNull()
  })
})

describe('canSeeLibrary', () => {
  it('lets Hosts and the Platform admin in', () => {
    expect(canSeeLibrary({ canHost: true, isAdmin: false })).toBe(true)
    expect(canSeeLibrary({ canHost: false, isAdmin: true })).toBe(true)
  })

  it('keeps out Members without rights and signed-out visitors', () => {
    expect(canSeeLibrary({ canHost: false, isAdmin: false })).toBe(false)
    expect(canSeeLibrary(null)).toBe(false)
  })
})

describe('canEditGame', () => {
  const game = { createdBy: 'u1' }

  it('lets the creator and the Platform admin edit', () => {
    expect(canEditGame({ id: 'u1', isAdmin: false }, game)).toBe(true)
    expect(canEditGame({ id: 'u9', isAdmin: true }, game)).toBe(true)
  })

  it('keeps every other User out', () => {
    expect(canEditGame({ id: 'u2', isAdmin: false }, game)).toBe(false)
  })
})

// The rules the form and the server share (#171): one set of numbers and one name check, tested once here.
describe('parsePlayerCount', () => {
  it.each([['1', 1], ['99', 99], [' 12 ', 12], ['007', 7]])('reads %j as %i', (text, players) => {
    expect(parsePlayerCount(text)).toBe(players)
  })

  it.each([['0'], ['100'], ['1.5'], ['abc'], ['-1'], ['1e1'], [''], ['   ']])('refuses %j', (text) => {
    expect(parsePlayerCount(text)).toBeNull()
  })
})

describe('clip length', () => {
  it.each([[CLIP_LENGTH_MIN], [30], [CLIP_LENGTH_MAX]])('accepts %i seconds', (seconds) => {
    expect(isClipLength(seconds)).toBe(true)
  })

  it.each([[CLIP_LENGTH_MIN - 1], [CLIP_LENGTH_MAX + 1], [30.5], ['30'], [null], [undefined]])('refuses %j', (seconds) => {
    expect(isClipLength(seconds)).toBe(false)
  })

  it.each([['5', 5], [' 60 ', 60], ['030', 30]])('reads %j as %i seconds', (text, seconds) => {
    expect(parseClipLength(text)).toBe(seconds)
  })

  it.each([[''], ['4'], ['61'], ['30.5'], ['1e1'], ['bald']])('refuses %j', (text) => {
    expect(parseClipLength(text)).toBeNull()
  })
})

describe('gameNameProblem', () => {
  it.each([[''], ['   ']])('says the name is empty for %j', (name) => {
    expect(gameNameProblem(name)).toBe('empty')
  })

  it('says the name is too long past GAME_NAME_MAX, counting an emoji as one character', () => {
    expect(gameNameProblem('a'.repeat(GAME_NAME_MAX))).toBeNull()
    expect(gameNameProblem('a'.repeat(GAME_NAME_MAX + 1))).toBe('too_long')
    expect(gameNameProblem('🎮'.repeat(GAME_NAME_MAX))).toBeNull()
    expect(gameNameProblem('🎮'.repeat(GAME_NAME_MAX + 1))).toBe('too_long')
  })

  it('does not count surrounding spaces', () => {
    expect(gameNameProblem(`${' '.repeat(5)}${'a'.repeat(GAME_NAME_MAX)}${' '.repeat(5)}`)).toBeNull()
  })
})

describe('parseGameInput', () => {
  const valid = { name: 'Mario Kart' }

  describe('name', () => {
    it('is trimmed', () => {
      expect(parseGameInput({ name: '  Mario Kart  ' })).toMatchObject({ ok: true, game: { name: 'Mario Kart' } })
    })

    it('counts an emoji as one character', () => {
      expect(parseGameInput({ name: '🎮'.repeat(60) })).toMatchObject({ ok: true })
      expect(parseGameInput({ name: '🎮'.repeat(61) })).toEqual({ ok: false, error: 'invalid_game_name' })
    })

    it('allows 60 characters, not 61', () => {
      expect(parseGameInput({ name: 'a'.repeat(GAME_NAME_MAX) })).toMatchObject({ ok: true })
      expect(parseGameInput({ name: 'a'.repeat(GAME_NAME_MAX + 1) })).toEqual({ ok: false, error: 'invalid_game_name' })
    })

    it.each([[''], ['   '], [undefined], [null], [42]])('refuses %j', (name) => {
      expect(parseGameInput({ name })).toEqual({ ok: false, error: 'invalid_game_name' })
    })

    it.each([[null], [undefined], ['text'], [[]]])('refuses a body that is %j', (body) => {
      expect(parseGameInput(body)).toEqual({ ok: false, error: 'invalid_game_name' })
    })
  })

  describe('YouTube link', () => {
    it.each([[undefined], [null], ['']])('gives a game without a clip for %j', (youtubeUrl) => {
      expect(parseGameInput({ ...valid, youtubeUrl })).toEqual({
        ok: true,
        game: { name: 'Mario Kart', youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], notes: null },
      })
    })

    it('stores the video id of a link', () => {
      expect(parseGameInput({ ...valid, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5' })).toMatchObject({
        ok: true,
        game: { youtubeId: 'dQw4w9WgXcQ' },
      })
    })

    it.each([['https://vimeo.com/123456789'], ['not a link'], [42]])('refuses %j', (youtubeUrl) => {
      expect(parseGameInput({ ...valid, youtubeUrl })).toEqual({ ok: false, error: 'invalid_youtube' })
    })
  })

  describe('clip', () => {
    it('defaults to start 0 and 30 seconds', () => {
      expect(parseGameInput(valid)).toMatchObject({ ok: true, game: { clipStart: 0, clipLength: 30 } })
    })

    it('takes a start and a length', () => {
      expect(parseGameInput({ ...valid, clipStart: 72, clipLength: 45 })).toMatchObject({ ok: true, game: { clipStart: 72, clipLength: 45 } })
    })

    it('allows the edges of both ranges', () => {
      expect(parseGameInput({ ...valid, clipStart: 0, clipLength: CLIP_LENGTH_MIN })).toMatchObject({ ok: true })
      expect(parseGameInput({ ...valid, clipStart: CLIP_START_MAX, clipLength: CLIP_LENGTH_MAX })).toMatchObject({ ok: true })
    })

    it.each([
      [{ clipStart: -1 }],
      [{ clipStart: CLIP_START_MAX + 1 }],
      [{ clipStart: 1.5 }],
      [{ clipStart: '72' }],
      [{ clipStart: null }],
      [{ clipLength: CLIP_LENGTH_MIN - 1 }],
      [{ clipLength: CLIP_LENGTH_MAX + 1 }],
      [{ clipLength: 30.5 }],
      [{ clipLength: '30' }],
    ])('refuses %j', (clip) => {
      expect(parseGameInput({ ...valid, ...clip })).toEqual({ ok: false, error: 'invalid_clip' })
    })
  })

  describe('player count (#142)', () => {
    it.each([
      [{ playersMin: 2, playersMax: 10 }, 2, 10],
      [{ playersMin: 2 }, 2, null],
      [{ playersMax: 10 }, null, 10],
      [{ playersMin: null, playersMax: 10 }, null, 10],
      [{ playersMin: 1, playersMax: 1 }, 1, 1],
      [{ playersMin: 1, playersMax: 99 }, 1, 99],
      [{}, null, null],
    ])('reads %j as %s to %s', (fields, min, max) => {
      expect(parseGameInput({ ...valid, ...fields })).toMatchObject({ ok: true, game: { playersMin: min, playersMax: max } })
    })

    it.each([
      [{ playersMin: 0 }],
      [{ playersMax: 100 }],
      [{ playersMin: 2.5 }],
      [{ playersMax: '10' }],
      [{ playersMin: 5, playersMax: 4 }],
    ])('refuses %j with invalid_players', (fields) => {
      expect(parseGameInput({ ...valid, ...fields })).toEqual({ ok: false, error: 'invalid_players' })
    })
  })

  describe('Suitabilities (#171)', () => {
    it('stores no Suitability when none is sent', () => {
      expect(parseGameInput(valid)).toMatchObject({ ok: true, game: { suitabilities: [] } })
    })

    it.each([
      [[]],
      [['teams']],
      [['ffa']],
      [['one_v_one']],
      [['teams', 'ffa']],
      [['teams', 'one_v_one']],
      [['ffa', 'one_v_one']],
      [['teams', 'ffa', 'one_v_one']],
    ])('stores %j as sent', (suitabilities) => {
      expect(parseGameInput({ ...valid, suitabilities })).toMatchObject({ ok: true, game: { suitabilities } })
    })

    it('stores the Suitabilities in SUITABILITIES order, whatever the order sent', () => {
      expect(parseGameInput({ ...valid, suitabilities: ['one_v_one', 'ffa', 'teams'] })).toMatchObject({ ok: true, game: { suitabilities: ['teams', 'ffa', 'one_v_one'] } })
      expect(SUITABILITIES).toEqual(['teams', 'ffa', 'one_v_one'])
    })

    it.each([
      [['teams', 'teams']],
      [['one_v_one', 'one_v_one']],
      [['wild']],
      [['one-v-one']],
      ['teams'],
      [null],
      [[1]],
    ])('refuses %j with invalid_suitabilities', (suitabilities) => {
      expect(parseGameInput({ ...valid, suitabilities })).toEqual({ ok: false, error: 'invalid_suitabilities' })
    })
  })
})

describe('filterGames (#173)', () => {
  function game(name: string, overrides: Partial<GameView> = {}): GameView {
    return {
      id: name,
      name,
      imageUrl: null,
      youtubeId: null,
      clipStart: 0,
      clipLength: 30,
      playersMin: null,
      playersMax: null,
      suitabilities: [],
      createdBy: { id: 'me', name: 'Ich' },
      createdAt: '2026-01-15T10:00:00.000Z',
      canEdit: true,
      notes: null,
      ...overrides,
    }
  }

  // Five games: names, counts and Suitabilities chosen so every filter has something to keep and something to drop.
  const mario = game('Mario Kart', { playersMin: 1, playersMax: 12, suitabilities: ['teams', 'ffa'] })
  const counter = game('Counter-Strike 2', { playersMin: 2, playersMax: 10, suitabilities: ['teams'] })
  const halo = game('Halo', { playersMax: 4, suitabilities: ['ffa'] })
  const open = game('Offen', { playersMin: 6 })
  const board = game('Brettspiel', { createdBy: { id: 'other', name: 'Anna' } })
  const library = [mario, counter, halo, open, board]

  const by = (filters: Partial<GameFilters>, viewerId = 'me') => filterGames(library, { ...NO_FILTERS, ...filters }, viewerId).map(found => found.name)

  it('keeps every game without filters, in the given order', () => {
    expect(by({})).toEqual(['Mario Kart', 'Counter-Strike 2', 'Halo', 'Offen', 'Brettspiel'])
  })

  it('keeps the games whose name contains the search, ignoring case and surrounding spaces', () => {
    expect(by({ q: 'mario' })).toEqual(['Mario Kart'])
    expect(by({ q: ' KART ' })).toEqual(['Mario Kart'])
    expect(by({ q: '  ' })).toHaveLength(5)
  })

  it('reads % and _ in the search as plain characters', () => {
    const named = [game('Rocket 100%'), game('Rocket 1000'), game('Die_Siedler'), game('Die Siedler')]
    const found = (q: string) => filterGames(named, { ...NO_FILTERS, q }, 'me').map(item => item.name)

    expect(found('%')).toEqual(['Rocket 100%'])
    expect(found('_')).toEqual(['Die_Siedler'])
  })

  it('matches umlauts whatever their case', () => {
    const named = [game('Äpfel Spiel'), game('Würfeln')]
    const found = (q: string) => filterGames(named, { ...NO_FILTERS, q }, 'me').map(item => item.name)

    expect(found('ä')).toEqual(['Äpfel Spiel'])
    expect(found('Ä')).toEqual(['Äpfel Spiel'])
    expect(found('WÜR')).toEqual(['Würfeln'])
  })

  it('keeps the games whose recommended range covers the player count, open bounds included', () => {
    expect(by({ players: 3 })).toEqual(['Mario Kart', 'Counter-Strike 2', 'Halo'])
    expect(by({ players: 5 })).toEqual(['Mario Kart', 'Counter-Strike 2'])
    expect(by({ players: 11 })).toEqual(['Mario Kart', 'Offen'])
    expect(by({ players: 50 })).toEqual(['Offen'])
  })

  it('leaves out a game without any player count when the player count is filtered', () => {
    expect(by({ players: 3 })).not.toContain('Brettspiel')
  })

  it('keeps the games with the Suitability', () => {
    expect(by({ suitability: 'teams' })).toEqual(['Mario Kart', 'Counter-Strike 2'])
    expect(by({ suitability: 'ffa' })).toEqual(['Mario Kart', 'Halo'])
    expect(by({ suitability: 'one_v_one' as Suitability })).toEqual([])
  })

  it('keeps the games the viewer created with „Von mir“', () => {
    expect(by({ mine: true })).toEqual(['Mario Kart', 'Counter-Strike 2', 'Halo', 'Offen'])
    expect(by({ mine: true }, 'other')).toEqual(['Brettspiel'])
  })

  it('combines the filters with AND', () => {
    expect(by({ players: 3, suitability: 'teams', mine: true, q: 'counter' })).toEqual(['Counter-Strike 2'])
    expect(by({ players: 3, suitability: 'ffa', q: 'counter' })).toEqual([])
  })
})
