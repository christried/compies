import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DOMWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import CompibertRig from '~/components/CompibertRig.vue'
import { RIG_STATES, type RigState, type RigVariant } from '~/utils/compibert-rig'
import { loadGsap } from '~/utils/gsap'
import type { Reaction } from '~/utils/rig-reaction'
import { stubInView } from './in-view'
import { motion } from './motion'

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

const pages: Page[] = []

interface Props { state?: RigState, variant?: RigVariant, size?: number, look?: number | null, micro?: boolean, hopsFor?: number, rim?: boolean, reaction?: Reaction | null }

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
  return { page, rigs: () => page.findAll('.compibert-rig'), remove: (index: number) => (shown.value[index] = false) }
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

  it('is excited: both arms pump and the figure hops (#526)', async () => {
    stubInView()
    const page = await mountRig({ state: 'excited' })
    await ready(page)
    const arms = await sample(() => `${pose(page, 'arm-left')}|${pose(page, 'arm-right')}`, 1200)
    const roots = await sample(() => pose(page, 'root'), 1200)

    expect(attribute(page, 'data-state')).toBe('excited')
    expect(arms.size).toBeGreaterThanOrEqual(3)
    expect(roots.size).toBeGreaterThanOrEqual(2)
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

  it('holds the excited pose too: the arms and the hop stand still (#526)', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ state: 'excited' })
    await ready(page)
    await pause(1000)

    const first = [pose(page, 'arm-left'), pose(page, 'arm-right'), pose(page, 'root')]
    await pause(500)

    expect(attribute(page, 'data-held')).toBe('true')
    expect([pose(page, 'arm-left'), pose(page, 'arm-right'), pose(page, 'root')]).toEqual(first)
    expect(first[0]).toBeDefined()
  })

  // The cheer's jump starts at 0.3 s and the held pose stood at 0.45 s: the face rose for 0.15 s on the Tour's end step (#785, measured 13 px in the browser check).
  /** The root's vertical offset in every frame sampled over `ms`; the part's matrix is `matrix(a, b, c, d, e, f)`, and `f` is y. */
  async function rootHeights(page: Page, ms: number) {
    const heights = new Set<number>()
    for (const end = Date.now() + ms; Date.now() < end; await pause(5)) {
      const matrix = /matrix\(([^)]*)\)/.exec(pose(page, 'root') ?? '')
      if (matrix) heights.add(Number(matrix[1]!.split(',')[5]))
    }
    return heights
  }

  it('never lifts the root off the ground on the cheer, at the mount or on the change into it (#785)', async () => {
    stubInView()
    motion('reduced')
    const mounted = await mountRig({ state: 'cheer', variant: 'head' })
    const heights = await rootHeights(mounted, 1200)
    expect([...heights].every(y => y === 0)).toBe(true)

    const changed = await mountRig({ state: 'idle', variant: 'head' })
    await ready(changed)
    await changed.setProps({ state: 'cheer' })
    const afterChange = await rootHeights(changed, 1200)
    expect([...afterChange].every(y => y === 0)).toBe(true)
    expect(attribute(changed, 'data-held')).toBe('true')
  })

  it('hops under full motion on the same cheer, so that the test above can fail', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ state: 'cheer', variant: 'head' })
    await ready(page)

    const heights = await rootHeights(page, 1200)

    expect(Math.min(...heights)).toBeLessThan(-10)
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
    chunk.held = new Promise<void>(resolve => (release = resolve))
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

