import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DOMWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import CompibertRig from '~/components/CompibertRig.vue'
import { RIG_STATES, type RigState } from '~/utils/compibert-rig'
import { loadGsap } from '~/utils/gsap'
import { stubInView } from './in-view'

// Compibert's rig (#311, spec #308 § Compibert's rig, ADR 0015): the animated twin of the still `Compibert`. Real GSAP runs here, with real timers;
// the tests look at what a User or the page can observe (the rendered SVG, its transforms, the root's data attributes), never at GSAP's numbers.

// A test can hold the GSAP chunk back, to unmount a rig before it has arrived (the memoised import resolves at once after the first test).
const chunk = vi.hoisted(() => ({ held: null as Promise<void> | null }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return async () => {
    await chunk.held
    return real()
  }
})

type Page = Awaited<ReturnType<typeof mountSuspended<typeof CompibertRig>>>

/** The page's motion setting, as the tokens put it in `--cp-motion`. Calls through: GSAP reads other properties with `getComputedStyle` too. */
const realComputedStyle = window.getComputedStyle.bind(window)
function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const style = realComputedStyle(element, pseudo)
    return new Proxy(style, {
      get(target, property) {
        if (property === 'getPropertyValue') return (name: string) => (name === '--cp-motion' ? value : target.getPropertyValue(name))
        const member = Reflect.get(target, property)
        return typeof member === 'function' ? member.bind(target) : member
      },
    })
  })
}

const pages: Page[] = []

interface Props { state?: RigState, variant?: 'full' | 'head', size?: number }

async function mountRig(props: Props = {}) {
  const page = await mountSuspended(CompibertRig, { props })
  pages.push(page)
  return page
}

/** Rigs in one app (so that their ids come from one `useId` counter, as on a page), each shown until `remove` takes it out. */
async function mountMany(configs: Props[]) {
  const shown = ref(configs.map(() => true))
  const Host = defineComponent({ setup: () => () => h('div', configs.flatMap((props, index) => (shown.value[index] ? [h(CompibertRig, { ...props, key: index })] : []))) })
  const page = await mountSuspended(Host)
  return { page, rigs: () => page.findAll('.compibert-rig'), remove: (index: number) => { shown.value[index] = false } }
}

const rootOf = (page: Page) => page.get('.compibert-rig')
const attribute = (page: Page, name: string) => rootOf(page).attributes(name)
const poseIn = (scope: Pick<Page, 'get'>, part: string) => scope.get(`.compibert-${part}`).attributes('transform')
const pose = poseIn
const ready = (page: Page) => vi.waitFor(() => expect(attribute(page, 'data-ready')).toBe('true'), { timeout: 5000 })
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** What `read` returned over `ms`, sampled every 20 ms. */
async function sample(read: () => string | undefined, ms: number) {
  const seen = new Set<string | undefined>()
  for (const end = Date.now() + ms; Date.now() < end; await pause(20)) seen.add(read())
  return seen
}

/** The device's core count, as `navigator.hardwareConcurrency` reports it. */
function cores(count: number | undefined) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: count, configurable: true })
}

afterEach(() => {
  for (const page of pages.splice(0)) if (!page.vm.$.isUnmounted) page.unmount()
  chunk.held = null
  Reflect.deleteProperty(navigator, 'hardwareConcurrency')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mounting', () => {
  it('is hidden from assistive technology and holds the full figure in the state it was given', async () => {
    stubInView()
    const page = await mountRig({ state: 'dance' })

    const root = rootOf(page)
    expect(root.attributes('aria-hidden')).toBe('true')
    expect(root.attributes('tabindex')).toBeUndefined()
    expect(root.attributes('data-state')).toBe('dance')
    expect(root.find('svg title, svg desc').exists()).toBe(false)
    expect(root.find('.compibert-root').exists()).toBe(true)
    expect(root.find('.compibert-arm-left').exists()).toBe(true)
    await ready(page)
  })

  it.each(RIG_STATES)('mounts in the state %s', async (state) => {
    stubInView()
    const page = await mountRig({ state })

    await ready(page)
    expect(attribute(page, 'data-state')).toBe(state)
  })

  it('moves the figure when the state is cheer', async () => {
    stubInView()
    const page = await mountRig({ state: 'cheer' })
    await ready(page)
    const atMount = pose(page, 'arm-left')

    await vi.waitFor(() => expect(pose(page, 'arm-left')).not.toBe(atMount), { timeout: 3000 })
  })

  it('takes the width it is given, and the full width of its container without one', async () => {
    stubInView()
    const sized = await mountRig({ size: 200 })
    const fluid = await mountRig()

    expect(attribute(sized, 'style')).toContain('width: 200px')
    expect(attribute(fluid, 'style')).toContain('width: 100%')
  })
})

