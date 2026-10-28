import { describe, expect, it } from 'vitest'
import { coverCrop } from '../../app/utils/image-resize'

// The part of toCardWebp that needs no canvas: which rectangle of the picture becomes the 16:10 card (#143).
describe('coverCrop', () => {
  it('cuts the sides of a wide picture, from the middle', () => {
    expect(coverCrop(2000, 1000)).toEqual({ x: 200, y: 0, width: 1600, height: 1000 })
  })

  it('cuts top and bottom of a tall picture, from the middle', () => {
    expect(coverCrop(800, 1600)).toEqual({ x: 0, y: 550, width: 800, height: 500 })
  })

  it('keeps a picture that already is 16:10', () => {
    expect(coverCrop(1600, 1000)).toEqual({ x: 0, y: 0, width: 1600, height: 1000 })
  })
})
