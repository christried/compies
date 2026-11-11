import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameNotesButton from '~/components/GameNotesButton.vue'
import { GAME_NAME_MAX } from '~~/shared/game'
import { restoreScreen, stubScreen } from './event-page'

// The Notes button of a game in the pickers (#436, 02-components § GameCard, deviation 0.12): a read-only popover from md up, a
// sheet below, the notes with their line breaks. Escape or a press outside closes the popover and focus goes back to the button.

const TRIGGER = 'button[aria-label="Notizen ansehen"]'
const NOTES = 'Zeile eins\n\nZeile drei'

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
let setWide: (next: boolean) => void

async function mount(props: { name?: string, notes: string | null }) {
  page = await mountSuspended(GameNotesButton, { props: { name: 'Mario Kart', ...props }, attachTo: document.body })
  await flushPromises()
  return page
}

const trigger = () => document.querySelector<HTMLButtonElement>(TRIGGER)!
const popover = () => document.querySelector<HTMLElement>('[role="dialog"]:not([data-sheet])')
const sheet = () => document.querySelector<HTMLElement>('[data-sheet="panel"]')
const paragraph = (within: Element | null) => within!.querySelector('p')!
const open = async () => {
  trigger().click()
  await flushPromises()
}

beforeEach(() => {
  document.body.innerHTML = ''
  setWide = stubScreen(true)
})

afterEach(() => {
  page?.unmount()
  page = undefined
  restoreScreen()
})

describe('the Notes button of a game (#436)', () => {
  it('renders nothing for a game without Notes, null or blank', async () => {
    await mount({ notes: null })
    expect(document.querySelector(TRIGGER)).toBeNull()
    page!.unmount()

    await mount({ notes: '' })
    expect(document.querySelector(TRIGGER)).toBeNull()
  })

  it('is a button named „Notizen ansehen“ that starts closed', async () => {
    await mount({ notes: NOTES })

    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog')
    expect(popover()).toBeNull()
    expect(sheet()).toBeNull()
  })

  it('opens a sheet below md, with the notes exactly as stored, line breaks included', async () => {
    setWide(false)
    await mount({ notes: NOTES })

    await open()

    expect(sheet()).not.toBeNull()
    expect(sheet()!.getAttribute('role')).toBe('dialog')
    expect(sheet()!.querySelector('h2')!.textContent).toBe('Mario Kart')
    expect(paragraph(sheet()).textContent).toBe(NOTES)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('opens a popover from md up, fixed and 288 px wide, with focus on its close button', async () => {
    await mount({ notes: NOTES })

    await open()

    expect(sheet()).toBeNull()
    expect(popover()).not.toBeNull()
    expect(popover()!.classList).toContain('fixed')
    expect(popover()!.classList).toContain('w-72')
    expect(popover()!.getAttribute('aria-labelledby')).toBeTruthy()
    expect(popover()!.querySelector('h2')!.textContent).toBe('Mario Kart')
    expect(paragraph(popover()).textContent).toBe(NOTES)
    expect(document.activeElement).toBe(popover()!.querySelector('button[aria-label="Schließen"]'))
  })

  it('closes on Escape and gives the focus back to the button', async () => {
    await mount({ notes: NOTES })
    await open()

    popover()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a press outside and gives the focus back to the button', async () => {
    await mount({ notes: NOTES })
    await open()

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('keeps all of a 1000-character note, line breaks included, inside a scrolling popover', async () => {
    const long = `${'a'.repeat(495)}\n${'b'.repeat(495)}\n\n`
    expect(long.length).toBeLessThanOrEqual(1000)
    await mount({ notes: long })
    await open()

    expect(paragraph(popover()).textContent).toBe(long)
    expect(popover()!.classList).toContain('overflow-y-auto')
    expect(popover()!.className).toContain('max-h-[min(60vh,420px)]')
  })

  it('keeps a game name of the longest allowed length in full', async () => {
    const name = 'W'.repeat(GAME_NAME_MAX)
    await mount({ name, notes: NOTES })
    await open()

    expect(popover()!.querySelector('h2')!.textContent).toBe(name)
    expect(popover()!.querySelector('h2')!.className).toContain('[overflow-wrap:anywhere]')
  })
  it('stays inside the window for a button low in the picker (#488)', async () => {
    const realHeight = window.innerHeight
    window.innerHeight = 800
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.getAttribute('aria-label') === 'Notizen ansehen') return at(650, 400, 40, 36)
      if (this.getAttribute('role') === 'dialog') return at(0, 0, 288, 300)
      return at(0, 0, 0, 0)
    })
    try {
      await mount({ notes: NOTES })

      await open()

      const style = popover()!.style
      const top = Number.parseFloat(style.top)
      const left = Number.parseFloat(style.left)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(top + 300).toBeLessThanOrEqual(800)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + 288).toBeLessThanOrEqual(window.innerWidth)
    }
    finally {
      measure.mockRestore()
      window.innerHeight = realHeight
    }
  })

  it('caps a popover that fits on neither side, so it scrolls inside the window (#494)', async () => {
    const realHeight = window.innerHeight
    window.innerHeight = 900
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.getAttribute('aria-label') === 'Notizen ansehen') return at(430, 400, 40, 36)
      if (this.getAttribute('role') === 'dialog') return at(0, 0, 288, 420)
      return at(0, 0, 0, 0)
    })
    try {
      await mount({ notes: NOTES })

      await open()

      // Below the button there are 900 − 466 = 434 px, above it 430 px: below is the roomier side, capped at 434 − 12 − 12.
      expect(Number.parseFloat(popover()!.style.top)).toBe(478)
      expect(popover()!.style.maxHeight).toBe('410px')
    }
    finally {
      measure.mockRestore()
      window.innerHeight = realHeight
    }
  })
})