describe('the bust', () => {
  it('is hidden from assistive technology, crops the full figure to a square and keeps its outline (#526)', async () => {
    stubInView()
    const page = await mountRig({ variant: 'bust', state: 'idle', size: 232 })

    expect(attribute(page, 'aria-hidden')).toBe('true')
    expect(attribute(page, 'style')).toContain('width: 232px')
    expect(attribute(page, 'style')).toContain('aspect-ratio: 1')
    expect(page.get('svg').attributes('viewBox')).toBe('150 36 254 254')
    expect(rootOf(page).classes()).toContain('overflow-hidden')
    // The head crop has no outline; the bust has one, as the full figure.
    expect(rootOf(page).classes('compibert-rig--head')).toBe(false)
    expect(page.find('.compibert-arm-left').exists()).toBe(true)
    await ready(page)
  })

  it.each(RIG_STATES)('shows the state %s without a complaint', async (state) => {
    stubInView()
    const errors = vi.spyOn(console, 'error')
    const warnings = vi.spyOn(console, 'warn')
    const page = await mountRig({ variant: 'bust', state })

    await ready(page)
    await pause(500)

    expect(attribute(page, 'data-state')).toBe(state)
    expect(errors).not.toHaveBeenCalled()
    expect(warnings).not.toHaveBeenCalled()
  })

  it('does not take the stage: two busts both animate, and so does the full rig beside them', async () => {
    stubInView()
    const { rigs } = await mountMany([{ state: 'excited', variant: 'bust' }, { state: 'excited', variant: 'bust' }, { state: 'idle' }])
    const all = rigs() as DOMWrapper<Element>[]
    for (const rig of all) await vi.waitFor(() => expect(rig.attributes('data-ready')).toBe('true'), { timeout: 5000 })

    for (const rig of all) expect(rig.attributes('data-animating')).toBe('true')
  })

  it('breathes like the full figure: the tail swings', async () => {
    stubInView()
    const page = await mountRig({ variant: 'bust', state: 'idle' })
    await ready(page)

    const tails = await sample(() => pose(page, 'tail-3'), 800)
    expect(tails.size).toBeGreaterThanOrEqual(2)
  })

  it.each([4, 2])('with %s cores the cheap outline offset scales to the bust: 7 and 8 of 254 (6.39 and 7.31 at 232)', async (count) => {
    stubInView()
    cores(count)
    const page = await mountRig({ variant: 'bust', size: 232 })

    await vi.waitFor(() => expect(rootOf(page).classes('compibert-rig--cheap')).toBe(true))
    expect(attribute(page, 'style')).toContain('--cb-dx: 6.39px')
    expect(attribute(page, 'style')).toContain('--cb-dy: 7.31px')
  })

  it.each([4, 2])('with %s cores the head\'s cheap outline offset is 7 and 8 of its own 192, not of 404 (#584)', async (count) => {
    stubInView()
    cores(count)
    const page = await mountRig({ variant: 'head', size: 192 })

    await vi.waitFor(() => expect(rootOf(page).classes('compibert-rig--cheap')).toBe(true))
    expect(attribute(page, 'style')).toContain('--cb-dx: 7px')
    expect(attribute(page, 'style')).toContain('--cb-dy: 8px')
  })
})

// The Tour's face (#460): the head crop that looks at a point, nods, hops twice and lands, and waves. All of it is the rig's own motion, so the
// tests read the figure's transforms with real GSAP, as above.

/** The six numbers of the matrix GSAP writes as a part's `transform` (empty while there is none). */
const matrixOf = (page: Pick<Page, 'get'>, part: string) => (pose(page, part) ?? '').match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? []

/** The translation of a part (0, 0 while there is none). */
function shift(page: Pick<Page, 'get'>, part: string): { x: number, y: number } {
  const numbers = matrixOf(page, part)
  return numbers.length >= 6 ? { x: numbers[4]!, y: numbers[5]! } : { x: 0, y: 0 }
}

/** The rotation of a part in degrees. */
function turn(page: Pick<Page, 'get'>, part: string): number {
  const numbers = matrixOf(page, part)
  return numbers.length >= 6 ? Math.atan2(numbers[1]!, numbers[0]!) * 180 / Math.PI : 0
}

