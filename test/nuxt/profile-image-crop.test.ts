import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, getHeader, readRawBody } from 'h3'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '~/pages/profil.vue'
import { ImageConversionError } from '~/utils/image-resize'
import { CENTRE_CROP, PROFILE_IMAGE_TARGET } from '~~/shared/image'
import { kitty, signInAs } from './auth'

// The crop of the Profile picture on the card „Profil“ (#910): a square tile with a round preview, drag, arrow keys and the zoom slider, the WebP made
// again at rest, and „Speichern“ sending the crop the User sees. Prior art: game-image-crop.test.ts (the cover field's crop); the canvas is mocked.
const toCardWebp = vi.hoisted(() => vi.fn())
vi.mock('~/utils/image-resize', async importOriginal => ({ ...await importOriginal<object>(), toCardWebp }))

const WIDE = { width: 2000, height: 1000 }
const TALL = { width: 800, height: 1600 }
const SQUARE = { width: 1000, height: 1000 }
type Picture = typeof WIDE

const withPicture = { ...kitty, image: 'https://example.com/kitty_tv.png' }
const uploaded = '/api/images/profile-abcdefghijklmnop.webp'
const file = new File(['x'], 'me.png', { type: 'image/png' })

/** Every make answers a blob of its own: the first byte counts the calls, so a test can tell which crop was sent. */
let made = 0
const makeBlob = () => new Blob([new Uint8Array([++made])], { type: 'image/webp' })

const uploads = vi.fn()
let holdUpload: Promise<void> | null = null
let uploadFailsWith: { statusCode: number, statusMessage: string } | null = null
registerEndpoint('/api/me/image', {
  method: 'PUT',
  handler: async (event) => {
    uploads({ type: getHeader(event, 'content-type'), bytes: Array.from(await readRawBody(event, false) ?? []) })
    if (holdUpload) await holdUpload
    if (uploadFailsWith) throw createError(uploadFailsWith)
    return { image: uploaded }
  },
})

let page: VueWrapper
const mount = async () => {
  page = await mountSuspended(ProfilePage, { route: '/profil', attachTo: document.body })
  return page
}
const card = () => page.get('section[aria-labelledby="profile-card-title"]')
const cardPicture = () => page.find('section[aria-labelledby="profile-card-title"] img')
const buttonOf = (name: string, root: { findAll: VueWrapper['findAll'] } = page) => root.findAll('button').find(button => button.text() === name)!
const uploadButton = () => buttonOf('Hochladen')
const cropGroup = () => card().get('[role="group"][aria-labelledby]')
const saveImage = () => buttonOf('Speichern', cropGroup())
const cancelImage = () => buttonOf('Abbrechen', cropGroup())
const tile = () => page.get('[data-crop-x]').element as HTMLElement
const disc = () => page.get('[aria-hidden="true"].size-20')
const cropOf = () => ({ x: Number(tile().dataset.cropX), y: Number(tile().dataset.cropY) })
const tileImg = () => tile().querySelector('img')!
const discImg = () => disc().element.querySelector('img')!
const calls = () => toCardWebp.mock.calls
const lastCrop = () => calls().at(-1)![1]
const zoomSlider = () => page.get('input[type="range"]')

/** The fixed size of the tile: happy-dom has no layout. */
function stubSize(element: HTMLElement, width = 160, height = 160) {
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(element, 'clientHeight', { value: height, configurable: true })
}

