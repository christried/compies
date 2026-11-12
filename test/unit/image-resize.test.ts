import { describe, expect, it } from 'vitest'
import { CENTRE_CROP, coverCrop, cropRoom, type Crop, nudgeCrop, panCrop, tilePlacement, zoomCrop } from '../../shared/image'

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

// The Host's crop (#457): where the picture sits in the tile, as a share of the room it has on each axis.
const WIDE = { width: 2000, height: 1000 }
const TALL = { width: 800, height: 1600 }
const EXACT = { width: 1600, height: 1000 }
const TILE = { width: 120, height: 75 }

describe('coverCrop with a crop (#457)', () => {
  it.each([WIDE, TALL, EXACT])('equals the centred rectangle without an offset, $width × $height', ({ width, height }) => {
    expect(coverCrop(width, height, CENTRE_CROP)).toEqual(coverCrop(width, height))
    expect(coverCrop(width, height, { x: 0, y: 0 })).toEqual(coverCrop(width, height))
  })

  it('moves a wide picture on x only, the picture going the way the sign says', () => {
    expect(coverCrop(WIDE.width, WIDE.height, { x: 1, y: 0 }).x).toBe(0)
    expect(coverCrop(WIDE.width, WIDE.height, { x: -1, y: 0 }).x).toBe(400)
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0.5, y: 0 }).x).toBe(100)
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0, y: 1 }).y).toBe(0)
  })

  it('moves a tall picture on y only', () => {
    expect(coverCrop(TALL.width, TALL.height, { x: 0, y: 1 }).y).toBe(0)
    expect(coverCrop(TALL.width, TALL.height, { x: 0, y: -1 }).y).toBe(1100)
    expect(coverCrop(TALL.width, TALL.height, { x: 1, y: 0 }).x).toBe(0)
  })

  it('leaves a 16:10 picture where it is', () => {
    expect(coverCrop(EXACT.width, EXACT.height, { x: 1, y: -1 })).toEqual({ x: 0, y: 0, width: 1600, height: 1000 })
  })

  it('never leaves an empty edge, even for a crop beyond the room', () => {
    expect(coverCrop(WIDE.width, WIDE.height, { x: 5, y: 0 })).toEqual(coverCrop(WIDE.width, WIDE.height, { x: 1, y: 0 }))
    expect(coverCrop(WIDE.width, WIDE.height, { x: -5, y: 0 })).toEqual(coverCrop(WIDE.width, WIDE.height, { x: -1, y: 0 }))
  })
})

describe('tilePlacement (#457)', () => {
  const crops = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0.37, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -0.6 }]

  // The picture's box in the tile, mapped back to source pixels, is the rectangle the canvas draws: what the tile shows is what is uploaded.
  it.each([WIDE, TALL, EXACT])('shows the same rectangle the canvas draws, $width × $height', ({ width, height }) => {
    for (const crop of crops) {
      const place = tilePlacement(width, height, crop)
      const rect = coverCrop(width, height, crop)
      expect(-place.left / place.width * width).toBeCloseTo(rect.x, 6)
      expect(-place.top / place.height * height).toBeCloseTo(rect.y, 6)
      expect(100 / place.width * width).toBeCloseTo(rect.width, 6)
      expect(100 / place.height * height).toBeCloseTo(rect.height, 6)
    }
  })

  it.each([WIDE, TALL, EXACT])('does not stretch the picture, $width × $height', ({ width, height }) => {
    for (const crop of crops) {
      const place = tilePlacement(width, height, crop)
      expect(160 * place.width / 100 / width).toBeCloseTo(100 * place.height / 100 / height, 6)
    }
  })
})

describe('panCrop (#457)', () => {
  it('turns a drag of the wide picture in tile pixels into a share of its room', () => {
    expect(panCrop(WIDE, TILE, CENTRE_CROP, { dx: 6, dy: 0 }).x).toBeCloseTo(0.4, 6)
    expect(panCrop(WIDE, TILE, CENTRE_CROP, { dx: -3, dy: 0 }).x).toBeCloseTo(-0.2, 6)
    expect(panCrop(WIDE, TILE, { x: 0.4, y: 0 }, { dx: 6, dy: 0 }).x).toBeCloseTo(0.8, 6)
  })

  it('stops at the edges', () => {
    expect(panCrop(WIDE, TILE, CENTRE_CROP, { dx: 15, dy: 0 }).x).toBeCloseTo(1, 6)
    expect(panCrop(WIDE, TILE, CENTRE_CROP, { dx: 100, dy: 0 }).x).toBe(1)
    expect(panCrop(WIDE, TILE, CENTRE_CROP, { dx: -100, dy: 0 }).x).toBe(-1)
  })

  it('ignores the axis without room', () => {
    expect(panCrop(WIDE, TILE, CENTRE_CROP, { dx: 0, dy: 40 }).y).toBe(0)
    expect(panCrop(TALL, TILE, CENTRE_CROP, { dx: 500, dy: 0 }).x).toBe(0)
  })

  it('moves a tall picture on y', () => {
    expect(panCrop(TALL, TILE, CENTRE_CROP, { dx: 0, dy: 33 }).y).toBeCloseTo(0.4, 6)
    expect(panCrop(TALL, TILE, CENTRE_CROP, { dx: 0, dy: 1000 }).y).toBe(1)
    expect(panCrop(TALL, TILE, CENTRE_CROP, { dx: 0, dy: -1000 }).y).toBe(-1)
  })

  it('leaves a 16:10 picture at the centre', () => {
    expect(panCrop(EXACT, TILE, CENTRE_CROP, { dx: 50, dy: -50 })).toEqual({ x: 0, y: 0 })
  })

  it('keeps the crop for a tile without size', () => {
    const from = { x: 0.3, y: 0 }
    expect(panCrop(WIDE, { width: 0, height: 75 }, from, { dx: 10, dy: 0 })).toEqual(from)
    expect(panCrop(WIDE, { width: 120, height: 0 }, from, { dx: 10, dy: 0 })).toEqual(from)
  })
})

