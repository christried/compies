import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import AppShell from '~/components/AppShell.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import { loadGsap } from '~/utils/gsap'
import type { RoomSocketOptions } from '~/utils/room-socket'
import type { EmoteId } from '~~/shared/emote'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings } from '~~/shared/settings'
import type { RoundGame } from '~~/shared/game'
import type { VetoDrawView, VetoView, WheelView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { LARSI, restoreScreen, serve, stubScreen, viewWithSessions } from './event-page'
import { afterResult, FIRST, members, SESSION, STARTED, team } from './event-page-states'
import { stubInView } from './in-view'
import { motion } from './motion'

// The header's Compibert on the Event page (#673, spec #927): the static head until the Event page gives it something to do, then the rig. It
// reacts to the viewer's own Emote, to a reveal that arrives with a Veto and to a lost connection (its base). The plans are in
// test/unit/header-reaction.test.ts; here: what the page shows, for the Host's read and a Member's alike. Real GSAP, as test/nuxt/compibert-rig.test.ts;
// the room is the fake socket of test/nuxt/event-emote-cues.test.ts and the connection's timing is that of test/nuxt/event-live.test.ts.

const { sockets, createRoomSocket } = vi.hoisted(() => {
  const sockets: { options: RoomSocketOptions, close: ReturnType<typeof vi.fn>, reconnect: ReturnType<typeof vi.fn>, send: ReturnType<typeof vi.fn> }[] = []
  return {
    sockets,
    createRoomSocket: vi.fn((options: RoomSocketOptions) => {
      const socket = { options, close: vi.fn(), reconnect: vi.fn(), send: vi.fn() }
      sockets.push(socket)
      return socket
    }),
  }
})
mockNuxtImport('createRoomSocket', () => createRoomSocket)

// A test can make the GSAP chunk fail once (`fail`) or hold it back (`held`): the header and the rig both load it through `loadGsap`.
const chunk = vi.hoisted(() => ({ fail: 0, held: null as Promise<void> | null }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return async () => {
    await chunk.held
    if (chunk.fail > 0) {
      chunk.fail -= 1
      throw new Error('chunk failed')
    }
    return real()
  }
})

const iso = (ms: number) => new Date(ms).toISOString()
const kart: RoundGame = { id: 'g-kart', name: 'Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

interface Setup { host: boolean, hat?: boolean, wheel?: WheelView | null }

/** A running Event; with `hat`, Kitty sits in the Leading Party after a Result (the party hat, #38), else in the trailing one. */
function readOf(slug: string, { host, hat = false, wheel = null }: Setup) {
  return viewWithSessions(slug, [SESSION(1, FIRST, { startedAt: STARTED })], 0, {
    event: { isHost: host, phase: 'running' },
    settings: { ...defaultSettings(), vetoAllowance: 2 },
    teams: [team(1), team(2)],
    runningSessionId: `session-${slug}-0`,
    wheel,
    ...afterResult,
    members: members({ kitty: { zone: 'team', team: hat ? 2 : 1 } }),
  })
}

const wheelWith = (vetoes: Partial<VetoView>, spin: WheelView['spin'] = null): WheelView => ({
  count: 5,
  slices: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id })),
  spin,
  vetoes: { left: [2, 2], own: null, revealed: null, draw: null, ...vetoes },
})
/** A window that ended `endedAgo` ms ago; `revealed` is what its read carries. */
const windowEnded = (endedAgo: number): VetoDrawView => ({ drawId: 'd1', kind: 'spin', stopAt: iso(Date.now() - endedAgo - 40_000), vetoEndsAt: iso(Date.now() - endedAgo), game: kart })

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
let slug = ''
let served: ReturnType<typeof serve>
const lastSocket = () => sockets[sockets.length - 1]!
const settle = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