async function pick(chosen: File | null = file) {
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: chosen ? [chosen] : [], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

/** Mounts the Profil page and picks a picture of the given shape: the crop is open, the tile has its size. */
async function picked(picture: Picture = WIDE) {
  toCardWebp.mockReset()
  made = 0
  toCardWebp.mockImplementation(async () => ({ blob: makeBlob(), ...picture }))
  await mount()
  await pick()
  stubSize(tile())
  return tile()
}

async function pointer(type: string, init: { x?: number, y?: number, id?: number, pointerType?: string, button?: number, buttons?: number } = {}, target: HTMLElement = tile()) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.id ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    button: init.button ?? 0,
    buttons: init.buttons ?? 0,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

async function drag(dx: number, dy = 0) {
  await pointer('pointerdown', { x: 50, y: 40 })
  await pointer('pointermove', { x: 50 + dx, y: 40 + dy })
  await pointer('pointerup', { x: 50 + dx, y: 40 + dy })
  await flushPromises()
}

async function key(name: string, init: KeyboardEventInit = {}, target: HTMLElement = tile()) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

/** The slider's native input: the thumb moved (`input`), the way a browser reports it. */
async function setZoom(zoom: number) {
  const slider = zoomSlider()
  ;(slider.element as HTMLInputElement).value = String(zoom)
  await slider.trigger('input')
}

const placement = (element: HTMLElement) => ({ left: element.style.left, top: element.style.top, width: element.style.width, height: element.style.height })

beforeEach(() => {
  signInAs(withPicture)
  uploads.mockClear()
  holdUpload = null
  uploadFailsWith = null
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/original')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  page?.unmount()
})

describe('opening the crop after a pick (#910)', () => {
  it('swaps the picture row for a square tile and a round preview, and sends nothing yet', async () => {
    const file1 = new File(['x'], 'first.png', { type: 'image/png' })
    toCardWebp.mockReset()
    toCardWebp.mockResolvedValue({ blob: makeBlob(), ...WIDE })
    await mount()
    expect(buttonOf('Hochladen')).toBeDefined()

    await pick(file1)

    expect(page.find('[data-crop-x]').exists()).toBe(true)
    expect(page.findAll('button').some(button => button.text() === 'Hochladen')).toBe(false)
    expect(cardPicture().attributes('src')).not.toBe(withPicture.image)
    expect(card().text()).not.toContain('Kommt von Discord oder Twitch')
    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toEqual([file1, CENTRE_CROP, PROFILE_IMAGE_TARGET])
    expect(uploads).not.toHaveBeenCalled()
  })

  it('shows the original in the tile and in the disc, and revokes its object URL when the crop closes', async () => {
    await picked()

    expect(tileImg().getAttribute('src')).toBe('blob:http://localhost/original')
    expect(tileImg().getAttribute('alt')).toBe('Vorschau des Bildes')
    expect(discImg().getAttribute('src')).toBe('blob:http://localhost/original')
    expect(discImg().getAttribute('alt')).toBe('')
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)

    await cancelImage().trigger('click')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/original')
  })

  it('opens no crop when the picture cannot be converted, and keeps the row', async () => {
    toCardWebp.mockReset()
    toCardWebp.mockRejectedValue(new ImageConversionError())
    await mount()

    await pick()

    expect(card().text()).toContain('Dein Browser kann das Bild nicht umwandeln')
    expect(page.find('[data-crop-x]').exists()).toBe(false)
    expect(uploadButton()).toBeDefined()
    expect(cardPicture().attributes('src')).toBe(withPicture.image)
  })

  it('names the crop, describes it by its help line, and takes focus when it opens', async () => {
    await picked()
    const target = tile()

    expect(target.getAttribute('tabindex')).toBe('0')
    expect(target.getAttribute('aria-label')).toBe('Bildausschnitt wählen')
    expect(page.find(`#${target.getAttribute('aria-describedby')}`).text()).toBe('Zieh das Bild, um den Ausschnitt zu wählen, oder verschieb es mit den Pfeiltasten.')
    expect(target.className).toContain('focus-visible:focus-ring')
    expect(tileImg().getAttribute('draggable')).toBe('false')
    expect(document.activeElement).toBe(target)
  })

  it('has a slider named Zoom that reads Passt at 1', async () => {
    await picked()

    const slider = zoomSlider()
    expect(slider.attributes('min')).toBe('1')
    expect(slider.attributes('max')).toBe('3')
    expect(slider.attributes('step')).toBe('0.1')
    expect(slider.attributes('aria-valuetext')).toBe('Passt')
    expect(page.findAll('label').some(el => el.text() === 'Zoom' && el.attributes('for') === slider.attributes('id'))).toBe(true)
  })

  it('has the crop buttons in a group named Profilbild, apart from the name form’s Speichern', async () => {
    await picked()

    expect(cropGroup().text()).toContain('Profilbild')
    expect(saveImage()).toBeDefined()
    expect(cancelImage()).toBeDefined()
    expect(saveImage().attributes('type')).toBe('button')
    expect(cancelImage().attributes('type')).toBe('button')
    const form = card().get('form')
    expect(form.findAll('button').filter(button => button.text() === 'Speichern')).toHaveLength(1)
    expect(form.element.contains(saveImage().element)).toBe(false)
  })

  it('lets the name be changed while the crop is open', async () => {
    registerEndpoint('/api/me/display-name', { method: 'PUT', handler: () => ({ displayName: 'Mieze' }) })
    await picked()

    const field = card().get('#display-name')
    await field.setValue('Mieze')
    expect(card().find('[data-crop-x]').exists()).toBe(true)
    expect((field.element as HTMLInputElement).value).toBe('Mieze')
    expect(card().get('form').findAll('button').find(button => button.text() === 'Speichern')!.attributes('aria-disabled')).not.toBe('true')
  })
})

