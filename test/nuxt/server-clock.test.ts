import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { CLOCK_READY_GRACE_MS, useServerClock } from '~/composables/useServerClock'
import { useServerTicker } from '~/composables/useServerTicker'
import { envelope, type ClientMessage, type Envelope, type RoomMessage, type RoomMessageType } from '~~/shared/realtime'

// The server's clock on the client (#162, spec #153 § Clock sync): six probes on every open, the offset of the fastest
// round trip, a resync on a reconnect, on coming back to the tab and on the network, and when a message shows the
// estimate is behind. The room is a fake that answers each probe over a simulated link; time is simulated too, with
// the server's clock SKEW ms ahead of the client's own (performance.now).
const SKEW = 4_000_000
const server = { bump: 0 }

/** The true server time. */
const serverNow = () => performance.now() + SKEW + server.bump

type Handler = (message: Envelope) => void
type Link = { out: number, back: number } | null

/** A room whose answers to `clock.ping` number n (from 0, per test) take the link `link(n)` there and back; null: no answer. `enabled`: false is a page without a live connection (it polls). */
function fakeRoom(link: (n: number) => Link, enabled = true) {
  const state = ref<'connecting' | 'open' | 'closed'>('closed')
  const handlers = new Map<string, Handler[]>()
  const anyHandlers: Handler[] = []
  const sent: ClientMessage[] = []
  function say(message: RoomMessage, serverTime = serverNow()) {
    const wrapped = envelope(message, serverTime)
    for (const handler of anyHandlers) handler(wrapped)
    for (const handler of handlers.get(message.type) ?? []) handler(wrapped)
  }
  const room = {
    state,
    enabled,
    on: (type: RoomMessageType, handler: (message: never) => void) => {
      handlers.set(type, [...(handlers.get(type) ?? []), handler as Handler])
      return () => undefined
    },
    onAny: (handler: Handler) => {
      anyHandlers.push(handler)
      return () => undefined
    },
    send: (message: ClientMessage) => {
      const way = link(sent.length)
      sent.push(message)
      if (!way) return
      // The server stamps the probe when it arrives; the client hears the answer one way back later.
      setTimeout(() => {
        const stamped = serverNow()
        setTimeout(() => say({ type: 'clock.pong', t0: message.t0 }, stamped), way.back)
      }, way.out)
    },
  }
  return { room, sent, say }
}

async function setUp(link: (n: number) => Link = () => null, enabled = true) {
  const live = fakeRoom(link, enabled)
  let clock!: ReturnType<typeof useServerClock>
  await mountSuspended(defineComponent({
    setup() {
      clock = useServerClock(live.room)
      return () => h('div')
    },
  }))
  return { ...live, clock }
}

