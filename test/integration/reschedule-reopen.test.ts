import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getMe from '../../server/api/me.get'
import createEvent from '../../server/api/e/index.post'
import getEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import downloadIcs from '../../server/api/e/[slug]/ics.get'
import reopenDate from '../../server/api/e/[slug]/reopen.post'
import rescheduleDate from '../../server/api/e/[slug]/reschedule.post'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../server/db/schema'
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
      'POST /api/e': createEvent,
      'GET /api/e/:slug': getEvent,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/reschedule': rescheduleDate,
      'POST /api/e/:slug/reopen': reopenDate,
      'GET /api/e/:slug/ics': downloadIcs,
      'PUT /api/e/:slug/slots/:slotId/vote': putVote,
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

  async function signInAsHost() {
    setAllowlist({ hosts: 'discord:1' })
    return (await signIn(testDb.db, host)).cookie
  }

  async function userId(cookie: string) {
    const body = await (await request('/api/me', { headers: { cookie } })).json() as { user: { id: string } }
    return body.user.id
  }

  /** A poll Event by the Host with two Slots; returns its slug, id and the Slot ids in time order. */
  async function createPoll(cookie: string) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30', '2090-10-31T19:00'] }),
    })
    const { slug } = await response.json() as { slug: string }
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const slots = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id)).orderBy(pollSlots.startsAt)
    return { slug, eventId: event!.id, slotIds: slots.map(slot => slot.id) }
  }

  /** A direct Event: the Date is set at creation, there are no Slots. */
  async function createDirect(cookie: string) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Abend', dateMode: 'direct', startsAt: ['2090-11-07T20:00'] }),
    })
    const { slug } = await response.json() as { slug: string }
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return { slug, eventId: event!.id }
  }

  async function addMember(eventId: string, cookie: string) {
    await testDb.db.insert(eventMembers).values({ eventId, userId: await userId(cookie) })
  }

  function post(path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method: 'POST',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  function confirm(cookie: string | undefined, slug: string, body: unknown) {
    return post(`/api/e/${slug}/confirm`, cookie, body)
  }

  function reschedule(cookie: string | undefined, slug: string, body: unknown) {
    return post(`/api/e/${slug}/reschedule`, cookie, body)
  }

  function reopen(cookie: string | undefined, slug: string) {
    return post(`/api/e/${slug}/reopen`, cookie)
  }

  function vote(cookie: string, slug: string, slotId: string, value: string) {
    return request(`/api/e/${slug}/slots/${slotId}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ value }),
    })
  }

  function view(cookie: string, slug: string) {
    return request(`/api/e/${slug}`, { headers: { cookie } })
  }

  function ics(cookie: string, slug: string) {
    return request(`/api/e/${slug}/ics`, { headers: { cookie } })
  }

  async function eventRow(eventId: string) {
    const [row] = await testDb.db.select().from(events).where(eq(events.id, eventId))
    return row!
  }

  /** The Event's one Session (#48), which carries the Date and the calendar sequence. */
  async function sessionOf(eventId: string) {
    const [row] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))
    return row!
  }

  /** An Event with its Date set from the second Slot, 31 Oct 2090, 19:00 Berlin (18:00 UTC). */
  async function setPoll(cookie: string) {
    const created = await createPoll(cookie)
    await confirm(cookie, created.slug, { slotId: created.slotIds[1] })
    return created
  }

  describe('POST /api/e/:slug/reschedule', () => {
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
      const { slug, eventId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(eventId, cookie)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(403)
      expect((await sessionOf(eventId)).startsAt).toEqual(new Date('2090-10-31T18:00:00.000Z'))
    })

    it('answers 409 while the Event is still a poll, without a set Date to move', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createPoll(cookie)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ statusMessage: 'wrong_phase' })
      expect((await eventRow(eventId)).phase).toBe('poll')
    })

    it('refuses a time that is not in the future and text that is not a Berlin time', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await setPoll(cookie)

      const past = await reschedule(cookie, slug, { startsAt: '2001-11-01T20:00' })
      expect(past.status).toBe(400)
      expect(await past.json()).toMatchObject({ statusMessage: 'in_past' })
      expect((await reschedule(cookie, slug, { startsAt: '2090-02-30T19:00' })).status).toBe(400)
      expect((await reschedule(cookie, slug, {})).status).toBe(400)
      expect((await sessionOf(eventId)).startsAt).toEqual(new Date('2090-10-31T18:00:00.000Z'))
    })

    it('moves the Date within date_set, stores UTC, clears the previous Date and counts the .ics sequence up', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await setPoll(cookie)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ startsAt: '2090-11-01T19:00:00.000Z' })
      expect(await eventRow(eventId)).toMatchObject({ phase: 'date_set' })
      expect(await sessionOf(eventId)).toMatchObject({
        startsAt: new Date('2090-11-01T19:00:00.000Z'),
        previousStartsAt: null,
        icsSequence: 1,
      })
    })

    it('can be repeated: each Reschedule counts the sequence up by one', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await setPoll(cookie)

      await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })
      await reschedule(cookie, slug, { startsAt: '2090-11-02T20:00' })

      expect(await eventRow(eventId)).toMatchObject({ phase: 'date_set' })
      expect(await sessionOf(eventId)).toMatchObject({ icsSequence: 2 })
    })

    it('keeps the same calendar UID and serves the higher SEQUENCE in the .ics', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await setPoll(cookie)
      const before = await (await ics(cookie, slug)).text()

      await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })
      const after = await (await ics(cookie, slug)).text()

      expect(before).toContain('SEQUENCE:0')
      expect(after).toContain('SEQUENCE:1')
      expect(after).toContain(`UID:${(await sessionOf(eventId)).id}@compies`)
      expect(after).toContain('DTSTART:20901101T190000Z')
    })
  })

  describe('POST /api/e/:slug/reopen', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug } = await setPoll(cookie)

      expect((await reopen(undefined, slug)).status).toBe(401)
    })

    it('answers 404 for a User who is not a Member', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, outsider)

      expect((await reopen(cookie, slug)).status).toBe(404)
      expect((await eventRow(eventId)).phase).toBe('date_set')
    })

    it('answers 403 for a Member who is not the Host and leaves the Date alone', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(eventId, cookie)

      expect((await reopen(cookie, slug)).status).toBe(403)
      expect((await eventRow(eventId)).phase).toBe('date_set')
    })

    it('answers 409 while the Event is still a poll', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createPoll(cookie)

      const response = await reopen(cookie, slug)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ statusMessage: 'wrong_phase' })
      expect((await eventRow(eventId)).phase).toBe('poll')
    })

    it('goes back to the poll, keeps the old Date as previousStartsAt and counts the sequence up', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await setPoll(cookie)

      const response = await reopen(cookie, slug)

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
      expect(await sessionOf(eventId)).toMatchObject({
        startsAt: null,
        slotId: null,
        previousStartsAt: new Date('2090-10-31T18:00:00.000Z'),
        icsSequence: 1,
      })
    })

    it('keeps the Slots and the Votes, and the Votes are editable again', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie)
      await vote(cookie, slug, slotIds[0]!, 'yes')
      await confirm(cookie, slug, { slotId: slotIds[1] })

      await reopen(cookie, slug)

      const slots = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId))
      expect(slots).toHaveLength(2)
      expect(await testDb.db.select().from(pollVotes)).toHaveLength(1)
      expect((await vote(cookie, slug, slotIds[1]!, 'maybe')).status).toBe(200)
      expect(await testDb.db.select().from(pollVotes)).toHaveLength(2)
    })

    it('shows every Member the notice: the view carries previousStartsAt and no current Date', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId } = await setPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(eventId, cookie)
      await reopen(hostCookie, slug)

      const body = await (await view(cookie, slug)).json() as { event: { phase: string }, sessions: { startsAt: string | null, previousStartsAt: string | null }[] }

      expect(body.event).toMatchObject({ phase: 'poll' })
      expect(body.sessions).toEqual([{ id: expect.any(String), number: null, startsAt: null, previousStartsAt: '2090-10-31T18:00:00.000Z' }])
    })

    it('makes a direct Event a poll with no Slots for the Host to fill', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie)

      const response = await reopen(cookie, slug)

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
      expect(await sessionOf(eventId)).toMatchObject({ startsAt: null })
      expect(await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId))).toEqual([])
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
      const { slug, eventId, slotIds } = await setPoll(cookie)
      await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })
      const beforeReopen = await (await ics(cookie, slug)).text()
      await reopen(cookie, slug)

      const response = await confirm(cookie, slug, { slotId: slotIds[1] })

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'date_set' })
      expect(await sessionOf(eventId)).toMatchObject({
        previousStartsAt: null,
        icsSequence: 2,
      })
      const afterConfirm = await (await ics(cookie, slug)).text()
      expect(beforeReopen).toContain('SEQUENCE:1')
      expect(afterConfirm).toContain('SEQUENCE:2')
      expect(afterConfirm).toContain(`UID:${(await sessionOf(eventId)).id}@compies`)
    })

    it('refuses a Reschedule once the Date is withdrawn', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await setPoll(cookie)
      await reopen(cookie, slug)

      const response = await reschedule(cookie, slug, { startsAt: '2090-11-01T20:00' })

      expect(response.status).toBe(409)
      expect((await eventRow(eventId)).phase).toBe('poll')
    })

    it('refuses a second Reopen', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await setPoll(cookie)
      await reopen(cookie, slug)

      expect((await reopen(cookie, slug)).status).toBe(409)
      expect(await sessionOf(eventId)).toMatchObject({ icsSequence: 1, previousStartsAt: new Date('2090-10-31T18:00:00.000Z') })
    })
  })
})
