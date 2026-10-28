import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createGame from '../../server/api/games/index.post'
import readGame from '../../server/api/games/[id].get'
import putImage from '../../server/api/games/[id]/image.put'
import getImage from '../../server/api/images/[key].get'
import { games, users } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import type { GameView } from '../../shared/game'
import { createTestDb, createTestServer } from './harness'
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
  let request: ReturnType<typeof createTestServer>
  const store = memoryImageStore()

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/games': createGame,
      'GET /api/games/:id': readGame,
      'PUT /api/games/:id/image': putImage,
      'GET /api/images/:key': getImage,
    }, { imageStore: store })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
    await testDb.db.delete(games)
    await testDb.db.delete(users)
    store.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  it('stores the upload, answers with the game and its image URL, and serves the bytes to library viewers', async () => {
    const creator = await cookieOf(host)
    const { id } = await newGame(creator)

    const response = await upload(id, creator, webp())

    expect(response.status).toBe(200)
    const view = await response.json() as GameView
    expect(view.id).toBe(id)
    expect(view.imageUrl).toMatch(new RegExp(`^/api/images/${id}-[A-Za-z0-9_-]+\\.webp$`))
    expect(store.keys()).toHaveLength(1)

    for (const cookie of [creator, await cookieOf(otherHost), await cookieOf(admin)]) {
      const image = await fetchImage(view.imageUrl!, cookie)
      expect(image.status).toBe(200)
      expect(image.headers.get('content-type')).toBe('image/webp')
      expect(image.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(webp())
    }
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

  it('lets the Platform admin replace the image of a game someone else made', async () => {
    const { id } = await newGame(await cookieOf(host))

    const response = await upload(id, await cookieOf(admin), webp())

    expect(response.status).toBe(200)
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

    it('refuses another Host, who may see the game but not edit it', async () => {
      const { id } = await newGame(await cookieOf(host))

      await refusal(await upload(id, await cookieOf(otherHost), webp()), 403, 'not_game_editor')
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
})