describe('nudgeCrop (#457)', () => {
  it('moves the picture one step the way the key points, on the axis with room', () => {
    expect(nudgeCrop(WIDE, CENTRE_CROP, 'right')).toEqual({ x: 0.1, y: 0 })
    expect(nudgeCrop(WIDE, CENTRE_CROP, 'left')).toEqual({ x: -0.1, y: 0 })
    expect(nudgeCrop(TALL, CENTRE_CROP, 'down')).toEqual({ x: 0, y: 0.1 })
    expect(nudgeCrop(TALL, CENTRE_CROP, 'up')).toEqual({ x: 0, y: -0.1 })
  })

  it('reaches exactly 1 and -1 after ten presses and stays there', () => {
    let crop = CENTRE_CROP
    for (let press = 0; press < 10; press++) crop = nudgeCrop(WIDE, crop, 'right')
    expect(crop.x).toBe(1)
    expect(nudgeCrop(WIDE, crop, 'right').x).toBe(1)
    crop = CENTRE_CROP
    for (let press = 0; press < 10; press++) crop = nudgeCrop(WIDE, crop, 'left')
    expect(crop.x).toBe(-1)
  })

  it('leaves the other axis alone', () => {
    expect(nudgeCrop(WIDE, CENTRE_CROP, 'up')).toEqual(CENTRE_CROP)
    expect(nudgeCrop(WIDE, CENTRE_CROP, 'down')).toEqual(CENTRE_CROP)
    expect(nudgeCrop(TALL, CENTRE_CROP, 'left')).toEqual(CENTRE_CROP)
    expect(nudgeCrop(TALL, CENTRE_CROP, 'right')).toEqual(CENTRE_CROP)
  })

  it('moves a 16:10 picture on no key', () => {
    for (const direction of ['left', 'right', 'up', 'down'] as const) expect(nudgeCrop(EXACT, CENTRE_CROP, direction)).toEqual(CENTRE_CROP)
  })
})

describe('cropRoom (#457)', () => {
  it('says on which axis the picture has room', () => {
    expect(cropRoom(WIDE.width, WIDE.height)).toEqual({ x: true, y: false })
    expect(cropRoom(TALL.width, TALL.height)).toEqual({ x: false, y: true })
    expect(cropRoom(EXACT.width, EXACT.height)).toEqual({ x: false, y: false })
  })
})

