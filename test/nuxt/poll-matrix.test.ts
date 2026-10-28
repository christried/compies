import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PollMatrix from '~/components/PollMatrix.vue'
import { kitty, signInAs } from './auth'

// "Wer kann wann?" with its CSV export (#84): the button sits with the matrix, shows for every Member,
// and downloads the file in the browser with no request.

const props = {
  people: [{ id: 'u1', name: 'Anna', image: null, isHost: true }, { id: 'u2', name: 'Bo', image: null, isHost: false }],
  slots: [{ id: 's1', day: 'Sa 24.10.', time: '20:30', past: false }],
  votes: [{ slotId: 's1', userId: 'u1', value: 'yes' as const }],
  meId: 'u2',
}

// Bo has a Note on Meh (#125): that cell opens a popover or a dialog.
const withNote = {
  ...props,
  votes: [...props.votes, { slotId: 's1', userId: 'u2', value: 'maybe' as const, note: 'kann maximal bis 20:30' }],
}

function pointer(type: string, target: Element, pointerType: string) {
  const event = new Event(type, { bubbles: type !== 'pointerenter' && type !== 'pointerleave' })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  target.dispatchEvent(event)
}

const popover = () => document.body.querySelector('[class*="shadow-soft"][aria-hidden="true"]')
const dialog = () => document.body.querySelector('[role="dialog"]')

async function mountWithNote() {
  const page = await mountSuspended(PollMatrix, { props: withNote, route: '/e/freitags-zocken-k7q2', attachTo: document.body })
  const cell = page.get('td button').element as HTMLButtonElement
  return { page, cell }
}

beforeEach(() => {
  signInAs(kitty)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('PollMatrix', () => {
  it('keeps the name column sticky on the left, so the Votes scroll under it', async () => {
    const page = await mountSuspended(PollMatrix, { props, route: '/e/freitags-zocken-k7q2' })

    const rowHeader = page.find('tbody th')
    expect(rowHeader.classes()).toEqual(expect.arrayContaining(['sticky', 'left-0', 'bg-surface']))
  }, 15000)

  it('shows the CSV button to a Member and downloads <slug>-terminumfrage.csv', async () => {
    const createObjectURL = vi.fn(() => 'blob:poll')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    const page = await mountSuspended(PollMatrix, { props, route: '/e/freitags-zocken-k7q2' })

    const button = page.findAll('button').find(candidate => candidate.text() === 'Als CSV exportieren')
    expect(button).toBeDefined()
    await button!.trigger('click')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('freitags-zocken-k7q2-terminumfrage.csv')
    expect(clicked[0]!.href).toBe('blob:poll')
  })

  describe('a cell with a Note', () => {
    it('shows the popover with the name, the Vote and the Note on focus, and hides it on blur and on Escape', async () => {
      const { cell } = await mountWithNote()

      cell.focus()
      await nextTick()
      expect(popover()?.textContent).toContain('Bo')
      expect(popover()?.textContent).toContain('Meh')
      expect(popover()?.textContent).toContain('„kann maximal bis 20:30“')

      cell.blur()
      await nextTick()
      expect(popover()).toBeNull()

      cell.focus()
      await nextTick()
      cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      expect(popover()).toBeNull()
      expect(document.activeElement).toBe(cell)
    }, 15000)

    it('keeps the popover away from screen readers, the cell says it all', async () => {
      const { cell } = await mountWithNote()

      cell.focus()
      await nextTick()

      expect(popover()?.getAttribute('aria-hidden')).toBe('true')
      expect(popover()?.getAttribute('role')).toBeNull()
      expect(cell.getAttribute('aria-haspopup')).toBe('dialog')
      expect(cell.querySelector('.sr-only')?.textContent).toBe('Meh: kann maximal bis 20:30')
    }, 15000)

    it('opens on mouse hover and closes 120 ms after the pointer leaves', async () => {
      const { cell } = await mountWithNote()

      pointer('pointerenter', cell, 'mouse')
      await nextTick()
      expect(popover()).not.toBeNull()

      vi.useFakeTimers()
      pointer('pointerleave', cell, 'mouse')
      vi.advanceTimersByTime(100)
      await nextTick()
      expect(popover()).not.toBeNull()
      pointer('pointerenter', cell, 'mouse')
      vi.advanceTimersByTime(500)
      await nextTick()
      expect(popover()).not.toBeNull()

      pointer('pointerleave', cell, 'mouse')
      vi.advanceTimersByTime(130)
      await nextTick()
      expect(popover()).toBeNull()
    }, 15000)

    it('ignores a touch hover and opens the dialog on a tap, focus back on the cell when it closes', async () => {
      const { cell } = await mountWithNote()

      pointer('pointerenter', cell, 'touch')
      pointer('pointerdown', cell, 'touch')
      await nextTick()
      expect(popover()).toBeNull()
      cell.click()
      await nextTick()

      const opened = dialog()!
      expect(opened.getAttribute('aria-modal')).toBe('true')
      expect(document.getElementById(opened.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Bo')
      expect(opened.textContent).toContain('Meh')
      expect(opened.textContent).toContain('kann maximal bis 20:30')
      await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Schließen'))

      ;(document.activeElement as HTMLElement).click()
      await nextTick()
      expect(dialog()).toBeNull()
      await vi.waitFor(() => expect(document.activeElement).toBe(cell))
      expect(popover()).toBeNull()
    }, 15000)

    it('closes the dialog from the overlay', async () => {
      const { cell } = await mountWithNote()

      pointer('pointerdown', cell, 'pen')
      cell.click()
      await nextTick()
      expect(dialog()).not.toBeNull()

      ;(document.body.querySelector('.bg-overlay') as HTMLElement).click()
      await nextTick()
      expect(dialog()).toBeNull()
    }, 15000)

    it('opens the dialog from the keyboard and not from a mouse click', async () => {
      const { cell } = await mountWithNote()

      pointer('pointerdown', cell, 'mouse')
      cell.click()
      await nextTick()
      expect(dialog()).toBeNull()

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      cell.click()
      await nextTick()
      expect(dialog()).not.toBeNull()
    }, 15000)
  })

  describe('a cell without a Note', () => {
    it('is not focusable and opens nothing', async () => {
      const page = await mountSuspended(PollMatrix, { props, route: '/e/freitags-zocken-k7q2', attachTo: document.body })

      expect(page.find('td button').exists()).toBe(false)
      const cell = page.get('td div').element
      pointer('pointerenter', cell, 'mouse')
      pointer('pointerdown', cell, 'touch')
      ;(cell as HTMLElement).click()
      await nextTick()

      expect(popover()).toBeNull()
      expect(dialog()).toBeNull()
    }, 15000)
  })

  it('has no native tooltip on any cell', async () => {
    await mountWithNote()

    expect(document.querySelectorAll('table [title]')).toHaveLength(0)
  }, 15000)
})
