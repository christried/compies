import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import setTeamWord from '../../server/api/e/[slug]/team-word.post'
import resetTeamName from '../../server/api/e/[slug]/teams/[position]/reset-name.post'
import { activity, eventMembers, eventPoolGames, events, games, pollSlots, users } from '../../server/db/schema'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { EventView } from '../../shared/event'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Team names (#161, spec #153 stories 34-41): a Player in a team gives one word, the team's name is the words in the
// order the Players joined, and the Host can reset it. Slots are in 2090 so the Date can be set without a fake clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const one = { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined } as const
const two = { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined } as const
const three = { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined } as const

describe('Team names', () => {
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

  /** An Event with a set Date (Team choice open, 2 teams of 3) by the Host, with Players One, Two and Three on the Bench. */
  async function setup(settings: Record<string, unknown> = {}) {
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
        settings: { ...TEST_SETTINGS, teamSize: 3, ...settings },
      }),
    })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const ids: Record<string, string> = {}
    for (const [key, profile] of Object.entries({ host, one, two, three })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key] = row!.id
    }
    for (const key of ['one', 'two', 'three']) await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: ids[key]! })
    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)).map(row => row.id)
    const confirmed = await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })
    expect(confirmed.status).toBe(200)
    await testDb.db.delete(activity)
    notifier.clear()
    return { slug, eventId: eventRow!.id, hostCookie, cookies, ids: ids as Record<'host' | 'one' | 'two' | 'three', string> }
  }

  type Game = Awaited<ReturnType<typeof setup>>

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

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
    return await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView
  }

  async function names(game: Game) {
    return (await read(game)).teams.map(team => team.name)
  }

  async function errorOf(response: Response) {
    return (await response.json() as { statusMessage: string }).statusMessage
  }

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

    it('refuses a Player on the Bench and in the Stands with 409 not_in_team', async () => {
      const game = await setup()

      const onBench = await word(game, game.cookies.one, 'Wilde')
      expect(onBench.status).toBe(409)
      expect(await errorOf(onBench)).toBe('not_in_team')

      await send('POST', `/api/e/${game.slug}/move`, game.cookies.one, { userId: game.ids.one, to: { zone: 'stands' } })
      const inStands = await word(game, game.cookies.one, 'Wilde')
      expect(inStands.status).toBe(409)
      expect(await errorOf(inStands)).toBe('not_in_team')
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
        expect(await errorOf(response)).toBe('invalid_team_word')
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

    it('publishes team.wordSet once per set, with null for a removed word, and nothing on a refusal', async () => {
      const game = await setup()
      await seat(game, 'one', 2)
      notifier.clear()

      await word(game, game.cookies.one, 'Wilde')
      expect(notifier.messages(game.eventId)).toMatchObject([
        { type: 'event.changed' },
        { type: 'team.wordSet', team: 2, userId: game.ids.one, word: 'Wilde' },
      ])

      notifier.clear()
      await word(game, game.cookies.one, '')
      expect(notifier.messages(game.eventId).filter(message => message.type === 'team.wordSet')).toMatchObject([
        { type: 'team.wordSet', team: 2, userId: game.ids.one, word: null },
      ])

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
      expect(view.pools.hidden).toBe(true)
      expect(view.teams[0]?.name).toBe('Wilde')
    })
  })

  describe('the Team name in the Event read', () => {
    it('is null for a team without words, so the client shows the colour name', async () => {
      const game = await setup()
      await seat(game, 'one', 1)

      expect((await read(game)).teams).toEqual([{ position: 1, name: null, frozen: false }, { position: 2, name: null, frozen: false }])
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

    it('drops a word when its Player leaves the team, to the Bench or to the Stands', async () => {
      const game = await setup()
      await seat(game, 'one', 1)
      await seat(game, 'two', 1)
      await word(game, game.cookies.one, 'Wilde')
      await word(game, game.cookies.two, 'Gurken')

      await send('POST', `/api/e/${game.slug}/move`, game.cookies.one, { userId: game.ids.one, to: { zone: 'bench' } })
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

    it('publishes team.nameReset and activity.added once, and writes one team_name_reset entry by the Host', async () => {
      const game = await setup()
      await seat(game, 'one', 2)
      await word(game, game.cookies.one, 'Wilde')
      await testDb.db.delete(activity)
      notifier.clear()

      await resetName(game, game.hostCookie, 2)

      const messages = notifier.messages(game.eventId)
      expect(messages.map(message => message.type)).toEqual(['event.changed', 'activity.added', 'team.nameReset'])
      expect(messages.find(message => message.type === 'team.nameReset')).toMatchObject({ type: 'team.nameReset', team: 2 })
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
      expect(await errorOf(response)).toBe('not_host')
      expect(await names(game)).toEqual(['Wilde', null])
      expect(notifier.messages(game.eventId)).toEqual([])
      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toEqual([])
    })

    it('refuses a position the Event does not have with 400 no_such_team', async () => {
      const game = await setup()

      for (const position of [0, 3, 'x', '1.5']) {
        const response = await resetName(game, game.hostCookie, position)
        expect(response.status).toBe(400)
        expect(await errorOf(response)).toBe('no_such_team')
      }
      expect(notifier.messages(game.eventId)).toEqual([])
    })

    it('refuses every position of an Event without settings with 400 no_such_team', async () => {
      const game = await setup()
      await testDb.db.update(events).set({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null }).where(eq(events.id, game.eventId))

      const response = await resetName(game, game.hostCookie, 1)

      expect(response.status).toBe(400)
      expect(await errorOf(response)).toBe('no_such_team')
    })

    it('still writes the entry for a team without words', async () => {
      const game = await setup()

      expect((await resetName(game, game.hostCookie, 1)).status).toBe(200)

      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, game.eventId))).toHaveLength(1)
    })
  })
})
