import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareDialog from '~/components/ShareDialog.vue'
import type { EventView } from '~~/shared/event'
import { dialog, shownToasts, view } from './event-page'

// „Bild teilen“ (#313): the sheet shows the route's real PNG of the chosen format, with its download and, where the browser can share files,
// „Teilen“. The route is a registered endpoint that answers per format, can be held back, and can fail; URL.createObjectURL is not in
// happy-dom, so it is a counting stub. What is asserted is what the Member sees and the requests the page makes.

let testNumber = 0

/** What the registered route has been asked, and what it does next. */
const route = {
  asked: [] as string[],
  /** Format -> a promise the answer waits for. */
  held: new Map<string, Promise<void>>(),
  failing: new Set<string>(),
}

/** An Event link of its own, whose share-image route answers `route`. */
function serveImages() {
  testNumber += 1
  const slug = `freitags-share-${testNumber}`
  registerEndpoint(`/api/e/${slug}/share-image`, {
    method: 'GET',
    handler: async (event) => {
      const format = String(getQuery(event).format)
      route.asked.push(format)
      await route.held.get(format)
      if (route.failing.has(format)) throw createError({ statusCode: 500, statusMessage: 'boom' })
      return new Blob([`png-${format}`], { type: 'image/png' })
    },
  })
  return slug
}

/** A finished Event of two Parties: Wilde Gurken win with 9, Nacht Eulen have 3. */
function finished(slug: string): EventView {
  return view(slug, [], {
    event: { phase: 'finished' },
    standings: [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 3 }],
    teams: [{ position: 1, name: 'Wilde Gurken', frozen: true }, { position: 2, name: 'Nacht Eulen', frozen: true }],
  }) as unknown as EventView
}

/** Holds the route's answer for the format until the returned function is called. */
function holdRoute(format: string): () => void {
  const gate = Promise.withResolvers<undefined>()
  route.held.set(format, gate.promise.then(() => {}))
  return () => gate.resolve(undefined)
}

function rejectWith(message: string, name: string) {
  return async () => {
    throw new DOMException(message, name)
  }
}

const created: string[] = []
const revoked: string[] = []
let counter = 0

beforeEach(() => {
  document.body.innerHTML = ''
  route.asked = []
  route.held.clear()
  route.failing.clear()
  created.length = 0
  revoked.length = 0
  counter = 0
  URL.createObjectURL = vi.fn(() => {
    counter += 1
    created.push(`blob:share-${counter}`)
    return `blob:share-${counter}`
  })
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url))
  useState('toasts').value = []
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
})

/** What a press of „Bild herunterladen“ hands the browser: the address and the file name of the link the click makes. */
async function download() {
  const handed: { href: string, download: string }[] = []
  const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    handed.push({ href: this.getAttribute('href')!, download: this.download })
  })
  buttonNamed('Bild herunterladen')!.click()
  await flush()
  spy.mockRestore()
  return handed
}

const flush = async () => {
  await new Promise(resolve => setTimeout(resolve))
  await flushPromises()
}
const picture = () => dialog()?.querySelector<HTMLImageElement>('img') ?? null
const radio = (label: string) => [...(dialog()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].find(node => node.textContent?.trim() === label)!
const buttonNamed = (label: string) => [...(dialog()?.querySelectorAll<HTMLElement>('button, a') ?? [])].find(node => node.textContent?.trim() === label) ?? null

/** Lets the browser claim it can share files (or not) before the sheet mounts. */
function browserCanShare(answer: boolean, share = vi.fn(async () => {})) {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => answer) })
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  return share
}

async function open(slug: string, props: { open?: boolean } = {}) {
  const sheet = await mountSuspended(ShareDialog, { props: { open: true, view: finished(slug), ...props } })
  await flush()
  return sheet
}

