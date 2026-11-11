import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameImageField from '~/components/GameImageField.vue'
import { ImageConversionError } from '~/utils/image-resize'
import { CENTRE_CROP, coverCrop } from '~~/shared/image'

// Moving the picture inside the tile (#457): drag with a mouse or a finger, arrow keys, and what the field hands the form.
// The canvas is mocked (it needs a browser); every WebP the field asks for shows up as a call of toCardWebp with the crop.
const toCardWebp = vi.hoisted(() => vi.fn())
vi.mock('~/utils/image-resize', async importOriginal => ({ ...await importOriginal<object>(), toCardWebp }))

const WIDE = { width: 2000, height: 1000 }
const TALL = { width: 800, height: 1600 }
const EXACT = { width: 1600, height: 1000 }
type Picture = typeof WIDE

const blobOf = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/webp' })
const pickBlob = blobOf(100)
const file = new File(['x'], 'cover.png', { type: 'image/png' })

let page: VueWrapper
let held: Blob | null

/** Mounts the field like the form does: v-model keeps what the field emits. */
async function mount(props: { imageUrl?: string | null, uploading?: boolean } = {}) {
  held = null
  page = await mountSuspended(GameImageField, {
    props: {
      'modelValue': null,
      ...props,
      'onUpdate:modelValue': (blob: Blob | null) => {
        held = blob
        void page.setProps({ modelValue: blob })
      },
    },
  })
  return page
}

