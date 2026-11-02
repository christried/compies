import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoinFlip from '~/components/CoinFlip.vue'
import { COIN_DURATION_MS, COIN_LEAD_MS } from '~~/shared/coin'
import type { CoinView } from '~~/shared/event'

// The Coin flip on the stage (#235, spec #218 § Coin flip, 04-motion § Coin): every Member's coin flies from the same start instant and
// lands at the same instant; the result shows only at the landing, in a live region; a late joiner is seeked into the flight; reduced
// motion runs no flight and fades to the final face. The server clock is a fake here: the test moves it.

const T0 = Date.parse('2090-10-30T20:00:00.000Z')
const STARTS = T0 + COIN_LEAD_MS
const LANDS = STARTS + COIN_DURATION_MS
const BANNER_MS = 380
const POP = 'cubic-bezier(.34,1.56,.64,1)'
const FADE_MS = 500

const toss = (side: 'heads' | 'tails'): CoinView => ({ id: 'toss-1', side, startedAt: new Date(STARTS).toISOString(), landsAt: new Date(LANDS).toISOString() })

let serverTime = T0
const serverNow = vi.fn(() => serverTime)
let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined
let animate: ReturnType<typeof vi.fn>
const originalAnimate = Element.prototype.animate

function fakeAnimation() {
  return { currentTime: 0, pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), finish: vi.fn(), onfinish: null }
}

/** The page's motion setting, as the tokens put it in `--cp-motion`. */
function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
}

async function mount(view: CoinView, at = T0) {
  serverTime = at
  mounted = await mountSuspended(CoinFlip, { props: { toss: view, serverNow } })
  return mounted
}

/** Moves the server's clock to `ms` after the start of the page's clock and lets the next animation frame run. */
async function passTo(ms: number) {
  serverTime = T0 + ms
  vi.advanceTimersByTime(20)
  await nextTick()
}

const liveText = (page: NonNullable<typeof mounted>) => page.get('[aria-live="polite"]').text()
/** The flight's animations: the ones that run the coin's 3.6 s, in the order the component starts them. */
const flights = () => animate.mock.calls.flatMap((call, index) => (call[1]?.duration === COIN_DURATION_MS ? [animate.mock.results[index]!.value as { currentTime: number }] : []))
/** The animations that run for `duration` ms. */
const runsOf = (duration: number) => animate.mock.calls.filter(call => call[1]?.duration === duration)

beforeEach(() => {
  serverTime = T0
  serverNow.mockClear()
  animate = vi.fn(() => fakeAnimation())
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate
  motion('full')
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(T0))
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  Element.prototype.animate = originalAnimate
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the result, which shows only at the landing (#235)', () => {
  it('shows no side before the landing, not even in the live region', async () => {
    const page = await mount(toss('heads'))

    expect(liveText(page)).toBe('')
    await passTo(COIN_LEAD_MS + 1000)
    expect(liveText(page)).toBe('')
    await passTo(COIN_LEAD_MS + COIN_DURATION_MS - 1)
    expect(liveText(page)).toBe('')
    expect(page.text()).not.toMatch(/Kopf|Schwanz/)
  })

  it('announces „Kopf!“ in the live region at the landing', async () => {
    const page = await mount(toss('heads'))

    await passTo(COIN_LEAD_MS + COIN_DURATION_MS)

    expect(liveText(page)).toBe('Kopf!')
  })

  it('announces „Schwanz!“ at the landing of a tails toss', async () => {
    const page = await mount(toss('tails'))

    await passTo(COIN_LEAD_MS + COIN_DURATION_MS - 1)
    expect(liveText(page)).toBe('')
    await passTo(COIN_LEAD_MS + COIN_DURATION_MS)

    expect(liveText(page)).toBe('Schwanz!')
  })

  it('pops the result in with 0.38 s of the pop curve', async () => {
    await mount(toss('heads'))
    await passTo(COIN_LEAD_MS + COIN_DURATION_MS)

    const banner = runsOf(BANNER_MS)
    expect(banner).toHaveLength(1)
    const [keyframes, options] = banner[0] as [{ transform: string }[], { duration: number, easing: string }]
    expect(options).toEqual({ duration: BANNER_MS, easing: POP })
    expect(keyframes[0]!.transform).toContain('scale(.4)')
    expect(keyframes.at(-1)!.transform).toContain('scale(1)')
  })
})

describe('the flight (#235, 04-motion § Coin: 3.6 s)', () => {
  it('stands the coin before the start and flies it from the start instant on', async () => {
    await mount(toss('heads'), T0)

    expect(flights()).toHaveLength(4)
    expect(flights().every(animation => animation.currentTime === 0)).toBe(true)
  })

  it('seeks a late joiner into the flight to the server clock, so it lands at the same moment', async () => {
    await mount(toss('heads'), STARTS + 1000)

    expect(flights().every(animation => animation.currentTime === 1000)).toBe(true)
  })

  it('shows the end frame and the result at once for someone who arrives after the landing', async () => {
    const page = await mount(toss('tails'), LANDS + 500)

    expect(flights().every(animation => animation.currentTime === COIN_DURATION_MS)).toBe(true)
    expect(liveText(page)).toBe('Schwanz!')
  })
})

describe('reduced motion (#235, 04-motion § Coin: fades to the final face)', () => {
  it('runs no flight, and at the landing fades the coin out and in over 0.5 s and shows the result', async () => {
    motion('reduced')
    const page = await mount(toss('heads'), T0)

    await passTo(COIN_LEAD_MS + COIN_DURATION_MS - 1)
    expect(liveText(page)).toBe('')
    expect(runsOf(COIN_DURATION_MS)).toHaveLength(0)

    await passTo(COIN_LEAD_MS + COIN_DURATION_MS)

    expect(runsOf(COIN_DURATION_MS)).toHaveLength(0)
    expect(runsOf(FADE_MS)).toHaveLength(1)
    expect(runsOf(FADE_MS)[0]![0]).toEqual([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }])
    expect(liveText(page)).toBe('Kopf!')
  })

  it('shows the final face of a late joiner without a flight or a fade', async () => {
    motion('reduced')
    const page = await mount(toss('tails'), LANDS + 500)

    expect(runsOf(COIN_DURATION_MS)).toHaveLength(0)
    expect(liveText(page)).toBe('Schwanz!')
  })
})