const open = async (room: { state: { value: string } }) => {
  room.state.value = 'open'
  await nextTick()
}
const elapse = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('useServerClock', () => {
  beforeEach(() => {
    server.bump = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'visibilityState')
    document.body.innerHTML = ''
  })

  it('sends six clock.ping probes about 100 ms apart when the connection opens, and none before', async () => {
    const { room, sent } = await setUp()

    await elapse(1000)
    expect(sent).toEqual([])

    await open(room)
    await elapse(0)
    expect(sent).toHaveLength(1)
    await elapse(1000)

    expect(sent).toHaveLength(6)
    expect(sent.every(ping => ping.type === 'clock.ping' && Number.isFinite(ping.t0))).toBe(true)
    for (let index = 1; index < sent.length; index++) expect(sent[index]!.t0 - sent[index - 1]!.t0).toBeGreaterThanOrEqual(100)
  })

  it('is not synced until a probe came back, and then tells the server time', async () => {
    const { room, clock } = await setUp(() => ({ out: 20, back: 20 }))
    await open(room)
    await elapse(0)
    expect(clock.synced.value).toBe(false)

    await elapse(40)

    expect(clock.synced.value).toBe(true)
    expect(Math.abs(clock.now() - serverNow())).toBeLessThanOrEqual(1)
  })

  it('keeps the offset of the probe with the lowest round trip', async () => {
    const links: Link[] = [{ out: 60, back: 10 }, { out: 15, back: 15 }, { out: 120, back: 120 }]
    const { room, clock } = await setUp(n => links[n] ?? { out: 90, back: 90 })
    await open(room)

    await elapse(75) // only the first answer is in: 70 ms there and back, and 25 ms off
    const slow = Math.abs(clock.now() - serverNow())
    await elapse(1000) // the fast one came back, the slower ones after it did not replace it

    expect(slow).toBeGreaterThan(20)
    expect(Math.abs(clock.now() - serverNow())).toBeLessThanOrEqual(1)
  })

  it('ignores a clock.pong for a probe it never sent', async () => {
    const { room, say, clock } = await setUp()
    await open(room)

    say({ type: 'clock.pong', t0: 123456 })

    expect(clock.synced.value).toBe(false)
  })

  it('probes again on every reconnect and follows a server clock that moved', async () => {
    const { room, sent, clock } = await setUp(() => ({ out: 20, back: 20 }))
    await open(room)
    await elapse(1000)
    expect(sent).toHaveLength(6)

    server.bump = 5000 // the server's time jumped while the connection was down
    room.state.value = 'closed'
    await nextTick()
    await open(room)
    await elapse(1000)

    expect(sent).toHaveLength(12)
    expect(Math.abs(clock.now() - serverNow())).toBeLessThanOrEqual(1)
  })

  it('probes again when the tab becomes visible and when the network comes back, only while the connection is open', async () => {
    const { room, sent } = await setUp()
    window.dispatchEvent(new Event('online'))
    await elapse(1000)
    expect(sent).toEqual([])

    await open(room)
    await elapse(1000)
    expect(sent).toHaveLength(6)

    window.dispatchEvent(new Event('online'))
    await elapse(1000)
    expect(sent).toHaveLength(12)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    await elapse(1000)
    expect(sent).toHaveLength(12)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await elapse(1000)
    expect(sent).toHaveLength(18)
  })

  it('probes again when a message is stamped later than the estimate of the server time, but not for one in step', async () => {
    const { room, sent, say } = await setUp(() => ({ out: 20, back: 20 }))
    await open(room)
    await elapse(1000)
    expect(sent).toHaveLength(6)

    say({ type: 'event.changed' }, serverNow() - 30)
    say({ type: 'event.changed' }, serverNow() + 100)
    await elapse(1000)
    expect(sent).toHaveLength(6)

    // Two late messages in a row start one round of probes, not two.
    say({ type: 'event.changed' }, serverNow() + 3000)
    say({ type: 'event.changed' }, serverNow() + 3000)
    await elapse(1000)
    expect(sent).toHaveLength(12)
  })
})

// A ticker waits for the server clock (#287, review 0.8 Q11): until the clock is usable it holds null, so a device clock running
// ahead cannot end a moment early. Here the device clock runs AHEAD ms ahead of the server's (Date.now is the server time plus AHEAD).
describe('the ticker waits for the clock (#287)', () => {
  const AHEAD = 5000
  const LEAD = 3000
  const FRAME_MS = 16

  beforeEach(() => {
    server.bump = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance'] })
    vi.setSystemTime(SKEW + AHEAD)
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'visibilityState')
    document.body.innerHTML = ''
  })

  /** A page with a clock and one ticker that ends a moment LEAD ms after the server's time at mount. */
  async function mountPage(link: (n: number) => Link, enabled = true) {
    const live = fakeRoom(link, enabled)
    const stopAt = serverNow() + LEAD
    let clock!: ReturnType<typeof useServerClock>
    let ticker!: Readonly<Ref<number | null>>
    const Ticking = defineComponent({
      setup() {
        ticker = useServerTicker(clock.now, { until: () => stopAt })
        return () => h('div')
      },
    })
    await mountSuspended(defineComponent({
      setup() {
        clock = useServerClock(live.room)
        return () => h(Ticking)
      },
    }))
    return { ...live, stopAt, ticker: () => ticker.value }
  }

  it('a device clock 5 s ahead before the sync and correct after it: a running moment keeps running', async () => {
    const { room, stopAt, ticker } = await mountPage(() => ({ out: 20, back: 20 }))

    expect(ticker()).toBeNull()

    await open(room)
    await elapse(1000)

    expect(ticker()).not.toBeNull()
    expect(ticker()!).toBeLessThan(stopAt)
    expect(Math.abs(ticker()! - serverNow())).toBeLessThanOrEqual(FRAME_MS)
  })

  it('without a live connection the page polls: the ticker runs on the device clock at mount, as before', async () => {
    const { ticker } = await mountPage(() => null, false)

    expect(ticker()).toBe(Date.now())
  })

  it('with no clock.pong the ticker waits the grace period, then runs on the device clock', async () => {
    const { room, ticker } = await mountPage(() => null)
    await open(room)

    await elapse(CLOCK_READY_GRACE_MS - 1)
    expect(ticker()).toBeNull()

    await elapse(1)
    await nextTick()
    expect(ticker()).toBe(Date.now())
  })
})
