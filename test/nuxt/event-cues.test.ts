import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useCuePlayer } from '~/composables/useCuePlayer'
import EventPage from '~/pages/e/[slug]/index.vue'
import { reducedMotion } from '~/utils/motion'
import { CUE_IDS, vetoCuePlan, wheelCuePlan, type CueId } from '~/utils/sound-cues'
import type { EventView } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import type { ClipView, SpinView, VetoDrawView, VetoView, WheelView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { FakeAudioContext } from '../fake-audio'
import { kitty, signInAs } from './auth'
import { refreshEvent } from '~/composables/useEventView'
import { serve, viewWithSessions } from './event-page'

// The cue player on the Event page (#531, spec #504 § The cue player): a spin in the Event read is scheduled once on the audio clock, a
// refetch of the same spin schedules nothing twice, a new Draw replaces the plan, and Ton off, an Event without a wheel and the hub pages
// request no file. The player's own rules are in test/unit/cue-player.test.ts; the audio context is the fake of test/fake-audio.ts.

const FIRST = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'
const WHEEL_FILES = CUE_IDS.filter(id => id.startsWith('wheel-'))
const VETO_FILES = CUE_IDS.filter(id => id.startsWith('veto-'))

const kart: RoundGame = { id: 'g-kart', name: 'Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

const iso = (ms: number) => new Date(ms).toISOString()
/** A spin of 6 s on a wheel of 5 slices that starts `lead` ms from now, by the page's own clock (a test has no live room, so the clock is the device's). */
function spinIn(lead: number, drawId = 'd1'): SpinView {
  const start = Date.now() + lead
  return { roundId: 'r1', drawId, spinStartAt: iso(start), stopAt: iso(start + 6000), slices: 5, resultIndex: 3, resultOffset: 0.25, labels: null, game: kart, current: true }
}
const wheelWith = (spin: SpinView | null, vetoes: Partial<VetoView> = {}): WheelView => ({
  count: 5,
  slices: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id })),
  spin,
  vetoes: { left: [2, 2], own: null, revealed: null, draw: null, ...vetoes },
})

/** What the plan of a spin is, from the same function the page uses. */
const planOf = (spin: SpinView) => wheelCuePlan({ spin, hiddenWheel: false, isHost: false, reducedMotion: reducedMotion() })

/** The Event page's read: a Session that runs, the Event's Veto allowance (none unless a test says) and the Clip of the latest draw. */
function serveWheel(wheel: WheelView | null, first: { vetoAllowance?: number | null, clip?: ClipView | null } = {}) {
  const read = (slug: string, wheelOfRead: WheelView | null, rest = first) => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: false, phase: 'running' }, settings: { ...defaultSettings(), vetoAllowance: rest.vetoAllowance ?? null },
    runningSessionId: `session-${slug}-0`, wheel: wheelOfRead, clip: rest.clip ?? null,
  })
  const served = serve(slug => read(slug, wheel))
  return { slug: served.slug, set: (next: WheelView | null, rest = first) => served.set(read(served.slug, next, rest)) }
}

/** The requests each cue file got. The handlers answer with the cue id as bytes, which the fake decodes back to `{ id }`. */
const requests: Record<string, number> = {}
for (const id of CUE_IDS) {
  registerEndpoint(`/sounds/cues/${id}.wav`, () => {
    requests[id] = (requests[id] ?? 0) + 1
    return new TextEncoder().encode(id)
  })
}
const requested = () => Object.keys(requests).filter(id => requests[id]).sort()

const context = () => FakeAudioContext.instances.at(-1)

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
  FakeAudioContext.instances = []
  FakeAudioContext.follows = true
  for (const id of CUE_IDS) requests[id] = 0
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.unstubAllGlobals()
  FakeAudioContext.follows = false
  localStorage.removeItem('compies-sound')
  Reflect.deleteProperty(document, 'visibilityState')
})

/** Waits for the page's files to be fetched, decoded and the plan scheduled. */
async function settled(sources: number) {
  await vi.waitFor(() => expect(context()?.started().length).toBe(sources))
  await flushPromises()
}

