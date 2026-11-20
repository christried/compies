import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import EventPage from '~/pages/e/[slug]/index.vue'
import { CUE_GROUPS, CUE_IDS } from '~/utils/sound-cues'
import { COIN_DURATION_MS, COIN_LAND_AT, COIN_SPIN_AT } from '~~/shared/coin'
import { defaultSettings } from '~~/shared/settings'
import type { CoinView } from '~~/shared/stage'
import { FakeAudioContext } from '../fake-audio'
import { cueLog, iso, requested, requestedOf, requests, resetRequests, serveCueFiles, setUpCuePage, started, startedOf, tearDownCuePage } from './cue-harness'
import { serve, viewWithSessions } from './event-page'
import { FIRST, STARTED } from './event-page-states'

// The Coin flip's cues on the Event page (#669, spec #718 § The cue plan, § Secrecy): `coin-toss`, `coin-spin`, `coin-land` and `coin-result` are
// scheduled once from the toss's two instants, the Host and a Member alike, never from the toss's side (ADR 0013 amendment: the Event read carries
// `coin.side` before the landing, by decision). The files come while a Session runs or a toss is in the read. The plan's own instants are in
// test/unit/coin-cues.test.ts; the player's rules in test/unit/cue-player.test.ts. The audio context is the fake.

const COIN_IDS = CUE_IDS.filter(id => CUE_GROUPS[id].includes('coin'))

/** A toss that starts `lead` ms from now (negative: it started that long ago) and flies for its duration, by the page's own clock. */
const tossIn = (lead: number, side: CoinView['side'] = 'heads', id = 'toss-1'): CoinView => {
  const start = Date.now() + lead
  return { id, side, startedAt: iso(start), landsAt: iso(start + COIN_DURATION_MS) }
}

/** The Event page's read: a Session that runs (or none) and the toss of the read, for the Host or a Member. */
function serveCoin(coin: CoinView | null, { isHost = false, running = true }: { isHost?: boolean, running?: boolean } = {}) {
  const read = (slug: string, tossOfRead: CoinView | null) => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: running ? STARTED : null }], 0, {
    event: { isHost, phase: running ? 'running' : 'poll' }, settings: { ...defaultSettings(), vetoAllowance: null },
    runningSessionId: running ? `session-${slug}-0` : null, wheel: null, clip: null, coin: tossOfRead,
  })
  const served = serve(slug => read(slug, coin))
  return { slug: served.slug, set: (next: CoinView | null) => served.set(read(served.slug, next)) }
}

serveCueFiles()

const coinLog = () => cueLog().filter(entry => entry.id.startsWith('coin-')).map(entry => ({ id: entry.id, at: entry.at, outcome: entry.outcome }))
/**
 * What a toss's plan is, from the fixture's own values: the toss's two instants and the picture's beats (`COIN_SPIN_AT`, `COIN_LAND_AT`), not from
 * `coinCuePlan` with the narrowing the page does, which the test would then copy. Reduced motion leaves out the throw and the turn.
 */
