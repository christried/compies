import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { eventPoolGames, events, games, users } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import type { GameView } from '../../shared/game'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { LOBBY } from './hidden-wheel-world'
import { hostPutsBack, hostSets, playersJoin, setUpEvent, signInAs, startRunningEvent, type Rig, type Signed } from './scenario'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Admin', email: 'admin@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '3', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
/** The smallest thing the server accepts as a WebP: it only checks the marks (RIFF, size, WEBP). */
function webp(payload = 'first', length = 40): Uint8Array {
  const bytes = new Uint8Array(length)
  bytes.set([...ascii('RIFF'), length - 8, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii(payload)])
  return bytes
}
const png = Uint8Array.from([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii('IHDR')])

describe('game images (#143)', () => {
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

  const rig = (): Rig => ({ request, db: testDb.db })

  async function cookieOf(profile: Parameters<typeof signIn>[1]) {
    return (await signIn(testDb.db, profile)).cookie
  }

  async function newGame(cookie: string) {
    const response = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Mario Kart' }),
    })
    return await response.json() as GameView
  }

  function upload(id: string, cookie: string | undefined, body: Uint8Array) {
    return request(`/api/games/${id}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', ...(cookie ? { cookie } : {}) },
      body: body as BodyInit,
    })
  }

  function fetchImage(url: string, cookie?: string) {
    return request(url, { headers: cookie ? { cookie } : {} })
  }

  it('stores the upload, answers with the game and its image URL, and serves the bytes to its creator (#723)', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)

    const response = await upload(id, creator, webp())

    expect(response.status).toBe(200)
    const view = await response.json() as GameView
    expect(view.id).toBe(id)
    expect(view.imageUrl).toMatch(new RegExp(`^/api/images/${id}-[A-Za-z0-9_-]+\\.webp$`))
    expect(store.keys()).toHaveLength(1)

    const image = await fetchImage(view.imageUrl!, creator)
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/webp')
    expect(image.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(image.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(webp())
  })

  it('answers another Host and the Platform admin as for an unknown key: no Host sees another Host\'s image (#723)', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)
    const { imageUrl } = await (await upload(id, creator, webp())).json() as GameView
    const unknown = await fetchImage('/api/images/nope.webp', creator)

    for (const cookie of [await cookieOf(otherHost), await cookieOf(admin)]) {
      const response = await fetchImage(imageUrl!, cookie)
      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
      expect(await response.text()).toBe(await unknown.clone().text())
    }
  })

  it('answers the game with its Tags (#335)', async () => {
    const creator = await cookieOf(host)
    const created = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': creator },
      body: JSON.stringify({ name: 'Mario Kart', price: { cents: 1999, source: 'steam' }, tags: ['Co-op', 'Retro'] }),
    })
    const { id } = await created.json() as GameView

    const view = await (await upload(id, creator, webp())).json() as GameView

    expect(view.tags).toEqual([{ key: 'co-op', label: 'Co-op' }, { key: 'retro', label: 'Retro' }])
  })

  it('shows up as imageUrl when the game is read back from the library', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)
    const { imageUrl } = await (await upload(id, creator, webp())).json() as GameView

    const read = await request(`/api/games/${id}`, { headers: { cookie: creator } })

    expect((await read.json() as GameView).imageUrl).toBe(imageUrl)
  })

  it('serves nothing to a Member, to someone signed out, or for a key that was never given out', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)
    const { imageUrl } = await (await upload(id, creator, webp())).json() as GameView

    for (const response of [
      await fetchImage(imageUrl!, await cookieOf(member)),
      await fetchImage(imageUrl!),
      await fetchImage('/api/images/nope.webp', creator),
    ]) {
      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
    }
  })

  it('answers 404 when the store lost the object', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)
    const { imageUrl } = await (await upload(id, creator, webp())).json() as GameView
    store.clear()

    expect((await fetchImage(imageUrl!, creator)).status).toBe(404)
  })

  it('gives a replaced image a new URL: the old one is gone, the new one serves the new bytes', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)
    const first = await (await upload(id, creator, webp('first'))).json() as GameView

    const second = await (await upload(id, creator, webp('second'))).json() as GameView

    expect(second.imageUrl).not.toBe(first.imageUrl)
    expect((await fetchImage(first.imageUrl!, creator)).status).toBe(404)
    const image = await fetchImage(second.imageUrl!, creator)
    expect(image.status).toBe(200)
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(webp('second'))
  })

  it('removes the replaced image from the store, so no old object is left behind', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)
    const first = await (await upload(id, creator, webp('first'))).json() as GameView
    const firstKey = first.imageUrl!.replace('/api/images/', '')

    const second = await (await upload(id, creator, webp('second'))).json() as GameView

    expect(store.keys()).toEqual([second.imageUrl!.replace('/api/images/', '')])
    expect(store.keys()).not.toContain(firstKey)
  })

  it('still answers 200 with the new image when deleting the old object fails', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)
    await upload(id, creator, webp('first'))
    const failure = vi.spyOn(store, 'delete').mockRejectedValueOnce(new Error('R2 down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await upload(id, creator, webp('second'))

    expect(response.status).toBe(200)
    expect(failure).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })

  it('answers the Platform admin as for a missing route for a game someone else made, and stores nothing (#455)', async () => {
    const { id } = await newGame(await cookieOf(host))

    const response = await upload(id, await cookieOf(admin), webp())

    expect(response.status).toBe(404)
    expect(response.statusText).toBe('Not Found')
    expect(store.keys()).toEqual([])
    expect((await testDb.db.select().from(games))[0]!.imageKey).toBeNull()
  })

  describe('what it refuses', () => {
    async function refusal(response: Response, status: number, code: string) {
      expect(response.status).toBe(status)
      expect(response.statusText).toBe(code)
      expect(store.keys()).toEqual([])
      expect((await testDb.db.select().from(games))[0]!.imageKey).toBeNull()
    }

    it('refuses bytes that are not a WebP, whatever the content-type says', async () => {
      const creator = await cookieOf(host)
      const { id } = await newGame(creator)

      await refusal(await upload(id, creator, png), 415, 'image_not_webp')
      await refusal(await upload(id, creator, new Uint8Array()), 415, 'image_not_webp')
    })

    it('refuses more than 200 000 bytes but takes exactly that much', async () => {
      const creator = await cookieOf(host)
      const { id } = await newGame(creator)

      await refusal(await upload(id, creator, webp('big', 200_001)), 413, 'image_too_large')

      expect((await upload(id, creator, webp('exact', 200_000))).status).toBe(200)
    })

    it('refuses more than the maximum when the body arrives without a content-length', async () => {
      const creator = await cookieOf(host)
      const { id } = await newGame(creator)
      const bytes = webp('big', 200_001)
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 100_000))
          controller.enqueue(bytes.subarray(100_000))
          controller.close()
        },
      })

      const response = await request(`/api/games/${id}/image`, {
        method: 'PUT',
        headers: { 'content-type': 'image/webp', 'cookie': creator },
        body: stream,
        duplex: 'half',
      } as RequestInit)

      await refusal(response, 413, 'image_too_large')
    })

    it('answers another Host as for a missing route: it is not their game (#455)', async () => {
      const { id } = await newGame(await cookieOf(host))

      await refusal(await upload(id, await cookieOf(otherHost), webp()), 404, 'Not Found')
    })

    it('answers as for a missing route to a Member, to someone signed out and for an unknown game', async () => {
      const creator = await cookieOf(host)
      const { id } = await newGame(creator)

      for (const response of [
        await upload(id, await cookieOf(member), webp()),
        await upload(id, undefined, webp()),
        await upload('00000000-0000-4000-8000-000000000000', creator, webp()),
        await upload('nicht-eine-uuid', creator, webp()),
      ]) {
        await refusal(response, 404, 'Not Found')
      }
    })
  })

  // Copies of a game share one image key (ADR 0018, #721), so a key can name several rows, one per owner.
  describe('who fetches an image that copies share (#723)', () => {
    const thirdHost = { provider: 'discord', id: '4', name: 'Dritter', email: 'host3@example.com', image: undefined } as const
    const elsewhere = { provider: 'discord', id: '5', name: 'Woanders', email: 'host4@example.com', image: undefined } as const
    const rival = { provider: 'discord', id: '6', name: 'Gegner', email: 'rival@example.com', image: undefined } as const
    const KEY = 'shared-game-key.webp'
    /** Everyone who is no Member of an Event yet, signed in with their permissions: four Hosts, the Platform admin and a plain Member. */
    async function cast() {
      setAllowlist({ hosts: 'discord:1,discord:3,discord:4,discord:5', admins: 'discord:9' })
      const signed = {
        one: await signInAs(rig(), host),
        two: await signInAs(rig(), otherHost),
        three: await signInAs(rig(), thirdHost),
        elsewhere: await signInAs(rig(), elsewhere),
        admin: await signInAs(rig(), admin),
        member: await signInAs(rig(), member),
      }
      await store.put(KEY, webp('shared'), 'image/webp')
      return signed
    }

    /** A game row as the migration makes a copy: the same image key, another owner. */
    async function addRow(owner: Signed, imageKey: string) {
      const [row] = await testDb.db.insert(games).values({ name: 'Mario Kart', imageKey, createdBy: owner.id }).returning()
      return row!
    }

    const pooled = [{ key: 'game', values: { name: 'Mario Kart', imageKey: KEY }, pool: true }] as const
    const urlOf = (key: string) => `/api/images/${key}`
    const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer())

    it.each([1, 2, 3])('serves each owner and nobody else when %i game rows name the key', async (count) => {
      const people = await cast()
      const hosts = [people.one, people.two, people.three]
      for (const owner of hosts.slice(0, count)) await addRow(owner, KEY)
      await store.put('elsewhere.webp', webp('elsewhere'), 'image/webp')
      await addRow(people.elsewhere, 'elsewhere.webp')

      for (const owner of hosts.slice(0, count)) {
        const response = await fetchImage(urlOf(KEY), owner.cookie)
        expect(response.status).toBe(200)
        expect(await bytesOf(response)).toEqual(webp('shared'))
      }
      const refused = [...hosts.slice(count), people.elsewhere, people.admin, people.member]
      for (const who of refused) expect((await fetchImage(urlOf(KEY), who.cookie)).status).toBe(404)
      const signedOut = await fetchImage(urlOf(KEY))
      expect(signedOut.status).toBe(404)
      expect(signedOut.statusText).toBe('Not Found')
      // The other Host's own key is theirs.
      expect((await fetchImage(urlOf('elsewhere.webp'), people.elsewhere.cookie)).status).toBe(200)
    })

    it.each([
      ['a copy', otherHost],
      ['the original', host],
    ])('serves a Member of an Event whose pool holds %s with the Pool preview on', async (_which, hostProfile) => {
      const people = await cast()
      const event = await setUpEvent(rig(), { host: hostProfile, players: { member }, seats: [], games: pooled })
      await addRow(hostProfile === host ? people.two : people.one, KEY)

      const response = await fetchImage(urlOf(KEY), event.players.member.cookie)

      expect(response.status).toBe(200)
      expect(await bytesOf(response)).toEqual(webp('shared'))
      expect((await fetchImage(urlOf(KEY), people.admin.cookie)).status).toBe(404)
    })

    it('serves a Member no image through a pool row of a game that belongs to another Host than the Event\'s (#820)', async () => {
      const people = await cast()
      // The 0.15 code could still write such a row while a migration ran (ADR 0007): the Event is otherHost's, the game in its pool is host's.
      const event = await setUpEvent(rig(), { host: otherHost, players: { member }, seats: [], games: [] })
      const foreign = await addRow(people.one, KEY)
      await testDb.db.insert(eventPoolGames).values({ eventId: event.eventId, gameId: foreign.id })

      expect((await fetchImage(urlOf(KEY), event.players.member.cookie)).status).toBe(404)
      // Its owner still has it.
      expect((await fetchImage(urlOf(KEY), people.one.cookie)).status).toBe(200)
    })

    it.each([
      ['Pool preview off', { teamSize: 1, poolPreview: false }],
      ['a Hidden wheel', LOBBY],
    ])('hides the image of a pool game under %s from a Member until a Round sets it, and keeps it once put back', async (_rule, settings) => {
      const people = await cast()
      const event = await startRunningEvent(rig(), { host: otherHost, players: { member, rival }, seats: [['member', 1], ['rival', 2]], settings, games: pooled })
      await addRow(people.one, KEY)
      const { member: viewer } = event.players

      expect((await fetchImage(urlOf(KEY), viewer.cookie)).status).toBe(404)
      expect((await fetchImage(urlOf(KEY), event.host.cookie)).status).toBe(200)

      const roundId = await hostSets(rig(), event, event.games.game.id)

      const set = await fetchImage(urlOf(KEY), viewer.cookie)
      expect(set.status).toBe(200)
      expect(await bytesOf(set)).toEqual(webp('shared'))
      expect((await fetchImage(urlOf(KEY), event.host.cookie)).status).toBe(200)

      await hostPutsBack(rig(), event, roundId)

      expect((await fetchImage(urlOf(KEY), viewer.cookie)).status).toBe(200)
    })

    it('judges each Event by its own rules: a Member of one Event that hides the game does not see it through another they are no Member of', async () => {
      const people = await cast()
      const hiding = await setUpEvent(rig(), { host: otherHost, players: { member }, seats: [], settings: { poolPreview: false }, games: pooled })
      const showing = await setUpEvent(rig(), { host: host, players: {}, seats: [], games: pooled })
      await addRow(people.three, KEY)
      const { member: viewer } = hiding.players

      expect((await fetchImage(urlOf(KEY), viewer.cookie)).status).toBe(404)

      await playersJoin(rig(), showing, [viewer])

      expect((await fetchImage(urlOf(KEY), viewer.cookie)).status).toBe(200)
    })

    it('refuses an owner who lost the Host permission and is no Member of an Event, and a Member of a deleted Event', async () => {
      const people = await cast()
      await addRow(people.one, KEY)
      expect((await fetchImage(urlOf(KEY), people.one.cookie)).status).toBe(200)

      await testDb.db.update(users).set({ canHost: false }).where(eq(users.id, people.one.id))

      expect((await fetchImage(urlOf(KEY), people.one.cookie)).status).toBe(404)

      const event = await setUpEvent(rig(), { host: otherHost, players: { member }, seats: [], games: pooled })
      expect((await fetchImage(urlOf(KEY), event.players.member.cookie)).status).toBe(200)

      await testDb.db.update(events).set({ deletedAt: new Date() }).where(eq(events.id, event.eventId))

      expect((await fetchImage(urlOf(KEY), event.players.member.cookie)).status).toBe(404)
    })
  })

  describe('replacing an image that copies share (#723)', () => {
    /** Host 1's game with an uploaded image and Host 3's copy of it, as the migration makes one. */
    async function sharedPair() {
      const { cookie: first } = await signInAs(rig(), host)
      const { cookie: second, id: ownerId } = await signInAs(rig(), otherHost)
      const original = await newGame(first)
      const { imageUrl } = await (await upload(original.id, first, webp('shared'))).json() as GameView
      const key = imageUrl!.replace('/api/images/', '')
      const [copy] = await testDb.db.insert(games).values({ name: 'Mario Kart', imageKey: key, createdBy: ownerId }).returning()
      return { first, second, original, copy: copy!, key }
    }

    it('leaves the object for the other game, and removes it when the last game lets go', async () => {
      const { first, second, original, copy, key } = await sharedPair()

      const replacedCopy = await (await upload(copy.id, second, webp('copy'))).json() as GameView
      const copyKey = replacedCopy.imageUrl!.replace('/api/images/', '')

      expect(copyKey).not.toBe(key)
      expect([...store.keys()].sort()).toEqual([key, copyKey].sort())
      const stillThere = await fetchImage(`/api/images/${key}`, first)
      expect(stillThere.status).toBe(200)
      expect(new Uint8Array(await stillThere.arrayBuffer())).toEqual(webp('shared'))
      expect((await fetchImage(replacedCopy.imageUrl!, second)).status).toBe(200)

      const replacedOriginal = await (await upload(original.id, first, webp('original'))).json() as GameView
      const originalKey = replacedOriginal.imageUrl!.replace('/api/images/', '')

      expect([...store.keys()].sort()).toEqual([copyKey, originalKey].sort())
      expect((await fetchImage(`/api/images/${key}`, first)).status).toBe(404)
    })

    it('does not touch the store for a shared object, and logs nothing', async () => {
      const { second, copy } = await sharedPair()
      const deletion = vi.spyOn(store, 'delete')
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect((await upload(copy.id, second, webp('copy'))).status).toBe(200)

      expect(deletion).not.toHaveBeenCalled()
      expect(logged).not.toHaveBeenCalled()
      vi.restoreAllMocks()
    })

    it('still answers 200 with the new image and only logs when the lookup for other rows fails', async () => {
      const creator = await cookieOf(host)
      const { id } = await newGame(creator)
      await upload(id, creator, webp('first'))
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      // The first read after the update is the cleanup's lookup.
      const realUpdate = testDb.db.update.bind(testDb.db)
      let updated = false
      vi.spyOn(testDb.db, 'update').mockImplementation(((...args: Parameters<typeof realUpdate>) => {
        updated = true
        return realUpdate(...args)
      }) as typeof testDb.db.update)
      const realSelect = testDb.db.select.bind(testDb.db)
      vi.spyOn(testDb.db, 'select').mockImplementation(((...args: Parameters<typeof realSelect>) => {
        if (updated) {
          updated = false
          throw new Error('database down')
        }
        return realSelect(...args)
      }) as typeof testDb.db.select)

      const response = await upload(id, creator, webp('second'))

      expect(response.status).toBe(200)
      expect(logged).toHaveBeenCalledOnce()
      vi.restoreAllMocks()
    })
  })
})
