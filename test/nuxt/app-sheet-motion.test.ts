import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import AppSheet from '~/components/AppSheet.vue'
import { motion } from './motion'

// The Sheet's slide (#348, 04-motion § UI enters, 02-components § Sheet): the numbers of the enter and the exit, that the exit
// waits before the unmount, and what keeps working while it moves. `Element.animate` is a stub that records each call and lets the
// test decide when an animation ends; `matchMedia` chooses the side or the bottom sheet.

const OUT = 'cubic-bezier(.16,1,.3,1)'
const IN = 'cubic-bezier(.7,0,.84,0)'

interface Call { el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions, finish: () => void }
let calls: Call[]
const realAnimate = Element.prototype.animate

/** Records every `animate`; `finished` resolves when the test calls `finish()`, or never when `neverFinish` is set. */
function stubAnimate(neverFinish = false) {
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => {
      if (!neverFinish) finish = resolve
    })
    calls.push({ el: this, keyframes, options, finish })
    return { finished, cancel() {} }
  } as unknown as typeof Element.prototype.animate
}

function wide(isWide: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: isWide && query === '(min-width: 61.25rem)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList)
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const part = (name: 'overlay' | 'panel') => document.querySelector(`[data-sheet="${name}"]`)
const callsOn = (name: 'overlay' | 'panel') => calls.filter(c => c.el === part(name))
const finishAll = () => calls.forEach(c => c.finish())

// Vue Test Utils stubs `Transition` with an element that runs no hook, so the sheet's own motion would never start: these tests ask for the real one.
const REAL_TRANSITION = { Transition: false }
const mountSheet = (props: { open: boolean }) => mountSuspended(AppSheet, { props: { title: 'Einladen', ...props }, global: { stubs: REAL_TRANSITION } })

/** The sheet's own wrapper: the element the Transition hooks act on. */
const wrapper = () => dialog()?.parentElement as HTMLElement | null

beforeEach(() => {
  document.body.innerHTML = ''
  calls = []
  stubAnimate()
  motion('full')
  wide(true)
})

afterEach(() => {
  Element.prototype.animate = realAnimate
  document.documentElement.style.removeProperty('--cp-dur-slow')
  document.documentElement.style.removeProperty('--cp-dur-fast')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A page with a trigger button and the sheet, so focus has somewhere to return to. */
function mountWithTrigger() {
  const Page = defineComponent({
    setup() {
      const open = ref(false)
      return () => h('div', [
        h('button', { 'data-testid': 'trigger', 'onClick': () => { open.value = true } }, 'Öffnen'),
        h(AppSheet, { open: open.value, title: 'Einladen', onClose: () => { open.value = false } }, () => h('button', { 'data-autofocus': '' }, 'Inhalt')),
      ])
    },
  })
  return mountSuspended(Page, { attachTo: document.body, global: { stubs: REAL_TRANSITION } })
}

describe('AppSheet motion (#348)', () => {
  it('a side sheet slides in from the right (360 ms, ease-out) and its overlay fades in (140 ms)', async () => {
    await mountSheet({ open: true })

    expect(calls).toHaveLength(2)
    const [panel] = callsOn('panel')
    expect(panel!.keyframes.map(k => k.transform)).toEqual(['translateX(100%)', 'translateX(0)'])
    expect(panel!.options.duration).toBe(360)
    expect(panel!.options.easing).toBe(OUT)
    const [overlay] = callsOn('overlay')
    expect(overlay!.keyframes.map(k => k.opacity)).toEqual([0, 1])
    expect(overlay!.options.duration).toBe(140)
    expect(overlay!.options.easing).toBe(OUT)
  })

  it('a bottom sheet slides in from the bottom, with the same numbers and no sideways move', async () => {
    wide(false)
    await mountSheet({ open: true })

    const [panel] = callsOn('panel')
    expect(panel!.keyframes.map(k => k.transform)).toEqual(['translateY(100%)', 'translateY(0)'])
    expect(panel!.options.duration).toBe(360)
    expect(panel!.options.easing).toBe(OUT)
    expect(JSON.stringify(calls.map(c => c.keyframes))).not.toContain('translateX')
  })

  it('the minified seconds spelling (.36s, .14s) gives the same 360 and 140 ms (#370)', async () => {
    document.documentElement.style.setProperty('--cp-dur-slow', '.36s')
    document.documentElement.style.setProperty('--cp-dur-fast', '.14s')
    await mountSheet({ open: true })

    expect(callsOn('panel')[0]!.options.duration).toBe(360)
    expect(callsOn('overlay')[0]!.options.duration).toBe(140)
  })

  it('leaves with the exit numbers: panel 220 ms ease-in, overlay 140 ms ease-in', async () => {
    const page = await mountSheet({ open: true })
    calls = []

    await page.setProps({ open: false })

    const [panel] = callsOn('panel')
    expect(panel!.keyframes.map(k => k.transform)).toEqual(['translateX(0)', 'translateX(100%)'])
    expect(panel!.options.duration).toBe(220)
    expect(panel!.options.easing).toBe(IN)
    const [overlay] = callsOn('overlay')
    expect(overlay!.keyframes.map(k => k.opacity)).toEqual([1, 0])
    expect(overlay!.options.duration).toBe(140)
    expect(overlay!.options.easing).toBe(IN)
  })

  it('the exit waits: the dialog stays, inert, until the animations end, then goes', async () => {
    const page = await mountSheet({ open: true })
    calls = []

    await page.setProps({ open: false })
    expect(dialog()).not.toBeNull()
    expect(wrapper()!.inert).toBe(true)

    finishAll()
    await flushPromises()
    expect(dialog()).toBeNull()
  })

  it('the exit does not hang when an animation never finishes: the dialog is gone after the longer duration + 50 ms', async () => {
    const page = await mountSheet({ open: true })
    stubAnimate(true)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await page.setProps({ open: false })
    expect(dialog()).not.toBeNull()
    vi.advanceTimersByTime(270)
    await flushPromises()

    expect(dialog()).toBeNull()
  })

  it('under reduced motion it only fades (140 ms, ease-out in, ease-in out), moves nothing, and still waits on the exit', async () => {
    motion('reduced')
    const page = await mountSheet({ open: true })

    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.options.duration).toBe(140)
      expect(call.options.easing).toBe(OUT)
    }
    calls = []
    await page.setProps({ open: false })
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.options.duration).toBe(140)
      expect(call.options.easing).toBe(IN)
    }
    expect(dialog()).not.toBeNull()
    expect(JSON.stringify(calls.map(c => c.keyframes))).not.toContain('transform')
    finishAll()
    await flushPromises()
    expect(dialog()).toBeNull()
  })

  it('with nothing to animate the sheet goes at once', async () => {
    // @ts-expect-error a browser without the Web Animations API
    delete Element.prototype.animate
    const page = await mountSheet({ open: true })

    expect(dialog()).not.toBeNull()
    await page.setProps({ open: false })
    await flushPromises()

    expect(dialog()).toBeNull()
  })

  it('Escape and the overlay close it while it is still entering', async () => {
    stubAnimate(true)
    const page = await mountSheet({ open: true })

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(page.emitted('close')).toHaveLength(1)
    ;(part('overlay') as HTMLElement).click()
    expect(page.emitted('close')).toHaveLength(2)
  })

  it('focus moves into the dialog when it opens and back to the trigger at once when it closes', async () => {
    const page = await mountWithTrigger()
    const trigger = page.get('[data-testid="trigger"]').element as HTMLElement
    trigger.focus()

    trigger.click()
    await flushPromises()
    expect(document.activeElement).toBe(dialog()!.querySelector('[data-autofocus]'))

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    // The animations have not finished: the sheet is still leaving, and focus is already back.
    expect(dialog()).not.toBeNull()
    expect(document.activeElement).toBe(trigger)
    page.unmount()
  })

  it('reopening while it leaves leaves exactly one dialog, and it is not inert', async () => {
    const page = await mountSheet({ open: true })

    await page.setProps({ open: false })
    await page.setProps({ open: true })
    await flushPromises()

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(wrapper()!.inert).toBeFalsy()
  })

  it('a sheet that is mounted already open still slides in', async () => {
    await mountSheet({ open: true })

    expect(callsOn('panel')).toHaveLength(1)
    expect(callsOn('overlay')).toHaveLength(1)
  })
})
