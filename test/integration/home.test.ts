import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import listHome from '../../server/api/e/index.get'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import { games, pollSlots, pollVotes, eventMembers, events, rounds, sessions, users } from '../../server/db/schema'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Poll Slots are far in the future so they stay votable. Dates that must be "past" are moved into
// the past directly in the database, which keeps the tests free of a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const

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
    await testDb.db.delete(games)
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

  async function addMember(eventId: string, userId: string) {
    await testDb.db.insert(eventMembers).values({ eventId, userId })
  }

  /** Creates a Date poll through the create handler and returns its slug, Event id and Slot ids by start. */
  async function createPoll(cookie: string, name: string, slots: string[]) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name, dateMode: 'poll', slots, settings: TEST_SETTINGS }),
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
      body: JSON.stringify({ name, dateMode: 'direct', startsAt: [startsAt], settings: TEST_SETTINGS }),
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
      body: JSON.stringify({ name, dateMode: 'poll', sessions: 2, slots, settings: TEST_SETTINGS }),
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
      body: JSON.stringify({ name, dateMode: 'direct', sessions: startsAt.length, startsAt, settings: TEST_SETTINGS }),
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

  /** Starts every Session of an Event `startedHoursAgo` hours ago, and ends it `endedHoursAgo` hours ago when given (#164). */
  async function startSessions(eventId: string, startedHoursAgo: number, endedHoursAgo?: number) {
    const startedAt = new Date(Date.now() - startedHoursAgo * 3_600_000)
    const endedAt = endedHoursAgo === undefined ? null : new Date(Date.now() - endedHoursAgo * 3_600_000)
    await testDb.db.update(sessions).set({ startedAt, endedAt }).where(eq(sessions.eventId, eventId))
  }

  /** Gives a running Event one Round with a Result at `at` (#282): a set game, numbered 1 (a Result needs its number and its set game). */
  async function addResult(eventId: string, createdBy: string, at: Date) {
    const [game] = await testDb.db.insert(games).values({ name: 'Halo', createdBy }).returning({ id: games.id })
    await testDb.db.insert(rounds).values({ eventId, gameId: game!.id, startedAt: at, setAt: at, number: 1, resultAt: at })
  }

  /** Finishes an Event at `finishedAt` the way the Host does (#277): phase finished and the instant of the finish. */
  async function setFinished(eventId: string, finishedAt: Date) {
    await testDb.db.update(events).set({ phase: 'finished', finishedAt }).where(eq(events.id, eventId))
  }

  it('requires a signed-in User', async () => {
    const response = await list(undefined)

    expect(response.status).toBe(401)
  })

  it('returns an empty list for a new User', async () => {
    const newcomer = await signInAs(member)

    const response = await list(newcomer.cookie)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ events: [] })
  })

  it('lists only the Events the User is a Member of, not deleted ones', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const mine = await createPoll(hostUser.cookie, 'Meine Runde', ['2090-10-30T20:30'])
    const theirs = await createPoll(hostUser.cookie, 'Fremde Runde', ['2090-10-30T20:30'])
    await addMember(mine.eventId, memberUser.id)
    const deleted = await createPoll(hostUser.cookie, 'Gelöschte Runde', ['2090-10-30T20:30'])
    await addMember(deleted.eventId, memberUser.id)
    await testDb.db.update(events).set({ deletedAt: new Date() }).where(eq(events.id, deleted.eventId))

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { slug: string }) => row.slug)).toEqual([mine.slug])
    expect(listed.map((row: { slug: string }) => row.slug)).not.toContain(theirs.slug)
  })

  it('describes each card: name, Host, phase, Best slot, progress, own status and action', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const poll = await createPoll(hostUser.cookie, 'Freitags-Zocken', ['2090-10-30T20:30', '2090-10-31T19:00'])
    await addMember(poll.eventId, memberUser.id)
    await vote(hostUser.cookie, poll.slug, poll.slotIdAt('2090-10-31T18:00:00.000Z'), 'yes')
    await vote(memberUser.cookie, poll.slug, poll.slotIdAt('2090-10-31T18:00:00.000Z'), 'yes')
    await vote(memberUser.cookie, poll.slug, poll.slotIdAt('2090-10-30T19:30:00.000Z'), 'no')

    const [card] = (await (await list(memberUser.cookie)).json()).events

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
      noDate: false,
    })
  })

  it('marks the Host card as open, and a poll the User has fully voted on as view', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const poll = await createPoll(hostUser.cookie, 'Runde', ['2090-10-30T20:30'])
    await addMember(poll.eventId, memberUser.id)
    await vote(memberUser.cookie, poll.slug, poll.slotIdAt('2090-10-30T19:30:00.000Z'), 'no')

    const hostCard = (await (await list(hostUser.cookie)).json()).events[0]
    const memberCard = (await (await list(memberUser.cookie)).json()).events[0]

    expect(hostCard).toMatchObject({ isHost: true, action: 'open' })
    expect(memberCard).toMatchObject({ isHost: false, viewerVoted: true, action: 'view', bestSlot: null })
  })

  it('orders open polls the User still has to vote on first, then other open polls, then Dates upcoming first', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const voted = await createPoll(hostUser.cookie, 'Schon gewählt', ['2090-10-30T20:30'])
    const todo = await createPoll(hostUser.cookie, 'Noch offen', ['2090-10-30T20:30'])
    const dateLater = await createDate(hostUser.cookie, 'Später', '2090-12-01T20:00')
    const dateSooner = await createDate(hostUser.cookie, 'Bald', '2090-11-01T20:00')
    for (const event of [voted, todo, dateLater, dateSooner]) await addMember(event.eventId, memberUser.id)
    await vote(memberUser.cookie, voted.slug, voted.slotIdAt('2090-10-30T19:30:00.000Z'), 'yes')

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Noch offen', 'Schon gewählt', 'Bald', 'Später'])
    expect(listed[0].action).toBe('vote')
  })

  it('hides an Event whose Sessions have all ended more than 24 h ago, and keeps one that ended less than 24 h ago (#199)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const gone = await createDate(hostUser.cookie, 'Vorbei', '2090-11-01T20:00')
    const recent = await createDate(hostUser.cookie, 'Gerade eben', '2090-11-01T20:00')
    await addMember(gone.eventId, memberUser.id)
    await addMember(recent.eventId, memberUser.id)
    await startSessions(gone.eventId, 31, 30)
    await startSessions(recent.eventId, 25, 23)

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Gerade eben'])
  })

  it('keeps an Event whose dated Session has not started, however far its Date is past (#199)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const overdue = await createDate(hostUser.cookie, 'Überfällig', '2090-11-01T20:00')
    await addMember(overdue.eventId, memberUser.id)
    await testDb.db.update(sessions).set({ startsAt: new Date(Date.now() - 3 * 24 * 3_600_000) }).where(eq(sessions.eventId, overdue.eventId))

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Überfällig'])
  })

  it('keeps an Event whose Session runs, even when its Date is 3 days past (#199)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const running = await createDate(hostUser.cookie, 'Läuft', '2090-11-01T20:00')
    await addMember(running.eventId, memberUser.id)
    await testDb.db.update(sessions).set({ startsAt: new Date(Date.now() - 3 * 24 * 3_600_000) }).where(eq(sessions.eventId, running.eventId))
    await startSessions(running.eventId, 3 * 24)

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Läuft'])
  })

  it('shows a Date card with the Date and the view action, and no number for the one Session (#70)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const date = await createDate(hostUser.cookie, 'Direkt', '2090-11-01T20:00')
    await addMember(date.eventId, memberUser.id)

    const [card] = (await (await list(memberUser.cookie)).json()).events

    expect(card).toMatchObject({
      phase: 'date_set',
      sessionCount: 1,
      missingDates: 0,
      nextSession: { number: null, startsAt: '2090-11-01T19:00:00.000Z' },
      action: 'view',
    })
  })

  it('counts the Sessions and the ones still waiting for a Date while the Date poll runs', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const poll = await createSessionPoll(hostUser.cookie, 'Zwei Abende', ['2090-10-30T20:30', '2090-10-31T19:00'])
    await addMember(poll.eventId, memberUser.id)
    const [dated] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, poll.eventId))
    await testDb.db.update(sessions).set({ startsAt: new Date('2090-11-01T19:00:00Z') }).where(eq(sessions.id, dated!.id))

    const [card] = (await (await list(memberUser.cookie)).json()).events

    expect(card).toMatchObject({
      phase: 'poll',
      sessionCount: 2,
      missingDates: 1,
      nextSession: { number: 1, startsAt: '2090-11-01T19:00:00.000Z' },
    })
  })

  it('counts the Best slot and the progress on open future Slots only, so a Slot that became a Date is no Best slot', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const poll = await createPoll(hostUser.cookie, 'Runde', ['2090-10-30T20:30', '2090-10-31T20:30'])
    await addMember(poll.eventId, memberUser.id)
    const taken = poll.slotIdAt('2090-10-30T19:30:00.000Z')
    const open = poll.slotIdAt('2090-10-31T19:30:00.000Z')
    // The taken Slot has more yes Votes, but a Session already has it as its Date; the Event keeps its
    // Session without a Date (the one from creation), so it stays in the date poll.
    await vote(memberUser.cookie, poll.slug, taken, 'yes')
    await vote(memberUser.cookie, poll.slug, open, 'maybe')
    await vote(hostUser.cookie, poll.slug, open, 'no')
    await testDb.db.insert(sessions).values({ eventId: poll.eventId, startsAt: new Date('2090-10-30T19:30:00.000Z'), slotId: taken })

    const card = (await (await list(memberUser.cookie)).json()).events[0]

    expect(card.bestSlot).toEqual({ id: open, startsAt: '2090-10-31T19:30:00.000Z' })
    expect(card.progress).toEqual({ voted: 2, total: 2 })
    expect(card).toMatchObject({ action: 'view', viewerVoted: true })
  })

  it('shows the next Session, numbered, once every Date is set', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const evenings = await createSessionDates(hostUser.cookie, 'Zwei Abende', ['2090-11-08T20:00', '2090-11-01T20:00'])
    await addMember(evenings.eventId, memberUser.id)

    const [card] = (await (await list(memberUser.cookie)).json()).events

    expect(card).toMatchObject({
      sessionCount: 2,
      missingDates: 0,
      nextSession: { number: 1, startsAt: '2090-11-01T19:00:00.000Z' },
      action: 'view',
    })
  })

  it('keeps an Event on Home between its Sessions, and shows the next upcoming one', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const evenings = await createSessionDates(hostUser.cookie, 'Zwei Abende', ['2090-11-01T20:00', '2090-11-08T20:00'])
    await addMember(evenings.eventId, memberUser.id)
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000)
    const [first, second] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, evenings.eventId))
    await testDb.db.update(sessions).set({ startsAt: hoursAgo(30) }).where(eq(sessions.id, first!.id))
    await testDb.db.update(sessions).set({ startsAt: new Date(Date.now() + 48 * 3_600_000) }).where(eq(sessions.id, second!.id))

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Zwei Abende'])
    expect(listed[0].nextSession).toMatchObject({ number: 2, startsAt: expect.any(String) })
  })

  it('drops an Event once all its Sessions have ended more than 24 h ago (#199)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const evenings = await createSessionDates(hostUser.cookie, 'Vorbei', ['2090-11-01T20:00', '2090-11-08T20:00'])
    await addMember(evenings.eventId, memberUser.id)
    await startSessions(evenings.eventId, 31, 30)

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed).toEqual([])
  })

  it('keeps a running Event with a Result, though its last Session ended 3 days ago, and drops one without a Result (#282)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const withResult = await createDate(hostUser.cookie, 'Mit Ergebnis', '2090-11-01T20:00')
    const withoutResult = await createDate(hostUser.cookie, 'Ohne Ergebnis', '2090-11-01T20:00')
    for (const event of [withResult, withoutResult]) {
      await addMember(event.eventId, memberUser.id)
      await testDb.db.update(events).set({ phase: 'running' }).where(eq(events.id, event.eventId))
      await startSessions(event.eventId, 4 * 24, 3 * 24)
    }
    await addResult(withResult.eventId, hostUser.id, new Date(Date.now() - 3 * 24 * 3_600_000))

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Mit Ergebnis'])
    expect(listed[0]).not.toHaveProperty('finishedAt')
  })

  // The page says „Kein Termin“ for a running Event with no Session left (eventPageState's `done`), and Home's pill must say the same (review 0.8, N5).
  it('marks a running Event whose Sessions are all over as having no Date left, and no other Event', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const over = await createDate(hostUser.cookie, 'Alles vorbei', '2090-11-01T20:00')
    const running = await createDate(hostUser.cookie, 'Läuft gerade', '2090-11-01T20:00')
    const between = await createSessionDates(hostUser.cookie, 'Zwischen zwei Abenden', ['2090-11-01T20:00', '2090-11-08T20:00'])
    const polling = await createSessionDates(hostUser.cookie, 'Ein Abend fehlt', ['2090-11-01T20:00', '2090-11-08T20:00'])
    const waiting = await createDate(hostUser.cookie, 'Noch nicht gestartet', '2090-11-01T20:00')
    for (const event of [over, running, between, polling, waiting]) await addMember(event.eventId, memberUser.id)
    for (const event of [over, running, between, polling]) await testDb.db.update(events).set({ phase: 'running' }).where(eq(events.id, event.eventId))
    await startSessions(over.eventId, 3, 2)
    await startSessions(running.eventId, 3)
    const [first, second] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, between.eventId)).orderBy(sessions.startsAt)
    await testDb.db.update(sessions).set({ startedAt: new Date(Date.now() - 3 * 3_600_000), endedAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(sessions.id, first!.id))
    expect(second!.startedAt).toBeNull()
    const [firstPolling, secondPolling] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, polling.eventId)).orderBy(sessions.startsAt)
    await testDb.db.update(sessions).set({ startedAt: new Date(Date.now() - 3 * 3_600_000), endedAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(sessions.id, firstPolling!.id))
    await testDb.db.update(sessions).set({ startsAt: null, slotId: null }).where(eq(sessions.id, secondPolling!.id))
    await addResult(over.eventId, hostUser.id, new Date(Date.now() - 2 * 3_600_000))

    const { events: listed } = await (await list(memberUser.cookie)).json() as { events: { name: string, noDate: boolean }[] }

    expect(Object.fromEntries(listed.map(card => [card.name, card.noDate]))).toEqual({
      'Alles vorbei': true,
      'Läuft gerade': false,
      'Zwischen zwei Abenden': false,
      'Ein Abend fehlt': false,
      'Noch nicht gestartet': false,
    })
  })

  it('lists a finished Event 23 h after its finish, and not 25 h after, whatever its Sessions say (#282)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const recent = await createDate(hostUser.cookie, 'Vor 23 h beendet', '2090-11-01T20:00')
    const old = await createDate(hostUser.cookie, 'Vor 25 h beendet', '2090-11-01T20:00')
    for (const event of [recent, old]) await addMember(event.eventId, memberUser.id)
    // The Sessions of both Events have not ended: only the finish decides how long the Event stays.
    await setFinished(recent.eventId, new Date(Date.now() - 23 * 3_600_000))
    await setFinished(old.eventId, new Date(Date.now() - 25 * 3_600_000))

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Vor 23 h beendet'])
  })

  it('lists a finished Event right after its finish, though its last Session ended 3 days before it (#282)', async () => {
    const hostUser = await signInAs(host, { hostPermission: true })
    const memberUser = await signInAs(member)
    const finished = await createDate(hostUser.cookie, 'Gerade beendet', '2090-11-01T20:00')
    await addMember(finished.eventId, memberUser.id)
    await startSessions(finished.eventId, 4 * 24, 3 * 24)
    await setFinished(finished.eventId, new Date(Date.now() - 60_000))

    const { events: listed } = await (await list(memberUser.cookie)).json()

    expect(listed.map((row: { name: string }) => row.name)).toEqual(['Gerade beendet'])
  })
})