describe('the spin\'s plan on the Event page', () => {
  it('is scheduled once, from the wind-up on, and each wheel file is requested once', async () => {
    const spin = spinIn(4000)
    const { slug } = serveWheel(wheelWith(spin))

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await settled(planOf(spin).length)

    const started = context()!.started()
    expect(started).toHaveLength(planOf(spin).length)
    expect(started[0]!.id).toBe('wheel-windup')
    expect(requested()).toEqual([...WHEEL_FILES].sort())
    for (const id of WHEEL_FILES) expect(requests[id], id).toBe(1)
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('is not scheduled twice when the same spin is read again', async () => {
    const spin = spinIn(4000)
    const served = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(planOf(spin).length)

    served.set(wheelWith({ ...spin }))
    await refreshEvent(served.slug)
    await flushPromises()
    await refreshEvent(served.slug)
    await flushPromises()

    expect(context()!.started()).toHaveLength(planOf(spin).length)
    expect(context()!.started().every(source => source.stopCalls === 0)).toBe(true)
    for (const id of WHEEL_FILES) expect(requests[id], id).toBe(1)
  })

  it('is replaced when a new Draw is read: the first plan\'s pending cues stop, the new one is scheduled', async () => {
    const first = spinIn(4000)
    const served = serveWheel(wheelWith(first))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(planOf(first).length)

    const second = spinIn(12_000, 'd2')
    served.set(wheelWith(second))
    await refreshEvent(served.slug)
    await settled(planOf(first).length + planOf(second).length)

    const sources = context()!.started()
    expect(sources.slice(0, planOf(first).length).every(source => source.stopCalls === 1)).toBe(true)
    expect(sources.slice(planOf(first).length).every(source => source.stopCalls === 0)).toBe(true)
    expect(sources[planOf(first).length]!.id).toBe('wheel-windup')
  })

  it('is scheduled by a hidden tab too: the room\'s read, not a frame, brings the plan', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    const served = serveWheel(wheelWith(null))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await flushPromises()
    expect(context()?.started() ?? []).toEqual([])

    const spin = spinIn(4000)
    served.set(wheelWith(spin))
    await refreshEvent(served.slug)
    await settled(planOf(spin).length)

    expect(document.visibilityState).toBe('hidden')
    expect(context()!.started()).toHaveLength(planOf(spin).length)
  })
})

describe('what the page does not play or request', () => {
  it('plays nothing and requests no file with Ton off', async () => {
    localStorage.setItem('compies-sound', 'off')
    const { slug } = serveWheel(wheelWith(spinIn(4000)))

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(context()?.started() ?? []).toEqual([])
    expect(requested()).toEqual([])
  })

  it('requests no file when the Event read has no wheel', async () => {
    const { slug } = serveWheel(null)

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(context()?.started() ?? []).toEqual([])
    expect(requested()).toEqual([])
  })

  it('does nothing and throws nothing where the browser has no Web Audio', async () => {
    vi.unstubAllGlobals()
    const { slug } = serveWheel(wheelWith(spinIn(4000)))

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await flushPromises()

    expect(requested()).toEqual([])
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('closes its audio context when the page goes', async () => {
    const spin = spinIn(4000)
    const { slug } = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await settled(planOf(spin).length)
    const made = context()!

    page.unmount()
    page = undefined

    expect(made.closed).toBe(true)
    expect(made.started().every(source => source.stopCalls === 1)).toBe(true)
  })
})

// The Veto window's plan and arrival cues on the Event page (#532, spec #504 § The cue plan). The plan's instants are in test/unit/sound-cues.test.ts;
// here: what the page schedules from a read, once, and what it plays when a read shows the own Party's cast or the reveal.
describe('the Veto window on the Event page', () => {
  /** A window whose stop was 2 s ago (so its opening is skipped), ending in 38 s, over a Clip of 10 s: every other cue is 8 s ahead or more. */
  function windowOf(kind: 'spin' | 'set' = 'spin', endsIn = 38_000) {
    const now = Date.now()
    const draw: VetoDrawView = { drawId: 'd1', kind, stopAt: iso(now - 2000), vetoEndsAt: iso(now + endsIn), game: kart }
    const clip: ClipView = { drawId: 'd1', startAt: iso(now - 2000), endsAt: iso(now + 8000), game: kart }
    return { draw, clip, plan: vetoCuePlan({ draw, clip, reducedMotion: reducedMotion() }) }
  }
  const own = (team: number, cast: boolean) => ({ team, cast, rejection: null })
  const ids = () => context()!.started().map(source => source.id)
  const seals = () => context()!.started().filter(source => source.id === 'veto-seal')
  /** What a read shows of the window for a Player of `team`, before the end: the Veto view of one viewer (`left` and `revealed` as sealed). */
  const read = (window: ReturnType<typeof windowOf>, team: number, cast: boolean) => wheelWith(null, { draw: window.draw, own: own(team, cast), revealed: null })
  const withAllowance = (window: ReturnType<typeof windowOf>) => ({ vetoAllowance: 2, clip: window.clip })

  it('is scheduled once: the opening, skipped as it is past, is the only cue left out, and each Veto file is requested once', async () => {
    const window = windowOf()
    const served = serveWheel(read(window, 1, false), withAllowance(window))

    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(window.plan.length - 1)

    expect(window.plan).toHaveLength(reducedMotion() ? 18 : 19)
    expect(ids()).not.toContain('veto-open')
    expect(ids()).not.toContain('veto-seal')
    expect(ids().filter(id => id === 'veto-clock')).toHaveLength(15)
    for (const id of VETO_FILES) expect(requests[id], id).toBe(1)

    served.set(read(window, 1, false), withAllowance(window))
    await refreshEvent(served.slug)
    await flushPromises()
    expect(context()!.started()).toHaveLength(window.plan.length - 1)
    expect(context()!.started().every(source => source.stopCalls === 0)).toBe(true)
  })

  describe('veto-seal', () => {
    it('plays once on the device of the casting Party when the read shows the cast, and not again for a refetch', async () => {
      const window = windowOf()
      const served = serveWheel(read(window, 1, false), withAllowance(window))
      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await settled(window.plan.length - 1)

      served.set(read(window, 1, true), withAllowance(window))
      await refreshEvent(served.slug)
      await settled(window.plan.length)

      expect(seals()).toHaveLength(1)
      expect(context()!.started().at(-1)!.id).toBe('veto-seal')
      expect(seals()[0]!.startedAt).toBeCloseTo(context()!.currentTime, 0) // the audio clock runs with real time here
      expect(seals()[0]!.stopCalls).toBe(0)

      served.set(read(window, 1, true), withAllowance(window))
      await refreshEvent(served.slug)
      await flushPromises()
      expect(seals()).toHaveLength(1)
    })

    it('does not play for a Player of another Party, whose read stays the same across the other Party\'s cast', async () => {
      const window = windowOf()
      const served = serveWheel(read(window, 2, false), withAllowance(window))
      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await settled(window.plan.length - 1)
      const before = ids()

      // Party 1 casts: sealed from Party 2 until the end, so Party 2's read is the same as before.
      served.set(read(window, 2, false), withAllowance(window))
      await refreshEvent(served.slug)
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(seals()).toHaveLength(0)
      expect(ids()).toEqual(before)
      expect(before.sort()).toEqual(window.plan.filter(cue => cue.id !== 'veto-open').map(cue => cue.id).sort())
    })

    it('does not play on a page whose first read already shows the cast (a reload)', async () => {
      const window = windowOf()
      const served = serveWheel(read(window, 1, true), withAllowance(window))

      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await settled(window.plan.length - 1)
      served.set(read(window, 1, true), withAllowance(window))
      await refreshEvent(served.slug)
      await flushPromises()

      expect(seals()).toHaveLength(0)
    })

    it('does not play with Ton off, and switching Ton on afterwards does not replay it', async () => {
      localStorage.setItem('compies-sound', 'off')
      const window = windowOf()
      const served = serveWheel(read(window, 1, false), withAllowance(window))
      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await flushPromises()

      served.set(read(window, 1, true), withAllowance(window))
      await refreshEvent(served.slug)
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(context()?.started() ?? []).toEqual([])
      expect(requested()).toEqual([])

      useState('sound-enabled').value = true
      await settled(window.plan.length - 1)

      expect(seals()).toHaveLength(0)
    })
  })

  describe('the stamps of the reveal', () => {
    /** A window that ends in 250 ms: the read after its end carries the Vetoes. */
    const revealed = (window: ReturnType<typeof windowOf>) => wheelWith(null, { draw: window.draw, own: own(1, false), revealed: [{ team: 1 }, { team: 2 }] })

    it('play one veto-seal per Veto, the second 80 ms after the first, when the read after the end carries them', async () => {
      const window = windowOf('spin', 250)
      const served = serveWheel(read(window, 1, false), withAllowance(window))
      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(seals()).toHaveLength(0)

      served.set(revealed(window), withAllowance(window))
      await refreshEvent(served.slug)
      await vi.waitFor(() => expect(seals()).toHaveLength(2))

      const [first, second] = seals()
      expect(first!.startedAt).toBeCloseTo(context()!.currentTime, 0)
      expect(Math.round((second!.startedAt! - first!.startedAt!) * 1000)).toBe(80)
      served.set(revealed(window), withAllowance(window))
      await refreshEvent(served.slug)
      await flushPromises()
      expect(seals()).toHaveLength(2)
    })

    it('play nothing on a page whose first read already has the Vetoes (a page opened after the end)', async () => {
      const window = windowOf('spin', -300)
      const served = serveWheel(revealed(window), withAllowance(window))

      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(seals()).toHaveLength(0)
    })
  })

  describe('the files', () => {
    it('are not requested by an Event that allows no Vetoes and has no window', async () => {
      const served = serveWheel(wheelWith(spinIn(4000)), { vetoAllowance: 0 })

      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await settled(planOf(spinIn(4000)).length)

      expect(requested()).toEqual([...WHEEL_FILES].sort())
    })

    it('are all six requested once by an Event with an allowance, before any window', async () => {
      const served = serveWheel(wheelWith(null), { vetoAllowance: 2 })

      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await vi.waitFor(() => expect(VETO_FILES.every(id => requests[id] === 1)).toBe(true))
      await flushPromises()

      expect(VETO_FILES).toHaveLength(6)
      for (const id of VETO_FILES) expect(requests[id], id).toBe(1)
    })

    it('are requested by a window even when the allowance is not known', async () => {
      const window = windowOf()
      const served = serveWheel(read(window, 1, false), { clip: window.clip })

      page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
      await settled(window.plan.length - 1)

      for (const id of VETO_FILES) expect(requests[id], id).toBe(1)
    })
  })

  it('is planned for a set game with „Veto erlauben“ without the wheel\'s cues, its opening left to the arrival', async () => {
    const window = windowOf('set')
    const served = serveWheel(read(window, 1, false), withAllowance(window))

    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(window.plan.length)

    expect(ids().some(id => id!.startsWith('wheel-'))).toBe(false)
    expect(ids()).not.toContain('veto-open')
    expect(ids()).toContain('veto-reveal')
  })
})

// A clock that moves after the plan was scheduled (#594): the server clock's offset changes (the first answer of a round, a re-sync) while the
// audio clock stands, and the pending cues follow. The page has no room, so its clock is `Date.now()`, which the tests move.
describe('a clock that moves (#594)', () => {
  const SHIFT_MS = 1000

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Moves the page's clock `ms` ahead of where it is now. */
  function skewBy(ms: number) {
    const real = Date.now.bind(Date)
    vi.spyOn(Date, 'now').mockImplementation(() => real() + ms)
  }
  const showVisibility = (state: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  /** Every pending cue of the first schedule is stopped and started again about `SHIFT_MS` earlier on the audio clock. */
  function expectMoved(first: number) {
    const sources = context()!.started()
    expect(sources).toHaveLength(first * 2)
    expect(sources.slice(0, first).every(source => source.stopCalls === 1)).toBe(true)
    sources.slice(0, first).forEach((old, index) => {
      expect(Math.abs((old.startedAt! - SHIFT_MS / 1000) - sources[first + index]!.startedAt!)).toBeLessThan(0.25)
    })
  }

  it('moves the pending cues when the tab becomes visible with a clock that moved', async () => {
    const spin = spinIn(8000)
    const { slug } = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await settled(planOf(spin).length)

    skewBy(SHIFT_MS)
    showVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expectMoved(planOf(spin).length)
  })

  it('does nothing when the tab turns hidden', async () => {
    const spin = spinIn(8000)
    const { slug } = serveWheel(wheelWith(spin))
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await settled(planOf(spin).length)

    skewBy(SHIFT_MS)
    showVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(context()!.started()).toHaveLength(planOf(spin).length)
    expect(context()!.started().every(source => source.stopCalls === 0)).toBe(true)
  })

  it('moves the pending cues when the clock says its offset moved (the `moved` input of useCuePlayer)', async () => {
    const spin = spinIn(8000)
    const read = viewWithSessions('moved', [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
      event: { isHost: false, phase: 'running' }, settings: { ...defaultSettings(), vetoAllowance: null }, runningSessionId: 'session-moved-0', wheel: wheelWith(spin),
    }) as unknown as EventView
    const skew = ref(0)
    const moves = ref(0)
    page = await mountSuspended(defineComponent({
      setup() {
        useCuePlayer({ view: () => read, serverNow: () => Date.now() + skew.value, ready: () => true, moved: () => moves.value })
        return () => h('div')
      },
    }))
    await settled(planOf(spin).length)

    skew.value = SHIFT_MS
    moves.value += 1
    await flushPromises()

    expectMoved(planOf(spin).length)
  })
})

describe('the cue log for the browser check', () => {
  const log = () => (globalThis as { __compiesCueLog?: () => { id: CueId, outcome: string }[] }).__compiesCueLog

  afterEach(() => {
    useRuntimeConfig().public.staging = false
    Reflect.deleteProperty(globalThis, '__compiesCueLog')
  })

  it('is readable in a staging build while the page is up, and gone when it is not', async () => {
    useRuntimeConfig().public.staging = true
    const spin = spinIn(4000)
    const { slug } = serveWheel(wheelWith(spin))

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await settled(planOf(spin).length)

    expect(log()?.().map(entry => entry.outcome)).toEqual(planOf(spin).map(() => 'scheduled'))
    page.unmount()
    page = undefined
    expect(log()).toBeUndefined()
  })

  // import.meta.dev is true in this test environment, so a production build's absence of the hook is the browser check's (#537).
  it.skipIf(import.meta.dev)('is not there in production', async () => {
    useRuntimeConfig().public.staging = false
    const { slug } = serveWheel(wheelWith(spinIn(4000)))

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await flushPromises()

    expect(log()).toBeUndefined()
  })
})
