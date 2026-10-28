import { GAME_IMAGE_HEIGHT, GAME_IMAGE_MAX_BYTES, GAME_IMAGE_WIDTH } from '~~/shared/game'
import { coverCrop } from '~~/shared/image'

// Shrinks a picked picture to the card's cover in the browser (#143): center-cropped to 16:10, 512 × 320, one WebP.

/** The browser cannot decode the file or cannot write WebP (older Safari answers PNG). */
export class ImageConversionError extends Error {
  constructor() {
    super('image conversion failed')
    this.name = 'ImageConversionError'
  }
}

/** Quality steps: the first that fits GAME_IMAGE_MAX_BYTES wins. */
const QUALITIES = [0.85, 0.7, 0.55]

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
}

/** The picked file as a WebP of the card's cover, at most GAME_IMAGE_MAX_BYTES. Throws ImageConversionError if the browser cannot. */
export async function toCardWebp(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  }
  catch {
    throw new ImageConversionError()
  }

  const canvas = document.createElement('canvas')
  canvas.width = GAME_IMAGE_WIDTH
  canvas.height = GAME_IMAGE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new ImageConversionError()
  const crop = coverCrop(bitmap.width, bitmap.height)
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, GAME_IMAGE_WIDTH, GAME_IMAGE_HEIGHT)
  bitmap.close()

  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, quality)
    // A browser without WebP encoding answers with a PNG whatever was asked.
    if (!blob || blob.type !== 'image/webp') throw new ImageConversionError()
    if (blob.size <= GAME_IMAGE_MAX_BYTES) return blob
  }
  throw new ImageConversionError()
}
