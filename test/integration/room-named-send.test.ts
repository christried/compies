import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineEventHandler } from 'h3'
import createEvent from '../../server/api/e/index.post'
import { eventMembers, events, pollSlots, users } from '../../server/db/schema'
import { apiError } from '../../server/utils/errors'
import { changeEvent } from '../../server/utils/event-access'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { asRecord } from '../../shared/record'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// A send to named Users of an Event (#227): the named messages reach only those Users' sockets, the broadcast still
// goes to the whole room, and a change that throws sends neither. The in-memory notifier records each send's Users.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const

describe('a send to named Users from a change', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      // A test-only change: named Users get a message, and `refuse` makes the rule refuse after it queued the send.
      'POST /api/e/:slug/named-send': defineEventHandler(event => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ body, publishTo }) => {
        const { to, refuse } = asRecord(body)
        publishTo(Array.isArray(to) ? to.map(String) : [], { type: 'team.nameReset', team: 1 })
        if (refuse === true) throw apiError('wrong_phase')
        return { done: true }
      })),
    }, { roomNotifier: notifier })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    notifier.clear()
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** A poll Event with a Host, and the Host's User id. */
  async function hostedEvent() {
    setAllowlist({ hosts: 'discord:1' })
    const { cookie } = await signIn(testDb.db, host)
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS }),
    })
    const { slug } = await created.json() as { slug: string }
    const [event] = await testDb.db.select({ id: events.id }).from(events)
    const [hostUser] = await testDb.db.select({ id: users.id }).from(users).where(eq(users.email, host.email))
    return { cookie, slug, eventId: event!.id, hostId: hostUser!.id }
  }

  function named(cookie: string, slug: string, body: unknown) {
    return request(`/api/e/${slug}/named-send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  it('broadcasts event.changed to the whole room and sends the named message to the named Users only (#227)', async () => {
    const { cookie, slug, eventId, hostId } = await hostedEvent()

    const response = await named(cookie, slug, { to: [hostId] })

    expect(response.status).toBe(200)
    expect(notifier.sends(eventId)).toEqual([
      { to: null, messages: [expect.objectContaining({ type: 'event.changed', v: 1 })] },
      { to: [hostId], messages: [expect.objectContaining({ type: 'team.nameReset', team: 1, v: 1 })] },
    ])
  })

  it('publishes nothing for a change that throws after it queued a named send (#227)', async () => {
    const { cookie, slug, eventId, hostId } = await hostedEvent()

    const response = await named(cookie, slug, { to: [hostId], refuse: true })

    expect(response.status).toBe(409)
    expect(notifier.sends(eventId)).toEqual([])
    expect(notifier.messages(eventId)).toEqual([])
  })
})
