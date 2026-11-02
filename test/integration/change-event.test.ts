import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineEventHandler } from 'h3'
import createEvent from '../../server/api/e/index.post'
import rotateInvite from '../../server/api/e/[slug]/rotate.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import joinInvite from '../../server/api/invite/[invite].post'
import { draws, eventMembers, events, games, pollSlots, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { apiError } from '../../server/utils/errors'
import { changeEvent } from '../../server/utils/event-access'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The one place an Event changes (#183): what runs after the transaction commits, and only then. The step after the
// commit is the room publish (#156); the in-memory notifier records what it sent.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const newcomer = { provider: 'twitch', id: '3', name: 'Neu', email: 'neu@example.com', image: undefined } as const

describe('changeEvent', () => {
  const clock = testClock('2090-10-30T10:00:00.000Z')
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const types = (eventId: string) => notifier.messages(eventId).map(message => message.type)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'POST /api/e/:slug/rotate': rotateInvite,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/invite/:invite': joinInvite,
      // A change that queues messages and then either finishes or is refused by a rule.
      // A change that answers the request's clock, and one that stays out of the Host's reach.
      'POST /api/e/:slug/probe-now': defineEventHandler(event => changeEvent(event, { lock: 'update' }, async ({ now }) => ({ now: now.toISOString() }))),
      'POST /api/e/:slug/probe': defineEventHandler(event => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ body, publish }) => {
        publish({ type: 'event.changed' })
        if (body !== null && typeof body === 'object' && 'refuse' in body) throw apiError('wrong_phase')
        return { done: true }
      })),
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    notifier.clear()
    clock.set('2090-10-30T10:00:00.000Z')
    await testDb.db.delete(draws)
    await testDb.db.delete(rounds)
    await testDb.db.delete(games)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function hostedEvent() {
    setAllowlist({ hosts: 'discord:1' })
    const { cookie } = await signIn(testDb.db, host)
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS }),
    })
    const { slug, inviteUrl } = await created.json()
    const [event] = await testDb.db.select({ id: events.id }).from(events)
    return { cookie, slug, eventId: event!.id, invite: new URL(inviteUrl).pathname.slice('/e/'.length) }
  }

  function probe(cookie: string | undefined, slug: string, body: unknown = {}) {
    return request(`/api/e/${slug}/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  it('publishes once for a change that committed, and does not repeat a message the change queued itself', async () => {
    const { cookie, slug, eventId } = await hostedEvent()

    const response = await probe(cookie, slug)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ done: true })
    expect(types(eventId)).toEqual(['event.changed'])
  })

  it('publishes nothing for a change a rule refused, and drops its queued messages', async () => {
    const { cookie, slug, eventId } = await hostedEvent()

    const response = await probe(cookie, slug, { refuse: true })

    expect(response.status).toBe(409)
    expect(types(eventId)).toEqual([])
  })

  it('publishes nothing when the request is refused before the change (401, 404)', async () => {
    const { slug, eventId } = await hostedEvent()
    const { cookie: stranger } = await signIn(testDb.db, newcomer)

    expect((await probe(undefined, slug)).status).toBe(401)
    expect((await probe(stranger, slug)).status).toBe(404)
    expect(types(eventId)).toEqual([])
  })

  it('hands the change the request clock, read once: moving the clock moves it', async () => {
    const { cookie, slug } = await hostedEvent()
    const answer = async () => (await (await request(`/api/e/${slug}/probe-now`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' })).json() as { now: string }).now

    expect(await answer()).toBe('2090-10-30T10:00:00.000Z')
    clock.advance(90_000)
    expect(await answer()).toBe('2090-10-30T10:01:30.000Z')
  })

  describe('settling due draws (#259)', () => {
    /** A draw of the Event whose stop has passed under the test clock and that nobody settled. */
    async function dueDraw(eventId: string, hostId: string) {
      const [game] = await testDb.db.insert(games).values({ name: 'Halo', createdBy: hostId }).returning({ id: games.id })
      const at = new Date('2090-10-30T09:00:00.000Z')
      const [round] = await testDb.db.insert(rounds).values({ eventId, startedAt: at }).returning({ id: rounds.id })
      await testDb.db.insert(draws).values({ roundId: round!.id, gameId: game!.id, source: 'pool', kind: 'set', committedAt: at, stopAt: at })
    }
    const outcomes = async () => (await testDb.db.select({ outcome: draws.outcome }).from(draws)).map(row => row.outcome)

    it('settles nothing for a request that is refused (a Member calling a Host-only change, a stranger)', async () => {
      const { invite, slug, eventId } = await hostedEvent()
      const [hostRow] = await testDb.db.select({ id: users.id }).from(users)
      await dueDraw(eventId, hostRow!.id)
      const { cookie: member } = await signIn(testDb.db, newcomer)
      await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: member } })

      expect((await probe(member, slug)).status).toBe(403)
      expect(await outcomes()).toEqual([null])
    })

    it('settles a due draw before the change of a Host who holds the Event lock', async () => {
      const { cookie, slug, eventId } = await hostedEvent()
      const [hostRow] = await testDb.db.select({ id: users.id }).from(users)
      await dueDraw(eventId, hostRow!.id)

      expect((await probe(cookie, slug)).status).toBe(200)
      expect(await outcomes()).toEqual(['set'])
    })

    it('rolls the settle back with a change that throws', async () => {
      const { cookie, slug, eventId } = await hostedEvent()
      const [hostRow] = await testDb.db.select({ id: users.id }).from(users)
      await dueDraw(eventId, hostRow!.id)

      expect((await probe(cookie, slug, { refuse: true })).status).toBe(409)
      expect(await outcomes()).toEqual([null])
    })
  })

  it('publishes for the Event routes that change an Event (rotate, settings)', async () => {
    const { cookie, slug, eventId } = await hostedEvent()

    expect((await request(`/api/e/${slug}/rotate`, { method: 'POST', headers: { cookie } })).status).toBe(200)
    expect(types(eventId)).toEqual(['event.changed'])

    const refused = await request(`/api/e/${slug}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ settings: { gameCount: 0 } }),
    })
    expect(refused.status).toBe(400)
    expect(types(eventId)).toEqual(['event.changed'])

    const changed = await request(`/api/e/${slug}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ settings: { gameCount: 12 } }),
    })
    expect(changed.status).toBe(200)
    // A changed game count also goes into the Activity feed (#159).
    expect(types(eventId)).toEqual(['event.changed', 'event.changed', 'activity.added'])
  })

  it('publishes when someone joins through the Invite link, and not when a Member joins again', async () => {
    const { invite, eventId } = await hostedEvent()
    const { cookie } = await signIn(testDb.db, newcomer)

    await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })
    expect(types(eventId)).toEqual(['event.changed', 'activity.added', 'member.joined'])

    await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })
    expect(types(eventId)).toEqual(['event.changed', 'activity.added', 'member.joined'])
  })
})
