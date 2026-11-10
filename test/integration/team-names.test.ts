import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, eventMembers, eventTeams, events } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { EventView } from '../../shared/event'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostEndsSession, hostEntersResult, hostFinishes, hostSets, readEvent, setUpEvent, startRunningEvent, type Rig } from './scenario'
import { signIn, stubAuthEnv } from './sign-in'

// Team names (#161, spec #153 stories 34-41): a Player in a team gives one word, the team's name is the words in the
// order the Players joined, and the Host can reset it. Slots are in 2090 so the Date can be set without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const one = { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined } as const
const two = { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined } as const
const three = { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined } as const
const T0 = '2090-10-30T10:00:00.000Z'

describe('Team names', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** An Event with a set Date (Team choice open, 2 teams of 3) by the Host, with Players One, Two and Three on the Stands. */
  async function setup(settings: Record<string, unknown> = {}) {
    // One Session, two Slots: the second is a Slot the poll still offers, beside the Date (`extraSlots`).
    const event = await setUpEvent(rig, {
      host,
      players: { one, two, three },
      seats: [],
      sessions: 1,
      extraSlots: ['2090-10-31T19:00'],
      confirmed: 1,
      quiet: 'room-and-feed',
      settings: { teamSize: 3, ...settings },
    })
    return {
      slug: event.slug,
      eventId: event.eventId,
      hostCookie: event.host.cookie,
      cookies: { one: event.players.one.cookie, two: event.players.two.cookie, three: event.players.three.cookie },
      ids: { host: event.host.id, one: event.players.one.id, two: event.players.two.id, three: event.players.three.id },
    }
  }

  type Game = Awaited<ReturnType<typeof setup>>

  const send = sendVia(() => request)

  /** Seats a Player in a team through the move route, one after the other so the join order is the call order. */
  async function seat(game: Game, key: 'one' | 'two' | 'three', teamNumber: number) {
    const response = await send('POST', `/api/e/${game.slug}/move`, game.cookies[key], { userId: game.ids[key], to: { zone: 'team', team: teamNumber } })
    expect(response.status).toBe(200)
  }

  function word(game: Game, cookie: string | undefined, value: unknown) {
    return send('POST', `/api/e/${game.slug}/team-word`, cookie, { word: value })
  }

  function resetName(game: Game, cookie: string | undefined, position: number | string) {
    return send('POST', `/api/e/${game.slug}/teams/${position}/reset-name`, cookie)
  }

  async function read(game: Game, cookie = game.hostCookie): Promise<EventView> {
    return await readEvent(rig, cookie, game.slug)
  }

  async function names(game: Game) {
    return (await read(game)).teams.map(team => team.name)
  }

  /** The machine-readable code of an error response (`statusMessage`), without its status. */
  const codeOf = async (response: Response) => (await errorOf(response)).code

  describe('setting a Team word', () => {
    it('lets a Player in a team set their word, and the Event read shows the member with it', async () => {
      const game = await setup()
      await seat(game, 'one', 1)

      const response = await word(game, game.cookies.one, 'Wilde')

      expect(response.status).toBe(200)
      const view = await read(game, game.cookies.two)
      expect(view.members.find(member => member.id === game.ids.one)?.teamWord).toBe('Wilde')
      expect(view.members.find(member => member.id === game.ids.two)?.teamWord).toBeNull()
    })

    it('refuses a Player on the Stands with 409 not_in_team', async () => {
      const game = await setup()

      const onStands = await word(game, game.cookies.one, 'Wilde')
      expect(onStands.status).toBe(409)
      expect(await codeOf(onStands)).toBe('not_in_team')
    })

    it('answers 401 when signed out and 404 for a User who is no Member', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      const stranger = (await signIn(testDb.db, { provider: 'twitch', id: '9', name: 'Fremd', email: 'stranger@example.com', image: undefined })).cookie

      expect((await word(game, undefined, 'Wilde')).status).toBe(401)
      expect((await word(game, stranger, 'Wilde')).status).toBe(404)
    })

    it('takes 12 characters and refuses 13, a space and a missing word with 400 invalid_team_word', async () => {
      const game = await setup()
      await seat(game, 'one', 1)

      expect((await word(game, game.cookies.one, 'Gurkenfreund')).status).toBe(200)
      for (const bad of ['Gurkenfreunde', 'Wilde Gurken', undefined, 7]) {
        const response = await word(game, game.cookies.one, bad)
        expect(response.status).toBe(400)
        expect(await codeOf(response)).toBe('invalid_team_word')
      }
      expect((await read(game)).members.find(member => member.id === game.ids.one)?.teamWord).toBe('Gurkenfreund')
    })

    it('removes the word with an empty one', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await word(game, game.cookies.one, 'Wilde')

      expect((await word(game, game.cookies.one, '')).status).toBe(200)

      expect((await read(game)).members.find(member => member.id === game.ids.one)?.teamWord).toBeNull()
      expect(await names(game)).toEqual([null, null])
    })

    it('publishes only event.changed for a set and a removed word, and nothing on a refusal', async () => {
      const game = await setup()
      await seat(game, 'one', 2)
      notifier.clear()

      await word(game, game.cookies.one, 'Wilde')
      expect(notifier.messages(game.eventId)).toMatchObject([{ type: 'event.changed' }])

      notifier.clear()
      await word(game, game.cookies.one, '')
      expect(notifier.messages(game.eventId)).toMatchObject([{ type: 'event.changed' }])

      notifier.clear()
      await word(game, game.cookies.one, 'Zu viele Wörter')
      await word(game, game.cookies.two, 'Wilde')
      expect(notifier.messages(game.eventId)).toEqual([])
    })

    it('writes no activity entry', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await testDb.db.delete(activity)

      await word(game, game.cookies.one, 'Wilde')

      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toEqual([])
    })

    it('works under a Hidden wheel like everywhere else and changes nothing about the pools', async () => {
      const game = await setup({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 })
      await seat(game, 'one', 1)

      expect((await word(game, game.cookies.one, 'Wilde')).status).toBe(200)

      const view = await read(game, game.cookies.two)
      expect(view.pool).toBeNull()
      expect(view.teams[0]?.name).toBe('Wilde')
    })
  })

  describe('the Team name in the Event read', () => {
    it('is null for a team without words, so the client shows the colour name', async () => {
      const game = await setup()
      await seat(game, 'one', 1)

      expect((await read(game)).teams).toEqual([{ position: 1, name: null }, { position: 2, name: null }])
    })

    it('is the words in the order the Players joined the team', async () => {
      const game = await setup()
      await seat(game, 'two', 1)
      await seat(game, 'one', 1)
      await seat(game, 'three', 2)
      // The words are given in the opposite order, so the name follows the seats, not the words.
      await word(game, game.cookies.one, 'Gurken')
      await word(game, game.cookies.two, 'Wilde')
      await word(game, game.cookies.three, 'Rote')

      expect(await names(game)).toEqual(['Wilde Gurken', 'Rote'])
    })

    it('drops a word when its Player leaves the team, to the Stands', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await seat(game, 'two', 1)
      await word(game, game.cookies.one, 'Wilde')
      await word(game, game.cookies.two, 'Gurken')

      await send('POST', `/api/e/${game.slug}/move`, game.cookies.one, { userId: game.ids.one, to: { zone: 'stands' } })
      expect(await names(game)).toEqual(['Gurken', null])
      expect((await read(game)).members.find(member => member.id === game.ids.one)?.teamWord).toBeNull()

      await send('POST', `/api/e/${game.slug}/move`, game.cookies.two, { userId: game.ids.two, to: { zone: 'stands' } })
      expect(await names(game)).toEqual([null, null])
    })

    it('drops a word when its Player changes team, and a Host move does the same', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await seat(game, 'two', 1)
      await word(game, game.cookies.one, 'Wilde')
      await word(game, game.cookies.two, 'Gurken')

      await seat(game, 'one', 2)
      expect(await names(game)).toEqual(['Gurken', null])

      await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids.two, to: { zone: 'team', team: 2 } })
      expect(await names(game)).toEqual([null, null])
    })

    it('lets a Player give a new word after changing team', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await word(game, game.cookies.one, 'Wilde')
      await seat(game, 'one', 2)

      expect((await word(game, game.cookies.one, 'Gurken')).status).toBe(200)

      expect(await names(game)).toEqual([null, 'Gurken'])
    })
  })

  describe('the Host resets a Team name', () => {
    it('clears the words of that team only', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await seat(game, 'two', 1)
      await seat(game, 'three', 2)
      await word(game, game.cookies.one, 'Wilde')
      await word(game, game.cookies.two, 'Gurken')
      await word(game, game.cookies.three, 'Rote')

      const response = await resetName(game, game.hostCookie, 1)

      expect(response.status).toBe(200)
      expect(await names(game)).toEqual([null, 'Rote'])
    })

    it('publishes event.changed and activity.added once, and writes one team_name_reset entry by the Host', async () => {
      const game = await setup()
      await seat(game, 'one', 2)
      await word(game, game.cookies.one, 'Wilde')
      await testDb.db.delete(activity)
      notifier.clear()

      await resetName(game, game.hostCookie, 2)

      const messages = notifier.messages(game.eventId)
      expect(messages.map(message => message.type)).toEqual(['event.changed', 'activity.added'])
      const entries = await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ type: 'team_name_reset', actorId: game.ids.host, params: { team: 2 } })
    })

    it('refuses a Player with 403 not_host and changes nothing', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await word(game, game.cookies.one, 'Wilde')
      await testDb.db.delete(activity)
      notifier.clear()

      const response = await resetName(game, game.cookies.one, 1)

      expect(response.status).toBe(403)
      expect(await codeOf(response)).toBe('not_host')
      expect(await names(game)).toEqual(['Wilde', null])
      expect(notifier.messages(game.eventId)).toEqual([])
      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toEqual([])
    })

    it('refuses a position the Event does not have with 400 no_such_team', async () => {
      const game = await setup()

      for (const position of [0, 3, 'x', '1.5']) {
        const response = await resetName(game, game.hostCookie, position)
        expect(response.status).toBe(400)
        expect(await codeOf(response)).toBe('no_such_team')
      }
      expect(notifier.messages(game.eventId)).toEqual([])
    })

    it('refuses every position of an Event without settings with 400 no_such_team', async () => {
      const game = await setup()
      await testDb.db.update(events).set({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null }).where(eq(events.id, game.eventId))

      const response = await resetName(game, game.hostCookie, 1)

      expect(response.status).toBe(400)
      expect(await codeOf(response)).toBe('no_such_team')
    })

    it('still writes the entry for a team without words', async () => {
      const game = await setup()

      expect((await resetName(game, game.hostCookie, 1)).status).toBe(200)

      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toHaveLength(1)
    })
  })

  // --- After the start (#438): the name follows the words until the Finish ---------------------------------------------------

  /** A running Event, Session 1 started: One in team 1, Two in team 2 (teams of 2, one place free each), Three on the Stands; Session 2 still to come. */
  async function running() {
    const event = await startRunningEvent(rig, {
      host,
      players: { one, two, three },
      seats: [['one', 1], ['two', 2]],
      slots: ['2090-10-30T20:30', '2090-10-31T19:00'],
      settings: { teamSize: 2 },
      quiet: 'room-and-feed',
    })
    return {
      event,
      slug: event.slug,
      eventId: event.eventId,
      hostCookie: event.host.cookie,
      cookies: { one: event.players.one.cookie, two: event.players.two.cookie, three: event.players.three.cookie },
      ids: { host: event.host.id, one: event.players.one.id, two: event.players.two.id, three: event.players.three.id },
    }
  }

  /** A running Event with one game to play, so that it can be finished: Game count 1: One and Two in team 1, Three and Four in team 2. */
  async function finishable() {
    const four = { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined } as const
    const event = await startRunningEvent(rig, {
      host,
      players: { one, two, three, four },
      seats: [['one', 1], ['two', 1], ['three', 2], ['four', 2]],
      slots: ['2090-10-30T20:30', '2090-10-31T19:00'],
      settings: { teamSize: 2, gameCount: 1, pointsTable: { preset: 'linear' as const, values: [1, 0] }, selectionMode: 'lucky_wheel' as const, vetoAllowance: 1 },
      games: [{ key: 'halo', values: { name: 'Halo' }, pool: true }],
      quiet: 'room-and-feed',
    })
    return {
      event,
      slug: event.slug,
      eventId: event.eventId,
      hostCookie: event.host.cookie,
      cookies: { one: event.players.one.cookie, two: event.players.two.cookie, three: event.players.three.cookie, four: event.players.four.cookie },
      ids: { host: event.host.id, one: event.players.one.id, two: event.players.two.id, three: event.players.three.id, four: event.players.four.id },
    }
  }

  async function finish(game: Awaited<ReturnType<typeof finishable>>) {
    const round = await hostSets(rig, game.event, game.event.games.halo.id)
    await hostEntersResult(rig, game.event, round, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    await hostFinishes(rig, game.event, { outcome: 'winner', winners: [1] })
  }

  const storedRows = (eventId: string) => testDb.db.select().from(eventTeams).where(eq(eventTeams.eventId, eventId)).orderBy(eventTeams.position)

  describe('a Team word in a running Event', () => {
    it('is set, then changed and removed by a Player in a team: the name follows, event.changed is published, no feed entry', async () => {
      const game = await running()

      notifier.clear()
      expect((await word(game, game.cookies.one, 'Wilde')).status).toBe(200)
      expect(await names(game)).toEqual(['Wilde', null])
      expect(notifier.messages(game.eventId)).toMatchObject([{ type: 'event.changed' }])

      expect((await word(game, game.cookies.one, 'Gurken')).status).toBe(200)
      expect(await names(game)).toEqual(['Gurken', null])

      expect((await word(game, game.cookies.one, '')).status).toBe(200)
      expect(await names(game)).toEqual([null, null])
      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toEqual([])
      expect(await storedRows(game.eventId)).toEqual([])
    })

    it('is accepted between Sessions as well', async () => {
      const game = await running()
      await word(game, game.cookies.one, 'Wilde')
      await hostEndsSession(rig, game.event)
      notifier.clear()

      expect((await word(game, game.cookies.one, 'Gurken')).status).toBe(200)

      expect(await names(game)).toEqual(['Gurken', null])
      expect(notifier.messages(game.eventId)).toMatchObject([{ type: 'event.changed' }])
    })

    it('changes only the team of the caller: a Player of team 2 cannot write the word of team 1', async () => {
      const game = await running()
      await word(game, game.cookies.one, 'Wilde')

      expect((await word(game, game.cookies.two, 'Rote')).status).toBe(200)

      expect(await names(game)).toEqual(['Wilde', 'Rote'])
      expect(await word(game, game.cookies.two, 'Blaue').then(response => response.status)).toBe(200)
      expect(await names(game)).toEqual(['Wilde', 'Blaue'])
    })

    it('still refuses a Player on the Stands with 409 not_in_team', async () => {
      const game = await running()

      expect(await errorOf(await word(game, game.cookies.three, 'Wilde'))).toEqual({ status: 409, code: 'not_in_team' })

      expect(await names(game)).toEqual([null, null])
    })

    it('is added by a Player the Host moved into a team after the start, also into a team whose words the Host just reset', async () => {
      const game = await running()
      await word(game, game.cookies.one, 'Wilde')
      await resetName(game, game.hostCookie, 1)
      expect(await names(game)).toEqual([null, null])

      const moved = await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids.three, to: { zone: 'team', team: 1 } })
      expect(moved.status).toBe(200)
      // The move cleared their word (a seat change always does); they start without one and add one.
      expect(await names(game)).toEqual([null, null])
      expect((await word(game, game.cookies.three, 'Neue')).status).toBe(200)
      expect(await names(game)).toEqual(['Neue', null])

      await word(game, game.cookies.one, 'Wilde')
      expect(await names(game)).toEqual(['Wilde Neue', null])
    })

    it('leaves the name with the words: the Host moves a Player out and their word is gone from it', async () => {
      const game = await running()
      await word(game, game.cookies.one, 'Wilde')
      await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids.three, to: { zone: 'team', team: 1 } })
      await word(game, game.cookies.three, 'Gurken')
      expect(await names(game)).toEqual(['Wilde Gurken', null])

      const out = await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids.one, to: { zone: 'stands' } })

      expect(out.status).toBe(200)
      expect(await names(game)).toEqual(['Gurken', null])
    })

    it('is refused with wrong_phase in a finished Event, and the names stay', async () => {
      const game = await finishable()
      await word(game, game.cookies.one, 'Wilde')
      await word(game, game.cookies.three, 'Rote')
      await finish(game)
      notifier.clear()

      expect(await errorOf(await word(game, game.cookies.one, 'Neu'))).toEqual({ status: 409, code: 'wrong_phase' })
      expect(await errorOf(await word(game, game.cookies.three, ''))).toEqual({ status: 409, code: 'wrong_phase' })

      expect(await names(game)).toEqual(['Wilde', 'Rote'])
      expect(notifier.messages(game.eventId)).toEqual([])
    })
  })

  describe('the Host\'s reset in a running Event', () => {
    it('clears every word of the team, leaves the other team alone, and writes its entry', async () => {
      const game = await finishable()
      await word(game, game.cookies.one, 'Wilde')
      await word(game, game.cookies.two, 'Gurken')
      await word(game, game.cookies.three, 'Rote')
      expect(await names(game)).toEqual(['Wilde Gurken', 'Rote'])
      notifier.clear()

      const response = await resetName(game, game.hostCookie, 1)

      expect(response.status).toBe(200)
      expect(await names(game)).toEqual([null, 'Rote'])
      const words = await testDb.db.select({ id: eventMembers.userId, word: eventMembers.teamWord }).from(eventMembers).where(eq(eventMembers.eventId, game.eventId))
      expect(words.filter(row => row.word !== null).map(row => row.word)).toEqual(['Rote'])
      expect(notifier.messages(game.eventId).map(message => message.type)).toEqual(['event.changed', 'activity.added'])
      const entries = await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ type: 'team_name_reset', actorId: game.ids.host, params: { team: 1 } })
      expect(await storedRows(game.eventId)).toEqual([])
    })

    it('answers 200 and writes its entry for a team without words, and refuses a finished Event', async () => {
      const game = await finishable()

      expect((await resetName(game, game.hostCookie, 2)).status).toBe(200)
      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toHaveLength(1)

      await finish(game)
      expect(await errorOf(await resetName(game, game.hostCookie, 2))).toEqual({ status: 409, code: 'wrong_phase' })
    })
  })

  describe('stored names (event_teams), read only in an Event finished before 0.12', () => {
    it('shows the stored names of a finished Event, null for the colour name even when words exist', async () => {
      const game = await finishable()
      await word(game, game.cookies.one, 'Wilde')
      await word(game, game.cookies.three, 'Rote')
      await finish(game)
      // An Event finished before 0.12: the rows are there, the Finish of this code deleted its own.
      await testDb.db.insert(eventTeams).values([{ eventId: game.eventId, position: 1, frozenName: 'Alte Hasen' }, { eventId: game.eventId, position: 2, frozenName: null }])

      expect(await names(game)).toEqual(['Alte Hasen', null])
    })

    it('ignores the rows the previous deployment writes at a start, in an Event that is not finished', async () => {
      const game = await finishable()
      await word(game, game.cookies.one, 'Wilde')
      await testDb.db.insert(eventTeams).values([{ eventId: game.eventId, position: 1, frozenName: 'Alt' }, { eventId: game.eventId, position: 2, frozenName: 'Auch alt' }])

      expect(await names(game)).toEqual(['Wilde', null])
    })

    it('are deleted by the Finish, so the names do not jump back to the stray ones', async () => {
      const game = await finishable()
      await word(game, game.cookies.one, 'Wilde')
      await testDb.db.insert(eventTeams).values([{ eventId: game.eventId, position: 1, frozenName: 'Alt' }, { eventId: game.eventId, position: 2, frozenName: 'Auch alt' }])

      await finish(game)

      expect(await storedRows(game.eventId)).toEqual([])
      expect(await names(game)).toEqual(['Wilde', null])
    })
  })
})
