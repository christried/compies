import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
import BootSplash from '~/components/BootSplash.vue'
import { loadGsap } from '~/utils/gsap'
import { bootCookie } from '~~/shared/boot'
import { stubInView } from './in-view'
import { motion } from './motion'

// The installed app's splash (#674, spec #927, screen 01; 04-motion § Boot „Reinsprinten“): what a User sees and what the page writes. The layer is
// in every first byte of Home; this component decides on the client whether it shows (`display-mode: standalone`), writes the cookie once, runs or
// fades, and ends by itself or on a tap or a key. `matchMedia` says standalone or not; `Element.animate`, which happy-dom lacks, is a stub that ends
// each animation after its duration; the rig is a stand-in that says `ready` after some milliseconds or never, except in the test with the real one.

// Counts the loads of GSAP that the splash asks for, and calls through; a test can hold the chunk back.
const loaded = vi.hoisted(() => ({ calls: 0, held: null as Promise<void> | null }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return async () => {
    loaded.calls++
    await loaded.held
    return real()
  }
})

/** The rig as the splash sees it: it shows its `state`, and says `ready` once (or never). */
function rigStub(readyAfterMs: number | null) {
  return defineComponent({
    name: 'CompibertRig',
    props: { state: { type: String, default: 'idle' }, variant: String, micro: Boolean },
    emits: ['ready'],
    setup(props, { emit }) {
      onMounted(() => {
        if (readyAfterMs !== null) setTimeout(() => emit('ready'), readyAfterMs)
      })
      return () => h('span', { 'data-part': 'rig', 'data-state': props.state })
    },
  })
}

const realAnimate = Element.prototype.animate
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function stubAnimate() {
  Element.prototype.animate = function (_keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    return { finished: pause(Number(options.duration)), cancel() {} }
  } as unknown as typeof Element.prototype.animate
}

function display(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList)
}

/** What the page assigned to `document.cookie`. */
let written: string[]

/** Home as `app.vue` has it: the layer while `due`, gone after `done`. `rig` null is the real one. */
async function mountSplash(rig: ReturnType<typeof rigStub> | null) {
  const dones = ref(0)
  const Host = defineComponent({
    setup() {
      const due = ref(true)
      const done = () => {
        due.value = false
        dones.value++
      }
      return () => (due.value ? h(BootSplash, { onDone: done }) : h('p', { 'data-part': 'home' }, 'Home'))
    },
  })
  const page = await mountSuspended(Host, { attachTo: document.body, global: rig ? { stubs: { CompibertRig: rig } } : {} })
  return { dones, page }
}

const layer = () => document.querySelector<HTMLElement>('[data-part="boot-splash"]')
const figure = () => layer()?.querySelector('[data-part="boot-wrap"] > div > *')?.getAttribute('data-state')
const tap = () => layer()!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
const press = (key = 'a') => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
const running = () => vi.waitFor(() => expect(figure()).toBe('run'), { timeout: 3000 })

beforeEach(() => {
  loaded.calls = 0
  loaded.held = null
  written = []
  document.body.innerHTML = ''
  stubAnimate()
  stubInView()
  vi.spyOn(document, 'cookie', 'set').mockImplementation((line: string) => void written.push(line))
})

afterEach(async () => {
  Element.prototype.animate = realAnimate
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await cookieStore.delete('compies-motion')
})

