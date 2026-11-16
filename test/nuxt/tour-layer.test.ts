import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TourLayer from '~/components/TourLayer.vue'
import { MEMBER_TOUR, type TourStep } from '~~/shared/tour'
import { motion } from './motion'

// The Tour's layer (#647, #460): the bubble with its parts, the spotlight around the thing, the placement and the scroll, the following of a resized
// or scrolled page, the focus, the keys, what assistive technology reads, and the motion of the note's table. The page's `useTour` decides when it
// is open and saves what was seen. The seams are what a User and assistive technology observe: text, roles, buttons, keys, focus, the hole's and the
// bubble's place, and the animations the layer asks the browser for (`Element.animate` is a stub that records each call, as in app-sheet-motion).

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

/** The run of a page without the head on it: the greeting and the end. */
const TWO: readonly TourStep[] = MEMBER_TOUR.filter(step => step.id !== 'head')
/** The run of a page that has the head: greeting, head, end. */
const THREE = MEMBER_TOUR

async function mount(open = true, steps: readonly TourStep[] = TWO) {
  page = await mountSuspended(TourLayer, { props: { open, steps }, attachTo: document.body })
  await flushPromises()
  return page
}

afterEach(() => {
  page?.unmount()
  page = undefined
  document.body.innerHTML = ''
})

const box = () => document.querySelector<HTMLElement>('[role="dialog"]')
const layer = () => document.querySelector<HTMLElement>('[data-tour-layer]')
const spotlight = () => document.querySelector<HTMLElement>('[data-tour-spotlight]')!
const buttons = () => [...(box()?.querySelectorAll('button') ?? [])].map(button => button.textContent?.trim())
const button = (label: string) => [...box()!.querySelectorAll('button')].find(element => element.textContent?.trim() === label)!
const status = () => box()!.querySelector('[role="status"]')!.textContent
const title = () => document.getElementById(box()!.getAttribute('aria-labelledby')!)?.textContent?.trim()

async function click(label: string) {
  button(label).click()
  await flushPromises()
}

async function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  await flushPromises()
}

const GREETING = 'Willkommen!'
const HEAD = 'Das Event'
const END = 'Das war’s'

describe('the steps', () => {
  it('opens on the first step with its title and text, no „Zurück“ and „Weiter“ going on', async () => {
    await mount()

    expect(title()).toBe(GREETING)
    expect(box()!.textContent).toContain('Ich zeige dir kurz, wie dieses Event funktioniert.')
    expect(buttons()).toEqual(['Überspringen', 'Weiter'])
  })

  it('goes on to the last step, which can go back and ends on „Fertig“', async () => {
    await mount()

    await click('Weiter')

    expect(title()).toBe(END)
    expect(buttons()).toEqual(['Überspringen', 'Zurück', 'Fertig'])
  })

  it('goes back to the first step', async () => {
    await mount()
    await click('Weiter')

    await click('Zurück')

    expect(title()).toBe(GREETING)
    expect(buttons()).not.toContain('Zurück')
  })

  it('says it is over with „Fertig“', async () => {
    await mount()
    await click('Weiter')

    await click('Fertig')

    expect(page!.emitted('over')).toEqual([['finished']])
  })

  it.each([['the first', 0], ['the last', 1]])('says it was skipped with „Überspringen“ on %s step', async (_which, index) => {
    await mount()
    if (index === 1) await click('Weiter')

    await click('Überspringen')

    expect(page!.emitted('over')).toEqual([['skipped']])
  })

  it('starts on the first step again when it opens again', async () => {
    await mount()
    await click('Weiter')
    await page!.setProps({ open: false })
    await page!.setProps({ open: true })
    await flushPromises()

    expect(title()).toBe(GREETING)
  })

  it('finishes a run of one step with „Fertig“ at once', async () => {
    await mount(true, TWO.slice(0, 1))

    expect(buttons()).toEqual(['Überspringen', 'Fertig'])
    await click('Fertig')

    expect(page!.emitted('over')).toEqual([['finished']])
  })

  it('renders nothing while closed', async () => {
    await mount(false)

    expect(box()).toBeNull()
    expect(document.body.textContent).not.toContain(GREETING)
  })
})

