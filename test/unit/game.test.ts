import { describe, expect, it } from 'vitest'
import { parseGameInput } from '../../server/domain/game'
import { CLIP_LENGTH_MAX, CLIP_LENGTH_MIN, CLIP_START_MAX, GAME_NAME_MAX, canEditGame, canSeeLibrary, clipTime, parseClipTime } from '../../shared/game'

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
        game: { name: 'Mario Kart', youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, formats: [] },
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

  describe('Formats (#142)', () => {
    it('stores no Format when none is sent', () => {
      expect(parseGameInput(valid)).toMatchObject({ ok: true, game: { formats: [] } })
    })

    it('stores the Formats in FORMATS order, whatever the order sent', () => {
      expect(parseGameInput({ ...valid, formats: ['ffa', 'teams'] })).toMatchObject({ ok: true, game: { formats: ['teams', 'ffa'] } })
      expect(parseGameInput({ ...valid, formats: ['teams', 'ffa'] })).toMatchObject({ ok: true, game: { formats: ['teams', 'ffa'] } })
    })

    it.each([
      [['teams', 'teams']],
      [['wild']],
      ['teams'],
      [null],
      [[1]],
    ])('refuses %j with invalid_formats', (formats) => {
      expect(parseGameInput({ ...valid, formats })).toEqual({ ok: false, error: 'invalid_formats' })
    })
  })
})
