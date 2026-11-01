import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { RETURN_DEDUPE_MS } from '~/composables/usePollRefresh'
import type { RoomSocketOptions } from '~/utils/room-socket'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { kitty, signInAs } from './auth'
import { restoreScreen, stubScreen, view, type Wrapper } from './event-page'

// The Event page goes live (#156, spec #153 § Live Event page): it refetches when its room says something changed
// and whenever the connection opens, polls only while the connection is down, and tells the User about the
// connection with the ConnectionBanner. The socket is a fake that the test opens, closes and sends messages on.
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

let testNumber = 0

/** An Event link for one test: its reads are counted, its room tickets are served and counted. */
function serveLive() {
  testNumber += 1
  const slug = `live-${testNumber}`
  const served = { reads: 0, tickets: 0, name: 'Freitags-Zocken' }
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => {
      served.reads += 1
      return { ...view(slug, []), event: { slug, name: served.name, phase: 'poll', isHost: false } }
    },
  })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, {
    method: 'POST',
    handler: () => {
      served.tickets += 1
      return { url: 'https://rt.test', room: `event-id-${slug}`, token: `token-${served.tickets}` }
    },
  })
  return { slug, served }
}

const lastSocket = () => sockets[sockets.length - 1]!
const settle = () => new Promise(resolve => setTimeout(resolve))
const sendMessage = (type: 'event.changed') => lastSocket().options.onMessage(JSON.stringify(envelope({ type }, Date.now())))

/** Pages mounted by a test. Each keeps listening for returns (window focus, visibility, online) until it unmounts. */
const mounted: { unmount: () => void }[] = []

async function mountLive() {
  const live = serveLive()
  const page = await mountSuspended(EventPage, { route: `/e/${live.slug}` })
  mounted.push(page)
  await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
  return { ...live, page }
}

// A page left mounted would refetch on the next test's return events and skew its read count (#198).
afterEach(() => {
  for (const page of mounted.splice(0)) page.unmount()
})

describe('the live Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    sockets.length = 0
    createRoomSocket.mockClear()
    useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  })

  afterEach(() => {
    useRuntimeConfig().public.realtimeUrl = ''
    restoreScreen()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('connects to the room of this Event with the token it was given, and asks for a new one on every reconnect', async () => {
    const { served } = await mountLive()

    expect(lastSocket().options).toMatchObject({ url: 'https://rt.test', room: expect.stringContaining('event-id-live-') })
    expect(served.tickets).toBe(1)
    expect(await lastSocket().options.token()).toBe('token-1')
    expect(served.tickets).toBe(1)
    expect(await lastSocket().options.token()).toBe('token-2')
    expect(served.tickets).toBe(2)
  })

  it('refetches the Event when the room says it changed, and shows what changed', async () => {
    const { served, page } = await mountLive()
    const before = served.reads

    served.name = 'Samstags-Zocken'
    sendMessage('event.changed')

    await vi.waitFor(() => expect(served.reads).toBe(before + 1))
    await vi.waitFor(() => expect(page.text()).toContain('Samstags-Zocken'))
  })

  it('shows an Activity feed entry the room sends in the side panel under „Aktivität“, on the same socket', async () => {
    stubScreen(true)
    const { page } = await mountLive()
    const entry = { id: 'entry-1', type: 'member_joined', at: new Date().toISOString(), actor: { id: 'u1', name: 'Larsi' }, params: {}, people: {}, games: {} }

    lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'activity.added', entry } as RoomMessage, Date.now())))

    await vi.waitFor(() => expect(page.find('[role="log"]').text()).toContain('Larsi ist dem Event beigetreten'))
    expect(page.find('[role="tabpanel"] [role="log"]').exists()).toBe(true)
    expect(page.get('[role="tab"]').text()).toBe('Aktivität')
    expect(sockets).toHaveLength(1)
  })

  it('ignores a message it does not know, a message of another version and text that is no message', async () => {
    const { served } = await mountLive()
    const before = served.reads

    lastSocket().options.onMessage(JSON.stringify({ v: 1, type: 'chat.said', serverTime: 1 }))
    lastSocket().options.onMessage(JSON.stringify({ v: 2, type: 'event.changed', serverTime: 1 }))
    lastSocket().options.onMessage('not json')
    await settle()

    expect(served.reads).toBe(before)
  })

  it('refetches on the first open and on every reconnect', async () => {
    const { served } = await mountLive()
    const before = served.reads

    lastSocket().options.onOpen()
    await vi.waitFor(() => expect(served.reads).toBe(before + 1))

    lastSocket().options.onClose()
    await settle()
    lastSocket().options.onOpen()
    await vi.waitFor(() => expect(served.reads).toBe(before + 2))
  })

  it('closes the socket when the page goes away', async () => {
    const { page } = await mountLive()

    page.unmount()

    expect(lastSocket().close).toHaveBeenCalledTimes(1)
  })

  it('does not connect where the app knows no Worker, and then polls', async () => {
    useRuntimeConfig().public.realtimeUrl = ''
    const live = serveLive()

    mounted.push(await mountSuspended(EventPage, { route: `/e/${live.slug}` }))
    await settle()

    expect(createRoomSocket).not.toHaveBeenCalled()
    expect(live.served.tickets).toBe(0)
  })
})

