import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, getHeader, readBody, readRawBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreatePage from '~/pages/bibliothek/neu.vue'
import type { GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// The create page (#456): „Speichern und noch eins“ saves the game, toasts, and starts a fresh form with the cursor
// in the name; „Spiel anlegen“ leads to the game's page as before. The form itself is tested in game-form.test.ts.

// The image conversion needs a browser canvas; the page only sees a Blob.
const toCardWebp = vi.hoisted(() => vi.fn())
vi.mock('~/utils/image-resize', async importOriginal => ({ ...await importOriginal<object>(), toCardWebp }))

// The page handler reloads the Game library before it leaves; a test holds that reload to look at the form meanwhile (#573).
const refreshGameLibrary = vi.hoisted(() => vi.fn())
mockNuxtImport('refreshGameLibrary', () => refreshGameLibrary)

const created: GameView = {
  id: '00000000-0000-4000-8000-0000000000c1',
  name: 'Mario Kart',
  imageUrl: null,
  youtubeId: 'dQw4w9WgXcQ',
  clipStart: 72,
  clipLength: 30,
  playersMin: null,
  playersMax: null,
  suitabilities: [],
  createdBy: { id: kitty.id, name: 'Kitty' },
  createdAt: '2026-10-28T10:00:00.000Z',
  canEdit: true,
  notes: null,
  tags: [],
  price: null,
}
const withImage: GameView = { ...created, imageUrl: '/api/images/c1-abc.webp' }
const LINK = 'https://youtu.be/dQw4w9WgXcQ'

const posted = vi.fn()
const uploads = vi.fn()
let createFails = false
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: [], tagsInUse: [] }),
})
registerEndpoint('/api/games/tags', {
  method: 'GET',
  handler: () => [],
})
registerEndpoint('/api/games', {
  method: 'POST',
  handler: async (event) => {
    posted(await readBody(event))
    if (createFails) throw createError({ statusCode: 400, statusMessage: 'invalid_clip' })
    return created
  },
})
registerEndpoint(`/api/games/${created.id}/image`, {
  method: 'PUT',
  handler: async (event) => {
    uploads({ type: getHeader(event, 'content-type'), size: (await readRawBody(event, false))?.length })
    return withImage
  },
})

const cardWebp = new Blob([new Uint8Array(1234)], { type: 'image/webp' })

function mount() {
  return mountSuspended(CreatePage, { route: '/bibliothek/neu', attachTo: document.body })
}

function field(page: VueWrapper, label: string) {
  const labelEl = page.findAll('label').find(el => el.text() === label)
  if (!labelEl) throw new Error(`no field "${label}"`)
  return page.get(`[id="${labelEl.attributes('for')}"]`)
}

function valueOf(page: VueWrapper, label: string) {
  return (field(page, label).element as HTMLInputElement).value
}

function button(page: VueWrapper, text: string) {
  return page.findAll('button').find(candidate => candidate.text().trim() === text)!
}

function imagePreview(page: VueWrapper) {
  return page.find('img[alt="Vorschau des Bildes"]')
}

