import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../server/db/schema'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Slots and dates are far in the future so the "in the future" rule holds without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const

describe('events', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
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

  /** Signs in as the Host (who has the Host permission) and returns the cookie. */
  async function signInAsHost() {
    setAllowlist({ hosts: 'discord:1' })
    return (await signIn(testDb.db, host)).cookie
  }

  function create(cookie: string | undefined, body: unknown) {
    return request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  function read(cookie: string | undefined, slug: string) {
    return request(`/api/e/${slug}`, { headers: cookie ? { cookie } : {} })
  }

  async function eventRows() {
    return testDb.db.select().from(events)
  }

  async function sessionRows(eventId: string) {
    return testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))
  }

  describe('POST /api/e', () => {
    it('requires sign-in', async () => {
      expect((await create(undefined, poll())).status).toBe(401)
    })

    it('answers 403 for a User without the Host permission', async () => {
      const { cookie } = await signIn(testDb.db, member)

      const response = await create(cookie, poll())

      expect(response.status).toBe(403)
      expect(response.statusText).toBe('no_host_permission')
      expect(await eventRows()).toEqual([])
    })

    it('creates a poll with its Slots, the Host on the Bench and an Event link and Invite link', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, poll({ name: ' Freitags-Zocken ', slots: ['2090-10-30T20:30', '2090-10-31T19:00'] }))

      expect(response.status).toBe(200)
      const { slug, inviteUrl } = await response.json()
      expect(slug).toMatch(/^freitags-zocken-[a-z0-9]{4}$/)
      expect(inviteUrl).toMatch(new RegExp(`^http://localhost/e/${slug}-[A-Za-z0-9]{12}$`))

      const [event] = await eventRows()
      const [host] = await testDb.db.select().from(users)
      expect(event).toMatchObject({
        slug,
        name: 'Freitags-Zocken',
        phase: 'poll',
        hostId: host!.id,
        deletedAt: null,
      })
      expect(await sessionRows(event!.id)).toEqual([{ id: expect.any(String), eventId: event!.id, startsAt: null, previousStartsAt: null, slotId: null, icsSequence: 0, removedAt: null }])
      expect(inviteUrl.endsWith(`${slug}-${event!.inviteToken}`)).toBe(true)
      expect(event!.inviteToken).toMatch(/^[A-Za-z0-9]{12}$/)

      const slots = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id))
      expect(slots.map(slot => slot.startsAt.toISOString()).sort()).toEqual([
        '2090-10-30T19:30:00.000Z',
        '2090-10-31T18:00:00.000Z',
      ])

      const members = await testDb.db.select().from(eventMembers)
      expect(members).toEqual([{ eventId: event!.id, userId: host!.id, joinedAt: expect.any(Date), zone: 'bench', team: null, teamJoinedAt: null }])
    })

    it('creates a direct Date in the phase date_set, without Slots', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, direct({ startsAt: ['2090-11-07T20:00'] }))

      expect(response.status).toBe(200)
      const [event] = await eventRows()
      expect(event).toMatchObject({ phase: 'date_set' })
      expect(await sessionRows(event!.id)).toMatchObject([{ startsAt: new Date('2090-11-07T19:00:00Z'), slotId: null }])
      expect(await testDb.db.select().from(pollSlots)).toEqual([])
    })

    it('accepts 16 Slots at create', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, poll({ slots: slotsOnDays(16) }))

      expect(response.status).toBe(200)
      const [event] = await eventRows()
      expect(await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id))).toHaveLength(16)
    })

    it('creates an Event with several Sessions by poll: one undated Session per Session, Slots for all of them', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, poll({ sessions: 3, slots: slotsOnDays(3) }))

      expect(response.status).toBe(200)
      const [event] = await eventRows()
      expect(event).toMatchObject({ phase: 'poll' })
      expect(await sessionRows(event!.id)).toMatchObject([
        { startsAt: null, slotId: null },
        { startsAt: null, slotId: null },
        { startsAt: null, slotId: null },
      ])
      expect(await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id))).toHaveLength(3)
    })

    it('creates an Event with several Sessions by direct Dates: one Session per Date, phase date_set', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, direct({ sessions: 2, startsAt: ['2090-11-08T19:00', '2090-11-07T20:00'] }))

      expect(response.status).toBe(200)
      const [event] = await eventRows()
      expect(event).toMatchObject({ phase: 'date_set' })
      const rows = await sessionRows(event!.id)
      expect(rows.map(row => row.startsAt?.toISOString()).sort()).toEqual(['2090-11-07T19:00:00.000Z', '2090-11-08T18:00:00.000Z'])
    })

    it('answers 400 with the rule that failed and writes nothing', async () => {
      const cookie = await signInAsHost()
      const cases: [unknown, string][] = [
        [poll({ name: '  ' }), 'invalid_name'],
        [poll({ sessions: 0 }), 'invalid_sessions'],
        [poll({ sessions: 9, slots: slotsOnDays(9) }), 'invalid_sessions'],
        [poll({ slots: [] }), 'invalid_slots'],
        [poll({ slots: slotsOnDays(17) }), 'invalid_slots'],
        [poll({ sessions: 2, slots: ['2090-10-30T20:30'] }), 'too_few_slots'],
        [poll({ slots: ['2090-10-30 20:30'] }), 'invalid_time'],
        [poll({ slots: ['2001-10-30T20:30'] }), 'in_past'],
        [poll({ slots: ['2090-10-30T20:30', '2090-10-30T20:30'] }), 'duplicate_slot'],
        [direct({ startsAt: ['2001-01-01T20:00'] }), 'in_past'],
        [direct({ sessions: 2, startsAt: ['2090-11-07T20:00', '2090-11-07T20:00'] }), 'duplicate_date'],
        [direct({ sessions: 2, startsAt: ['2090-11-07T20:00'] }), 'invalid_time'],
      ]

      for (const [body, code] of cases) {
        const response = await create(cookie, body)
        expect(response.status).toBe(400)
        expect(response.statusText).toBe(code)
      }
      expect(await eventRows()).toEqual([])
    })

    it('stores the settings with the Event (#144)', async () => {
      const cookie = await signInAsHost()
      const settings = {
        format: 'teams', teamCount: 4, teamSize: 2, gameCount: 6,
        pointsTable: { preset: 'custom', values: [5, 3, 3, 0] }, selectionMode: 'admin_pick',
      }

      const response = await create(cookie, poll({ settings }))

      expect(response.status).toBe(200)
      expect((await eventRows())[0]).toMatchObject({
        format: 'teams',
        teamCount: 4,
        teamSize: 2,
        gameCount: 6,
        pointsTable: { preset: 'custom', values: [5, 3, 3, 0] },
        selectionMode: 'admin_pick',
        hiddenWheel: false,
        vetoAllowance: null,
      })
    })

    it('stores the Glücksrad options with their defaults (#144)', async () => {
      const cookie = await signInAsHost()

      await create(cookie, poll({ settings: { ...TEST_SETTINGS, teamSize: 5, selectionMode: 'lucky_wheel', hiddenWheel: undefined, vetoAllowance: undefined } }))

      expect((await eventRows())[0]).toMatchObject({ selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 5 })
    })

    it('stores a Glücksrad with a hidden wheel and the Host’s Veto allowance (#145)', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, poll({ settings: { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 5 } }))

      expect(response.status).toBe(200)
      expect((await eventRows())[0]).toMatchObject({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 5 })
    })

    it('stores a Veto allowance of 0 with the Glücksrad (#145)', async () => {
      const cookie = await signInAsHost()

      await create(cookie, poll({ settings: { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', vetoAllowance: 0 } }))

      expect((await eventRows())[0]).toMatchObject({ selectionMode: 'lucky_wheel', vetoAllowance: 0 })
    })

    it('refuses a Veto allowance outside 0 to 9, and the wheel options with Host pick, and writes nothing (#145)', async () => {
      const cookie = await signInAsHost()
      const cases: [Record<string, unknown>, string][] = [
        [{ selectionMode: 'lucky_wheel', vetoAllowance: 10 }, 'veto_allowance_range'],
        [{ selectionMode: 'lucky_wheel', vetoAllowance: -1 }, 'veto_allowance_range'],
        [{ selectionMode: 'admin_pick', hiddenWheel: true }, 'wheel_options_without_wheel'],
        [{ selectionMode: 'admin_pick', vetoAllowance: 2 }, 'wheel_options_without_wheel'],
        [{ selectionMode: 'pick_ban' }, 'mode_unavailable'],
      ]

      for (const [changes, code] of cases) {
        const response = await create(cookie, poll({ settings: { ...TEST_SETTINGS, ...changes } }))
        expect(response.status).toBe(400)
        expect(response.statusText).toBe(code)
      }
      expect(await eventRows()).toEqual([])
    })

    it('answers 400 invalid_settings without settings, and writes nothing (#144)', async () => {
      const cookie = await signInAsHost()
      const { settings: _omitted, ...withoutSettings } = poll()

      const response = await create(cookie, withoutSettings)

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_settings')
      expect(await eventRows()).toEqual([])
    })

    it('names the first broken Event rule before a settings rule (#144)', async () => {
      const cookie = await signInAsHost()

      const response = await create(cookie, poll({ name: '  ', settings: { ...TEST_SETTINGS, teamCount: 99 } }))

      expect(response.statusText).toBe('invalid_name')
    })

    it('refuses settings that break a rule with its code, and writes nothing (#144)', async () => {
      const cookie = await signInAsHost()
      const five = { teamCount: 5, teamSize: 5, pointsTable: { preset: 'linear', values: [4, 3, 2, 1, 0] } }
      const cases: [Record<string, unknown>, string][] = [
        [five, 'too_many_players'],
        [{ teamCount: 9, teamSize: 1, pointsTable: { preset: 'linear', values: [8, 7, 6, 5, 4, 3, 2, 1, 0] } }, 'team_count_range'],
        [{ teamSize: 7 }, 'team_size_range'],
        [{ gameCount: 31 }, 'game_count_range'],
        [{ pointsTable: { preset: 'custom', values: [1, 2] } }, 'points_rising'],
        [{ pointsTable: { preset: 'custom', values: [0, 0] } }, 'points_flat'],
        [{ pointsTable: { preset: 'custom', values: [1] } }, 'invalid_points'],
        [{ format: 'ffa' }, 'format_unavailable'],
        [{ format: 'bogus' }, 'invalid_settings'],
        [{ selectionMode: 'pick_ban' }, 'mode_unavailable'],
        [{ hiddenWheel: true }, 'wheel_options_without_wheel'],
        [{ selectionMode: 'lucky_wheel', vetoAllowance: 10 }, 'veto_allowance_range'],
      ]

      for (const [changes, code] of cases) {
        const response = await create(cookie, poll({ settings: { ...TEST_SETTINGS, ...changes } }))
        expect(response.status).toBe(400)
        expect(response.statusText).toBe(code)
      }
      expect(await eventRows()).toEqual([])
      expect(await testDb.db.select().from(sessions)).toEqual([])
    })
  })

  describe('GET /api/e/:slug', () => {
    it('requires sign-in', async () => {
      expect((await read(undefined, 'freitags-zocken-k7q2')).status).toBe(401)
    })

    it('shows the Event and its Slots in time order to a Member', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll({ slots: ['2090-10-31T19:00', '2090-10-30T20:30'] }))).json()

      const response = await read(cookie, slug)

      expect(response.status).toBe(200)
      const { event, slots, sessions } = await response.json()
      expect(event).toEqual({
        slug,
        name: 'Freitags-Zocken',
        phase: 'poll',
        isHost: true,
      })
      expect(sessions).toEqual([{ id: expect.any(String), number: null, startsAt: null, previousStartsAt: null }])
      expect(response.ok).toBe(true)
      expect(slots.map((slot: { startsAt: string }) => slot.startsAt)).toEqual([
        '2090-10-30T19:30:00.000Z',
        '2090-10-31T18:00:00.000Z',
      ])
      expect(slots[0]).toEqual({ id: expect.any(String), startsAt: expect.any(String), past: false })
    })

    it('shows the Date of a direct Event and no Slots, and no number for its one Session (#70)', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, direct({ startsAt: ['2090-11-07T20:00'] }))).json()

      const { event, slots, sessions, missingDates } = await (await read(cookie, slug)).json()

      expect(event).toMatchObject({ phase: 'date_set' })
      expect(sessions).toEqual([{ id: expect.any(String), number: null, startsAt: '2090-11-07T19:00:00.000Z', previousStartsAt: null, notes: [] }])
      expect(missingDates).toBe(0)
      expect(slots).toEqual([])
    })

    it('numbers the dated Sessions in Date order and counts the Sessions still missing a Date', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll({ sessions: 3, slots: slotsOnDays(3) }))).json()

      const { sessions, missingDates } = await (await read(cookie, slug)).json()
      expect(sessions).toEqual([
        { id: expect.any(String), number: null, startsAt: null, previousStartsAt: null },
        { id: expect.any(String), number: null, startsAt: null, previousStartsAt: null },
        { id: expect.any(String), number: null, startsAt: null, previousStartsAt: null },
      ])
      expect(missingDates).toBe(3)

      const { slug: directSlug } = await (await create(cookie, direct({ sessions: 2, startsAt: ['2090-11-08T19:00', '2090-11-07T20:00'] }))).json()
      const { sessions: dated, missingDates: none } = await (await read(cookie, directSlug)).json()
      expect(dated.map((session: { number: number }) => session.number)).toEqual([1, 2])
      expect(dated.map((session: { startsAt: string }) => session.startsAt)).toEqual(['2090-11-07T19:00:00.000Z', '2090-11-08T18:00:00.000Z'])
      expect(none).toBe(0)
    })

    it('shows the settings to the Host and to a Member (#144)', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll())).json()
      const { cookie: memberCookie } = await signIn(testDb.db, member)
      const [row] = await eventRows()
      const guest = (await testDb.db.select().from(users)).find(user => user.id !== row!.hostId)
      await testDb.db.insert(eventMembers).values({ eventId: row!.id, userId: guest!.id })

      expect((await (await read(cookie, slug)).json()).settings).toEqual(TEST_SETTINGS)
      expect((await (await read(memberCookie, slug)).json()).settings).toEqual(TEST_SETTINGS)
    })

    it('shows null for an Event from before 1.3 that was never set up (#144)', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll())).json()
      await testDb.db.update(events).set({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null })

      expect((await (await read(cookie, slug)).json()).settings).toBeNull()
    })

    it('answers 404 to a User who is not a Member, so Events cannot be probed', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll())).json()
      const { cookie: memberCookie } = await signIn(testDb.db, member)

      expect((await read(memberCookie, slug)).status).toBe(404)
    })

    it('answers 404 for an unknown Event', async () => {
      const cookie = await signInAsHost()

      expect((await read(cookie, 'nie-gab-es-k7q2')).status).toBe(404)
    })

    it('answers 410 "Event deleted" to a former Member of a deleted Event, and 404 to anyone else', async () => {
      const cookie = await signInAsHost()
      const { slug } = await (await create(cookie, poll())).json()
      const { cookie: memberCookie } = await signIn(testDb.db, member)
      await testDb.db.update(events).set({ deletedAt: new Date() })

      const former = await read(cookie, slug)
      expect(former.status).toBe(410)
      expect(former.statusText).toBe('Event deleted')
      expect((await read(memberCookie, slug)).status).toBe(404)
    })
  })
})

function poll(overrides: Record<string, unknown> = {}) {
  return { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS, ...overrides }
}

function direct(overrides: Record<string, unknown> = {}) {
  return { name: 'Abend', dateMode: 'direct', sessions: 1, startsAt: ['2090-11-07T20:00'], settings: TEST_SETTINGS, ...overrides }
}

function slotsOnDays(count: number) {
  return Array.from({ length: count }, (_, day) => `2090-11-${String(day + 1).padStart(2, '0')}T20:00`)
}
