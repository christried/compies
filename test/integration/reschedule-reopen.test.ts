import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getMe from '../../server/api/me.get'
import createSession from '../../server/api/s/index.post'
import getSession from '../../server/api/s/[slug].get'
import confirmDate from '../../server/api/s/[slug]/confirm.post'
import downloadIcs from '../../server/api/s/[slug]/ics.get'
import reopenDate from '../../server/api/s/[slug]/reopen.post'
import rescheduleDate from '../../server/api/s/[slug]/reschedule.post'
import putVote from '../../server/api/s/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Reschedule and Reopen (#14, #1 § Domain rules). Slots and Dates are in 2090 so the "in the future"
// rule holds without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '3', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('reschedule and reopen', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/me': getMe,
      'POST /api/s': createSession,
      'GET /api/s/:slug': getSession,
      'POST /api/s/:slug/confirm': confirmDate,
      'POST /api/s/:slug/reschedule': rescheduleDate,
      'POST /api/s/:slug/reopen': reopenDate,
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

  /** A poll Session by the Host with two Slots; returns its slug, id and the Slot ids in time order. */
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

  /** A direct Session: the Date is set at creation, there are no Slots. */
  async function createDirect(cookie: string) {
    const response = await request('/api/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Abend', dateMode: 'direct', startsAt: '2090-11-07T20:00' }),
    })
    const { slug } = await response.json() as { slug: string }
    const [session] = await testDb.db.select().from(sessions).where(eq(sessions.slug, slug))
    return { slug, sessionId: session!.id }
  }

  async function addMember(sessionId: string, cookie: string) {
    await testDb.db.insert(sessionMembers).values({ sessionId, userId: await userId(cookie) })
  }

  function post(path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method: 'POST',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  function confirm(cookie: string | undefined, slug: string, body: unknown) {
    return post(`/api/s/${slug}/confirm`, cookie, body)
  }

  function reschedule(cookie: string | undefined, slug: string, body: unknown) {
    return post(`/api/s/${slug}/reschedule`, cookie, body)
  }

  function reopen(cookie: string | undefined, slug: string) {
    return post(`/api/s/${slug}/reopen`, cookie)
  }

  function vote(cookie: string, slug: string, slotId: string, value: string) {
    return request(`/api/s/${slug}/slots/${slotId}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ value }),
    })
  }

  function view(cookie: string, slug: string) {
    return request(`/api/s/${slug}`, { headers: { cookie } })
  }

  function ics(cookie: string, slug: string) {
    return request(`/api/s/${slug}/ics`, { headers: { cookie } })
  }

  async function sessionRow(sessionId: string) {
    const [row] = await testDb.db.select().from(sessions).where(eq(sessions.id, sessionId))
    return row!
  }

  /** A Session with its Date set at 31 Oct 2090, 19:00 Berlin (18:00 UTC). */
  async function setPoll(cookie: string) {
    const created = await createPoll(cookie)
    await confirm(cookie, created.slug, { startsAt: '2090-10-31T19:00' })
    return created
  }

  describe('POST /api/s/:slug/reschedule', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug } = await setPoll(cookie)

      expect((await reschedule(undefined, slug, { startsAt: '2090-11-01T20:00' })).status).toBe(401)
    })

    it('answers 404 for a User who is not a Member', async () => {
      const hostCookie = await signInAsHost()
      const { slug } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, outsider)

      expect((await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })).status).toBe(404)
    })

    it('answers 403 for a Member who is not the Host and leaves the Date alone', async () => {
      const hostCookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(sessionId, cookie)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(403)
      expect((await sessionRow(sessionId)).startsAt).toEqual(new Date('2090-10-31T18:00:00.000Z'))
    })

    it('answers 409 while the Session is still a poll, without a set Date to move', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ statusMessage: 'wrong_phase' })
      expect((await sessionRow(sessionId)).phase).toBe('poll')
    })

    it('refuses a time that is not in the future and text that is not a Berlin time', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)

      const past = await reschedule(cookie, slug, { startsAt: '2001-11-01T20:00' })
      expect(past.status).toBe(400)
      expect(await past.json()).toMatchObject({ statusMessage: 'in_past' })
      expect((await reschedule(cookie, slug, { startsAt: '2090-02-30T19:00' })).status).toBe(400)
      expect((await reschedule(cookie, slug, {})).status).toBe(400)
      expect((await sessionRow(sessionId)).startsAt).toEqual(new Date('2090-10-31T18:00:00.000Z'))
    })

    it('moves the Date within date_set, stores UTC, clears the previous Date and counts the .ics sequence up', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ startsAt: '2090-11-01T19:00:00.000Z' })
      expect(await sessionRow(sessionId)).toMatchObject({
        phase: 'date_set',
        startsAt: new Date('2090-11-01T19:00:00.000Z'),
        previousStartsAt: null,
        icsSequence: 1,
      })
    })

    it('can be repeated: each Reschedule counts the sequence up by one', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)

      await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })
      await reschedule(cookie, slug, { startsAt: '2090-11-02T20:00' })

      expect(await sessionRow(sessionId)).toMatchObject({ phase: 'date_set', icsSequence: 2 })
    })

    it('keeps the same calendar UID and serves the higher SEQUENCE in the .ics', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)
      const before = await (await ics(cookie, slug)).text()

      await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })
      const after = await (await ics(cookie, slug)).text()

      expect(before).toContain('SEQUENCE:0')
      expect(after).toContain('SEQUENCE:1')
      expect(after).toContain(`UID:${sessionId}@compies`)
      expect(after).toContain('DTSTART:20901101T190000Z')
    })
  })

  describe('POST /api/s/:slug/reopen', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug } = await setPoll(cookie)

      expect((await reopen(undefined, slug)).status).toBe(401)
    })

    it('answers 404 for a User who is not a Member', async () => {
      const hostCookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, outsider)

      expect((await reopen(cookie, slug)).status).toBe(404)
      expect((await sessionRow(sessionId)).phase).toBe('date_set')
    })

    it('answers 403 for a Member who is not the Host and leaves the Date alone', async () => {
      const hostCookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(sessionId, cookie)

      expect((await reopen(cookie, slug)).status).toBe(403)
      expect((await sessionRow(sessionId)).phase).toBe('date_set')
    })

    it('answers 409 while the Session is still a poll', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createPoll(cookie)

      const response = await reopen(cookie, slug)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ statusMessage: 'wrong_phase' })
      expect((await sessionRow(sessionId)).phase).toBe('poll')
    })

    it('goes back to the poll, keeps the old Date as previousStartsAt and counts the sequence up', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)

      const response = await reopen(cookie, slug)

      expect(response.status).toBe(200)
      expect(await sessionRow(sessionId)).toMatchObject({
        phase: 'poll',
        dateMode: 'poll',
        startsAt: null,
        previousStartsAt: new Date('2090-10-31T18:00:00.000Z'),
        icsSequence: 1,
      })
    })

    it('keeps the Slots and the Votes, and the Votes are editable again', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId, slotIds } = await createPoll(cookie)
      await vote(cookie, slug, slotIds[0]!, 'yes')
      await confirm(cookie, slug, { startsAt: '2090-10-31T19:00' })

      await reopen(cookie, slug)

      const slots = await testDb.db.select().from(pollSlots).where(eq(pollSlots.sessionId, sessionId))
      expect(slots).toHaveLength(2)
      expect(await testDb.db.select().from(pollVotes)).toHaveLength(1)
      expect((await vote(cookie, slug, slotIds[1]!, 'maybe')).status).toBe(200)
      expect(await testDb.db.select().from(pollVotes)).toHaveLength(2)
    })

    it('shows every Member the notice: the view carries previousStartsAt and no current Date', async () => {
      const hostCookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(sessionId, cookie)
      await reopen(hostCookie, slug)

      const body = await (await view(cookie, slug)).json() as { session: { phase: string, startsAt: string | null, previousStartsAt: string | null } }

      expect(body.session).toMatchObject({
        phase: 'poll',
        startsAt: null,
        previousStartsAt: '2090-10-31T18:00:00.000Z',
      })
    })

    it('makes a direct Session a poll with no Slots for the Host to fill', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await createDirect(cookie)

      const response = await reopen(cookie, slug)

      expect(response.status).toBe(200)
      expect(await sessionRow(sessionId)).toMatchObject({ phase: 'poll', dateMode: 'poll', startsAt: null })
      expect(await testDb.db.select().from(pollSlots).where(eq(pollSlots.sessionId, sessionId))).toEqual([])
      const body = await (await view(cookie, slug)).json() as { slots: unknown[] }
      expect(body.slots).toEqual([])
    })

    it('answers 404 for the .ics once the Date is withdrawn', async () => {
      const cookie = await signInAsHost()
      const { slug } = await setPoll(cookie)
      await reopen(cookie, slug)

      expect((await ics(cookie, slug)).status).toBe(404)
    })

    it('lets a new Date be set afterwards: the notice clears and the .ics sequence goes higher than before', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)
      await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })
      const beforeReopen = await (await ics(cookie, slug)).text()
      await reopen(cookie, slug)

      const response = await confirm(cookie, slug, { startsAt: '2090-11-03T19:00' })

      expect(response.status).toBe(200)
      expect(await sessionRow(sessionId)).toMatchObject({
        phase: 'date_set',
        previousStartsAt: null,
        icsSequence: 2,
      })
      const afterConfirm = await (await ics(cookie, slug)).text()
      expect(beforeReopen).toContain('SEQUENCE:1')
      expect(afterConfirm).toContain('SEQUENCE:2')
      expect(afterConfirm).toContain(`UID:${sessionId}@compies`)
    })

    it('refuses a Reschedule once the Date is withdrawn', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)
      await reopen(cookie, slug)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(409)
      expect((await sessionRow(sessionId)).phase).toBe('poll')
    })

    it('refuses a second Reopen', async () => {
      const cookie = await signInAsHost()
      const { slug, sessionId } = await setPoll(cookie)
      await reopen(cookie, slug)

      expect((await reopen(cookie, slug)).status).toBe(409)
      expect(await sessionRow(sessionId)).toMatchObject({ icsSequence: 1, previousStartsAt: new Date('2090-10-31T18:00:00.000Z') })
    })
  })
})