describe('the keys', () => {
  it('skips on Escape', async () => {
    await mount()

    await press('Escape')

    expect(page!.emitted('over')).toEqual([['skipped']])
  })

  it('walks with the arrows and finishes with ArrowRight on the last step', async () => {
    await mount()

    await press('ArrowRight')
    expect(title()).toBe(END)
    await press('ArrowLeft')
    expect(title()).toBe(GREETING)
    await press('ArrowLeft')
    expect(title()).toBe(GREETING)
    await press('ArrowRight')
    await press('ArrowRight')

    expect(page!.emitted('over')).toEqual([['finished']])
  })

  it('leaves the browser\'s own shortcuts alone: Alt, Ctrl or Meta with an arrow does nothing', async () => {
    await mount()
    await press('ArrowRight')

    for (const modifier of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      await press('ArrowLeft', modifier)
      expect(title()).toBe(END)
    }
    expect(page!.emitted('over')).toBeUndefined()
  })

  it('takes the keys while the focus is on the page behind, where a click on it leaves it', async () => {
    await mount()
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)

    await press('ArrowRight')

    expect(title()).toBe(END)
  })

  it('takes no key while it is closed', async () => {
    await mount(false)

    await press('Escape')
    await press('ArrowRight')

    expect(page!.emitted('over')).toBeUndefined()
  })

  it('keeps the focus inside on Tab', async () => {
    await mount()
    const last = button('Weiter')
    last.focus()

    await press('Tab', {}, last)
    expect(box()!.contains(document.activeElement)).toBe(true)
    ;(document.activeElement as HTMLElement).blur()
    await press('Tab')

    expect(box()!.contains(document.activeElement)).toBe(true)
  })
})