/** The Event page for one test, with its room: open, and the clock's first answer in, so the page's server clock is ready. */
async function mountLive(setup: Setup) {
  served = serve(next => readOf(next, setup))
  slug = served.slug
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, { method: 'POST', handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }) })
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body, global: { stubs: { TransitionGroup: false } } })
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  lastSocket().options.onOpen()
  await vi.waitFor(() => expect(lastSocket().send.mock.calls.some(([text]) => String(text).includes('clock.ping'))).toBe(true))
  const ping = lastSocket().send.mock.calls.map(([text]) => JSON.parse(String(text)) as { type: string, t0: number }).find(message => message.type === 'clock.ping')!
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'clock.pong', t0: ping.t0 } as RoomMessage, Date.now())))
  await settle()
  return page
}

/** An `emote.sent` as the room sends it; `serverTime` is the envelope's. */
const say = (userId: string, emote: EmoteId, { sound = true, serverTime = Date.now() }: { sound?: boolean, serverTime?: number } = {}) =>
  lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'emote.sent', userId, emote, sound } as RoomMessage, serverTime)))

const head = () => page!.find('header .compibert')
const rig = () => page!.find('header .compibert-rig')
const stateOf = () => rig().attributes('data-state')
const shows = (state: string) => vi.waitFor(() => expect(stateOf()).toBe(state), { timeout: 5000 })
/** What the header shows after the page had a moment to react: the static head and no rig. */
async function stillStatic() {
  await flushPromises()
  await settle(100)
  expect(head().exists()).toBe(true)
  expect(rig().exists()).toBe(false)
}

// GSAP is loaded once before the first test, so a case under fake timers never waits for the chunk's real import.
beforeAll(async () => {
  await loadGsap()
})

beforeEach(() => {
  signInAs(kitty)
  stubScreen(true)
  stubInView()
  sockets.length = 0
  chunk.fail = 0
  chunk.held = null
  useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  motion('full')
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useRuntimeConfig().public.realtimeUrl = ''
  restoreScreen()
  document.body.innerHTML = ''
})

afterAll(() => {
  chunk.held = null
})