describe('moving and zooming the picture (#910)', () => {
  it('makes the WebP once on release of a drag, with the crop and the profile target', async () => {
    await picked(WIDE)

    await pointer('pointerdown', { x: 50, y: 40 })
    await pointer('pointermove', { x: 66, y: 40 })
    await flushPromises()
    expect(tile().dataset.cropX).toBe('0.200')
    expect(calls()).toHaveLength(1)

    await pointer('pointerup', { x: 66, y: 40 })
    await flushPromises()

    expect(calls()).toHaveLength(2)
    expect(calls()[1]![0]).toBe(file)
    expect(lastCrop().x).toBeCloseTo(0.2, 6)
    expect(calls()[1]![2]).toEqual(PROFILE_IMAGE_TARGET)
  })

  it('makes the WebP 300 ms after the last arrow key', async () => {
    await picked(WIDE)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    expect((await key('ArrowRight')).defaultPrevented).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    await key('ArrowRight')
    await vi.advanceTimersByTimeAsync(299)
    expect(calls()).toHaveLength(1)
    expect(cropOf().x).toBeCloseTo(0.2, 6)

    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toHaveLength(2)
    expect(lastCrop().x).toBeCloseTo(0.2, 6)
    expect(calls()[1]![2]).toEqual(PROFILE_IMAGE_TARGET)
  })

  it('moves the tile at once on the slider and makes the WebP 300 ms after its change', async () => {
    await picked(WIDE)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await setZoom(2)
    expect(tile().dataset.cropZoom).toBe('2.000')
    expect(zoomSlider().attributes('aria-valuetext')).toBe('2,0×')
    expect(calls()).toHaveLength(1)

    await zoomSlider().trigger('change')
    await vi.advanceTimersByTimeAsync(299)
    expect(calls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toHaveLength(2)
    expect(lastCrop()).toEqual({ x: 0, y: 0, zoom: 2 })
    expect(calls()[1]![2]).toEqual(PROFILE_IMAGE_TARGET)
  })

  it('shows the round preview with the very placement of the tile, after a drag and after a zoom', async () => {
    await picked(WIDE)
    expect(disc().attributes('aria-hidden')).toBe('true')

    await drag(16)
    expect(tile().dataset.cropX).toBe('0.200')
    expect(placement(discImg())).toEqual(placement(tileImg()))

    await setZoom(2)
    expect(placement(tileImg()).width).not.toBe('')
    expect(placement(discImg())).toEqual(placement(tileImg()))
  })

  it('uses the square window: a 2000 × 1000 picture shows twice as wide as high in the tile', async () => {
    await picked(WIDE)

    expect(tileImg().style.width).toBe('200%')
    expect(tileImg().style.height).toBe('100%')
  })

  it('leaves Ctrl, Meta and Alt with an arrow key to the page', async () => {
    await picked(WIDE)

    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect((await key('ArrowRight', init)).defaultPrevented).toBe(false)
    }
    expect(cropOf().x).toBe(0)
  })

  it('has nothing to move on a 1000 × 1000 picture at zoom 1, and takes the touch only above it', async () => {
    await picked(SQUARE)

    await drag(30, 30)
    await key('ArrowRight')
    await key('ArrowDown')
    await flushPromises()
    expect(cropOf()).toEqual({ x: 0, y: 0 })
    expect(calls()).toHaveLength(1)
    expect(tile().className).toContain('touch-auto')

    await setZoom(1.5)
    expect(tile().className).toContain('touch-none')
  })

  it('moves a 2000 × 1000 picture on x only, and a 800 × 1600 one on y only', async () => {
    await picked(WIDE)
    expect(tile().className).toContain('touch-pan-y')
    await drag(30, 30)
    expect(tile().dataset.cropY).toBe('0.000')
    expect(Number(tile().dataset.cropX)).toBeGreaterThan(0)
    page.unmount()

    await picked(TALL)
    expect(tile().className).toContain('touch-pan-x')
    await drag(30, 30)
    expect(tile().dataset.cropX).toBe('0.000')
    expect(Number(tile().dataset.cropY)).toBeGreaterThan(0)
  })

  it('crops a picture smaller than 256 px without a throw', async () => {
    await picked({ width: 100, height: 100 })

    await setZoom(2)
    await drag(10)
    await flushPromises()

    expect(tile().dataset.cropZoom).toBe('2.000')
    expect(page.find('[data-crop-x]').exists()).toBe(true)
  })

  it('puts the tile back to the held crop when a new WebP cannot be made, and takes the banner away at the next that works', async () => {
    await picked(WIDE)
    toCardWebp.mockRejectedValue(new ImageConversionError())

    await drag(16)
    expect(tile().dataset.cropX).toBe('0.000')
    expect(cropGroup().text()).toContain('Dein Browser kann das Bild nicht umwandeln')

    toCardWebp.mockImplementation(async () => ({ blob: makeBlob(), ...WIDE }))
    await drag(16)
    expect(cropGroup().text()).not.toContain('Dein Browser kann das Bild nicht umwandeln')
    expect(tile().dataset.cropX).toBe('0.200')
  })
})

