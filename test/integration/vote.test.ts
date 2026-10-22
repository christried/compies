import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createSession from '../../server/api/s/index.post'
import readSession from '../../server/api/s/[slug].get'
import putVote from '../../server/api/s/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Slots are far in the future so the "not past" rule holds without a fake clock. Past Slots are
// made by moving their start into 2001 directly in the database.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '4', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('poll votes and the Session read', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/s': createSession,
      'GET /api/s/:slug': readSession,
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

  /** Signs a User in and returns the cookie and the User's row id. */
  async function signInAs(profile: typeof host | typeof guest | typeof outsider, { hostPermission = false } = {}) {
    if (hostPermission) setAllowlist({ hosts: `discord:${profile.id}` })
    const { cookie } = await signIn(testDb.db, profile)
    const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
    return { cookie, id: row!.id }
  }

  /** Makes a User a Member of the Session (the join flow is #10; here only the row matters). */
  async function addMember(sessionId: string, userId: string) {
    await testDb.db.insert(sessionMembers).values({ sessionId, userId })
  }

  async function createPoll(cookie: string, slots: string[]) {
    const response = await request('/api/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots }),
    })
    const { slug } = await response.json()
    const [session] = await testDb.db.select().from(sessions).where(eq(sessions.slug, slug))
    const rows = await testDb.db.select().from(pollSlots).where(eq(pollSlots.sessionId, session!.id))
    const slotIdAt = (startsAt: string) => rows.find(row => row.startsAt.toISOString() === startsAt)!.id
    return { slug, sessionId: session!.id, slotIdAt }
  }

  function vote(cookie: string | undefined, slug: string, slotId: string, value: unknown) {
    return request(`/api/s/${slug}/slots/${slotId}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ value }),
    })
  }

  function read(cookie: string | undefined, slug: string) {
    return request(`/api/s/${slug}`, { headers: cookie ? { cookie } : {} })
  }

  describe('GET /api/s/:slug', () => {
    it('returns the Slots with their past flag, every Member\'s Votes, the Best slot and the vote progress to a Member', async () => {
      const { cookie: hostCookie, id: hostId } = await signInAs(host, { hostPermission: true })
      const { cookie: guestCookie, id: guestId } = await signInAs(guest)
      const { slug, sessionId, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30', '2090-10-31T19:00'])
      await addMember(sessionId, guestId)
      const fri = slotIdAt('2090-10-30T19:30:00.000Z')
      const sat = slotIdAt('2090-10-31T18:00:00.000Z')
      await testDb.db.insert(pollVotes).values([
        { slotId: fri, userId: hostId, value: 'yes' },
        { slotId: sat, userId: hostId, value: 'maybe' },
        { slotId: fri, userId: guestId, value: 'yes' },
        { slotId: sat, userId: guestId, value: 'no' },
      ])

      const response = await read(guestCookie, slug)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.viewerId).toBe(guestId)
      expect(body.slots).toEqual([
        { id: fri, startsAt: '2090-10-30T19:30:00.000Z', past: false },
        { id: sat, startsAt: '2090-10-31T18:00:00.000Z', past: false },
      ])
      expect(body.votes).toHaveLength(4)
      expect(body.votes).toContainEqual({ slotId: fri, userId: hostId, value: 'yes' })
      expect(body.members).toEqual([
        { id: hostId, name: 'Hostess', image: expect.any(String), isHost: true },
        { id: guestId, name: 'Gast', image: expect.any(String), isHost: false },
      ])
      expect(body.bestSlotId).toBe(fri)
      expect(body.progress).toEqual({ voted: 2, total: 2 })
    })

    it('counts a Member as voted only once they have a Vote on every votable Slot', async () => {
      const { cookie: hostCookie, id: hostId } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30', '2090-10-31T19:00'])
      const { id: guestId } = await signInAs(guest)
      await addMember(sessionId, guestId)
      const fri = slotIdAt('2090-10-30T19:30:00.000Z')
      const sat = slotIdAt('2090-10-31T18:00:00.000Z')
      await testDb.db.insert(pollVotes).values([
        { slotId: fri, userId: hostId, value: 'yes' },
        { slotId: sat, userId: hostId, value: 'no' },
        { slotId: fri, userId: guestId, value: 'yes' },
      ])

      const body = await (await read(hostCookie, slug)).json()

      expect(body.progress).toEqual({ voted: 1, total: 2 })
    })

    it('marks Slots in the past and leaves them out of the Best slot', async () => {
      const { cookie: hostCookie, id: hostId } = await signInAs(host, { hostPermission: true })
      const { slug, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30', '2090-10-31T19:00'])
      const fri = slotIdAt('2090-10-30T19:30:00.000Z')
      await testDb.db.update(pollSlots).set({ startsAt: new Date('2001-01-01T18:00:00Z') }).where(eq(pollSlots.id, fri))
      await testDb.db.insert(pollVotes).values({ slotId: fri, userId: hostId, value: 'yes' })

      const body = await (await read(hostCookie, slug)).json()

      expect(body.slots.find((slot: { id: string }) => slot.id === fri)).toMatchObject({ past: true })
      expect(body.bestSlotId).toBeNull()
      expect(body.progress).toEqual({ voted: 0, total: 1 })
    })

    it('answers 404 to a User who is not a Member, so a Session\'s votes stay hidden', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug } = await createPoll(hostCookie, ['2090-10-30T20:30'])
      const { cookie: outsiderCookie } = await signInAs(outsider)

      expect((await read(outsiderCookie, slug)).status).toBe(404)
    })
  })

  describe('PUT /api/s/:slug/slots/:slotId/vote', () => {
    it('requires sign-in', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30'])

      expect((await vote(undefined, slug, slotIdAt('2090-10-30T19:30:00.000Z'), 'yes')).status).toBe(401)
    })

    it('answers 404 to a User who is not a Member, and writes nothing', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30'])
      const { cookie: outsiderCookie } = await signInAs(outsider)

      const response = await vote(outsiderCookie, slug, slotIdAt('2090-10-30T19:30:00.000Z'), 'yes')

      expect(response.status).toBe(404)
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })

    it('answers 404 for a Slot that belongs to another Session or does not exist', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug } = await createPoll(hostCookie, ['2090-10-30T20:30'])
      const other = await createPoll(hostCookie, ['2090-11-07T20:00'])

      const foreign = other.slotIdAt('2090-11-07T19:00:00.000Z')
      expect((await vote(hostCookie, slug, foreign, 'yes')).status).toBe(404)
      expect((await vote(hostCookie, slug, '00000000-0000-4000-8000-000000000000', 'yes')).status).toBe(404)
    })

    it('answers 400 for a value that is not yes, maybe or no', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30'])

      const response = await vote(hostCookie, slug, slotIdAt('2090-10-30T19:30:00.000Z'), 'Ja')

      expect(response.status).toBe(400)
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })

    it('answers 400 for a past Slot', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30'])
      const fri = slotIdAt('2090-10-30T19:30:00.000Z')
      await testDb.db.update(pollSlots).set({ startsAt: new Date('2001-01-01T18:00:00Z') }).where(eq(pollSlots.id, fri))

      const response = await vote(hostCookie, slug, fri, 'yes')

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('slot_past')
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })

    it('answers 409 once the Date is set, so votes are frozen', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug, sessionId, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30'])
      await testDb.db.update(sessions).set({ phase: 'date_set', startsAt: new Date('2090-10-30T19:30:00Z') }).where(eq(sessions.id, sessionId))

      const response = await vote(hostCookie, slug, slotIdAt('2090-10-30T19:30:00.000Z'), 'yes')

      expect(response.status).toBe(409)
      expect(response.statusText).toBe('wrong_phase')
    })

    it('stores a Vote and returns it, and a second Vote on the same Slot replaces the first', async () => {
      const { cookie: hostCookie, id: hostId } = await signInAs(host, { hostPermission: true })
      const { slug, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30'])
      const fri = slotIdAt('2090-10-30T19:30:00.000Z')

      const first = await vote(hostCookie, slug, fri, 'yes')
      expect(first.status).toBe(200)
      expect(await first.json()).toEqual({ slotId: fri, value: 'yes' })

      const second = await vote(hostCookie, slug, fri, 'no')
      expect(second.status).toBe(200)

      const rows = await testDb.db.select().from(pollVotes).where(and(eq(pollVotes.slotId, fri), eq(pollVotes.userId, hostId)))
      expect(rows).toHaveLength(1)
      expect(rows[0]!.value).toBe('no')
    })

    it('answers 429 after 30 votes within a minute', async () => {
      const { cookie: hostCookie } = await signInAs(host, { hostPermission: true })
      const { slug, slotIdAt } = await createPoll(hostCookie, ['2090-10-30T20:30'])
      const fri = slotIdAt('2090-10-30T19:30:00.000Z')

      for (let attempt = 0; attempt < 30; attempt++) {
        expect((await vote(hostCookie, slug, fri, 'yes')).status).toBe(200)
      }
      expect((await vote(hostCookie, slug, fri, 'yes')).status).toBe(429)
    })
  })
})