describe.each([{ host: false }, { host: true }])('the header\'s Compibert on the Event page, Host $host', ({ host }) => {
  describe('before any reaction', () => {
    it('is the static head, and a wheel\'s stop and Draw change nothing', async () => {
      const stopped = wheelWith({ draw: windowEnded(1000) }, { roundId: 'r1', drawId: 'd1', spinStartAt: iso(Date.now() - 8000), stopAt: iso(Date.now() - 2000), slices: 5, resultIndex: 3, resultOffset: 0.25, labels: null, game: kart, current: true })
      await mountLive({ host, wheel: wheelWith({}) })
      expect(head().exists()).toBe(true)
      expect(rig().exists()).toBe(false)

      served.set(readOf(slug, { host, wheel: stopped }))
      await refreshEvent(slug)

      await stillStatic()
    })

    it('stays the static head for another Member\'s Emote, all four, and for an own Emote older than 2 s', async () => {
      await mountLive({ host })

      for (const emote of ['clap', 'tears', 'angry', 'roar'] as const) say(LARSI, emote)
      say(kitty.id, 'clap', { serverTime: Date.now() - 2500 })

      await stillStatic()
    })
  })

  describe('the own Emote', () => {
    it.each([['clap', 'clap'], ['tears', 'laugh'], ['angry', 'angry'], ['roar', 'roar']] as const)('swaps the rig in, showing %s as %s', async (emote, state) => {
      await mountLive({ host })

      say(kitty.id, emote)

      await shows(state)
      expect(head().exists()).toBe(false)
    })

    it('returns to idle after the length of a clap, 2 s', async () => {
      await mountLive({ host })

      say(kitty.id, 'clap')
      await shows('clap')
      const started = Date.now()

      await vi.waitFor(() => expect(stateOf()).toBe('idle'), { timeout: 4000 })
      expect(Date.now() - started).toBeGreaterThanOrEqual(1800)
    })

    it('has the head\'s box: full width, square, in the same span as the static head', async () => {
      await mountLive({ host })
      const slot = head().element.parentElement
      const still = (head().element as HTMLElement).style

      say(kitty.id, 'roar')
      await shows('roar')

      expect(rig().element.parentElement).toBe(slot)
      expect(slot!.className).toContain('w-[30px]')
      const style = (rig().element as HTMLElement).style
      expect(style.width).toBe('100%')
      expect(style.aspectRatio).toMatch(/^1( \/ 1)?$/)
      expect(style.aspectRatio).toBe(still.aspectRatio)
    })

    it('reacts when the room marked it without a sound', async () => {
      await mountLive({ host })

      say(kitty.id, 'tears', { sound: false })

      await shows('laugh')
    })

    it('shows the second Emote of equal priority, 100 ms after the first (clap, then roar)', async () => {
      await mountLive({ host })

      say(kitty.id, 'clap')
      await shows('clap')
      await settle(100)
      say(kitty.id, 'roar')

      await shows('roar')
    })

    it('is held, not played, under Reduced motion, with the reaction\'s state', async () => {
      motion('reduced')
      await mountLive({ host })

      say(kitty.id, 'angry')

      await shows('angry')
      expect(rig().attributes('data-held')).toBe('true')
    })
  })

  describe('the reveal of the Vetoes', () => {
    it('shows angry when a reveal with a Veto arrives on a page that saw the window', async () => {
      await mountLive({ host, wheel: wheelWith({ draw: windowEnded(300) }) })
      expect(rig().exists()).toBe(false)

      served.set(readOf(slug, { host, wheel: wheelWith({ draw: windowEnded(300), revealed: [{ team: 1 }] }) }))
      await refreshEvent(slug)

      await shows('angry')
    })

    it('shows nothing for a reveal with no Veto', async () => {
      await mountLive({ host, wheel: wheelWith({ draw: windowEnded(300) }) })

      served.set(readOf(slug, { host, wheel: wheelWith({ draw: windowEnded(300), revealed: [] }) }))
      await refreshEvent(slug)

      await stillStatic()
    })

    it('shows nothing on a page whose first read already carries the reveal (a reload), nor on its refetch', async () => {
      const revealed = wheelWith({ draw: windowEnded(300), revealed: [{ team: 1 }, { team: 2 }] })
      await mountLive({ host, wheel: revealed })

      served.set(readOf(slug, { host, wheel: wheelWith({ draw: windowEnded(300), revealed: [{ team: 1 }, { team: 2 }] }) }))
      await refreshEvent(slug)

      await stillStatic()
    })

    it('shows nothing for a reveal that arrives more than 2 s after the window\'s end', async () => {
      await mountLive({ host, wheel: wheelWith({ draw: windowEnded(3000) }) })

      served.set(readOf(slug, { host, wheel: wheelWith({ draw: windowEnded(3000), revealed: [{ team: 1 }] }) }))
      await refreshEvent(slug)

      await stillStatic()
    })
  })

  describe('the connection', () => {
    /** The page needs real timers to mount, the banner's timing needs fake ones (as test/nuxt/event-live.test.ts). */
    async function mountThenFreezeClock() {
      await mountLive({ host })
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    }
    const advance = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms)
      await flushPromises()
    }

    it('is confused from the banner on, reconnecting and lost, with the static head already swapped', async () => {
      await mountThenFreezeClock()

      lastSocket().options.onClose()
      await advance(1999)
      expect(rig().exists()).toBe(false)
      await advance(1)
      expect(head().exists()).toBe(false)
      expect(stateOf()).toBe('confused')

      await advance(13_000)
      expect(stateOf()).toBe('confused')
    })

    it('stays confused for an own Emote while the connection is lost', async () => {
      await mountThenFreezeClock()
      lastSocket().options.onClose()
      await advance(15_000)

      say(kitty.id, 'clap')
      await advance(100)

      expect(stateOf()).toBe('confused')
    })

    it('waves once when the connection is back, then is idle after 2.2 s', async () => {
      await mountThenFreezeClock()
      lastSocket().options.onClose()
      await advance(15_000)

      lastSocket().options.onOpen()
      await advance(10)
      expect(stateOf()).toBe('wave')

      await advance(2100)
      expect(stateOf()).toBe('wave')
      await advance(200)
      expect(stateOf()).toBe('idle')

      // „Wieder da“ ends two seconds after the return: no second wave.
      await advance(5000)
      expect(stateOf()).toBe('idle')
    })

    it('shows nothing for a short drop that showed no banner', async () => {
      await mountThenFreezeClock()

      lastSocket().options.onClose()
      await advance(1000)
      lastSocket().options.onOpen()
      await advance(3000)

      expect(rig().exists()).toBe(false)
      expect(head().exists()).toBe(true)
    })
  })

  describe('a GSAP chunk that does not come', () => {
    it('keeps the static head when it fails, and swaps the rig in and plays the next own Emote when it is back', async () => {
      await mountLive({ host })
      chunk.fail = 1

      say(kitty.id, 'clap')
      await flushPromises()
      await settle(100)
      expect(chunk.fail).toBe(0)
      expect(head().exists()).toBe(true)
      expect(rig().exists()).toBe(false)

      say(kitty.id, 'roar')

      await shows('roar')
      expect(head().exists()).toBe(false)
    })

    it('plays no stale reaction when the chunk arrives after the reaction\'s length', async () => {
      await mountLive({ host })
      let release = () => {}
      chunk.held = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.useFakeTimers({ toFake: ['Date'] })

      say(kitty.id, 'clap')
      await flushPromises()
      expect(rig().exists()).toBe(false)
      vi.setSystemTime(Date.now() + 2100)
      release()

      await vi.waitFor(() => expect(rig().attributes('data-ready')).toBe('true'), { timeout: 5000 })
      expect(stateOf()).toBe('idle')
      await settle(100)
      expect(stateOf()).toBe('idle')
    })

    it('plays a reaction that is still on when the chunk arrives', async () => {
      await mountLive({ host })
      let release = () => {}
      chunk.held = new Promise<void>((resolve) => {
        release = resolve
      })

      say(kitty.id, 'clap')
      await flushPromises()
      expect(rig().exists()).toBe(false)
      release()

      await shows('clap')
    })
  })
})

