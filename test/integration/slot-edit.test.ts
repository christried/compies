import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createSession from '../../server/api/s/index.post'
import readSession from '../../server/api/s/[slug].get'
import addSlot from '../../server/api/s/[slug]/slots/index.post'
import removeSlot from '../../server/api/s/[slug]/slots/[slotId].delete'
import putVote from '../../server/api/s/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Slots are far in the future so the "in the future" rule holds without a fake clock. Past times are
// well before 2026 and so always past.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '4', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('the Host edits Slots', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/s': createSession,
      'GET /api/s/:slug': readSession,
      'POST /api/s/:slug/slots': addSlot,
      'DELETE /api/s/:slug/slots/:slotId': removeSlot,
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

  async function signInAs(profile: typeof host | typeof guest | typeof outsider, { hostPermission = false } = {}) {
    if (hostPermission) setAllowlist({ hosts: `discord:${profile.id}` })
    const { cookie } = await signIn(testDb.db, profile)
    const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
    return { cookie, id: row!.id }
  }

  async function createSessionWith(cookie: string, body: Record<string, unknown>) {
    const response = await request('/api/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', ...body }),
    })
    expect(response.status).toBe(200)
    const { slug } = await response.json()
    const [session] = await testDb.db.select().from(sessions).where(eq(sessions.slug, slug))
    return { slug, sessionId: session!.id }
  }

  async function createPoll(cookie: string, slots: string[]) {
    return createSessionWith(cookie, { dateMode: 'poll', slots })
  }

  async function slotRows(sessionId: string) {
    return testDb.db.select().from(pollSlots).where(eq(pollSlots.sessionId, sessionId))
  }

  function add(cookie: string | undefined, slug: string, body: unknown) {
    return request(`/api/s/${slug}/slots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  function remove(cookie: string | undefined, slug: string, slotId: string) {
    return request(`/api/s/${slug}/slots/${slotId}`, {
      method: 'DELETE',
      headers: cookie ? { cookie } : {},
    })
  }

  function read(cookie: string, slug: string) {
    return request(`/api/s/${slug}`, { headers: { cookie } })
  }

  describe('POST /api/s/:slug/slots', () => {
    it('adds a future Slot for the Host, in the Berlin time it was sent in', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])

      const response = await add(cookie, slug, { startsAt: '2026-10-31T20:00' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slotId: expect.any(String), startsAt: '2026-10-31T19:00:00.000Z' })
      const rows = await slotRows(sessionId)
      expect(rows.map(row => row.startsAt.toISOString()).sort()).toEqual(['2026-10-30T19:30:00.000Z', '2026-10-31T19:00:00.000Z'])
    })

    it('shows the new Slot to Members on their next read', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { cookie: guestCookie, id: guestId } = await signInAs(guest)
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])
      await testDb.db.insert(sessionMembers).values({ sessionId, userId: guestId })

      await add(cookie, slug, { startsAt: '2026-11-02T19:00' })
      const view = await (await read(guestCookie, slug)).json()

      expect(view.slots.map((slot: { startsAt: string }) => slot.startsAt)).toContain('2026-11-02T18:00:00.000Z')
    })

    it('accepts a Slot with no other Slots, as after a Reopen', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])
      await testDb.db.delete(pollSlots).where(eq(pollSlots.sessionId, sessionId))

      const response = await add(cookie, slug, { startsAt: '2026-11-02T19:00' })

      expect(response.status).toBe(200)
      expect(await slotRows(sessionId)).toHaveLength(1)
    })

    it('holds at most 8 Slots per Session', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const eight = Array.from({ length: 8 }, (_, day) => `2026-11-${String(day + 1).padStart(2, '0')}T20:00`)
      const { slug, sessionId } = await createPoll(cookie, eight)

      const response = await add(cookie, slug, { startsAt: '2026-12-01T20:00' })

      expect(response.status).toBe(400)
      expect((await response.json()).statusMessage).toBe('slots_max')
      expect(await slotRows(sessionId)).toHaveLength(8)
    })

    it('rejects a Slot in the same minute as an existing one', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])

      const response = await add(cookie, slug, { startsAt: '2026-10-30T20:30' })

      expect(response.status).toBe(400)
      expect((await response.json()).statusMessage).toBe('duplicate_slot')
      expect(await slotRows(sessionId)).toHaveLength(1)
    })

    it('rejects a Slot in the past, and a time that does not exist', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])

      const past = await add(cookie, slug, { startsAt: '2001-01-01T20:00' })
      const unreal = await add(cookie, slug, { startsAt: '2026-02-30T20:00' })
      const missing = await add(cookie, slug, {})

      expect((await past.json()).statusMessage).toBe('in_past')
      expect((await unreal.json()).statusMessage).toBe('invalid_time')
      expect((await missing.json()).statusMessage).toBe('invalid_time')
      expect(await slotRows(sessionId)).toHaveLength(1)
    })

    it('refuses a Member who is not the Host with 403, and an outsider with 404', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { cookie: guestCookie, id: guestId } = await signInAs(guest)
      const { cookie: outsiderCookie } = await signInAs(outsider)
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])
      await testDb.db.insert(sessionMembers).values({ sessionId, userId: guestId })

      const member = await add(guestCookie, slug, { startsAt: '2026-11-02T19:00' })
      const stranger = await add(outsiderCookie, slug, { startsAt: '2026-11-02T19:00' })

      expect(member.status).toBe(403)
      expect(stranger.status).toBe(404)
      expect(await slotRows(sessionId)).toHaveLength(1)
    })

    it('needs a signed-in User', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug } = await createPoll(cookie, ['2026-10-30T20:30'])

      expect((await add(undefined, slug, { startsAt: '2026-11-02T19:00' })).status).toBe(401)
    })

    it('refuses once the Date is set, with 409 wrong_phase', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId } = await createSessionWith(cookie, { dateMode: 'direct', startsAt: '2026-11-07T20:00' })

      const response = await add(cookie, slug, { startsAt: '2026-11-08T20:00' })

      expect(response.status).toBe(409)
      expect((await response.json()).statusMessage).toBe('wrong_phase')
      expect(await slotRows(sessionId)).toHaveLength(0)
    })
  })

  describe('DELETE /api/s/:slug/slots/:slotId', () => {
    it('deletes the Slot and its Votes together and leaves the other Slots alone', async () => {
      const { cookie, id: hostId } = await signInAs(host, { hostPermission: true })
      const { id: guestId } = await signInAs(guest)
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30', '2026-10-31T20:30'])
      await testDb.db.insert(sessionMembers).values({ sessionId, userId: guestId })
      const [doomed, kept] = (await slotRows(sessionId)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      await testDb.db.insert(pollVotes).values([
        { slotId: doomed!.id, userId: hostId, value: 'yes' },
        { slotId: doomed!.id, userId: guestId, value: 'maybe' },
        { slotId: kept!.id, userId: guestId, value: 'no' },
      ])

      const response = await remove(cookie, slug, doomed!.id)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slotId: doomed!.id, votesDeleted: 2 })
      expect((await slotRows(sessionId)).map(row => row.id)).toEqual([kept!.id])
      const votes = await testDb.db.select().from(pollVotes)
      expect(votes).toEqual([{ slotId: kept!.id, userId: guestId, value: 'no', updatedAt: expect.any(Date) }])
    })

    it('removes a Slot without Votes', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])
      const [slot] = await slotRows(sessionId)

      const response = await remove(cookie, slug, slot!.id)

      expect(await response.json()).toEqual({ slotId: slot!.id, votesDeleted: 0 })
      expect(await slotRows(sessionId)).toHaveLength(0)
    })

    it('refuses a Member who is not the Host with 403, and an outsider with 404', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { cookie: guestCookie, id: guestId } = await signInAs(guest)
      const { cookie: outsiderCookie } = await signInAs(outsider)
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])
      await testDb.db.insert(sessionMembers).values({ sessionId, userId: guestId })
      const [slot] = await slotRows(sessionId)

      expect((await remove(guestCookie, slug, slot!.id)).status).toBe(403)
      expect((await remove(outsiderCookie, slug, slot!.id)).status).toBe(404)
      expect(await slotRows(sessionId)).toHaveLength(1)
    })

    it('answers 404 for a Slot that is not in this Session or is not an id', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug } = await createPoll(cookie, ['2026-10-30T20:30'])
      const { sessionId: otherId } = await createPoll(cookie, ['2026-12-30T20:30'])
      const [foreign] = await slotRows(otherId)

      expect((await remove(cookie, slug, foreign!.id)).status).toBe(404)
      expect((await remove(cookie, slug, '00000000-0000-4000-8000-000000000999')).status).toBe(404)
      expect((await remove(cookie, slug, 'not-a-slot')).status).toBe(404)
    })

    it('refuses once the Date is set, with 409 wrong_phase, and keeps the Votes', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId } = await createPoll(cookie, ['2026-10-30T20:30'])
      const [slot] = await slotRows(sessionId)
      await testDb.db.update(sessions).set({ phase: 'date_set', dateMode: 'poll', startsAt: slot!.startsAt }).where(eq(sessions.id, sessionId))

      const response = await remove(cookie, slug, slot!.id)

      expect(response.status).toBe(409)
      expect(await slotRows(sessionId)).toHaveLength(1)
    })
  })
})