async function pick(chosen: File = file) {
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [chosen], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

const tile = () => page.get('[data-crop-x]').element as HTMLElement
const tileOrPlaceholder = () => page.get('[class*="aspect-"]').element as HTMLElement
const cropOf = () => ({ x: Number(tile().dataset.cropX), y: Number(tile().dataset.cropY) })
const img = () => page.get('img').element as HTMLImageElement
const calls = () => toCardWebp.mock.calls
const lastCrop = () => calls().at(-1)![1]

/** The fixed size of the tile: happy-dom has no layout. */
function stubSize(element: HTMLElement, width = 120, height = 75) {
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(element, 'clientHeight', { value: height, configurable: true })
}

/** Mounts, picks a picture of the given shape and stubs the tile's size. */
async function picked(picture: Picture = WIDE, props: { imageUrl?: string | null, uploading?: boolean } = {}) {
  toCardWebp.mockReset()
  toCardWebp.mockResolvedValue({ blob: pickBlob, ...picture })
  await mount(props)
  await pick()
  stubSize(tile())
  return tile()
}

async function pointer(type: string, init: { x?: number, y?: number, id?: number, pointerType?: string, button?: number } = {}, target: HTMLElement = tile()) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.id ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    button: init.button ?? 0,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

async function drag(dx: number, dy = 0, init: { id?: number, pointerType?: string } = {}) {
  await pointer('pointerdown', { x: 50, y: 40, ...init })
  await pointer('pointermove', { x: 50 + dx, y: 40 + dy, ...init })
  await pointer('pointerup', { x: 50 + dx, y: 40 + dy, ...init })
  await flushPromises()
}

async function key(name: string, init: KeyboardEventInit = {}, target: HTMLElement = tile()) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

/** The rectangle of the picture the tile shows, in source pixels, from the img's percentages. */
function shownRect(picture: Picture) {
  const percent = (value: string) => Number.parseFloat(value)
  const { left, top, width, height } = img().style
  return {
    x: -percent(left) / percent(width) * picture.width,
    y: -percent(top) / percent(height) * picture.height,
    width: 100 / percent(width) * picture.width,
    height: 100 / percent(height) * picture.height,
  }
}

beforeEach(() => {
  toCardWebp.mockReset()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/original')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dragging the picture (#457)', () => {
  it('moves the picture with a mouse and makes the WebP once, when the pointer is released', async () => {
    await picked()

    await pointer('pointerdown', { x: 50, y: 40 })
    await pointer('pointermove', { x: 56, y: 40 })
    await flushPromises()

    expect(tile().dataset.cropX).toBe('0.400')
    expect(img().style.left).toBe('-7.5%')
    expect(calls()).toHaveLength(1)

    await pointer('pointerup', { x: 56, y: 40 })
    await flushPromises()

    expect(calls()).toHaveLength(2)
    expect(calls()[1]![0]).toBe(file)
    expect(lastCrop().x).toBeCloseTo(0.4, 6)
    expect(lastCrop().y).toBe(0)
    expect(page.emitted('update:modelValue')).toHaveLength(2)
  })

  it('moves the picture with a finger the same way, and leaves the page to scroll along the axis without room', async () => {
    await picked()
    await drag(6, 0, { pointerType: 'touch' })
    expect(tile().dataset.cropX).toBe('0.400')
    expect(tile().className).toContain('touch-pan-y')

    await picked(TALL)
    expect(tile().className).toContain('touch-pan-x')

    await picked(EXACT)
    expect(tile().className).toContain('touch-auto')
  })

  it('keeps following a drag that leaves the tile, and ends it outside', async () => {
    await picked()

    await pointer('pointerdown', { x: 50, y: 40 })
    await pointer('pointermove', { x: 400, y: 300 })
    await pointer('pointerleave', { x: 400, y: 300 })
    await pointer('pointerout', { x: 400, y: 300 })
    await pointer('pointermove', { x: 420, y: 320 })
    expect(cropOf()).toEqual({ x: 1, y: 0 })
    expect(tile().dataset.cropY).toBe('0.000')

    await pointer('pointerup', { x: 420, y: 320 })
    await flushPromises()
    expect(calls()).toHaveLength(2)
    expect(lastCrop()).toEqual({ x: 1, y: 0 })
  })

  it('captures the pointer and lets go of it when the drag ends, however it ends', async () => {
    await picked()

    for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      await pointer('pointerdown', { x: 50, y: 40 })
      expect(tile().hasPointerCapture(1)).toBe(true)
      await pointer('pointermove', { x: 53, y: 40 })
      await pointer(ending, { x: 53, y: 40 })
      expect(tile().hasPointerCapture(1)).toBe(false)
      await flushPromises()
    }

    // The browser fires lostpointercapture after our own release: it must not make a WebP a second time.
    const before = calls().length
    await pointer('lostpointercapture')
    await flushPromises()
    expect(calls()).toHaveLength(before)
  })

  it('keeps the position reached when the browser cancels the pointer, and moves no further', async () => {
    await picked()

    await pointer('pointerdown', { x: 50, y: 40 })
    await pointer('pointermove', { x: 56, y: 40 })
    await pointer('pointercancel', { x: 56, y: 40 })
    await flushPromises()

    expect(cropOf().x).toBeCloseTo(0.4, 6)
    expect(tile().hasPointerCapture(1)).toBe(false)
    expect(calls()).toHaveLength(2)
    expect(lastCrop().x).toBeCloseTo(0.4, 6)

    await pointer('pointermove', { x: 70, y: 40 })
    expect(cropOf().x).toBeCloseTo(0.4, 6)
  })

  it('makes nothing when the browser takes the gesture for scrolling before the picture moved', async () => {
    await picked()

    await pointer('pointerdown', { x: 50, y: 40 })
    await pointer('pointercancel', { x: 50, y: 40 })
    await flushPromises()

    expect(calls()).toHaveLength(1)
  })

  it('ignores a second pointer while one drags', async () => {
    await picked()

    await pointer('pointerdown', { x: 50, y: 40 })
    await pointer('pointerdown', { x: 10, y: 10, id: 2, pointerType: 'touch' })
    expect(tile().hasPointerCapture(2)).toBe(false)
    await pointer('pointermove', { x: 90, y: 10, id: 2, pointerType: 'touch' })
    expect(cropOf().x).toBe(0)
    await pointer('pointerup', { x: 90, y: 10, id: 2, pointerType: 'touch' })
    expect(tile().hasPointerCapture(1)).toBe(true)
    await pointer('pointermove', { x: 56, y: 40 })
    expect(tile().dataset.cropX).toBe('0.400')
    await pointer('pointerup', { x: 56, y: 40 })
    await flushPromises()

    expect(calls()).toHaveLength(2)
  })

  it('starts nothing with another button, in a tile without size, or while the image is being sent', async () => {
    await picked()
    await pointer('pointerdown', { x: 50, y: 40, button: 2 })
    await pointer('pointermove', { x: 56, y: 40, button: 2 })
    expect(cropOf().x).toBe(0)
    await pointer('pointerup', { x: 56, y: 40, button: 2 })

    stubSize(tile(), 0, 0)
    await pointer('pointerdown', { x: 50, y: 40 })
    await pointer('pointermove', { x: 56, y: 40 })
    expect(cropOf().x).toBe(0)
    expect(tile().hasPointerCapture(1)).toBe(false)

    stubSize(tile())
    await page.setProps({ uploading: true })
    await drag(6)
    await key('ArrowRight')
    expect(cropOf().x).toBe(0)
    await flushPromises()
    expect(calls()).toHaveLength(1)
  })

  it('still drags when the browser refuses to capture the pointer', async () => {
    await picked()
    vi.spyOn(tile(), 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('not active', 'InvalidStateError')
    })

    await drag(6)

    expect(tile().dataset.cropX).toBe('0.400')
    expect(calls()).toHaveLength(2)
  })

  it('shows the rectangle of the picture that the canvas draws, after a drag and after keys', async () => {
    await picked()

    await drag(6)
    expect(shownRect(WIDE).x).toBeCloseTo(coverCrop(2000, 1000, lastCrop()).x, 2)
    expect(shownRect(WIDE).width).toBeCloseTo(coverCrop(2000, 1000, lastCrop()).width, 2)
    expect(shownRect(WIDE).height).toBeCloseTo(1000, 2)

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await key('ArrowLeft')
    await key('ArrowLeft')
    await vi.advanceTimersByTimeAsync(300)
    const rect = coverCrop(2000, 1000, lastCrop())
    expect(shownRect(WIDE)).toEqual({ x: expect.closeTo(rect.x, 2), y: expect.closeTo(rect.y, 2), width: expect.closeTo(rect.width, 2), height: expect.closeTo(rect.height, 2) })
  })

  it('stops at each of the four edges, and each axis alone', async () => {
    await picked(WIDE)
    await drag(100)
    expect(cropOf()).toEqual({ x: 1, y: 0 })
    await drag(-300)
    expect(cropOf()).toEqual({ x: -1, y: 0 })
    await drag(100, 100)
    expect(cropOf()).toEqual({ x: 1, y: 0 })

    await picked(TALL)
    await drag(0, 1000)
    expect(cropOf()).toEqual({ x: 0, y: 1 })
    await drag(0, -3000)
    expect(cropOf()).toEqual({ x: 0, y: -1 })
  })

  it('has nothing to move on a 16:10 picture, and moves a wide one on x only, a tall one on y only', async () => {
    await picked(EXACT)
    await drag(30, 30)
    await key('ArrowRight')
    await key('ArrowDown')
    await flushPromises()
    expect(cropOf()).toEqual({ x: 0, y: 0 })
    expect(calls()).toHaveLength(1)
    expect(tile().className).not.toContain('cursor-grab')
    expect(tile().getAttribute('tabindex')).toBe('0')

    await picked(WIDE)
    expect(tile().className).toContain('cursor-grab')
    await drag(0, 30)
    expect(cropOf()).toEqual({ x: 0, y: 0 })
    expect(calls()).toHaveLength(1)

    await picked(TALL)
    await drag(30, 0)
    expect(cropOf()).toEqual({ x: 0, y: 0 })
    expect(calls()).toHaveLength(1)
  })
})