const planOf = (coin: CoinView, reducedMotion = false) => {
  const start = Date.parse(coin.startedAt)
  const plan = [
    { id: 'coin-toss', at: start },
    { id: 'coin-spin', at: start + COIN_DURATION_MS * COIN_SPIN_AT },
    { id: 'coin-land', at: start + COIN_DURATION_MS * COIN_LAND_AT },
    { id: 'coin-result', at: Date.parse(coin.landsAt) },
  ]
  return reducedMotion ? plan.filter(cue => cue.id === 'coin-land' || cue.id === 'coin-result') : plan
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
const ownAnimate = Element.prototype.animate

beforeEach(() => {
  setUpCuePage({ staging: true })
  // The picture is not under test: the coin on the page runs on a fake animation, so unmounting it cancels no real one (happy-dom rejects a cancel).
  Element.prototype.animate = (() => ({ currentTime: 0, pause() {}, play() {}, cancel() {}, finish() {}, onfinish: null })) as unknown as typeof Element.prototype.animate
})

afterEach(() => {
  page?.unmount()
  page = undefined
  Element.prototype.animate = ownAnimate
  tearDownCuePage()
})

/** Waits for the page's coin files to be fetched, decoded and `count` sources scheduled. */
async function settled(count: number) {
  await vi.waitFor(() => expect(started()).toHaveLength(count))
  await flushPromises()
}

describe('the toss on the Event page keeps the side secret', () => {
  // The same instants with Kopf and with Schwanz: nothing the page requests, schedules or logs may differ.
  async function runOf(side: CoinView['side'], isHost: boolean) {
    resetRequests()
    FakeAudioContext.instances = []
    Reflect.deleteProperty(globalThis, '__compiesCueLog')
    const start = Date.now() + 4000
    const coin: CoinView = { id: 'toss-1', side, startedAt: iso(start), landsAt: iso(start + COIN_DURATION_MS) }
    const served = serveCoin(coin, { isHost })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(4)
    const run = { files: requestedOf('coin'), ids: started().map(source => source.id), offsets: coinLog().map(entry => ({ id: entry.id, offset: entry.at - start, outcome: entry.outcome })) }
    page.unmount()
    page = undefined
    return run
  }

  it.each([['a Member', false], ['the Host', true]])('requests the same files, schedules the same sources and logs the same lines for heads and tails, as %s', async (_who, isHost) => {
    const heads = await runOf('heads', isHost)
    const tails = await runOf('tails', isHost)

    expect(heads.files).toEqual([...COIN_IDS].sort())
    expect(tails).toEqual(heads)
    expect(heads.offsets).toEqual([
      { id: 'coin-toss', offset: 0, outcome: 'scheduled' },
      { id: 'coin-spin', offset: COIN_DURATION_MS * COIN_SPIN_AT, outcome: 'scheduled' },
      { id: 'coin-land', offset: COIN_DURATION_MS * COIN_LAND_AT, outcome: 'scheduled' },
      { id: 'coin-result', offset: COIN_DURATION_MS, outcome: 'scheduled' },
    ])
  })

  it('is the same for the Host and for a Member', async () => {
    const member = await runOf('heads', false)
    const host = await runOf('heads', true)

    expect(host).toEqual(member)
  })
})

describe.each([['a Member', false], ['the Host', true]])('the toss\'s plan on the Event page, for %s', (_who, isHost) => {
  it('is scheduled once at the toss, the turn, the landing and the result, and each coin file is requested once', async () => {
    const coin = tossIn(4000)
    const served = serveCoin(coin, { isHost })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(4)

    const sources = started()
    expect(sources.map(source => source.id)).toEqual(['coin-toss', 'coin-spin', 'coin-land', 'coin-result'])
    // The fake audio clock follows real time, so the tolerance is the point (50 ms, never equality): the offsets come from the plan's constants. The log below holds the exact instants.
    const first = sources[0]!.startedAt!
    expect(sources[1]!.startedAt! - first).toBeCloseTo(COIN_DURATION_MS * COIN_SPIN_AT / 1000, 1)
    expect(sources[2]!.startedAt! - first).toBeCloseTo(COIN_DURATION_MS * COIN_LAND_AT / 1000, 1)
    expect(sources[3]!.startedAt! - first).toBeCloseTo(COIN_DURATION_MS / 1000, 1)
    expect(coinLog()).toEqual(planOf(coin).map(cue => ({ ...cue, outcome: 'scheduled' })))
    expect(requestedOf('coin')).toEqual([...COIN_IDS].sort())
    for (const id of COIN_IDS) expect(requests[id], id).toBe(1)
    expect(sources.every(source => source.stopCalls === 0)).toBe(true)
  })

  it('is not scheduled twice when the same toss is read again, and a new toss replaces the plan', async () => {
    const first = tossIn(4000)
    const served = serveCoin(first, { isHost })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(4)

    served.set({ ...first })
    await refreshEvent(served.slug)
    await flushPromises()
    await refreshEvent(served.slug)
    await flushPromises()

    expect(started()).toHaveLength(4)
    expect(started().every(source => source.stopCalls === 0)).toBe(true)

    // A toss that has not flown yet, with new instants: the first plan's pending cues stop, four new ones are scheduled.
    served.set(tossIn(12_000, 'tails', 'toss-2'))
    await refreshEvent(served.slug)
    await settled(8)

    const sources = started()
    expect(sources.slice(0, 4).every(source => source.stopCalls === 1)).toBe(true)
    expect(sources.slice(4).every(source => source.stopCalls === 0)).toBe(true)
    expect(sources.slice(4).map(source => source.id)).toEqual(['coin-toss', 'coin-spin', 'coin-land', 'coin-result'])
    for (const id of COIN_IDS) expect(requests[id], id).toBe(1)
  })

  it('is scheduled by a hidden tab too: the room\'s read, not a frame, brings the plan', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    const served = serveCoin(null, { isHost })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await flushPromises()
    expect(started()).toEqual([])

    served.set(tossIn(4000))
    await refreshEvent(served.slug)
    await settled(4)

    expect(document.visibilityState).toBe('hidden')
    Reflect.deleteProperty(document, 'visibilityState')
  })
})

