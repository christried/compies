import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
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

// `$fetch` passes through, except while a test sets `offline`: then every call fails like a request that never reached the server, with no status (#681).
const network = vi.hoisted(() => ({ offline: false }))
mockNuxtImport('$fetch', (original) => {
  const fetchOrFail = (...args: unknown[]) => network.offline ? Promise.reject(new TypeError('Failed to fetch')) : (original as (...args: unknown[]) => Promise<unknown>)(...args)
  return Object.assign(fetchOrFail, original)
})

let testNumber = 0

/** An Event link for one test: its reads are counted, its room tickets are served and counted. */
function serveLive(isHost = false) {
  testNumber += 1
  const slug = `live-${testNumber}`
  // `ticketStatus` makes the room's token endpoint refuse with that status; `ticketCalls` counts every request to it, a refused one included.
  // `hold` makes a read wait for the test (a read in flight, #917).
  const served = { reads: 0, tickets: 0, ticketCalls: 0, name: 'Freitags-Zocken', status: null as number | null, ticketStatus: null as number | null, hold: null as Promise<void> | null }
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: async () => {
      served.reads += 1
      if (served.hold) await served.hold
      if (served.status) throw createError({ statusCode: served.status, statusMessage: 'gone' })
      return { ...view(slug, [], { event: { isHost } }), event: { slug, name: served.name, phase: 'poll', isHost } }
    },
  })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  registerEndpoint(`/api/e/${slug}/room`, {
    method: 'POST',
    handler: () => {
      served.ticketCalls += 1
      if (served.ticketStatus) throw createError({ statusCode: served.ticketStatus, statusMessage: 'refused' })
      served.tickets += 1
      return { url: 'https://rt.test', room: `event-id-${slug}`, token: `token-${served.tickets}` }
    },
  })
  return { slug, served }
}

const lastSocket = () => sockets[sockets.length - 1]!
const settle = () => new Promise(resolve => setTimeout(resolve))
const sendMessage = (type: 'event.changed' | 'event.gone') => lastSocket().options.onMessage(JSON.stringify(envelope({ type }, Date.now())))

/** Pages mounted by a test. Each keeps listening for returns (window focus, visibility, online) until it unmounts. */
const mounted: { unmount: () => void }[] = []

