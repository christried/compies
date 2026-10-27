import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getMe from '../../server/api/me.get'
import listHome from '../../server/api/e/index.get'
import createEvent from '../../server/api/e/index.post'
import getEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import downloadIcs from '../../server/api/e/[slug]/ics.get'
import addSession from '../../server/api/e/[slug]/sessions/index.post'
import removeSession from '../../server/api/e/[slug]/sessions/[id].delete'
import reopenSession from '../../server/api/e/[slug]/sessions/[id]/reopen.post'
import rescheduleSession from '../../server/api/e/[slug]/sessions/[id]/reschedule.post'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import { eventMembers, events, pollSlots, pollVotes, sessions, users } from '../../server/db/schema'
import { createInterleavingDb, createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Managing each Session (#55, ADR 0011): add, remove and Reopen one Session, with the Phase, the Slots and
// the calendar sequences that follow. Dates and Slots are in 2090 so "in the future" holds without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '3', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('managing each Session', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/me': getMe,
      'GET /api/e': listHome,
      'POST /api/e': createEvent,
      'GET /api/e/:slug': getEvent,
      'POST /api/e/:slug/confirm': confirmDate,
      'GET /api/e/:slug/ics': downloadIcs,
      'POST /api/e/:slug/sessions': addSession,
      'DELETE /api/e/:slug/sessions/:id': removeSession,
      'POST /api/e/:slug/sessions/:id/reopen': reopenSession,
      'POST /api/e/:slug/sessions/:id/reschedule': rescheduleSession,
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

  async function addMember(eventId: string, cookie: string) {
    await testDb.db.insert(eventMembers).values({ eventId, userId: await userId(cookie) })
  }

  /** A poll Event with `slotCount` Slots and `sessionCount` Sessions, all undated. */
  async function createPoll(cookie: string, slotCount: number, sessionCount = 1) {
    const slots = ['2090-10-30T20:30', '2090-10-31T19:00', '2090-11-01T19:00', '2090-11-02T19:00'].slice(0, slotCount)
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: sessionCount, slots }),
    })
    const { slug } = await response.json() as { slug: string }
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const slotRows = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id)).orderBy(pollSlots.startsAt)
    return { slug, eventId: event!.id, slotIds: slotRows.map(row => row.id) }
  }

  /** A direct Event with one dated Session per Date, in the order given. */
  async function createDirect(cookie: string, dates: string[]) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Mehrere Abende', dateMode: 'direct', sessions: dates.length, startsAt: dates }),
    })
    const { slug } = await response.json() as { slug: string }
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return { slug, eventId: event!.id }
  }

  function send(method: 'POST' | 'DELETE', path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  function add(cookie: string | undefined, slug: string, body: unknown = {}) {
    return send('POST', `/api/e/${slug}/sessions`, cookie, body)
  }

  function remove(cookie: string | undefined, slug: string, sessionId: string) {
    return send('DELETE', `/api/e/${slug}/sessions/${sessionId}`, cookie)
  }

  function reopen(cookie: string | undefined, slug: string, sessionId: string) {
    return send('POST', `/api/e/${slug}/sessions/${sessionId}/reopen`, cookie)
  }

  function confirm(cookie: string | undefined, slug: string, slotId: string) {
    return send('POST', `/api/e/${slug}/confirm`, cookie, { slotId })
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

  function home(cookie: string) {
    return request('/api/e', { headers: { cookie } })
  }

  async function eventRow(eventId: string) {
    const [row] = await testDb.db.select().from(events).where(eq(events.id, eventId))
    return row!
  }

  /** The Sessions of an Event, earliest Date first (undated last). A removed Session is not one of them (#65). */
  async function sessionRowsOf(eventId: string) {
    return testDb.db.select().from(sessions).where(and(eq(sessions.eventId, eventId), isNull(sessions.removedAt))).orderBy(sessions.startsAt)
  }

  describe('POST /api/e/:slug/sessions (add)', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createDirect(cookie, ['2090-11-07T20:00'])

      expect((await add(undefined, slug)).status).toBe(401)
    })

    it('answers 404 for a User who is not a Member', async () => {
      const hostCookie = await signInAsHost()
      const { slug } = await createDirect(hostCookie, ['2090-11-07T20:00'])
      const { cookie } = await signIn(testDb.db, outsider)

      expect((await add(cookie, slug)).status).toBe(404)
    })

    it('answers 403 for a Member who is not the Host and adds nothing', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId } = await createDirect(hostCookie, ['2090-11-07T20:00'])
      const { cookie } = await signIn(testDb.db, member)
      await addMember(eventId, cookie)

      expect((await add(cookie, slug, { startsAt: '2090-11-08T20:00' })).status).toBe(403)
      expect(await sessionRowsOf(eventId)).toHaveLength(1)
    })

    it('adds an undated Session: the Event goes back to the date poll, and the dated Session keeps its Date and gets a higher sequence, since its title now names its number (#67)', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00'])

      const response = await add(cookie, slug, {})

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
      const rows = await sessionRowsOf(eventId)
      expect(rows.map(row => row.startsAt)).toEqual([new Date('2090-11-07T19:00:00.000Z'), null])
      expect(rows[0]).toMatchObject({ icsSequence: 1 })
    })

    it('adds a dated Session: the Date is stored in UTC, the Event stays set, and the Sessions whose number changes get a higher sequence', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00', '2090-11-09T20:00'])

      // 8 Nov sits between the two, so the 9 Nov Session becomes number 3 and its entry must be re-sent.
      const response = await add(cookie, slug, { startsAt: '2090-11-08T20:00' })

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'date_set' })
      const rows = await sessionRowsOf(eventId)
      expect(rows.map(row => [row.startsAt, row.icsSequence])).toEqual([
        [new Date('2090-11-07T19:00:00.000Z'), 0],
        [new Date('2090-11-08T19:00:00.000Z'), 0],
        [new Date('2090-11-09T19:00:00.000Z'), 1],
      ])
    })

    it('gives a Session the Slot whose time it takes, so that Slot leaves the poll', async () => {
      const cookie = await signInAsHost()
      const { slug, slotIds } = await createPoll(cookie, 2)

      const response = await add(cookie, slug, { startsAt: '2090-10-31T19:00' })

      expect(response.status).toBe(200)
      const body = await (await view(cookie, slug)).json() as { slots: { id: string }[] }
      expect(body.slots.map(slot => slot.id)).toEqual([slotIds[0]])
    })

    it('refuses a Date another Session has, a past time and text that is not a Berlin time', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00'])

      const duplicate = await add(cookie, slug, { startsAt: '2090-11-07T20:00' })
      expect(duplicate.status).toBe(400)
      expect(await duplicate.json()).toMatchObject({ statusMessage: 'duplicate_date' })
      expect(await (await add(cookie, slug, { startsAt: '2001-11-07T20:00' })).json()).toMatchObject({ statusMessage: 'in_past' })
      expect(await (await add(cookie, slug, { startsAt: '2090-02-30T19:00' })).json()).toMatchObject({ statusMessage: 'invalid_time' })
      expect(await sessionRowsOf(eventId)).toHaveLength(1)
    })

    it('adds an undated Session to a running Event, which stays running (Sessions change until the Event finishes)', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createPoll(cookie, 2)
      await testDb.db.update(events).set({ phase: 'running' }).where(eq(events.id, eventId))

      const response = await add(cookie, slug)

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'running' })
      expect(await sessionRowsOf(eventId)).toHaveLength(2)
    })

    it('refuses a ninth Session with 400 sessions_max', async () => {
      const cookie = await signInAsHost()
      const dates = Array.from({ length: 8 }, (_, index) => `2090-11-0${index + 1}T20:00`)
      const { slug, eventId } = await createDirect(cookie, dates)

      const response = await add(cookie, slug, {})

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ statusMessage: 'sessions_max' })
      expect(await sessionRowsOf(eventId)).toHaveLength(8)
    })
  })

  describe('DELETE /api/e/:slug/sessions/:id (remove)', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createPoll(cookie, 2, 2)

      expect((await remove(undefined, slug, 'x')).status).toBe(401)
    })

    it('answers 403 for a Member who is not the Host and removes nothing', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId } = await createPoll(hostCookie, 2, 2)
      const { cookie } = await signIn(testDb.db, member)
      await addMember(eventId, cookie)
      const [first] = await sessionRowsOf(eventId)

      expect((await remove(cookie, slug, first!.id)).status).toBe(403)
      expect(await sessionRowsOf(eventId)).toHaveLength(2)
    })

    it('answers 404 for a Session id the Event does not hold, including one of another Event', async () => {
      const cookie = await signInAsHost()
      const { slug } = await createPoll(cookie, 2, 2)
      const other = await createPoll(cookie, 1, 1)
      const [otherSession] = await sessionRowsOf(other.eventId)

      expect((await remove(cookie, slug, otherSession!.id)).status).toBe(404)
    })

    it('removes one undated Session with one request and leaves the Event in the poll while Dates are missing', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createPoll(cookie, 2, 2)
      const [undated] = await sessionRowsOf(eventId)

      const response = await remove(cookie, slug, undated!.id)

      expect(response.status).toBe(200)
      expect(await sessionRowsOf(eventId)).toHaveLength(1)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
    })

    it('removes a dated Session: its Slot goes back to the poll with its Votes, and the Event follows the Dates left', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2, 2)
      const { cookie } = await signIn(testDb.db, member)
      await addMember(eventId, cookie)
      await vote(cookie, slug, slotIds[0]!, 'yes')
      await confirm(hostCookie, slug, slotIds[0]!)
      const [dated] = (await sessionRowsOf(eventId)).filter(row => row.startsAt !== null)

      const response = await remove(hostCookie, slug, dated!.id)

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
      const body = await (await view(hostCookie, slug)).json() as { slots: { id: string }[], votes: { slotId: string }[] }
      expect(body.slots.map(slot => slot.id)).toEqual(slotIds)
      expect(body.votes).toEqual([expect.objectContaining({ slotId: slotIds[0] })])
    })

    it('moves the Event to date set when the Sessions left all have their Dates', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie, 2, 2)
      await confirm(cookie, slug, slotIds[0]!)
      const undated = (await sessionRowsOf(eventId)).find(row => row.startsAt === null)

      await remove(cookie, slug, undated!.id)

      expect(await eventRow(eventId)).toMatchObject({ phase: 'date_set' })
    })

    it('refuses to remove the last Session with 409 last_session and changes nothing', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00'])
      const [only] = await sessionRowsOf(eventId)

      const response = await remove(cookie, slug, only!.id)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ statusMessage: 'last_session' })
      expect(await sessionRowsOf(eventId)).toHaveLength(1)
    })

    it('raises the sequence of the Session left alone, since its title no longer names its number (#67)', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00', '2090-11-08T20:00'])
      const [first, second] = await sessionRowsOf(eventId)

      await remove(cookie, slug, second!.id)

      const left = (await sessionRowsOf(eventId)).find(row => row.id === first!.id)
      expect(left).toMatchObject({ startsAt: new Date('2090-11-07T19:00:00.000Z'), icsSequence: 1 })
    })

    it('raises the sequence of the later Sessions whose number changes', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00', '2090-11-08T20:00', '2090-11-09T20:00'])
      const [first] = await sessionRowsOf(eventId)

      await remove(cookie, slug, first!.id)

      const rows = await sessionRowsOf(eventId)
      expect(rows.map(row => [row.startsAt, row.icsSequence])).toEqual([
        [new Date('2090-11-08T19:00:00.000Z'), 1],
        [new Date('2090-11-09T19:00:00.000Z'), 1],
      ])
    })
  })

  describe('POST /api/e/:slug/sessions/:id/reopen (one Session)', () => {
    it('requires sign-in', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie, 2)
      await confirm(cookie, slug, slotIds[1]!)
      const [session] = await sessionRowsOf(eventId)

      expect((await reopen(undefined, slug, session!.id)).status).toBe(401)
    })

    it('answers 403 for a Member who is not the Host and leaves the Date alone', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2)
      await confirm(hostCookie, slug, slotIds[1]!)
      const { cookie } = await signIn(testDb.db, member)
      await addMember(eventId, cookie)
      const [session] = await sessionRowsOf(eventId)

      expect((await reopen(cookie, slug, session!.id)).status).toBe(403)
      expect((await sessionRowsOf(eventId))[0]!.startsAt).not.toBeNull()
    })

    it('answers 409 for a Session that has no Date', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createPoll(cookie, 2, 2)
      const [undated] = await sessionRowsOf(eventId)

      const response = await reopen(cookie, slug, undated!.id)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ statusMessage: 'wrong_phase' })
    })

    it('withdraws only the named Session: the Event goes back to the poll, the other Date stays, and the Slot returns with its Votes', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2, 2)
      const { cookie } = await signIn(testDb.db, member)
      await addMember(eventId, cookie)
      await vote(cookie, slug, slotIds[0]!, 'yes')
      await confirm(hostCookie, slug, slotIds[0]!)
      await confirm(hostCookie, slug, slotIds[1]!)
      const rows = await sessionRowsOf(eventId)
      const withdrawn = rows.find(row => row.slotId === slotIds[0])!

      const response = await reopen(hostCookie, slug, withdrawn.id)

      expect(response.status).toBe(200)
      expect(await eventRow(eventId)).toMatchObject({ phase: 'poll' })
      const after = await sessionRowsOf(eventId)
      expect(after.find(row => row.id === withdrawn.id)).toMatchObject({
        startsAt: null,
        slotId: null,
        previousStartsAt: withdrawn.startsAt,
      })
      expect(after.find(row => row.id !== withdrawn.id)).toMatchObject({ slotId: slotIds[1] })
      // The Slot the other Session still holds is not open, so the poll lists only the freed one.
      const body = await (await view(hostCookie, slug)).json() as { slots: { id: string }[], votes: { slotId: string }[] }
      expect(body.slots.map(slot => slot.id)).toEqual([slotIds[0]])
      expect(body.votes).toEqual([expect.objectContaining({ slotId: slotIds[0] })])
    })

    it('raises the sequence of the withdrawn Session and of the Session whose number moves up', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00', '2090-11-08T20:00'])
      const [first] = await sessionRowsOf(eventId)

      await reopen(cookie, slug, first!.id)

      const rows = await sessionRowsOf(eventId)
      expect(rows.map(row => [row.startsAt, row.icsSequence])).toEqual([
        [new Date('2090-11-08T19:00:00.000Z'), 1],
        [null, 1],
      ])
    })

    it('refuses a second Reopen of the same Session with 409', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00', '2090-11-08T20:00'])
      const [first] = await sessionRowsOf(eventId)
      await reopen(cookie, slug, first!.id)

      expect((await reopen(cookie, slug, first!.id)).status).toBe(409)
    })
  })

  describe('a removed Session (#65)', () => {
    type View = { event: { phase: string }, sessions: { id: string, number: number | null, startsAt: string | null }[], removedSessions: { id: string, previousStartsAt: string }[] }

    it('keeps the notice of a removed dated Session for every Member, with its Date', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId } = await createDirect(hostCookie, ['2090-11-07T20:00', '2090-11-08T20:00'])
      const { cookie } = await signIn(testDb.db, member)
      await addMember(eventId, cookie)
      const [first, second] = await sessionRowsOf(eventId)

      // „Entfernen“ on the card of the second evening.
      expect((await remove(hostCookie, slug, second!.id)).status).toBe(200)

      const body = await (await view(cookie, slug)).json() as View
      expect(body.removedSessions).toEqual([{ id: second!.id, previousStartsAt: '2090-11-08T19:00:00.000Z' }])
      expect(body.sessions.map(session => session.id)).toEqual([first!.id])
    })

    it('keeps the notice of a reopened Session the Host then removes with „−“, and the Event follows the Dates left', async () => {
      const hostCookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(hostCookie, 2, 2)
      const { cookie } = await signIn(testDb.db, member)
      await addMember(eventId, cookie)
      await confirm(hostCookie, slug, slotIds[0]!)
      await confirm(hostCookie, slug, slotIds[1]!)
      const second = (await sessionRowsOf(eventId)).find(row => row.slotId === slotIds[1])!
      await reopen(hostCookie, slug, second.id)

      // „−“ next to „1 Termin gesucht“ removes the last Session without a Date: the reopened one with the notice.
      expect((await remove(hostCookie, slug, second.id)).status).toBe(200)

      const body = await (await view(cookie, slug)).json() as View
      expect(body.removedSessions).toEqual([{ id: second.id, previousStartsAt: second.startsAt!.toISOString() }])
      expect(body.sessions.map(session => session.startsAt)).toEqual([expect.any(String)])
      expect(body.event.phase).toBe('date_set')
    })

    it('is not in the .ics and not counted: Session numbers, missing Dates and Home', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createDirect(cookie, ['2090-11-07T20:00', '2090-11-08T20:00', '2090-11-09T20:00'])
      const [first] = await sessionRowsOf(eventId)

      await remove(cookie, slug, first!.id)

      const file = await (await ics(cookie, slug)).text()
      expect(file).not.toContain(first!.id)
      expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(2)
      const body = await (await view(cookie, slug)).json() as View & { missingDates: number }
      expect(body.sessions.map(session => [session.number, session.startsAt])).toEqual([
        [1, '2090-11-08T19:00:00.000Z'],
        [2, '2090-11-09T19:00:00.000Z'],
      ])
      expect(body.missingDates).toBe(0)
      const { events: [card] } = await (await home(cookie)).json() as { events: { sessionCount: number, missingDates: number, nextSession: unknown }[] }
      expect(card).toMatchObject({ sessionCount: 2, missingDates: 0, nextSession: { number: 1, startsAt: '2090-11-08T19:00:00.000Z' } })
    })

    it('frees its place under the 8-Session limit', async () => {
      const cookie = await signInAsHost()
      const dates = Array.from({ length: 8 }, (_, index) => `2090-11-0${index + 1}T20:00`)
      const { slug, eventId } = await createDirect(cookie, dates)
      const [first] = await sessionRowsOf(eventId)
      await remove(cookie, slug, first!.id)

      expect((await add(cookie, slug, { startsAt: '2090-11-10T20:00' })).status).toBe(200)
      expect(await (await add(cookie, slug, {})).json()).toMatchObject({ statusMessage: 'sessions_max' })
    })

    it('really deletes a Session that never had a Date, so no notice is left', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId } = await createPoll(cookie, 2, 2)
      const [undated] = await sessionRowsOf(eventId)

      await remove(cookie, slug, undated!.id)

      expect(await testDb.db.select().from(sessions).where(eq(sessions.id, undated!.id))).toEqual([])
      const body = await (await view(cookie, slug)).json() as View
      expect(body.removedSessions).toEqual([])
    })
  })

  describe('a removal against a confirm', () => {
    it('never leaves a Slot held by a removed Session or a wrong Phase when a remove races a confirm', async () => {
      const cookie = await signInAsHost()
      const { slug, eventId, slotIds } = await createPoll(cookie, 2, 2)
      const [, undatedSecond] = await sessionRowsOf(eventId)
      let competitor: number | undefined
      // The removal starts just as the confirm is about to write the first undated Session.
      const racingDb = createInterleavingDb(testDb.client, /update "sessions"/i, async () => {
        competitor = (await remove(cookie, slug, undatedSecond!.id)).status
      })
      const racingRequest = createTestServer(racingDb, {
        'POST /api/e/:slug/confirm': confirmDate,
        'DELETE /api/e/:slug/sessions/:id': removeSession,
      })

      const confirmed = await racingRequest(`/api/e/${slug}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ slotId: slotIds[0] }),
      })
      await vi.waitFor(() => expect(competitor).toBeDefined())

      expect([200, 409]).toContain(confirmed.status)
      expect([200, 409]).toContain(competitor)
      const rows = await sessionRowsOf(eventId)
      const phase = (await eventRow(eventId)).phase
      expect(phase).toBe(rows.every(row => row.startsAt !== null) ? 'date_set' : 'poll')
      for (const row of rows) {
        if (row.slotId !== null) expect(slotIds).toContain(row.slotId)
      }
    })
  })
})
