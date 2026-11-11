import { describe, expect, it } from 'vitest'
import { gameCover } from '../../app/utils/game-cover'

// The picture of a game, as a tile, a card and the game dialog show it (#443): the image, else the Clip's YouTube thumbnail, else none.

describe('gameCover (#443)', () => {
  it('is the uploaded image when there is one, with a Clip or without', () => {
    expect(gameCover({ imageUrl: '/api/images/a.webp', youtubeId: null })).toBe('/api/images/a.webp')
    expect(gameCover({ imageUrl: '/api/images/a.webp', youtubeId: 'dQw4w9WgXcQ' })).toBe('/api/images/a.webp')
  })

  it('is the Clip\'s thumbnail for a game without an image', () => {
    expect(gameCover({ imageUrl: null, youtubeId: 'dQw4w9WgXcQ' })).toContain('dQw4w9WgXcQ')
  })

  it('is null for a game with neither', () => {
    expect(gameCover({ imageUrl: null, youtubeId: null })).toBeNull()
  })
})
