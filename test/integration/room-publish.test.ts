import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import rotateInvite from '../../server/api/e/[slug]/rotate.post'
import addSession from '../../server/api/e/[slug]/sessions/index.post'
import removeSession from '../../server/api/e/[slug]/sessions/[id].delete'
import reopenSession from '../../server/api/e/[slug]/sessions/[id]/reopen.post'
import rescheduleSession from '../../server/api/e/[slug]/sessions/[id]/reschedule.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import editSlot from '../../server/api/e/[slug]/slots/[slotId].patch'
import deleteSlot from '../../server/api/e/[slug]/slots/[slotId].delete'
import addSlot from '../../server/api/e/[slug]/slots/index.post'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import joinInvite from '../../server/api/invite/[invite].post'
import { eventMembers, events, pollSlots, pollVotes, sessions, users } from '../../server/db/schema'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Every change of an Event tells its room, once, after the commit (#156, spec #153 § Room notifier); a refused
// request tells nobody. The in-memory notifier stands in for the Worker, like the in-memory image store.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const stranger = { provider: 'twitch', id: '3', name: 'Fremd', email: 'stranger@example.com', image: undefined } as const

describe('publishing to the room', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/rotate': rotateInvite,
      'POST /api/e/:slug/sessions': addSession,
      'DELETE /api/e/:slug/sessions/:id': removeSession,
      'POST /api/e/:slug/sessions/:id/reopen': reopenSession,
      'POST /api/e/:slug/sessions/:id/reschedule': rescheduleSession,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/e/:slug/slots': addSlot,
      'PATCH /api/e/:slug/slots/:slotId': editSlot,
      'DELETE /api/e/:slug/slots/:slotId': deleteSlot,
      'PUT /api/e/:slug/slots/:slotId/vote': putVote,
      'POST /api/invite/:invite': joinInvite,
    }, { roomNotifier: notifier })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    notifier.clear()
    await testDb.db.delete(pollVotes)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** A poll Event with two Sessions and three Slots, a Host and a Member who has joined. */
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
    const [memberRow] = await testDb.db.select().from(users).where(eq(users.email, member.email))
    await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: memberRow!.id })
    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)).map(row => row.id)
    notifier.clear()
    return { slug, eventId: eventRow!.id, slotIds, hostCookie, memberCookie, strangerCookie, invite: new URL(inviteUrl).pathname.slice('/e/'.length) }
  }

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  const types = (eventId: string) => notifier.messages(eventId).map(message => message.type)

  it('publishes exactly one event.changed, stamped with the server time, for every change a Member or the Host makes', async () => {
    const { slug, eventId, slotIds, hostCookie, memberCookie } = await pollEvent()
    const steps: [string, () => Promise<Response>][] = [
      ['a Vote', () => send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, memberCookie, { value: 'yes' })],
      ['a Vote with a Note', () => send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, memberCookie, { value: 'maybe', note: 'ab 21 Uhr' })],
      ['a new Slot', () => send('POST', `/api/e/${slug}/slots`, hostCookie, { startsAt: '2090-11-02T19:00' })],
      ['a Slot edit', () => send('PATCH', `/api/e/${slug}/slots/${slotIds[2]}`, hostCookie, { startsAt: '2090-11-03T19:00' })],
      ['a Slot removal', () => send('DELETE', `/api/e/${slug}/slots/${slotIds[2]}`, hostCookie)],
      ['setting a Date', () => send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })],
      ['adding a Session', () => send('POST', `/api/e/${slug}/sessions`, hostCookie, {})],
      ['changing the settings', () => send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 12 } })],
      ['rotating the Invite link', () => send('POST', `/api/e/${slug}/rotate`, hostCookie)],
    ]

    // The changes the Activity feed logs (#159) publish their entry after `event.changed`.
    const logged = new Set(['setting a Date', 'adding a Session', 'changing the settings'])

    for (const [name, step] of steps) {
      notifier.clear()
      const before = Date.now()
      const response = await step()

      expect(response.status, name).toBe(200)
      expect(types(eventId), name).toEqual(logged.has(name) ? ['event.changed', 'activity.added'] : ['event.changed'])
      expect(notifier.messages(eventId)[0], name).toMatchObject({ v: 1, serverTime: expect.any(Number) })
      expect(notifier.messages(eventId)[0]!.serverTime, name).toBeGreaterThanOrEqual(before)
    }
  })

  it('publishes for the Session actions: reschedule, reopen, remove', async () => {
    const { slug, eventId, slotIds, hostCookie } = await pollEvent()
    await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })
    const dated = (await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId))).find(row => row.startsAt !== null)
    const sessionPath = `/api/e/${slug}/sessions/${dated!.id}`

    for (const [name, step] of [
      ['a Reschedule', () => send('POST', `${sessionPath}/reschedule`, hostCookie, { startsAt: '2090-12-01T19:00' })],
      ['a Reopen', () => send('POST', `${sessionPath}/reopen`, hostCookie)],
      ['a Session removal', () => send('DELETE', sessionPath, hostCookie)],
    ] as const) {
      notifier.clear()
      expect((await step()).status, name).toBe(200)
      expect(types(eventId), name).toEqual(['event.changed', 'activity.added'])
    }
  })

  it('publishes when someone joins through the Invite link, and not when a Member joins again', async () => {
    const { eventId, invite, strangerCookie } = await pollEvent()

    expect((await send('POST', `/api/invite/${invite}`, strangerCookie)).status).toBe(200)
    expect(types(eventId)).toEqual(['event.changed', 'activity.added', 'member.joined'])

    notifier.clear()
    expect((await send('POST', `/api/invite/${invite}`, strangerCookie)).status).toBe(200)
    expect(types(eventId)).toEqual([])
  })

  it('publishes nothing for a request that is refused', async () => {
    const { slug, eventId, slotIds, hostCookie, memberCookie, strangerCookie } = await pollEvent()
    const refusals: [string, number, () => Promise<Response>][] = [
      ['signed out', 401, () => send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, undefined, { value: 'yes' })],
      ['a stranger voting', 404, () => send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, strangerCookie, { value: 'yes' })],
      ['a bad Vote', 400, () => send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, memberCookie, { value: 'perhaps' })],
      ['a Member adding a Slot', 403, () => send('POST', `/api/e/${slug}/slots`, memberCookie, { startsAt: '2090-11-02T19:00' })],
      ['a Member setting a Date', 403, () => send('POST', `/api/e/${slug}/confirm`, memberCookie, { slotId: slotIds[0] })],
      ['a Member adding a Session', 403, () => send('POST', `/api/e/${slug}/sessions`, memberCookie, {})],
      ['a Member rotating the link', 403, () => send('POST', `/api/e/${slug}/rotate`, memberCookie)],
      ['a Member changing the settings', 403, () => send('PATCH', `/api/e/${slug}/settings`, memberCookie, { settings: { gameCount: 12 } })],
      ['bad settings', 400, () => send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 0 } })],
      ['a Slot in the past', 400, () => send('POST', `/api/e/${slug}/slots`, hostCookie, { startsAt: '2000-01-01T19:00' })],
      ['an unknown invite', 404, () => send('POST', '/api/invite/nobody-0000', strangerCookie)],
    ]

    for (const [name, status, step] of refusals) {
      expect((await step()).status, name).toBe(status)
      expect(types(eventId), name).toEqual([])
    }
  })

  it('answers without waiting for the Worker, and still publishes (#202)', async () => {
    const { slug, slotIds, memberCookie } = await pollEvent()
    // A Worker that takes as long as the test likes: the publish records its messages, then waits for `release`.
    let release!: () => void
    const gate = new Promise<void>(resolve => (release = resolve))
    const published: string[] = []
    const slowWorker = {
      async publish(_eventId: string, messages: { type: string }[]) {
        published.push(...messages.map(message => message.type))
        await gate
      },
    }
    const slowRequest = createTestServer(testDb.db, { 'PUT /api/e/:slug/slots/:slotId/vote': putVote }, { roomNotifier: slowWorker })
    // Guards the red run: without the fix the request waits on the gate, and this race settles instead of hanging.
    let timer: ReturnType<typeof setTimeout> | undefined
    const stalled = new Promise<'stalled'>(resolve => (timer = setTimeout(() => resolve('stalled'), 1000)))

    try {
      const answer = await Promise.race([
        slowRequest(`/api/e/${slug}/slots/${slotIds[0]}/vote`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'cookie': memberCookie },
          body: JSON.stringify({ value: 'yes' }),
        }),
        stalled,
      ])

      expect(answer, 'the answer waited for the Worker').not.toBe('stalled')
      expect((answer as Response).status).toBe(200)
      expect(published).toEqual(['event.changed'])
    }
    finally {
      clearTimeout(timer)
      release()
    }
  })

  it('tells only the room of the Event that changed', async () => {
    const { slug, eventId, slotIds, memberCookie } = await pollEvent()

    await send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, memberCookie, { value: 'yes' })

    expect(types(eventId)).toEqual(['event.changed'])
    expect(types('another-event')).toEqual([])
  })
})
