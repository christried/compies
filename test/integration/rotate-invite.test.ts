import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createSession from '../../server/api/s/index.post'
import readSession from '../../server/api/s/[slug].get'
import rotateInvite from '../../server/api/s/[slug]/rotate.post'
import previewInvite from '../../server/api/invite/[invite].get'
import joinInvite from '../../server/api/invite/[invite].post'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Rotating the Invite link (#16, ADR 0006): a new token, the same slug. The old Invite link stops
// working at once, while Members keep their Session link. Only the Host may rotate.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const newcomer = { provider: 'twitch', id: '3', name: 'Neu', email: 'neu@example.com', image: undefined } as const

describe('rotating the Invite link', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/s': createSession,
      'GET /api/s/:slug': readSession,
      'POST /api/s/:slug/rotate': rotateInvite,
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
    await testDb.db.delete(sessionMembers)
    await testDb.db.delete(sessions)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** A Session created by the Host, with a guest who has joined through the first Invite link. */
  async function hostedSessionWithGuest() {
    setAllowlist({ hosts: 'discord:1' })
    const { cookie: hostCookie } = await signIn(testDb.db, host)
    const created = await request('/api/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'] }),
    })
    const { slug, inviteUrl } = await created.json()
    const oldInvite = new URL(inviteUrl).pathname.slice('/s/'.length)

    const { cookie: guestCookie } = await signIn(testDb.db, guest)
    await request(`/api/invite/${oldInvite}`, { method: 'POST', headers: { cookie: guestCookie } })

    return { slug, oldInvite, hostCookie, guestCookie }
  }

  function rotate(cookie: string | undefined, slug: string) {
    return request(`/api/s/${slug}/rotate`, { method: 'POST', headers: cookie ? { cookie } : {} })
  }

  function read(cookie: string, slug: string) {
    return request(`/api/s/${slug}`, { headers: { cookie } })
  }

  async function tokenOf(slug: string) {
    const [session] = await testDb.db.select({ inviteToken: sessions.inviteToken }).from(sessions).where(eq(sessions.slug, slug))
    return session!.inviteToken
  }

  describe('POST /api/s/:slug/rotate', () => {
    it('requires sign-in', async () => {
      const { slug } = await hostedSessionWithGuest()

      expect((await rotate(undefined, slug)).status).toBe(401)
    })

    it('answers 404 to a User who is not a Member, so Sessions cannot be probed', async () => {
      const { slug } = await hostedSessionWithGuest()
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      expect((await rotate(newcomerCookie, slug)).status).toBe(404)
    })

    it('answers 403 to a Member who is not the Host, and keeps the token', async () => {
      const { slug, guestCookie } = await hostedSessionWithGuest()
      const before = await tokenOf(slug)

      const response = await rotate(guestCookie, slug)

      expect(response.status).toBe(403)
      expect(await tokenOf(slug)).toBe(before)
    })

    it('gives a new 12-character token and keeps the slug, and answers with the new Invite link', async () => {
      const { slug, hostCookie, oldInvite } = await hostedSessionWithGuest()

      const response = await rotate(hostCookie, slug)

      expect(response.status).toBe(200)
      const token = await tokenOf(slug)
      expect(token).toMatch(/^[A-Za-z0-9]{12}$/)
      expect(token).not.toBe(oldInvite.slice(slug.length + 1))
      expect(await response.json()).toEqual({ inviteUrl: `http://localhost/s/${slug}-${token}` })
      const [session] = await testDb.db.select({ slug: sessions.slug }).from(sessions)
      expect(session!.slug).toBe(slug)
    })

    it('makes the old Invite link answer the same 404 as any unknown link, for preview and join', async () => {
      const { slug, hostCookie, oldInvite } = await hostedSessionWithGuest()
      await rotate(hostCookie, slug)
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      const preview = await request(`/api/invite/${oldInvite}`)
      const join = await request(`/api/invite/${oldInvite}`, { method: 'POST', headers: { cookie: newcomerCookie } })

      for (const response of [preview, join]) {
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Session not found')
      }
      expect((await request(`/api/invite/${slug}-${await tokenOf(slug)}`)).status).toBe(200)
    })

    it('lets a newcomer join through the new Invite link only', async () => {
      const { slug, hostCookie } = await hostedSessionWithGuest()
      await rotate(hostCookie, slug)
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      const response = await request(`/api/invite/${slug}-${await tokenOf(slug)}`, { method: 'POST', headers: { cookie: newcomerCookie } })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slug, joined: true })
    })

    it('leaves existing Members in place, so they keep the Session link', async () => {
      const { slug, hostCookie, guestCookie } = await hostedSessionWithGuest()

      await rotate(hostCookie, slug)

      expect((await read(guestCookie, slug)).status).toBe(200)
      expect((await read(hostCookie, slug)).status).toBe(200)
      expect(await testDb.db.select().from(sessionMembers)).toHaveLength(2)
    })
  })

  describe('GET /api/s/:slug inviteUrl', () => {
    it('shows the Invite link to the Host only', async () => {
      const { slug, hostCookie, guestCookie } = await hostedSessionWithGuest()
      const token = await tokenOf(slug)

      const hostView = await (await read(hostCookie, slug)).json()
      const guestView = await (await read(guestCookie, slug)).json()

      expect(hostView.inviteUrl).toBe(`http://localhost/s/${slug}-${token}`)
      expect(guestView.inviteUrl).toBeNull()
      expect(JSON.stringify(guestView)).not.toContain(token)
    })

    it('shows the new Invite link to the Host after a rotation', async () => {
      const { slug, hostCookie } = await hostedSessionWithGuest()
      await rotate(hostCookie, slug)

      const { inviteUrl } = await (await read(hostCookie, slug)).json()

      expect(inviteUrl).toBe(`http://localhost/s/${slug}-${await tokenOf(slug)}`)
    })
  })
})
