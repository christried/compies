import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import listHome from '../../server/api/e/index.get'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Poll Slots are far in the future so they stay votable. Dates that must be "past" are moved into
// the past directly in the database, which keeps the tests free of a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'guest@example.com', image: undefined } as const

describe('GET /api/e (Home)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e': listHome,
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

  async function signInAs(profile: typeof host | typeof guest, { hostPermission = false } = {}) {
    if (hostPermission) setAllowlist({ hosts: `discord:${profile.id}` })
    const { cookie } = await signIn(testDb.db, profile)
    const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
    return { cookie, id: row!.id }
  }

  async function addMember(eventId: string, userId: string) {
    await testDb.db.insert(eventMembers).values({ eventId, userId })
  }

  /** Creates a Date poll through the create handler and returns its slug, Event id and Slot ids by start. */
  async function createPoll(cookie: string, name: string, slots: string[]) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name, dateMode: 'poll', slots }),
    })
    const { slug } = await response.json()
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const rows = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, event!.id))
    const slotIdAt = (startsAt: string) => rows.find(row => row.startsAt.toISOString() === startsAt)!.id
    return { slug, eventId: event!.id, slotIdAt }
  }

  async function createDate(cookie: string, name: string, startsAt: string) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name, dateMode: 'direct', startsAt: [startsAt] }),
    })
    const { slug } = await response.json()
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return { slug, eventId: event!.id }
  }

  /** Creates an Event with several Sessions in the Date poll (none dated yet) and returns its slug and Event id. */
  async function createSessionPoll(cookie: string, name: string, slots: string[]) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name, dateMode: 'poll', sessions: 2, slots }),
    })
    const { slug } = await response.json()
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return { slug, eventId: event!.id }
  }

  /** Creates an Event with one direct Date per Session and returns its slug and Event id. */
  async function createSessionDates(cookie: string, name: string, startsAt: string[]) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name, dateMode: 'direct', sessions: startsAt.length, startsAt }),
    })
    const { slug } = await response.json()
    const [event] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return { slug, eventId: event!.id }
  }

  function vote(cookie: string, slug: string, slotId: string, value: string) {
    return request(`/api/e/${slug}/slots/${slotId}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ value }),
    })
  }

  function list(cookie: string | undefined) {
    return request('/api/e', { headers: cookie ? { cookie } : {} })
  }

  it('requires a signed-in User', async () => {
    const response = await list(undefined)

    expect(response.status).toBe(401)
  })

  it('returns an empty list for a new User', async () => {
    const newcomer = await signInAs(guest)

    const response = await list(newcomer.cookie)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ events: [] })
  })

  it('lists only the Events the User is a Member of, not deleted ones', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const mine = await createPoll(hostUser.cookie, 'Meine Runde', ['2090-10-30T20:30'])
    const theirs = await createPoll(hostUser.cookie, 'Fremde Runde', ['2090-10-30T20:30'])
    await addMember(mine.eventId, guestUser.id)
    const deleted = await createPoll(hostUser.cookie, 'Gelöschte Runde', ['2090-10-30T20:30'])
    await addMember(deleted.eventId, guestUser.id)
    await testDb.db.update(events).set({ deletedAt: new Date() }).where(eq(events.id, deleted.eventId))

    const { events: listed } = await (await list(guestUser.cookie)).json()

    expect(listed.map((row: { slug: string }) => row.slug)).toEqual([mine.slug])
    expect(listed.map((row: { slug: string }) => row.slug)).not.toContain(theirs.slug)
  })

  it('describes each card: name, Host, phase, Best slot, progress, own status and action', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const poll = await createPoll(hostUser.cookie, 'Freitags-Zocken', ['2090-10-30T20:30', '2090-10-31T19:00'])
    await addMember(poll.eventId, guestUser.id)
    await vote(hostUser.cookie, poll.slug, poll.slotIdAt('2090-10-31T18:00:00.000Z'), 'yes')
    await vote(guestUser.cookie, poll.slug, poll.slotIdAt('2090-10-31T18:00:00.000Z'), 'yes')
    await vote(guestUser.cookie, poll.slug, poll.slotIdAt('2090-10-30T19:30:00.000Z'), 'no')

    const [card] = (await (await list(guestUser.cookie)).json()).events

    expect(card).toEqual({
      slug: poll.slug,
      name: 'Freitags-Zocken',
      host: { name: 'Hostess' },
      phase: 'poll',
      sessionCount: 1,
      missingDates: 1,
      nextSession: null,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      bestSlot: { id: poll.slotIdAt('2090-10-31T18:00:00.000Z'), startsAt: '2090-10-31T18:00:00.000Z' },
      progress: { voted: 1, total: 2 },
      viewerVoted: true,
      isHost: false,
      action: 'view',
    })
  })

  it('marks the Host card as open, and a poll the User has fully voted on as view', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const poll = await createPoll(hostUser.cookie, 'Runde', ['2090-10-30T20:30'])
    await addMember(poll.eventId, guestUser.id)
    await vote(guestUser.cookie, poll.slug, poll.slotIdAt('2090-10-30T19:30:00.000Z'), 'no')

    const hostCard = (await (await list(hostUser.cookie)).json()).events[0]
    const guestCard = (await (await list(guestUser.cookie)).json()).events[0]

    expect(hostCard).toMatchObject({ isHost: true, action: 'open' })
    expect(guestCard).toMatchObject({ isHost: false, viewerVoted: true, action: 'view', bestSlot: null })
  })

  it('orders open polls the User still has to vote on first, then other open polls, then Dates upcoming first', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const voted = await createPoll(hostUser.cookie, 'Schon gewählt', ['2090-10-30T20:30'])
    const todo = await createPoll(hostUser.cookie, 'Noch offen', ['2090-10-30T20:30'])
    const dateLater = await createDate(hostUser.cookie, 'Später', '2090-12-01T20:00')
    const dateSooner = await createDate(hostUser.cookie, 'Bald', '2090-11-01T20:00')
    for (const event of [voted, todo, dateLater, dateSooner]) await addMember(event.eventId, guestUser.id)
    await vote(guestUser.cookie, voted.slug, voted.slotIdAt('2090-10-30T19:30:00.000Z'), 'yes')

    const { events: listed } = await (await list(guestUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Noch offen', 'Schon gewählt', 'Bald', 'Später'])
    expect(listed[0].action).toBe('vote')
  })

  it('hides a Date that is more than 24 h past, and keeps one that passed less than 24 h ago', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const gone = await createDate(hostUser.cookie, 'Vorbei', '2090-11-01T20:00')
    const recent = await createDate(hostUser.cookie, 'Gerade eben', '2090-11-01T20:00')
    await addMember(gone.eventId, guestUser.id)
    await addMember(recent.eventId, guestUser.id)
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000)
    await testDb.db.update(sessions).set({ startsAt: hoursAgo(30) }).where(eq(sessions.eventId, gone.eventId))
    await testDb.db.update(sessions).set({ startsAt: hoursAgo(2) }).where(eq(sessions.eventId, recent.eventId))

    const { events: listed } = await (await list(guestUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Gerade eben'])
  })

  it('shows a Date card with the Date and the view action', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const date = await createDate(hostUser.cookie, 'Direkt', '2090-11-01T20:00')
    await addMember(date.eventId, guestUser.id)

    const [card] = (await (await list(guestUser.cookie)).json()).events

    expect(card).toMatchObject({
      phase: 'date_set',
      sessionCount: 1,
      missingDates: 0,
      nextSession: { number: 1, startsAt: '2090-11-01T19:00:00.000Z' },
      action: 'view',
    })
  })

  it('counts the Sessions and the ones still waiting for a Date while the Date poll runs', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const poll = await createSessionPoll(hostUser.cookie, 'Zwei Abende', ['2090-10-30T20:30', '2090-10-31T19:00'])
    await addMember(poll.eventId, guestUser.id)
    const [dated] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, poll.eventId))
    await testDb.db.update(sessions).set({ startsAt: new Date('2090-11-01T19:00:00Z') }).where(eq(sessions.id, dated!.id))

    const [card] = (await (await list(guestUser.cookie)).json()).events

    expect(card).toMatchObject({
      phase: 'poll',
      sessionCount: 2,
      missingDates: 1,
      nextSession: { number: 1, startsAt: '2090-11-01T19:00:00.000Z' },
    })
  })

  it('shows the next Session, numbered, once every Date is set', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const evenings = await createSessionDates(hostUser.cookie, 'Zwei Abende', ['2090-11-08T20:00', '2090-11-01T20:00'])
    await addMember(evenings.eventId, guestUser.id)

    const [card] = (await (await list(guestUser.cookie)).json()).events

    expect(card).toMatchObject({
      sessionCount: 2,
      missingDates: 0,
      nextSession: { number: 1, startsAt: '2090-11-01T19:00:00.000Z' },
      action: 'view',
    })
  })

  it('keeps an Event on Home between its Sessions, and shows the next upcoming one', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const evenings = await createSessionDates(hostUser.cookie, 'Zwei Abende', ['2090-11-01T20:00', '2090-11-08T20:00'])
    await addMember(evenings.eventId, guestUser.id)
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000)
    const [first, second] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, evenings.eventId))
    await testDb.db.update(sessions).set({ startsAt: hoursAgo(30) }).where(eq(sessions.id, first!.id))
    await testDb.db.update(sessions).set({ startsAt: new Date(Date.now() + 48 * 3_600_000) }).where(eq(sessions.id, second!.id))

    const { events: listed } = await (await list(guestUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Zwei Abende'])
    expect(listed[0].nextSession).toMatchObject({ number: 2, startsAt: expect.any(String) })
  })

  it('drops an Event once all its Sessions are more than 24 h past', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const guestUser = await signInAs(guest)
    const evenings = await createSessionDates(hostUser.cookie, 'Vorbei', ['2090-11-01T20:00', '2090-11-08T20:00'])
    await addMember(evenings.eventId, guestUser.id)
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000)
    await testDb.db.update(sessions).set({ startsAt: hoursAgo(30) }).where(eq(sessions.eventId, evenings.eventId))

    const { events: listed } = await (await list(guestUser.cookie)).json()

    expect(listed).toEqual([])
  })
})
