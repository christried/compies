import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StageSmoke from '~/components/StageSmoke.vue'
import type { EventView } from '~~/shared/event'
import { motion } from './motion'

// The stage smoke's layer (#675, note 19-rauch-auf-der-buehne): what the page shows of it (a decorative layer of five shapes that takes no
// pointer) and the rate its animations run at. jsdom runs no CSS animations, so the rate is read where the component sets it: the
// `playbackRate` of the layer's animations, through the Web Animations API the browser has and jsdom lacks.
type SmokeView = Pick<EventView, 'wheel' | 'coin' | 'ceremony'>

const none: SmokeView = { wheel: null, coin: null, ceremony: null }
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString()

function wheel(spin: { startedAgo: number, stopsIn: number } | null, vetoEndedAgo: number | null | 'later'): NonNullable<SmokeView['wheel']> {
  return {
    count: 5,
    slices: null,
    spin: spin && {
      roundId: 'r1',
      drawId: 'd1',
      spinStartAt: ago(spin.startedAgo),
      stopAt: ahead(spin.stopsIn),
      slices: 5,
      resultIndex: 0,
      resultOffset: 0,
      labels: null,
      game: null,
      current: true,
    },
    vetoes: {
      left: [],
      own: null,
      revealed: null,
      draw: { drawId: 'd1', kind: 'spin', stopAt: ago(60_000), vetoEndsAt: vetoEndedAgo === null || vetoEndedAgo === 'later' ? null : ago(vetoEndedAgo), game: null },
    },
  }
}

type FakeAnimation = { playbackRate: number, updatePlaybackRate: (rate: number) => void }
let animations: FakeAnimation[] = []

function fakeAnimation(): FakeAnimation {
  const animation = {
    playbackRate: 1,
    updatePlaybackRate(rate: number) {
      animation.playbackRate = rate
    },
  }
  return animation
}

beforeEach(() => {
  // The clock stands still, so a window of a second is the same second however long the first mount takes.
  vi.useFakeTimers({ toFake: ['Date'] })
  animations = [1, 2].map(fakeAnimation)
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, writable: true, value: () => animations })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  document.body.innerHTML = ''
})

async function mount(view: SmokeView = none, clipShown = false) {
  return mountSuspended(StageSmoke, { props: { view, serverNow: () => Date.now(), clipShown }, attachTo: document.body })
}

const rates = () => animations.map(a => a.playbackRate)