describe('the toss for a late joiner', () => {
  it('plays only the cues still to come: a toss that started a second ago skips the throw and the turn', async () => {
    const coin = tossIn(-1000)
    const served = serveCoin(coin)
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('coin-result')).toHaveLength(1))
    await flushPromises()

    expect(started().map(source => source.id)).toEqual(['coin-land', 'coin-result'])
    const outcomes = Object.fromEntries(coinLog().map(entry => [entry.id, entry.outcome]))
    expect(outcomes).toEqual({ 'coin-toss': 'skipped', 'coin-spin': 'skipped', 'coin-land': 'scheduled', 'coin-result': 'scheduled' })
  })

  it('plays nothing for a read after the landing', async () => {
    const served = serveCoin(tossIn(-COIN_DURATION_MS - 1000))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(requestedOf('coin')).toHaveLength(COIN_IDS.length))
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(started()).toEqual([])
    expect(coinLog().every(entry => entry.outcome === 'skipped')).toBe(true)
  })

  it('skips a cue more than 150 ms late and schedules the next: a toss that started 200 ms ago', async () => {
    const served = serveCoin(tossIn(-200))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(startedOf('coin-result')).toHaveLength(1))
    await flushPromises()

    expect(started().map(source => source.id)).toEqual(['coin-spin', 'coin-land', 'coin-result'])
    expect(coinLog().find(entry => entry.id === 'coin-toss')!.outcome).toBe('skipped')
  })
})

describe('the Coin flip\'s files', () => {
  it('are requested while a Session runs, before any toss, and nothing plays', async () => {
    const served = serveCoin(null)
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(COIN_IDS.every(id => requests[id] === 1)).toBe(true))
    await flushPromises()

    expect(COIN_IDS).toHaveLength(4)
    expect(requestedOf('coin')).toEqual([...COIN_IDS].sort())
    expect(started()).toEqual([])
  })

  it('are requested by a read that carries a toss', async () => {
    const served = serveCoin(tossIn(4000))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await vi.waitFor(() => expect(COIN_IDS.every(id => requests[id] === 1)).toBe(true))

    expect(requestedOf('coin')).toEqual([...COIN_IDS].sort())
  })

  it('are not requested by an Event without a running Session and without a toss', async () => {
    const served = serveCoin(null, { running: false })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(requestedOf('coin')).toEqual([])
    expect(started()).toEqual([])
  })

  it('are not requested by a hub page', async () => {
    page = await mountSuspended(EventPage, { route: '/' })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(requested()).toEqual([])
  })
})

describe('the toss under reduced motion', () => {
  it('plays the landing and the result only, at the full-motion instants', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    const coin = tossIn(4000)
    const served = serveCoin(coin)
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await settled(2)

    expect(started().map(source => source.id)).toEqual(['coin-land', 'coin-result'])
    expect(coinLog()).toEqual(planOf(coin, true).map(cue => ({ ...cue, outcome: 'scheduled' })))
    expect(coinLog()).toEqual(planOf(coin).filter(cue => cue.id === 'coin-land' || cue.id === 'coin-result').map(cue => ({ ...cue, outcome: 'scheduled' })))
  })
})

describe('the toss with Ton off', () => {
  it('schedules nothing, logs nothing and requests no file', async () => {
    localStorage.setItem('compies-sound', 'off')
    const served = serveCoin(tossIn(4000))
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(started()).toEqual([])
    expect(coinLog()).toEqual([])
    expect(requested()).toEqual([])
  })
})
