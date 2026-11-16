import { asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, events, games } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryImageStore } from '../../server/utils/image-store'
import type { GameList, GameTag, GameView } from '../../shared/game'
import { createTestApp, errorOf, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { setUpEvent } from './scenario'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Archiving a game (#467, spec #717 § B): the owner's switch, one route, `GameView.archived`. The Event side (pools, wheel, room) is #725 and #726,
// so nothing here reads an Event's pool or the room. Every name and id is invented.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '3', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Admin', email: 'admin@example.com', image: undefined } as const

/** A paid Price: a game without one carries the Tag „Free-to-play“ (#423), which these tests keep out of the way (see library-ownership.test.ts). */
const PAID = { cents: 999, source: 'steam' }
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'
const T0 = '2090-10-30T10:00:00.000Z'
const T1 = '2090-10-30T11:30:00.000Z'

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
/** The smallest thing the server accepts as a WebP: it only checks the marks (RIFF, size, WEBP). */
function webp(length = 40): Uint8Array {
  const bytes = new Uint8Array(length)
  bytes.set([...ascii('RIFF'), length - 8, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii('first')])
  return bytes
}

/** The parts of a response a client can tell apart, body text included. */
async function answer(response: Response) {
  return { status: response.status, statusText: response.statusText, body: await response.text() }
}

describe('archiving a game (#467)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  const store = memoryImageStore()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { imageStore: store, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
    clock.set(T0)
    await resetDatabase(testDb.db)
    store.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function cookieOf(profile: Parameters<typeof signIn>[1]) {
    return (await signIn(testDb.db, profile)).cookie
  }

  const json = (cookie: string | undefined) => ({ 'content-type': 'application/json', ...(cookie ? { cookie } : {}) })

  async function created(cookie: string, body: unknown) {
    const response = await request('/api/games', { method: 'POST', headers: json(cookie), body: JSON.stringify(body) })
    expect(response.status).toBe(200)
    return await response.json() as GameView
  }

  const get = (path: string, cookie?: string) => request(path, { headers: cookie ? { cookie } : {} })
  const put = (id: string, cookie: string | undefined, body: unknown) =>
    request(`/api/games/${id}/archived`, { method: 'PUT', headers: json(cookie), body: JSON.stringify(body) })
  const archive = (id: string, cookie: string) => put(id, cookie, { archived: true })
  const restore = (id: string, cookie: string) => put(id, cookie, { archived: false })
  const patch = (id: string, cookie: string, body: unknown) =>
    request(`/api/games/${id}`, { method: 'PATCH', headers: json(cookie), body: JSON.stringify(body) })

  async function listOf(cookie: string) {
    const response = await get('/api/games', cookie)
    expect(response.status).toBe(200)
    return await response.json() as GameList
  }

  async function rowOf(id: string) {
    const [row] = await testDb.db.select().from(games).where(eq(games.id, id))
    return row!
  }

  describe('the owner', () => {
    it('archives and restores, and the answer, the read and the list carry the flag', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart', price: PAID })
      expect(game.archived).toBe(false)

      const archived = await archive(game.id, cookie)
      expect(archived.status).toBe(200)
      expect(await archived.json()).toMatchObject({ id: game.id, name: 'Mario Kart', archived: true })
      expect(((await (await get(`/api/games/${game.id}`, cookie)).json()) as GameView).archived).toBe(true)
      expect((await listOf(cookie)).games.map(row => row.archived)).toEqual([true])
      expect((await rowOf(game.id)).archivedAt?.toISOString()).toBe(T0)

      clock.set(T1)
      const restored = await restore(game.id, cookie)
      expect(restored.status).toBe(200)
      expect(await restored.json()).toMatchObject({ id: game.id, archived: false })
      expect(((await (await get(`/api/games/${game.id}`, cookie)).json()) as GameView).archived).toBe(false)
      expect((await listOf(cookie)).games.map(row => row.archived)).toEqual([false])
      expect((await rowOf(game.id)).archivedAt).toBeNull()
    })

    it('answers the whole game with its Tags, and sends no timestamp of the archive', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart', tags: ['Co-op'], price: PAID })
      const body = await (await archive(game.id, cookie)).json() as GameView
      expect(body.tags).toEqual([{ key: 'co-op', label: 'Co-op' }])
      expect(Object.keys(body)).not.toContain('archivedAt')
    })

    it('is idempotent: a second archive keeps the first instant, a second restore stays null, no error', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart' })

      expect((await archive(game.id, cookie)).status).toBe(200)
      clock.set(T1)
      const again = await archive(game.id, cookie)
      expect(again.status).toBe(200)
      expect(((await again.json()) as GameView).archived).toBe(true)
      expect((await rowOf(game.id)).archivedAt?.toISOString()).toBe(T0)

      expect((await restore(game.id, cookie)).status).toBe(200)
      expect((await restore(game.id, cookie)).status).toBe(200)
      expect((await rowOf(game.id)).archivedAt).toBeNull()
    })

    it('answers a broken body with invalid_value and writes nothing', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart' })
      const before = await rowOf(game.id)

      for (const body of [{}, { archived: 'yes' }, { archived: 1 }, { archived: null }, []]) {
        expect(await errorOf(await put(game.id, cookie, body)), JSON.stringify(body)).toEqual({ status: 400, code: 'invalid_value' })
      }
      expect(await rowOf(game.id)).toEqual(before)
    })
  })

  describe('everyone else gets the answer of a missing route', () => {
    const askers = [
      ['another Host', otherHost],
      ['the Platform admin', admin],
      ['a Member', member],
      ['nobody signed in', null],
    ] as const

    it.each(askers)('answers %s as it answers a non-uuid and an unknown id, with a valid and a broken body, and writes nothing', async (_name, asker) => {
      const owner = await cookieOf(host)
      const game = await created(owner, { name: 'Mario Kart' })
      const before = await rowOf(game.id)
      const cookie = asker ? await cookieOf(asker) : undefined

      for (const body of [{ archived: true }, { archived: 'yes' }]) {
        const foreign = await answer(await put(game.id, cookie, body))
        expect(foreign.status).toBe(404)
        expect(foreign.body).not.toContain('Mario Kart')
        expect(await answer(await put(UNKNOWN_ID, cookie, body))).toEqual(foreign)
        expect(await answer(await put('not-a-uuid', cookie, body))).toEqual(foreign)
      }
      expect(await rowOf(game.id)).toEqual(before)
    })

    it('answers the owner of an unknown id and a non-uuid as a missing route too', async () => {
      const owner = await cookieOf(host)
      expect((await put(UNKNOWN_ID, owner, { archived: true })).status).toBe(404)
      expect((await put('not-a-uuid', owner, { archived: true })).status).toBe(404)
    })
  })

  describe('an Archived game stays editable', () => {
    it('takes an edit of the whole game and of the Price day, and stays archived with the same instant', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart', price: PAID })
      await archive(game.id, cookie)
      clock.set(T1)

      const renamed = await patch(game.id, cookie, { name: 'Mario Kart 8', price: PAID })
      expect(renamed.status).toBe(200)
      expect(await renamed.json()).toMatchObject({ name: 'Mario Kart 8', archived: true })

      const checked = await patch(game.id, cookie, { priceChecked: true })
      expect(checked.status).toBe(200)
      expect(((await checked.json()) as GameView).archived).toBe(true)
      expect((await rowOf(game.id)).archivedAt?.toISOString()).toBe(T0)
    })

    it('takes an image', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart' })
      await archive(game.id, cookie)

      const response = await request(`/api/games/${game.id}/image`, { method: 'PUT', headers: { 'content-type': 'image/webp', cookie }, body: webp() as BodyInit })
      expect(response.status).toBe(200)
      expect(((await response.json()) as GameView).archived).toBe(true)
    })

    it('is not archived by a create or an edit that carries `archived`', async () => {
      const cookie = await cookieOf(host)
      const made = await created(cookie, { name: 'Mario Kart', archived: true })
      expect(made.archived).toBe(false)
      expect((await rowOf(made.id)).archivedAt).toBeNull()

      const edited = await patch(made.id, cookie, { name: 'Mario Kart 8', archived: true })
      expect(edited.status).toBe(200)
      expect(((await edited.json()) as GameView).archived).toBe(false)
      expect((await rowOf(made.id)).archivedAt).toBeNull()

      await archive(made.id, cookie)
      const unarchived = await patch(made.id, cookie, { name: 'Mario Kart 9', archived: false })
      expect(((await unarchived.json()) as GameView).archived).toBe(true)
    })
  })

  describe('no Event notices it', () => {
    it('writes no Activity entry and changes no Event, for a game in a Host\'s pool', async () => {
      const rig = { request, db: testDb.db, clock }
      const event = await setUpEvent(rig, {
        host,
        players: {},
        seats: [],
        sessions: 1,
        confirmed: 1,
        games: [{ key: 'Kart', values: { name: 'Kart' }, pool: true }],
      })
      setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
      const cookie = await cookieOf(host)
      const eventBefore = (await testDb.db.select().from(events).where(eq(events.id, event.eventId)))[0]!
      const activityBefore = await testDb.db.select().from(activity).orderBy(asc(activity.id))

      clock.set(T1)
      expect((await archive(event.games.Kart.id, cookie)).status).toBe(200)
      expect((await restore(event.games.Kart.id, cookie)).status).toBe(200)

      expect(await testDb.db.select().from(activity).orderBy(asc(activity.id))).toEqual(activityBefore)
      expect((await testDb.db.select().from(events).where(eq(events.id, event.eventId)))[0]).toEqual(eventBefore)
    })
  })

  describe('the library keeps all of the owner\'s games', () => {
    it('lists every own game in order, the Archived ones flagged, at 0, 1 and 2 archived of 2', async () => {
      const cookie = await cookieOf(host)
      const beta = await created(cookie, { name: 'Beta', price: PAID })
      const alpha = await created(cookie, { name: 'alpha', price: PAID })
      const flags = async () => (await listOf(cookie)).games.map(row => [row.name, row.archived])

      expect(await flags()).toEqual([['alpha', false], ['Beta', false]])
      await archive(beta.id, cookie)
      expect(await flags()).toEqual([['alpha', false], ['Beta', true]])
      await archive(alpha.id, cookie)
      expect(await flags()).toEqual([['alpha', true], ['Beta', true]])
    })

    it('counts the Tags of Archived games among the Tags in use', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart', tags: ['Racing'], price: PAID })
      await created(cookie, { name: 'Uno', tags: ['Karten'], price: PAID })
      await archive(game.id, cookie)

      const expected: GameTag[] = [{ key: 'karten', label: 'Karten' }, { key: 'racing', label: 'Racing' }]
      expect(((await (await get('/api/games/tags', cookie)).json()) as GameTag[]).slice().sort((a, b) => a.key.localeCompare(b.key))).toEqual(expected)
      expect((await listOf(cookie)).tagsInUse.slice().sort((a, b) => a.key.localeCompare(b.key))).toEqual(expected)
    })
  })
})