describe('„Speichern“ and „Abbrechen“ (#910)', () => {
  it('sends the WebP of the crop and no other, waiting for a make in flight, then shows the answered picture', async () => {
    await picked(WIDE)
    let finish!: () => void
    toCardWebp.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ blob: makeBlob(), ...WIDE })
    }))

    await drag(16)
    expect(calls()).toHaveLength(2)
    await saveImage().trigger('click')
    await flushPromises()
    expect(uploads).not.toHaveBeenCalled()

    finish()
    await vi.waitFor(() => expect(uploads).toHaveBeenCalledTimes(1))

    // The first make was the pick (byte 1), the second the drag (byte 2): the PUT carries the second.
    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', bytes: [2] })
    await vi.waitFor(() => expect(cardPicture().attributes('src')).toBe(uploaded))
    expect(page.find('[data-crop-x]').exists()).toBe(false)
    expect(useAuthUser().value?.image).toBe(uploaded)
    expect(useAuthUser().value?.hasOwnImage).toBe(true)
  })

  it('sends the pick’s own WebP when the crop was not touched, and focuses „Hochladen“ afterwards', async () => {
    await picked(WIDE)

    await saveImage().trigger('click')
    await vi.waitFor(() => expect(uploadButton()).toBeDefined())
    await flushPromises()

    expect(uploads).toHaveBeenCalledTimes(1)
    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', bytes: [1] })
    expect(document.activeElement).toBe(uploadButton().element)
  })

  it('sends nothing on „Abbrechen“, shows the old picture and the row again', async () => {
    await picked(WIDE)
    await drag(16)

    await cancelImage().trigger('click')
    await flushPromises()

    expect(uploads).not.toHaveBeenCalled()
    expect(page.find('[data-crop-x]').exists()).toBe(false)
    expect(cardPicture().attributes('src')).toBe(withPicture.image)
    expect(uploadButton()).toBeDefined()
    expect(useAuthUser().value?.image).toBe(withPicture.image)
  })

  it('freezes the crop and the buttons while the PUT is held, and closes the crop after it', async () => {
    let release!: () => void
    holdUpload = new Promise<void>((resolve) => {
      release = resolve
    })
    await picked(WIDE)

    await saveImage().trigger('click')
    await vi.waitFor(() => expect(uploads).toHaveBeenCalled())
    await flushPromises()

    expect(card().get('[role="status"]').text()).toBe('Bild lädt hoch')
    expect(saveImage().attributes('aria-disabled')).toBe('true')
    expect(cancelImage().attributes('aria-disabled')).toBe('true')
    const before = calls().length
    await drag(30)
    await key('ArrowRight')
    await setZoom(2)
    await zoomSlider().trigger('change')
    await flushPromises()
    expect(tile().dataset.cropX).toBe('0.000')
    expect(tile().dataset.cropZoom).toBe('1.000')
    expect(calls()).toHaveLength(before)
    await saveImage().trigger('click')
    await cancelImage().trigger('click')
    expect(uploads).toHaveBeenCalledTimes(1)
    expect(page.find('[data-crop-x]').exists()).toBe(true)

    release()
    await vi.waitFor(() => expect(page.find('[data-crop-x]').exists()).toBe(false))
  })

  it.each([
    ['500', { statusCode: 500, statusMessage: 'Internal Server Error' }],
    ['413', { statusCode: 413, statusMessage: 'image_too_large' }],
  ])('keeps the crop open at its crop and the old picture when the PUT fails with %s, and sends again on the next „Speichern“', async (_name, failure) => {
    uploadFailsWith = failure
    await picked(WIDE)
    await drag(16)

    await saveImage().trigger('click')
    await vi.waitFor(() => expect(card().text()).toContain('Das Bild hat nicht geklappt. Dein altes Bild bleibt.'))

    expect(tile().dataset.cropX).toBe('0.200')
    expect(useAuthUser().value?.image).toBe(withPicture.image)
    expect(card().find('[role="status"]').exists()).toBe(false)
    expect(saveImage().attributes('aria-disabled')).toBeUndefined()

    uploadFailsWith = null
    await saveImage().trigger('click')
    await vi.waitFor(() => expect(cardPicture().attributes('src')).toBe(uploaded))

    expect(uploads).toHaveBeenCalledTimes(2)
    expect(uploads.mock.calls[1]![0]).toEqual(uploads.mock.calls[0]![0])
  })

  it('clears the notice of a failed save on „Abbrechen“', async () => {
    uploadFailsWith = { statusCode: 500, statusMessage: 'Internal Server Error' }
    await picked(WIDE)
    await saveImage().trigger('click')
    await vi.waitFor(() => expect(card().text()).toContain('Das Bild hat nicht geklappt.'))

    await cancelImage().trigger('click')
    await flushPromises()

    expect(card().text()).not.toContain('Das Bild hat nicht geklappt.')
    expect(uploadButton()).toBeDefined()
  })

  it('ignores a second pick while the crop is open', async () => {
    await picked(WIDE)

    await pick(new File(['y'], 'other.png', { type: 'image/png' }))

    expect(calls()).toHaveLength(1)
    expect(calls()[0]![0]).toBe(file)
  })
})
