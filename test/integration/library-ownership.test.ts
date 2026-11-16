import { asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameTags, games, users } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import { GAME_NAME_MAX, type GameList, type GameTag, type GameView } from '../../shared/game'
import { notesFromLines } from '../../shared/notes-doc'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '3', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Admin', email: 'admin@example.com', image: undefined } as const

/** A paid Price: a game without one carries the Tag „Free-to-play“ (#423), which these tests keep out of the way. */
const PAID = { cents: 999, source: 'steam' }
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
/** The smallest thing the server accepts as a WebP: it only checks the marks (RIFF, size, WEBP). */
function webp(payload = 'first', length = 40): Uint8Array {
  const bytes = new Uint8Array(length)
  bytes.set([...ascii('RIFF'), length - 8, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii(payload)])
  return bytes
}

/** The parts of a response a client can tell apart, body text included. */
async function answer(response: Response) {
  return { status: response.status, statusText: response.statusText, body: await response.text() }
}

describe('one library per User (#455, ADR 0018)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  const store = memoryImageStore()

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { imageStore: store })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
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
  const patch = (id: string, cookie: string | undefined, body: unknown) =>
    request(`/api/games/${id}`, { method: 'PATCH', headers: json(cookie), body: JSON.stringify(body) })
  const upload = (id: string, cookie: string | undefined) =>
    request(`/api/games/${id}/image`, { method: 'PUT', headers: { 'content-type': 'image/webp', ...(cookie ? { cookie } : {}) }, body: webp() as BodyInit })

  async function listOf(cookie: string) {
    const response = await get('/api/games', cookie)
    expect(response.status).toBe(200)
    return await response.json() as GameList
  }

  async function tagRows() {
    const rows = await testDb.db.select().from(gameTags).orderBy(asc(gameTags.gameId), asc(gameTags.position))
    return rows.map(({ gameId, key, label }) => ({ gameId, key, label }))
  }

  async function rowOf(id: string) {
    const [row] = await testDb.db.select().from(games).where(eq(games.id, id))
    return row
  }

  describe('another User\'s game is a missing one', () => {
    const askers = [
      ['another Host', otherHost],
      ['the Platform admin', admin],
      ['a Member', member],
      ['nobody signed in', null],
    ] as const

    it.each(askers)('answers %s as it answers an unknown id, for read, edit and image upload, and writes nothing', async (_name, asker) => {
      const owner = await cookieOf(host)
      const game = await created(owner, { name: 'Mario Kart', notes: notesFromLines(['geheim']), tags: ['Co-op'] })
      const before = await rowOf(game.id)
      const tagsBefore = await tagRows()
      const cookie = asker ? await cookieOf(asker) : undefined

      const attempts: [string, (id: string) => Promise<Response>][] = [
        ['read', id => get(`/api/games/${id}`, cookie)],
        ['edit with the whole game', id => patch(id, cookie, { name: 'Gekapert', notes: notesFromLines(['neu']), tags: ['Racing'] })],
        ['edit with the Price flag', id => patch(id, cookie, { priceChecked: true })],
        ['image upload', id => upload(id, cookie)],
      ]
      for (const [what, attempt] of attempts) {
        const foreign = await answer(await attempt(game.id))
        const unknown = await answer(await attempt(UNKNOWN_ID))
        expect(foreign, what).toEqual(unknown)
        expect(foreign.status, what).toBe(404)
        expect(foreign.body, what).not.toContain('Mario Kart')
      }

      expect(await rowOf(game.id)).toEqual(before)
      expect(await tagRows()).toEqual(tagsBefore)
      expect(store.keys()).toEqual([])
    })

    it('still answers the owner', async () => {
      const owner = await cookieOf(host)
      const game = await created(owner, { name: 'Mario Kart' })

      expect((await get(`/api/games/${game.id}`, owner)).status).toBe(200)
      expect((await patch(game.id, owner, { name: 'Mario Kart 8' })).status).toBe(200)
      expect((await upload(game.id, owner)).status).toBe(200)
    })

    it('finds the owner by an uppercase uuid and a stranger does not', async () => {
      const owner = await cookieOf(host)
      const game = await created(owner, { name: 'Mario Kart' })
      const stranger = await cookieOf(otherHost)

      expect((await get(`/api/games/${game.id.toUpperCase()}`, owner)).status).toBe(200)
      expect((await get(`/api/games/${game.id.toUpperCase()}`, stranger)).status).toBe(404)
    })
  })

  describe('the list holds only the viewer\'s games', () => {
    it('lists nothing, one game, then two of the viewer, never the other User\'s', async () => {
      const owner = await cookieOf(host)
      const viewer = await cookieOf(otherHost)
      await created(owner, { name: 'Alpha', tags: ['Co-op'] })
      await created(owner, { name: 'Beta' })

      expect(await listOf(viewer)).toEqual({ games: [], tagsInUse: [], eventCounts: {} })

      const mine = await created(viewer, { name: 'zebra' })
      expect((await listOf(viewer)).games.map(game => game.id)).toEqual([mine.id])

      const second = await created(viewer, { name: 'Apfel' })
      expect((await listOf(viewer)).games.map(game => game.id)).toEqual([second.id, mine.id])
      expect((await listOf(owner)).games.map(game => game.name)).toEqual(['Alpha', 'Beta'])
    })

    it('lists and reads back the longest name whole', async () => {
      const cookie = await cookieOf(host)
      const name = 'W'.repeat(GAME_NAME_MAX)
      const game = await created(cookie, { name })

      expect((await listOf(cookie)).games.map(row => row.name)).toEqual([name])
      expect(((await (await get(`/api/games/${game.id}`, cookie)).json()) as GameView).name).toBe(name)
    })
  })

  describe('the Platform admin has a library of their own', () => {
    it('lists none of the Host\'s games, creates one the Host does not get, and gets none of the Host\'s', async () => {
      const hostCookie = await cookieOf(host)
      const adminCookie = await cookieOf(admin)
      const hostGame = await created(hostCookie, { name: 'Mario Kart' })

      expect((await listOf(adminCookie)).games).toEqual([])

      const own = await created(adminCookie, { name: 'Adminspiel' })
      expect(own).not.toHaveProperty('createdBy')
      expect((await listOf(adminCookie)).games.map(game => game.id)).toEqual([own.id])

      expect((await listOf(hostCookie)).games.map(game => game.id)).toEqual([hostGame.id])
      expect(await answer(await get(`/api/games/${own.id}`, hostCookie))).toEqual(await answer(await get(`/api/games/${UNKNOWN_ID}`, hostCookie)))
      expect(await answer(await get(`/api/games/${hostGame.id}`, adminCookie))).toEqual(await answer(await get(`/api/games/${UNKNOWN_ID}`, adminCookie)))
    })
  })

  describe('the Host permission alone opens the library', () => {
    async function setCanHost(name: string, canHost: boolean) {
      await testDb.db.update(users).set({ canHost }).where(eq(users.name, name))
    }

    it('hides everything at once without it, keeps the games, and gives them back with it', async () => {
      const cookie = await cookieOf(host)
      const first = await created(cookie, { name: 'Alpha', tags: ['Co-op'] })
      const second = await created(cookie, { name: 'Beta' })

      await setCanHost('Hostess', false)

      const refused = [
        await get('/api/games', cookie),
        await get(`/api/games/${first.id}`, cookie),
        await patch(first.id, cookie, { name: 'Neu' }),
        await upload(first.id, cookie),
        await request('/api/games', { method: 'POST', headers: json(cookie), body: JSON.stringify({ name: 'Neu' }) }),
        await get('/api/games/tags', cookie),
      ]
      expect(refused.map(response => response.status)).toEqual([404, 404, 404, 404, 404, 404])
      expect((await testDb.db.select().from(games)).map(row => row.id).sort()).toEqual([first.id, second.id].sort())

      await setCanHost('Hostess', true)

      const back = await listOf(cookie)
      expect(back.games.map(game => game.id)).toEqual([first.id, second.id])
    })

    it('gives a Platform admin without the Host flag no library', async () => {
      const cookie = await cookieOf(admin)
      await setCanHost('Admin', false)

      const [row] = await testDb.db.select().from(users).where(eq(users.name, 'Admin'))
      expect(row).toMatchObject({ isAdmin: true, canHost: false })
      expect((await get('/api/games', cookie)).status).toBe(404)
      expect((await get('/api/games/tags', cookie)).status).toBe(404)
    })

    it('starts a User who gets the permission later with an empty library and no Tags', async () => {
      const hostCookie = await cookieOf(host)
      await created(hostCookie, { name: 'Mario Kart', tags: ['Co-op'] })
      const memberCookie = await cookieOf(member)
      await setCanHost('Gast', true)

      expect(await listOf(memberCookie)).toEqual({ games: [], tagsInUse: [], eventCounts: {} })
      expect(await (await get('/api/games/tags', memberCookie)).json()).toEqual([])
    })
  })

  describe('Tags stay inside one library', () => {
    it('holds only the viewer\'s Tags in /api/games/tags and in tagsInUse, and none for a library without Tags', async () => {
      const hostCookie = await cookieOf(host)
      const otherCookie = await cookieOf(otherHost)
      await created(hostCookie, { name: 'Alpha', price: PAID, tags: ['Co-op', 'Racing'] })
      await created(otherCookie, { name: 'Beta', price: PAID, tags: ['Puzzle'] })
      await created(otherCookie, { name: 'Gamma', price: PAID })

      const hostTags = [{ key: 'co-op', label: 'Co-op' }, { key: 'racing', label: 'Racing' }]
      expect((await listOf(hostCookie)).tagsInUse).toEqual(hostTags)
      expect(await (await get('/api/games/tags', hostCookie)).json()).toEqual(hostTags)
      expect((await listOf(otherCookie)).tagsInUse).toEqual([{ key: 'puzzle', label: 'Puzzle' }])

      const adminCookie = await cookieOf(admin)
      await created(adminCookie, { name: 'Ohne Tags', price: PAID })
      expect(await (await get('/api/games/tags', adminCookie)).json()).toEqual([])
    })

    it('keeps each library\'s first spelling of the same word', async () => {
      const hostCookie = await cookieOf(host)
      const otherCookie = await cookieOf(otherHost)
      const hostGame = await created(hostCookie, { name: 'Alpha', price: PAID, tags: ['Co-op'] })

      const first = await created(otherCookie, { name: 'Beta', price: PAID, tags: ['CO-OP'] })
      expect(first.tags).toEqual([{ key: 'co-op', label: 'CO-OP' }])
      const second = await created(otherCookie, { name: 'Gamma', price: PAID, tags: ['co-op'] })
      expect(second.tags).toEqual([{ key: 'co-op', label: 'CO-OP' }])

      expect((await listOf(hostCookie)).tagsInUse).toEqual([{ key: 'co-op', label: 'Co-op' }])
      expect((await listOf(otherCookie)).tagsInUse).toEqual([{ key: 'co-op', label: 'CO-OP' }])
      expect(await tagRows()).toEqual(expect.arrayContaining([
        { gameId: hostGame.id, key: 'co-op', label: 'Co-op' },
        { gameId: first.id, key: 'co-op', label: 'CO-OP' },
        { gameId: second.id, key: 'co-op', label: 'CO-OP' },
      ]))
    })

    it('keeps a Tag in use in the other library when the last game of one drops it', async () => {
      const hostCookie = await cookieOf(host)
      const otherCookie = await cookieOf(otherHost)
      const hostGame = await created(hostCookie, { name: 'Alpha', price: PAID, tags: ['Co-op'] })
      await created(otherCookie, { name: 'Beta', price: PAID, tags: ['Co-op'] })

      expect((await patch(hostGame.id, hostCookie, { name: 'Alpha', tags: [] })).status).toBe(200)

      expect((await listOf(hostCookie)).tagsInUse).toEqual([])
      expect((await listOf(otherCookie)).tagsInUse).toEqual([{ key: 'co-op', label: 'Co-op' }])
    })

    it('keeps „Free-to-play“ per library', async () => {
      const hostCookie = await cookieOf(host)
      const otherCookie = await cookieOf(otherHost)
      const free = { cents: null, source: 'free_to_play' }
      const hostGame = await created(hostCookie, { name: 'Alpha', price: free })
      const otherGame = await created(otherCookie, { name: 'Beta', price: free })
      const keys = (tags: GameTag[]) => tags.map(tag => tag.key)
      expect(keys(hostGame.tags)).toEqual(['free-to-play'])

      // The Host's game gets a Price: its Tag goes, the other library's stays.
      const edited = await patch(hostGame.id, hostCookie, { name: 'Alpha', price: { cents: 999, source: 'steam' } })
      expect(keys(((await edited.json()) as GameView).tags)).toEqual([])
      expect(keys((await listOf(hostCookie)).tagsInUse)).toEqual([])
      expect(keys((await listOf(otherCookie)).tagsInUse)).toEqual(['free-to-play'])
      expect(keys(((await (await get(`/api/games/${otherGame.id}`, otherCookie)).json()) as GameView).tags)).toEqual(['free-to-play'])
    })
  })
})