describe('moving the picture with the arrow keys (#457)', () => {
  it('moves the picture the way the key points and keeps the page from scrolling, also on a key that moves nothing', async () => {
    await picked(WIDE)
    expect((await key('ArrowRight')).defaultPrevented).toBe(true)
    expect(cropOf().x).toBeCloseTo(0.1, 6)
    expect((await key('ArrowLeft')).defaultPrevented).toBe(true)
    expect((await key('ArrowLeft')).defaultPrevented).toBe(true)
    expect(cropOf().x).toBeCloseTo(-0.1, 6)
    expect((await key('ArrowUp')).defaultPrevented).toBe(true)
    expect(cropOf().y).toBe(0)

    await picked(TALL)
    await key('ArrowDown')
    expect(cropOf().y).toBeCloseTo(0.1, 6)
    await key('ArrowUp')
    await key('ArrowUp')
    expect(cropOf().y).toBeCloseTo(-0.1, 6)
  })

  it('makes the WebP 300 ms after the last key, each key restarting the wait', async () => {
    await picked()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await key('ArrowRight')
    await vi.advanceTimersByTimeAsync(100)
    await key('ArrowRight')
    await vi.advanceTimersByTimeAsync(100)
    await key('ArrowRight')
    await vi.advanceTimersByTimeAsync(299)
    expect(calls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toHaveLength(2)
    expect(lastCrop().x).toBeCloseTo(0.3, 6)
  })

  it('stops at the clamp: the eleventh key changes nothing and makes nothing', async () => {
    await picked()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    for (let press = 0; press < 10; press++) await key('ArrowRight')
    expect(tile().dataset.cropX).toBe('1.000')
    await vi.advanceTimersByTimeAsync(300)
    expect(calls()).toHaveLength(2)

    await key('ArrowRight')
    await vi.advanceTimersByTimeAsync(1000)
    expect(tile().dataset.cropX).toBe('1.000')
    expect(calls()).toHaveLength(2)
  })

  it('leaves Ctrl, Meta and Alt combinations and other keys to the page, and treats Shift like no modifier', async () => {
    await picked()
    const parent = vi.fn()
    tile().parentElement!.addEventListener('keydown', parent)

    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect((await key('ArrowRight', init)).defaultPrevented).toBe(false)
    }
    expect(cropOf().x).toBe(0)

    const enter = await key('Enter', { ctrlKey: true })
    expect(enter.defaultPrevented).toBe(false)
    expect(parent).toHaveBeenCalledTimes(4)

    await key('ArrowRight', { shiftKey: true })
    expect(cropOf().x).toBeCloseTo(0.1, 6)
  })

  it('can be reached with Tab and says what it is and how to use it', async () => {
    await picked()
    const target = tile()

    expect(target.getAttribute('tabindex')).toBe('0')
    expect(target.className).toContain('focus-visible:focus-ring')
    expect(target.getAttribute('aria-label')).toBe('Bildausschnitt wählen')
    expect(page.find(`#${target.getAttribute('aria-describedby')}`).text()).toBe('Zieh das Bild, um den Ausschnitt zu wählen, oder verschieb es mit den Pfeiltasten.')
    const dragstart = new Event('dragstart', { bubbles: true, cancelable: true })
    target.dispatchEvent(dragstart)
    expect(dragstart.defaultPrevented).toBe(true)
    expect(img().getAttribute('draggable')).toBe('false')
    expect(img().className).toContain('max-w-none')
  })
})