async function pick(page: VueWrapper, file = new File(['x'], 'cover.png', { type: 'image/png' })) {
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

/** Fills every field the form has, as a Host would for a game with a Tag, a Price, a Suitability and an image. */
async function fillEverything(page: VueWrapper) {
  await field(page, 'Name').setValue('Mario Kart')
  await field(page, 'YouTube-Link').setValue(LINK)
  await field(page, 'Start ab').setValue('1:12')
  await field(page, 'Tags').setValue('Co-op')
  await field(page, 'Tags').trigger('keydown', { key: 'Enter' })
  await field(page, 'Notizen').setValue('Hausregeln')
  await field(page, 'Betrag in €').setValue('19,99')
  await field(page, 'Wo gibt’s das Spiel?').setValue('steam')
  await button(page, 'Teams').trigger('click')
  await pick(page)
}

describe('the create page', () => {
  beforeEach(() => {
    signInAs({ ...kitty, canHost: true })
    useState('toasts').value = []
    posted.mockClear()
    uploads.mockClear()
    createFails = false
    toCardWebp.mockReset()
    toCardWebp.mockResolvedValue({ blob: cardWebp, width: 2000, height: 1000 })
    refreshGameLibrary.mockReset()
    refreshGameLibrary.mockResolvedValue(undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('saves, toasts the usual line, and empties every field, the image included, with the cursor in the name', async () => {
    const page = await mount()
    await fillEverything(page)
    expect(imagePreview(page).exists()).toBe(true)

    await button(page, 'Speichern und noch eins').trigger('click')

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Mario Kart ist in der Bibliothek.'))
    expect(uploads).toHaveBeenCalledTimes(1)
    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', size: 1234 })
    expect(field(page, 'Name').element).toBe(document.activeElement)
    expect(valueOf(page, 'Name')).toBe('')
    expect(valueOf(page, 'YouTube-Link')).toBe('')
    expect(valueOf(page, 'Notizen')).toBe('')
    expect(valueOf(page, 'Betrag in €')).toBe('')
    expect(valueOf(page, 'Start ab')).toBe('0:00')
    expect(valueOf(page, 'Ende')).toBe('0:30')
    expect(valueOf(page, 'Länge')).toBe('30')
    expect(page.findAll('button[aria-label^="Tag „"]')).toHaveLength(0)
    expect(button(page, 'Teams').attributes('aria-pressed')).toBe('false')
    expect(imagePreview(page).exists()).toBe(false)
    expect(useRoute().path).toBe('/bibliothek/neu')
    page.unmount()
  })

  it('carries nothing into the next game', async () => {
    const page = await mount()
    await fillEverything(page)
    await button(page, 'Speichern und noch eins').trigger('click')
    await vi.waitFor(() => expect(valueOf(page, 'Name')).toBe(''))
    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', size: 1234 })
    uploads.mockClear()
    posted.mockClear()

    await field(page, 'Name').setValue('Zelda')
    await button(page, 'Speichern und noch eins').trigger('click')

    await vi.waitFor(() => expect(posted).toHaveBeenCalledTimes(1))
    expect(posted).toHaveBeenCalledWith({ name: 'Zelda', youtubeUrl: '', clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], tags: [], notes: '', price: null })
    expect(uploads).not.toHaveBeenCalled()
    page.unmount()
  })

  it('the primary button still leads to the game\'s page', async () => {
    const page = await mount()
    await field(page, 'Name').setValue('Mario Kart')
    await field(page, 'YouTube-Link').setValue(LINK)

    // „Spiel anlegen“ is the form's submit button; the test submits the form as the other form tests do.
    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(useRoute().path).toBe(`/bibliothek/${created.id}`))
    expect(shownToasts().map(toast => toast.text)).toContain('Mario Kart ist in der Bibliothek.')
    page.unmount()
  })

  it('Strg + Enter in the name does what „Spiel anlegen“ does: it saves and leads to the game\'s page (#465)', async () => {
    const page = await mount()
    await field(page, 'Name').setValue('Mario Kart')
    await field(page, 'YouTube-Link').setValue(LINK)

    field(page, 'Name').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(useRoute().path).toBe(`/bibliothek/${created.id}`))
    expect(shownToasts().map(toast => toast.text)).toContain('Mario Kart ist in der Bibliothek.')
    page.unmount()
  })

  it('a failed save keeps the form and the route', async () => {
    createFails = true
    const page = await mount()
    await field(page, 'Name').setValue('Mario Kart')
    await field(page, 'YouTube-Link').setValue(LINK)
    await pick(page)

    await button(page, 'Speichern und noch eins').trigger('click')

    await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Der Clip passt nicht: Die Länge liegt zwischen 10 und 120 Sekunden.'))
    expect(valueOf(page, 'Name')).toBe('Mario Kart')
    expect(imagePreview(page).exists()).toBe(true)
    expect(useRoute().path).toBe('/bibliothek/neu')
    expect(shownToasts().map(toast => toast.text)).not.toContain('Mario Kart ist in der Bibliothek.')
    page.unmount()
  })

  describe('one save creates one game (#573)', () => {
    /** A promise the test settles by hand, to hold the page handler. */
    function deferred() {
      let release!: () => void
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      return { promise, release }
    }

    function pressCtrlEnter(page: VueWrapper) {
      field(page, 'Name').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
    }

    async function fillValid(page: VueWrapper) {
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'YouTube-Link').setValue(LINK)
    }

    it('two Strg + Enter while the page still reloads the library post one game', async () => {
      const gate = deferred()
      refreshGameLibrary.mockReturnValueOnce(gate.promise)
      const page = await mount()
      await fillValid(page)

      pressCtrlEnter(page)
      await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Mario Kart ist in der Bibliothek.'))
      await vi.waitFor(() => expect(refreshGameLibrary).toHaveBeenCalled())
      pressCtrlEnter(page)
      await flushPromises()
      expect(posted).toHaveBeenCalledTimes(1)

      gate.release()
      await vi.waitFor(() => expect(useRoute().path).toBe(`/bibliothek/${created.id}`))
      expect(posted).toHaveBeenCalledTimes(1)
      page.unmount()
    })

    it.each([
      ['submits the form, then presses Strg + Enter', async (page: VueWrapper) => {
        await page.get('form').trigger('submit')
        await vi.waitFor(() => expect(refreshGameLibrary).toHaveBeenCalled())
        pressCtrlEnter(page)
      }],
      ['presses Strg + Enter, then submits the form', async (page: VueWrapper) => {
        pressCtrlEnter(page)
        await vi.waitFor(() => expect(refreshGameLibrary).toHaveBeenCalled())
        await page.get('form').trigger('submit')
      }],
    ])('one POST when the Host %s', async (_name, act) => {
      const gate = deferred()
      refreshGameLibrary.mockReturnValueOnce(gate.promise)
      const page = await mount()
      await fillValid(page)

      await act(page)
      await flushPromises()
      expect(posted).toHaveBeenCalledTimes(1)

      gate.release()
      await vi.waitFor(() => expect(useRoute().path).toBe(`/bibliothek/${created.id}`))
      expect(posted).toHaveBeenCalledTimes(1)
      page.unmount()
    })

    // Guard: passes before the fix; it pins that a failure does not lock the form.
    it('a failed save can be repeated', async () => {
      createFails = true
      const page = await mount()
      await fillValid(page)

      pressCtrlEnter(page)
      await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Der Clip passt nicht: Die Länge liegt zwischen 10 und 120 Sekunden.'))
      createFails = false
      pressCtrlEnter(page)

      await vi.waitFor(() => expect(useRoute().path).toBe(`/bibliothek/${created.id}`))
      expect(posted).toHaveBeenCalledTimes(2)
      page.unmount()
    })
  })
})