describe('the focus', () => {
  it('goes into the dialog when it opens and back to where it was when it closes', async () => {
    const before = document.createElement('button')
    document.body.append(before)
    before.focus()
    await mount(false)

    await page!.setProps({ open: true })
    await flushPromises()
    expect(box()!.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(button('Weiter'))

    await page!.setProps({ open: false })
    await flushPromises()
    expect(document.activeElement).toBe(before)
  })

  it('stays on the forward button after a step, also where „Zurück“ has gone', async () => {
    await mount()

    await click('Weiter')
    expect(document.activeElement).toBe(button('Fertig'))

    await click('Zurück')
    expect(document.activeElement).toBe(button('Weiter'))
  })
})

describe('for assistive technology', () => {
  it('is a modal dialog named by the step\'s title and described by its text', async () => {
    await mount()

    expect(box()!.getAttribute('aria-modal')).toBe('true')
    expect(box()!.getAttribute('aria-labelledby')).toBeTruthy()
    expect(title()).toBe(GREETING)
    const description = document.getElementById(box()!.getAttribute('aria-describedby')!)
    expect(description?.textContent).toContain('Ich zeige dir kurz')
    await click('Weiter')
    expect(title()).toBe(END)
    expect(document.getElementById(box()!.getAttribute('aria-describedby')!)?.textContent).toContain('Auf deinem Profil')
  })

  it('announces each step politely with its number, title and text', async () => {
    await mount()
    const region = box()!.querySelector('[role="status"]')!

    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(status()).toContain('Schritt 1 von 2: Willkommen!')
    expect(status()).toContain('Ich zeige dir kurz')
    await click('Weiter')

    expect(status()).toContain('Schritt 2 von 2: Das war’s')
    expect(status()).toContain('Auf deinem Profil')
    expect(status()).not.toContain(GREETING)
  })

  it('has one dialog only: the hidden twin it measures with has no role, and is out of reach', async () => {
    await mount()

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    const twin = [...document.querySelectorAll<HTMLElement>('[data-tour-bubble]')].find(element => element.getAttribute('role') === null)!
    expect(twin.hasAttribute('inert')).toBe(true)
    expect(twin.getAttribute('aria-hidden')).toBe('true')
    expect(twin.style.visibility).toBe('hidden')
    expect(layer()!.querySelector('[data-tour-spotlight]')!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('the bubble', () => {
  it('counts the steps, “1 von 3”, and names the count for a screen reader', async () => {
    await mount(true, THREE)

    const count = [...box()!.querySelectorAll('span')].find(element => element.textContent?.trim() === '1 von 3')
    expect(count).toBeDefined()
    expect(count!.getAttribute('aria-label')).toBe('Schritt 1 von 3')
  })

  it('has „Überspringen“ on every step, „Zurück“ from the second on and „Fertig“ on the last', async () => {
    await mount(true, THREE)

    expect(buttons()).toEqual(['Überspringen', 'Weiter'])
    await click('Weiter')
    expect(buttons()).toEqual(['Überspringen', 'Zurück', 'Weiter'])
    await click('Weiter')
    expect(buttons()).toEqual(['Überspringen', 'Zurück', 'Fertig'])
  })

  it('stands on the modal layer with the scale\'s class only, and is its own shield', async () => {
    await mount()

    const classes = [...layer()!.classList, ...[...layer()!.querySelectorAll('*')].flatMap(element => [...element.classList])]
    expect(layer()!.classList).toContain('layer-modal')
    expect(layer()!.classList).not.toContain('layer-popover')
    expect(classes.filter(token => /^-?z-/.test(token))).toEqual([])
    expect(layer()!.classList).not.toContain('pointer-events-none')
    expect(spotlight().classList).toContain('pointer-events-none')
  })

  it('shows Compibert\'s face on the corner: waving at the greeting, looking at the thing, cheering at the end', async () => {
    await mount(true, THREE)
    const face = () => document.querySelector('[data-tour-face] .compibert-rig')!

    expect(face().getAttribute('data-state')).toBe('wave')
    await click('Weiter')
    expect(face().getAttribute('data-state')).toBe('idle')
    await click('Weiter')
    expect(face().getAttribute('data-state')).toBe('cheer')
    expect(document.querySelector('[data-tour-face]')!.getAttribute('aria-hidden')).toBe('true')
  })
})

// --- The spotlight, the placement and the scroll -----------------------------------------------------------------------------------------------------

/** A host element for `data-tour="head"` whose rect the test decides (happy-dom has no layout). */
function host(rect: { left: number, top: number, width: number, height: number }, radius = '14px') {
  const element = document.createElement('div')
  element.dataset.tour = 'head'
  element.style.borderRadius = radius
  let current = rect
  element.getBoundingClientRect = () => ({ ...current, x: current.left, y: current.top, right: current.left + current.width, bottom: current.top + current.height, toJSON() {} }) as DOMRect
  document.body.append(element)
  return { element, move: (next: typeof rect) => void (current = next) }
}

const px = (value: string) => Number.parseFloat(value)
const holeOf = () => {
  const { left, top, width, height, borderRadius, outlineWidth } = spotlight().style
  return { left: px(left), top: px(top), width: px(width), height: px(height), radius: px(borderRadius), ring: px(outlineWidth) }
}

const realHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
const realWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth')
let scrollTo: ReturnType<typeof vi.fn>

/** The window's width, as `documentElement.clientWidth` says it. */
function windowWidth(width: number | null) {
  if (width === null) Reflect.deleteProperty(document.documentElement, 'clientWidth')
  else Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => width })
}

const realAnimate = Element.prototype.animate

beforeEach(() => {
  // happy-dom has a Web Animations API of its own; these tests take it away, so a step changes at once, as in a browser without one. The motion's
  // own tests below put a recording stub in its place.
  Reflect.deleteProperty(Element.prototype, 'animate')
  // The bubble is 160 px high wherever it is measured: happy-dom has no layout.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 160 })
  scrollTo = vi.fn()
  vi.stubGlobal('scrollTo', scrollTo)
  windowWidth(1024)
})

afterEach(() => {
  Element.prototype.animate = realAnimate
  if (realHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight')
  if (realWidth) Object.defineProperty(document.documentElement, 'clientWidth', realWidth)
  else windowWidth(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the spotlight', () => {
  it('is the thing\'s rect plus 8 px on every side from 600 px up, with the thing\'s radius plus 8, and a ring of 3 px', async () => {
    host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, THREE)
    await click('Weiter')

    await vi.waitFor(() => expect(holeOf()).toMatchObject({ left: 32, top: 12, width: 316, height: 96, radius: 22 }))
    expect(holeOf().ring).toBe(3)
  })

  it('is the rect plus 6 px below 600 px, with the radius plus 6', async () => {
    windowWidth(390)
    host({ left: 14, top: 20, width: 200, height: 80 })
    await mount(true, THREE)
    await click('Weiter')

    await vi.waitFor(() => expect(holeOf()).toMatchObject({ left: 8, top: 14, width: 212, height: 92, radius: 20 }))
  })

  it('puts the bubble below the thing with its tail on the top edge', async () => {
    host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, THREE)
    await click('Weiter')

    const bubble = box()!
    // The hole ends at 20 + 80 + 8 = 108, the gap is 24: the bubble starts at 132 and is centred on the thing, clamped at the margin.
    await vi.waitFor(() => expect(bubble.style.top).toBe('132px'))
    expect(bubble.style.width).toBe('400px')
    expect(bubble.querySelector('[data-tour-tail]')).not.toBeNull()
  })

  it('is the whole page dark on a step without a thing: a 2 px hole under the bubble\'s centre, with no ring', async () => {
    await mount()

    const hole = holeOf()
    expect([hole.width, hole.height]).toEqual([2, 2])
    expect(hole.ring).toBe(0)
    // The bubble is 400 px wide and, measured, 160 px high.
    expect(hole.left).toBe(px(box()!.style.left) + 200 - 1)
    expect(hole.top).toBe(px(box()!.style.top) + 80 - 1)
    expect(box()!.querySelector('[data-tour-tail]')).toBeNull()
  })

  it('scrolls the page to the thing: its top to the header\'s bottom plus 24 px', async () => {
    // The page is 3000 px high in a window of 768 px; the thing stands at 1500 (page coordinates, the stubbed scroll never moves).
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 3000 })
    host({ left: 40, top: 1500, width: 300, height: 80 })
    await mount(true, THREE)

    await click('Weiter')

    await vi.waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 1476))
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  it('does not scroll a thing in the sticky header, and does not move a hole that was clipped for it', async () => {
    const header = document.createElement('header')
    header.dataset.tourEdge = 'header'
    header.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 64, x: 0, y: 0, right: 1024, bottom: 64, toJSON() {} }) as DOMRect
    const { element } = host({ left: 900, top: 12, width: 40, height: 40 }, '50%')
    header.append(element)
    document.body.append(header)
    await mount(true, THREE)

    await click('Weiter')

    // A round thing is a circle: 40 + 16 = 56.
    await vi.waitFor(() => expect(holeOf()).toMatchObject({ left: 892, top: 4, width: 56, height: 56, radius: 28 }))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('follows the thing when the window is resized', async () => {
    const { move } = host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, THREE)
    await click('Weiter')
    await vi.waitFor(() => expect(holeOf().left).toBe(32))

    move({ left: 100, top: 30, width: 260, height: 90 })
    window.dispatchEvent(new Event('resize'))

    await vi.waitFor(() => expect(holeOf()).toMatchObject({ left: 92, top: 22, width: 276, height: 106 }))
  })

  it('follows the thing when the page is scrolled by the User', async () => {
    const { move } = host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, THREE)
    await click('Weiter')
    await vi.waitFor(() => expect(holeOf().top).toBe(12))

    // The User scrolls the page by 40 px: the thing is 40 px higher in the window, and its top has left the usable area.
    vi.stubGlobal('scrollY', 40)
    move({ left: 40, top: -20, width: 300, height: 80 })
    window.dispatchEvent(new Event('scroll'))

    // The hole follows the thing and is clipped at the header's bottom (0 here): it ends at -20 + 80 + 8 = 68.
    await vi.waitFor(() => expect(holeOf()).toMatchObject({ top: 0, height: 68 }))
  })

  it('makes the step one without a thing when the thing is gone, and keeps the step', async () => {
    const { element } = host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, THREE)
    await click('Weiter')
    await vi.waitFor(() => expect(holeOf().width).toBe(316))

    element.remove()
    window.dispatchEvent(new Event('resize'))

    await vi.waitFor(() => expect(holeOf().width).toBe(2))
    expect(title()).toBe(HEAD)
    expect(box()!.querySelector('[data-tour-tail]')).toBeNull()
  })

  it('takes a thing that is not visible for no thing', async () => {
    const { element } = host({ left: 40, top: 20, width: 300, height: 80 })
    element.checkVisibility = () => false
    await mount(true, THREE)

    await click('Weiter')

    expect(holeOf().width).toBe(2)
    expect(title()).toBe(HEAD)
  })
})

