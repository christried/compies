import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameList, GameView } from '../../shared/game'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Admin', email: 'admin@example.com', image: undefined } as const

describe('the Game library Tags (#365)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db)
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function cookieOf(profile: Parameters<typeof signIn>[1]) {
    return (await signIn(testDb.db, profile)).cookie
  }

  function list(cookie?: string) {
    return request('/api/games', { headers: cookie ? { cookie } : {} })
  }

  function read(id: string, cookie?: string) {
    return request(`/api/games/${id}`, { headers: cookie ? { cookie } : {} })
  }

  function tags(cookie?: string) {
    return request('/api/games/tags', { headers: cookie ? { cookie } : {} })
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

  describe('GET /api/games/tags (#365)', () => {
    function edit(cookie: string | undefined, id: string, body: unknown) {
      return request(`/api/games/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })
    }

    it('answers an empty list without games, and without Tags on a game', async () => {
      const cookie = await cookieOf(host)
      expect(await (await tags(cookie)).json()).toEqual([])

      await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Mario Kart' })

      const response = await tags(cookie)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual([])
    })

    it('answers one Tag as one entry, with no game id, count or creator', async () => {
      const cookie = await cookieOf(host)
      await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Mario Kart', tags: ['Co-op'] })

      expect(await (await tags(cookie)).json()).toEqual([{ key: 'co-op', label: 'Co-op' }])
    })

    it('answers the Tags in use once per key, by key, under the first label, as the list does', async () => {
      const cookie = await cookieOf(host)
      await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Eins', tags: ['Retro', 'Co-op'] })
      await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Zwei', tags: ['Ärger', 'retro'] })

      const answer = await (await tags(cookie)).json()

      expect(answer).toEqual([
        { key: 'ärger', label: 'Ärger' },
        { key: 'co-op', label: 'Co-op' },
        { key: 'retro', label: 'Retro' },
      ])
      expect(answer).toEqual(((await (await list(cookie)).json()) as GameList).tagsInUse)
    })

    it('drops a Tag when its last game loses it, and keeps one another game carries', async () => {
      const cookie = await cookieOf(host)
      const first = await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Eins', tags: ['Co-op', 'Retro'] })
      await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Zwei', tags: ['Retro'] })

      await edit(cookie, first.id, { name: 'Eins', tags: [] })

      expect(await (await tags(cookie)).json()).toEqual([{ key: 'retro', label: 'Retro' }])
    })

    it('answers signed-out visitors and a Member as for a missing route, and the Host and the Platform admin with the list', async () => {
      await created(await cookieOf(host), { price: { cents: 1999, source: 'steam' }, name: 'Mario Kart', tags: ['Co-op'] })

      for (const cookie of [undefined, await cookieOf(member)]) {
        const response = await tags(cookie)
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
      }
      for (const profile of [host, admin]) {
        const response = await tags(await cookieOf(profile))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual([{ key: 'co-op', label: 'Co-op' }])
      }
    })
  })

  it('answers every game of a batch with its own Tags, a Tag-less game among them, on the list and the detail', async () => {
    const cookie = await cookieOf(host)
    const charlie = await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Charlie', tags: ['Retro'] })
    const alpha = await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Alpha', tags: ['Co-op', 'Party'] })
    const bravo = await created(cookie, { price: { cents: 1999, source: 'steam' }, name: 'Bravo' })

    const listed = ((await (await list(cookie)).json()) as GameList).games
    const byName = (name: string) => listed.find(game => game.name === name)!.tags

    expect(listed.map(game => game.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(byName('Alpha')).toEqual([{ key: 'co-op', label: 'Co-op' }, { key: 'party', label: 'Party' }])
    expect(byName('Bravo')).toEqual([])
    expect(byName('Charlie')).toEqual([{ key: 'retro', label: 'Retro' }])
    for (const game of [alpha, bravo, charlie]) {
      expect(((await (await read(game.id, cookie)).json()) as GameView).tags).toEqual(byName(game.name))
    }
  })
})
