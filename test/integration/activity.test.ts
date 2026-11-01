import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import getActivity from '../../server/api/e/[slug]/activity.get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import addSession from '../../server/api/e/[slug]/sessions/index.post'
import removeSession from '../../server/api/e/[slug]/sessions/[id].delete'
import reopenSession from '../../server/api/e/[slug]/sessions/[id]/reopen.post'
import rescheduleSession from '../../server/api/e/[slug]/sessions/[id]/reschedule.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import joinInvite from '../../server/api/invite/[invite].post'
import { activity, eventMembers, eventPoolGames, events, games, pollSlots, sessions, users } from '../../server/db/schema'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityEntry, ActivityPage } from '../../shared/activity'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Activity feed (#159, spec #153 § Activity feed): every listed change writes exactly one entry in its own
// transaction and publishes it once, after the commit; a refused request writes and publishes nothing.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const stranger = { provider: 'twitch', id: '3', name: 'Fremd', email: 'stranger@example.com', image: undefined } as const

describe('the Activity feed', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug/activity': getActivity,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/sessions': addSession,
      'DELETE /api/e/:slug/sessions/:id': removeSession,
      'POST /api/e/:slug/sessions/:id/reopen': reopenSession,
      'POST /api/e/:slug/sessions/:id/reschedule': rescheduleSession,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/invite/:invite': joinInvite,
    }, { roomNotifier: notifier })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    notifier.clear()
    await testDb.db.delete(eventPoolGames)
    await testDb.db.delete(games)
    await testDb.db.delete(activity)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** A poll Event with two Sessions and three Slots, a Host and a Member who has joined (without an entry). */
  async function pollEvent() {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const memberCookie = (await signIn(testDb.db, member)).cookie
    const strangerCookie = (await signIn(testDb.db, stranger)).cookie
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: ['2090-10-30T20:30', '2090-10-31T19:00', '2090-11-01T19:00'], settings: TEST_SETTINGS }),
    })
    const { slug, inviteUrl } = await created.json() as { slug: string, inviteUrl: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const [hostRow] = await testDb.db.select().from(users).where(eq(users.email, host.email))
    const [memberRow] = await testDb.db.select().from(users).where(eq(users.email, member.email))
    const [strangerRow] = await testDb.db.select().from(users).where(eq(users.email, stranger.email))
    await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: memberRow!.id })
    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)).map(row => row.id)
    notifier.clear()
    return {
      slug,
      eventId: eventRow!.id,
      slotIds,
      hostCookie,
      memberCookie,
      strangerCookie,
      hostId: hostRow!.id,
      strangerId: strangerRow!.id,
      invite: new URL(inviteUrl).pathname.slice('/e/'.length),
    }
  }

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async function feed(cookie: string, slug: string, query = ''): Promise<ActivityPage> {
    const response = await send('GET', `/api/e/${slug}/activity${query}`, cookie)
    expect(response.status).toBe(200)
    return await response.json() as ActivityPage
  }

  /** The `activity.added` messages the room got, in order. */
  function added(eventId: string): ActivityEntry[] {
    return notifier.messages(eventId).flatMap(message => message.type === 'activity.added' ? [message.entry] : [])
  }

  async function datedSession(eventId: string) {
    const rows = await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))
    return rows.find(row => row.startsAt !== null)!
  }

  describe('what a change writes', () => {
    it('writes member_joined with the joiner as the actor, once, and publishes it', async () => {
      const { slug, eventId, invite, strangerCookie, hostCookie, strangerId } = await pollEvent()

      expect((await send('POST', `/api/invite/${invite}`, strangerCookie)).status).toBe(200)

      const { entries } = await feed(hostCookie, slug)
      expect(entries).toEqual([
        { id: expect.any(String), type: 'member_joined', at: expect.any(String), actor: { id: strangerId, name: 'Fremd' }, params: {}, people: {}, games: {} },
      ])
      expect(notifier.messages(eventId).map(message => message.type)).toEqual(['event.changed', 'activity.added', 'member.joined'])
      expect(added(eventId)).toEqual(entries)
    })

    it('writes nothing when a Member joins again, and nothing for creating an Event', async () => {
      const { slug, eventId, invite, strangerCookie, hostCookie } = await pollEvent()
      expect((await feed(hostCookie, slug)).entries).toEqual([])

      await send('POST', `/api/invite/${invite}`, strangerCookie)
      notifier.clear()
      expect((await send('POST', `/api/invite/${invite}`, strangerCookie)).status).toBe(200)

      expect((await feed(hostCookie, slug)).entries).toHaveLength(1)
      expect(added(eventId)).toEqual([])
    })

    it('writes date_set with the Session number the Session is shown with, and the Date', async () => {
      const { slug, eventId, slotIds, hostCookie, hostId } = await pollEvent()

      const response = await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })
      const { startsAt } = await response.json() as { startsAt: string }

      const session = await datedSession(eventId)
      const { entries } = await feed(hostCookie, slug)
      expect(entries).toEqual([
        { id: expect.any(String), type: 'date_set', at: expect.any(String), actor: { id: hostId, name: 'Hostess' }, params: { sessionId: session.id, number: 1, startsAt }, people: {}, games: {} },
      ])
      expect(added(eventId)).toEqual(entries)
    })

    it('writes date_rescheduled with the old and the new Date and the number after the move', async () => {
      const { slug, eventId, slotIds, hostCookie } = await pollEvent()
      const first = await (await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[1] })).json() as { startsAt: string }
      await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[2] })
      const moved = (await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))).find(row => row.startsAt?.toISOString() === first.startsAt)!
      notifier.clear()

      // The first Session moves behind the second one, so it is Session 2 afterwards.
      const response = await send('POST', `/api/e/${slug}/sessions/${moved.id}/reschedule`, hostCookie, { startsAt: '2090-12-01T19:00' })
      const { startsAt } = await response.json() as { startsAt: string }

      const [entry] = (await feed(hostCookie, slug)).entries
      expect(entry).toMatchObject({ type: 'date_rescheduled', params: { sessionId: moved.id, number: 2, from: first.startsAt, to: startsAt } })
      expect(added(eventId)).toEqual([entry])
    })

    it('writes date_reopened with the withdrawn Date and the number the Session had', async () => {
      const { slug, eventId, slotIds, hostCookie } = await pollEvent()
      const confirmed = await (await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })).json() as { startsAt: string }
      const session = await datedSession(eventId)
      notifier.clear()

      expect((await send('POST', `/api/e/${slug}/sessions/${session.id}/reopen`, hostCookie)).status).toBe(200)

      const [entry] = (await feed(hostCookie, slug)).entries
      expect(entry).toMatchObject({ type: 'date_reopened', params: { sessionId: session.id, number: 1, previousStartsAt: confirmed.startsAt } })
      expect(added(eventId)).toEqual([entry])
    })

    it('writes session_added for a Session with and without a Date', async () => {
      const { slug, eventId, hostCookie } = await pollEvent()

      const undated = await (await send('POST', `/api/e/${slug}/sessions`, hostCookie, {})).json() as { id: string }
      const dated = await (await send('POST', `/api/e/${slug}/sessions`, hostCookie, { startsAt: '2090-12-05T19:00' })).json() as { id: string }

      const { entries } = await feed(hostCookie, slug)
      expect(entries.map(entry => [entry.type, entry.params])).toEqual([
        ['session_added', { sessionId: dated.id, startsAt: expect.stringMatching(/^2090-12-05T/) }],
        ['session_added', { sessionId: undated.id, startsAt: null }],
      ])
      expect(added(eventId)).toEqual(entries.toReversed())
    })

    it('writes session_removed with the number and Date the Session had', async () => {
      const { slug, eventId, slotIds, hostCookie } = await pollEvent()
      const confirmed = await (await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })).json() as { startsAt: string }
      const session = await datedSession(eventId)
      notifier.clear()

      expect((await send('DELETE', `/api/e/${slug}/sessions/${session.id}`, hostCookie)).status).toBe(200)

      const [entry] = (await feed(hostCookie, slug)).entries
      expect(entry).toMatchObject({ type: 'session_removed', params: { sessionId: session.id, number: 1, startsAt: confirmed.startsAt } })
      expect(added(eventId)).toEqual([entry])
    })

    it('writes an undated Session removal with null number and Date', async () => {
      const { slug, eventId, slotIds, hostCookie } = await pollEvent()
      await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })
      const undated = (await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))).find(row => row.startsAt === null)!
      notifier.clear()

      expect((await send('DELETE', `/api/e/${slug}/sessions/${undated.id}`, hostCookie)).status).toBe(200)

      const [entry] = (await feed(hostCookie, slug)).entries
      expect(entry).toMatchObject({ type: 'session_removed', params: { sessionId: undated.id, number: null, startsAt: null } })
      expect(added(eventId)).toEqual([entry])
    })

    it('writes game_count_changed and team_size_changed for a settings change, one each', async () => {
      const { slug, eventId, hostCookie } = await pollEvent()

      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 12, teamSize: 4 } })).status).toBe(200)

      const { entries } = await feed(hostCookie, slug)
      expect(entries).toHaveLength(2)
      expect(entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'game_count_changed', params: { from: 10, to: 12 } }),
        expect.objectContaining({ type: 'team_size_changed', params: { from: 3, to: 4 } }),
      ]))
      expect(added(eventId)).toHaveLength(2)
      expect(added(eventId)).toEqual(expect.arrayContaining(entries))
    })

    it('writes nothing for a settings change that touches neither count nor team size, nor for pools only', async () => {
      const { slug, eventId, hostCookie, hostId } = await pollEvent()
      const [game] = await testDb.db.insert(games).values({ name: 'Geheimspiel', createdBy: hostId }).returning()

      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { teamCount: 3, pointsTable: { preset: 'linear', values: [2, 1, 0] } } })).status).toBe(200)
      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { pools: { main: [game!.id] } })).status).toBe(200)

      expect((await feed(hostCookie, slug)).entries).toEqual([])
      expect(added(eventId)).toEqual([])
    })

    it('writes nothing for a Pool preview change (#225)', async () => {
      const { slug, eventId, hostCookie } = await pollEvent()

      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { poolPreview: false } })).status).toBe(200)
      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { poolPreview: true } })).status).toBe(200)

      expect((await feed(hostCookie, slug)).entries).toEqual([])
      expect(added(eventId)).toEqual([])
    })

    it('writes nothing when an Event is set up for the first time', async () => {
      const { slug, eventId, hostCookie } = await pollEvent()
      await testDb.db.update(events).set({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null }).where(eq(events.id, eventId))

      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: TEST_SETTINGS })).status).toBe(200)

      expect((await feed(hostCookie, slug)).entries).toEqual([])
      expect(added(eventId)).toEqual([])
    })

    it('carries no game in any entry, however the pools change', async () => {
      const { slug, hostCookie, hostId } = await pollEvent()
      const [game] = await testDb.db.insert(games).values({ name: 'Geheimspiel', createdBy: hostId }).returning()

      await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 12, teamSize: 4 }, pools: { main: [game!.id], tiebreaker: [game!.id] } })

      const raw = await (await send('GET', `/api/e/${slug}/activity`, hostCookie)).text()
      expect(raw).toContain('game_count_changed')
      expect(raw).not.toContain(game!.id)
      expect(raw).not.toContain('Geheimspiel')
    })
  })

  describe('a refused request', () => {
    it('writes no entry and publishes nothing', async () => {
      const { slug, eventId, slotIds, hostCookie, memberCookie, strangerCookie } = await pollEvent()
      const undated = (await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId)))[0]!
      const refusals: [string, number, () => Promise<Response>][] = [
        ['a Member setting a Date', 403, () => send('POST', `/api/e/${slug}/confirm`, memberCookie, { slotId: slotIds[0] })],
        ['a Member adding a Session', 403, () => send('POST', `/api/e/${slug}/sessions`, memberCookie, {})],
        ['a Member changing the settings', 403, () => send('PATCH', `/api/e/${slug}/settings`, memberCookie, { settings: { gameCount: 12 } })],
        ['a stranger joining with a wrong link', 404, () => send('POST', '/api/invite/nobody-0000', strangerCookie)],
        ['bad settings', 400, () => send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 0 } })],
        ['a bad Date for a new Session', 400, () => send('POST', `/api/e/${slug}/sessions`, hostCookie, { startsAt: 'morgen' })],
        ['a Reopen of a Session without a Date', 409, () => send('POST', `/api/e/${slug}/sessions/${undated.id}/reopen`, hostCookie)],
        ['a Reschedule of a Session without a Date', 409, () => send('POST', `/api/e/${slug}/sessions/${undated.id}/reschedule`, hostCookie, { startsAt: '2090-12-01T19:00' })],
        ['a Reschedule with a bad time', 400, () => send('POST', `/api/e/${slug}/sessions/${undated.id}/reschedule`, hostCookie, { startsAt: 'bald' })],
        ['an unknown game in a pool', 400, () => send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 12 }, pools: { main: ['00000000-0000-4000-8000-000000000000'] } })],
        ['a Slot that does not exist', 404, () => send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: '00000000-0000-4000-8000-000000000000' })],
      ]

      for (const [name, status, step] of refusals) {
        expect((await step()).status, name).toBe(status)
      }

      expect(await testDb.db.select().from(activity)).toEqual([])
      expect(notifier.messages(eventId)).toEqual([])
    })
  })

  describe('GET /api/e/:slug/activity', () => {
    it('is for Members only: 401 signed out, 404 for a stranger', async () => {
      const { slug, hostCookie, memberCookie, strangerCookie } = await pollEvent()

      expect((await send('GET', `/api/e/${slug}/activity`, undefined)).status).toBe(401)
      expect((await send('GET', `/api/e/${slug}/activity`, strangerCookie)).status).toBe(404)
      expect((await send('GET', `/api/e/${slug}/activity`, memberCookie)).status).toBe(200)
      expect((await send('GET', `/api/e/${slug}/activity`, hostCookie)).status).toBe(200)
    })

    it('answers newest first and pages with before and next', async () => {
      const { slug, hostCookie } = await pollEvent()
      for (let index = 0; index < 5; index++) await send('POST', `/api/e/${slug}/sessions`, hostCookie, { startsAt: `2090-12-0${index + 1}T19:00` })

      const all = await feed(hostCookie, slug)
      expect(all.entries.map(entry => entry.params)).toEqual([5, 4, 3, 2, 1].map(day => ({ sessionId: expect.any(String), startsAt: expect.stringMatching(new RegExp(`^2090-12-0${day}T`)) })))
      expect(all.next).toBeNull()

      const first = await feed(hostCookie, slug, '?limit=2')
      expect(first.entries.map(entry => entry.id)).toEqual(all.entries.slice(0, 2).map(entry => entry.id))
      expect(first.next).toBe(first.entries[1]!.id)

      const second = await feed(hostCookie, slug, `?limit=2&before=${first.next}`)
      expect(second.entries.map(entry => entry.id)).toEqual(all.entries.slice(2, 4).map(entry => entry.id))
      expect(second.next).toBe(second.entries[1]!.id)

      const last = await feed(hostCookie, slug, `?limit=2&before=${second.next}`)
      expect(last.entries.map(entry => entry.id)).toEqual(all.entries.slice(4).map(entry => entry.id))
      expect(last.next).toBeNull()
    })

    it('keeps the order of entries written in one transaction', async () => {
      const { slug, hostCookie } = await pollEvent()
      await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 12, teamSize: 4 } })
      await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 14, teamSize: 5 } })

      const all = await feed(hostCookie, slug)
      const paged = [
        ...(await feed(hostCookie, slug, '?limit=1')).entries,
        ...(await feed(hostCookie, slug, `?limit=3&before=${all.entries[0]!.id}`)).entries,
      ]

      expect(all.entries.map(entry => entry.params)).toEqual(expect.arrayContaining([{ from: 12, to: 14 }, { from: 4, to: 5 }]))
      expect(all.entries.slice(0, 2).every(entry => (entry.params as { to: number }).to >= 5)).toBe(true)
      expect(paged.map(entry => entry.id)).toEqual(all.entries.map(entry => entry.id))
    })

    it('refuses a cursor it cannot use with 400 invalid_cursor', async () => {
      const { slug, hostCookie } = await pollEvent()
      await send('POST', `/api/e/${slug}/sessions`, hostCookie, {})

      for (const query of ['?before=nope', '?before=00000000-0000-4000-8000-000000000000']) {
        const response = await send('GET', `/api/e/${slug}/activity${query}`, hostCookie)
        expect(response.status, query).toBe(400)
        expect(response.statusText, query).toBe('invalid_cursor')
      }
    })

    it('refuses a limit it cannot use with 400 invalid_value (N5)', async () => {
      const { slug, hostCookie } = await pollEvent()
      await send('POST', `/api/e/${slug}/sessions`, hostCookie, {})

      for (const query of ['?limit=0', '?limit=abc', '?limit=101']) {
        const response = await send('GET', `/api/e/${slug}/activity${query}`, hostCookie)
        expect(response.status, query).toBe(400)
        expect(response.statusText, query).toBe('invalid_value')
      }
    })

    it('does not page into another Event with the id of one of its entries', async () => {
      const first = await pollEvent()
      await send('POST', `/api/e/${first.slug}/sessions`, first.hostCookie, {})
      const foreign = (await feed(first.hostCookie, first.slug)).entries[0]!
      const created = await send('POST', '/api/e', first.hostCookie, { name: 'Anderes', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS })
      const { slug: other } = await created.json() as { slug: string }

      const response = await send('GET', `/api/e/${other}/activity?before=${foreign.id}`, first.hostCookie)

      expect(response.status).toBe(400)
    })
  })
})
