import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import previewInvite from '../../server/api/invite/[invite].get'
import joinInvite from '../../server/api/invite/[invite].post'
import { pollSlots, pollVotes, eventMembers, events, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Invite link and the Event link (ADR 0006). Invalid, rotated, deleted and non-Member links
// all get the same 404 "Event not found", so nobody can probe which Events exist. Only a former
// Member of a deleted Event gets 410 "Event deleted".
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: 'https://img.example/host.png' } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const newcomer = { provider: 'twitch', id: '3', name: 'Neu', email: 'neu@example.com', image: undefined } as const

describe('invite links', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
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

  /** Creates an Event as the Host and returns its Event link slug and Invite link path (`<slug>-<token>`). */
  async function createHostedEvent(): Promise<{ slug: string, invite: string, hostCookie: string }> {
    setAllowlist({ hosts: 'discord:1' })
    const { cookie: hostCookie } = await signIn(testDb.db, host)
    await testDb.db.update(users).set({ displayName: 'Sanne' })
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30', '2090-10-31T19:00'] }),
    })
    const { slug, inviteUrl } = await response.json()
    return { slug, invite: new URL(inviteUrl).pathname.slice('/e/'.length), hostCookie }
  }

  function preview(invite: string) {
    return request(`/api/invite/${invite}`)
  }

  function join(invite: string, cookie?: string) {
    return request(`/api/invite/${invite}`, { method: 'POST', headers: cookie ? { cookie } : {} })
  }

  function readLink(cookie: string, slug: string) {
    return request(`/api/e/${slug}`, { headers: { cookie } })
  }

  async function memberships() {
    return testDb.db.select().from(eventMembers)
  }

  async function userId(name: string) {
    const [user] = await testDb.db.select({ id: users.id }).from(users).where(eq(users.name, name))
    return user!.id
  }

  describe('GET /api/invite/:invite', () => {
    it('shows only the Event name and the Host\'s Display name and avatar to a signed-out visitor', async () => {
      const { invite } = await createHostedEvent()

      const response = await preview(invite)

      expect(response.status).toBe(200)
      const [hostRow] = await testDb.db.select().from(users)
      expect(await response.json()).toEqual({
        eventName: 'Freitags-Zocken',
        host: { name: 'Sanne', image: hostRow!.image },
      })
      expect(hostRow!.image).toEqual(expect.any(String))
    })

    it('leaks no Slot, Vote or Member data', async () => {
      const { invite } = await createHostedEvent()

      const text = await (await preview(invite)).text()

      expect(text).not.toMatch(/slot|vote|member|startsAt|userId|zone|isHost|count/i)
    })

    it('answers the same 404 for an invalid, rotated or deleted link', async () => {
      const { slug, invite } = await createHostedEvent()
      const token = invite.slice(slug.length + 1)

      const invalid = await preview(`${slug}-AAAAAAAAAAAA`)
      const wrongSlug = await preview(`nie-gab-es-${token}`)
      await testDb.db.update(events).set({ inviteToken: 'Zz9Zz9Zz9Zz9' }).where(eq(events.slug, slug))
      const rotated = await preview(invite)
      await testDb.db.update(events).set({ inviteToken: token, deletedAt: new Date() }).where(eq(events.slug, slug))
      const deleted = await preview(invite)

      const answers = [invalid, wrongSlug, rotated, deleted]
      for (const response of answers) {
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Event not found')
      }
      const bodies = await Promise.all(answers.map(response => response.text()))
      expect(new Set(bodies).size).toBe(1)
    })
  })

  describe('POST /api/invite/:invite', () => {
    it('requires sign-in', async () => {
      const { invite } = await createHostedEvent()

      expect((await join(invite)).status).toBe(401)
    })

    it('makes a signed-in User a Member on the Bench and answers with the Event link', async () => {
      const { slug, invite } = await createHostedEvent()
      const { cookie } = await signIn(testDb.db, guest)
      const guestId = await userId('Gast')

      const response = await join(invite, cookie)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slug, joined: true })
      expect((await memberships()).find(row => row.userId === guestId)).toMatchObject({ zone: 'bench' })
    })

    it('changes nothing when a Member joins a second time, keeping their zone', async () => {
      const { slug, invite } = await createHostedEvent()
      const { cookie } = await signIn(testDb.db, guest)
      const guestId = await userId('Gast')
      await join(invite, cookie)
      await testDb.db.update(eventMembers).set({ zone: 'stands' }).where(eq(eventMembers.userId, guestId))

      const second = await join(invite, cookie)

      expect(second.status).toBe(200)
      expect(await second.json()).toEqual({ slug, joined: false })
      expect(await memberships()).toHaveLength(2)
      expect((await memberships()).find(row => row.userId === guestId)).toMatchObject({ zone: 'stands' })
    })

    it('lets the Member open the Event link afterwards', async () => {
      const { slug, invite } = await createHostedEvent()
      const { cookie } = await signIn(testDb.db, guest)
      await join(invite, cookie)

      const response = await readLink(cookie, slug)

      expect(response.status).toBe(200)
      expect((await response.json()).event).toMatchObject({ slug, name: 'Freitags-Zocken', isHost: false })
    })

    it('answers the same 404 for a rotated link and keeps existing Members', async () => {
      const { slug, invite, hostCookie } = await createHostedEvent()
      const { cookie: memberCookie } = await signIn(testDb.db, guest)
      await join(invite, memberCookie)
      await testDb.db.update(events).set({ inviteToken: 'Zz9Zz9Zz9Zz9' }).where(eq(events.slug, slug))
      const { cookie: newcomerCookie } = await signIn(testDb.db, newcomer)

      const rotated = await join(invite, newcomerCookie)

      expect(rotated.status).toBe(404)
      expect(rotated.statusText).toBe('Event not found')
      expect(await memberships()).toHaveLength(2)
      expect((await readLink(memberCookie, slug)).status).toBe(200)
      expect((await readLink(hostCookie, slug)).status).toBe(200)
    })

    it('answers the same 404 to a non-Member of a deleted Event, and 410 to its former Member', async () => {
      const { slug, invite } = await createHostedEvent()
      const { cookie: memberCookie } = await signIn(testDb.db, guest)
      await join(invite, memberCookie)
      await testDb.db.update(events).set({ deletedAt: new Date() }).where(eq(events.slug, slug))
      const { cookie: stranger } = await signIn(testDb.db, newcomer)

      const nonMember = await join(invite, stranger)
      const former = await join(invite, memberCookie)

      expect(nonMember.status).toBe(404)
      expect(nonMember.statusText).toBe('Event not found')
      expect(former.status).toBe(410)
      expect(former.statusText).toBe('Event deleted')
    })

    it('answers 404 for a link with an unknown slug', async () => {
      const { cookie } = await signIn(testDb.db, guest)

      const response = await join('nie-gab-es-k7q2Zz9Zz9Zz', cookie)

      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Event not found')
    })
  })

  describe('GET /api/e/:slug for a deleted Event', () => {
    it('answers 410 to its former Member and 404 to a non-Member', async () => {
      const { slug, hostCookie } = await createHostedEvent()
      await testDb.db.update(events).set({ deletedAt: new Date() }).where(eq(events.slug, slug))
      const { cookie: stranger } = await signIn(testDb.db, guest)

      const former = await readLink(hostCookie, slug)
      const nonMember = await readLink(stranger, slug)

      expect(former.status).toBe(410)
      expect(former.statusText).toBe('Event deleted')
      expect(nonMember.status).toBe(404)
      expect(nonMember.statusText).toBe('Event not found')
    })
  })
})
