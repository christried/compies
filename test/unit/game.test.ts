import { describe, expect, it } from 'vitest'
import { parseGameInput } from '../../server/domain/game'
import { CLIP_LENGTH_MAX, CLIP_LENGTH_MIN, CLIP_START_MAX, GAME_NAME_MAX, canEditGame, canSeeLibrary, clipTime } from '../../shared/game'

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
        game: { name: 'Mario Kart', youtubeId: null, clipStart: 0, clipLength: 30 },
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
})