describe('the party hat', () => {
  it.each([{ host: false }, { host: true }])('is on the static head before the first reaction and on the rig after it, once (Host $host)', async ({ host }) => {
    await mountLive({ host, hat: true })
    expect(page!.findAll('header .compibert-hat')).toHaveLength(1)
    expect(page!.findAll('header .compibert .compibert-hat')).toHaveLength(1)

    say(kitty.id, 'clap')
    await shows('clap')

    expect(page!.findAll('header .compibert-hat')).toHaveLength(1)
    expect(page!.findAll('header .compibert-rig .compibert-hat')).toHaveLength(1)
  })

  it('is not drawn for a Player outside the Leading Party, before or after the swap', async () => {
    await mountLive({ host: false })

    say(kitty.id, 'clap')
    await shows('clap')

    expect(page!.findAll('header .compibert-hat')).toHaveLength(0)
  })
})

describe('the other pages', () => {
  it('keep the static head: the hub\'s header has no rig, and a moment later still none', async () => {
    const hub = await mountSuspended(AppShell, { props: { kind: 'hub' }, route: '/' })

    expect(hub.find('header .compibert').exists()).toBe(true)
    expect(hub.find('header .compibert-rig').exists()).toBe(false)
    await flushPromises()
    await settle(100)
    expect(hub.find('header .compibert-rig').exists()).toBe(false)
    hub.unmount()
  })
})