describe('the Tour\'s face: looking (#460)', () => {
  it('turns the pupil toward an angle by the note\'s numbers: x = cos a · 10.16, y = sin a · 8.71', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'idle', micro: false, look: 0 })
    await ready(page)

    await vi.waitFor(() => expect(shift(page, 'pupil-left').x).toBeCloseTo(10.16, 1), { timeout: 3000 })
    expect(shift(page, 'pupil-left').y).toBeCloseTo(0, 1)

    await page.setProps({ look: 90 })
    await vi.waitFor(() => expect(shift(page, 'pupil-left').y).toBeCloseTo(8.71, 1), { timeout: 3000 })
    expect(shift(page, 'pupil-left').x).toBeCloseTo(0, 1)
  })

  it('turns the neck by sin a · 6 degrees', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'idle', micro: false, look: 90 })
    await ready(page)

    await vi.waitFor(() => expect(turn(page, 'neck')).toBeCloseTo(6, 0), { timeout: 3000 })
  })

  it('brings the pupil back to the centre for null', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'idle', micro: false, look: 0 })
    await ready(page)
    await vi.waitFor(() => expect(shift(page, 'pupil-left').x).toBeCloseTo(10.16, 1), { timeout: 3000 })

    await page.setProps({ look: null })

    await vi.waitFor(() => expect(shift(page, 'pupil-left').x).toBeCloseTo(0, 1), { timeout: 3000 })
    await vi.waitFor(() => expect(turn(page, 'neck')).toBeCloseTo(0, 0), { timeout: 3000 })
  })

  it('keeps looking where it was told after a state change', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'idle', micro: false, look: 0 })
    await ready(page)
    await vi.waitFor(() => expect(shift(page, 'pupil-left').x).toBeCloseTo(10.16, 1), { timeout: 3000 })

    await page.setProps({ state: 'wave' })
    await pause(700)

    expect(shift(page, 'pupil-left').x).toBeCloseTo(10.16, 1)
  })

  it('sets the pupil at once under reduced motion', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ variant: 'head', state: 'idle', look: 0 })
    await ready(page)

    // Not eased: the rig is ready and the pupil already stands at the target.
    await vi.waitFor(() => expect(shift(page, 'pupil-left').x).toBeCloseTo(10.16, 1), { timeout: 150 })
  })
})

describe('the Tour\'s face: idling without micro actions, the nod (#460)', () => {
  /** The first micro action of a default idle is due at 1 s with the random stubbed to 0, and turns the head by −8°. */
  async function headOver(props: Props, ms: number) {
    stubInView()
    motion('full')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const page = await mountRig({ variant: 'head', state: 'idle', ...props })
    await ready(page)
    return { page, heads: await sample(() => pose(page, 'head'), ms) }
  }

  it('moves the head by itself in a default idle', async () => {
    const { heads } = await headOver({}, 1900)

    expect(heads.size).toBeGreaterThanOrEqual(2)
  })

  it('keeps the head still with micro actions off', async () => {
    const { heads } = await headOver({ micro: false }, 1900)

    expect(heads.size).toBe(1)
  })

  it('still blinks with micro actions off', async () => {
    stubInView()
    motion('full')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const page = await mountRig({ variant: 'head', state: 'idle', micro: false })
    await ready(page)

    const lids = await sample(() => pose(page, 'lid-left'), 1500)
    expect(lids.size).toBeGreaterThanOrEqual(2)
  })

  it('nods: the head turns to about 7 degrees and comes back to 0', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'idle', micro: false })
    await ready(page)

    ;(page.vm as unknown as { nod: () => void }).nod()
    const turns = new Set<number>()
    for (const end = Date.now() + 900; Date.now() < end; await pause(15)) turns.add(Math.round(turn(page, 'head') * 10) / 10)

    expect(Math.max(...turns)).toBeGreaterThan(5.5)
    expect(Math.max(...turns)).toBeLessThan(7.6)
    expect(Math.abs(turn(page, 'head'))).toBeLessThan(0.3)
  })

  it('does not nod under reduced motion', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ variant: 'head', state: 'idle', micro: false })
    await ready(page)

    ;(page.vm as unknown as { nod: () => void }).nod()
    const heads = await sample(() => pose(page, 'head'), 500)

    expect(heads.size).toBe(1)
  })
})

