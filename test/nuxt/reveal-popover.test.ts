import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import RevealPopover from '~/components/RevealPopover.vue'
import { useRevealPopover } from '~/composables/useRevealPopover'

// The shared „a trigger opens a popover“ behaviour (#616): a mouse resting on the trigger opens it and leaving closes it after 120 ms, the
// focus opens it too, a click pins it until a click outside, a second click or Esc, and Esc, a scroll and a resize close it.

const TEXT = 'Hinweistext'

// A trigger button with the popover, built the way a caller builds them: its own type and name, the composable's attrs bound next to them.
const Probe = defineComponent({
  props: { label: { type: String, default: 'Auslöser' } },
  setup(props) {
    const button = ref<HTMLElement | null>(null)
    const { open, triggerAttrs, popoverAttrs } = useRevealPopover(button)
    return () => h('span', [
      h('button', { 'ref': button, 'type': 'button', 'aria-label': props.label, ...triggerAttrs.value }),
      h(RevealPopover, { open: open.value, anchor: button.value, ...popoverAttrs.value }, () => TEXT),
    ])
  },
})

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(component: object = Probe) {
  page = await mountSuspended(component, { attachTo: document.body })
  await flushPromises()
  return page
}

const triggers = () => [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Auslöser"]')]
const trigger = () => triggers()[0]!
const popovers = () => [...document.querySelectorAll<HTMLElement>('[role="note"]')]
const popover = () => popovers()[0] ?? null

const pointer = async (target: EventTarget, type: 'pointerenter' | 'pointerleave' | 'pointerdown', pointerType = 'mouse') => {
  target.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: type === 'pointerdown' }))
  await flushPromises()
}
const enter = (target: EventTarget, pointerType?: string) => pointer(target, 'pointerenter', pointerType)
const leave = (target: EventTarget, pointerType?: string) => pointer(target, 'pointerleave', pointerType)
const click = async (target: HTMLElement) => {
  target.click()
  await flushPromises()
}
const advance = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
  await flushPromises()
}
const escape = async (target: EventTarget) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
}
// A press as a browser runs it: the pointerdown, then the focus moves (to what was pressed when that takes focus, else to the body), then the
// mousedown, the pointerup, the mouseup and the click (the order of #578).
const pressOutside = async (target: HTMLElement, focusGoesTo: HTMLElement | null) => {
  target.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }))
  if (focusGoesTo) focusGoesTo.focus()
  else (document.activeElement as HTMLElement | null)?.blur()
  for (const type of ['mousedown', 'pointerup', 'mouseup', 'click']) target.dispatchEvent(new Event(type, { bubbles: true }))
  await flushPromises()
}
const twoFrames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

beforeEach(() => {
  document.body.innerHTML = ''
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  page?.unmount()
  page = undefined
})

