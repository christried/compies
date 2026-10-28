import { GAME_IMAGE_HEIGHT, GAME_IMAGE_WIDTH } from './game'

// The geometry of a game image (#143), apart from the canvas so it can be tested without a browser.

/** The centered part of a `width` × `height` picture that has the card's aspect ratio (16:10). */
export function coverCrop(width: number, height: number): { x: number, y: number, width: number, height: number } {
  const ratio = GAME_IMAGE_WIDTH / GAME_IMAGE_HEIGHT
  const cropWidth = Math.min(width, height * ratio)
  const cropHeight = Math.min(height, width / ratio)
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight }
}