// The zoom (#516): 1 is the smallest scale that fills 16:10, 3 the largest. Absent means 1.
describe('zoom (#516)', () => {
  const ZOOM2_WIDE = { x: 600, y: 250, width: 800, height: 500 }
  const SIXTEEN_TEN_TALLER = { width: 2000, height: 1250 }

  it.each([WIDE, TALL, EXACT])('zoom 1 equals the crop without a zoom, $width × $height', ({ width, height }) => {
    for (const x of [-1, -0.4, 0, 0.4, 1]) {
      for (const y of [-1, -0.4, 0, 0.4, 1]) {
        expect(coverCrop(width, height, { x, y, zoom: 1 })).toEqual(coverCrop(width, height, { x, y }))
      }
    }
  })

  it('shows a third of the picture at zoom 3, from the centre and to each side', () => {
    const centre = coverCrop(WIDE.width, WIDE.height, { x: 0, y: 0, zoom: 3 })
    expect(centre.x).toBeCloseTo(733.33, 1)
    expect(centre.y).toBeCloseTo(333.33, 1)
    expect(centre.width).toBeCloseTo(533.33, 1)
    expect(centre.height).toBeCloseTo(333.33, 1)
    expect(coverCrop(WIDE.width, WIDE.height, { x: 1, y: 0, zoom: 3 }).x).toBe(0)
    expect(coverCrop(WIDE.width, WIDE.height, { x: -1, y: 0, zoom: 3 }).x).toBeCloseTo(1466.67, 1)
  })

  it('clamps the offset at every edge at zoom 2', () => {
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0, y: 0, zoom: 2 })).toEqual(ZOOM2_WIDE)
    expect(coverCrop(WIDE.width, WIDE.height, { x: 1, y: 0, zoom: 2 }).x).toBe(0)
    expect(coverCrop(WIDE.width, WIDE.height, { x: -1, y: 0, zoom: 2 }).x).toBe(1200)
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0, y: 1, zoom: 2 }).y).toBe(0)
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0, y: -1, zoom: 2 }).y).toBe(500)
  })

  it('never leaves an empty edge at zoom 2, even for an offset beyond the room', () => {
    expect(coverCrop(WIDE.width, WIDE.height, { x: 5, y: 0, zoom: 2 })).toEqual(coverCrop(WIDE.width, WIDE.height, { x: 1, y: 0, zoom: 2 }))
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0, y: -5, zoom: 2 })).toEqual(coverCrop(WIDE.width, WIDE.height, { x: 0, y: -1, zoom: 2 }))
  })

  it('reads a zoom outside 1…3 as its nearest end, and a zoom that is not a number as 1', () => {
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0.3, y: 0, zoom: 0.5 })).toEqual(coverCrop(WIDE.width, WIDE.height, { x: 0.3, y: 0, zoom: 1 }))
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0.3, y: 0, zoom: 4 })).toEqual(coverCrop(WIDE.width, WIDE.height, { x: 0.3, y: 0, zoom: 3 }))
    expect(coverCrop(WIDE.width, WIDE.height, { x: 0.3, y: 0, zoom: Number.NaN })).toEqual(coverCrop(WIDE.width, WIDE.height, { x: 0.3, y: 0, zoom: 1 }))
  })

  it('places a tile of a zoomed picture at zoom 2, from the centre', () => {
    expect(tilePlacement(WIDE.width, WIDE.height, { x: 0, y: 0, zoom: 2 })).toEqual({ left: -75, top: -50, width: 250, height: 200 })
  })

  it('says on which axes a zoomed picture has room: both, at zoom 2 and above', () => {
    expect(cropRoom(WIDE.width, WIDE.height, 1)).toEqual({ x: true, y: false })
    expect(cropRoom(WIDE.width, WIDE.height, 2)).toEqual({ x: true, y: true })
    expect(cropRoom(SIXTEEN_TEN_TALLER.width, SIXTEEN_TEN_TALLER.height, 1)).toEqual({ x: false, y: false })
    expect(cropRoom(SIXTEEN_TEN_TALLER.width, SIXTEEN_TEN_TALLER.height, 2)).toEqual({ x: true, y: true })
  })

  it('turns a drag at zoom 2 into a share of the zoomed room, and keeps the zoom', () => {
    expect(panCrop(WIDE, TILE, { x: 0, y: 0, zoom: 2 }, { dx: 45, dy: 0 })).toEqual({ x: 0.5, y: 0, zoom: 2 })
    expect(panCrop(WIDE, TILE, { x: 0, y: 0, zoom: 2 }, { dx: 0, dy: 18.75 })).toEqual({ x: 0, y: 0.5, zoom: 2 })
    expect(panCrop(WIDE, TILE, { x: 0, y: 0, zoom: 2 }, { dx: 500, dy: 0 }).x).toBe(1)
  })

  it('moves a key press of zoom 2 by the step and keeps the zoom, and reaches 1 after ten presses', () => {
    expect(nudgeCrop(WIDE, { x: 0, y: 0, zoom: 2 }, 'right')).toEqual({ x: 0.1, y: 0, zoom: 2 })
    let crop: Crop = { x: 0, y: 0, zoom: 2 }
    for (let press = 0; press < 10; press++) crop = nudgeCrop(WIDE, crop, 'right')
    expect(crop).toEqual({ x: 1, y: 0, zoom: 2 })
  })

  // A zoom change goes through `zoomCrop`, so an axis without room at the new zoom reads 0.
  it('keeps an offset on an axis that still has room when the zoom changes, and zeroes one that has lost its room', () => {
    expect(zoomCrop(WIDE, { x: 0.3, y: 0.5, zoom: 2 }, 1)).toEqual({ x: 0.3, y: 0, zoom: 1 })
    expect(zoomCrop(WIDE, { x: 0.3, y: 0 }, 2.04)).toEqual({ x: 0.3, y: 0, zoom: 2 })
    expect(zoomCrop(WIDE, { x: 0.3, y: 0 }, 7).zoom).toBe(3)
    expect(zoomCrop(WIDE, { x: 0.3, y: 0 }, 0).zoom).toBe(1)
  })
})