describe('the stage smoke layer', () => {
  it('is a decorative, fixed layer of five shapes that takes no pointer', async () => {
    const page = await mount()
    const layer = page.get('[data-layer="stage-smoke"]')

    expect(layer.attributes('aria-hidden')).toBe('true')
    expect(layer.classes()).toEqual(expect.arrayContaining(['fixed', 'pointer-events-none', 'layer-decor']))
    const shapes = layer.get('div').findAll(':scope > div')
    expect(shapes).toHaveLength(5)
    for (const shape of shapes) expect(shape.classes()).toEqual(expect.arrayContaining(['motion-reduce:animate-none', 'reduced:animate-none']))
  })

  it('gives each shape its own drift: the keyframes, the leg and the delay of the design', async () => {
    const page = await mount()
    const shapes = page.get('[data-layer="stage-smoke"] > div').findAll(':scope > div')

    expect(shapes.map(s => s.attributes('style'))).toEqual([
      expect.stringContaining('cp-smoke-rise-a 18s var(--cp-ease-io) 0s infinite alternate'),
      expect.stringContaining('cp-smoke-rise-b 22s var(--cp-ease-io) -9s infinite alternate'),
      expect.stringContaining('cp-smoke-rise-a 26s var(--cp-ease-io) -18s infinite alternate'),
      expect.stringContaining('cp-smoke-rise-b 30s var(--cp-ease-io) -27s infinite alternate'),
      expect.stringContaining('cp-smoke-rise-a 34s var(--cp-ease-io) -36s infinite alternate'),
    ])
  })

  it('dims to half while a Clip shows on this device, and back to full when it is closed', async () => {
    const page = await mount()
    const layer = () => page.get('[data-layer="stage-smoke"]')
    expect(layer().classes()).toContain('opacity-100')

    await page.setProps({ clipShown: true })
    expect(layer().classes()).toEqual(expect.arrayContaining(['opacity-50', 'dur-slower', 'ease-out']))
    expect(layer().classes()).not.toContain('opacity-100')

    await page.setProps({ clipShown: false })
    expect(layer().classes()).toEqual(expect.arrayContaining(['opacity-100', 'dur-slow', 'ease-in']))
    expect(layer().classes()).not.toContain('dur-slower')
  })

  describe('runs at half speed', () => {
    // Built when the test runs, against the frozen clock.
    const moments: [string, () => SmokeView, () => SmokeView][] = [
      ['during a Lucky Wheel spin', () => ({ ...none, wheel: wheel({ startedAgo: 1000, stopsIn: 5000 }, 'later') }), () => ({ ...none, wheel: wheel({ startedAgo: 20_000, stopsIn: -10_000 }, 'later') })],
      ['during the Veto reveal', () => ({ ...none, wheel: wheel(null, 500) }), () => ({ ...none, wheel: wheel(null, 10_000) })],
      ['during a coin flip', () => ({ ...none, coin: { id: 'c', side: 'heads', startedAt: ago(1000), landsAt: ahead(3000) } }), () => ({ ...none, coin: { id: 'c', side: 'heads', startedAt: ago(20_000), landsAt: ago(10_000) } })],
      ['during the Award ceremony', () => ({ ...none, ceremony: { startsAt: ago(1000), endsAt: ahead(30_000), gag: 'trip' } }), () => ({ ...none, ceremony: { startsAt: ago(60_000), endsAt: ago(10_000), gag: 'trip' } })],
    ]

    for (const [moment, during, after] of moments) {
      // The read is the same for every Member: the instants are in everyone's Event read, a Member's `vetoEndsAt` is null before the stop and its
      // wheel's labels null under a Hidden wheel, and the rate does not change with either.
      it(`${moment}, and back to full speed once it is over`, async () => {
        const page = await mount(during())
        expect(rates()).toEqual([0.5, 0.5])

        await page.setProps({ view: after() })
        await flushPromises()
        expect(rates()).toEqual([1, 1])
      })
    }

    it('with a Member\'s read of a spin under a Hidden wheel just the same', async () => {
      const view = { ...none, wheel: { ...wheel({ startedAgo: 1000, stopsIn: 5000 }, null), slices: null } }
      view.wheel.spin!.labels = null

      await mount(view)

      expect(rates()).toEqual([0.5, 0.5])
    })

    it('while a Clip shows on this device, and back to full speed when it closes', async () => {
      const page = await mount(none, true)
      expect(rates()).toEqual([0.5, 0.5])

      await page.setProps({ clipShown: false })
      expect(rates()).toEqual([1, 1])
    })

    it('and stays there when a spin and a Clip overlap, the dim following the Clip alone', async () => {
      const page = await mount({ ...none, wheel: wheel({ startedAgo: 1000, stopsIn: 5000 }, 'later') }, true)
      expect(rates()).toEqual([0.5, 0.5])

      await page.setProps({ clipShown: false })
      expect(rates()).toEqual([0.5, 0.5])
      expect(page.get('[data-layer="stage-smoke"]').classes()).toContain('opacity-100')
    })

    it('from the start of a spin that begins in the future, not before', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      try {
        const view = { ...none, wheel: wheel({ startedAgo: -2000, stopsIn: 5000 }, 'later') }
        await mount(view)
        expect(rates()).toEqual([1, 1])

        await vi.advanceTimersByTimeAsync(2100)
        expect(rates()).toEqual([0.5, 0.5])

        await vi.advanceTimersByTimeAsync(5100)
        expect(rates()).toEqual([1, 1])
      }
      finally {
        vi.useRealTimers()
      }
    })
  })

  it('runs at full speed without a wheel, a coin, a ceremony and a Clip', async () => {
    const page = await mount()

    expect(rates()).toEqual([1, 1])
    expect(page.find('[data-layer="stage-smoke"]').exists()).toBe(true)
  })

  it('applies the rate to an animation that starts later, on animationstart', async () => {
    const page = await mount(none, true)
    const late = fakeAnimation()
    animations.push(late)

    await page.get('[data-layer="stage-smoke"]').trigger('animationstart')

    expect(late.playbackRate).toBe(0.5)
  })

  it('leaves the animations alone under reduced motion', async () => {
    motion('reduced')

    await mount({ ...none, wheel: wheel({ startedAgo: 1000, stopsIn: 5000 }, 'later') }, true)

    expect(rates()).toEqual([1, 1])
  })
})