describe('the reveal popover (#616)', () => {
  it('opens when a mouse reaches the trigger, and says so', async () => {
    await mount()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().hasAttribute('aria-controls')).toBe(false)

    await enter(trigger())

    expect(popover()).not.toBeNull()
    expect(popover()!.textContent).toContain(TEXT)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(trigger().getAttribute('aria-controls')).toBe(popover()!.id)
    expect(popover()!.id).not.toBe('')
  })

  it('closes 120 ms after the mouse left the trigger', async () => {
    await mount()
    await enter(trigger())

    await leave(trigger())
    await advance(119)
    expect(popover()).not.toBeNull()

    await advance(1)
    expect(popover()).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('stays open while the mouse moves onto the popover, and closes 120 ms after it leaves that', async () => {
    await mount()
    await enter(trigger())
    await leave(trigger())
    await advance(60)

    await enter(popover()!)
    await advance(500)
    expect(popover()).not.toBeNull()

    await leave(popover()!)
    await advance(119)
    expect(popover()).not.toBeNull()
    await advance(1)
    expect(popover()).toBeNull()
  })

  it.each(['touch', 'pen'])('does not open for a %s pointer', async (pointerType) => {
    await mount()

    await enter(trigger(), pointerType)

    expect(popover()).toBeNull()
  })

  it('does not close for the pointerleave a tap sends', async () => {
    await mount()
    trigger().focus()
    await flushPromises()

    await leave(trigger(), 'touch')
    await advance(500)

    expect(popover()).not.toBeNull()
  })

  it('opens on focus and closes on blur', async () => {
    await mount()

    trigger().focus()
    await flushPromises()
    expect(popover()).not.toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('true')

    trigger().blur()
    await flushPromises()
    expect(popover()).toBeNull()
  })

  it('stays open after the mouse left while the trigger holds the focus', async () => {
    await mount()
    trigger().focus()
    await enter(trigger())

    await leave(trigger())
    await advance(500)

    expect(popover()).not.toBeNull()
  })

  it('is pinned by a click: it stays open after the mouse left; a press outside closes it and unpins it', async () => {
    await mount()
    await enter(trigger())
    await click(trigger())

    await leave(trigger())
    await advance(500)
    expect(popover()).not.toBeNull()

    await pressOutside(document.body, null)
    expect(popover()).toBeNull()

    // Unpinned: a later hover opens it, and leaving closes it again.
    await enter(trigger())
    expect(popover()).not.toBeNull()
    await leave(trigger())
    await advance(120)
    expect(popover()).toBeNull()
  })

  it('closes a hover-opened popover 120 ms after the mouse left even though the trigger holds the focus', async () => {
    await mount()
    trigger().focus()
    await click(trigger())
    await pressOutside(document.body, null)
    // The press gave the focus back to the trigger (#578), and nothing is open.
    expect(document.activeElement).toBe(trigger())
    expect(popover()).toBeNull()

    await enter(trigger())
    expect(popover()).not.toBeNull()
    await leave(trigger())
    await advance(119)
    expect(popover()).not.toBeNull()

    await advance(1)
    expect(popover()).toBeNull()
  })

  it('stays open past a blur while pinned', async () => {
    await mount()
    trigger().focus()
    await click(trigger())

    trigger().blur()
    await flushPromises()

    expect(popover()).not.toBeNull()
  })

  it('is closed by a second click on the trigger', async () => {
    await mount()
    await click(trigger())
    expect(popover()).not.toBeNull()

    await click(trigger())

    expect(popover()).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('is pinned, not closed, by a click on a hover-opened popover\'s trigger', async () => {
    await mount()
    await enter(trigger())

    await click(trigger())
    expect(popover()).not.toBeNull()

    await leave(trigger())
    await advance(500)
    expect(popover()).not.toBeNull()
  })

  it('closes on Escape with the focus on the trigger, also when it had moved to the body', async () => {
    await mount()
    await enter(trigger())
    await click(trigger())

    await escape(trigger())
    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())

    // Open again; the focus is on the body (a click on the popover's text put it there).
    trigger().blur()
    await click(trigger())
    expect(popover()).not.toBeNull()
    await escape(document.body)
    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('leaves the focus in a field when Escape closes a hover-opened popover', async () => {
    await mount()
    const field = document.createElement('input')
    document.body.append(field)
    await enter(trigger())
    field.focus()

    await escape(field)

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('does not stop Escape while it is closed, and stops it while it is open', async () => {
    await mount()
    const seen = vi.fn()
    document.body.addEventListener('keydown', seen)

    await escape(document.body)
    expect(seen).toHaveBeenCalledTimes(1)

    await enter(trigger())
    await escape(document.body)
    expect(popover()).toBeNull()
    expect(seen).toHaveBeenCalledTimes(1)
    document.body.removeEventListener('keydown', seen)
  })

  it('does not reopen after Escape moved the focus to the trigger, and stays closed after a click on the text', async () => {
    await mount()
    await click(trigger())
    ;(document.activeElement as HTMLElement | null)?.blur()

    await escape(document.body)

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    await advance(500)
    expect(popover()).toBeNull()

    // The same Escape again, with the popover closed, does nothing.
    await escape(document.body)
    expect(popover()).toBeNull()
  })

  it('closes and unpins on a scroll outside the popover, not on one inside it', async () => {
    await mount()
    await click(trigger())

    popover()!.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(popover()).not.toBeNull()

    document.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(popover()).toBeNull()

    // Unpinned by it: a hover opens, a leave closes.
    await enter(trigger())
    await leave(trigger())
    await advance(120)
    expect(popover()).toBeNull()
  })

  it('ignores a scroll for two frames after it opened by focus, not after that', async () => {
    await mount()

    trigger().focus()
    await flushPromises()
    document.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(popover()).not.toBeNull()

    await twoFrames()
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

  it('gives the focus back to the trigger after a press on the page background, when it was pinned', async () => {
    await mount()
    trigger().focus()
    await click(trigger())

    await pressOutside(document.body, null)

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('does not move the focus after a press outside when it was only hover-open', async () => {
    await mount()
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    await enter(trigger())

    await pressOutside(document.body, null)

    expect(popover()).toBeNull()
    expect(document.activeElement).not.toBe(trigger())
  })

  it('does not close on a press on the popover or the trigger', async () => {
    await mount()
    await click(trigger())

    await pressOutside(popover()!, null)
    expect(popover()).not.toBeNull()

    await pointer(trigger(), 'pointerdown')
    expect(popover()).not.toBeNull()
  })

  it('leaves nothing pending when it unmounts while open or while a close is waiting', async () => {
    await mount()
    await enter(trigger())
    await leave(trigger())

    page!.unmount()
    page = undefined

    expect(popover()).toBeNull()
    await advance(500)
    document.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    await escape(document.body)
    expect(popover()).toBeNull()
  })

  it('keeps two instances apart: hovering the second leaves a pinned first open; a press outside closes both', async () => {
    const Two = defineComponent({
      setup: () => () => h('div', [h(Probe), h(Probe)]),
    })
    await mount(Two)
    const [first, second] = triggers() as [HTMLButtonElement, HTMLButtonElement]
    await click(first)

    await enter(second)
    expect(popovers()).toHaveLength(2)
    await leave(second)
    await advance(120)
    expect(popovers()).toHaveLength(1)
    expect(first.getAttribute('aria-expanded')).toBe('true')

    await enter(second)
    expect(popovers()).toHaveLength(2)
    await pressOutside(document.body, null)
    expect(popovers()).toHaveLength(0)
  })
})
