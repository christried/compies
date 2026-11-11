import { GAME_IMAGE_HEIGHT, GAME_IMAGE_WIDTH } from './game'

// The geometry of a game image (#143), apart from the canvas so it can be tested without a browser.

/** What the Host chose: how far the picture is moved off the centre, per axis, as a share of the room it has. */
export interface Crop { x: number, y: number }
/** Nothing moved: the picture's centre, as before the Host could choose (#457). */
export const CENTRE_CROP: Crop = { x: 0, y: 0 }

/** A rectangle of the source picture, in its pixels. */
export interface CropRect { x: number, y: number, width: number, height: number }

/** One arrow key moves the picture by this share of its room (#457). */
const CROP_KEY_STEP = 0.1

const RATIO = GAME_IMAGE_WIDTH / GAME_IMAGE_HEIGHT

const clampUnit = (value: number) => Math.min(1, Math.max(-1, value))

/** The size of the 16:10 window in a `width` × `height` picture, at the smallest scale that fills it. */
function windowSize(width: number, height: number) {
  return { width: Math.min(width, height * RATIO), height: Math.min(height, width / RATIO) }
}

/**
 * The part of a `width` × `height` picture that has the card's aspect ratio (16:10). `crop` says where the picture
 * sits (#457): `x > 0` moves it right, so the window shows more of its left part. It is clamped here, so even a corrupt
 * crop cannot leave an empty edge.
 */
export function coverCrop(width: number, height: number, crop: Crop = CENTRE_CROP): CropRect {
  const frame = windowSize(width, height)
  return {
    x: (width - frame.width) / 2 * (1 - clampUnit(crop.x)),
    y: (height - frame.height) / 2 * (1 - clampUnit(crop.y)),
    width: frame.width,
    height: frame.height,
  }
}

/** On which axis the picture has room to move (a wide one on x, a tall one on y, a 16:10 one on neither). */
export function cropRoom(width: number, height: number): { x: boolean, y: boolean } {
  const frame = windowSize(width, height)
  return { x: width - frame.width > 0, y: height - frame.height > 0 }
}

/** Each value inside -1…1, and 0 on an axis without room. */
function clampCrop(picture: { width: number, height: number }, crop: Crop): Crop {
  const room = cropRoom(picture.width, picture.height)
  return { x: room.x ? clampUnit(crop.x) : 0, y: room.y ? clampUnit(crop.y) : 0 }
}

/** A drag in tile pixels (`dx > 0`: the pointer moved right) from the crop `from`, as the new crop. */
export function panCrop(
  picture: { width: number, height: number },
  tile: { width: number, height: number },
  from: Crop,
  drag: { dx: number, dy: number },
): Crop {
  if (tile.width <= 0 || tile.height <= 0) return from
  const frame = windowSize(picture.width, picture.height)
  // The room in tile pixels: the picture may move half of it either side of the centre.
  const roomX = (picture.width - frame.width) * (tile.width / frame.width)
  const roomY = (picture.height - frame.height) * (tile.height / frame.height)
  return clampCrop(picture, {
    x: roomX > 0 ? from.x + drag.dx / (roomX / 2) : 0,
    y: roomY > 0 ? from.y + drag.dy / (roomY / 2) : 0,
  })
}

/** One arrow key: the picture moves the way the key points, like a drag. Rounded, so ten presses reach exactly 1. */
export function nudgeCrop(picture: { width: number, height: number }, crop: Crop, direction: 'left' | 'right' | 'up' | 'down'): Crop {
  const moved = {
    left: { x: crop.x - CROP_KEY_STEP, y: crop.y },
    right: { x: crop.x + CROP_KEY_STEP, y: crop.y },
    up: { x: crop.x, y: crop.y - CROP_KEY_STEP },
    down: { x: crop.x, y: crop.y + CROP_KEY_STEP },
  }[direction]
  const next = clampCrop(picture, moved)
  return { x: Math.round(next.x * 1000) / 1000, y: Math.round(next.y * 1000) / 1000 }
}

/**
 * Where the picture sits in the tile, in percent of the tile, from the same rectangle the canvas draws: what the tile
 * shows is what is uploaded (#457).
 */
export function tilePlacement(width: number, height: number, crop: Crop): { left: number, top: number, width: number, height: number } {
  const rect = coverCrop(width, height, crop)
  return {
    left: -rect.x / rect.width * 100,
    top: -rect.y / rect.height * 100,
    width: width / rect.width * 100,
    height: height / rect.height * 100,
  }
}
