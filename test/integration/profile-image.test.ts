import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import type { AuthUser, SavedProfileImage } from '../../shared/auth'
import { webpOf } from '../webp-fixtures'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { readEvent, setUpEvent, signInAs, type Rig } from './scenario'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Profile picture upload (#678, spec #907): PUT /api/me/image, the image route's profile branch, and the three reads that carry the picture's address.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const plain = { provider: 'discord', id: '2', name: 'Gast', email: 'gast@example.com', image: undefined } as const
// Discord answers a default avatar when a User has none, so the User with no picture at all is a Twitch one.
const bare = { provider: 'twitch', id: '3', name: 'Leer', email: 'leer@example.com', image: undefined } as const
const withProviderPicture = { provider: 'twitch', id: '4', name: 'Streamer', email: 'streamer@example.com', image: 'https://img.example/streamer.png' } as const

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
const lossy = () => webpOf({ form: 'lossy', width: 256, height: 256 })
const png = Uint8Array.from([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii('IHDR')])

describe('the Profile picture (#678)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  const store = memoryImageStore()
  let failDelete = false
  // The same store, but a delete can be made to fail: the replaced object is cleaned up on a best-effort basis.
  const flakyStore = { ...store, async delete(key: string) {
    if (failDelete) throw new Error('store is down')
    await store.delete(key)
  } }

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { imageStore: flakyStore })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1' })
    await resetDatabase(testDb.db)
    store.clear()
    failDelete = false
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const rig = (): Rig => ({ request, db: testDb.db })

  async function cookieOf(profile: Parameters<typeof signIn>[1]) {
    return (await signIn(testDb.db, profile)).cookie
  }

  function upload(cookie: string | undefined, body: Uint8Array | null, headers: Record<string, string> = {}) {
    return request('/api/me/image', {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', ...(cookie ? { cookie } : {}), ...headers },
      body: body as BodyInit | null,
    })
  }

  const keyOf = async (id: string) => (await testDb.db.select({ key: users.profileImageKey }).from(users).where(eq(users.id, id)))[0]!.key

  async function userIdOf(profile: Parameters<typeof signIn>[1]) {
    return (await signInAs(rig(), profile)).id
  }

  function readImage(address: string, cookie?: string) {
    return request(address, { headers: cookie ? { cookie } : {} })
  }

  const me = async (cookie: string) => (await (await request('/api/me', { headers: { cookie } })).json() as { user: AuthUser }).user

  describe('PUT /api/me/image', () => {
    it('stores a lossy 256 × 256 upload, answers its address and writes the key onto the User, who needs no Host permission', async () => {
      const cookie = await cookieOf(plain)
      const id = await userIdOf(plain)

      const response = await upload(cookie, lossy())

      expect(response.status).toBe(200)
      const { image } = await response.json() as SavedProfileImage
      expect(image).toMatch(/^\/api\/images\/profile-[A-Za-z0-9_-]+\.webp$/)
      expect(store.keys()).toEqual([image.slice('/api/images/'.length)])
      expect(await keyOf(id)).toBe(store.keys()[0])
    })

    it('accepts a lossless and an extended still of 256 × 256', async () => {
      for (const [index, form] of (['lossless', 'extended'] as const).entries()) {
        const profile = { ...plain, id: `1${index}`, email: `form${index}@example.com` }
        const cookie = await cookieOf(profile)
        expect((await upload(cookie, webpOf({ form, width: 256, height: 256 }))).status).toBe(200)
      }
    })

    it('replaces the picture: the first object is gone, the store holds one key and the column the second', async () => {
      const cookie = await cookieOf(plain)
      const id = await userIdOf(plain)
      const first = (await (await upload(cookie, lossy())).json() as SavedProfileImage).image

      const second = (await (await upload(cookie, lossy())).json() as SavedProfileImage).image

      expect(second).not.toBe(first)
      expect(store.keys()).toEqual([second.slice('/api/images/'.length)])
      expect(await keyOf(id)).toBe(second.slice('/api/images/'.length))
    })

    it('still answers 200 with the new key when deleting the old object fails', async () => {
      const cookie = await cookieOf(plain)
      const id = await userIdOf(plain)
      await upload(cookie, lossy())
      failDelete = true
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await upload(cookie, lossy())

      expect(response.status).toBe(200)
      const { image } = await response.json() as SavedProfileImage
      expect(await keyOf(id)).toBe(image.slice('/api/images/'.length))
      expect(store.keys()).toContain(image.slice('/api/images/'.length))
      expect(errors).toHaveBeenCalled()
      errors.mockRestore()
    })

    async function refusal(body: Uint8Array | null, headers: Record<string, string> = {}) {
      const cookie = await cookieOf(plain)
      const id = await userIdOf(plain)
      const response = await upload(cookie, body, headers)
      expect(store.keys()).toEqual([])
      expect(await keyOf(id)).toBeNull()
      return { status: response.status, code: response.statusText }
    }

    it('refuses a file over 100 000 bytes by its announced length with image_too_large, before the body is read', async () => {
      expect(await refusal(new Uint8Array(100_001))).toEqual({ status: 413, code: 'image_too_large' })
    })

    it('refuses a body without a length that grows past the limit', async () => {
      const cookie = await cookieOf(plain)
      const id = await userIdOf(plain)
      const chunk = new Uint8Array(60_000)
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk)
          controller.enqueue(chunk)
          controller.close()
        },
      })

      const response = await request('/api/me/image', {
        method: 'PUT',
        headers: { 'content-type': 'image/webp', cookie },
        body: stream,
        duplex: 'half',
      } as RequestInit)

      expect(response.status).toBe(413)
      expect(response.statusText).toBe('image_too_large')
      expect(store.keys()).toEqual([])
      expect(await keyOf(id)).toBeNull()
    })

    it('refuses a PNG with image_not_webp', async () => {
      expect(await refusal(png)).toEqual({ status: 415, code: 'image_not_webp' })
    })

    it('refuses an animated WebP with image_unsupported', async () => {
      expect(await refusal(webpOf({ form: 'extended', width: 256, height: 256, animated: true }))).toEqual({ status: 415, code: 'image_unsupported' })
    })

    it('refuses a lossless 255 × 256 and a lossy 512 × 512 with image_unsupported', async () => {
      expect(await refusal(webpOf({ form: 'lossless', width: 255, height: 256 }))).toEqual({ status: 415, code: 'image_unsupported' })
      expect(await refusal(webpOf({ form: 'lossy', width: 512, height: 512 }))).toEqual({ status: 415, code: 'image_unsupported' })
    })

    it('refuses a WebP whose header cannot be read with image_unsupported', async () => {
      expect(await refusal(lossy().subarray(0, 20))).toEqual({ status: 415, code: 'image_unsupported' })
    })

    it('refuses an empty body', async () => {
      expect(await refusal(null)).toEqual({ status: 415, code: 'image_not_webp' })
    })

    it('keeps the picture a User had when a later upload is refused', async () => {
      const cookie = await cookieOf(plain)
      const id = await userIdOf(plain)
      await upload(cookie, lossy())
      const key = await keyOf(id)

      expect((await upload(cookie, png)).status).toBe(415)

      expect(await keyOf(id)).toBe(key)
      expect(store.keys()).toEqual([key])
    })

    it('answers 401 signed out and stores nothing', async () => {
      const response = await upload(undefined, lossy())

      expect(response.status).toBe(401)
      expect(store.keys()).toEqual([])
    })

    it('lets ten uploads of one User pass and refuses the eleventh with rate_limited, its object not stored; a second User is not limited', async () => {
      const cookie = await cookieOf(plain)
      for (let count = 0; count < 10; count++) expect((await upload(cookie, lossy())).status).toBe(200)

      const eleventh = await upload(cookie, lossy())

      expect(eleventh.status).toBe(429)
      expect(eleventh.statusText).toBe('rate_limited')
      expect(store.keys()).toHaveLength(1)
      expect((await upload(await cookieOf(bare), lossy())).status).toBe(200)
    })
  })

  describe('DELETE /api/me/image (#911)', () => {
    const remove = (cookie: string | undefined) => request('/api/me/image', { method: 'DELETE', headers: cookie ? { cookie } : {} })

    it('removes the uploaded picture: 200 with the provider\'s address, the key is null, the object is gone and its address answers like a missing route', async () => {
      const cookie = await cookieOf(withProviderPicture)
      const id = await userIdOf(withProviderPicture)
      const { image } = await (await upload(cookie, lossy())).json() as SavedProfileImage

      const response = await remove(cookie)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ image: 'https://img.example/streamer.png' })
      expect(await keyOf(id)).toBeNull()
      expect(store.keys()).toEqual([])
      const unknown = await readImage('/api/images/nope.webp')
      const gone = await readImage(image)
      expect(gone.status).toBe(404)
      expect(gone.statusText).toBe(unknown.statusText)
      expect(await gone.text()).toBe(await unknown.clone().text())
    })

    it('answers the same address for a User without an upload, deletes nothing and changes no row', async () => {
      const cookie = await cookieOf(withProviderPicture)
      const id = await userIdOf(withProviderPicture)
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      failDelete = true

      const response = await remove(cookie)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ image: 'https://img.example/streamer.png' })
      expect(await keyOf(id)).toBeNull()
      expect(errors).not.toHaveBeenCalled()
      errors.mockRestore()
    })

    it('answers { image: null } when the User has neither an upload nor a provider picture, and /api/me then shows no picture', async () => {
      const cookie = await cookieOf(bare)
      await upload(cookie, lossy())

      const response = await remove(cookie)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ image: null })
      expect(await me(cookie)).toMatchObject({ image: null, hasOwnImage: false })
    })

    it('answers 401 signed out and removes nothing', async () => {
      const owner = await cookieOf(plain)
      const id = await userIdOf(plain)
      const { image } = await (await upload(owner, lossy())).json() as SavedProfileImage
      const key = image.slice('/api/images/'.length)

      const response = await remove(undefined)

      expect(response.status).toBe(401)
      expect(await keyOf(id)).toBe(key)
      expect(store.keys()).toEqual([key])
    })
  })

  describe('GET /api/images/:key', () => {
    it('serves a current Profile picture to anyone with the public immutable cache, signed out, signed in and as its owner', async () => {
      const owner = await cookieOf(plain)
      const { image } = await (await upload(owner, lossy())).json() as SavedProfileImage

      for (const cookie of [undefined, await cookieOf(bare), owner]) {
        const response = await readImage(image, cookie)
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('image/webp')
        expect(response.headers.get('x-content-type-options')).toBe('nosniff')
        expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(lossy())
      }
    })

    it('answers a replaced key, a made-up profile key and a key without an object like a missing route', async () => {
      const cookie = await cookieOf(plain)
      const first = (await (await upload(cookie, lossy())).json() as SavedProfileImage).image
      await upload(cookie, lossy())
      const unknown = await readImage('/api/images/nope.webp')

      for (const address of [first, '/api/images/profile-AAAAAAAAAAAAAAAA.webp']) {
        const response = await readImage(address)
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
        expect(await response.text()).toBe(await unknown.clone().text())
      }

      // The column names a key whose object is gone from the store.
      store.clear()
      const [row] = await testDb.db.select({ key: users.profileImageKey }).from(users)
      expect((await readImage(`/api/images/${row!.key}`)).status).toBe(404)
    })
  })

  describe('where the picture shows', () => {
    it('says in GET /api/me that the picture is the User\'s own after an upload, and not after its removal (#911)', async () => {
      const cookie = await cookieOf(withProviderPicture)
      expect(await me(cookie)).toMatchObject({ hasOwnImage: false })

      const { image } = await (await upload(cookie, lossy())).json() as SavedProfileImage
      expect(await me(cookie)).toMatchObject({ image, hasOwnImage: true })

      await request('/api/me/image', { method: 'DELETE', headers: { cookie } })
      expect(await me(cookie)).toMatchObject({ image: 'https://img.example/streamer.png', hasOwnImage: false })
    })

    it('carries the uploaded address in GET /api/me, and a sign-in with a new provider picture changes users.image and never the upload', async () => {
      const cookie = await cookieOf(withProviderPicture)
      expect((await me(cookie)).image).toBe('https://img.example/streamer.png')
      const { image } = await (await upload(cookie, lossy())).json() as SavedProfileImage
      expect((await me(cookie)).image).toBe(image)

      const again = await cookieOf({ ...withProviderPicture, image: 'https://img.example/newer.png' })

      const [row] = await testDb.db.select().from(users)
      expect(row).toMatchObject({ image: 'https://img.example/newer.png', profileImageKey: image.slice('/api/images/'.length) })
      expect((await me(again)).image).toBe(image)
    })

    it('shows the new provider address of a User without an upload after a sign-in', async () => {
      await cookieOf(withProviderPicture)

      const again = await cookieOf({ ...withProviderPicture, image: 'https://img.example/newer.png' })

      expect((await me(again)).image).toBe('https://img.example/newer.png')
    })

    it('lists the uploaded address for an uploader, the provider\'s for a Member without an upload and null for one with neither, in the Event read', async () => {
      const event = await setUpEvent(rig(), {
        host,
        players: { uploader: plain, provider: withProviderPicture, none: bare },
        seats: [],
      })
      const { image } = await (await upload(event.players.uploader.cookie, lossy())).json() as SavedProfileImage

      const view = await readEvent(rig(), event.players.none.cookie, event.slug)

      const imageOf = (id: string) => view.members.find(member => member.id === id)!.image
      expect(imageOf(event.players.uploader.id)).toBe(image)
      expect(imageOf(event.players.provider.id)).toBe('https://img.example/streamer.png')
      expect(imageOf(event.players.none.id)).toBeNull()
    })

    it('carries the Host\'s uploaded address, else the provider\'s, in the signed-out Invite preview', async () => {
      const twitchHost = { provider: 'twitch', id: '5', name: 'Hostess', email: 'host@example.com', image: 'https://img.example/host.png' } as const
      const event = await setUpEvent(rig(), { host: twitchHost, players: {}, seats: [] })
      const preview = async () => (await (await request(`/api/invite/${event.inviteToken}`)).json() as { host: { image: string | null } }).host.image
      expect(await preview()).toBe('https://img.example/host.png')

      const { image } = await (await upload(event.host.cookie, lossy())).json() as SavedProfileImage

      expect(await preview()).toBe(image)
    })
  })
})
