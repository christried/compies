import { asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameTags, games } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { GameView } from '../../shared/game'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// „Preis stimmt noch“ sends only the flag (#360). The whole-game path that old tabs still send stays in library.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Admin', email: 'admin@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '3', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const

describe('„Preis stimmt noch“ sends only the flag (#360)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  const clock = testClock('2026-11-03T10:00:00.000Z')
  const T1 = '2026-11-03T10:00:00.000Z'
  const T2 = '2026-11-05T09:00:00.000Z'
  const steam = { cents: 1999, source: 'steam' }

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
    clock.set(T1)
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function cookieOf(profile: Parameters<typeof signIn>[1]) {
    return (await signIn(testDb.db, profile)).cookie
  }

  function read(id: string, cookie?: string) {
    return request(`/api/games/${id}`, { headers: cookie ? { cookie } : {} })
  }

  function create(cookie: string | undefined, body: unknown) {
    return request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  async function created(cookie: string, body: unknown) {
    const response = await create(cookie, body)
    expect(response.status).toBe(200)
    return await response.json() as GameView
  }

  function edit(cookie: string | undefined, id: string, body: unknown) {
    return request(`/api/games/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  /** The three Price columns of the stored row, the day as its ISO string (or null). */
  async function storedPrice(id: string) {
    const [row] = await testDb.db.select().from(games).where(eq(games.id, id))
    return { cents: row!.priceCents, source: row!.priceSource, checkedAt: row!.priceCheckedAt?.toISOString() ?? null }
  }

  /** The game's Tags as stored, in position order: what a Price edit must leave as it was. */
  async function tagRowsOf(gameId: string) {
    const rows = await testDb.db.select().from(gameTags).where(eq(gameTags.gameId, gameId)).orderBy(asc(gameTags.position))
    return rows.map(({ key, label, position }) => ({ key, label, position }))
  }

  it('moves only the day when the flag comes alone', async () => {
    const cookie = await cookieOf(host)
    const { id } = await created(cookie, {
      name: 'Mario Kart',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      clipStart: 72,
      clipLength: 45,
      playersMin: 2,
      playersMax: 8,
      suitabilities: ['teams'],
      notes: 'Die Fernbedienung nicht vergessen',
      tags: ['Co-op'],
      price: steam,
    })
    const [before] = await testDb.db.select().from(games).where(eq(games.id, id))
    const tagsBefore = await tagRowsOf(id)

    clock.set(T2)
    const response = await edit(cookie, id, { priceChecked: true })

    expect(response.status).toBe(200)
    const answer = await response.json() as GameView
    expect(answer).toMatchObject({ price: { cents: 1999, source: 'steam', checkedAt: T2 }, tags: [{ key: 'co-op', label: 'Co-op' }] })
    expect(await (await read(id, cookie)).json()).toEqual(answer)
    const [after] = await testDb.db.select().from(games).where(eq(games.id, id))
    // updated_at is bumped by every UPDATE (db/schema.ts $onUpdate), so it is the one column that may move with the write.
    expect({ ...after, updatedAt: before!.updatedAt }).toEqual({ ...before, priceCheckedAt: new Date(T2) })
    expect(await tagRowsOf(id)).toEqual(tagsBefore)
  })

  it('a stale tab cannot overwrite the edit another Host made since it loaded', async () => {
    const cookie = await cookieOf(host)
    const { id } = await created(cookie, {
      name: 'Mario Kart',
      clipLength: 45,
      notes: 'alt',
      tags: ['Co-op'],
      price: steam,
    })
    // The creator's edit lands first, with the same Price: the day stays T1.
    const renamed = await edit(cookie, id, {
      name: 'Mario Kart 8',
      clipLength: 60,
      notes: 'neu',
      tags: ['Retro'],
      price: steam,
    })
    expect(renamed.status).toBe(200)

    clock.set(T2)
    const response = await edit(cookie, id, { priceChecked: true })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      name: 'Mario Kart 8',
      notes: 'neu',
      clipLength: 60,
      price: { cents: 1999, source: 'steam', checkedAt: T2 },
      tags: [{ key: 'retro', label: 'Retro' }],
    })
    const [row] = await testDb.db.select().from(games).where(eq(games.id, id))
    expect(row).toMatchObject({ name: 'Mario Kart 8', notes: 'neu', clipLength: 60, priceCheckedAt: new Date(T2) })
    expect(await tagRowsOf(id)).toEqual([{ key: 'retro', label: 'Retro', position: 0 }])
  })

  it('refuses the flag alone on a game without a Price, and writes nothing', async () => {
    const cookie = await cookieOf(host)
    const { id } = await created(cookie, { name: 'Mario Kart' })

    const response = await edit(cookie, id, { priceChecked: true })

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('invalid_price')
    expect(await storedPrice(id)).toEqual({ cents: null, source: null, checkedAt: null })
    const [row] = await testDb.db.select().from(games).where(eq(games.id, id))
    expect(row!.name).toBe('Mario Kart')
  })

  it('refuses the flag alone after the Price was cleared, not with a 500', async () => {
    const cookie = await cookieOf(host)
    const { id } = await created(cookie, { name: 'Mario Kart', price: steam })
    const cleared = await edit(cookie, id, { name: 'Mario Kart', price: null })
    expect(cleared.status).toBe(200)

    clock.set(T2)
    const response = await edit(cookie, id, { priceChecked: true })

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('invalid_price')
    expect(await storedPrice(id)).toEqual({ cents: null, source: null, checkedAt: null })
  })

  it('restamps a Free-to-play Price, which has no amount', async () => {
    const cookie = await cookieOf(host)
    const { id } = await created(cookie, { name: 'Mario Kart', price: { cents: null, source: 'free_to_play' } })

    clock.set(T2)
    const response = await edit(cookie, id, { priceChecked: true })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ price: { cents: null, source: 'free_to_play', checkedAt: T2 } })
    expect(await storedPrice(id)).toEqual({ cents: null, source: 'free_to_play', checkedAt: new Date(T2).toISOString() })
  })

  it('applies the edit rules before the body: another Host, a Member, a stranger and an unknown id get no restamp', async () => {
    const { id } = await created(await cookieOf(host), { name: 'Mario Kart', price: steam })

    const refusals = [
      { cookie: await cookieOf(otherHost), status: 403, statusText: 'not_game_editor' },
      { cookie: await cookieOf(member), status: 404, statusText: 'Not Found' },
      { cookie: undefined, status: 404, statusText: 'Not Found' },
    ]
    for (const refusal of refusals) {
      clock.set(T2)
      const response = await edit(refusal.cookie, id, { priceChecked: true })
      expect(response.status).toBe(refusal.status)
      expect(response.statusText).toBe(refusal.statusText)
      expect(await storedPrice(id)).toMatchObject({ checkedAt: T1 })
    }
    for (const missing of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const response = await edit(await cookieOf(host), missing, { priceChecked: true })
      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
    }
    expect(await storedPrice(id)).toMatchObject({ checkedAt: T1 })
  })

  it('lets the Platform admin restamp a game', async () => {
    const { id } = await created(await cookieOf(host), { name: 'Mario Kart', price: steam })

    clock.set(T2)
    const response = await edit(await cookieOf(admin), id, { priceChecked: true })

    expect(response.status).toBe(200)
    expect(await storedPrice(id)).toMatchObject({ checkedAt: new Date(T2).toISOString() })
  })

  it.each([
    [{ priceChecked: true, name: '' }],
    [{ priceChecked: false }],
    [{ priceChecked: 'yes' }],
  ])('is not a restamp when anything else comes with it: %j', async (body) => {
    const cookie = await cookieOf(host)
    const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

    clock.set(T2)
    const response = await edit(cookie, id, body)

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('invalid_game_name')
    expect(await storedPrice(id)).toMatchObject({ checkedAt: T1 })
  })
})