describe('shown as the installed app', () => {
  beforeEach(() => display(true))

  it('writes the cookie once, with its own protocol, and tells screen readers what loads', async () => {
    const { page } = await mountSplash(rigStub(null))
    await nextTick()

    expect(written).toEqual([bootCookie(false)])
    expect(layer()!.querySelector('[aria-live="polite"]')!.textContent).toBe('Compies lädt')
    page.unmount()
  })

  it('carries the word, the figure and the effects in its still frame', async () => {
    const { page } = await mountSplash(rigStub(null))

    expect(layer()!.getAttribute('data-variant')).toBe('run')
    expect(layer()!.querySelector('[aria-label="Compies"]')).not.toBeNull()
    expect([...layer()!.querySelectorAll('[data-part="boot-letter"]')].map(letter => letter.textContent)).toEqual([...'COMPIES'])
    expect(layer()!.querySelectorAll('[data-part="boot-line"]')).toHaveLength(3)
    expect(layer()!.querySelectorAll('[data-part="boot-dust"]')).toHaveLength(4)
    expect(layer()!.querySelector('[data-part="boot-wrap"] .compibert')).not.toBeNull()
    page.unmount()
  })

  it('shows the still Compibert in the first frame, and the rig takes its place in the same box once GSAP has arrived', async () => {
    let arrive = () => {}
    loaded.held = new Promise<void>(resolve => (arrive = resolve))
    const { page } = await mountSplash(rigStub(null))
    const box = () => layer()!.querySelector('[data-part="boot-wrap"] > div')!
    expect(box().querySelector('.compibert')).not.toBeNull()
    expect(box().querySelector('[data-part="rig"]')).toBeNull()

    arrive()
    await vi.waitFor(() => expect(box().querySelector('[data-part="rig"]')).not.toBeNull())

    expect(box().querySelector('.compibert')).toBeNull()
    expect(box().children).toHaveLength(1)
    page.unmount()
  })

  it('ends on a tap at once, and a second tap does nothing more', async () => {
    const { page, dones } = await mountSplash(rigStub(null))
    const surface = layer()!

    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()

    expect(dones.value).toBe(1)
    expect(layer()).toBeNull()
    expect(written).toEqual([bootCookie(false)])
    page.unmount()
  })

  it('ends on any key at once, and a second key does nothing more', async () => {
    const { page, dones } = await mountSplash(rigStub(null))

    press('Enter')
    press('Enter')
    await nextTick()

    expect(dones.value).toBe(1)
    expect(layer()).toBeNull()
    expect(written).toEqual([bootCookie(false)])
    page.unmount()
  })

  it('keeps the key from reaching what lies under the layer', async () => {
    const reached = vi.fn()
    document.body.addEventListener('keydown', reached)
    const { page } = await mountSplash(rigStub(null))

    press('Escape')

    expect(reached).not.toHaveBeenCalled()
    document.body.removeEventListener('keydown', reached)
    page.unmount()
  })

  it('gives up when the rig is not ready within 400 ms: the still frame fades away and the figure never runs', async () => {
    const { page, dones } = await mountSplash(rigStub(null))
    await pause(250)
    expect(dones.value).toBe(0)
    expect(figure()).not.toBe('run')

    await vi.waitFor(() => expect(dones.value).toBe(1), { timeout: 2000 })

    expect(layer()).toBeNull()
    page.unmount()
  })

  it('does not run in when the rig is ready too late', async () => {
    const { page, dones } = await mountSplash(rigStub(700))
    const seen = new Set<string | null | undefined>()
    for (const end = Date.now() + 1000; Date.now() < end; await pause(20)) seen.add(figure())

    expect(dones.value).toBe(1)
    expect(seen.has('run')).toBe(false)
    page.unmount()
  })

  it('runs in when the rig is ready in time: the letters wait for him, and the splash ends by itself', async () => {
    const { page, dones } = await mountSplash(rigStub(10))
    const letters = [...layer()!.querySelectorAll<HTMLElement>('[data-part="boot-letter"]')]

    await running()
    expect(letters.map(letter => letter.style.opacity)).toEqual(Array(7).fill('0'))
    await vi.waitFor(() => expect(dones.value).toBe(1), { timeout: 5000 })

    expect(layer()).toBeNull()
    expect(written).toHaveLength(1)
    page.unmount()
  })

  it('ends a run on a tap at once', async () => {
    const { page, dones } = await mountSplash(rigStub(10))
    await running()

    tap()
    await nextTick()

    expect(dones.value).toBe(1)
    expect(layer()).toBeNull()
    page.unmount()
  })

  it('ends a run on a key at once', async () => {
    const { page, dones } = await mountSplash(rigStub(10))
    await running()

    press()
    await nextTick()

    expect(dones.value).toBe(1)
    expect(layer()).toBeNull()
    page.unmount()
  })

  it('runs with the real rig: the figure takes the state run, and a tap ends it', async () => {
    // GSAP is warm, so that the 400 ms are the rig's mount and not the chunk's download.
    await loadGsap()
    const { page, dones } = await mountSplash(null)

    await running()
    tap()
    await nextTick()

    expect(dones.value).toBe(1)
    page.unmount()
  })
})

describe('calm', () => {
  beforeEach(async () => {
    display(true)
    motion('reduced')
    await cookieStore.set('compies-motion', 'reduced')
  })

  it('is the calm variant: no GSAP and no rig, a hold, then a fade and done', async () => {
    const { page, dones } = await mountSplash(null)
    expect(layer()!.getAttribute('data-variant')).toBe('calm')
    await pause(300)
    expect(dones.value).toBe(0)
    expect(layer()!.querySelector('.compibert')).not.toBeNull()
    expect(layer()!.querySelector('.compibert-rig')).toBeNull()

    await vi.waitFor(() => expect(dones.value).toBe(1), { timeout: 3000 })

    expect(loaded.calls).toBe(0)
    expect(written).toEqual([bootCookie(false)])
    expect(layer()).toBeNull()
    page.unmount()
  })

  it('ends on a tap in the hold, and only once', async () => {
    const { page, dones } = await mountSplash(rigStub(10))

    tap()
    await nextTick()
    expect(dones.value).toBe(1)
    await pause(1200)

    expect(dones.value).toBe(1)
    page.unmount()
  })
})

describe('in a browser tab', () => {
  beforeEach(() => display(false))

  it('ends at once without writing the cookie, loading GSAP or mounting the rig', async () => {
    const { page, dones } = await mountSplash(null)
    await pause(200)

    expect(dones.value).toBe(1)
    expect(document.querySelector('.compibert-rig')).toBeNull()
    expect(written).toEqual([])
    expect(layer()).toBeNull()
    expect(loaded.calls).toBe(0)
    page.unmount()
  })
})