async function mountLive(isHost = false) {
  const live = serveLive(isHost)
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

  // The Host deletes the Event while a Member has it open (#333): the room's event.changed refetches, the read answers 410, and the page shows
  // „Event gelöscht“ in place of the Event, with the phone's TabBar gone.
  it('shows Event gelöscht on a Member\'s open phone page once the room says it changed and the read answers 410 (#333)', async () => {
    stubScreen(false)
    const slug = 'live-deleted'
    const served = { gone: false }
    registerEndpoint(`/api/e/${slug}`, {
      method: 'GET',
      handler: () => {
        if (served.gone) throw createError({ statusCode: 410, statusMessage: 'Event deleted' })
        return { ...view(slug, []), event: { slug, name: 'Freitags-Zocken', phase: 'poll', isHost: false } }
      },
    })
    registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
    registerEndpoint(`/api/e/${slug}/room`, { method: 'POST', handler: () => ({ url: 'https://rt.test', room: `event-id-${slug}`, token: 'token' }) })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    mounted.push(page)
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
    expect(page.find('nav[aria-label="Event"]').exists()).toBe(true)

    served.gone = true
    sendMessage('event.changed')

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Event gelöscht'))
    expect(page.find('nav[aria-label="Event"]').exists()).toBe(false)
  })

  it('shows an Activity feed entry the room sends in the side panel under „Aktivität“, on the same socket', async () => {
    stubScreen(true)
    const { page } = await mountLive()
    const entry = { id: 'entry-1', type: 'member_joined', at: new Date().toISOString(), actor: { id: 'u1', name: 'Larsi' }, params: {}, people: {}, games: {} }

    lastSocket().options.onMessage(JSON.stringify(envelope({ type: 'activity.added', entry } as RoomMessage, Date.now())))

    // The panel opens on the Chat (#761); the feed is the tab after it.
    await page.findAll('[role="tab"]').find(tab => tab.text() === 'Aktivität')!.trigger('click')
    await vi.waitFor(() => expect(page.find('[role="log"][aria-label="Aktivität"]').text()).toContain('Larsi ist dem Event beigetreten'))
    expect(page.find('[role="tabpanel"] [role="log"][aria-label="Aktivität"]').exists()).toBe(true)
    expect(page.get('[role="tab"][aria-selected="true"]').text()).toBe('Aktivität')
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

  // Once the 410 state shows, the room is stopped: no read of the Event, no room ticket, and no reconnect that asks for one (#914).
  it('stops the room once a Member\'s page shows Event gelöscht: no read, no ticket, the socket closed (#914)', async () => {
    const { served, page } = await mountLive()
    served.status = 410
    sendMessage('event.changed')
    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Event gelöscht'))
    await settle()
    const reads = served.reads
    const tickets = served.tickets

    window.dispatchEvent(new Event('focus'))
    lastSocket().options.onClose()
    await settle()
    await settle()

    expect(served.reads).toBe(reads)
    expect(served.tickets).toBe(tickets)
    expect(lastSocket().close).toHaveBeenCalled()
  })

  // The Host deleted their account while the Event is open (#917, ADR 0020): the room says `event.gone`, and the page shows the 410 state without reading again. The
  // endpoint keeps answering the Event, so only the message can have ended it.
  describe.each([['a Member\'s', false], ['the Host\'s', true]])('%s page', (_who, isHost) => {
    it('shows Event gelöscht on event.gone and reads nothing more: no read, no ticket, the socket closed (#917)', async () => {
      const { served, page } = await mountLive(isHost)
      const reads = served.reads
      const tickets = served.tickets

      sendMessage('event.gone')

      await vi.waitFor(() => expect(page.get('h1').text()).toBe('Event gelöscht'))
      await settle()
      window.dispatchEvent(new Event('focus'))
      lastSocket().options.onClose()
      await settle()
      await settle()
      expect(served.reads).toBe(reads)
      expect(served.tickets).toBe(tickets)
      expect(lastSocket().close).toHaveBeenCalled()
    })
  })

  it('shows Event gelöscht on a phone page after event.gone: no TabBar and not the Event\'s name (#917)', async () => {
    stubScreen(false)
    const { page } = await mountLive()
    expect(page.find('nav[aria-label="Event"]').exists()).toBe(true)

    sendMessage('event.gone')

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Event gelöscht'))
    expect(page.find('nav[aria-label="Event"]').exists()).toBe(false)
    expect(page.text()).not.toContain('Freitags-Zocken')
  })

  it.each([['an Event', 200], ['an error', 404]])('ends on Event gelöscht when event.gone comes while a read is in flight and the read then answers %s (%i)', async (_what, status) => {
    const { served, page } = await mountLive()
    let release!: () => void
    served.hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const reads = served.reads
    sendMessage('event.changed')
    await vi.waitFor(() => expect(served.reads).toBe(reads + 1))

    sendMessage('event.gone')
    if (status !== 200) served.status = status
    release()
    await settle()
    await settle()

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Event gelöscht'))
    expect(page.text()).not.toContain('Freitags-Zocken')
  })

  it('ends on Event gelöscht when event.gone comes to a page whose first read failed', async () => {
    const live = serveLive()
    live.served.status = 500
    const page = await mountSuspended(EventPage, { route: `/e/${live.slug}` })
    mounted.push(page)
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))

    sendMessage('event.gone')

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Event gelöscht'))
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

// A reconnect asks for a new token inside the socket's own `query`, and PartySocket retries a failing query for ever. A User who is no Member any more (a
// Deleted User's other device, a removed Member) would ask the token endpoint for ever, so a refusal (4xx) stops the room; a 5xx or a network failure is
// retried (#681).
describe('the room when a reconnect\'s ticket is refused (#681)', () => {
  beforeEach(() => {
    signInAs(kitty)
    sockets.length = 0
    createRoomSocket.mockClear()
    useRuntimeConfig().public.realtimeUrl = 'https://rt.test'
  })

  afterEach(() => {
    useRuntimeConfig().public.realtimeUrl = ''
    network.offline = false
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  let room: ReturnType<typeof useEventRoom>
  /** The composable on its own, to read its state and call its `retry`. */
  async function mountRoom() {
    const live = serveLive()
    const probe = defineComponent({
      setup() {
        room = useEventRoom(live.slug)
        return () => h('div')
      },
    })
    mounted.push(await mountSuspended(probe))
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
    return live
  }

  it.each([404, 401, 403, 410])('stops for good when a reconnect\'s ticket answers %i: the socket closed, the state closed, no retry and no later ticket', async (status) => {
    const { served } = await mountRoom()
    const socket = lastSocket()
    expect(await socket.options.token()).toBe('token-1')
    served.ticketStatus = status

    await expect(socket.options.token()).rejects.toMatchObject({ statusCode: status })

    expect(socket.close).toHaveBeenCalledTimes(1)
    expect(room.state.value).toBe('closed')
    const asked = served.ticketCalls
    room.retry()
    served.ticketStatus = null
    await expect(socket.options.token()).rejects.toThrow()
    await settle()
    expect(socket.reconnect).not.toHaveBeenCalled()
    expect(served.ticketCalls).toBe(asked)
    expect(createRoomSocket).toHaveBeenCalledTimes(1)
  })

  it('keeps the room on a 500 and asks again at the next reconnect', async () => {
    const { served } = await mountRoom()
    const socket = lastSocket()
    expect(await socket.options.token()).toBe('token-1')
    served.ticketStatus = 500

    await expect(socket.options.token()).rejects.toMatchObject({ statusCode: 500 })

    expect(socket.close).not.toHaveBeenCalled()
    served.ticketStatus = null
    expect(await socket.options.token()).toBe('token-2')
    room.retry()
    expect(socket.reconnect).toHaveBeenCalledTimes(1)
  })

  it.each([408, 429])('keeps the room on a reconnect\'s ticket answering %i (a timeout, a rate limit): asks again at the next reconnect (#993)', async (status) => {
    const { served } = await mountRoom()
    const socket = lastSocket()
    expect(await socket.options.token()).toBe('token-1')
    served.ticketStatus = status

    await expect(socket.options.token()).rejects.toMatchObject({ statusCode: status })

    expect(socket.close).not.toHaveBeenCalled()
    served.ticketStatus = null
    expect(await socket.options.token()).toBe('token-2')
    room.retry()
    expect(socket.reconnect).toHaveBeenCalledTimes(1)
  })

  it('asks for the first ticket again after a 429, once the retry wait is over (#993)', async () => {
    const live = serveLive()
    live.served.ticketStatus = 429
    let probeRoom!: ReturnType<typeof useEventRoom>
    const probe = defineComponent({
      setup() {
        probeRoom = useEventRoom(live.slug)
        return () => h('div')
      },
    })
    mounted.push(await mountSuspended(probe))
    await vi.waitFor(() => expect(probeRoom.state.value).toBe('closed'))
    expect(live.served.ticketCalls).toBe(1)

    live.served.ticketStatus = null
    await vi.waitFor(() => expect(sockets.length).toBe(1), { timeout: 8000 })
    expect(live.served.tickets).toBe(1)
  }, 10_000)

  it('keeps the room on a network failure and asks again at the next reconnect', async () => {
    const { served } = await mountRoom()
    const socket = lastSocket()
    expect(await socket.options.token()).toBe('token-1')
    network.offline = true

    await expect(socket.options.token()).rejects.toThrow('Failed to fetch')

    expect(socket.close).not.toHaveBeenCalled()
    network.offline = false
    expect(await socket.options.token()).toBe('token-2')
    expect(served.ticketCalls).toBe(2)
  })

  it.each([['a Member', false], ['the Host', true]])('stops the same way on %s\'s page', async (_who, isHost) => {
    const { served, page } = await mountLive(isHost)
    const socket = lastSocket()
    expect(await socket.options.token()).toBe('token-1')
    served.ticketStatus = 404

    await expect(socket.options.token()).rejects.toMatchObject({ statusCode: 404 })

    expect(socket.close).toHaveBeenCalledTimes(1)
    const asked = served.ticketCalls
    socket.options.onClose()
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(served.ticketCalls).toBe(asked)
    expect(page.exists()).toBe(true)
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
    expect(lost?.text()).toContain('Du siehst den letzten Stand (den du kennst lol).')

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
