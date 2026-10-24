import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import addSlot from '../../server/api/e/[slug]/slots/index.post'
import removeSlot from '../../server/api/e/[slug]/slots/[slotId].delete'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../server/db/schema'
import { createInterleavingDb, createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Slots are far in the future so the "in the future" rule holds without a fake clock. Past times are
// well before today and so always past.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '4', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('the Host edits Slots', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/e/:slug/slots': addSlot,
      'DELETE /api/e/:slug/slots/:slotId': removeSlot,
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

  async function signInAs(profile: typeof host | typeof member | typeof outsider, { hostPermission = false } = {}) {
    if (hostPermission) setAllowlist({ hosts: `discord:${profile.id}` })
    const { cookie } = await signIn(testDb.db, profile)
    const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
    return { cookie, id: row!.id }
  }

  async function createEventWith(cookie: string, body: Record<string, unknown>) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', ...body }),
    })
    expect(response.status).toBe(200)
    const { slug } = await response.json()
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return { slug, eventId: event!.id }
  }

  async function createPoll(cookie: string, slots: string[]) {
    return createEventWith(cookie, { dateMode: 'poll', slots })
  }

  async function slotRows(eventId: string) {
    return testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId))
  }

  function add(cookie: string | undefined, slug: string, body: unknown) {
    return request(`/api/e/${slug}/slots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  function remove(cookie: string | undefined, slug: string, slotId: string) {
    return request(`/api/e/${slug}/slots/${slotId}`, {
      method: 'DELETE',
      headers: cookie ? { cookie } : {},
    })
  }

  function read(cookie: string, slug: string) {
    return request(`/api/e/${slug}`, { headers: { cookie } })
  }

  describe('POST /api/e/:slug/slots', () => {
    it('adds a future Slot for the Host, in the Berlin time it was sent in', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])

      const response = await add(cookie, slug, { startsAt: '2090-10-31T20:00' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slotId: expect.any(String), startsAt: '2090-10-31T19:00:00.000Z' })
      const rows = await slotRows(eventId)
      expect(rows.map(row => row.startsAt.toISOString()).sort()).toEqual(['2090-10-30T19:30:00.000Z', '2090-10-31T19:00:00.000Z'])
    })

    it('shows the new Slot to Members on their next read', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { cookie: memberCookie, id: memberId } = await signInAs(member)
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])
      await testDb.db.insert(eventMembers).values({ eventId, userId: memberId })

      await add(cookie, slug, { startsAt: '2090-11-02T19:00' })
      const view = await (await read(memberCookie, slug)).json()

      expect(view.slots.map((slot: { startsAt: string }) => slot.startsAt)).toContain('2090-11-02T18:00:00.000Z')
    })

    it('accepts a Slot with no other Slots, as after a Reopen', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])
      await testDb.db.delete(pollSlots).where(eq(pollSlots.eventId, eventId))

      const response = await add(cookie, slug, { startsAt: '2090-11-02T19:00' })

      expect(response.status).toBe(200)
      expect(await slotRows(eventId)).toHaveLength(1)
    })

    it('holds at most 16 Slots per Event', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const sixteen = Array.from({ length: 16 }, (_, day) => `2090-11-${String(day + 1).padStart(2, '0')}T20:00`)
      const { slug, eventId } = await createPoll(cookie, sixteen)

      const response = await add(cookie, slug, { startsAt: '2090-12-01T20:00' })

      expect(response.status).toBe(400)
      expect((await response.json()).statusMessage).toBe('slots_max')
      expect(await slotRows(eventId)).toHaveLength(16)
    })

    it('rejects a Slot in the same minute as an existing one', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])

      const response = await add(cookie, slug, { startsAt: '2090-10-30T20:30' })

      expect(response.status).toBe(400)
      expect((await response.json()).statusMessage).toBe('duplicate_slot')
      expect(await slotRows(eventId)).toHaveLength(1)
    })

    it('rejects a Slot in the past, and a time that does not exist', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])

      const past = await add(cookie, slug, { startsAt: '2001-01-01T20:00' })
      const unreal = await add(cookie, slug, { startsAt: '2090-02-30T20:00' })
      const missing = await add(cookie, slug, {})

      expect((await past.json()).statusMessage).toBe('in_past')
      expect((await unreal.json()).statusMessage).toBe('invalid_time')
      expect((await missing.json()).statusMessage).toBe('invalid_time')
      expect(await slotRows(eventId)).toHaveLength(1)
    })

    it('refuses a Member who is not the Host with 403, and an outsider with 404', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { cookie: memberCookie, id: memberId } = await signInAs(member)
      const { cookie: outsiderCookie } = await signInAs(outsider)
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])
      await testDb.db.insert(eventMembers).values({ eventId, userId: memberId })

      const response = await add(memberCookie, slug, { startsAt: '2090-11-02T19:00' })
      const stranger = await add(outsiderCookie, slug, { startsAt: '2090-11-02T19:00' })

      expect(response.status).toBe(403)
      expect(response.statusText).toBe('not_host')
      expect(stranger.status).toBe(404)
      expect(await slotRows(eventId)).toHaveLength(1)
    })

    it('needs a signed-in User', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug } = await createPoll(cookie, ['2090-10-30T20:30'])

      expect((await add(undefined, slug, { startsAt: '2090-11-02T19:00' })).status).toBe(401)
    })

    it('refuses once the Date is set, with 409 wrong_phase', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createEventWith(cookie, { dateMode: 'direct', startsAt: ['2090-11-07T20:00'] })

      const response = await add(cookie, slug, { startsAt: '2090-11-08T20:00' })

      expect(response.status).toBe(409)
      expect((await response.json()).statusMessage).toBe('wrong_phase')
      expect(await slotRows(eventId)).toHaveLength(0)
    })
  })

  describe('DELETE /api/e/:slug/slots/:slotId', () => {
    it('deletes the Slot and its Votes together and leaves the other Slots alone', async () => {
      const { cookie, id: hostId } = await signInAs(host, { hostPermission: true })
      const { id: memberId } = await signInAs(member)
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30', '2090-10-31T20:30'])
      await testDb.db.insert(eventMembers).values({ eventId, userId: memberId })
      const [doomed, kept] = (await slotRows(eventId)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      await testDb.db.insert(pollVotes).values([
        { slotId: doomed!.id, userId: hostId, value: 'yes' },
        { slotId: doomed!.id, userId: memberId, value: 'maybe' },
        { slotId: kept!.id, userId: memberId, value: 'no' },
      ])

      const response = await remove(cookie, slug, doomed!.id)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slotId: doomed!.id, votesDeleted: 2 })
      expect((await slotRows(eventId)).map(row => row.id)).toEqual([kept!.id])
      const votes = await testDb.db.select().from(pollVotes)
      expect(votes).toEqual([{ slotId: kept!.id, userId: memberId, value: 'no', updatedAt: expect.any(Date) }])
    })

    it('removes a Slot without Votes', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])
      const [slot] = await slotRows(eventId)

      const response = await remove(cookie, slug, slot!.id)

      expect(await response.json()).toEqual({ slotId: slot!.id, votesDeleted: 0 })
      expect(await slotRows(eventId)).toHaveLength(0)
    })

    it('refuses a Member who is not the Host with 403, and an outsider with 404', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { cookie: memberCookie, id: memberId } = await signInAs(member)
      const { cookie: outsiderCookie } = await signInAs(outsider)
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])
      await testDb.db.insert(eventMembers).values({ eventId, userId: memberId })
      const [slot] = await slotRows(eventId)

      expect((await remove(memberCookie, slug, slot!.id)).statusText).toBe('not_host')
      expect((await remove(outsiderCookie, slug, slot!.id)).status).toBe(404)
      expect(await slotRows(eventId)).toHaveLength(1)
    })

    it('refuses to remove a Slot that became a Session\'s Date, with 409 slot_taken, and keeps its Votes (#52)', async () => {
      const { cookie, id: hostId } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createEventWith(cookie, { dateMode: 'poll', sessions: 2, slots: ['2090-10-30T20:30', '2090-10-31T20:30'] })
      const [taken] = (await slotRows(eventId)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      await testDb.db.insert(pollVotes).values({ slotId: taken!.id, userId: hostId, value: 'yes' })
      const [session] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))
      await testDb.db.update(sessions).set({ startsAt: taken!.startsAt, slotId: taken!.id }).where(eq(sessions.id, session!.id))

      const response = await remove(cookie, slug, taken!.id)

      expect(response.status).toBe(409)
      expect((await response.json()).statusMessage).toBe('slot_taken')
      expect(await slotRows(eventId)).toHaveLength(2)
      expect(await testDb.db.select().from(pollVotes)).toHaveLength(1)
    })

    it('answers 404 for a Slot that is not in this Event or is not an id', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug } = await createPoll(cookie, ['2090-10-30T20:30'])
      const { eventId: otherId } = await createPoll(cookie, ['2090-12-30T20:30'])
      const [foreign] = await slotRows(otherId)

      expect((await remove(cookie, slug, foreign!.id)).status).toBe(404)
      expect((await remove(cookie, slug, '00000000-0000-4000-8000-000000000999')).status).toBe(404)
      expect((await remove(cookie, slug, 'not-a-slot')).status).toBe(404)
    })

    it('answers a Vote that races the removal of its Slot with 200 or 404, never a server error', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { cookie: memberCookie, id: memberId } = await signInAs(member)
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])
      await testDb.db.insert(eventMembers).values({ eventId, userId: memberId })
      const [slot] = await slotRows(eventId)
      // The Host removes the Slot just as the Vote is about to be written.
      let removed: Response | undefined
      const racingDb = createInterleavingDb(testDb.client, /insert into "poll_votes"/i, async () => {
        removed = await remove(cookie, slug, slot!.id)
      })
      const racingRequest = createTestServer(racingDb, { 'PUT /api/e/:slug/slots/:slotId/vote': putVote })

      const voted = await racingRequest(`/api/e/${slug}/slots/${slot!.id}/vote`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': memberCookie },
        body: JSON.stringify({ value: 'yes' }),
      })
      await vi.waitFor(() => expect(removed).toBeDefined())

      expect([200, 404]).toContain(voted.status)
      expect(removed!.status).toBe(200)
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })

    it('refuses once the Date is set, with 409 wrong_phase, and keeps the Votes', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, eventId } = await createPoll(cookie, ['2090-10-30T20:30'])
      const [slot] = await slotRows(eventId)
      await testDb.db.update(events).set({ phase: 'date_set' }).where(eq(events.id, eventId))
      await testDb.db.update(sessions).set({ startsAt: slot!.startsAt, slotId: slot!.id }).where(eq(sessions.eventId, eventId))

      const response = await remove(cookie, slug, slot!.id)

      expect(response.status).toBe(409)
      expect(await slotRows(eventId)).toHaveLength(1)
    })
  })
})