// --- The motion --------------------------------------------------------------------------------------------------------------------------------------

const OUT = 'cubic-bezier(.16,1,.3,1)'
const IN = 'cubic-bezier(.7,0,.84,0)'
const IO = 'cubic-bezier(.65,0,.35,1)'

interface Call { el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions, finish: () => void }
let calls: Call[] = []
/** Records every `animate`; `finished` resolves when the test calls `finish()`. */
function stubAnimate() {
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    calls.push({ el: this, keyframes, options, finish })
    return { finished, cancel() {} }
  } as unknown as typeof Element.prototype.animate
}

const callsOn = (element: Element | null) => calls.filter(call => call.el === element)
const bubbleCalls = () => callsOn(box())
const finishAll = async () => {
  for (const call of calls) call.finish()
  await flushPromises()
}
const opacities = (call: Call) => call.keyframes.map(keyframe => keyframe.opacity)
const transforms = (call: Call) => call.keyframes.map(keyframe => keyframe.transform)

describe('the motion', () => {
  beforeEach(() => {
    calls = []
    stubAnimate()
    motion('full')
  })

  it('starts: the layer fades in (220 ms, ease out) and the bubble scales up from .96 with it, 60 ms later', async () => {
    await mount()

    const [fade] = callsOn(layer())
    expect(opacities(fade!)).toEqual([0, 1])
    expect(fade!.options).toMatchObject({ duration: 220, easing: OUT })
    const [scale] = bubbleCalls()
    expect(opacities(scale!)).toEqual([0, 1])
    expect(transforms(scale!)).toEqual(['scale(.96)', 'scale(1)'])
    expect(scale!.options).toMatchObject({ duration: 220, delay: 60, easing: OUT })
  })

  it('changes a step: the bubble leaves, the hole opens out of the thing\'s centre, the content swaps at 150 ms and the bubble arrives at 300', async () => {
    host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, THREE)
    calls = []

    button('Weiter').click()
    await vi.waitFor(() => expect(bubbleCalls().length).toBeGreaterThan(0))

    const [leave] = bubbleCalls()
    expect(opacities(leave!)).toEqual([1, 0])
    expect(transforms(leave!)).toEqual(['scale(1)', 'scale(.98)'])
    expect(leave!.options).toMatchObject({ duration: 140, easing: IN })
    const [open] = callsOn(spotlight())
    expect(open!.options).toMatchObject({ duration: 360, easing: OUT })
    expect(open!.keyframes[0]).toMatchObject({ width: '2px', height: '2px', outlineWidth: '0px' })
    expect(open!.keyframes[1]).toMatchObject({ left: '32px', top: '12px', width: '316px', height: '96px', borderRadius: '22px', outlineWidth: '3px' })
    expect(title()).toBe(GREETING)

    // At 150 ms the texts are the next step's; at 300 ms it arrives from 8 px on the tail's side, 220 ms, ease out.
    await vi.waitFor(() => expect(title()).toBe(HEAD), { timeout: 600 })
    await vi.waitFor(() => expect(bubbleCalls().some(call => transforms(call)[0] === 'translate(0px, 8px)')).toBe(true), { timeout: 800 })
    const arrival = bubbleCalls().find(call => transforms(call)[0] === 'translate(0px, 8px)')!
    expect(opacities(arrival)).toEqual([0, 1])
    expect(transforms(arrival)).toEqual(['translate(0px, 8px)', 'translate(0px, 0px)'])
    expect(arrival.options).toMatchObject({ duration: 220, easing: OUT })
  })

  it('moves the hole from one thing to the next in 360 ms on the in-out curve', async () => {
    host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, [{ id: 'head', target: 'head' }, { id: 'head', target: 'head' }, { id: 'end', target: null }])
    calls = []

    button('Weiter').click()

    await vi.waitFor(() => expect(callsOn(spotlight()).length).toBeGreaterThan(0))
    const [move] = callsOn(spotlight())
    expect(move!.options).toMatchObject({ duration: 360, easing: IO })
    expect(move!.keyframes[0]).toMatchObject({ outlineWidth: '3px' })
  })

  it('closes the hole into the thing\'s centre in 220 ms, ease in, and the ring goes to 0, when the next step has no thing', async () => {
    host({ left: 40, top: 20, width: 300, height: 80 })
    await mount(true, [{ id: 'head', target: 'head' }, { id: 'end', target: null }])
    calls = []

    button('Weiter').click()

    await vi.waitFor(() => expect(callsOn(spotlight()).length).toBeGreaterThan(0))
    const [close] = callsOn(spotlight())
    expect(close!.options).toMatchObject({ duration: 220, easing: IN })
    expect(close!.keyframes[0]).toMatchObject({ outlineWidth: '3px' })
    expect(close!.keyframes[1]).toMatchObject({ width: '2px', height: '2px', outlineWidth: '0px' })
    // The bubble without a thing arrives scaling up from .96.
    await vi.waitFor(() => expect(bubbleCalls().some(call => transforms(call)[0] === 'scale(.96)')).toBe(true), { timeout: 800 })
  })

  it('ignores „Weiter“ and „Zurück“ while a change plays, and „Überspringen“ ends it at once', async () => {
    await mount(true, THREE)

    button('Weiter').click()
    button('Weiter').click()
    await flushPromises()
    await vi.waitFor(() => expect(title()).toBe(HEAD), { timeout: 600 })
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(title()).toBe(HEAD)
    expect(page!.emitted('over')).toBeUndefined()

    button('Weiter').click()
    await flushPromises()
    button('Überspringen').click()
    await flushPromises()
    expect(page!.emitted('over')).toEqual([['skipped']])
  })

  it('under reduced motion cuts: the hole and the scroll are at the next step\'s values at once and the bubble only fades in, 140 ms linear', async () => {
    motion('reduced')
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 3000 })
    host({ left: 40, top: 1500, width: 300, height: 80 })
    await mount(true, THREE)
    // The start: opacity only.
    for (const call of [...callsOn(layer()), ...bubbleCalls()]) {
      expect(call.options).toMatchObject({ duration: 140, easing: 'linear' })
      expect(JSON.stringify(call.keyframes)).not.toContain('transform')
    }
    calls = []

    await click('Weiter')

    expect(title()).toBe(HEAD)
    expect(scrollTo).toHaveBeenLastCalledWith(0, 1476)
    expect(callsOn(spotlight())).toEqual([])
    expect(holeOf()).toMatchObject({ left: 32, width: 316, height: 96 })
    const [fade] = bubbleCalls()
    expect(opacities(fade!)).toEqual([0, 1])
    expect(fade!.options).toMatchObject({ duration: 140, easing: 'linear' })
    expect(JSON.stringify(calls.map(call => call.keyframes))).not.toContain('transform')
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  it('leaves: over is emitted at once, the layer stays for its exit and goes when the animations end', async () => {
    // A run of one step has „Fertig“ at once.
    await mount(true, TWO.slice(0, 1))
    calls = []

    await click('Fertig')
    expect(page!.emitted('over')).toEqual([['finished']])
    await page!.setProps({ open: false })
    await flushPromises()

    expect(box()).not.toBeNull()
    const leave = bubbleCalls()[0]!
    expect(opacities(leave)).toEqual([1, 0])
    expect(transforms(leave)).toEqual(['scale(1)', 'scale(.96)'])
    expect(leave.options).toMatchObject({ duration: 140, easing: IN })
    const [fade] = callsOn(layer())
    expect(opacities(fade!)).toEqual([1, 0])
    expect(fade!.options).toMatchObject({ duration: 220, delay: 60, easing: IN })

    await finishAll()
    expect(box()).toBeNull()
  })

  it('ticks the header\'s avatar once when a User ended it, and not when the page closed it', async () => {
    const avatar = document.createElement('button')
    avatar.dataset.tourAvatar = ''
    document.body.append(avatar)
    await mount(true, TWO.slice(0, 1))
    await click('Fertig')
    await page!.setProps({ open: false })
    await finishAll()

    const [tick] = callsOn(avatar)
    expect(transforms(tick!)).toEqual(['scale(1)', 'scale(1.14)', 'scale(1)'])
    expect(tick!.options).toMatchObject({ duration: 220 })

    calls = []
    await page!.setProps({ open: true })
    await flushPromises()
    await page!.setProps({ open: false })
    await finishAll()

    expect(callsOn(avatar)).toEqual([])
  })

  it('leaves under reduced motion with opacity only, 140 ms linear, and no tick', async () => {
    motion('reduced')
    const avatar = document.createElement('button')
    avatar.dataset.tourAvatar = ''
    document.body.append(avatar)
    await mount(true, TWO.slice(0, 1))
    await click('Fertig')
    calls = []

    await page!.setProps({ open: false })
    await flushPromises()

    for (const call of calls) {
      expect(opacities(call)).toEqual([1, 0])
      expect(call.options).toMatchObject({ duration: 140, easing: 'linear' })
    }
    expect(calls.length).toBeGreaterThanOrEqual(2)
    await finishAll()
    expect(callsOn(avatar)).toEqual([])
  })

  it('does not hang when an animation never finishes: the layer is gone after the longer duration + 50 ms', async () => {
    await mount()
    await page!.setProps({ open: false })
    await flushPromises()
    expect(box()).not.toBeNull()

    await vi.waitFor(() => expect(box()).toBeNull(), { timeout: 600 })
  })
})

describe('without anything to animate', () => {
  it('changes the step at once, and leaves at once', async () => {
    // No `Element.animate` here (the `beforeEach` above took happy-dom's away): the browser the layer meets has none.
    expect(typeof Element.prototype.animate).not.toBe('function')
    await mount(true, THREE)

    await click('Weiter')
    expect(title()).toBe(HEAD)
    await page!.setProps({ open: false })
    await flushPromises()

    expect(box()).toBeNull()
  })
})
