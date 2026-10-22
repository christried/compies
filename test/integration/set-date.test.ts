import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getMe from '../../server/api/me.get'
import createSession from '../../server/api/s/index.post'
import confirmDate from '../../server/api/s/[slug]/confirm.post'
import downloadIcs from '../../server/api/s/[slug]/ics.get'
import putVote from '../../server/api/s/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Slots and Dates are in 2090 so the "in the future" rule holds without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '3', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('setting the Date and the .ics', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/me': getMe,
      'POST /api/s': createSession,
      'POST /api/s/:slug/confirm': confirmDate,
      'GET /api/s/:slug/ics': downloadIcs,
      'PUT /api/s/:slug/slots/:slotId/vote': putVote,
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

  async function signInAsHost() {
    setAllowlist({ hosts: 'discord:1' })
    return (await signIn(testDb.db, host)).cookie
  }

  async function userId(cookie: string) {
    const body = await (await request('/api/me', { headers: { cookie } })).json() as { user: { id: string } }
    return body.user.id
  }

  /** A poll Session by the Host with two Slots; returns its slug and the Slot ids in time order. */
  async function createPoll(cookie: string) {
    const response = await request('/api/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30', '2090-10-31T19:00'] }),
    })
    const { slug } = await response.json() as { slug: string }
    const [session] = await testDb.db.select().from(sessions).where(eq(sessions.slug, slug))
    const slots = await testDb.db.select().from(pollSlots).where(eq(pollSlots.sessionId, session!.id)).orderBy(pollSlots.startsAt)
    return { slug, sessionId: session!.id, slotIds: slots.map(slot => slot.id) }
  }

  async function addMember(sessionId: string, cookie: string) {
    await testDb.db.insert(sessionMembers).values({ sessionId, userId: await userId(cookie) })
  }

  function confirm(cookie: string | undefined, slug: string, body: unknown) {
    return request(`/api/s/${slug}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  function vote(cookie: string, slug: string, slotId: string, value: string) {
    return request(`/api/s/${slug}/slots/${slotId}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ value }),
    })
  }

  function ics(cookie: string | undefined, slug: string) {
    return request(`/api/s/${slug}/ics`, { headers: cookie ? { cookie } : {} })
  }

  async function sessionRow(sessionId: string) {
    const [row] = await testDb.db.select().from(sessions).where(eq(sessions.id, sessionId))
    return row!
  }

  describe('POST /api/s/:slug/confirm', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createPoll(cookie)

      expect((await confirm(undefined, slug, { startsAt: '2090-10-31T19:00' })).status).toBe(401)
    })

    it('moves a poll to date_set at the chosen Berlin time, stored in UTC, and clears the previous Date', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)
      await testDb.db.update(sessions).set({ previousStartsAt: new Date('2090-10-29T18:00:00.000Z') }).where(eq(sessions.id, sessionId))

      const response = await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ startsAt: '2090-10-31T18:00:00.000Z' })
      expect(await sessionRow(sessionId)).toMatchObject({
        phase: 'date_set',
        startsAt: new Date('2090-10-31T18:00:00.000Z'),
        previousStartsAt: null,
        icsSequence: 0,
      })
    })

    it('freezes the votes: a Vote after the Date is set is refused', async () => {
      const cookie = await signInAsHost()
      const { slug, slotIds } = await createPoll(cookie)
      await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })

      const response = await vote(cookie, slug, slotIds[0]!, 'yes')

      expect(response.status).toBe(409)
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })

    it('answers 403 for a Member who is not the Host and leaves the poll alone', async () => {
      const hostCookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(sessionId, cookie)

      const response = await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })

      expect(response.status).toBe(403)
      expect((await sessionRow(sessionId)).phase).toBe('poll')
    })

    it('answers 404 for a User who is not a Member', async () => {
      const hostCookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, outsider)

      const response = await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })

      expect(response.status).toBe(404)
      expect((await sessionRow(sessionId)).phase).toBe('poll')
    })

    it('refuses a time that is not in the future', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)

      const response = await confirm(cookie, slug, { startsAt: '2001-10-31T19:00' })

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ statusMessage: 'in_past' })
      expect((await sessionRow(sessionId)).phase).toBe('poll')
    })

    it('refuses text that is not a real Berlin time', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createPoll(cookie)

      expect((await confirm(cookie, slug, { startsAt: '2090-02-30T19:00' })).status).toBe(400)
      expect((await confirm(cookie, slug, {})).status).toBe(400)
    })

    it('refuses a second confirm once the Date is set', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)
      await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })

      const response = await confirm(cookie, slug, { startsAt: '2090-10-30T20:30' })

      expect(response.status).toBe(409)
      expect((await sessionRow(sessionId)).startsAt).toEqual(new Date('2090-10-31T18:00:00.000Z'))
    })
  })

  describe('GET /api/s/:slug/ics', () => {
    it('serves the Date to a Member as an .ics with a stable UID per Session', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)
      await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })

      const response = await ics(cookie, slug)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/calendar')
      expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${slug}.ics"`)
      const body = await response.text()
      expect(body).toContain(`UID:${sessionId}@compies`)
      expect(body).toContain('DTSTART:20901031T180000Z')
      expect(body).toContain('SEQUENCE:0')
      expect(body).toContain('TRIGGER:-PT1H')
      expect(body).toContain(`URL:http://localhost/s/${slug}`)
      expect(body).toContain('SUMMARY:Freitags-Zocken (COMPIES)')
    })

    it('follows icsSequence, keeping the same UID', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)
      await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })
      await testDb.db.update(sessions).set({ icsSequence: 2 }).where(eq(sessions.id, sessionId))

      const body = await (await ics(cookie, slug)).text()

      expect(body).toContain('SEQUENCE:2')
      expect(body).toContain(`UID:${sessionId}@compies`)
    })

    it('works for a direct Session from the moment it is created', async () => {
      const cookie = await signInAsHost()
      const created = await request('/api/s', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Abend', dateMode: 'direct', startsAt: '2090-11-07T20:00' }),
      })
      const { slug } = await created.json() as { slug: string }

      const response = await ics(cookie, slug)

      expect(response.status).toBe(200)
      expect(await response.text()).toContain('DTSTART:20901107T190000Z')
    })

    it('answers 404 while no Date is set', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createPoll(cookie)

      expect((await ics(cookie, slug)).status).toBe(404)
    })

    it('answers 404 for a User who is not a Member, and for a signed-out visitor with 401', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createPoll(cookie)
      await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })
      const { cookie: outsiderCookie } = await signIn(testDb.db, outsider)

      expect((await ics(outsiderCookie, slug)).status).toBe(404)
      expect((await ics(undefined, slug)).status).toBe(401)
    })

    it('is not visible to a former Member once the Session is deleted', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)
      await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })
      await testDb.db.update(sessions).set({ deletedAt: new Date() }).where(and(eq(sessions.id, sessionId)))

      expect((await ics(cookie, slug)).status).toBe(410)
    })
  })
})
