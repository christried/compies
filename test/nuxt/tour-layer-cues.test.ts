import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TourLayer from '~/components/TourLayer.vue'
import { immediateCueKey } from '~/composables/useImmediateCue'
import { MEMBER_TOUR, type TourStep } from '~~/shared/tour'
import { motion } from './motion'

// The Tour's voice in the layer (#747, spec #718): the greeting chirps and the end cheers through the immediate-play function the Event page hands
// down, each time the step shows. The layer's own behaviour is pinned in tour-layer.test.ts; here only what it asks the player for.

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
const spy = vi.fn()

/** The run of a page without the head on it: the greeting and the end. */
const TWO: readonly TourStep[] = MEMBER_TOUR.filter(step => ['greeting', 'end'].includes(step.id))
/** The run of a page that has the head: greeting, head, end. */
const THREE: readonly TourStep[] = MEMBER_TOUR.filter(step => ['greeting', 'head', 'end'].includes(step.id))

async function mount(steps: readonly TourStep[] = TWO, provide = true) {
  page = await mountSuspended(TourLayer, {
    props: { open: true, steps },
    attachTo: document.body,
    ...(provide ? { global: { provide: { [immediateCueKey as symbol]: spy } } } : {}),
  })
  await flushPromises()
}

const box = () => document.querySelector<HTMLElement>('[role="dialog"]')
const button = (label: string) => [...box()!.querySelectorAll('button')].find(element => element.textContent?.trim() === label)!
async function click(label: string) {
  button(label).click()
  await flushPromises()
}
/** The ids the layer asked for, in order. */
const ids = () => spy.mock.calls.map(call => call[0])

/** `Element.animate` recorded and never finished by itself: the layer's changes play, so the cue waits for the bubble's arrival. */
function stubAnimate() {
  Element.prototype.animate = function () {
    return { finished: new Promise<void>(() => {}), cancel() {} }
  } as unknown as typeof Element.prototype.animate
}

const ownAnimate = Element.prototype.animate

beforeEach(() => {
  spy.mockClear()
  // happy-dom has an `animate` of its own, with real durations: without one a step changes at once, as tour-layer.test.ts says.
  Reflect.deleteProperty(Element.prototype, 'animate')
  motion('full')
})

afterEach(() => {
  Element.prototype.animate = ownAnimate
  vi.restoreAllMocks()
  vi.useRealTimers()
  page?.unmount()
  page = undefined
  document.body.innerHTML = ''
})

describe('the Tour layer\'s voice', () => {
  it('chirps when the greeting opens and cheers at the end, again after „Zurück“ and „Weiter“', async () => {
    await mount()
    expect(ids()).toEqual(['cb-hi'])

    await click('Weiter')
    expect(ids()).toEqual(['cb-hi', 'cb-yay'])

    await click('Zurück')
    await click('Weiter')
    expect(ids()).toEqual(['cb-hi', 'cb-yay', 'cb-hi', 'cb-yay'])
  })

  it('plays nothing at a step that has no cue', async () => {
    await mount(THREE)
    expect(ids()).toEqual(['cb-hi'])

    await click('Weiter')
    expect(box()!.textContent).toContain('Das Event')
    expect(ids()).toEqual(['cb-hi'])

    await click('Weiter')
    expect(ids()).toEqual(['cb-hi', 'cb-yay'])
  })

  it('plays nothing more when the window is resized or the page scrolls and the step stays', async () => {
    await mount()
    await click('Weiter')
    expect(ids()).toEqual(['cb-hi', 'cb-yay'])

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(ids()).toEqual(['cb-hi', 'cb-yay'])
  })

  it('plays both cues under reduced motion: nothing moves with them', async () => {
    vi.restoreAllMocks()
    motion('reduced')
    await mount()
    await click('Weiter')

    expect(ids()).toEqual(['cb-hi', 'cb-yay'])
  })

  it('sounds the end step when its bubble arrives (300 ms into a played change), not at the click', async () => {
    stubAnimate()
    await mount()
    expect(ids()).toEqual(['cb-hi'])

    button('Weiter').click()
    await flushPromises()
    expect(ids()).toEqual(['cb-hi'])

    await vi.waitFor(() => expect(ids()).toEqual(['cb-hi', 'cb-yay']), { timeout: 1000 })
  })

  it('throws nothing and plays nothing when no function was provided (a layer mounted alone)', async () => {
    await mount(TWO, false)
    await click('Weiter')

    expect(box()!.textContent).toContain('Das war’s')
    expect(spy).not.toHaveBeenCalled()
  })
})