describe('the Tour\'s face: the end\'s hops and the wave (#460)', () => {
  it('hops twice and lands: after hopsFor seconds the root stands at y 0 and stays there', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'cheer', hopsFor: 1.15 })
    await ready(page)

    const during = await sample(() => String(Math.round(shift(page, 'root').y)), 900)
    expect(during.size).toBeGreaterThanOrEqual(3)
    await pause(900)
    const after = await sample(() => pose(page, 'root'), 700)
    expect(after.size).toBe(1)
    expect(Math.abs(shift(page, 'root').y)).toBeLessThan(0.5)
  })

  it('keeps hopping without hopsFor, so that the landing above is the option\'s doing', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'cheer' })
    await ready(page)
    await pause(1800)

    const late = await sample(() => pose(page, 'root'), 700)
    expect(late.size).toBeGreaterThanOrEqual(2)
  })

  it('waves: the arm swings in the state wave', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ state: 'wave' })
    await ready(page)

    const arms = await sample(() => pose(page, 'arm-left'), 1200)
    expect(arms.size).toBeGreaterThanOrEqual(3)
    expect(attribute(page, 'data-state')).toBe('wave')
  })

  it('shows a lifted brow and the head turned by -6 degrees on the head crop', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'wave' })
    await ready(page)

    await vi.waitFor(() => expect(turn(page, 'head')).toBeCloseTo(-6, 0), { timeout: 3000 })
    expect(shift(page, 'brow-left').y).toBeCloseTo(-6, 0)
  })
})

// Four more states (#928, 0.23 „Auftritt“): angry, sad, clap and roar. Each moves under full motion and holds a recognisable pose under reduced motion.

/** An element of the figure by its class (the fx parts have none of the `compibert-` prefix). */
const part = (page: Pick<Page, 'get'>, name: string) => page.get(`.${name}`)
/** Transform and style of an fx part, which GSAP writes as attributes: what a viewer sees of it. */
const looks = (page: Pick<Page, 'get'>, name: string) => `${part(page, name).attributes('transform')}|${part(page, name).attributes('style')}`
const opacityOf = (page: Pick<Page, 'get'>, name: string) => Number(/opacity:\s*([\d.]+)/.exec(part(page, name).attributes('style') ?? '')?.[1] ?? 'NaN')
/** The pose of the parts a reduced rig must hold still (the head crop has no arms, so a part that is not there counts as one). */
const held = (page: Pick<Page, 'find'>) => ['arm-left', 'arm-right', 'head', 'torso', 'root'].map((name) => {
  const element = page.find(`.compibert-${name}`)
  return element.exists() ? element.attributes('transform') : 'none'
}).join('|')

describe.each(['full', 'head', 'bust'] as const)('the new states on the %s variant (#928)', (variant) => {
  it.each(['angry', 'sad', 'clap', 'roar'] as const)('shows %s without a complaint', async (state) => {
    stubInView()
    const errors = vi.spyOn(console, 'error')
    const warnings = vi.spyOn(console, 'warn')
    const page = await mountRig({ variant, state })

    await ready(page)
    await pause(500)

    expect(attribute(page, 'data-state')).toBe(state)
    expect(errors).not.toHaveBeenCalled()
    expect(warnings).not.toHaveBeenCalled()
  })
})

describe('angry (#928)', () => {
  it('shows the anger mark and throbs it under full motion', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'angry' })
    await ready(page)

    await vi.waitFor(() => expect(opacityOf(page, 'cb-anger')).toBeGreaterThan(0), { timeout: 3000 })
    const marks = await sample(() => looks(page, 'cb-anger'), 1200)
    expect(marks.size).toBeGreaterThanOrEqual(3)
    expect(turn(page, 'brow-left')).toBeCloseTo(16, 0)
  })

  it('holds the pose under reduced motion: the mark stands at full opacity, nothing throbs or roars', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ variant: 'head', state: 'angry' })
    await ready(page)
    await pause(1000)

    const first = `${held(page)}|${looks(page, 'cb-anger')}`
    await pause(500)

    expect(attribute(page, 'data-held')).toBe('true')
    expect(opacityOf(page, 'cb-anger')).toBe(1)
    expect(`${held(page)}|${looks(page, 'cb-anger')}`).toBe(first)
  })
})

describe('sad (#928)', () => {
  it('lets a tear fall under full motion', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'sad' })
    await ready(page)

    const tears = await sample(() => looks(page, 'cb-tear'), 1500)
    expect(tears.size).toBeGreaterThanOrEqual(3)
    expect(turn(page, 'brow-left')).toBeCloseTo(-14, 0)
  })

  it('holds the pose under reduced motion: the head leans, the tear does not fall', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ variant: 'head', state: 'sad' })
    await ready(page)
    await pause(1000)

    const first = `${held(page)}|${looks(page, 'cb-tear')}`
    await pause(500)

    expect(attribute(page, 'data-held')).toBe('true')
    expect(turn(page, 'head')).toBeCloseTo(12, 0)
    expect(`${held(page)}|${looks(page, 'cb-tear')}`).toBe(first)
  })
})

