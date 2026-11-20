import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Message } from '../../shared/chat'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, hostSignsIn, readEvent, readFeed, setUpEvent, startRunningEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// Writing a Message (#758, spec #719 § A): a Member writes through POST /api/e/:slug/messages; the row is stored, one `chat.added` goes to the whole
// room (no `event.changed`, no Activity entry), and a retry with the id of a stored Message stores and sends nothing and answers with the stored one.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '9', name: 'Andere', email: 'other-host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
} as const
const stranger = { provider: 'twitch', id: '7', name: 'Fremd', email: 'stranger@example.com', image: undefined } as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'

let counter = 0
/** A fresh lower-case uuid, as the page makes it (`crypto.randomUUID()`). */
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

describe('writing a Message', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => request)

  const write = (cookie: string | undefined, slug: string, body: unknown) => send('POST', `/api/e/${slug}/messages`, cookie, body)

  /** A running Event: the Host, Players one and two seated in teams 1 and 2, Player three a Member on the Stands, and a signed-in stranger who is no Member. */
  async function runningEvent() {
    return await startRunningEvent(rig, { host, players, seats: [['one', 1], ['two', 2]], slots: SLOTS, outsiders: { stranger } })
  }

  const rowsOf = async (eventId: string) => await testDb.db.select().from(messages).where(eq(messages.eventId, eventId))

  const added = (eventId: string) => notifier.messages(eventId).filter(message => message.type === 'chat.added')

  describe('what a write does', () => {
    it('stores the Message, answers it and sends one chat.added to the whole room, no event.changed', async () => {
      const ev = await runningEvent()
      const id = newId()

      const response = await write(ev.players.one.cookie, ev.slug, { id, text: 'Hallo zusammen' })

      const message: Message = { id, writerId: ev.players.one.id, text: 'Hallo zusammen', at: T0 }
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(message)
      const rows = await rowsOf(ev.eventId)
      expect(rows).toEqual([{ id, eventId: ev.eventId, writerId: ev.players.one.id, text: 'Hallo zusammen', writtenAt: new Date(T0), deletedAt: null, deletedBy: null }])
      expect(notifier.messages(ev.eventId)).toEqual([{ type: 'chat.added', message, v: 1, serverTime: new Date(T0).getTime() }])
      expect(notifier.sends(ev.eventId)).toHaveLength(1)
      expect(notifier.sends(ev.eventId)[0]!.to).toBeNull()
    })

    it('lets the Host and a Member on the Stands write too', async () => {
      const ev = await runningEvent()

      for (const writer of [ev.host, ev.players.three]) {
        const response = await write(writer.cookie, ev.slug, { id: newId(), text: 'Moin' })
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ writerId: writer.id, text: 'Moin' })
      }
      expect(await rowsOf(ev.eventId)).toHaveLength(2)
      expect(added(ev.eventId)).toHaveLength(2)
    })

    it('stores, answers and sends the text normalised', async () => {
      const ev = await runningEvent()

      const response = await write(ev.host.cookie, ev.slug, { id: newId(), text: '  Hallo\nWelt ' })

      expect(await response.json()).toMatchObject({ text: 'Hallo Welt' })
      expect((await rowsOf(ev.eventId))[0]!.text).toBe('Hallo Welt')
      expect(added(ev.eventId)[0]).toMatchObject({ message: { text: 'Hallo Welt' } })
    })

    it('is written in the Date poll Phase and in a running Event alike', async () => {
      const poll = await setUpEvent(rig, { host, players, seats: [], slots: SLOTS, confirmed: 0 })
      expect((await write(poll.players.one.cookie, poll.slug, { id: newId(), text: 'Im Poll' })).status).toBe(200)

      const running = await runningEvent()
      expect((await write(running.players.one.cookie, running.slug, { id: newId(), text: 'Im Lauf' })).status).toBe(200)
    })
  })

  describe('who may write, and what is refused', () => {
    it('answers 401 without a cookie, 404 for a User who is no Member and 410 for a former Member of a Deleted Event, storing and sending nothing', async () => {
      // In the Date poll Phase, where an Event may be deleted.
      const ev = await setUpEvent(rig, { host, players, seats: [], slots: SLOTS, confirmed: 0, outsiders: { stranger } })

      expect((await write(undefined, ev.slug, { id: newId(), text: 'Hi' })).status).toBe(401)
      expect((await write(ev.outsiders.stranger.cookie, ev.slug, { id: newId(), text: 'Hi' })).status).toBe(404)
      expect((await send('DELETE', `/api/e/${ev.slug}`, ev.host.cookie)).status).toBe(200)
      notifier.clear()
      const gone = await write(ev.players.one.cookie, ev.slug, { id: newId(), text: 'Hi' })
      expect(gone.status).toBe(410)

      expect(await rowsOf(ev.eventId)).toEqual([])
      expect(notifier.messages(ev.eventId)).toEqual([])
    })

    it('refuses an empty text and 501 characters with invalid_message, and takes 500', async () => {
      const ev = await runningEvent()

      for (const text of ['', '   ', '\n', 'a'.repeat(501)]) {
        expect(await errorOf(await write(ev.host.cookie, ev.slug, { id: newId(), text }))).toEqual({ status: 400, code: 'invalid_message' })
      }
      clock.advance(10_000)
      expect(await rowsOf(ev.eventId)).toEqual([])
      expect(notifier.messages(ev.eventId)).toEqual([])

      expect((await write(ev.host.cookie, ev.slug, { id: newId(), text: 'a'.repeat(500) })).status).toBe(200)
    })

    it('refuses a missing or non-uuid id and a text that is no string with invalid_value', async () => {
      const ev = await runningEvent()

      for (const body of [{ text: 'Hi' }, { id: 'nope', text: 'Hi' }, { id: 5, text: 'Hi' }, { id: newId() }, { id: newId(), text: 5 }, { id: newId(), text: 'a\u0000b' }]) {
        expect(await errorOf(await write(ev.host.cookie, ev.slug, body))).toEqual({ status: 400, code: 'invalid_value' })
        clock.advance(10_000) // every request counts toward the limit, a refused one too
      }
      expect(await rowsOf(ev.eventId)).toEqual([])
      expect(notifier.messages(ev.eventId)).toEqual([])
    })
  })

  describe('the limit of 5 Messages in 10 seconds per User', () => {
    it('refuses the sixth, still refuses at 9 999 ms and takes the next at 10 000 ms; another User is not limited', async () => {
      const ev = await runningEvent()

      for (let index = 0; index < 5; index++) expect((await write(ev.host.cookie, ev.slug, { id: newId(), text: `Nr ${index}` })).status).toBe(200)
      expect(await errorOf(await write(ev.host.cookie, ev.slug, { id: newId(), text: 'Sechs' }))).toEqual({ status: 429, code: 'rate_limited' })
      expect(await rowsOf(ev.eventId)).toHaveLength(5)
      expect((await write(ev.players.one.cookie, ev.slug, { id: newId(), text: 'Ich auch' })).status).toBe(200)

      clock.advance(9_999)
      expect((await write(ev.host.cookie, ev.slug, { id: newId(), text: 'Noch nicht' })).status).toBe(429)
      clock.advance(1)
      expect((await write(ev.host.cookie, ev.slug, { id: newId(), text: 'Jetzt' })).status).toBe(200)
    })

    it('counts a retry and a request that is refused later', async () => {
      const ev = await runningEvent()
      const id = newId()

      expect((await write(ev.host.cookie, ev.slug, { id, text: 'Eins' })).status).toBe(200)
      for (let index = 0; index < 3; index++) expect((await write(ev.host.cookie, ev.slug, { id, text: 'Eins' })).status).toBe(200)
      expect((await write(ev.host.cookie, ev.slug, { id: newId(), text: '' })).status).toBe(400)

      expect((await write(ev.host.cookie, ev.slug, { id: newId(), text: 'Sechs' })).status).toBe(429)
    })
  })

  describe('a retry with the id of a stored Message', () => {
    it('stores nothing, sends nothing and answers the stored Message, whatever text the retry carries', async () => {
      const ev = await runningEvent()
      const id = newId()
      const first = await (await write(ev.players.one.cookie, ev.slug, { id, text: 'Erster Text' })).json()

      const again = await write(ev.players.one.cookie, ev.slug, { id, text: 'Anderer Text' })

      expect(again.status).toBe(200)
      expect(await again.json()).toEqual(first)
      expect(await rowsOf(ev.eventId)).toHaveLength(1)
      expect(added(ev.eventId)).toHaveLength(1)
    })

    it('answers the deleted variant when the Message was deleted meanwhile, and sends nothing', async () => {
      const ev = await runningEvent()
      const id = newId()
      await write(ev.players.one.cookie, ev.slug, { id, text: 'Weg damit' })
      notifier.clear()
      await testDb.db.update(messages).set({ text: null, deletedAt: new Date(T0), deletedBy: 'writer' }).where(eq(messages.id, id))

      const again = await write(ev.players.one.cookie, ev.slug, { id, text: 'Weg damit' })

      expect(again.status).toBe(200)
      expect(await again.json()).toEqual({ id, writerId: ev.players.one.id, text: null, at: T0, deletedBy: 'writer' })
      expect(notifier.messages(ev.eventId)).toEqual([])
    })

    it('refuses the id of another Member and of another Event with the answer of a non-uuid id, and names nothing', async () => {
      const ev = await runningEvent()
      const id = newId()
      await write(ev.players.one.cookie, ev.slug, { id, text: 'Geheim-ish' })
      const elsewhereHost = await hostSignsIn(rig, otherHost)
      const elsewhere = await hostCreatesEvent(rig, elsewhereHost)
      notifier.clear()
      const before = await rowsOf(ev.eventId)

      const reference = await write(ev.players.two.cookie, ev.slug, { id: 'nope', text: 'Hi' })
      const byOther = await write(ev.players.two.cookie, ev.slug, { id, text: 'Hi' })
      const inOtherEvent = await write(elsewhereHost.cookie, elsewhere.slug, { id, text: 'Hi' })

      for (const response of [byOther, inOtherEvent]) {
        expect(await errorOf(response.clone())).toEqual({ status: 400, code: 'invalid_value' })
        expect(response.statusText).toBe(reference.statusText)
        expect(await response.text()).toBe(await reference.clone().text())
      }
      expect(await rowsOf(ev.eventId)).toEqual(before)
      expect(await rowsOf(elsewhere.eventId)).toEqual([])
      expect(notifier.messages(ev.eventId)).toEqual([])
      expect(notifier.messages(elsewhere.eventId)).toEqual([])
    })

    it('stores one row and sends one chat.added when two identical writes arrive together', async () => {
      const ev = await runningEvent()
      const id = newId()

      const [first, second] = await Promise.all([
        write(ev.players.one.cookie, ev.slug, { id, text: 'Doppelt' }),
        write(ev.players.one.cookie, ev.slug, { id, text: 'Doppelt' }),
      ])

      expect([first.status, second.status]).toEqual([200, 200])
      expect(await first.json()).toEqual(await second.json())
      expect(await rowsOf(ev.eventId)).toHaveLength(1)
      expect(added(ev.eventId)).toHaveLength(1)
    })
  })

  it('changes nothing else: the Event read and the feed are as they were', async () => {
    const ev = await runningEvent()
    const before = { event: await readEvent(rig, ev.host.cookie, ev.slug), feed: await readFeed(rig, ev.host.cookie, ev.slug) }

    expect((await write(ev.players.one.cookie, ev.slug, { id: newId(), text: 'Nichts sonst' })).status).toBe(200)

    const after = { event: await readEvent(rig, ev.host.cookie, ev.slug), feed: await readFeed(rig, ev.host.cookie, ev.slug) }
    expect(after.event).toMatchObject(before.event)
    expect(after.feed.map(entry => entry.id)).toEqual(before.feed.map(entry => entry.id))
  })
})
