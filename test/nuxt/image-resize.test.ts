import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageConversionError, toCardWebp } from '~/utils/image-resize'
import { CENTRE_CROP, coverCrop } from '~~/shared/image'

// The canvas call of the Host's crop (#457): the browser's decoder and encoder are stubbed, the rectangle drawn is the point.
const file = new File(['x'], 'cover.png', { type: 'image/png' })

// `sizes` are the byte sizes the encoder answers, one per quality step; the last one repeats (#909).
function stubBrowser(type = 'image/webp', sizes: number[] = [10]) {
  const close = vi.fn()
  const drawImage = vi.fn()
  let answer = 0
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2000, height: 1000, close }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    const size = sizes[Math.min(answer, sizes.length - 1)]!
    answer++
    callback(new Blob([new Uint8Array(size)], { type }))
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

  it('draws the zoomed window: at zoom 2 the centre quarter-size rectangle of a wide picture (#516)', async () => {
    const { drawImage } = stubBrowser()

    await toCardWebp(file, { x: 0, y: 0, zoom: 2 })

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 600, 250, 800, 500, 0, 0, 512, 320)
  })

  it('refuses a browser that answers with something other than WebP', async () => {
    stubBrowser('image/png')

    await expect(toCardWebp(file)).rejects.toBeInstanceOf(ImageConversionError)
  })
})

// The encoder takes its target size and byte limit (#909): a 1:1 tile draws its square and keeps its own limit.
describe('toCardWebp with a target (#909)', () => {
  const SQUARE_TARGET = { width: 256, height: 256, maxBytes: 100_000 }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('draws the centred square of a wide picture into the 256 × 256 canvas', async () => {
    const { drawImage } = stubBrowser()

    await toCardWebp(file, CENTRE_CROP, SQUARE_TARGET)

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0, 1000, 1000, 0, 0, 256, 256)
  })

  it('draws the 16:10 rectangle into the game size when no target is given', async () => {
    const { drawImage } = stubBrowser()

    await toCardWebp(file)

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 200, 0, 1600, 1000, 0, 0, 512, 320)
  })

  it('refuses a target whose every quality step is over its byte limit', async () => {
    stubBrowser('image/webp', [150])

    await expect(toCardWebp(file, CENTRE_CROP, { ...SQUARE_TARGET, maxBytes: 100 })).rejects.toBeInstanceOf(ImageConversionError)
  })

  it('takes the first quality step that fits the target limit', async () => {
    stubBrowser('image/webp', [150, 90])

    const made = await toCardWebp(file, CENTRE_CROP, { ...SQUARE_TARGET, maxBytes: 100 })

    expect(made.blob.size).toBe(90)
  })

  it('keeps the game default: 250 000 bytes at every step is refused, 200 000 bytes is accepted', async () => {
    stubBrowser('image/webp', [250_000])
    await expect(toCardWebp(file)).rejects.toBeInstanceOf(ImageConversionError)

    vi.restoreAllMocks()
    stubBrowser('image/webp', [200_000])
    const made = await toCardWebp(file)

    expect(made.blob.size).toBe(200_000)
  })
})
