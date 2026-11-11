import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import AppSheet from '~/components/AppSheet.vue'
import HintElement from '~/components/HintElement.vue'

// The hint element (#515, 02-components § HintElement): a „?“ button with a popover for a short text or a slot. Click toggles it; Esc, a
// press outside and a scroll outside close it; Esc and a press outside return the focus to the button, a scroll and a resize leave it.

const TEXT = 'Strg + Enter speichert'

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(options: { props?: Record<string, unknown>, slots?: Record<string, () => unknown> } = {}) {
  page = await mountSuspended(HintElement, { props: { text: TEXT, ...options.props }, slots: options.slots as never, attachTo: document.body })
  await flushPromises()
  return page
}

const triggers = () => [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Hinweis anzeigen"]')]
const trigger = () => triggers()[0]!
const popovers = () => [...document.querySelectorAll<HTMLElement>('[role="note"]')]
const popover = () => popovers()[0] ?? null
const click = async (button: HTMLElement) => {
  button.click()
  await flushPromises()
}
const escape = async (target: EventTarget) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
}
const pointerDown = async (target: EventTarget) => {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await flushPromises()
}

function measureWith(sizes: { button: [number, number, number, number], popover: [number, number] }) {
  const at = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('aria-label') === 'Hinweis anzeigen') return at(...sizes.button)
    if (this.getAttribute('role') === 'note') return at(0, 0, ...sizes.popover)
    return at(0, 0, 0, 0)
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the hint element (#515)', () => {
  it('starts closed with a named button', async () => {
    await mount()

    expect(trigger().getAttribute('aria-label')).toBe('Hinweis anzeigen')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().hasAttribute('aria-controls')).toBe(false)
    expect(popover()).toBeNull()
  })

  it('opens on a click: it says so, points at the popover, shows the text and keeps the focus on the button', async () => {
    await mount()
    // A browser focuses the button it clicks or tabs to; `click()` here does not.
    trigger().focus()

    await click(trigger())

    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(popover()).not.toBeNull()
    expect(trigger().getAttribute('aria-controls')).toBe(popover()!.id)
    expect(popover()!.id).not.toBe('')
    expect(popover()!.textContent).toContain(TEXT)
    expect(popover()!.className).toContain('fixed')
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a second click', async () => {
    await mount()
    await click(trigger())

    await click(trigger())

    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(popover()).toBeNull()
  })

  it('closes on Escape and gives the focus to the button, also after a click on the popover moved it away', async () => {
    await mount()
    await click(trigger())

    await escape(trigger())

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())

    await click(trigger())
    trigger().blur()
    await escape(document.body)

    expect(popover()).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })

  it('does not stop Escape while it is closed', async () => {
    await mount()
    const seen = vi.fn()
    document.body.addEventListener('keydown', seen)

    await escape(document.body)

    expect(seen).toHaveBeenCalledTimes(1)
    document.body.removeEventListener('keydown', seen)
  })

  it('closes on a press outside and gives the focus to the button; a press on the popover or the button does not close it', async () => {
    await mount()
    await click(trigger())

    await pointerDown(popover()!)
    expect(popover()).not.toBeNull()
    await pointerDown(trigger())
    expect(popover()).not.toBeNull()

    trigger().blur()
    await pointerDown(document.body)

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('on Escape inside a sheet closes only the hint; a second Escape closes the sheet', async () => {
    const sheetOpen = ref(true)
    const Wrapper = defineComponent({
      setup: () => () => h(AppSheet, { open: sheetOpen.value, title: 'Spiel anlegen', onClose: () => { sheetOpen.value = false } }, { default: () => h(HintElement, { text: TEXT }) }),
    })
    page = await mountSuspended(Wrapper, { attachTo: document.body })
    await flushPromises()
    await click(trigger())
    expect(popover()).not.toBeNull()

    await escape(trigger())

    expect(popover()).toBeNull()
    expect(document.querySelector('[data-sheet="panel"]')).not.toBeNull()
    expect(sheetOpen.value).toBe(true)

    await escape(trigger())

    expect(sheetOpen.value).toBe(false)
  })

  it('stays inside the window near its right edge', async () => {
    const realWidth = window.innerWidth
    const realHeight = window.innerHeight
    window.innerWidth = 1440
    window.innerHeight = 900
    const measure = measureWith({ button: [300, 1400, 32, 32], popover: [288, 60] })
    try {
      await mount()

      await click(trigger())

      const style = popover()!.style
      const left = Number.parseFloat(style.left)
      expect(left).toBe(1440 - 12 - 288)
      expect(left + 288).toBeLessThanOrEqual(window.innerWidth)
      expect(Number.parseFloat(style.top)).toBe(300 - 12 - 60)
    }
    finally {
      measure.mockRestore()
      window.innerWidth = realWidth
      window.innerHeight = realHeight
    }
  })

  it('flips below the button near the top of the window', async () => {
    const realHeight = window.innerHeight
    window.innerHeight = 900
    const measure = measureWith({ button: [20, 1000, 32, 32], popover: [288, 60] })
    try {
      await mount()

      await click(trigger())

      expect(Number.parseFloat(popover()!.style.top)).toBe(20 + 32 + 12)
    }
    finally {
      measure.mockRestore()
      window.innerHeight = realHeight
    }
  })

  it('shows its slot instead of the text', async () => {
    await mount({ slots: { default: () => h('strong', 'Strg') } })

    await click(trigger())

    expect(popover()!.querySelector('strong')!.textContent).toBe('Strg')
    expect(popover()!.textContent).not.toContain(TEXT)
  })

  it('caps a very long content so it scrolls inside the window', async () => {
    const realHeight = window.innerHeight
    window.innerHeight = 900
    const measure = measureWith({ button: [430, 600, 32, 32], popover: [288, 800] })
    try {
      await mount({ slots: { default: () => h('p', 'x'.repeat(600)) } })

      await click(trigger())

      // Below the button there are 900 − 462 = 438 px, above it 430: below is the roomier side, capped at 438 − 12 − 12.
      expect(popover()!.style.maxHeight).toBe('414px')
      expect(popover()!.className).toContain('overflow-y-auto')
    }
    finally {
      measure.mockRestore()
      window.innerHeight = realHeight
    }
  })

  it('closes on a scroll outside the popover, not on one inside it', async () => {
    await mount()
    await click(trigger())

    popover()!.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(popover()).not.toBeNull()

    document.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(popover()).toBeNull()
  })

  it('closes on a resize of the window', async () => {
    await mount()
    await click(trigger())

    window.dispatchEvent(new Event('resize'))
    await flushPromises()

    expect(popover()).toBeNull()
  })

  // The focus returns to the button for Esc and a press outside only; a scroll or a resize leaves it in the field the Host is using (#573).
  it.each([
    ['a scroll', () => document.dispatchEvent(new Event('scroll'))],
    ['a resize', () => window.dispatchEvent(new Event('resize'))],
  ])('closes on %s and leaves the focus where it was', async (_name, fire) => {
    await mount()
    const field = document.createElement('input')
    document.body.append(field)
    await click(trigger())
    field.focus()

    fire()
    await flushPromises()

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('removes its popover when it unmounts while open', async () => {
    await mount()
    await click(trigger())

    page!.unmount()
    page = undefined

    expect(popover()).toBeNull()
  })

  it('closes the first of two hints when the second one opens, each keeping its own state', async () => {
    const Two = defineComponent({
      setup: () => () => h('div', [h(HintElement, { text: 'Eins' }), h(HintElement, { text: 'Zwei' })]),
    })
    page = await mountSuspended(Two, { attachTo: document.body })
    await flushPromises()
    const [first, second] = triggers() as [HTMLButtonElement, HTMLButtonElement]

    await click(first)
    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(second.getAttribute('aria-expanded')).toBe('false')

    // A real click is a pointerdown before the click: the first hint sees it as a press outside.
    await pointerDown(second)
    await click(second)

    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(second.getAttribute('aria-expanded')).toBe('true')
    expect(popovers()).toHaveLength(1)
    expect(popover()!.textContent).toContain('Zwei')
  })
})
