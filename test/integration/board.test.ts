import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import joinInvite from '../../server/api/invite/[invite].post'
import { activity, eventMembers, eventPoolGames, events, games, pollSlots, sessions, users } from '../../server/db/schema'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { TEST_SETTINGS } from './fixtures'
import { createInterleavingDb, createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Game board (#160, spec #153 § Game board): who may move whom where, the race for the last place, and what a
// move writes and publishes. Slots are in 2090 so the Date can be set without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const one = { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined } as const
const two = { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined } as const
const three = { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined } as const

describe('the Game board', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const routes = {
    'POST /api/e': createEvent,
    'GET /api/e/:slug': readEvent,
    'POST /api/e/:slug/confirm': confirmDate,
    'POST /api/e/:slug/move': moveMember,
    'POST /api/invite/:invite': joinInvite,
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
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const BENCH: Place = { zone: 'bench' }
  const STANDS: Place = { zone: 'stands' }
  const team = (n: number): Place => ({ zone: 'team', team: n })

  /**
   * A poll Event (2 teams of `teamSize`, a Date still missing) by the Host, with Players One, Two and Three as Members
   * on the Bench. `confirmDate` sets the Date, which opens Team choice.
   */
  async function setup({ teamSize = 2, settings = true }: { teamSize?: number, settings?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = { one: (await signIn(testDb.db, one)).cookie, two: (await signIn(testDb.db, two)).cookie, three: (await signIn(testDb.db, three)).cookie }
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({
        name: 'Freitags-Zocken',
        dateMode: 'poll',
        sessions: 1,
        slots: ['2090-10-30T20:30', '2090-10-31T19:00'],
        settings: { ...TEST_SETTINGS, teamSize },
      }),
    })
    const { slug, inviteUrl } = await created.json() as { slug: string, inviteUrl: string }
    // An Event from before 1.3 was never set up: no settings.
    if (!settings) await testDb.db.update(events).set({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null }).where(eq(events.slug, slug))
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const ids: Record<string, string> = {}
    for (const [key, profile] of Object.entries({ host, one, two, three })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key] = row!.id
    }
    for (const key of ['one', 'two', 'three']) await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: ids[key]! })
    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)).map(row => row.id)
    notifier.clear()
    return {
      slug,
      eventId: eventRow!.id,
      slotIds,
      hostCookie,
      cookies,
      ids: ids as Record<'host' | 'one' | 'two' | 'three', string>,
      invite: new URL(inviteUrl).pathname.slice('/e/'.length),
    }
  }

  async function openTeamChoice(game: Awaited<ReturnType<typeof setup>>) {
    const response = await send('POST', `/api/e/${game.slug}/confirm`, game.hostCookie, { slotId: game.slotIds[0] })
    expect(response.status).toBe(200)
    // The entry that says the Date is set is not what these tests are about.
    await testDb.db.delete(activity)
    notifier.clear()
  }

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  function move(slug: string, cookie: string, userId: string, to: unknown) {
    return send('POST', `/api/e/${slug}/move`, cookie, { userId, to })
  }

  async function read(slug: string, cookie: string): Promise<EventView> {
    return await (await send('GET', `/api/e/${slug}`, cookie)).json() as EventView
  }

  async function placeOf(slug: string, cookie: string, userId: string) {
    const member = (await read(slug, cookie)).members.find(row => row.id === userId)!
    return { zone: member.zone, team: member.team }
  }

  /** Nothing about the move reached the room and the feed. */
  async function expectNothingWritten(game: Awaited<ReturnType<typeof setup>>) {
    expect(notifier.messages(game.eventId)).toEqual([])
    expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toEqual([])
  }

  describe('a Player moves themselves', () => {
    it('into a team while Team choice is open, and the Event read shows it', async () => {
      const game = await setup()
      await openTeamChoice(game)

      const response = await move(game.slug, game.cookies.one, game.ids.one, { zone: 'team', team: 2 })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ userId: game.ids.one, to: team(2) })
      expect(await placeOf(game.slug, game.hostCookie, game.ids.one)).toEqual({ zone: 'team', team: 2 })
      const [row] = await testDb.db.select().from(eventMembers).where(eq(eventMembers.userId, game.ids.one))
      expect(row!.teamJoinedAt).toBeInstanceOf(Date)
    })

    it('publishes member.moved and the activity entry once, after event.changed', async () => {
      const game = await setup()
      await openTeamChoice(game)

      await move(game.slug, game.cookies.one, game.ids.one, team(1))

      const messages = notifier.messages(game.eventId)
      expect(messages.map(message => message.type)).toEqual(['event.changed', 'activity.added', 'member.moved'])
      expect(messages.find(message => message.type === 'member.moved')).toMatchObject({ userId: game.ids.one, from: BENCH, to: team(1), by: game.ids.one })
      const entries = await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ type: 'member_moved', actorId: game.ids.one, params: { userId: game.ids.one, from: BENCH, to: team(1) } })
    })

    it('between teams, and out of a team onto the Bench or the Stands', async () => {
      const game = await setup()
      await openTeamChoice(game)

      await move(game.slug, game.cookies.one, game.ids.one, team(1))
      expect((await move(game.slug, game.cookies.one, game.ids.one, team(2))).status).toBe(200)
      expect(await placeOf(game.slug, game.hostCookie, game.ids.one)).toEqual({ zone: 'team', team: 2 })
      expect((await move(game.slug, game.cookies.one, game.ids.one, STANDS)).status).toBe(200)
      expect(await placeOf(game.slug, game.hostCookie, game.ids.one)).toEqual({ zone: 'stands', team: null })
      const [row] = await testDb.db.select().from(eventMembers).where(eq(eventMembers.userId, game.ids.one))
      expect(row).toMatchObject({ zone: 'stands', team: null, teamJoinedAt: null })
    })

    it('refuses a team in the poll with 409 team_choice_closed and writes nothing', async () => {
      const game = await setup()

      const response = await move(game.slug, game.cookies.one, game.ids.one, team(1))

      expect(response.status).toBe(409)
      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('team_choice_closed')
      expect(await placeOf(game.slug, game.hostCookie, game.ids.one)).toEqual({ zone: 'bench', team: null })
      await expectNothingWritten(game)
    })

    it('goes between the Bench and the Stands at any time, also in the poll and without settings', async () => {
      for (const settings of [true, false]) {
        const game = await setup({ settings })

        expect((await move(game.slug, game.cookies.one, game.ids.one, STANDS)).status).toBe(200)
        expect(await placeOf(game.slug, game.hostCookie, game.ids.one)).toEqual({ zone: 'stands', team: null })
        expect((await move(game.slug, game.cookies.one, game.ids.one, BENCH)).status).toBe(200)
        expect(await placeOf(game.slug, game.hostCookie, game.ids.one)).toEqual({ zone: 'bench', team: null })
      }
    })

    it('stays in the team when a Reopen closes Team choice, and cannot leave it then', async () => {
      const game = await setup()
      await openTeamChoice(game)
      await move(game.slug, game.cookies.one, game.ids.one, team(1))
      await testDb.db.update(events).set({ phase: 'poll' }).where(eq(events.id, game.eventId))
      await testDb.db.update(sessions).set({ startsAt: null, slotId: null }).where(eq(sessions.eventId, game.eventId))

      expect((await read(game.slug, game.cookies.one)).teamChoiceOpen).toBe(false)
      expect(await placeOf(game.slug, game.hostCookie, game.ids.one)).toEqual({ zone: 'team', team: 1 })
      const response = await move(game.slug, game.cookies.one, game.ids.one, BENCH)
      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('team_choice_closed')
    })
  })

  describe('the Host and other Members', () => {
    it('refuses a Player who moves someone else, with 403 host_only', async () => {
      const game = await setup()
      await openTeamChoice(game)

      const response = await move(game.slug, game.cookies.one, game.ids.two, team(1))

      expect(response.status).toBe(403)
      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('host_only')
      expect(await placeOf(game.slug, game.hostCookie, game.ids.two)).toEqual({ zone: 'bench', team: null })
      await expectNothingWritten(game)
    })

    it('lets the Host move anyone, also in the poll, and names them as the actor', async () => {
      const game = await setup()

      const response = await move(game.slug, game.hostCookie, game.ids.two, team(1))

      expect(response.status).toBe(200)
      expect(await placeOf(game.slug, game.hostCookie, game.ids.two)).toEqual({ zone: 'team', team: 1 })
      expect(notifier.messages(game.eventId).find(message => message.type === 'member.moved')).toMatchObject({ userId: game.ids.two, to: team(1), by: game.ids.host })
      const [entry] = await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))
      expect(entry).toMatchObject({ type: 'member_moved', actorId: game.ids.host, params: { userId: game.ids.two } })
    })

    it('lets the Host take a Player out of a team in the poll', async () => {
      const game = await setup()
      await move(game.slug, game.hostCookie, game.ids.two, team(1))

      expect((await move(game.slug, game.hostCookie, game.ids.two, BENCH)).status).toBe(200)
      expect(await placeOf(game.slug, game.hostCookie, game.ids.two)).toEqual({ zone: 'bench', team: null })
    })

    it('answers 404 for a User who is no Member of the Event', async () => {
      const game = await setup()
      const stranger = { provider: 'twitch', id: '9', name: 'Fremd', email: 'stranger@example.com', image: undefined } as const
      await signIn(testDb.db, stranger)
      const [row] = await testDb.db.select().from(users).where(eq(users.email, stranger.email))

      const response = await move(game.slug, game.hostCookie, row!.id, STANDS)

      expect(response.status).toBe(404)
      await expectNothingWritten(game)
    })
  })

  describe('refusals', () => {
    it('refuses a team the Event does not have, also for the Host, with 400 no_such_team', async () => {
      const game = await setup()
      await openTeamChoice(game)

      for (const to of [team(3), team(0)]) {
        const response = await move(game.slug, game.hostCookie, game.ids.one, to)
        expect(response.status).toBe(400)
        expect((await response.json() as { statusMessage: string }).statusMessage).toBe('no_such_team')
      }
      await expectNothingWritten(game)
    })

    it('refuses every team of an Event without settings', async () => {
      const game = await setup({ settings: false })

      const response = await move(game.slug, game.hostCookie, game.ids.one, team(1))

      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('no_such_team')
    })

    it('refuses the place the Member is in, with 409 already_there', async () => {
      const game = await setup()

      const response = await move(game.slug, game.cookies.one, game.ids.one, BENCH)

      expect(response.status).toBe(409)
      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('already_there')
      await expectNothingWritten(game)
    })

    it('refuses a body that names no place or no Member, with 400 invalid_value', async () => {
      const game = await setup()
      await openTeamChoice(game)

      for (const body of [{ userId: game.ids.one }, { userId: game.ids.one, to: { zone: 'moon' } }, { userId: game.ids.one, to: { zone: 'team' } }, { userId: game.ids.one, to: { zone: 'team', team: '1' } }, { to: BENCH }, { userId: 'nobody', to: BENCH }]) {
        const response = await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, body)
        expect(response.status).toBe(400)
        expect((await response.json() as { statusMessage: string }).statusMessage).toBe('invalid_value')
      }
    })

    it('answers 401 without a sign-in and 404 to someone outside the Event', async () => {
      const game = await setup()
      const stranger = { provider: 'twitch', id: '9', name: 'Fremd', email: 'stranger@example.com', image: undefined } as const
      const strangerCookie = (await signIn(testDb.db, stranger)).cookie

      expect((await move(game.slug, '', game.ids.one, STANDS)).status).toBe(401)
      expect((await move(game.slug, strangerCookie, game.ids.one, STANDS)).status).toBe(404)
    })

    it('refuses a full team at the Team size, for a Player and for the Host, with 409 team_full', async () => {
      const game = await setup()
      await openTeamChoice(game)
      await move(game.slug, game.cookies.one, game.ids.one, team(1))
      await move(game.slug, game.cookies.two, game.ids.two, team(1))
      await testDb.db.delete(activity)
      notifier.clear()

      const player = await move(game.slug, game.cookies.three, game.ids.three, team(1))
      const byHost = await move(game.slug, game.hostCookie, game.ids.three, team(1))

      for (const response of [player, byHost]) {
        expect(response.status).toBe(409)
        expect((await response.json() as { statusMessage: string }).statusMessage).toBe('team_full')
      }
      expect(await placeOf(game.slug, game.hostCookie, game.ids.three)).toEqual({ zone: 'bench', team: null })
      await expectNothingWritten(game)
    })

    it('names the Player who took the last place in the full team', async () => {
      const game = await setup()
      await openTeamChoice(game)
      await move(game.slug, game.cookies.one, game.ids.one, team(1))
      await move(game.slug, game.cookies.two, game.ids.two, team(1))

      const response = await move(game.slug, game.cookies.three, game.ids.three, team(1))

      expect((await response.json() as { data: unknown }).data).toEqual({ winnerId: game.ids.two })
    })
  })

  describe('the race for the last place', () => {
    it('gives it to exactly one of two Players and names the winner to the other', async () => {
      const game = await setup({ teamSize: 1 })
      await openTeamChoice(game)
      // Two sits down just as One is about to take the only place.
      let competitor: Response | undefined
      const racingDb = createInterleavingDb(testDb.client, /update "event_members"/i, async () => {
        competitor = await move(game.slug, game.cookies.two, game.ids.two, team(1))
      })
      const racingRequest = createTestServer(racingDb, { 'POST /api/e/:slug/move': moveMember }, { roomNotifier: notifier })

      const first = await racingRequest(`/api/e/${game.slug}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': game.cookies.one },
        body: JSON.stringify({ userId: game.ids.one, to: team(1) }),
      })
      await vi.waitFor(() => expect(competitor).toBeDefined())

      expect(first.status).toBe(200)
      expect(competitor!.status).toBe(409)
      expect(await competitor!.json()).toMatchObject({ statusMessage: 'team_full', data: { winnerId: game.ids.one } })
      const seated = await testDb.db.select().from(eventMembers).where(eq(eventMembers.team, 1))
      expect(seated.map(row => row.userId)).toEqual([game.ids.one])
      expect(notifier.messages(game.eventId).filter(message => message.type === 'member.moved')).toHaveLength(1)
      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toHaveLength(1)
    })
  })

  describe('joining through the Invite link', () => {
    it('publishes member.joined with the new Member, and nothing for a repeated join', async () => {
      const game = await setup()
      const newcomer = { provider: 'twitch', id: '9', name: 'Neu', email: 'new@example.com', image: undefined } as const
      const cookie = (await signIn(testDb.db, newcomer)).cookie
      const [row] = await testDb.db.select().from(users).where(eq(users.email, newcomer.email))

      expect((await send('POST', `/api/invite/${game.invite}`, cookie)).status).toBe(200)

      expect(notifier.messages(game.eventId).filter(message => message.type === 'member.joined')).toMatchObject([{ userId: row!.id }])
      notifier.clear()
      await send('POST', `/api/invite/${game.invite}`, cookie)
      expect(notifier.messages(game.eventId)).toEqual([])
    })
  })

  describe('the Event read', () => {
    it('shows every Member on the Bench, the teams and a closed Team choice before the Date', async () => {
      const game = await setup()

      const view = await read(game.slug, game.cookies.one)

      expect(view.members.map(member => [member.zone, member.team])).toEqual([['bench', null], ['bench', null], ['bench', null], ['bench', null]])
      expect(view.teams).toEqual([{ position: 1 }, { position: 2 }])
      expect(view.teamChoiceOpen).toBe(false)
    })

    it('opens Team choice once a Session has a Date and shows the seats', async () => {
      const game = await setup()
      await openTeamChoice(game)
      await move(game.slug, game.cookies.one, game.ids.one, team(2))
      await move(game.slug, game.cookies.two, game.ids.two, STANDS)

      const view = await read(game.slug, game.cookies.three)

      expect(view.teamChoiceOpen).toBe(true)
      expect(view.members.find(member => member.id === game.ids.one)).toMatchObject({ zone: 'team', team: 2 })
      expect(view.members.find(member => member.id === game.ids.two)).toMatchObject({ zone: 'stands', team: null })
    })

    it('has no teams and a closed Team choice for an Event without settings', async () => {
      const game = await setup({ settings: false })
      await openTeamChoice(game)

      const view = await read(game.slug, game.hostCookie)

      expect(view.teams).toEqual([])
      expect(view.teamChoiceOpen).toBe(false)
    })
  })
})
