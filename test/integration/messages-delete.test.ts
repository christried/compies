import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, hostSignsIn, readEvent, readFeed, readFeedText, setUpEvent, startRunningEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// Deleting a Message (#760, spec #719 § A): the Host deletes any Message, a Member their own; the text is erased from the row, one `chat.deleted` with the
// id and the deleter goes to the whole room (no `event.changed`, no Activity entry), and a second delete answers the stored deleted Message.

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
const T1 = '2090-10-30T10:05:00.000Z'
const SECRET = 'Das Passwort ist Zitronenbaum'

let counter = 0
/** A fresh lower-case uuid, as the page makes it (`crypto.randomUUID()`). */
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

describe('deleting a Message', () => {
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
  const remove = (cookie: string | undefined, slug: string, id: string) => send('DELETE', `/api/e/${slug}/messages/${id}`, cookie)

  /** A running Event: the Host, Players one and two seated in teams 1 and 2, Player three a Member on the Stands, and a signed-in stranger who is no Member. */
  async function runningEvent() {
    return await startRunningEvent(rig, { host, players, seats: [['one', 1], ['two', 2]], slots: SLOTS, outsiders: { stranger } })
  }
  type Running = Awaited<ReturnType<typeof runningEvent>>

  /** Writes a Message through the write call and clears the notifier, so a case sees only what the delete sends. */
  async function writeMessage(ev: Running, writer: { cookie: string }, text = SECRET) {
    const id = newId()
    expect((await write(writer.cookie, ev.slug, { id, text })).status).toBe(200)
    notifier.clear()
    return id
  }

  const rowsOf = async (eventId: string) => await testDb.db.select().from(messages).where(eq(messages.eventId, eventId))
  const rowOf = async (id: string) => (await testDb.db.select().from(messages).where(eq(messages.id, id)))[0]!
  const deleted = (eventId: string) => notifier.messages(eventId).filter(message => message.type === 'chat.deleted')

  describe('who deletes, and what happens', () => {
    it('lets the Host delete a Member\'s Message: erased, answered as deleted by the Host, one chat.deleted to the whole room', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)
      const feedBefore = (await readFeed(rig, ev.host.cookie, ev.slug)).map(entry => entry.id)
      clock.set(T1)

      const response = await remove(ev.host.cookie, ev.slug, id)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id, writerId: ev.players.one.id, text: null, at: T0, deletedBy: 'host' })
      expect(await rowsOf(ev.eventId)).toEqual([{ id, eventId: ev.eventId, writerId: ev.players.one.id, text: null, writtenAt: new Date(T0), deletedAt: new Date(T1), deletedBy: 'host' }])
      expect(notifier.messages(ev.eventId)).toEqual([{ type: 'chat.deleted', id, deletedBy: 'host', v: 1, serverTime: new Date(T1).getTime() }])
      expect(notifier.sends(ev.eventId)).toHaveLength(1)
      expect(notifier.sends(ev.eventId)[0]!.to).toBeNull()
      expect((await readFeed(rig, ev.host.cookie, ev.slug)).map(entry => entry.id)).toEqual(feedBefore)
    })

    it('lets a Member delete their own Message: deletedBy writer', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)
      clock.set(T1)

      const response = await remove(ev.players.one.cookie, ev.slug, id)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id, writerId: ev.players.one.id, text: null, at: T0, deletedBy: 'writer' })
      expect(await rowOf(id)).toMatchObject({ text: null, deletedAt: new Date(T1), deletedBy: 'writer' })
      expect(notifier.messages(ev.eventId)).toEqual([{ type: 'chat.deleted', id, deletedBy: 'writer', v: 1, serverTime: new Date(T1).getTime() }])
      expect(notifier.sends(ev.eventId)[0]!.to).toBeNull()
    })

    it('records the Host deleting their own Message as deleted by the writer', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.host, 'Meine eigene')

      const response = await remove(ev.host.cookie, ev.slug, id)

      expect(await response.json()).toEqual({ id, writerId: ev.host.id, text: null, at: T0, deletedBy: 'writer' })
      expect((await rowOf(id)).deletedBy).toBe('writer')
      expect(deleted(ev.eventId)).toMatchObject([{ id, deletedBy: 'writer' }])
    })

    it('lets a Member on the Stands (no seat) delete their own Message, and refuses another\'s', async () => {
      const ev = await runningEvent()
      const own = await writeMessage(ev, ev.players.three, 'Von der Tribüne')
      const foreign = await writeMessage(ev, ev.players.one, 'Vom Spielfeld')

      expect((await remove(ev.players.three.cookie, ev.slug, own)).status).toBe(200)
      expect(await errorOf(await remove(ev.players.three.cookie, ev.slug, foreign))).toEqual({ status: 403, code: 'not_your_message' })
      expect((await rowOf(foreign)).text).toBe('Vom Spielfeld')
      expect(deleted(ev.eventId)).toHaveLength(1)
    })
  })

  describe('another Member\'s Message', () => {
    it('is refused with not_your_message: nothing changed, nothing sent', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)
      const before = await rowsOf(ev.eventId)

      expect(await errorOf(await remove(ev.players.two.cookie, ev.slug, id))).toEqual({ status: 403, code: 'not_your_message' })

      expect(await rowsOf(ev.eventId)).toEqual(before)
      expect(notifier.messages(ev.eventId)).toEqual([])
    })
  })

  describe('gone from everything a later read could show', () => {
    it('leaves no trace of the text in the row, the answer, the room message or the feed', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)

      const response = await remove(ev.host.cookie, ev.slug, id)

      const row = await rowOf(id)
      expect(Object.values(row).filter(value => typeof value === 'string' && value.includes('Zitronenbaum'))).toEqual([])
      expect(JSON.stringify(row)).not.toContain('Zitronenbaum')
      expect(JSON.stringify(await response.json())).not.toContain('Zitronenbaum')
      expect(JSON.stringify(notifier.messages(ev.eventId))).not.toContain('Zitronenbaum')
      expect(await readFeedText(rig, ev.host.cookie, ev.slug)).not.toContain('Zitronenbaum')
    })

    it('puts nothing but the type, the id and the deleter into chat.deleted', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)

      await remove(ev.host.cookie, ev.slug, id)

      expect(Object.keys(deleted(ev.eventId)[0]!).sort()).toEqual(['deletedBy', 'id', 'serverTime', 'type', 'v'])
    })
  })

  describe('what is answered 404', () => {
    it('answers an unknown id, a non-uuid id and another Event\'s Message alike, and a User who is no Member with 404 too: nothing changed, nothing sent', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)
      const elsewhereHost = await hostSignsIn(rig, otherHost)
      const elsewhere = await hostCreatesEvent(rig, elsewhereHost)
      notifier.clear()
      const before = await rowsOf(ev.eventId)

      const unknown = await remove(ev.host.cookie, ev.slug, newId())
      const malformed = await remove(ev.host.cookie, ev.slug, 'not-a-uuid')
      const foreign = await remove(elsewhereHost.cookie, elsewhere.slug, id)

      const reference = await unknown.clone().text()
      for (const response of [unknown, malformed, foreign]) {
        expect(await errorOf(response.clone())).toEqual({ status: 404, code: 'message_not_found' })
        expect(response.statusText).toBe(unknown.statusText)
        expect(await response.text()).toBe(reference)
      }
      expect((await remove(ev.outsiders.stranger.cookie, ev.slug, id)).status).toBe(404)
      expect(await rowsOf(ev.eventId)).toEqual(before)
      expect(await rowsOf(elsewhere.eventId)).toEqual([])
      expect(notifier.messages(ev.eventId)).toEqual([])
      expect(notifier.messages(elsewhere.eventId)).toEqual([])
    })
  })

  describe('a second delete', () => {
    it('answers the stored deleted Message, changes nothing and sends nothing more', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)
      clock.set(T1)
      const first = await remove(ev.players.one.cookie, ev.slug, id)
      const stored = await rowOf(id)
      clock.advance(60_000)

      const again = await remove(ev.players.one.cookie, ev.slug, id)

      expect(again.status).toBe(200)
      expect(await again.json()).toEqual(await first.json())
      expect(await rowOf(id)).toEqual(stored)
      expect(deleted(ev.eventId)).toHaveLength(1)
    })

    it('answers the Host the stored deleter, the writer, when the writer deleted first', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)
      await remove(ev.players.one.cookie, ev.slug, id)
      notifier.clear()

      const again = await remove(ev.host.cookie, ev.slug, id)

      expect(await again.json()).toEqual({ id, writerId: ev.players.one.id, text: null, at: T0, deletedBy: 'writer' })
      expect((await rowOf(id)).deletedBy).toBe('writer')
      expect(notifier.messages(ev.eventId)).toEqual([])
    })

    it('still refuses a Member who does not own the deleted Message', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)
      await remove(ev.host.cookie, ev.slug, id)
      notifier.clear()

      expect(await errorOf(await remove(ev.players.two.cookie, ev.slug, id))).toEqual({ status: 403, code: 'not_your_message' })
      expect(notifier.messages(ev.eventId)).toEqual([])
    })

    it('erases once and sends one chat.deleted when the Host and the writer delete together', async () => {
      const ev = await runningEvent()
      const id = await writeMessage(ev, ev.players.one)

      const [byHost, byWriter] = await Promise.all([remove(ev.host.cookie, ev.slug, id), remove(ev.players.one.cookie, ev.slug, id)])

      expect([byHost.status, byWriter.status]).toEqual([200, 200])
      expect(await byHost.json()).toEqual(await byWriter.json())
      expect(await rowsOf(ev.eventId)).toHaveLength(1)
      expect(deleted(ev.eventId)).toHaveLength(1)
    })
  })

  describe('who may not delete', () => {
    it('answers 401 without a cookie and 410 for a former Member of a Deleted Event, and sends nothing', async () => {
      // In the Date poll Phase, where an Event may be deleted.
      const ev = await setUpEvent(rig, { host, players, seats: [], slots: SLOTS, confirmed: 0, outsiders: { stranger } })
      const id = newId()
      expect((await write(ev.players.one.cookie, ev.slug, { id, text: 'Hi' })).status).toBe(200)

      expect((await remove(undefined, ev.slug, id)).status).toBe(401)
      expect((await send('DELETE', `/api/e/${ev.slug}`, ev.host.cookie)).status).toBe(200)
      notifier.clear()

      expect((await remove(ev.players.one.cookie, ev.slug, id)).status).toBe(410)
      expect((await remove(ev.outsiders.stranger.cookie, ev.slug, id)).status).toBe(404)
      expect(notifier.messages(ev.eventId)).toEqual([])
    })
  })

  it('changes nothing else: the Event read is as it was', async () => {
    const ev = await runningEvent()
    const id = await writeMessage(ev, ev.players.one)
    const before = await readEvent(rig, ev.host.cookie, ev.slug)

    expect((await remove(ev.host.cookie, ev.slug, id)).status).toBe(200)

    expect(await readEvent(rig, ev.host.cookie, ev.slug)).toMatchObject(before)
  })
})
