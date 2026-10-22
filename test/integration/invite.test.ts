import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createSession from '../../server/api/s/index.post'
import readSession from '../../server/api/s/[slug].get'
import previewInvite from '../../server/api/invite/[invite].get'
import joinInvite from '../../server/api/invite/[invite].post'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Invite link and the Session link (ADR 0006). Invalid, rotated, deleted and non-Member links
// all get the same 404 "Session not found", so nobody can probe which Sessions exist. Only a former
// Member of a deleted Session gets 410 "Session deleted".
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: 'https://img.example/host.png' } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const newcomer = { provider: 'twitch', id: '3', name: 'Neu', email: 'neu@example.com', image: undefined } as const

describe('invite links', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/s': createSession,
      'GET /api/s/:slug': readSession,
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

  /** Creates a Session as the Host and returns its Session link slug and Invite link path (`<slug>-<token>`). */
  async function createHostedSession(): Promise<{ slug: string, invite: string, hostCookie: string }> {
    setAllowlist({ hosts: 'discord:1' })
    const { cookie: hostCookie } = await signIn(testDb.db, host)
    await testDb.db.update(users).set({ displayName: 'Sanne' })
    const response = await request('/api/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30', '2090-10-31T19:00'] }),
    })
    const { slug, inviteUrl } = await response.json()
    return { slug, invite: new URL(inviteUrl).pathname.slice('/s/'.length), hostCookie }
  }

  function preview(invite: string) {
    return request(`/api/invite/${invite}`)
  }

  function join(invite: string, cookie?: string) {
    return request(`/api/invite/${invite}`, { method: 'POST', headers: cookie ? { cookie } : {} })
  }

  function readLink(cookie: string, slug: string) {
    return request(`/api/s/${slug}`, { headers: { cookie } })
  }

  async function memberships() {
    return testDb.db.select().from(sessionMembers)
  }

  async function userId(name: string) {
    const [user] = await testDb.db.select({ id: users.id }).from(users).where(eq(users.name, name))
    return user!.id
  }

  describe('GET /api/invite/:invite', () => {
    it('shows only the Session name and the Host\'s Display name and avatar to a signed-out visitor', async () => {
      const { invite } = await createHostedSession()

      const response = await preview(invite)

      expect(response.status).toBe(200)
      const [hostRow] = await testDb.db.select().from(users)
      expect(await response.json()).toEqual({
        sessionName: 'Freitags-Zocken',
        host: { name: 'Sanne', image: hostRow!.image },
      })
      expect(hostRow!.image).toEqual(expect.any(String))
    })

    it('leaks no Slot, Vote or Member data', async () => {
      const { invite } = await createHostedSession()

      const text = await (await preview(invite)).text()

      expect(text).not.toMatch(/slot|vote|member|startsAt|userId|zone|isHost|count/i)
    })

    it('answers the same 404 for an invalid, rotated or deleted link', async () => {
      const { slug, invite } = await createHostedSession()
      const token = invite.slice(slug.length + 1)

      const invalid = await preview(`${slug}-AAAAAAAAAAAA`)
      const wrongSlug = await preview(`nie-gab-es-${token}`)
      await testDb.db.update(sessions).set({ inviteToken: 'Zz9Zz9Zz9Zz9' }).where(eq(sessions.slug, slug))
      const rotated = await preview(invite)
      await testDb.db.update(sessions).set({ inviteToken: token, deletedAt: new Date() }).where(eq(sessions.slug, slug))
      const deleted = await preview(invite)

      const answers = [invalid, wrongSlug, rotated, deleted]
      for (const response of answers) {
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Session not found')
      }
      const bodies = await Promise.all(answers.map(response => response.text()))
      expect(new Set(bodies).size).toBe(1)
    })
  })

  describe('POST /api/invite/:invite', () => {
    it('requires sign-in', async () => {
      const { invite } = await createHostedSession()

      expect((await join(invite)).status).toBe(401)
    })

    it('makes a signed-in User a Member on the Bench and answers with the Session link', async () => {
      const { slug, invite } = await createHostedSession()
      const { cookie } = await signIn(testDb.db, guest)
      const guestId = await userId('Gast')

      const response = await join(invite, cookie)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slug, joined: true })
      expect((await memberships()).find(row => row.userId === guestId)).toMatchObject({ zone: 'bench' })
    })

    it('changes nothing when a Member joins a second time, keeping their zone', async () => {
      const { slug, invite } = await createHostedSession()
      const { cookie } = await signIn(testDb.db, guest)
      const guestId = await userId('Gast')
      await join(invite, cookie)
      await testDb.db.update(sessionMembers).set({ zone: 'stands' }).where(eq(sessionMembers.userId, guestId))

      const second = await join(invite, cookie)

      expect(second.status).toBe(200)
      expect(await second.json()).toEqual({ slug, joined: false })
      expect(await memberships()).toHaveLength(2)
      expect((await memberships()).find(row => row.userId === guestId)).toMatchObject({ zone: 'stands' })
    })

    it('lets the Member open the Session link afterwards', async () => {
      const { slug, invite } = await createHostedSession()
      const { cookie } = await signIn(testDb.db, guest)
      await join(invite, cookie)

      const response = await readLink(cookie, slug)

      expect(response.status).toBe(200)
      expect((await response.json()).session).toMatchObject({ slug, name: 'Freitags-Zocken', isHost: false })
    })

    it('answers the same 404 for a rotated link and keeps existing Members', async () => {
      const { slug, invite, hostCookie } = await createHostedSession()
      const { cookie: memberCookie } = await signIn(testDb.db, guest)
      await join(invite, memberCookie)
      await testDb.db.update(sessions).set({ inviteToken: 'Zz9Zz9Zz9Zz9' }).where(eq(sessions.slug, slug))
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      const rotated = await join(invite, newcomerCookie)

      expect(rotated.status).toBe(404)
      expect(rotated.statusText).toBe('Session not found')
      expect(await memberships()).toHaveLength(2)
      expect((await readLink(memberCookie, slug)).status).toBe(200)
      expect((await readLink(hostCookie, slug)).status).toBe(200)
    })

    it('answers the same 404 to a non-Member of a deleted Session, and 410 to its former Member', async () => {
      const { slug, invite } = await createHostedSession()
      const { cookie: memberCookie } = await signIn(testDb.db, guest)
      await join(invite, memberCookie)
      await testDb.db.update(sessions).set({ deletedAt: new Date() }).where(eq(sessions.slug, slug))
      const { cookie: stranger } = await signIn(testDb.db, newcomer)

      const nonMember = await join(invite, stranger)
      const former = await join(invite, memberCookie)

      expect(nonMember.status).toBe(404)
      expect(nonMember.statusText).toBe('Session not found')
      expect(former.status).toBe(410)
      expect(former.statusText).toBe('Session deleted')
    })

    it('answers 404 for a link with an unknown slug', async () => {
      const { cookie } = await signIn(testDb.db, guest)

      const response = await join('nie-gab-es-k7q2Zz9Zz9Zz', cookie)

      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Session not found')
    })
  })

  describe('GET /api/s/:slug for a deleted Session', () => {
    it('answers 410 to its former Member and 404 to a non-Member', async () => {
      const { slug, hostCookie } = await createHostedSession()
      await testDb.db.update(sessions).set({ deletedAt: new Date() }).where(eq(sessions.slug, slug))
      const { cookie: stranger } = await signIn(testDb.db, guest)

      const former = await readLink(hostCookie, slug)
      const nonMember = await readLink(stranger, slug)

      expect(former.status).toBe(410)
      expect(former.statusText).toBe('Session deleted')
      expect(nonMember.status).toBe(404)
      expect(nonMember.statusText).toBe('Session not found')
    })
  })
})
