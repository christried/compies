import { GAME_IMAGE_HEIGHT, GAME_IMAGE_WIDTH } from './game'

// The geometry of a game image (#143), apart from the canvas so it can be tested without a browser.

/**
 * What the Host chose: how far the picture is moved off the centre, per axis, as a share of the room it has, and how
 * far it is zoomed in (#516). Absent `zoom` means 1.
 */
export interface Crop { x: number, y: number, zoom?: number }
/** Nothing moved: the picture's centre, at fits, as before the Host could choose (#457). */
export const CENTRE_CROP: Crop = { x: 0, y: 0 }
/** The zoom slider's range (#516): 1 is the smallest scale at which the picture fills 16:10. */
export const CROP_ZOOM_MIN = 1
export const CROP_ZOOM_MAX = 3

/** A rectangle of the source picture, in its pixels. */
export interface CropRect { x: number, y: number, width: number, height: number }

/** One arrow key moves the picture by this share of its room (#457). */
const CROP_KEY_STEP = 0.1

const RATIO = GAME_IMAGE_WIDTH / GAME_IMAGE_HEIGHT

const clampUnit = (value: number) => Math.min(1, Math.max(-1, value))

/** A zoom inside CROP_ZOOM_MIN…CROP_ZOOM_MAX; one that is not a finite number is the smallest (#516). */
const clampZoom = (value: number) => Number.isFinite(value) ? Math.min(CROP_ZOOM_MAX, Math.max(CROP_ZOOM_MIN, value)) : CROP_ZOOM_MIN

/** The zoom a crop is made at: absent is 1, anything else is clamped into the range (#516). The field reads it too. */
export function zoomOf(crop: Crop): number {
  return typeof crop.zoom === 'number' ? clampZoom(crop.zoom) : CROP_ZOOM_MIN
}

/** The size of the 16:10 window in a `width` × `height` picture, at the smallest scale that fills it. */
function windowSize(width: number, height: number) {
  return { width: Math.min(width, height * RATIO), height: Math.min(height, width / RATIO) }
}

/** The window at a zoom: the same window as at 1, `zoom` times smaller on both sides (#516). */
function frameAt(width: number, height: number, zoom: number) {
  const frame = windowSize(width, height)
  return { width: frame.width / zoom, height: frame.height / zoom }
}

/**
 * The part of a `width` × `height` picture that has the card's aspect ratio (16:10), at the crop's zoom. `crop` says
 * where the picture sits (#457): `x > 0` moves it right, so the window shows more of its left part. It is clamped here,
 * so even a corrupt crop cannot leave an empty edge.
 */
export function coverCrop(width: number, height: number, crop: Crop = CENTRE_CROP): CropRect {
  const frame = frameAt(width, height, zoomOf(crop))
  return {
    x: (width - frame.width) / 2 * (1 - clampUnit(crop.x)),
    y: (height - frame.height) / 2 * (1 - clampUnit(crop.y)),
    width: frame.width,
    height: frame.height,
  }
}

/** On which axis the picture has room to move at a zoom (a wide one on x, a tall one on y, a 16:10 one on neither at 1). */
export function cropRoom(width: number, height: number, zoom: number = CROP_ZOOM_MIN): { x: boolean, y: boolean } {
  const frame = frameAt(width, height, zoom)
  return { x: width - frame.width > 0, y: height - frame.height > 0 }
}

/** Each value inside -1…1, and 0 on an axis without room at the crop's zoom. The zoom is kept as it is. */
function clampCrop(picture: { width: number, height: number }, crop: Crop): Crop {
  const room = cropRoom(picture.width, picture.height, zoomOf(crop))
  return { ...crop, x: room.x ? clampUnit(crop.x) : 0, y: room.y ? clampUnit(crop.y) : 0 }
}

/** A drag in tile pixels (`dx > 0`: the pointer moved right) from the crop `from`, as the new crop. */
export function panCrop(
  picture: { width: number, height: number },
  tile: { width: number, height: number },
  from: Crop,
  drag: { dx: number, dy: number },
): Crop {
  if (tile.width <= 0 || tile.height <= 0) return from
  const frame = frameAt(picture.width, picture.height, zoomOf(from))
  // The room in tile pixels: the picture may move half of it either side of the centre.
  const roomX = (picture.width - frame.width) * (tile.width / frame.width)
  const roomY = (picture.height - frame.height) * (tile.height / frame.height)
  return clampCrop(picture, {
    ...from,
    x: roomX > 0 ? from.x + drag.dx / (roomX / 2) : 0,
    y: roomY > 0 ? from.y + drag.dy / (roomY / 2) : 0,
  })
}

/** One arrow key: the picture moves the way the key points, like a drag. Rounded, so ten presses reach exactly 1. */
export function nudgeCrop(picture: { width: number, height: number }, crop: Crop, direction: 'left' | 'right' | 'up' | 'down'): Crop {
  const dx = { left: -CROP_KEY_STEP, right: CROP_KEY_STEP, up: 0, down: 0 }[direction]
  const dy = { left: 0, right: 0, up: -CROP_KEY_STEP, down: CROP_KEY_STEP }[direction]
  const next = clampCrop(picture, { ...crop, x: crop.x + dx, y: crop.y + dy })
  return { ...next, x: Math.round(next.x * 1000) / 1000, y: Math.round(next.y * 1000) / 1000 }
}

/**
 * The crop after a zoom change (#516): the zoom clamped into CROP_ZOOM_MIN…CROP_ZOOM_MAX and rounded to one decimal (the
 * slider's step), and the offsets clamped to the room at that zoom. An axis that loses its room reads 0, so the Host
 * never sees a position on an axis that cannot move.
 */
export function zoomCrop(picture: { width: number, height: number }, crop: Crop, zoom: number): Crop {
  return clampCrop(picture, { ...crop, zoom: Math.round(clampZoom(zoom) * 10) / 10 })
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