describe('the tile before and after a picked file (#457)', () => {
  it('has no control without a picked file, also after a failed pick', async () => {
    toCardWebp.mockRejectedValue(new ImageConversionError())
    await mount()

    const placeholder = tileOrPlaceholder()
    for (const attribute of ['tabindex', 'aria-label', 'aria-describedby']) expect(placeholder.hasAttribute(attribute)).toBe(false)
    expect(page.text()).not.toContain('Zieh das Bild')
    await key('ArrowRight', {}, placeholder)
    await pointer('pointerdown', { x: 50, y: 40 }, placeholder)
    await pointer('pointermove', { x: 60, y: 40 }, placeholder)
    await pointer('pointerup', { x: 60, y: 40 }, placeholder)

    await pick()
    expect(page.text()).toContain('Dein Browser kann das Bild nicht umwandeln')
    expect(page.find('[tabindex="0"]').exists()).toBe(false)
    expect(page.find('[data-crop-x]').exists()).toBe(false)
    expect(calls()).toHaveLength(1)
  })

  it('shows the image the game already has without a control, until a file is picked', async () => {
    toCardWebp.mockResolvedValue({ blob: pickBlob, ...WIDE })
    await mount({ imageUrl: '/api/images/b1-abc.webp' })

    expect(img().getAttribute('src')).toBe('/api/images/b1-abc.webp')
    expect(page.find('[tabindex="0"]').exists()).toBe(false)
    expect(page.text()).not.toContain('Zieh das Bild')
    expect(page.findAll('button').some(button => button.text() === 'Anderes Bild wählen')).toBe(true)

    await pick()
    expect(img().getAttribute('src')).toBe('blob:http://localhost/original')
    expect(page.find('[tabindex="0"]').exists()).toBe(true)
    expect(page.text()).toContain('Zieh das Bild')
  })

  it('starts a second file at the centre, and keeps the first when the second cannot be converted', async () => {
    await picked()
    await drag(6)
    expect(cropOf().x).toBeCloseTo(0.4, 6)
    const second = new File(['y'], 'second.png', { type: 'image/png' })

    toCardWebp.mockResolvedValue({ blob: blobOf(200), ...WIDE })
    await pick(second)
    expect(tile().dataset.cropX).toBe('0.000')
    expect(calls().at(-1)).toEqual([second])
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)

    await drag(6)
    const held = calls().length
    toCardWebp.mockRejectedValue(new ImageConversionError())
    await pick(file)
    expect(page.text()).toContain('Dein Browser kann das Bild nicht umwandeln')
    expect(cropOf().x).toBeCloseTo(0.4, 6)
    expect(calls()).toHaveLength(held + 1)
  })

  it('is emptied when the parent removes the image', async () => {
    await picked()
    await drag(6)

    await page.setProps({ modelValue: null })

    expect(page.find('[tabindex="0"]').exists()).toBe(false)
    expect(page.text()).toContain('16:10')
    expect(URL.revokeObjectURL).toHaveBeenCalled()

    await pick()
    expect(tile().dataset.cropX).toBe('0.000')
  })
})

