import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import rescheduleSession from '../../server/api/e/[slug]/sessions/[id]/reschedule.post'
import removeSlot from '../../server/api/e/[slug]/slots/[slotId].delete'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import previewInvite from '../../server/api/invite/[invite].get'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../server/db/schema'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Note on a Vote (#102). Slots are far in the future; past Slots are made by moving their start into 2001.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const

describe('Notes on Votes', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/sessions/:id/reschedule': rescheduleSession,
      'DELETE /api/e/:slug/slots/:slotId': removeSlot,
      'PUT /api/e/:slug/slots/:slotId/vote': putVote,
      'GET /api/invite/:invite': previewInvite,
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

  async function signInAs(profile: typeof host | typeof member, { hostPermission = false } = {}) {
    if (hostPermission) setAllowlist({ hosts: `discord:${profile.id}` })
    const { cookie } = await signIn(testDb.db, profile)
    const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
    return { cookie, id: row!.id }
  }

  /** A poll Event by the Host with three Slots; returns the Host, a Member and the Slot ids in time order. */
  async function setUp() {
    const { cookie, id: hostId } = await signInAs(host, { hostPermission: true })
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30', '2090-10-31T19:00', '2090-11-01T19:00'], settings: TEST_SETTINGS }),
    })
    const { slug } = await response.json()
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const rows = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id)).orderBy(pollSlots.startsAt)
    const guest = await signInAs(member)
    await testDb.db.insert(eventMembers).values({ eventId: event!.id, userId: guest.id })
    return { slug, eventId: event!.id, hostCookie: cookie, hostId, guestCookie: guest.cookie, guestId: guest.id, slotIds: rows.map(row => row.id) }
  }

  function put(cookie: string, slug: string, slotId: string, body: Record<string, unknown>) {
    return request(`/api/e/${slug}/slots/${slotId}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  async function read(cookie: string, slug: string) {
    return (await request(`/api/e/${slug}`, { headers: { cookie } })).json()
  }

  async function storedNote(slotId: string, userId: string) {
    const [row] = await testDb.db.select().from(pollVotes).where(eq(pollVotes.slotId, slotId))
    expect(row!.userId).toBe(userId)
    return row!.note
  }

  describe('PUT /api/e/:slug/slots/:slotId/vote', () => {
    it('writes a Note with the Vote and answers with it, and the Event read gives it to every Member', async () => {
      const { slug, hostCookie, guestCookie, guestId, slotIds } = await setUp()

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: 'kann maximal bis 20:30' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slotId: slotIds[0], value: 'maybe', note: 'kann maximal bis 20:30' })
      const body = await read(hostCookie, slug)
      expect(body.votes).toEqual([{ slotId: slotIds[0], userId: guestId, value: 'maybe', note: 'kann maximal bis 20:30' }])
    })

    it('answers a Vote without a Note with note null', async () => {
      const { slug, guestCookie, slotIds } = await setUp()

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'yes' })

      expect(await response.json()).toEqual({ slotId: slotIds[0], value: 'yes', note: null })
    })

    it('changes the Note', async () => {
      const { slug, guestCookie, guestId, slotIds } = await setUp()
      await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: 'bis 20:30' })

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: 'bis 21:00' })

      expect((await response.json()).note).toBe('bis 21:00')
      expect(await storedNote(slotIds[0]!, guestId)).toBe('bis 21:00')
    })

    it('keeps the Note when only the value changes', async () => {
      const { slug, guestCookie, guestId, slotIds } = await setUp()
      await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: 'bis 20:30' })

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'no' })

      expect(await response.json()).toEqual({ slotId: slotIds[0], value: 'no', note: 'bis 20:30' })
      expect(await storedNote(slotIds[0]!, guestId)).toBe('bis 20:30')
    })

    it('removes the Note with an empty text, after trimming', async () => {
      const { slug, guestCookie, guestId, slotIds } = await setUp()
      await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: 'bis 20:30' })

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: '  ' })

      expect((await response.json()).note).toBeNull()
      expect(await storedNote(slotIds[0]!, guestId)).toBeNull()
    })

    it('turns line breaks into spaces and trims', async () => {
      const { slug, guestCookie, slotIds } = await setUp()

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'yes', note: ' lass 14:30\r\nanfangen ' })

      expect((await response.json()).note).toBe('lass 14:30 anfangen')
    })

    it('accepts 80 emoji with skin tones and refuses 81 characters with note_too_long', async () => {
      const { slug, guestCookie, guestId, slotIds } = await setUp()

      const ok = await put(guestCookie, slug, slotIds[0]!, { value: 'yes', note: '👍🏽'.repeat(80) })
      const tooLong = await put(guestCookie, slug, slotIds[0]!, { value: 'yes', note: `${'a'.repeat(80)}b` })

      expect(ok.status).toBe(200)
      expect(tooLong.status).toBe(400)
      expect(tooLong.statusText).toBe('note_too_long')
      expect(await storedNote(slotIds[0]!, guestId)).toBe('👍🏽'.repeat(80))
    })

    it('refuses a Note that is not text', async () => {
      const { slug, guestCookie, slotIds } = await setUp()

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'yes', note: 42 })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_value')
    })

    it('refuses a Note on a past Slot and writes nothing', async () => {
      const { slug, guestCookie, slotIds } = await setUp()
      await testDb.db.update(pollSlots).set({ startsAt: new Date('2001-01-01T18:00:00Z') }).where(eq(pollSlots.id, slotIds[0]!))

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'yes', note: 'hallo' })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('slot_past')
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })

    it('refuses a Note on a Slot that became a Date, and keeps the Note it had', async () => {
      const { slug, hostCookie, guestCookie, guestId, slotIds } = await setUp()
      await put(guestCookie, slug, slotIds[1]!, { value: 'maybe', note: 'bis 20:30' })
      await request(`/api/e/${slug}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ slotId: slotIds[1] }),
      })

      // The Event has one Session, so the Date closes the poll; with several Sessions the poll stays open and
      // only the taken Slot refuses.
      await testDb.db.update(events).set({ phase: 'poll' }).where(eq(events.slug, slug))

      const response = await put(guestCookie, slug, slotIds[1]!, { value: 'maybe', note: 'neu' })

      expect(response.status).toBe(409)
      expect(response.statusText).toBe('slot_taken')
      expect(await storedNote(slotIds[1]!, guestId)).toBe('bis 20:30')
    })

    it('refuses a Note outside the Date poll', async () => {
      const { slug, eventId, guestCookie, slotIds } = await setUp()
      await testDb.db.update(events).set({ phase: 'date_set' }).where(eq(events.id, eventId))

      const response = await put(guestCookie, slug, slotIds[0]!, { value: 'yes', note: 'hallo' })

      expect(response.status).toBe(409)
      expect(response.statusText).toBe('wrong_phase')
    })

    it('goes with its Slot when the Slot is removed', async () => {
      const { slug, hostCookie, guestCookie, slotIds } = await setUp()
      await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: 'bis 20:30' })

      const removed = await request(`/api/e/${slug}/slots/${slotIds[0]}`, { method: 'DELETE', headers: { cookie: hostCookie } })

      expect(removed.status).toBeLessThan(300)
      expect(await testDb.db.select().from(pollVotes)).toEqual([])
    })
  })

  describe('GET /api/e/:slug', () => {
    async function confirmSecondSlot() {
      const created = await setUp()
      await put(created.guestCookie, created.slug, created.slotIds[1]!, { value: 'maybe', note: 'bis 20:30' })
      await put(created.hostCookie, created.slug, created.slotIds[1]!, { value: 'yes' })
      await put(created.guestCookie, created.slug, created.slotIds[2]!, { value: 'yes', note: 'andere Note' })
      await request(`/api/e/${created.slug}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': created.hostCookie },
        body: JSON.stringify({ slotId: created.slotIds[1] }),
      })
      return created
    }

    it('gives a dated Session the Notes of the Slot its Date came from', async () => {
      const { slug, hostCookie, guestId } = await confirmSecondSlot()

      const body = await read(hostCookie, slug)

      expect(body.sessions).toHaveLength(1)
      expect(body.sessions[0].notes).toEqual([{ userId: guestId, value: 'maybe', note: 'bis 20:30' }])
    })

    it('keeps those Notes after a Reschedule', async () => {
      const { slug, eventId, hostCookie, guestId } = await confirmSecondSlot()
      const [session] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))

      const rescheduled = await request(`/api/e/${slug}/sessions/${session!.id}/reschedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ startsAt: '2090-11-05T20:00' }),
      })

      expect(rescheduled.status).toBe(200)
      const body = await read(hostCookie, slug)
      expect(body.sessions[0].startsAt).toBe('2090-11-05T19:00:00.000Z')
      expect(body.sessions[0].notes).toEqual([{ userId: guestId, value: 'maybe', note: 'bis 20:30' }])
    })

    it('gives a Date set directly no Notes', async () => {
      const { cookie } = await signInAs(host, { hostPermission: true })
      const created = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Abend', dateMode: 'direct', startsAt: ['2090-11-07T20:00'], settings: TEST_SETTINGS }),
      })
      const { slug } = await created.json()

      const body = await read(cookie, slug)

      expect(body.sessions[0].notes).toEqual([])
    })

    it('shows no Notes in the invite preview', async () => {
      const { slug, guestCookie, slotIds } = await setUp()
      await put(guestCookie, slug, slotIds[0]!, { value: 'maybe', note: 'geheime Anmerkung' })
      const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))

      const response = await request(`/api/invite/${slug}-${event!.inviteToken}`)

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).not.toContain('note')
      expect(text).not.toContain('geheime')
    })
  })
})
