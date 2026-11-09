import { describe, expect, it } from 'vitest'
import {
  CLIP_LENGTH_MAX, CLIP_LENGTH_MIN, CLIP_START_MAX, GAME_NAME_MAX, NO_FILTERS, SUITABILITIES, canEditGame, canSeeLibrary, clipTime, filterGames, gameNameProblem,
  isClipLength, normaliseTag, parseClipLength, parseClipTime, parseGameInput, parsePlayerCount, parseTags, tagProblem,
  formatPriceAmount, parsePrice, parsePriceAmount, priceCheckedDay, priceLine, priceTakesAmount,
  type GameFilters, type GamePrice, type GameView, type Suitability,
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
      expect(parseGameInput({ ...valid, youtubeUrl })).toMatchObject({
        ok: true,
        game: { name: 'Mario Kart', youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], notes: null, priceChecked: false },
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

  describe('Tags (#335)', () => {
    it('leaves the Tags undefined when the body has none, so an edit keeps its own', () => {
      const parsed = parseGameInput(valid)
      expect(parsed).toMatchObject({ ok: true })
      expect(parsed.ok && parsed.game.tags).toBeUndefined()
    })

    it('stores the Tags normalised, in the order sent', () => {
      expect(parseGameInput({ ...valid, tags: ['  Co-op ', 'Battle   Royale'] })).toMatchObject({
        ok: true,
        game: { tags: [{ key: 'co-op', label: 'Co-op' }, { key: 'battle royale', label: 'Battle Royale' }] },
      })
    })

    it.each([
      [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']],
      [['x'.repeat(21)]],
      [['Co-op', 'co-op']],
      [['  ']],
      ['Co-op'],
      [null],
    ])('refuses %j with invalid_tags', (tags) => {
      expect(parseGameInput({ ...valid, tags })).toEqual({ ok: false, error: 'invalid_tags' })
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
      tags: [],
      price: null,
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

  describe('the Tag filter and the search over Tags (#336)', () => {
    const tag = (label: string) => ({ key: label.toLocaleLowerCase('de'), label })
    const found = (games: GameView[], filters: Partial<GameFilters>) => filterGames(games, { ...NO_FILTERS, ...filters }, 'me').map(item => item.name)

    const coop = game('Pandemie', { tags: [tag('Co-op'), tag('Retro')] })
    const kart = game('Kart Rennen', { tags: [tag('Retro')] })
    const bare = game('Schach')
    const tagged = [coop, kart, bare]

    it('NO_FILTERS carries no Tag', () => {
      expect(NO_FILTERS.tag).toBeNull()
      expect(NO_FILTERS).toEqual({ q: '', players: null, suitability: null, tag: null, mine: false })
    })

    it('keeps the games carrying the Tag key, in the given order, and any one of several Tags does', () => {
      expect(found(tagged, { tag: 'retro' })).toEqual(['Pandemie', 'Kart Rennen'])
      expect(found(tagged, { tag: 'co-op' })).toEqual(['Pandemie'])
    })

    it('drops a game without Tags under a Tag filter, and an unknown key keeps nothing', () => {
      expect(found(tagged, { tag: 'retro' })).not.toContain('Schach')
      expect(found(tagged, { tag: 'nie-da' })).toEqual([])
    })

    it('compares the Tag by key: the label spelling as filter keeps nothing', () => {
      const spelled = [game('Pandemie', { tags: [{ key: 'co-op', label: 'CO-OP' }] })]

      expect(found(spelled, { tag: 'co-op' })).toEqual(['Pandemie'])
      expect(found(spelled, { tag: 'CO-OP' })).toEqual([])
    })

    it('combines the Tag with the search and the other filters with AND', () => {
      expect(found(tagged, { tag: 'retro', q: 'kart' })).toEqual(['Kart Rennen'])
      expect(found(tagged, { tag: 'retro', q: 'schach' })).toEqual([])
      expect(found([...tagged, game('Retro Halo', { tags: [tag('Retro')], playersMin: 2, playersMax: 4 })], { tag: 'retro', players: 3 })).toEqual(['Retro Halo'])
    })

    it('matches the search text against a Tag label, whatever the case, the spaces and the umlauts', () => {
      const brettspiel = [game('Brettspiel', { tags: [{ key: 'kurz', label: 'Zeitsparend' }] })]

      expect(found(brettspiel, { q: 'zeitspar' })).toEqual(['Brettspiel'])
      expect(found(brettspiel, { q: 'ZEITSPAR' })).toEqual(['Brettspiel'])
      expect(found(brettspiel, { q: ' zeit ' })).toEqual(['Brettspiel'])
      expect(found([game('Brettspiel', { tags: [{ key: 'ärger', label: 'Ärger' }] })], { q: 'ärger' })).toEqual(['Brettspiel'])
    })

    it('does not match the search text against a Tag key, only the label', () => {
      const brettspiel = [game('Brettspiel', { tags: [{ key: 'kurz', label: 'Zeitsparend' }] })]

      expect(found(brettspiel, { q: 'kurz' })).toEqual([])
    })

    it('still matches names when a game carries Tags, and reads % in a Tag label as a plain character', () => {
      const withPercent = [game('Rocket', { tags: [{ key: '100%', label: '100%' }] }), game('Halo', { tags: [tag('Retro')] })]

      expect(found(withPercent, { q: 'rocket' })).toEqual(['Rocket'])
      expect(found(withPercent, { q: '%' })).toEqual(['Rocket'])
      expect(found(withPercent, { q: '1000' })).toEqual([])
    })

    it('reads search and Tag over the same list in the same order, and a game with no Tags is never found through a label', () => {
      expect(found(tagged, { q: 'retro' })).toEqual(['Pandemie', 'Kart Rennen'])
      expect(found(tagged, { q: 'retro', tag: 'retro' })).toEqual(['Pandemie', 'Kart Rennen'])
      expect(found([game('Leer', { tags: [] })], { q: 'retro' })).toEqual([])
    })
  })
})

describe('normaliseTag (#335)', () => {
  it('gives one key to the three spellings and keeps each label as typed', () => {
    expect(normaliseTag(' Co-op ')).toEqual({ key: 'co-op', label: 'Co-op' })
    expect(normaliseTag('co-op')).toEqual({ key: 'co-op', label: 'co-op' })
    expect(normaliseTag('CO-OP')).toEqual({ key: 'co-op', label: 'CO-OP' })
  })

  it('collapses inner whitespace to one space', () => {
    expect(normaliseTag('Battle \t  Royale')).toEqual({ key: 'battle royale', label: 'Battle Royale' })
  })

  it('composes to NFC, so a letter and its accent mark are one Tag', () => {
    const composed = normaliseTag('Caf\u00e9')
    const decomposed = normaliseTag('Cafe\u0301')
    expect(decomposed?.key).toBe('caf\u00e9')
    expect(decomposed).toEqual(composed)
    expect(decomposed?.label).toBe('Caf\u00e9')
  })

  it('lower-cases umlauts', () => {
    expect(normaliseTag('\u00c4RGER')?.key).toBe('\u00e4rger')
  })

  it.each([[''], ['   '], [' \t'], ['\u00a0']])('gives nothing for %j', (raw) => {
    expect(normaliseTag(raw)).toBeNull()
  })
})

describe('tagProblem (#335)', () => {
  const flag = '\u{1F1E9}\u{1F1EA}'

  it('counts characters as the User sees them: 20 flags pass, 21 do not', () => {
    expect(tagProblem(flag.repeat(20))).toBeNull()
    expect(tagProblem(flag.repeat(21))).toBe('too_long')
  })

  it('lets 20 letters pass and refuses 21', () => {
    expect(tagProblem('a'.repeat(20))).toBeNull()
    expect(tagProblem('a'.repeat(21))).toBe('too_long')
  })

  it('does not count the spaces around the Tag', () => {
    expect(tagProblem(' ' + 'a'.repeat(20) + ' ')).toBeNull()
  })

  it('calls a Tag of spaces empty', () => {
    expect(tagProblem('  ')).toBe('empty')
  })
})

describe('parseTags (#335)', () => {
  const flag = '\u{1F1E9}\u{1F1EA}'

  it('takes an empty list', () => {
    expect(parseTags([])).toEqual([])
  })

  it('keeps the order sent', () => {
    expect(parseTags(['Retro', 'Co-op', 'Party'])?.map(tag => tag.label)).toEqual(['Retro', 'Co-op', 'Party'])
  })

  it('takes 8 Tags and refuses 9', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    expect(parseTags(names.slice(0, 8))).toHaveLength(8)
    expect(parseTags(names)).toBeUndefined()
  })

  it('refuses two spellings of one key', () => {
    expect(parseTags(['Co-op', 'CO-OP'])).toBeUndefined()
  })

  it.each([[['']], [['  ']], [[42]], ['Co-op'], [null], [undefined]])('refuses %j', (raw) => {
    expect(parseTags(raw)).toBeUndefined()
  })

  it('takes a Tag of 20 flags and refuses 21', () => {
    expect(parseTags([flag.repeat(20)])).toHaveLength(1)
    expect(parseTags([flag.repeat(21)])).toBeUndefined()
  })
})

describe('parsePriceAmount (#337)', () => {
  it.each([
    ['19,99', 1999],
    ['19.99', 1999],
    ['20', 2000],
    ['19,9', 1990],
    ['0,01', 1],
    ['0,05', 5],
    ['999,99', 99_999],
    [' 19,99 ', 1999],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parsePriceAmount(text)).toBe(cents)
  })

  it.each(['0', '0,00', '1000', '1000,00', 'abc', '', '19,999', '19,', '-5', '1,2,3', '€ 5', '١٩'])('refuses %j', (text) => {
    expect(parsePriceAmount(text)).toBeNull()
  })
})

describe('formatPriceAmount (#337)', () => {
  it.each([
    [1999, '19,99'],
    [2000, '20,00'],
    [1, '0,01'],
    [5, '0,05'],
    [99_999, '999,99'],
  ])('writes %i as %j', (cents, text) => {
    expect(formatPriceAmount(cents)).toBe(text)
  })
})

describe('priceTakesAmount (#337)', () => {
  it.each(['steam', 'epic', 'gog', 'publisher', 'steam_key'] as const)('takes an amount for %s', (source) => {
    expect(priceTakesAmount(source)).toBe(true)
  })

  it.each(['free_to_play', 'subscription'] as const)('takes no amount for %s', (source) => {
    expect(priceTakesAmount(source)).toBe(false)
  })
})

describe('parsePrice (#337)', () => {
  it('reads no Price as no Price', () => {
    expect(parsePrice(null)).toBeNull()
  })

  it('reads a paid Price as it is', () => {
    expect(parsePrice({ cents: 1999, source: 'steam' })).toEqual({ cents: 1999, source: 'steam' })
  })

  it.each([{ source: 'free_to_play' }, { cents: null, source: 'subscription' }])('reads %j as a source without an amount', (raw) => {
    expect(parsePrice(raw)).toEqual({ cents: null, source: raw.source })
  })

  it.each([[{ cents: null, source: null }], [{}], [{ source: null }], [{ cents: null }]])('reads %j as no Price', (raw) => {
    expect(parsePrice(raw)).toBeNull()
  })

  it.each([
    [{ cents: 1999, source: null }],
    [{ cents: 1999 }],
    [{ cents: 500, source: 'free_to_play' }],
    [{ cents: 500, source: 'subscription' }],
    [{ cents: null, source: 'steam' }],
    [{ cents: 0, source: 'steam' }],
    [{ cents: 100_000, source: 'steam' }],
    [{ cents: 19.5, source: 'steam' }],
    [{ cents: '1999', source: 'steam' }],
    [{ cents: -1, source: 'steam' }],
    [{ cents: 1999, source: 'amazon' }],
    ['steam'],
    [42],
    [[]],
  ])('refuses %j', (raw) => {
    expect(parsePrice(raw)).toBeUndefined()
  })
})

describe('priceCheckedDay (#337)', () => {
  it('writes the Berlin day in full', () => {
    expect(priceCheckedDay('2026-11-03T10:00:00.000Z')).toBe('3. November 2026')
  })

  it('takes the Berlin day, so an instant just before midnight UTC is the next day', () => {
    expect(priceCheckedDay('2026-11-02T23:30:00.000Z')).toBe('3. November 2026')
  })
})

describe('priceLine (#337)', () => {
  const now = new Date('2026-11-09T12:00:00.000Z')
  const checkedAt = '2026-11-03T10:00:00.000Z'

  it.each<[GamePrice['cents'], GamePrice['source'], string]>([
    [1999, 'steam', '19,99 € bei Steam · Stand 3. Nov.'],
    [2000, 'epic', '20,00 € bei Epic Games Store · Stand 3. Nov.'],
    [1999, 'gog', '19,99 € bei GOG · Stand 3. Nov.'],
    [1999, 'publisher', '19,99 € bei Publisher-Website · Stand 3. Nov.'],
    [1999, 'steam_key', '19,99 € bei Steam-Key · Stand 3. Nov.'],
    [null, 'free_to_play', 'Free-to-play · Stand 3. Nov.'],
    [null, 'subscription', 'Abo · Stand 3. Nov.'],
  ])('writes %s with the amount %s', (cents, source, text) => {
    expect(priceLine({ cents, source, checkedAt }, now)).toBe(text)
  })

  it('appends the year when the day was checked in another year', () => {
    expect(priceLine({ cents: 1999, source: 'steam', checkedAt: '2025-11-03T10:00:00.000Z' }, now)).toBe('19,99 € bei Steam · Stand 3. Nov. 2025')
  })

  it('takes the Berlin day, so an instant just before midnight UTC is the next day', () => {
    expect(priceLine({ cents: 1999, source: 'steam', checkedAt: '2026-11-02T23:30:00.000Z' }, now)).toBe('19,99 € bei Steam · Stand 3. Nov.')
  })

  it('compares the Berlin years: New Year in Berlin is the new year, whatever UTC says', () => {
    const newYear = '2025-12-31T23:30:00.000Z'
    expect(priceLine({ cents: null, source: 'subscription', checkedAt: newYear }, new Date('2026-06-01T10:00:00.000Z'))).toBe('Abo · Stand 1. Jan.')
    expect(priceLine({ cents: null, source: 'subscription', checkedAt: newYear }, new Date('2025-12-31T12:00:00.000Z'))).toBe('Abo · Stand 1. Jan. 2026')
  })
})

describe('parseGameInput Price (#337)', () => {
  const valid = { name: 'Mario Kart' }

  it('leaves the Price undefined and the flag false when the body has neither', () => {
    const parsed = parseGameInput(valid)
    expect(parsed.ok && parsed.game.price).toBeUndefined()
    expect(parsed.ok && parsed.game.priceChecked).toBe(false)
  })

  it('reads a null Price as no Price', () => {
    expect(parseGameInput({ ...valid, price: null })).toMatchObject({ ok: true, game: { price: null } })
  })

  it('reads a Price and the flag', () => {
    expect(parseGameInput({ ...valid, price: { cents: 1999, source: 'steam' }, priceChecked: true })).toMatchObject({
      ok: true,
      game: { price: { cents: 1999, source: 'steam' }, priceChecked: true },
    })
  })

  it('reads a false flag as not checked', () => {
    expect(parseGameInput({ ...valid, priceChecked: false })).toMatchObject({ ok: true, game: { priceChecked: false } })
  })

  it.each([
    [{ price: { cents: 1999, source: null } }],
    [{ price: { cents: 1999 } }],
    [{ price: 'steam' }],
    [{ price: { cents: 500, source: 'free_to_play' } }],
    [{ priceChecked: 'yes' }],
    [{ price: { cents: 1999, source: 'steam' }, priceChecked: 'yes' }],
  ])('refuses %j with invalid_price', (body) => {
    expect(parseGameInput({ ...valid, ...body })).toEqual({ ok: false, error: 'invalid_price' })
  })
})
