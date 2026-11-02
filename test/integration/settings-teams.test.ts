import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import moveMember from '../../server/api/e/[slug]/move.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import setTeamWord from '../../server/api/e/[slug]/team-word.post'
import joinInvite from '../../server/api/invite/[invite].post'
import { activity, eventMembers, events, users } from '../../server/db/schema'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { settingsFromRow } from '../../shared/settings'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Settings follow the teams (#163, spec #153 § Game board rules, § API contracts): the Team size never goes below the
// fullest team, and lowering the team count moves the Players of the removed teams to the Bench in the same transaction.
// A refused update changes nothing. Four teams of three, Players One to Four and the Host.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
} as const

const LINEAR_4 = { preset: 'linear', values: [3, 2, 1, 0] }
const LINEAR_2 = { preset: 'linear', values: [1, 0] }

describe('settings follow the teams (#163)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/e/:slug/move': moveMember,
      'POST /api/e/:slug/team-word': setTeamWord,
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
    await testDb.db.delete(activity)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const BENCH: Place = { zone: 'bench' }
  const team = (n: number): Place => ({ zone: 'team', team: n })

  type Key = keyof typeof players | 'host'

  /** An Event of 4 teams of 3 (poll, no Date needed: the Host seats people), with every Player a Member on the Bench. */
  async function setup() {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = {} as Record<keyof typeof players, string>
    for (const key of Object.keys(players) as (keyof typeof players)[]) cookies[key] = (await signIn(testDb.db, players[key])).cookie
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({
        name: 'Freitags-Zocken',
        dateMode: 'poll',
        sessions: 1,
        slots: ['2090-10-30T20:30'],
        settings: { ...TEST_SETTINGS, teamCount: 4, teamSize: 3, pointsTable: LINEAR_4 },
      }),
    })
    expect(created.status).toBe(200)
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const ids = {} as Record<Key, string>
    for (const [key, profile] of Object.entries({ host, ...players })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key as Key] = row!.id
    }
    for (const key of Object.keys(players) as (keyof typeof players)[]) await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: ids[key] })
    notifier.clear()
    return { slug, eventId: eventRow!.id, hostCookie, cookies, ids }
  }

  type Game = Awaited<ReturnType<typeof setup>>

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  /** The Host seats a Member; the seating is not what these tests are about, so its messages and entries are cleared. */
  async function seat(game: Game, key: Key, to: Place) {
    const response = await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids[key], to })
    expect(response.status).toBe(200)
  }

  async function seatTeams(game: Game) {
    await seat(game, 'one', team(1))
    await seat(game, 'four', team(1))
    await seat(game, 'two', team(3))
    await seat(game, 'three', team(4))
    await testDb.db.delete(activity)
    notifier.clear()
  }

  function patch(game: Game, body: unknown) {
    return send('PATCH', `/api/e/${game.slug}/settings`, game.hostCookie, body)
  }

  async function read(game: Game): Promise<EventView> {
    return await (await send('GET', `/api/e/${game.slug}`, game.hostCookie)).json() as EventView
  }

  async function seatsOf(game: Game) {
    const view = await read(game)
    return Object.fromEntries(view.members.map(member => [member.id, member.zone === 'team' ? team(member.team!) : { zone: member.zone }]))
  }

  async function settingsOf(game: Game) {
    const [row] = await testDb.db.select().from(events).where(eq(events.id, game.eventId))
    return settingsFromRow(row!)!
  }

  /** Nothing moved, nothing was written to the feed, nothing was published. */
  async function expectNothingWritten(game: Game) {
    expect(notifier.messages(game.eventId)).toEqual([])
    expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toEqual([])
  }

  describe('the Team size floor', () => {
    it('refuses a Team size below the fullest team with 409 and changes nothing, and accepts the fullest team', async () => {
      const game = await setup()
      await seat(game, 'one', team(1))
      await seat(game, 'four', team(1))
      await testDb.db.delete(activity)
      notifier.clear()
      expect((await read(game)).settingsFloors).toEqual({ teamSize: 2, vetoAllowance: 0, gameCount: 0 })

      const refused = await patch(game, { settings: { teamSize: 1 } })

      expect(refused.status).toBe(409)
      expect((await refused.json() as { statusMessage: string }).statusMessage).toBe('team_size_below_fullest')
      expect((await settingsOf(game)).teamSize).toBe(3)
      await expectNothingWritten(game)

      const accepted = await patch(game, { settings: { teamSize: 2 } })
      expect(accepted.status).toBe(200)
      expect((await settingsOf(game)).teamSize).toBe(2)
    })

    it('counts the fullest team of the Event, not of the Players in all teams together', async () => {
      const game = await setup()
      await seatTeams(game)

      // Team 1 holds two Players, teams 3 and 4 one each: the floor is 2, not 4.
      expect((await read(game)).settingsFloors).toEqual({ teamSize: 2, vetoAllowance: 0, gameCount: 0 })
    })
  })

  describe('lowering the team count', () => {
    it('moves exactly the Players of the removed teams to the Bench, and leaves the other teams alone', async () => {
      const game = await setup()
      await seatTeams(game)

      const response = await patch(game, { settings: { teamCount: 2, pointsTable: LINEAR_2 } })

      expect(response.status).toBe(200)
      expect((await settingsOf(game)).teamCount).toBe(2)
      expect(await seatsOf(game)).toEqual({
        [game.ids.one]: team(1),
        [game.ids.four]: team(1),
        [game.ids.two]: BENCH,
        [game.ids.three]: BENCH,
        [game.ids.host]: BENCH,
      })
      const moved = await testDb.db.select().from(eventMembers).where(eq(eventMembers.eventId, game.eventId))
      for (const row of moved.filter(member => member.userId === game.ids.two || member.userId === game.ids.three)) {
        expect(row.teamJoinedAt).toBeNull()
      }
    })

    it('writes one member_moved entry per moved Player, by the Host', async () => {
      const game = await setup()
      await seatTeams(game)

      await patch(game, { settings: { teamCount: 2, pointsTable: LINEAR_2 } })

      const entries = await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))
      expect(entries).toHaveLength(2)
      expect(entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'member_moved', actorId: game.ids.host, params: { userId: game.ids.two, from: team(3), to: BENCH } }),
        expect.objectContaining({ type: 'member_moved', actorId: game.ids.host, params: { userId: game.ids.three, from: team(4), to: BENCH } }),
      ]))
    })

    it('publishes one member.moved and one activity.added per moved Player, after event.changed', async () => {
      const game = await setup()
      await seatTeams(game)

      await patch(game, { settings: { teamCount: 2, pointsTable: LINEAR_2 } })

      const messages = notifier.messages(game.eventId)
      expect(messages[0]!.type).toBe('event.changed')
      expect(messages.filter(message => message.type === 'activity.added')).toHaveLength(2)
      const moves = messages.filter(message => message.type === 'member.moved')
      expect(moves).toHaveLength(2)
      expect(moves).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: game.ids.two, from: team(3), to: BENCH, by: game.ids.host }),
        expect.objectContaining({ userId: game.ids.three, from: team(4), to: BENCH, by: game.ids.host }),
      ]))
    })

    it('clears the Team words of the moved Players and keeps the words of the other teams (#161)', async () => {
      const game = await setup()
      await seatTeams(game)
      for (const [key, word] of [['one', 'Wilde'], ['four', 'Gurken'], ['two', 'Rote'], ['three', 'Bande']] as const) {
        expect((await send('POST', `/api/e/${game.slug}/team-word`, game.cookies[key], { word })).status).toBe(200)
      }
      expect((await read(game)).teams.map(row => row.name)).toEqual(['Wilde Gurken', null, 'Rote', 'Bande'])

      await patch(game, { settings: { teamCount: 2, pointsTable: LINEAR_2 } })

      const view = await read(game)
      const wordOf = (id: string) => view.members.find(member => member.id === id)?.teamWord
      expect(wordOf(game.ids.two)).toBeNull()
      expect(wordOf(game.ids.three)).toBeNull()
      expect(wordOf(game.ids.one)).toBe('Wilde')
      expect(wordOf(game.ids.four)).toBe('Gurken')
      expect(view.teams.map(row => row.name)).toEqual(['Wilde Gurken', null])
    })
  })

  describe('a refused update', () => {
    it('changes nobody and writes nothing when the same lowering comes with an invalid value', async () => {
      const game = await setup()
      await seatTeams(game)

      const response = await patch(game, { settings: { teamCount: 2, pointsTable: LINEAR_2, gameCount: 0 } })

      expect(response.status).toBe(400)
      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('game_count_range')
      expect((await settingsOf(game)).teamCount).toBe(4)
      expect((await seatsOf(game))[game.ids.two]).toEqual(team(3))
      expect((await seatsOf(game))[game.ids.three]).toEqual(team(4))
      await expectNothingWritten(game)
    })

    it('refuses a fractional team count with invalid_settings and changes nobody, before any floor is read (#197)', async () => {
      const game = await setup()
      await seatTeams(game)

      const response = await patch(game, { settings: { teamCount: 2.5, teamSize: 1, pointsTable: LINEAR_2 } })

      expect(response.status).toBe(400)
      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('invalid_settings')
      expect((await settingsOf(game)).teamCount).toBe(4)
      expect((await seatsOf(game))[game.ids.two]).toEqual(team(3))
      await expectNothingWritten(game)
    })

    it('takes the Team size floor from the teams that remain, so a lowering and a smaller Team size may come in one request', async () => {
      const game = await setup()
      // Team 4, which the request removes, holds three Players; the teams that remain hold one each.
      await seat(game, 'one', team(4))
      await seat(game, 'two', team(4))
      await seat(game, 'three', team(4))
      await seat(game, 'four', team(1))
      await seat(game, 'host', team(2))
      expect((await read(game)).settingsFloors).toEqual({ teamSize: 3, vetoAllowance: 0, gameCount: 0 })

      const response = await patch(game, { settings: { teamCount: 2, teamSize: 2, pointsTable: LINEAR_2 } })

      expect(response.status).toBe(200)
      expect(await settingsOf(game)).toMatchObject({ teamCount: 2, teamSize: 2 })
      expect(await seatsOf(game)).toEqual({
        [game.ids.one]: BENCH,
        [game.ids.two]: BENCH,
        [game.ids.three]: BENCH,
        [game.ids.four]: team(1),
        [game.ids.host]: team(2),
      })
    })

    it('changes nobody and writes nothing when the same lowering leaves the Team size below the fullest team', async () => {
      const game = await setup()
      await seatTeams(game)

      const response = await patch(game, { settings: { teamCount: 2, pointsTable: LINEAR_2, teamSize: 1 } })

      expect(response.status).toBe(409)
      expect((await response.json() as { statusMessage: string }).statusMessage).toBe('team_size_below_fullest')
      expect((await settingsOf(game)).teamCount).toBe(4)
      expect((await seatsOf(game))[game.ids.two]).toEqual(team(3))
      expect((await seatsOf(game))[game.ids.three]).toEqual(team(4))
      await expectNothingWritten(game)
    })
  })

  describe('other changes', () => {
    it('moves nobody when the team count rises or other settings change', async () => {
      const game = await setup()
      await seatTeams(game)

      expect((await patch(game, { settings: { teamCount: 6, pointsTable: { preset: 'linear', values: [5, 4, 3, 2, 1, 0] } } })).status).toBe(200)
      expect((await patch(game, { settings: { gameCount: 12 } })).status).toBe(200)

      expect((await seatsOf(game))[game.ids.two]).toEqual(team(3))
      expect((await seatsOf(game))[game.ids.three]).toEqual(team(4))
      expect(notifier.messages(game.eventId).filter(message => message.type === 'member.moved')).toEqual([])
      expect((await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).map(entry => entry.type)).not.toContain('member_moved')
    })
  })
})
