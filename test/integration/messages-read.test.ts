import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Message, MessagePage } from '../../shared/chat'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostEntersResult, hostFinishes, hostSets, readEvent, setUpEvent, startRunningEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// Reading the Chat (#759, spec #719 § A): GET /api/e/:slug/messages answers a page of an Event's Messages, newest first (written_at, then id, both
// descending), with the cursor `before` and the size `limit` of the Activity feed (one parser, one set of limits). A deleted Message is its line.
// The read writes nothing, sends nothing and asks no clock.

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
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** A lower-case uuid of the shape the page makes, numbered so that a larger number is a later id. */
const uuidOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('reading the Chat a page at a time', () => {
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

  const read = (cookie: string | undefined, slug: string, query = '') => send('GET', `/api/e/${slug}/messages${query}`, cookie)

  async function page(cookie: string, slug: string, query = ''): Promise<MessagePage> {
    const response = await read(cookie, slug, query)
    expect(response.status, query).toBe(200)
    return await response.json() as MessagePage
  }

  /** Stores Messages straight in the table, as the write would have: a row per entry, `at` the instant it was written. */
  async function store(eventId: string, rows: readonly { id: string, writerId: string, at: string, text?: string, deletedBy?: 'host' | 'writer' }[]) {
    await testDb.db.insert(messages).values(rows.map(row => row.deletedBy
      ? { id: row.id, eventId, writerId: row.writerId, text: null, writtenAt: new Date(row.at), deletedAt: new Date(row.at), deletedBy: row.deletedBy }
      : { id: row.id, eventId, writerId: row.writerId, text: row.text ?? 'Hallo', writtenAt: new Date(row.at) }))
  }

  /** A running Event: the Host, Players one and two seated in teams 1 and 2, Player three a Member on the Stands, and a signed-in stranger. */
  async function runningEvent() {
    return await startRunningEvent(rig, { host, players, seats: [['one', 1], ['two', 2]], slots: SLOTS, outsiders: { stranger } })
  }

  describe('who may read', () => {
    it('answers 401 signed out, 404 for a User who is no Member, and 200 for the Host and every Member', async () => {
      const ev = await runningEvent()

      expect((await read(undefined, ev.slug)).status).toBe(401)
      expect((await read(ev.outsiders.stranger.cookie, ev.slug)).status).toBe(404)
      for (const cookie of [ev.host.cookie, ev.players.one.cookie, ev.players.three.cookie]) {
        expect((await read(cookie, ev.slug)).status).toBe(200)
      }
    })

    it('answers 410 Event deleted for a former Member of a Deleted Event, and 404 for a stranger', async () => {
      // In the Date poll Phase, where an Event may be deleted (as messages.test.ts does).
      const ev = await setUpEvent(rig, { host, players, seats: [], slots: SLOTS, confirmed: 0, outsiders: { stranger } })
      expect((await send('DELETE', `/api/e/${ev.slug}`, ev.host.cookie)).status).toBe(200)

      expect(await errorOf(await read(ev.players.one.cookie, ev.slug))).toEqual({ status: 410, code: 'Event deleted' })
      expect(await errorOf(await read(ev.host.cookie, ev.slug))).toEqual({ status: 410, code: 'Event deleted' })
      expect((await read(ev.outsiders.stranger.cookie, ev.slug)).status).toBe(404)
    })
  })

  describe('what a page holds', () => {
    it('answers the Messages newest first, and pages with before and next', async () => {
      const ev = await runningEvent()
      await store(ev.eventId, [
        { id: uuidOf(1), writerId: ev.host.id, at: '2090-10-30T10:00:01.000Z', text: 'Eins' },
        { id: uuidOf(2), writerId: ev.players.one.id, at: '2090-10-30T10:00:02.000Z', text: 'Zwei' },
        { id: uuidOf(3), writerId: ev.players.two.id, at: '2090-10-30T10:00:03.000Z', text: 'Drei' },
      ])

      const all = await page(ev.host.cookie, ev.slug)
      expect(all.messages.map(message => message.id)).toEqual([uuidOf(3), uuidOf(2), uuidOf(1)])
      expect(all.messages[0]).toEqual({ id: uuidOf(3), writerId: ev.players.two.id, text: 'Drei', at: '2090-10-30T10:00:03.000Z' })
      expect(all.next).toBeNull()

      const first = await page(ev.host.cookie, ev.slug, '?limit=2')
      expect(first.messages.map(message => message.id)).toEqual([uuidOf(3), uuidOf(2)])
      expect(first.next).toBe(uuidOf(2))

      const last = await page(ev.host.cookie, ev.slug, `?limit=2&before=${first.next}`)
      expect(last.messages.map(message => message.id)).toEqual([uuidOf(1)])
      expect(last.next).toBeNull()
    })

    it('orders Messages written at one instant by id, descending, and pages through them once each', async () => {
      const ev = await runningEvent()
      const at = '2090-10-30T10:00:05.000Z'
      await store(ev.eventId, [
        { id: uuidOf(0xa1), writerId: ev.host.id, at },
        { id: uuidOf(0xa2), writerId: ev.players.one.id, at },
        { id: uuidOf(0xa3), writerId: ev.players.two.id, at },
      ])

      const all = await page(ev.host.cookie, ev.slug)
      expect(all.messages.map(message => message.id)).toEqual([uuidOf(0xa3), uuidOf(0xa2), uuidOf(0xa1)])

      const seen: string[] = []
      let cursor = ''
      for (let guard = 0; guard < 5; guard++) {
        const step = await page(ev.host.cookie, ev.slug, `?limit=1${cursor}`)
        seen.push(...step.messages.map(message => message.id))
        if (step.next === null) break
        cursor = `&before=${step.next}`
      }
      expect(seen).toEqual([uuidOf(0xa3), uuidOf(0xa2), uuidOf(0xa1)])
    })

    it('holds a Message another Member wrote, with that Member as its writer and its text', async () => {
      const ev = await runningEvent()
      const id = uuidOf(42)
      expect((await send('POST', `/api/e/${ev.slug}/messages`, ev.players.one.cookie, { id, text: 'Moin aus Team eins' })).status).toBe(200)

      const seen = await page(ev.host.cookie, ev.slug)

      expect(seen.messages).toEqual([{ id, writerId: ev.players.one.id, text: 'Moin aus Team eins', at: T0 }])
    })

    it('holds a deleted Message as its line, with no text, at its place in the order', async () => {
      const ev = await runningEvent()
      await store(ev.eventId, [
        { id: uuidOf(1), writerId: ev.host.id, at: '2090-10-30T10:00:01.000Z', text: 'Vorher' },
        { id: uuidOf(2), writerId: ev.players.one.id, at: '2090-10-30T10:00:02.000Z', deletedBy: 'writer' },
        { id: uuidOf(3), writerId: ev.players.two.id, at: '2090-10-30T10:00:03.000Z', text: 'Nachher' },
      ])

      const seen = await page(ev.players.three.cookie, ev.slug)

      expect(seen.messages).toEqual([
        { id: uuidOf(3), writerId: ev.players.two.id, text: 'Nachher', at: '2090-10-30T10:00:03.000Z' },
        { id: uuidOf(2), writerId: ev.players.one.id, text: null, at: '2090-10-30T10:00:02.000Z', deletedBy: 'writer' },
        { id: uuidOf(1), writerId: ev.host.id, text: 'Vorher', at: '2090-10-30T10:00:01.000Z' },
      ])
    })

    it('holds a Message the Host deleted with the Host as the one who deleted it', async () => {
      const ev = await runningEvent()
      await store(ev.eventId, [{ id: uuidOf(1), writerId: ev.players.one.id, at: '2090-10-30T10:00:01.000Z', deletedBy: 'host' }])

      const seen = await page(ev.host.cookie, ev.slug)

      expect(seen.messages).toEqual([{ id: uuidOf(1), writerId: ev.players.one.id, text: null, at: '2090-10-30T10:00:01.000Z', deletedBy: 'host' }])
    })

    it('answers the default page of 50 with next set, and the rest with next null', async () => {
      const ev = await runningEvent()
      await store(ev.eventId, Array.from({ length: 51 }, (_, index) => ({
        id: uuidOf(index + 1),
        writerId: ev.host.id,
        at: new Date(Date.parse(T0) + index * 1000).toISOString(),
      })))

      const first = await page(ev.host.cookie, ev.slug)
      expect(first.messages).toHaveLength(50)
      expect(first.messages[0]!.id).toBe(uuidOf(51))
      expect(first.next).toBe(uuidOf(2))

      const rest = await page(ev.host.cookie, ev.slug, `?before=${first.next}`)
      expect(rest.messages.map(message => message.id)).toEqual([uuidOf(1)])
      expect(rest.next).toBeNull()
    })

    it('answers the Messages of a finished Event as it did while it ran', async () => {
      const ev = await startRunningEvent(rig, {
        host,
        players,
        seats: [['one', 1], ['two', 2]],
        slots: SLOTS,
        settings: { gameCount: 1, pointsTable: { preset: 'linear' as const, values: [1, 0] }, selectionMode: 'lucky_wheel' as const, vetoAllowance: 1 },
        games: [{ key: 'halo', values: { name: 'Halo' }, pool: true }],
      })
      await store(ev.eventId, [{ id: uuidOf(1), writerId: ev.players.one.id, at: '2090-10-30T10:00:01.000Z', text: 'Vor dem Ende' }])
      const before = await page(ev.host.cookie, ev.slug)
      const round = await hostSets(rig, ev, ev.games.halo.id)
      await hostEntersResult(rig, ev, round, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      await hostFinishes(rig, ev, { outcome: 'winner', winners: [1] })

      const after = await read(ev.players.one.cookie, ev.slug)

      expect(after.status).toBe(200)
      expect(await after.json()).toEqual(before)
    })
  })

  describe('the cursor and the size', () => {
    it('refuses a cursor that is no Message of this Event with 400 invalid_cursor', async () => {
      const ev = await runningEvent()
      await store(ev.eventId, [{ id: uuidOf(1), writerId: ev.host.id, at: T0 }])
      const other = await setUpEvent(rig, { host: otherHost, players: {}, seats: [], slots: SLOTS, confirmed: 0 })
      await store(other.eventId, [{ id: uuidOf(2), writerId: other.host.id, at: T0 }])

      for (const before of ['nope', UNKNOWN, uuidOf(2)]) {
        expect(await errorOf(await read(ev.host.cookie, ev.slug, `?before=${before}`)), before).toEqual({ status: 400, code: 'invalid_cursor' })
      }
    })

    it('refuses a limit it cannot use with 400 invalid_value, and takes 100', async () => {
      const ev = await runningEvent()

      for (const limit of ['', '0', 'abc', '101', '1.5', '-1']) {
        expect(await errorOf(await read(ev.host.cookie, ev.slug, `?limit=${limit}`)), limit).toEqual({ status: 400, code: 'invalid_value' })
      }
      expect((await read(ev.host.cookie, ev.slug, '?limit=100')).status).toBe(200)
    })
  })

  describe('what the read carries and changes', () => {
    it('carries no name of a Member, only id, writer, text and instant of a live Message', async () => {
      const ev = await runningEvent()
      expect((await send('POST', `/api/e/${ev.slug}/messages`, ev.players.one.cookie, { id: uuidOf(7), text: 'Hallo' })).status).toBe(200)

      const response = await read(ev.host.cookie, ev.slug)
      const body = await response.text()
      const seen = JSON.parse(body) as MessagePage

      for (const name of ['Hostess', 'Eins', 'Zwei', 'Drei', 'Freitags-Zocken']) expect(body, name).not.toContain(name)
      expect(Object.keys(seen.messages[0]!).sort()).toEqual(['at', 'id', 'text', 'writerId'])
      expect(seen.messages[0]).toEqual({ id: uuidOf(7), writerId: ev.players.one.id, text: 'Hallo', at: T0 } satisfies Message)
    })

    it('writes nothing and sends nothing', async () => {
      const ev = await runningEvent()
      await store(ev.eventId, [{ id: uuidOf(1), writerId: ev.host.id, at: T0 }])
      notifier.clear()
      const stateBefore = await readEvent(rig, ev.host.cookie, ev.slug)

      await page(ev.host.cookie, ev.slug)
      await page(ev.players.one.cookie, ev.slug, '?limit=1')

      expect(await readEvent(rig, ev.host.cookie, ev.slug)).toEqual(stateBefore)
      expect(notifier.messages(ev.eventId)).toEqual([])
      expect(notifier.sends(ev.eventId)).toEqual([])
      expect(await testDb.db.select().from(messages)).toHaveLength(1)
    })
  })
})
