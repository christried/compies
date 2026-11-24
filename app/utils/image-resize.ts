import { CENTRE_CROP, type CardTarget, coverCrop, type Crop, GAME_CARD_TARGET } from '~~/shared/image'

// Shrinks a picked picture to a tile's cover in the browser (#143): cropped to the tile's ratio as the Host chose, the centre by default (#457), at the target's size, one WebP. The game's card is the default target; a tile of another size passes its own (#909).

/** The browser cannot decode the file or cannot write WebP (older Safari answers PNG). */
export class ImageConversionError extends Error {
  constructor() {
    super('image conversion failed')
    this.name = 'ImageConversionError'
  }
}

/** Quality steps: the first that fits the target's byte limit wins, for every target (#909). */
const QUALITIES = [0.85, 0.7, 0.55]

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
}

/**
 * The picked file as a WebP of a tile's cover, cropped to the crop (the centre by default), drawn at the target's size and
 * at most its byte limit (the game's card by default: 512 × 320, 200 000 bytes), with the decoded picture's size for the
 * tile. It decodes on every call and keeps no bitmap. Throws ImageConversionError if the browser cannot.
 */
export async function toCardWebp(file: File, crop: Crop = CENTRE_CROP, target: CardTarget = GAME_CARD_TARGET): Promise<{ blob: Blob, width: number, height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  }
  catch {
    throw new ImageConversionError()
  }

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext('2d')
  if (!context) throw new ImageConversionError()
  const { width, height } = bitmap
  const rect = coverCrop(width, height, crop, target.width / target.height)
  context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, target.width, target.height)
  bitmap.close()

  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, quality)
    // A browser without WebP encoding answers with a PNG whatever was asked.
    if (!blob || blob.type !== 'image/webp') throw new ImageConversionError()
    if (blob.size <= target.maxBytes) return { blob, width, height }
  }
  throw new ImageConversionError()
}
