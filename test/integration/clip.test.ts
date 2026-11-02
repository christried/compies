import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import skipClip from '../../server/api/e/[slug]/clip/skip.post'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import spinWheel from '../../server/api/e/[slug]/rounds/spin.post'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import { activity, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The synced clip (#230, spec #218 § Clip, § Deadlines): the Event read has the clip of the latest draw from its stop to the end
// of the game's clip length, for every Member alike, and the Host's skip ends it for everyone, late joiners included. A clip
// is a read of the draw's instants (no timer runs); only the skip is stored. The Hidden wheel's secrecy before the stop is
// asserted here on the clip; the rest of it is in hidden-wheel.test.ts.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'
const LEAD = 1500
const STOP = LEAD + 6000
const CLIP_MS = 30_000

describe('the synced clip', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/move': moveMember,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/sessions/end': endSession,
      'POST /api/e/:slug/rounds': setGame,
      'POST /api/e/:slug/rounds/spin': spinWheel,
      'POST /api/e/:slug/clip/skip': skipClip,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await testDb.db.delete(draws)
    await testDb.db.delete(rounds)
    await testDb.db.delete(eventPoolGames)
    await testDb.db.delete(activity)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(games)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const team = (n: number): Place => ({ zone: 'team', team: n })
  const iso = (offsetMs: number) => new Date(new Date(T0).getTime() + offsetMs).toISOString()

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async function errorOf(response: Response) {
    return { status: response.status, code: (await response.json() as { statusMessage: string }).statusMessage }
  }

  /**
   * A Running Session with two teams of one Player each (One in team 1, Two in team 2) and two games in the Game pool: Halo with a
   * video (clip from second 90, 30 s long) and Kart without one. With `wheel` the Selection mode is the Lucky Wheel, `hidden`
   * makes it a Hidden wheel.
   */
  async function running({ wheel = false, hidden = false }: { wheel?: boolean, hidden?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = { one: (await signIn(testDb.db, players.one)).cookie, two: (await signIn(testDb.db, players.two)).cookie }
    const selection = wheel ? { selectionMode: 'lucky_wheel', ...(hidden ? { hiddenWheel: true, vetoAllowance: 3 } : {}) } : {}
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS, settings: { ...TEST_SETTINGS, teamSize: 1, ...selection } })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const eventId = eventRow!.id
    const ids = {} as Record<'host' | keyof typeof players, string>
    for (const [key, profile] of Object.entries({ host, ...players })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key as keyof typeof ids] = row!.id
    }
    for (const key of Object.keys(players) as (keyof typeof players)[]) await testDb.db.insert(eventMembers).values({ eventId, userId: ids[key] })

    const inserted = await testDb.db.insert(games).values([
      { name: 'Halo', createdBy: ids.host, youtubeId: 'aaaaaaaaaaa', clipStart: 90, clipLength: 30 },
      { name: 'Kart', createdBy: ids.host },
    ]).returning()
    const [halo, kart] = inserted as [typeof inserted[number], typeof inserted[number]]
    await testDb.db.insert(eventPoolGames).values([{ eventId, gameId: halo.id, pool: 'main' }, { eventId, gameId: kart.id, pool: 'main' }])

    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
    for (const slotId of slotIds) expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId })).status).toBe(200)
    for (const [key, position] of [['one', 1], ['two', 2]] as const) {
      expect((await send('POST', `/api/e/${slug}/move`, cookies[key], { userId: ids[key], to: team(position) })).status).toBe(200)
    }
    expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
    notifier.clear()
    return { slug, eventId, hostCookie, cookies, ids, halo, kart }
  }

  type Game = Awaited<ReturnType<typeof running>>

  const readText = async (game: Game, cookie = game.hostCookie) => await (await send('GET', `/api/e/${game.slug}`, cookie)).text()
  const read = async (game: Game, cookie = game.hostCookie) => JSON.parse(await readText(game, cookie)) as EventView
  const set = (game: Game, gameId: string) => send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, { gameId })
  const spin = (game: Game) => send('POST', `/api/e/${game.slug}/rounds/spin`, game.hostCookie)
  const skip = (game: Game, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/clip/skip`, cookie)

  /** Spins until the wheel draws Halo (the game with a video), so the tests need not know the draw. */
  async function spunHalo(game: Game) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await spin(game)
      expect(response.status).toBe(200)
      const [row] = await testDb.db.select().from(draws).where(eq(draws.roundId, ((await response.json()) as { roundId: string }).roundId))
      if (row!.gameId === game.halo.id) return row!
      // Not Halo: put the Round aside by deleting it, and spin again.
      await testDb.db.delete(draws).where(eq(draws.id, row!.id))
      await testDb.db.delete(rounds).where(eq(rounds.id, row!.roundId))
    }
    throw new Error('the wheel never drew Halo')
  }

  describe('from a set game', () => {
    it('starts at the commit for every Member, with the game and the start second, and ends the clip length later', async () => {
      const game = await running()

      await set(game, game.halo.id)

      for (const cookie of [game.hostCookie, game.cookies.one, game.cookies.two]) {
        const view = await read(game, cookie)
        expect(view.clip).toMatchObject({
          drawId: (await testDb.db.select().from(draws))[0]!.id,
          startAt: iso(0),
          endsAt: iso(CLIP_MS),
          game: { id: game.halo.id, name: 'Halo', youtubeId: 'aaaaaaaaaaa', clipStart: 90, clipLength: 30 },
        })
      }
    })

    it('runs until the end instant and not a moment longer', async () => {
      const game = await running()
      await set(game, game.halo.id)

      clock.advance(CLIP_MS - 1)
      expect((await read(game, game.cookies.one)).clip).not.toBeNull()
      clock.advance(1)
      expect((await read(game, game.cookies.one)).clip).toBeNull()
    })

    it('has no clip before any game is set, and carries a game without a video (the client shows its card)', async () => {
      const game = await running()
      expect((await read(game)).clip).toBeNull()

      await set(game, game.kart.id)

      expect((await read(game, game.cookies.two)).clip?.game).toMatchObject({ id: game.kart.id, name: 'Kart', youtubeId: null })
    })

    it('is the latest draw\'s: a game set during a clip takes over', async () => {
      const game = await running()
      await set(game, game.halo.id)
      clock.advance(5000)
      await set(game, game.kart.id)

      expect((await read(game)).clip).toMatchObject({ game: { id: game.kart.id }, startAt: iso(5000), endsAt: iso(5000 + CLIP_MS) })
    })

    it('is gone with the Session: a clip does not outlive the end of the Session', async () => {
      const game = await running()
      await set(game, game.halo.id)

      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)

      expect((await read(game, game.cookies.one)).clip).toBeNull()
    })
  })

  describe('from a spin', () => {
    it('starts at the wheel\'s stop and not before: a read during the spin has none', async () => {
      const game = await running({ wheel: true })
      const row = await spunHalo(game)

      clock.advance(STOP - 1)
      expect((await read(game, game.cookies.one)).clip).toBeNull()
      expect((await read(game)).clip).toBeNull()

      clock.advance(1)
      const view = await read(game, game.cookies.one)
      expect(view.clip).toMatchObject({ drawId: row.id, startAt: iso(STOP), endsAt: iso(STOP + CLIP_MS), game: { id: game.halo.id } })
      expect((await read(game)).clip).toEqual(view.clip)
    })

    it('ends at the stop plus the clip length', async () => {
      const game = await running({ wheel: true })
      await spunHalo(game)

      clock.advance(STOP + CLIP_MS - 1)
      expect((await read(game)).clip).not.toBeNull()
      clock.advance(1)
      expect((await read(game)).clip).toBeNull()
    })

    it('tells a Player under a Hidden wheel nothing about the drawn game before the stop', async () => {
      const game = await running({ wheel: true, hidden: true })
      await spunHalo(game)

      clock.advance(STOP - 1)
      const text = await readText(game, game.cookies.one)

      expect(JSON.parse(text).clip).toBeNull()
      for (const secret of [game.halo.id, 'Halo', 'aaaaaaaaaaa', game.kart.id, 'Kart']) expect(text).not.toContain(secret)
    })

    it('gives that Player the clip from the stop on', async () => {
      const game = await running({ wheel: true, hidden: true })
      await spunHalo(game)

      clock.advance(STOP)

      expect((await read(game, game.cookies.one)).clip?.game).toMatchObject({ id: game.halo.id, youtubeId: 'aaaaaaaaaaa' })
    })
  })

  describe('skipping', () => {
    it('is the Host\'s: a Member gets 403 not_host and the clip goes on', async () => {
      const game = await running()
      await set(game, game.halo.id)

      expect(await errorOf(await skip(game, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })

      expect((await read(game, game.cookies.two)).clip).not.toBeNull()
      expect((await testDb.db.select().from(draws))[0]!.clipSkippedAt).toBeNull()
    })

    it('ends the clip for everyone, also for a read made later (a late joiner), and stores the instant of the skip', async () => {
      const game = await running()
      await set(game, game.halo.id)
      clock.advance(4000)

      const response = await skip(game)

      expect(response.status).toBe(200)
      expect((await testDb.db.select().from(draws))[0]!.clipSkippedAt).toEqual(new Date(iso(4000)))
      clock.advance(1000)
      for (const cookie of [game.hostCookie, game.cookies.one, game.cookies.two]) expect((await read(game, cookie)).clip).toBeNull()
    })

    it('tells the room the Event changed, so every client refetches and closes the clip', async () => {
      const game = await running()
      await set(game, game.halo.id)
      notifier.clear()

      await skip(game)

      expect(notifier.messages(game.eventId).map(message => message.type)).toEqual(['event.changed'])
    })

    it('skips the clip of a spin that has stopped, settling the draw first', async () => {
      const game = await running({ wheel: true })
      await spunHalo(game)
      clock.advance(STOP + 2000)

      expect((await skip(game)).status).toBe(200)

      expect((await read(game, game.cookies.one)).clip).toBeNull()
    })

    it('does not take the next draw\'s clip with it', async () => {
      const game = await running()
      await set(game, game.halo.id)
      await skip(game)
      clock.advance(1000)

      await set(game, game.kart.id)

      expect((await read(game, game.cookies.one)).clip?.game.id).toBe(game.kart.id)
    })

    it('answers 409 no_clip when no clip runs: before any game, after the end, during a spin, after a skip', async () => {
      const game = await running({ wheel: true })
      expect(await errorOf(await skip(game))).toEqual({ status: 409, code: 'no_clip' })

      await spunHalo(game)
      clock.advance(STOP - 1)
      expect(await errorOf(await skip(game))).toEqual({ status: 409, code: 'no_clip' })

      clock.advance(1)
      expect((await skip(game)).status).toBe(200)
      expect(await errorOf(await skip(game))).toEqual({ status: 409, code: 'no_clip' })
    })

    it('answers 409 no_clip once the clip has run out', async () => {
      const game = await running()
      await set(game, game.halo.id)
      clock.advance(CLIP_MS)

      expect(await errorOf(await skip(game))).toEqual({ status: 409, code: 'no_clip' })
    })

    it('answers 401 to nobody and writes nothing when it refuses', async () => {
      const game = await running()
      await set(game, game.halo.id)
      notifier.clear()

      expect((await send('POST', `/api/e/${game.slug}/clip/skip`, undefined)).status).toBe(401)
      expect(await errorOf(await skip(game, game.cookies.two))).toMatchObject({ status: 403 })

      expect(notifier.messages(game.eventId)).toEqual([])
    })
  })
})