describe('the share sheet', () => {
  it('shows the loading state, then the real picture with the alt text of the model', async () => {
    const slug = serveImages()
    const release = holdRoute('wide')

    await open(slug)

    expect(dialog()!.textContent).toContain('Ergebnis teilen')
    expect(dialog()!.textContent).toContain('Bild wird erstellt')
    expect(picture()).toBeNull()
    release()
    await flush()
    expect(picture()!.getAttribute('src')).toBe('blob:share-1')
    expect(picture()!.getAttribute('alt')).toBe('Wilde Gurken gewinnt Freitags-Zocken mit 9 Punkten. Platz 2: Nacht Eulen, 3 Punkte.')
    expect(route.asked).toEqual(['wide'])
  })

  it('keeps the shape of the picture before it is there, for both formats', async () => {
    const slug = serveImages()
    route.held.set('wide', new Promise(() => {}))
    route.held.set('square', new Promise(() => {}))

    await open(slug)
    const box = () => dialog()!.querySelector<HTMLElement>('[aria-busy="true"]')!
    expect(box().style.aspectRatio.replaceAll(' ', '')).toBe('1200/630')
    radio('Quadrat').click()
    await flush()
    expect(box().style.aspectRatio.replaceAll(' ', '')).toBe('1/1')
  })

  it('asks nothing while it is closed, and asks when it opens', async () => {
    const slug = serveImages()

    const sheet = await open(slug, { open: false })
    expect(route.asked).toEqual([])

    await sheet.setProps({ open: true })
    await flush()
    expect(route.asked).toEqual(['wide'])
  })

  describe('the format', () => {
    it('is Querformat first, and the switch changes the request, the picture and the download', async () => {
      const slug = serveImages()
      await open(slug)
      expect(radio('Querformat').getAttribute('aria-checked')).toBe('true')
      expect(await download()).toEqual([{ href: 'blob:share-1', download: `${slug}-querformat.png` }])

      radio('Quadrat').click()
      await flush()

      expect(route.asked).toEqual(['wide', 'square'])
      expect(radio('Quadrat').getAttribute('aria-checked')).toBe('true')
      expect(picture()!.getAttribute('src')).toBe('blob:share-2')
      expect(await download()).toEqual([{ href: 'blob:share-2', download: `${slug}-quadrat.png` }])
    })

    it('asks nothing when the Member switches back to a picture it has', async () => {
      const slug = serveImages()
      await open(slug)
      radio('Quadrat').click()
      await flush()

      radio('Querformat').click()
      await flush()

      expect(route.asked).toEqual(['wide', 'square'])
      expect(picture()!.getAttribute('src')).toBe('blob:share-1')
    })

    it('ignores the answer of the format it left, when it comes late', async () => {
      const slug = serveImages()
      const releaseWide = holdRoute('wide')
      await open(slug)

      radio('Quadrat').click()
      await flush()
      expect(picture()!.getAttribute('src')).toBe('blob:share-1')
      releaseWide()
      await flush()

      // The wide answer was dropped: no object URL was made for it, and the square one is still shown.
      expect(created).toEqual(['blob:share-1'])
      expect(picture()!.getAttribute('src')).toBe('blob:share-1')
      expect(await download()).toEqual([{ href: 'blob:share-1', download: `${slug}-quadrat.png` }])
    })
  })

  describe('the download', () => {
    it('waits, disabled with its reason, until the picture is there', async () => {
      const slug = serveImages()
      route.held.set('wide', new Promise(() => {}))

      await open(slug)

      const wait = buttonNamed('Bild herunterladen')!
      expect(wait.getAttribute('aria-disabled')).toBe('true')
      expect(dialog()!.querySelector(`#${wait.getAttribute('aria-describedby')}`)!.textContent).toContain('Bild wird erstellt')
      expect(await download()).toEqual([])
    })
  })

  describe('„Teilen“', () => {
    it('is not there when the browser cannot share at all', async () => {
      await open(serveImages())

      expect(buttonNamed('Teilen')).toBeNull()
    })

    it('is not there when the browser says it cannot share files', async () => {
      browserCanShare(false)
      await open(serveImages())

      expect(buttonNamed('Teilen')).toBeNull()
      expect(navigator.canShare).toHaveBeenCalledWith({ files: [expect.objectContaining({ type: 'image/png' })] })
    })

    it('is there when it can, and hands the loaded picture over as a PNG file under the file name', async () => {
      const share = browserCanShare(true)
      const slug = serveImages()
      await open(slug)

      buttonNamed('Teilen')!.click()
      await flush()

      expect(share).toHaveBeenCalledTimes(1)
      const [{ files: [file] }] = share.mock.calls[0] as unknown as [{ files: File[] }]
      expect(file!.name).toBe(`${slug}-querformat.png`)
      expect(file!.type).toBe('image/png')
      expect(await file!.text()).toBe('png-wide')
      expect(route.asked).toEqual(['wide'])
    })

    it('does nothing until the picture is there', async () => {
      const share = browserCanShare(true)
      const slug = serveImages()
      route.held.set('wide', new Promise(() => {}))
      await open(slug)

      buttonNamed('Teilen')!.click()
      await flush()

      expect(buttonNamed('Teilen')!.getAttribute('aria-disabled')).toBe('true')
      expect(share).not.toHaveBeenCalled()
    })

    it('stays silent when the Member dismisses the share sheet', async () => {
      browserCanShare(true, vi.fn(rejectWith('dismissed', 'AbortError')))
      await open(serveImages())

      buttonNamed('Teilen')!.click()
      await flush()

      expect(shownToasts()).toEqual([])
    })

    it('says so when sharing fails for another reason', async () => {
      browserCanShare(true, vi.fn(rejectWith('no', 'NotAllowedError')))
      await open(serveImages())

      buttonNamed('Teilen')!.click()
      await flush()

      expect(shownToasts()).toEqual([expect.objectContaining({ tone: 'error', text: 'Teilen hat nicht geklappt.' })])
    })
  })

  describe('when the picture cannot be made', () => {
    it('says so and offers „Erneut versuchen“, which asks again', async () => {
      const slug = serveImages()
      route.failing.add('wide')
      await open(slug)

      expect(dialog()!.textContent).toContain('Das Bild konnte nicht erstellt werden.')
      expect(picture()).toBeNull()
      expect(buttonNamed('Bild herunterladen')!.getAttribute('aria-disabled')).toBe('true')

      route.failing.clear()
      buttonNamed('Erneut versuchen')!.click()
      await flush()

      expect(route.asked).toEqual(['wide', 'wide'])
      expect(picture()!.getAttribute('src')).toBe('blob:share-1')
    })
  })

  describe('closing', () => {
    it('revokes every object URL it made', async () => {
      const slug = serveImages()
      const sheet = await open(slug)
      radio('Quadrat').click()
      await flush()
      expect(created).toEqual(['blob:share-1', 'blob:share-2'])

      await sheet.setProps({ open: false })
      await flush()

      expect(revoked.sort()).toEqual(['blob:share-1', 'blob:share-2'])
      expect(dialog()).toBeNull()
    })

    it('stops a picture that is still being made: no object URL for its late answer', async () => {
      const slug = serveImages()
      const release = holdRoute('wide')
      const sheet = await open(slug)

      await sheet.setProps({ open: false })
      release()
      await flush()

      expect(created).toEqual([])
    })

    it('asks again, from the start, when it is opened again', async () => {
      const slug = serveImages()
      const sheet = await open(slug)
      await sheet.setProps({ open: false })
      await flush()

      await sheet.setProps({ open: true })
      await flush()

      expect(route.asked).toEqual(['wide', 'wide'])
      expect(picture()!.getAttribute('src')).toBe('blob:share-2')
    })
  })
})