describe('a state change', () => {
  it('moves the figure and updates the state', async () => {
    stubInView()
    const page = await mountRig({ state: 'idle' })
    await ready(page)
    const before = pose(page, 'arm-left')

    await page.setProps({ state: 'cheer' })

    expect(attribute(page, 'data-state')).toBe('cheer')
    await vi.waitFor(() => expect(pose(page, 'arm-left')).not.toBe(before), { timeout: 3000 })
  })

  it('ends in the last state after three changes in quick succession, without an error', async () => {
    stubInView()
    const errors = vi.spyOn(console, 'error')
    const page = await mountRig({ state: 'idle' })
    await ready(page)

    await page.setProps({ state: 'cheer' })
    await pause(40)
    await page.setProps({ state: 'confused' })
    await pause(1200)

    expect(attribute(page, 'data-state')).toBe('confused')
    expect(errors).not.toHaveBeenCalled()
  })

  it('waits for a landing and still ends in the new state', async () => {
    stubInView()
    const errors = vi.spyOn(console, 'error')
    const page = await mountRig({ state: 'cheer' })
    await ready(page)
    await pause(450)

    await page.setProps({ state: 'idle' })
    await pause(700)

    expect(attribute(page, 'data-state')).toBe('idle')
    expect(errors).not.toHaveBeenCalled()
  })
})

describe('reduced motion', () => {
  it('holds the pose: the state is reached, then nothing moves', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ state: 'dance' })
    await ready(page)
    const atMount = pose(page, 'arm-left')

    expect(attribute(page, 'data-held')).toBe('true')
    await pause(1000)
    expect(pose(page, 'arm-left')).not.toBe(atMount)
    const first = pose(page, 'root')
    await pause(300)
    const second = pose(page, 'root')
    await pause(300)
    const third = pose(page, 'root')
    expect([second, third]).toEqual([first, first])
    // The breath and the tail stand too.
    const body = pose(page, 'body')
    const tail = pose(page, 'tail-3')
    await pause(300)
    expect([pose(page, 'body'), pose(page, 'tail-3')]).toEqual([body, tail])
  })

  it('moves under full motion, so that the held pose above can fail', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ state: 'dance' })
    await ready(page)

    expect(attribute(page, 'data-held')).toBe('false')
    const roots = await sample(() => pose(page, 'root'), 1200)
    expect(roots.size).toBeGreaterThanOrEqual(2)
  })

  it('keeps blinking', async () => {
    stubInView()
    motion('reduced')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const page = await mountRig({ state: 'dance' })
    await ready(page)

    const lids = await sample(() => pose(page, 'lid-left'), 1500)
    expect(lids.size).toBeGreaterThanOrEqual(2)
  })

  it('reads the setting at every change of state', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ state: 'idle' })
    await ready(page)
    expect(attribute(page, 'data-held')).toBe('false')

    motion('reduced')
    await page.setProps({ state: 'dance' })

    expect(attribute(page, 'data-held')).toBe('true')
  })
})

