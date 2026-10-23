import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import rotateInvite from '../../server/api/e/[slug]/rotate.post'
import previewInvite from '../../server/api/invite/[invite].get'
import joinInvite from '../../server/api/invite/[invite].post'
import { pollSlots, pollVotes, eventMembers, events, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Rotating the Invite link (#16, ADR 0006): a new token, the same slug. The old Invite link stops
// working at once, while Members keep their Event link. Only the Host may rotate.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const newcomer = { provider: 'twitch', id: '3', name: 'Neu', email: 'neu@example.com', image: undefined } as const

describe('rotating the Invite link', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/e/:slug/rotate': rotateInvite,
      'GET /api/invite/:invite': previewInvite,
      'POST /api/invite/:invite': joinInvite,
    })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    await testDb.db.delete(pollVotes)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** An Event created by the Host, with a guest who has joined through the first Invite link. */
  async function hostedEventWithGuest() {
    setAllowlist({ hosts: 'discord:1' })
    const { cookie: hostCookie } = await signIn(testDb.db, host)
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'] }),
    })
    const { slug, inviteUrl } = await created.json()
    const oldInvite = new URL(inviteUrl).pathname.slice('/e/'.length)

    const { cookie: guestCookie } = await signIn(testDb.db, guest)
    await request(`/api/invite/${oldInvite}`, { method: 'POST', headers: { cookie: guestCookie } })

    return { slug, oldInvite, hostCookie, guestCookie }
  }

  function rotate(cookie: string | undefined, slug: string) {
    return request(`/api/e/${slug}/rotate`, { method: 'POST', headers: cookie ? { cookie } : {} })
  }

  function read(cookie: string, slug: string) {
    return request(`/api/e/${slug}`, { headers: { cookie } })
  }

  async function tokenOf(slug: string) {
    const [event] = await testDb.db.select({ inviteToken: events.inviteToken }).from(events).where(eq(events.slug, slug))
    return event!.inviteToken
  }

  describe('POST /api/e/:slug/rotate', () => {
    it('requires sign-in', async () => {
      const { slug } = await hostedEventWithGuest()

      expect((await rotate(undefined, slug)).status).toBe(401)
    })

    it('answers 404 to a User who is not a Member, so Events cannot be probed', async () => {
      const { slug } = await hostedEventWithGuest()
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      expect((await rotate(newcomerCookie, slug)).status).toBe(404)
    })

    it('answers 403 to a Member who is not the Host, and keeps the token', async () => {
      const { slug, guestCookie } = await hostedEventWithGuest()
      const before = await tokenOf(slug)

      const response = await rotate(guestCookie, slug)

      expect(response.status).toBe(403)
      expect(response.statusText).toBe('not_host')
      expect(await tokenOf(slug)).toBe(before)
    })

    it('gives a new 12-character token and keeps the slug, and answers with the new Invite link', async () => {
      const { slug, hostCookie, oldInvite } = await hostedEventWithGuest()

      const response = await rotate(hostCookie, slug)

      expect(response.status).toBe(200)
      const token = await tokenOf(slug)
      expect(token).toMatch(/^[A-Za-z0-9]{12}$/)
      expect(token).not.toBe(oldInvite.slice(slug.length + 1))
      expect(await response.json()).toEqual({ inviteUrl: `http://localhost/e/${slug}-${token}` })
      const [event] = await testDb.db.select({ slug: events.slug }).from(events)
      expect(event!.slug).toBe(slug)
    })

    it('makes the old Invite link answer the same 404 as any unknown link, for preview and join', async () => {
      const { slug, hostCookie, oldInvite } = await hostedEventWithGuest()
      await rotate(hostCookie, slug)
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      const preview = await request(`/api/invite/${oldInvite}`)
      const join = await request(`/api/invite/${oldInvite}`, { method: 'POST', headers: { cookie: newcomerCookie } })

      for (const response of [preview, join]) {
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Event not found')
      }
      expect((await request(`/api/invite/${slug}-${await tokenOf(slug)}`)).status).toBe(200)
    })

    it('lets a newcomer join through the new Invite link only', async () => {
      const { slug, hostCookie } = await hostedEventWithGuest()
      await rotate(hostCookie, slug)
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      const response = await request(`/api/invite/${slug}-${await tokenOf(slug)}`, { method: 'POST', headers: { cookie: newcomerCookie } })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slug, joined: true })
    })

    it('leaves existing Members in place, so they keep the Event link', async () => {
      const { slug, hostCookie, guestCookie } = await hostedEventWithGuest()

      await rotate(hostCookie, slug)

      expect((await read(guestCookie, slug)).status).toBe(200)
      expect((await read(hostCookie, slug)).status).toBe(200)
      expect(await testDb.db.select().from(eventMembers)).toHaveLength(2)
    })
  })

  describe('GET /api/e/:slug inviteUrl', () => {
    it('shows the Invite link to the Host only', async () => {
      const { slug, hostCookie, guestCookie } = await hostedEventWithGuest()
      const token = await tokenOf(slug)

      const hostView = await (await read(hostCookie, slug)).json()
      const guestView = await (await read(guestCookie, slug)).json()

      expect(hostView.inviteUrl).toBe(`http://localhost/e/${slug}-${token}`)
      expect(guestView.inviteUrl).toBeNull()
      expect(JSON.stringify(guestView)).not.toContain(token)
    })

    it('shows the new Invite link to the Host after a rotation', async () => {
      const { slug, hostCookie } = await hostedEventWithGuest()
      await rotate(hostCookie, slug)

      const { inviteUrl } = await (await read(hostCookie, slug)).json()

      expect(inviteUrl).toBe(`http://localhost/e/${slug}-${await tokenOf(slug)}`)
    })
  })
})