describe('clap (#928)', () => {
  it('claps the arms under full motion', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ state: 'clap' })
    await ready(page)

    const arms = await sample(() => pose(page, 'arm-left'), 1200)
    expect(arms.size).toBeGreaterThanOrEqual(3)
  })

  it('shows the mitts on the head crop and moves them together', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'clap' })
    await ready(page)

    await vi.waitFor(() => expect(opacityOf(page, 'cb-hands')).toBe(1), { timeout: 3000 })
    const mitts = await sample(() => looks(page, 'cb-hand-l'), 1200)
    expect(mitts.size).toBeGreaterThanOrEqual(3)
  })

  it('holds the pose under reduced motion: the mitts stand shown and still', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ variant: 'head', state: 'clap' })
    await ready(page)
    await pause(1000)

    const first = `${held(page)}|${looks(page, 'cb-hands')}|${looks(page, 'cb-hand-l')}|${looks(page, 'cb-hand-r')}`
    await pause(500)

    expect(attribute(page, 'data-held')).toBe('true')
    expect(opacityOf(page, 'cb-hands')).toBe(1)
    expect(`${held(page)}|${looks(page, 'cb-hands')}|${looks(page, 'cb-hand-l')}|${looks(page, 'cb-hand-r')}`).toBe(first)
  })

  it('hides the mitts again on the next state', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'clap' })
    await ready(page)
    await vi.waitFor(() => expect(opacityOf(page, 'cb-hands')).toBe(1), { timeout: 3000 })

    await page.setProps({ state: 'idle' })

    await vi.waitFor(() => expect(opacityOf(page, 'cb-hands')).toBe(0), { timeout: 3000 })
  })

  it('has no mitts on the full figure, and still claps', async () => {
    stubInView()
    const page = await mountRig({ state: 'clap' })
    await ready(page)

    expect(page.find('.cb-hands').exists()).toBe(false)
  })
})

describe('roar (#928)', () => {
  it('shakes the head under full motion', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ variant: 'head', state: 'roar' })
    await ready(page)

    const xs = await sample(() => String(Math.round(shift(page, 'head').x * 10)), 2000)
    expect(xs.size).toBeGreaterThanOrEqual(3)
  })

  it('holds the roar peak under reduced motion: the mouth open, the head thrown back, no shake', async () => {
    stubInView()
    motion('reduced')
    const page = await mountRig({ variant: 'head', state: 'roar' })
    await ready(page)
    await pause(1000)

    const first = held(page)
    await pause(500)

    expect(attribute(page, 'data-held')).toBe('true')
    expect(opacityOf(page, 'cb-m[data-m="roar"]')).toBe(1)
    expect(turn(page, 'head')).toBeCloseTo(9, 0)
    expect(held(page)).toBe(first)
  })
})

