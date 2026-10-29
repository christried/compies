import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import removeSession from '../../server/api/e/[slug]/sessions/[id].delete'
import reopenSession from '../../server/api/e/[slug]/sessions/[id]/reopen.post'
import rescheduleSession from '../../server/api/e/[slug]/sessions/[id]/reschedule.post'
import addSession from '../../server/api/e/[slug]/sessions/index.post'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import addSlot from '../../server/api/e/[slug]/slots/index.post'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import setTeamWord from '../../server/api/e/[slug]/team-word.post'
import resetTeamName from '../../server/api/e/[slug]/teams/[position]/reset-name.post'
import { activity, eventMembers, eventPoolGames, eventTeams, events, games, pollSlots, pollVotes, sessions, users } from '../../server/db/schema'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Starting and ending Sessions (#164, spec #153 § API contracts): the start rule through the API, what the first start
// freezes, the Running Session, and what a started Session and the teams allow afterwards. Slots are in 2090 so Dates
// can be set without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const one = { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined } as const
const two = { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined } as const
const three = { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined } as const
const four = { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined } as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00', '2090-11-01T19:00']

describe('Starting and ending Sessions', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const routes = {
    'POST /api/e': createEvent,
    'GET /api/e/:slug': readEvent,
    'POST /api/e/:slug/confirm': confirmDate,
    'POST /api/e/:slug/move': moveMember,
    'POST /api/e/:slug/team-word': setTeamWord,
    'POST /api/e/:slug/teams/:position/reset-name': resetTeamName,
    'POST /api/e/:slug/sessions': addSession,
    'POST /api/e/:slug/sessions/start': startSession,
    'POST /api/e/:slug/sessions/end': endSession,
    'DELETE /api/e/:slug/sessions/:id': removeSession,
    'POST /api/e/:slug/sessions/:id/reopen': reopenSession,
    'POST /api/e/:slug/sessions/:id/reschedule': rescheduleSession,
    'POST /api/e/:slug/slots': addSlot,
    'PUT /api/e/:slug/slots/:slotId/vote': putVote,
  } as const

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, routes, { roomNotifier: notifier })
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
    await testDb.db.delete(pollVotes)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const team = (n: number): Place => ({ zone: 'team', team: n })

  /**
   * An Event of two Sessions (2 teams of `teamSize`) with three Slots, by the Host; Players One to Four are Members on the
   * Bench. No Date is set yet.
   */
  async function setup({ teamSize = 2, settings = true }: { teamSize?: number, settings?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = {
      one: (await signIn(testDb.db, one)).cookie,
      two: (await signIn(testDb.db, two)).cookie,
      three: (await signIn(testDb.db, three)).cookie,
      four: (await signIn(testDb.db, four)).cookie,
    }
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS, settings: { ...TEST_SETTINGS, teamSize } }),
    })
    const { slug } = await created.json() as { slug: string }
    // An Event from before 1.3 was never set up: no settings.
    if (!settings) await testDb.db.update(events).set({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null }).where(eq(events.slug, slug))
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const ids: Record<string, string> = {}
    for (const [key, profile] of Object.entries({ host, one, two, three, four })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key] = row!.id
    }
    for (const key of ['one', 'two', 'three', 'four']) await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: ids[key]! })
    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)).map(row => row.id)
    notifier.clear()
    return {
      slug,
      eventId: eventRow!.id,
      slotIds,
      hostCookie,
      cookies,
      ids: ids as Record<'host' | 'one' | 'two' | 'three' | 'four', string>,
    }
  }

  type Game = Awaited<ReturnType<typeof setup>>

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async function read(game: Game, cookie = game.hostCookie): Promise<EventView> {
    return await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView
  }

  async function errorOf(response: Response) {
    return { status: response.status, code: (await response.json() as { statusMessage: string }).statusMessage }
  }

  /** Sets the Dates of the first `count` Sessions from the Slots, in order. */
  async function setDates(game: Game, count: number) {
    for (let index = 0; index < count; index++) {
      const response = await send('POST', `/api/e/${game.slug}/confirm`, game.hostCookie, { slotId: game.slotIds[index] })
      expect(response.status).toBe(200)
    }
  }

  /** Two Players in each team: One and Two in team 1, Three and Four in team 2 (the Players move themselves). */
  async function fillTeams(game: Game) {
    const seats = [['one', 1], ['two', 1], ['three', 2], ['four', 2]] as const
    for (const [key, position] of seats) {
      const response = await send('POST', `/api/e/${game.slug}/move`, game.cookies[key], { userId: game.ids[key], to: team(position) })
      expect(response.status).toBe(200)
    }
  }

  /** An Event ready to start: both Dates set, the teams full. */
  async function ready(options: { teamSize?: number } = {}) {
    const game = await setup(options)
    await setDates(game, 2)
    await fillTeams(game)
    notifier.clear()
    await testDb.db.delete(activity)
    return game
  }

  const start = (game: Game, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/sessions/start`, cookie)
  const end = (game: Game, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/sessions/end`, cookie)

  async function sessionRows(game: Game) {
    return await testDb.db.select().from(sessions).where(eq(sessions.eventId, game.eventId)).orderBy(sessions.startsAt)
  }

  describe('the start rule', () => {
    it('refuses an Event that was never set up with 409 not_set_up', async () => {
      const game = await setup({ settings: false })
      await setDates(game, 1)

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'not_set_up' })
    })

    it('refuses while no Session has a Date with 409 no_dated_session', async () => {
      const game = await setup()

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'no_dated_session' })
    })

    it('refuses an empty team with 409 teams_empty', async () => {
      const game = await setup()
      await setDates(game, 1)
      for (const key of ['one', 'two'] as const) await send('POST', `/api/e/${game.slug}/move`, game.cookies[key], { userId: game.ids[key], to: team(1) })

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'teams_empty' })
    })

    it('refuses uneven teams with 409 teams_uneven', async () => {
      const game = await setup()
      await setDates(game, 1)
      await fillTeams(game)
      await send('POST', `/api/e/${game.slug}/move`, game.cookies.four, { userId: game.ids.four, to: { zone: 'bench' } })

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'teams_uneven' })
    })

    it('refuses while a Session runs with 409 session_running, and writes nothing', async () => {
      const game = await ready()
      expect((await start(game)).status).toBe(200)
      notifier.clear()
      await testDb.db.delete(activity)

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'session_running' })

      expect(notifier.messages(game.eventId)).toEqual([])
      expect(await testDb.db.select().from(activity)).toEqual([])
      expect((await sessionRows(game)).filter(row => row.startedAt !== null)).toHaveLength(1)
    })

    it('says in the Event read, for the Host only, which Session is next and what stops it', async () => {
      const game = await setup()
      await setDates(game, 2)
      const [first, second] = (await read(game)).sessions

      const view = await read(game)
      expect(view.start).toEqual({ sessionId: first!.id, number: 1, rejection: 'teams_empty' })
      expect(second!.number).toBe(2)

      await fillTeams(game)
      expect((await read(game)).start).toEqual({ sessionId: first!.id, number: 1, rejection: null })
      expect((await read(game, game.cookies.one)).start).toBeNull()
    })
  })

  describe('the first start', () => {
    it('starts the earliest dated Session (a Date far ahead is no obstacle), sets the Phase to running and answers with both', async () => {
      const game = await ready()

      const response = await start(game)

      expect(response.status).toBe(200)
      const rows = await sessionRows(game)
      expect(await response.json()).toEqual({ sessionId: rows[0]!.id, phase: 'running' })
      expect(rows[0]!.startedAt).toBeInstanceOf(Date)
      expect(rows[0]!.endedAt).toBeNull()
      expect(rows[1]!.startedAt).toBeNull()
      const view = await read(game)
      expect(view.event.phase).toBe('running')
      expect(view.runningSessionId).toBe(rows[0]!.id)
      expect(view.sessions.map(session => ({ id: session.id, started: session.startedAt !== null, ended: session.endedAt !== null }))).toEqual([
        { id: rows[0]!.id, started: true, ended: false },
        { id: rows[1]!.id, started: false, ended: false },
      ])
      expect(view.start).toEqual({ sessionId: rows[1]!.id, number: 2, rejection: 'session_running' })
    })

    it('freezes every team\'s composed name into event_teams, and the Event read shows them frozen', async () => {
      const game = await ready()
      await send('POST', `/api/e/${game.slug}/team-word`, game.cookies.one, { word: 'Wilde' })
      await send('POST', `/api/e/${game.slug}/team-word`, game.cookies.two, { word: 'Gurken' })

      await start(game)

      const teams = await testDb.db.select().from(eventTeams).where(eq(eventTeams.eventId, game.eventId)).orderBy(eventTeams.position)
      expect(teams.map(row => ({ position: row.position, frozenName: row.frozenName }))).toEqual([
        { position: 1, frozenName: 'Wilde Gurken' },
        { position: 2, frozenName: null },
      ])
      expect((await read(game, game.cookies.three)).teams).toEqual([
        { position: 1, name: 'Wilde Gurken', frozen: true },
        { position: 2, name: null, frozen: true },
      ])
    })

    it('publishes event.changed, one session.started, one team.nameFrozen and one activity.added, and records one entry', async () => {
      const game = await ready()

      await start(game)

      const messages = notifier.messages(game.eventId)
      expect(messages[0]!.type).toBe('event.changed')
      const count = (type: string) => messages.filter(message => message.type === type).length
      expect({ changed: count('event.changed'), started: count('session.started'), frozen: count('team.nameFrozen'), added: count('activity.added') }).toEqual({ changed: 1, started: 1, frozen: 1, added: 1 })
      const rows = await sessionRows(game)
      expect(messages.find(message => message.type === 'session.started')).toMatchObject({ sessionId: rows[0]!.id })
      const entries = await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ type: 'session_started', actorId: game.ids.host, params: { sessionId: rows[0]!.id, number: 1 } })
    })

    it('is for the Host only: a Player gets 403 and nothing changes', async () => {
      const game = await ready()

      expect(await errorOf(await start(game, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })

      expect((await sessionRows(game)).every(row => row.startedAt === null)).toBe(true)
      expect(notifier.messages(game.eventId)).toEqual([])
    })
  })

  describe('ending a Session', () => {
    it('sets ended_at on the Running Session, keeps the Event running and says so in the feed and the room', async () => {
      const game = await ready()
      await start(game)
      notifier.clear()
      await testDb.db.delete(activity)

      const response = await end(game)

      expect(response.status).toBe(200)
      const rows = await sessionRows(game)
      expect(await response.json()).toEqual({ sessionId: rows[0]!.id, phase: 'running' })
      expect(rows[0]!.endedAt).toBeInstanceOf(Date)
      const view = await read(game)
      expect(view.event.phase).toBe('running')
      expect(view.runningSessionId).toBeNull()
      const messages = notifier.messages(game.eventId)
      expect(messages.map(message => message.type).sort()).toEqual(['activity.added', 'event.changed', 'session.ended'])
      expect(messages.find(message => message.type === 'session.ended')).toMatchObject({ sessionId: rows[0]!.id })
      const entries = await testDb.db.select().from(activity)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ type: 'session_ended', actorId: game.ids.host, params: { sessionId: rows[0]!.id, number: 1 } })
    })

    it('refuses with 409 no_running_session when no Session runs, before the first start and after one ended', async () => {
      const game = await ready()
      expect(await errorOf(await end(game))).toEqual({ status: 409, code: 'no_running_session' })

      await start(game)
      await end(game)
      expect(await errorOf(await end(game))).toEqual({ status: 409, code: 'no_running_session' })
    })

    it('is for the Host only: a Player gets 403 and the Session keeps running', async () => {
      const game = await ready()
      await start(game)

      expect(await errorOf(await end(game, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })

      expect((await read(game)).runningSessionId).not.toBeNull()
    })
  })

  describe('the second start', () => {
    it('starts the next Session, keeps the Phase, and freezes nothing again', async () => {
      const game = await ready()
      await send('POST', `/api/e/${game.slug}/team-word`, game.cookies.one, { word: 'Wilde' })
      await start(game)
      await end(game)
      // A word cannot change a frozen name, and the reset gives the colour name.
      expect(await errorOf(await send('POST', `/api/e/${game.slug}/team-word`, game.cookies.one, { word: 'Neu' }))).toEqual({ status: 409, code: 'teams_locked' })
      notifier.clear()

      const response = await start(game)

      expect(response.status).toBe(200)
      const rows = await sessionRows(game)
      expect(await response.json()).toEqual({ sessionId: rows[1]!.id, phase: 'running' })
      expect(rows[1]!.startedAt).toBeInstanceOf(Date)
      expect(notifier.messages(game.eventId).filter(message => message.type === 'team.nameFrozen')).toHaveLength(0)
      expect(notifier.messages(game.eventId).filter(message => message.type === 'session.started')).toHaveLength(1)
      const teams = await testDb.db.select().from(eventTeams).where(eq(eventTeams.eventId, game.eventId)).orderBy(eventTeams.position)
      expect(teams.map(row => row.frozenName)).toEqual(['Wilde', null])
      const entries = await testDb.db.select().from(activity).where(eq(activity.type, 'session_started')).orderBy(activity.at)
      expect(entries.map(entry => (entry.params as { number: number }).number)).toEqual([1, 2])
    })

    it('has no Session to start after the last one ended: 409 no_dated_session', async () => {
      const game = await ready()
      await start(game)
      await end(game)
      await start(game)
      await end(game)

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'no_dated_session' })
      expect((await read(game)).start).toEqual({ sessionId: null, number: null, rejection: 'no_dated_session' })
    })
  })

  describe('a started Session is fixed', () => {
    it('is refused for remove, reschedule and reopen with 409 session_started, while an unstarted one still works', async () => {
      const game = await ready()
      await start(game)
      const [started, waiting] = await sessionRows(game)
      const later = '2090-12-24T19:00'

      expect(await errorOf(await send('DELETE', `/api/e/${game.slug}/sessions/${started!.id}`, game.hostCookie))).toEqual({ status: 409, code: 'session_started' })
      expect(await errorOf(await send('POST', `/api/e/${game.slug}/sessions/${started!.id}/reschedule`, game.hostCookie, { startsAt: later }))).toEqual({ status: 409, code: 'session_started' })
      expect(await errorOf(await send('POST', `/api/e/${game.slug}/sessions/${started!.id}/reopen`, game.hostCookie))).toEqual({ status: 409, code: 'session_started' })
      expect((await sessionRows(game)).find(row => row.id === started!.id)!.startsAt).toEqual(started!.startsAt)

      expect((await send('POST', `/api/e/${game.slug}/sessions/${waiting!.id}/reschedule`, game.hostCookie, { startsAt: later })).status).toBe(200)
      expect((await send('POST', `/api/e/${game.slug}/sessions/${waiting!.id}/reopen`, game.hostCookie)).status).toBe(200)
      expect((await send('DELETE', `/api/e/${game.slug}/sessions/${waiting!.id}`, game.hostCookie)).status).toBe(200)
    })

    it('stays fixed after it ended, and a new Session can still be added', async () => {
      const game = await ready()
      await start(game)
      await end(game)
      const [ended] = await sessionRows(game)

      expect(await errorOf(await send('DELETE', `/api/e/${game.slug}/sessions/${ended!.id}`, game.hostCookie))).toEqual({ status: 409, code: 'session_started' })
      expect((await send('POST', `/api/e/${game.slug}/sessions`, game.hostCookie, {})).status).toBe(200)
      expect((await read(game)).event.phase).toBe('running')
    })
  })

  describe('the teams after the start', () => {
    it('lock Players out of joining and leaving, keep Bench and Tribüne free and let the Host move anyone', async () => {
      const game = await ready()
      await start(game)
      const move = (cookie: string, key: keyof Game['ids'], to: Place) => send('POST', `/api/e/${game.slug}/move`, cookie, { userId: game.ids[key], to })

      // A Player in a team cannot leave it; one on the Bench cannot join one.
      expect(await errorOf(await move(game.cookies.one, 'one', { zone: 'bench' }))).toEqual({ status: 409, code: 'teams_locked' })
      expect(await errorOf(await move(game.cookies.one, 'one', team(2)))).toEqual({ status: 409, code: 'teams_locked' })
      const hostCookie = game.hostCookie
      expect((await move(hostCookie, 'one', { zone: 'bench' })).status).toBe(200)
      expect(await errorOf(await move(game.cookies.one, 'one', team(1)))).toEqual({ status: 409, code: 'teams_locked' })

      // Bench and Tribüne stay free.
      expect((await move(game.cookies.one, 'one', { zone: 'stands' })).status).toBe(200)
      expect((await move(game.cookies.one, 'one', { zone: 'bench' })).status).toBe(200)

      // The Host moves a Player into a team.
      expect((await move(hostCookie, 'one', team(1))).status).toBe(200)
      const members = (await read(game)).members
      expect(members.find(member => member.id === game.ids.one)).toMatchObject({ zone: 'team', team: 1 })
    })

    it('refuse a Player\'s Team word with 409 teams_locked', async () => {
      const game = await ready()
      await start(game)

      expect(await errorOf(await send('POST', `/api/e/${game.slug}/team-word`, game.cookies.one, { word: 'Wilde' }))).toEqual({ status: 409, code: 'teams_locked' })
    })

    it('give the colour name after the Host reset a frozen name, although words exist', async () => {
      const game = await ready()
      await send('POST', `/api/e/${game.slug}/team-word`, game.cookies.one, { word: 'Wilde' })
      await start(game)
      expect((await read(game)).teams[0]).toEqual({ position: 1, name: 'Wilde', frozen: true })

      const reset = await send('POST', `/api/e/${game.slug}/teams/1/reset-name`, game.hostCookie)

      expect(reset.status).toBe(200)
      const view = await read(game)
      expect(view.teams[0]).toEqual({ position: 1, name: null, frozen: true })
      // The word stays with its Player; only the frozen name changed.
      expect(view.members.find(member => member.id === game.ids.one)!.teamWord).toBe('Wilde')
    })
  })

  describe('the Date poll after the first start', () => {
    it('goes on for a Session that still waits for a Date: Members vote, the Host adds a Slot and sets the Date, the Phase stays running', async () => {
      const game = await setup()
      await setDates(game, 1)
      await fillTeams(game)
      expect((await start(game)).status).toBe(200)
      expect((await read(game)).event.phase).toBe('running')

      // A Member can still vote on the open Slot of Session 2's poll.
      const vote = await send('PUT', `/api/e/${game.slug}/slots/${game.slotIds[1]}/vote`, game.cookies.one, { value: 'yes' })
      expect(vote.status).toBe(200)

      // The Host adds a Slot and sets the Date of Session 2 from it.
      const added = await send('POST', `/api/e/${game.slug}/slots`, game.hostCookie, { startsAt: '2090-11-08T19:00' })
      expect(added.status).toBe(200)
      const confirmed = await send('POST', `/api/e/${game.slug}/confirm`, game.hostCookie, { slotId: game.slotIds[1] })
      expect(confirmed.status).toBe(200)
      expect(await confirmed.json()).toMatchObject({ phase: 'running' })
      const view = await read(game)
      expect(view.event.phase).toBe('running')
      expect(view.missingDates).toBe(0)
    })

    it('closes once every Session has a Date: no Vote, no Slot edit', async () => {
      const game = await ready()
      await start(game)

      const vote = await send('PUT', `/api/e/${game.slug}/slots/${game.slotIds[2]}/vote`, game.cookies.one, { value: 'yes' })
      const added = await send('POST', `/api/e/${game.slug}/slots`, game.hostCookie, { startsAt: '2090-11-08T19:00' })

      expect(await errorOf(vote)).toEqual({ status: 409, code: 'wrong_phase' })
      expect(await errorOf(added)).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it('opens again when the Host adds a Session without a Date while one runs', async () => {
      const game = await ready()
      await start(game)

      expect((await send('POST', `/api/e/${game.slug}/sessions`, game.hostCookie, {})).status).toBe(200)

      const vote = await send('PUT', `/api/e/${game.slug}/slots/${game.slotIds[2]}/vote`, game.cookies.one, { value: 'maybe' })
      expect(vote.status).toBe(200)
      expect((await read(game)).event.phase).toBe('running')
    })
  })
})