describe('the WebP follows the crop (#457)', () => {
  it('drops a result that a newer make outran', async () => {
    await picked()
    const resolvers: ((value: { blob: Blob, width: number, height: number }) => void)[] = []
    toCardWebp.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve)
    }))

    await drag(6)
    await drag(9)
    expect(resolvers).toHaveLength(2)
    const newer = blobOf(333)
    resolvers[1]!({ blob: newer, ...WIDE })
    await flushPromises()
    resolvers[0]!({ blob: blobOf(222), ...WIDE })
    await flushPromises()

    expect(held).toBe(newer)
    expect(page.emitted('update:modelValue')).toHaveLength(2)
  })

  it('puts the tile back to the crop of the held WebP when a new one cannot be made', async () => {
    await picked()
    toCardWebp.mockRejectedValue(new ImageConversionError())

    await drag(6)

    expect(tile().dataset.cropX).toBe('0.000')
    expect(page.text()).toContain('Dein Browser kann das Bild nicht umwandeln')
    expect(page.emitted('update:modelValue')).toHaveLength(1)
    expect(held).toBe(pickBlob)
  })

  it('makes nothing after it is gone', async () => {
    await picked()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await key('ArrowRight')
    page.unmount()
    await vi.advanceTimersByTimeAsync(1000)

    expect(calls()).toHaveLength(1)
    expect(held).toBe(pickBlob)
  })

  it('hands the form the pick as the centre crop', async () => {
    await picked()

    expect(calls()[0]).toEqual([file])
    expect(held).toBe(pickBlob)
    expect(CENTRE_CROP).toEqual({ x: 0, y: 0 })
  })
})
