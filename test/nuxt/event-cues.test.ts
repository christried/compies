import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { reducedMotion } from '~/utils/motion'
import { CUE_IDS, wheelCuePlan, type CueId } from '~/utils/sound-cues'
import type { RoundGame } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'
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

const kart: RoundGame = { id: 'g-kart', name: 'Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

const iso = (ms: number) => new Date(ms).toISOString()
/** A spin of 6 s on a wheel of 5 slices that starts `lead` ms from now, by the page's own clock (a test has no live room, so the clock is the device's). */
function spinIn(lead: number, drawId = 'd1'): SpinView {
  const start = Date.now() + lead
  return { roundId: 'r1', drawId, spinStartAt: iso(start), stopAt: iso(start + 6000), slices: 5, resultIndex: 3, resultOffset: 0.25, labels: null, game: kart, current: true }
}
const wheelWith = (spin: SpinView | null): WheelView => ({
  count: 5,
  slices: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id })),
  spin,
  vetoes: { left: [2, 2], own: null, revealed: null, draw: null },
})

/** What the plan of a spin is, from the same function the page uses. */
const planOf = (spin: SpinView) => wheelCuePlan({ spin, hiddenWheel: false, isHost: false, reducedMotion: reducedMotion() })

function serveWheel(wheel: WheelView | null) {
  const read = (slug: string, wheelOfRead: WheelView | null) => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: false, phase: 'running' }, settings: defaultSettings(), runningSessionId: `session-${slug}-0`, wheel: wheelOfRead,
  })
  const served = serve(slug => read(slug, wheel))
  return { slug: served.slug, set: (next: WheelView | null) => served.set(read(served.slug, next)) }
}

/** The requests each cue file got. The handlers answer with the cue id as bytes, which the fake decodes back to `{ id }`. */
const requests: Record<string, number> = {}
for (const id of WHEEL_FILES) {
  registerEndpoint(`/sounds/cues/${id}.wav`, () => {
    requests[id] = (requests[id] ?? 0) + 1
    return new TextEncoder().encode(id)
  })
}
const requested = () => Object.keys(requests).sort()

const context = () => FakeAudioContext.instances.at(-1)

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
  FakeAudioContext.instances = []
  for (const key of Object.keys(requests)) delete requests[key]
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.unstubAllGlobals()
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
