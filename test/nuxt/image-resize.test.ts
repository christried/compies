import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageConversionError, toCardWebp } from '~/utils/image-resize'
import { coverCrop } from '~~/shared/image'

// The canvas call of the Host's crop (#457): the browser's decoder and encoder are stubbed, the rectangle drawn is the point.
const file = new File(['x'], 'cover.png', { type: 'image/png' })

function stubBrowser(type = 'image/webp') {
  const close = vi.fn()
  const drawImage = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2000, height: 1000, close }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([new Uint8Array(10)], { type }))
  })
  return { close, drawImage }
}

describe('toCardWebp with a crop (#457)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('draws the rectangle coverCrop gives for the crop into the 512 × 320 canvas, and tells the picture size', async () => {
    const { close, drawImage } = stubBrowser()
    const crop = { x: 0.5, y: 0 }

    const made = await toCardWebp(file, crop)

    const rect = coverCrop(2000, 1000, crop)
    expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 2000 }), rect.x, rect.y, rect.width, rect.height, 0, 0, 512, 320)
    expect(made).toEqual({ blob: expect.any(Blob), width: 2000, height: 1000 })
    expect(close).toHaveBeenCalledOnce()
  })

  it('crops the centre without a crop', async () => {
    const { drawImage } = stubBrowser()

    await toCardWebp(file)

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 200, 0, 1600, 1000, 0, 0, 512, 320)
  })

  it('refuses a browser that answers with something other than WebP', async () => {
    stubBrowser('image/png')

    await expect(toCardWebp(file)).rejects.toBeInstanceOf(ImageConversionError)
  })
})
