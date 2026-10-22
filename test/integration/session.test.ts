import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createSession from '../../server/api/s/index.post'
import readSession from '../../server/api/s/[slug].get'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Slots and dates are far in the future so the "in the future" rule holds without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const

describe('sessions', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/s': createSession,
      'GET /api/s/:slug': readSession,
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

  /** Signs in as the Host (who has the Host permission) and returns the cookie. */
  async function signInAsHost() {
    setAllowlist({ hosts: 'discord:1' })
    return (await signIn(testDb.db, host)).cookie
  }

  function create(cookie: string | undefined, body: unknown) {
    return request('/api/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  function read(cookie: string | undefined, slug: string) {
    return request(`/api/s/${slug}`, { headers: cookie ? { cookie } : {} })
  }

  async function sessionRows() {
    return testDb.db.select().from(sessions)
  }

  describe('POST /api/s', () => {
    it('requires sign-in', async () => {
      expect((await create(undefined, poll())).status).toBe(401)
    })

    it('answers 403 for a User without the Host permission', async () => {
      const { cookie } = await signIn(testDb.db, guest)

      const response = await create(cookie, poll())

      expect(response.status).toBe(403)
      expect(await sessionRows()).toEqual([])
    })

    it('creates a poll with its Slots, the Host on the Bench and a Session link and Invite link', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, poll({ name: ' Freitags-Zocken ', slots: ['2090-10-30T20:30', '2090-10-31T19:00'] }))

      expect(response.status).toBe(200)
      const { slug, inviteUrl } = await response.json()
      expect(slug).toMatch(/^freitags-zocken-[a-z0-9]{4}$/)
      expect(inviteUrl).toMatch(new RegExp(`^http://localhost/s/${slug}-[A-Za-z0-9]{12}$`))

      const [session] = await sessionRows()
      const [host] = await testDb.db.select().from(users)
      expect(session).toMatchObject({
        slug,
        name: 'Freitags-Zocken',
        phase: 'poll',
        dateMode: 'poll',
        startsAt: null,
        hostId: host!.id,
        icsSequence: 0,
        deletedAt: null,
      })
      expect(inviteUrl.endsWith(`${slug}-${session!.inviteToken}`)).toBe(true)
      expect(session!.inviteToken).toMatch(/^[A-Za-z0-9]{12}$/)

      const slots = await testDb.db.select().from(pollSlots).where(eq(pollSlots.sessionId, session!.id))
      expect(slots.map(slot => slot.startsAt.toISOString()).sort()).toEqual([
        '2090-10-30T19:30:00.000Z',
        '2090-10-31T18:00:00.000Z',
      ])

      const members = await testDb.db.select().from(sessionMembers)
      expect(members).toEqual([{ sessionId: session!.id, userId: host!.id, joinedAt: expect.any(Date), zone: 'bench' }])
    })

    it('creates a direct Date in the phase date_set, without Slots', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, { name: 'Abend', dateMode: 'direct', startsAt: '2090-11-07T20:00' })

      expect(response.status).toBe(200)
      const [session] = await sessionRows()
      expect(session).toMatchObject({
        phase: 'date_set',
        dateMode: 'direct',
        startsAt: new Date('2090-11-07T19:00:00Z'),
      })
      expect(await testDb.db.select().from(pollSlots)).toEqual([])
    })

    it('answers 400 with the rule that failed and writes nothing', async () => {
      const cookie = await signInAsHost()
      const cases: [unknown, string][] = [
        [poll({ name: '  ' }), 'invalid_name'],
        [poll({ slots: [] }), 'invalid_slots'],
        [poll({ slots: slotsOnDays(9) }), 'invalid_slots'],
        [poll({ slots: ['2090-10-30 20:30'] }), 'invalid_time'],
        [poll({ slots: ['2001-10-30T20:30'] }), 'in_past'],
        [poll({ slots: ['2090-10-30T20:30', '2090-10-30T20:30'] }), 'duplicate_slot'],
        [{ name: 'Abend', dateMode: 'direct', startsAt: '2001-01-01T20:00' }, 'in_past'],
      ]

      for (const [body, code] of cases) {
        const response = await create(cookie, body)
        expect(response.status).toBe(400)
        expect(response.statusText).toBe(code)
      }
      expect(await sessionRows()).toEqual([])
    })
  })

  describe('GET /api/s/:slug', () => {
    it('requires sign-in', async () => {
      expect((await read(undefined, 'freitags-zocken-k7q2')).status).toBe(401)
    })

    it('shows the Session and its Slots in time order to a Member', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll({ slots: ['2090-10-31T19:00', '2090-10-30T20:30'] }))).json()

      const response = await read(cookie, slug)

      expect(response.status).toBe(200)
      const { session, slots } = await response.json()
      expect(session).toEqual({
        slug,
        name: 'Freitags-Zocken',
        phase: 'poll',
        dateMode: 'poll',
        startsAt: null,
        isHost: true,
      })
      expect(slots.map((slot: { startsAt: string }) => slot.startsAt)).toEqual([
        '2090-10-30T19:30:00.000Z',
        '2090-10-31T18:00:00.000Z',
      ])
      expect(slots[0]).toEqual({ id: expect.any(String), startsAt: expect.any(String), past: false })
    })

    it('shows the Date of a direct Session and no Slots', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, { name: 'Abend', dateMode: 'direct', startsAt: '2090-11-07T20:00' })).json()

      const { session, slots } = await (await read(cookie, slug)).json()

      expect(session).toMatchObject({ phase: 'date_set', dateMode: 'direct', startsAt: '2090-11-07T19:00:00.000Z' })
      expect(slots).toEqual([])
    })

    it('answers 404 to a User who is not a Member, so Sessions cannot be probed', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll())).json()
      const { cookie: guestCookie } = await signIn(testDb.db, guest)

      expect((await read(guestCookie, slug)).status).toBe(404)
    })

    it('answers 404 for an unknown Session', async () => {
      const cookie = await signInAsHost()

      expect((await read(cookie, 'nie-gab-es-k7q2')).status).toBe(404)
    })

    it('answers 410 "Session deleted" to a former Member of a deleted Session, and 404 to anyone else', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll())).json()
      const { cookie: guestCookie } = await signIn(testDb.db, guest)
      await testDb.db.update(sessions).set({ deletedAt: new Date() })

      const former = await read(cookie, slug)
      expect(former.status).toBe(410)
      expect(former.statusText).toBe('Session deleted')
      expect((await read(guestCookie, slug)).status).toBe(404)
    })
  })
})

function poll(overrides: Record<string, unknown> = {}) {
  return { name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'], ...overrides }
}

function slotsOnDays(count: number) {
  return Array.from({ length: count }, (_, day) => `2090-11-${String(day + 1).padStart(2, '0')}T20:00`)
}
