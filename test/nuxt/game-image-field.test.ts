import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, getHeader, readRawBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameForm from '~/components/GameForm.vue'
import { ImageConversionError } from '~/utils/image-resize'
import type { GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'

// The canvas does the real work (needs a browser); the form only sees a Blob.
const toCardWebp = vi.hoisted(() => vi.fn())
vi.mock('~/utils/image-resize', async importOriginal => ({ ...await importOriginal<object>(), toCardWebp }))

const created: GameView = {
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'Mario Kart',
  imageUrl: null,
  youtubeId: null,
  clipStart: 0,
  clipLength: 30,
  playersMin: null,
  playersMax: null,
  formats: [],
  createdBy: { id: kitty.id, name: 'Kitty' },
  createdAt: '2026-10-28T10:00:00.000Z',
  canEdit: true,
}
const withImage: GameView = { ...created, imageUrl: '/api/images/b1-abc.webp' }

const creates = vi.fn()
const uploads = vi.fn()
let uploadFailsWith: string | null = null
registerEndpoint('/api/games', {
  method: 'POST',
  handler: () => {
    creates()
    return created
  },
})
registerEndpoint(`/api/games/${created.id}/image`, {
  method: 'PUT',
  handler: async (event) => {
    uploads({ type: getHeader(event, 'content-type'), size: (await readRawBody(event, false))?.length })
    if (uploadFailsWith) throw createError({ statusCode: 413, statusMessage: uploadFailsWith })
    return withImage
  },
})

const cardWebp = new Blob([new Uint8Array(1234)], { type: 'image/webp' })

function field(page: VueWrapper, label: string) {
  const labelEl = page.findAll('label').find(el => el.text() === label)
  if (!labelEl) throw new Error(`no field "${label}"`)
  return page.get(`[id="${labelEl.attributes('for')}"]`)
}

async function pick(page: VueWrapper, file = new File(['x'], 'cover.png', { type: 'image/png' })) {
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

async function save(page: VueWrapper) {
  await field(page, 'Name').setValue('Mario Kart')
  await page.get('form').trigger('submit')
}

describe('the image in the game form (#143)', () => {
  beforeEach(() => {
    signInAs({ ...kitty, canHost: true })
    creates.mockClear()
    uploads.mockClear()
    toCardWebp.mockReset()
    toCardWebp.mockResolvedValue(cardWebp)
    uploadFailsWith = null
    // The test environment's Blob is not the one Node's object URLs know.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    useToast().toasts.value.forEach(toast => useToast().dismiss(toast.id))
  })

  it('shows a dashed 16:10 placeholder and a button to choose the image', async () => {
    const page = await mountSuspended(GameForm)

    expect(page.text()).toContain('16:10')
    expect(page.find('img[alt="Vorschau des Bildes"]').exists()).toBe(false)
    expect(page.findAll('button').some(button => button.text() === 'Bild wählen')).toBe(true)
  })

  it('shows the cropped result right after choosing', async () => {
    const page = await mountSuspended(GameForm)

    await pick(page)

    await vi.waitFor(() => expect(page.find('img[alt="Vorschau des Bildes"]').exists()).toBe(true))
    expect(toCardWebp).toHaveBeenCalledOnce()
    expect(page.findAll('button').some(button => button.text() === 'Anderes Bild wählen')).toBe(true)
  })

  it('creates the game first, then puts the WebP, and says saved with the game the upload returns', async () => {
    const page = await mountSuspended(GameForm)
    await pick(page)
    await vi.waitFor(() => expect(page.find('img[alt="Vorschau des Bildes"]').exists()).toBe(true))

    await save(page)

    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[withImage]]))
    expect(creates).toHaveBeenCalledOnce()
    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', size: 1234 })
  })

  it('puts nothing when no image was chosen', async () => {
    const page = await mountSuspended(GameForm)

    await save(page)

    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[created]]))
    expect(uploads).not.toHaveBeenCalled()
  })

  it('still says saved when the upload fails after the game exists, and tells why in a toast', async () => {
    uploadFailsWith = 'image_too_large'
    const page = await mountSuspended(GameForm)
    await pick(page)
    await vi.waitFor(() => expect(page.find('img[alt="Vorschau des Bildes"]').exists()).toBe(true))

    await save(page)

    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[created]]))
    expect(useToast().toasts.value.map(toast => [toast.tone, toast.text])).toEqual([
      ['error', 'Das Spiel ist gespeichert, das Bild nicht: Das Bild ist zu groß.'],
    ])
  })

  it('says so when the browser cannot convert the picture, and keeps the form usable', async () => {
    toCardWebp.mockRejectedValue(new ImageConversionError())
    const page = await mountSuspended(GameForm)

    await pick(page)

    await vi.waitFor(() => expect(page.text()).toContain('Dein Browser kann das Bild nicht umwandeln. Probier’s mit Chrome oder Firefox.'))
    expect(page.find('img[alt="Vorschau des Bildes"]').exists()).toBe(false)

    await save(page)
    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[created]]))
    expect(uploads).not.toHaveBeenCalled()
  })

  it('shows the image the game already has', async () => {
    const page = await mountSuspended(GameForm, { props: { game: withImage } })

    expect(page.get('img[alt="Vorschau des Bildes"]').attributes('src')).toBe('/api/images/b1-abc.webp')
    expect(page.findAll('button').some(button => button.text() === 'Anderes Bild wählen')).toBe(true)
  })
})

// Edit mode (#142): an image picked while editing is uploaded after the changes are saved, like a new one (#143).
const patches = vi.fn()
registerEndpoint(`/api/games/${created.id}`, {
  method: 'PATCH',
  handler: () => {
    patches()
    return created
  },
})

describe('an image picked while editing the game (#142, #143)', () => {
  beforeEach(() => {
    signInAs({ ...kitty, canHost: true })
    creates.mockClear()
    patches.mockClear()
    uploads.mockClear()
    toCardWebp.mockReset()
    toCardWebp.mockResolvedValue(cardWebp)
    uploadFailsWith = null
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    useToast().toasts.value.forEach(toast => useToast().dismiss(toast.id))
  })

  it('saves the changes first, then puts the WebP, and says saved with the game the upload returns', async () => {
    const page = await mountSuspended(GameForm, { props: { game: created } })
    await pick(page)
    await vi.waitFor(() => expect(page.find('img[alt="Vorschau des Bildes"]').exists()).toBe(true))

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[withImage]]))
    expect(patches).toHaveBeenCalledOnce()
    expect(creates).not.toHaveBeenCalled()
    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', size: 1234 })
  })

  it('puts nothing when the image was not changed', async () => {
    const page = await mountSuspended(GameForm, { props: { game: created } })

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[created]]))
    expect(patches).toHaveBeenCalledOnce()
    expect(uploads).not.toHaveBeenCalled()
  })
})