describe('two instances', () => {
  it('keep their own ids', async () => {
    stubInView()
    const { rigs } = await mountMany([{ state: 'idle' }, { state: 'idle' }])
    const [first, second] = rigs()
    const ids = (root: typeof first) => root!.findAll('[id]').map(element => element.attributes('id')!)

    for (const root of [first, second]) expect(ids(root).filter(id => id.startsWith('compibert'))).toEqual([])
    expect(ids(first).length).toBeGreaterThan(0)
    expect(ids(first).filter(id => ids(second).includes(id))).toEqual([])
    for (const root of [first!, second!]) {
      const used = [...root.html().matchAll(/url\(#([^)]+)\)/g)].map(match => match[1]!)
      expect(used.length).toBeGreaterThan(0)
      for (const id of used) expect(ids(root)).toContain(id)
    }
  })
})

describe('one active rig', () => {
  it('lets the newest full rig animate and freezes the older one until it is gone', async () => {
    stubInView()
    const { rigs, remove } = await mountMany([{ state: 'dance' }, { state: 'dance' }])
    const [older, newer] = rigs() as [DOMWrapper<Element>, DOMWrapper<Element>]
    await vi.waitFor(() => expect(newer.attributes('data-ready')).toBe('true'), { timeout: 5000 })
    await vi.waitFor(() => expect(older.attributes('data-ready')).toBe('true'), { timeout: 5000 })

    expect(newer.attributes('data-animating')).toBe('true')
    expect(older.attributes('data-animating')).toBe('false')
    const frozen = poseIn(older, 'root')
    await pause(300)
    expect(poseIn(older, 'root')).toBe(frozen)

    remove(1)
    await vi.waitFor(() => expect(older.attributes('data-animating')).toBe('true'))
    const roots = await sample(() => poseIn(older, 'root'), 1200)
    expect(roots.size).toBeGreaterThanOrEqual(2)
  })

  it('does not count a head next to the active full rig', async () => {
    stubInView()
    const { rigs } = await mountMany([{ state: 'idle' }, { state: 'idle', variant: 'head' }])
    const [full, head] = rigs() as [DOMWrapper<Element>, DOMWrapper<Element>]
    await vi.waitFor(() => expect(head.attributes('data-ready')).toBe('true'), { timeout: 5000 })
    await vi.waitFor(() => expect(full.attributes('data-ready')).toBe('true'), { timeout: 5000 })

    expect(full.attributes('data-animating')).toBe('true')
    expect(head.attributes('data-animating')).toBe('true')
  })

  it('animates a single rig', async () => {
    stubInView()
    const page = await mountRig({ state: 'idle' })
    await ready(page)

    expect(attribute(page, 'data-animating')).toBe('true')
  })
})

describe('off-screen', () => {
  it('pauses and hides the rig, and brings it back', async () => {
    const view = stubInView()
    const page = await mountRig({ state: 'dance' })
    await ready(page)
    const svg = () => page.get('svg').element as unknown as SVGElement
    expect(view.observers[0]!.options.rootMargin).toBe('120px')
    expect(attribute(page, 'data-animating')).toBe('true')

    view.see(false)
    await nextTick()

    expect(attribute(page, 'data-animating')).toBe('false')
    expect(svg().style.visibility).toBe('hidden')
    const frozen = pose(page, 'root')
    await pause(300)
    expect(pose(page, 'root')).toBe(frozen)

    view.see(true)
    await nextTick()

    expect(attribute(page, 'data-animating')).toBe('true')
    expect(svg().style.visibility).toBe('')
    const roots = await sample(() => pose(page, 'root'), 1200)
    expect(roots.size).toBeGreaterThanOrEqual(2)
  })

  it('counts a browser without IntersectionObserver as on screen', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const page = await mountRig({ state: 'idle' })
    await ready(page)

    expect(attribute(page, 'data-animating')).toBe('true')
  })
})

describe('weak devices', () => {
  it.each([[4, true], [2, true], [8, false], [undefined, false]])('with %s cores the cheap outline is %s', async (count, cheap) => {
    stubInView()
    cores(count)
    const page = await mountRig({ size: 404 })

    await vi.waitFor(() => expect(rootOf(page).classes('compibert-rig--cheap')).toBe(cheap))
    if (cheap) expect(attribute(page, 'style')).toContain('--cb-dx: 7px')
  })
})

describe('unmount races', () => {
  it('mounts nothing when the rig leaves before GSAP has arrived', async () => {
    stubInView()
    const errors = vi.spyOn(console, 'error')
    let release = () => {}
    chunk.held = new Promise<void>((resolve) => { release = resolve })
    const page = await mountRig({ state: 'dance' })
    const svg = page.get('svg').element

    page.unmount()
    release()
    await pause(200)

    expect(errors).not.toHaveBeenCalled()
    expect(svg.querySelector('.compibert-root')?.getAttribute('transform')).toBeNull()
  })

  it('stops every movement when a ready rig leaves', async () => {
    stubInView()
    const page = await mountRig({ state: 'dance' })
    await ready(page)
    await pause(200)
    const svg = page.get('svg').element
    const poses = () => [...svg.querySelectorAll('g[class^="compibert-"], rect')].map(part => part.getAttribute('transform')).join('|')

    page.unmount()
    const first = poses()
    await pause(300)

    expect(poses()).toBe(first)
  })
})

describe('loading GSAP', () => {
  it('hands out one instance', async () => {
    const first = await loadGsap()
    const second = await loadGsap()

    expect(second).toBe(first)
  })
})

describe('the head', () => {
  it('is hidden from assistive technology and has no limbs', async () => {
    stubInView()
    const page = await mountRig({ variant: 'head', state: 'idle' })

    expect(attribute(page, 'aria-hidden')).toBe('true')
    expect(page.find('.compibert-leg-left').exists()).toBe(false)
    expect(page.find('.compibert-head').exists()).toBe(true)
  })

  it.each(RIG_STATES)('shows the state %s without a complaint', async (state) => {
    stubInView()
    const errors = vi.spyOn(console, 'error')
    const warnings = vi.spyOn(console, 'warn')
    const page = await mountRig({ variant: 'head', state })

    await ready(page)
    await pause(500)

    expect(attribute(page, 'data-state')).toBe(state)
    expect(errors).not.toHaveBeenCalled()
    expect(warnings).not.toHaveBeenCalled()
  })
})
