import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getMe from '../../server/api/me.get'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import downloadIcs from '../../server/api/e/[slug]/ics.get'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../server/db/schema'
import { createInterleavingDb, createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Slots and Dates are in 2090 so the "in the future" rule holds without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '3', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('setting the Dates from the shared Date poll', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/me': getMe,
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/e/:slug/confirm': confirmDate,
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

  /** A poll Event by the Host with `sessions` Sessions and two Slots by default; returns its slug and the Slot ids in time order. */
  async function createPoll(cookie: string, sessionCount = 1, slots = ['2090-10-30T20:30', '2090-10-31T19:00']) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: sessionCount, slots }),
    })
    const { slug } = await response.json() as { slug: string }
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const rows = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id)).orderBy(pollSlots.startsAt)
    return { slug, eventId: event!.id, slotIds: rows.map(slot => slot.id) }
  }

  async function addMember(eventId: string, cookie: string) {
    await testDb.db.insert(eventMembers).values({ eventId, userId: await userId(cookie) })
  }

  function confirm(cookie: string | undefined, slug: string, slotId: unknown) {
    return request(`/api/e/${slug}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ slotId }),
    })
  }

  function vote(cookie: string, slug: string, slotId: string, value: string) {
    return request(`/api/e/${slug}/slots/${slotId}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ value }),
    })
  }

  function ics(cookie: string | undefined, slug: string) {
    return request(`/api/e/${slug}/ics`, { headers: cookie ? { cookie } : {} })
  }

  function read(cookie: string, slug: string) {
    return request(`/api/e/${slug}`, { headers: { cookie } })
  }

  async function eventRow(eventId: string) {
    const [row] = await testDb.db.select().from(events).where(eq(events.id, eventId))
    return row!
  }

  /** The Sessions of an Event, in no particular order. */
  async function sessionsOf(eventId: string) {
    return testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))
  }

  /** The one Session of an Event with one Session. */
  async function sessionOf(eventId: string) {
    const [row] = await sessionsOf(eventId)
    return row!
  }

  describe('POST /api/e/:slug/confirm', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug, slotIds } = await createPoll(cookie)

      expect((await confirm(undefined, slug, slotIds[1])).status).toBe(401)
    })

    it('moves a one-Session poll to date_set at the Slot time, stored in UTC, and clears the previous Date', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie)
      await testDb.db.update(sessions).set({ previousStartsAt: new Date('2090-10-29T18:00:00.000Z') }).where(eq(sessions.eventId, eventId))

      const response = await confirm(cookie, slug, slotIds[1])

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ startsAt: '2090-10-31T18:00:00.000Z' })
      expect(await eventRow(eventId)).toMatchObject({ phase: 'date_set' })
      expect(await sessionOf(eventId)).toMatchObject({
        startsAt: new Date('2090-10-31T18:00:00.000Z'),
        previousStartsAt: null,
        icsSequence: 1,
        slotId: slotIds[1],
      })
    })

    it('sets one Date after the other from the shared poll, and keeps the poll open until every Session has one', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie, 2)

      expect((await confirm(cookie, slug, slotIds[1])).status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
      expect((await sessionsOf(eventId)).filter(row => row.startsAt === null)).toHaveLength(1)

      expect((await confirm(cookie, slug, slotIds[0])).status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'date_set' })
      const rows = await sessionsOf(eventId)
      expect(rows.map(row => row.slotId).sort()).toEqual([...slotIds].sort())
      expect(rows.every(row => row.startsAt !== null)).toBe(true)
    })

    it('raises the calendar sequence of a Session whose number moves when an earlier Date is set after it', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie, 2)
      const sessionWithSlot = async (slotId: string) => (await sessionsOf(eventId)).find(row => row.slotId === slotId)!

      // The first Date goes to the first Session (number 1); the second Date is earlier, so that Session becomes number 1.
      expect((await confirm(cookie, slug, slotIds[1])).status).toBe(200)
      const sequenceBefore = (await sessionWithSlot(slotIds[1]!)).icsSequence

      expect((await confirm(cookie, slug, slotIds[0])).status).toBe(200)

      expect((await sessionWithSlot(slotIds[1]!)).icsSequence).toBeGreaterThan(sequenceBefore)
    })

    it('rejects a Slot that already became a Date, with 409 slot_taken, and leaves the poll as it was', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie, 2)
      await confirm(cookie, slug, slotIds[0])

      const response = await confirm(cookie, slug, slotIds[0])

      expect(response.status).toBe(409)
      expect((await response.json()).statusMessage).toBe('slot_taken')
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
      expect((await sessionsOf(eventId)).filter(row => row.startsAt !== null)).toHaveLength(1)
    })

    it('rejects a Slot in the past, with 400 in_past', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie)
      await testDb.db.update(pollSlots).set({ startsAt: new Date('2001-10-31T18:00:00.000Z') }).where(eq(pollSlots.id, slotIds[1]!))

      const response = await confirm(cookie, slug, slotIds[1])

      expect(response.status).toBe(400)
      expect((await response.json()).statusMessage).toBe('in_past')
      expect((await eventRow(eventId)).phase).toBe('poll')
    })

    it('refuses a Slot once no Session is left without a Date, with 409 wrong_phase', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie)
      await confirm(cookie, slug, slotIds[1])

      const response = await confirm(cookie, slug, slotIds[0])

      expect(response.status).toBe(409)
      expect((await response.json()).statusMessage).toBe('wrong_phase')
      expect((await sessionOf(eventId)).slotId).toBe(slotIds[1])
    })

    it('answers 404 for a Slot of another Event and for text that is no Slot id', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createPoll(cookie)
      const other = await createPoll(cookie, 1, ['2090-12-30T20:30'])

      expect((await confirm(cookie, slug, other.slotIds[0])).status).toBe(404)
      expect((await confirm(cookie, slug, 'not-a-slot')).status).toBe(404)
      expect((await confirm(cookie, slug, undefined)).status).toBe(404)
      expect((await eventRow(eventId)).phase).toBe('poll')
    })

    it('freezes the Votes: a Vote after the Date is set is refused', async () => {
      const cookie = await signInAsHost()
      const { slug, slotIds } = await createPoll(cookie)
      await confirm(cookie, slug, slotIds[1])

      const response = await vote(cookie, slug, slotIds[0]!, 'yes')

      expect(response.status).toBe(409)
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })

    it('refuses a Vote on a Slot that became a Date while the Event is still in the poll, with 409 slot_taken', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2)
      const { cookie: guestCookie } = await signIn(testDb.db, guest)
      await addMember(eventId, guestCookie)
      await confirm(hostCookie, slug, slotIds[0])

      const taken = await vote(guestCookie, slug, slotIds[0]!, 'yes')
      const open = await vote(guestCookie, slug, slotIds[1]!, 'yes')

      expect(taken.status).toBe(409)
      expect((await taken.json()).statusMessage).toBe('slot_taken')
      expect(open.status).toBe(200)
      expect(await testDb.db.select().from(pollVotes)).toEqual([expect.objectContaining({ slotId: slotIds[1] })])
    })

    it('lets no Vote land after the Date is set, even one that races the confirm', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie)
      const { cookie: guestCookie } = await signIn(testDb.db, guest)
      await addMember(eventId, guestCookie)
      // The Host sets the Date just as the Guest's Vote is about to be written.
      let votesWhenSet: unknown[] | undefined
      const racingDb = createInterleavingDb(testDb.client, /insert into "poll_votes"/i, async () => {
        expect((await confirm(hostCookie, slug, slotIds[1])).status).toBe(200)
        votesWhenSet = await testDb.db.select().from(pollVotes)
      })
      const racingRequest = createTestServer(racingDb, { 'PUT /api/e/:slug/slots/:slotId/vote': putVote })

      const voted = await racingRequest(`/api/e/${slug}/slots/${slotIds[0]}/vote`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': guestCookie },
        body: JSON.stringify({ value: 'yes' }),
      })
      await vi.waitFor(() => expect(votesWhenSet).toBeDefined())

      expect([200, 409]).toContain(voted.status)
      expect(await testDb.db.select().from(pollVotes)).toEqual(votesWhenSet)
    })

    it('never gives one Slot to two Sessions when two confirms race', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2)
      let competitor: number | undefined
      // A second confirm for the same Slot starts just as the first one is about to write its Session.
      const racingDb = createInterleavingDb(testDb.client, /update "sessions"/i, async () => {
        competitor = (await confirm(hostCookie, slug, slotIds[0])).status
      })
      const racingRequest = createTestServer(racingDb, { 'POST /api/e/:slug/confirm': confirmDate })

      const first = await racingRequest(`/api/e/${slug}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ slotId: slotIds[0] }),
      })
      await vi.waitFor(() => expect(competitor).toBeDefined())

      expect(first.status).toBe(200)
      expect(competitor).toBe(409)
      const rows = await sessionsOf(eventId)
      expect(rows.filter(row => row.slotId === slotIds[0])).toHaveLength(1)
      expect(rows.filter(row => row.startsAt === null)).toHaveLength(1)
    })

    it('answers 403 for a Member who is not the Host and leaves the poll alone', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, guest)
      await addMember(eventId, cookie)

      const response = await confirm(cookie, slug, slotIds[1])

      expect(response.status).toBe(403)
      expect((await eventRow(eventId)).phase).toBe('poll')
    })

    it('answers 404 for a User who is not a Member', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie)
      const { cookie } = await signIn(testDb.db, outsider)

      const response = await confirm(cookie, slug, slotIds[1])

      expect(response.status).toBe(404)
      expect((await eventRow(eventId)).phase).toBe('poll')
    })
  })

  describe('GET /api/e/:slug while Dates are set one by one', () => {
    it('lists only the open Slots and the Votes on them, and leaves out the Slot that became a Date', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2)
      await testDb.db.insert(pollVotes).values({ slotId: slotIds[0]!, userId: await userId(hostCookie), value: 'yes' })
      await confirm(hostCookie, slug, slotIds[0])

      const view = await (await read(hostCookie, slug)).json()

      expect(view.slots.map((slot: { id: string }) => slot.id)).toEqual([slotIds[1]])
      expect(view.votes).toEqual([])
      expect(view.missingDates).toBe(1)
      expect(view.sessions.filter((session: { startsAt: string | null }) => session.startsAt)).toHaveLength(1)
      expect(eventId).toBeDefined()
    })

    it('counts the Best slot and the progress on open future Slots only', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2)
      const { cookie: guestCookie } = await signIn(testDb.db, guest)
      await addMember(eventId, guestCookie)
      const hostId = await userId(hostCookie)
      // Before the first Date: the Slot that becomes the Date is the best one.
      await testDb.db.insert(pollVotes).values([
        { slotId: slotIds[0]!, userId: hostId, value: 'yes' },
        { slotId: slotIds[0]!, userId: await userId(guestCookie), value: 'yes' },
      ])
      await confirm(hostCookie, slug, slotIds[0])
      await vote(guestCookie, slug, slotIds[1]!, 'maybe')

      const view = await (await read(hostCookie, slug)).json()

      expect(view.bestSlotId).toBe(slotIds[1])
      // The Host has no Vote on the one open Slot, the Guest has: one of two Members has voted.
      expect(view.progress).toEqual({ voted: 1, total: 2 })
    })
  })

  describe('GET /api/e/:slug/ics', () => {
    it('serves the Date to a Member as an .ics with a stable UID per Session', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie)
      await confirm(cookie, slug, slotIds[1])
      const session = await sessionOf(eventId)

      const response = await ics(cookie, slug)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/calendar')
      expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${slug}.ics"`)
      const body = await response.text()
      expect(body).toContain(`UID:${session.id}@compies`)
      expect(body).toContain('DTSTART:20901031T180000Z')
      expect(body).toContain('SEQUENCE:1')
      expect(body).toContain('TRIGGER:-PT1H')
      expect(body).toContain(`URL:http://localhost/e/${slug}`)
      expect(body).toContain('SUMMARY:Freitags-Zocken (Compies)')
    })

    it('follows icsSequence, keeping the same UID', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie)
      await confirm(cookie, slug, slotIds[1])
      await testDb.db.update(sessions).set({ icsSequence: 2 }).where(eq(sessions.eventId, eventId))

      const body = await (await ics(cookie, slug)).text()

      expect(body).toContain('SEQUENCE:2')
      expect(body).toContain(`UID:${(await sessionOf(eventId)).id}@compies`)
    })

    it('works for a direct Event from the moment it is created', async () => {
      const cookie = await signInAsHost()
      const created = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Abend', dateMode: 'direct', startsAt: ['2090-11-07T20:00'] }),
      })
      const { slug } = await created.json() as { slug: string }

      const response = await ics(cookie, slug)

      expect(response.status).toBe(200)
      expect(await response.text()).toContain('DTSTART:20901107T190000Z')
    })

    it('keeps the Event name as typed, even with $ patterns in it', async () => {
      const cookie = await signInAsHost()
      const created = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Pay $& $\' $$ night', dateMode: 'direct', startsAt: ['2090-11-07T20:00'] }),
      })
      const { slug } = await created.json() as { slug: string }

      const body = await (await ics(cookie, slug)).text()

      expect(body).toContain('SUMMARY:Pay $& $\' $$ night (Compies)')
    })

    it('answers 404 while no Date is set', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createPoll(cookie)

      expect((await ics(cookie, slug)).status).toBe(404)
    })

    it('answers 404 for a User who is not a Member, and for a signed-out visitor with 401', async () => {
      const cookie = await signInAsHost()
      const { slug, slotIds } = await createPoll(cookie)
      await confirm(cookie, slug, slotIds[1])
      const { cookie: outsiderCookie } = await signIn(testDb.db, outsider)

      expect((await ics(outsiderCookie, slug)).status).toBe(404)
      expect((await ics(undefined, slug)).status).toBe(401)
    })

    it('is not visible to a former Member once the Event is deleted', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie)
      await confirm(cookie, slug, slotIds[1])
      await testDb.db.update(events).set({ deletedAt: new Date() }).where(and(eq(events.id, eventId)))

      expect((await ics(cookie, slug)).status).toBe(410)
    })
  })
})