describe('a reaction (#928)', () => {
  const stateOf = (page: Page) => attribute(page, 'data-state')

  it.each(['full', 'reduced'] as const)('shows over the base state and returns to it after its length, in %s motion', async (setting) => {
    stubInView()
    motion(setting)
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)

    await page.setProps({ reaction: { state: 'clap', seconds: 0.4 } })

    expect(stateOf(page)).toBe('clap')
    await pause(150)
    expect(stateOf(page)).toBe('clap')
    await vi.waitFor(() => expect(stateOf(page)).toBe('idle'), { timeout: 2000 })
  })

  it('leaves the pose of the base after it: the clap\'s mitts are gone', async () => {
    stubInView()
    motion('full')
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)

    await page.setProps({ reaction: { state: 'clap', seconds: 0.5 } })
    await vi.waitFor(() => expect(opacityOf(page, 'cb-hands')).toBe(1), { timeout: 3000 })
    await vi.waitFor(() => expect(stateOf(page)).toBe('idle'), { timeout: 2000 })

    await vi.waitFor(() => expect(opacityOf(page, 'cb-hands')).toBe(0), { timeout: 3000 })
  })

  it('drops a lower one while a higher runs: the wave over a sad', async () => {
    stubInView()
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)
    await page.setProps({ reaction: { state: 'sad', seconds: 0.6 } })

    await page.setProps({ reaction: { state: 'wave', seconds: 3 } })

    expect(stateOf(page)).toBe('sad')
    await vi.waitFor(() => expect(stateOf(page)).toBe('idle'), { timeout: 2000 })
    await pause(300)
    expect(stateOf(page)).toBe('idle')
  })

  it('is replaced by an equal one, with its own length: a clap over a laugh', async () => {
    stubInView()
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)
    await page.setProps({ reaction: { state: 'laugh', seconds: 5 } })

    await page.setProps({ reaction: { state: 'clap', seconds: 0.4 } })

    expect(stateOf(page)).toBe('clap')
    await vi.waitFor(() => expect(stateOf(page)).toBe('idle'), { timeout: 2000 })
  })

  it('restarts for the same reaction twice, with one timer: the first one\'s end does not cut the second', async () => {
    stubInView()
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)
    await page.setProps({ reaction: { state: 'clap', seconds: 0.5 } })
    await pause(300)

    await page.setProps({ reaction: { state: 'clap', seconds: 0.5 } })
    await pause(300)

    expect(stateOf(page)).toBe('clap')
    await vi.waitFor(() => expect(stateOf(page)).toBe('idle'), { timeout: 2000 })
  })

  it('is ignored while the base is confused (the errors block)', async () => {
    stubInView()
    const page = await mountRig({ state: 'confused', variant: 'head' })
    await ready(page)

    await page.setProps({ reaction: { state: 'wave', seconds: 0.4 } })
    await pause(150)

    expect(stateOf(page)).toBe('confused')
  })

  it('ends at once when the base turns confused', async () => {
    stubInView()
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)
    await page.setProps({ reaction: { state: 'sad', seconds: 5 } })
    expect(stateOf(page)).toBe('sad')

    await page.setProps({ state: 'confused' })

    expect(stateOf(page)).toBe('confused')
    await pause(300)
    expect(stateOf(page)).toBe('confused')
  })

  it('lets a base change wait for the reaction to end: a dance shows after the clap', async () => {
    stubInView()
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)
    await page.setProps({ reaction: { state: 'clap', seconds: 0.5 } })

    await page.setProps({ state: 'dance' })

    expect(stateOf(page)).toBe('clap')
    await vi.waitFor(() => expect(stateOf(page)).toBe('dance'), { timeout: 2000 })
  })

  it('shows a wave on the reconnect: the base from confused to idle and the wave in one tick', async () => {
    stubInView()
    const page = await mountRig({ state: 'confused', variant: 'head' })
    await ready(page)

    await page.setProps({ state: 'idle', reaction: { state: 'wave', seconds: 0.5 } })

    expect(stateOf(page)).toBe('wave')
    await vi.waitFor(() => expect(stateOf(page)).toBe('idle'), { timeout: 2000 })
  })

  it('waits for GSAP and then plays with its full length', async () => {
    stubInView()
    let release = () => {}
    chunk.held = new Promise<void>(resolve => (release = resolve))
    const page = await mountRig({ state: 'idle', variant: 'head', reaction: { state: 'clap', seconds: 0.8 } })
    await pause(1000)
    expect(stateOf(page)).toBe('idle')

    release()
    await ready(page)

    expect(stateOf(page)).toBe('clap')
    await pause(500)
    expect(stateOf(page)).toBe('clap')
    await vi.waitFor(() => expect(stateOf(page)).toBe('idle'), { timeout: 2000 })
  })

  it('leaves no error and no further movement when the rig leaves during one', async () => {
    stubInView()
    const errors = vi.spyOn(console, 'error')
    const page = await mountRig({ state: 'idle', variant: 'head' })
    await ready(page)
    await page.setProps({ reaction: { state: 'clap', seconds: 0.3 } })
    await pause(100)
    const svg = page.get('svg').element
    const poses = () => [...svg.querySelectorAll('g[class^="compibert-"], rect')].map(element => element.getAttribute('transform')).join('|')

    page.unmount()
    const first = poses()
    await pause(600)

    expect(errors).not.toHaveBeenCalled()
    expect(poses()).toBe(first)
  })
})