describe('polling as the fallback', () => {
  beforeEach(() => {
    signInAs(kitty)
    sockets.length = 0
    useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  })

  afterEach(() => {
    useRuntimeConfig().public.realtimeUrl = ''
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('polls every 15 seconds only while the connection is not open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const { served } = await mountLive()
    let reads = served.reads

    // Not open yet: the poll runs.
    await vi.advanceTimersByTimeAsync(15_000)
    expect(served.reads).toBeGreaterThan(reads)
    reads = served.reads

    // Open: it stops. The open itself refetches once.
    lastSocket().options.onOpen()
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(served.reads).toBe(reads + 1))
    reads = served.reads
    await vi.advanceTimersByTimeAsync(60_000)
    expect(served.reads).toBe(reads)

    // Down again: it runs again.
    lastSocket().options.onClose()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(served.reads).toBeGreaterThan(reads)
  })

  it('refetches once when the tab becomes visible again, on window focus and when the browser is back online, also while the connection is open', async () => {
    const { served } = await mountLive()
    const beforeOpen = served.reads
    lastSocket().options.onOpen()
    // The open itself refetches once: wait for that read, so that it is not counted as a return below.
    await vi.waitFor(() => expect(served.reads).toBe(beforeOpen + 1))
    await settle()
    // The returns below come a dedupe window apart (#238): the clock moves past it before each one.
    vi.useFakeTimers({ toFake: ['Date'] })

    /** Dispatches one return event and expects exactly one more read, even while the connection is open (#198). */
    const returnsOnce = async (dispatch: () => void) => {
      vi.setSystemTime(Date.now() + RETURN_DEDUPE_MS)
      const before = served.reads
      dispatch()
      await vi.waitFor(() => expect(served.reads).toBe(before + 1))
      await settle()
      expect(served.reads).toBe(before + 1)
    }

    try {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      try {
        await returnsOnce(() => document.dispatchEvent(new Event('visibilitychange')))
      }
      finally {
        Reflect.deleteProperty(document, 'visibilityState')
      }
      await returnsOnce(() => window.dispatchEvent(new Event('online')))
      await returnsOnce(() => window.dispatchEvent(new Event('focus')))
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('refetches once for one return that comes as visibility and focus together (#238)', async () => {
    const { served } = await mountLive()
    const beforeOpen = served.reads
    lastSocket().options.onOpen()
    await vi.waitFor(() => expect(served.reads).toBe(beforeOpen + 1))
    await settle()

    const before = served.reads
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    }
    finally {
      Reflect.deleteProperty(document, 'visibilityState')
    }
    await vi.waitFor(() => expect(served.reads).toBe(before + 1))
    await settle()
    expect(served.reads).toBe(before + 1)
  })

  it('refetches once for a return whose focus comes 50 ms after its visibility, and again for one 2 s later (#238)', async () => {
    const { served } = await mountLive()
    const beforeOpen = served.reads
    lastSocket().options.onOpen()
    await vi.waitFor(() => expect(served.reads).toBe(beforeOpen + 1))
    await settle()
    vi.useFakeTimers({ toFake: ['Date'] })

    try {
      const first = served.reads
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      try {
        document.dispatchEvent(new Event('visibilitychange'))
      }
      finally {
        Reflect.deleteProperty(document, 'visibilityState')
      }
      await vi.waitFor(() => expect(served.reads).toBe(first + 1))

      // The focus of the same return arrives in a later task: it is part of that return.
      vi.setSystemTime(Date.now() + 50)
      window.dispatchEvent(new Event('focus'))
      await settle()
      expect(served.reads).toBe(first + 1)

      vi.setSystemTime(Date.now() + 2000)
      window.dispatchEvent(new Event('focus'))
      await vi.waitFor(() => expect(served.reads).toBe(first + 2))
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('the ConnectionBanner on the Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    sockets.length = 0
    useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  })

  afterEach(() => {
    useRuntimeConfig().public.realtimeUrl = ''
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  const banner = (page: Awaited<ReturnType<typeof mountSuspended>>, text: string) =>
    page.findAll('[role="status"], [role="alert"]').find((element: Wrapper) => element.text().includes(text))

  /** A page whose connection is open, then the clock stops: the page needs real timers to mount, the banner's timing needs fake ones. */
  async function mountOpenThenFreezeClock() {
    const live = await mountLive()
    lastSocket().options.onOpen()
    await settle()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    return live
  }

  it('shows nothing for a drop under 2 s, then „wird wiederhergestellt“ as a status, then „verloren“ as an alert with a retry, then „Wieder da“ for 2 s', async () => {
    const { page } = await mountOpenThenFreezeClock()
    expect(banner(page, 'Verbindung')).toBeUndefined()

    lastSocket().options.onClose()
    await vi.advanceTimersByTimeAsync(1999)
    expect(banner(page, 'Verbindung')).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1)
    expect(banner(page, 'Verbindung wird wiederhergestellt')?.attributes('role')).toBe('status')
    // It sits right under the header, over the stage and the side panel, not in the stage (#166).
    const warning = banner(page, 'Verbindung wird wiederhergestellt')!.element
    expect(warning.closest('main')).toBeNull()
    expect(page.get('header').element.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(page.get('#stage').element.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()

    await vi.advanceTimersByTimeAsync(12_999)
    expect(banner(page, 'Verbindung wird wiederhergestellt')).toBeDefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(banner(page, 'Verbindung wird wiederhergestellt')).toBeUndefined()
    const lost = banner(page, 'Verbindung verloren')
    expect(lost?.attributes('role')).toBe('alert')
    expect(lost?.text()).toContain('Du siehst den letzten Stand.')

    lastSocket().options.onOpen()
    await vi.advanceTimersByTimeAsync(10)
    expect(banner(page, 'Verbindung verloren')).toBeUndefined()
    expect(banner(page, 'Wieder da')?.attributes('role')).toBe('status')

    await vi.advanceTimersByTimeAsync(2000)
    expect(banner(page, 'Wieder da')).toBeUndefined()
  })

  it('does not say „Wieder da“ after a drop that showed no banner', async () => {
    const { page } = await mountOpenThenFreezeClock()

    lastSocket().options.onClose()
    await vi.advanceTimersByTimeAsync(1000)
    lastSocket().options.onOpen()
    await vi.advanceTimersByTimeAsync(10)

    expect(banner(page, 'Wieder da')).toBeUndefined()
    expect(banner(page, 'Verbindung')).toBeUndefined()
  })

  it('shows the banner when the first connect fails and keeps failing, after the delays of a drop (#238)', async () => {
    // The socket closes before it ever opened: the first connect fails, and the clock starts at the failure.
    const { page } = await mountLive()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })

    lastSocket().options.onClose()
    await vi.advanceTimersByTimeAsync(1999)
    expect(banner(page, 'Verbindung')).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1)
    expect(banner(page, 'Verbindung wird wiederhergestellt')?.attributes('role')).toBe('status')

    await vi.advanceTimersByTimeAsync(13_000)
    expect(banner(page, 'Verbindung verloren')?.attributes('role')).toBe('alert')
  })

  it('shows nothing on a slow first connect, and no „Wieder da“ when it opens', async () => {
    // The socket never opens: the first connect is slow. The page needs real timers to mount, the banner's timing fake ones.
    const { page } = await mountLive()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })

    await vi.advanceTimersByTimeAsync(20_000)
    expect(banner(page, 'Verbindung')).toBeUndefined()

    lastSocket().options.onOpen()
    await vi.advanceTimersByTimeAsync(10)
    expect(banner(page, 'Wieder da')).toBeUndefined()
    expect(banner(page, 'Verbindung')).toBeUndefined()

    // A drop after that first open is announced as before.
    lastSocket().options.onClose()
    await vi.advanceTimersByTimeAsync(2000)
    expect(banner(page, 'Verbindung wird wiederhergestellt')).toBeDefined()
  })

  it('tries again at once when the retry button of „verloren“ is pressed', async () => {
    const { page } = await mountOpenThenFreezeClock()
    lastSocket().options.onClose()
    await vi.advanceTimersByTimeAsync(15_000)

    const retry = page.findAll('button').find(button => button.text() === 'Neu verbinden')
    expect(retry).toBeDefined()
    await retry!.trigger('click')

    expect(lastSocket().reconnect).toHaveBeenCalledTimes(1)
  })

  it('shows no banner at all where the app knows no Worker', async () => {
    useRuntimeConfig().public.realtimeUrl = ''
    const live = serveLive()
    const page = await mountSuspended(EventPage, { route: `/e/${live.slug}` })
    mounted.push(page)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })

    await vi.advanceTimersByTimeAsync(60_000)

    expect(banner(page, 'Verbindung')).toBeUndefined()
  })
})
