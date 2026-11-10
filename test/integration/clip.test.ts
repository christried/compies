import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { draws, rounds } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { EventView } from '../../shared/event'
import de from '../../i18n/locales/de.json'
import { SPIN } from '../draw-offsets'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { startRunningEvent, type Stage } from './scenario'
import { stubAuthEnv } from './sign-in'

// The synced clip (#230, spec #218 § Clip, § Deadlines): the Event read has the clip of the latest draw from its stop to the end
// of the game's clip length, for every Member alike, and the Host's skip ends it for everyone, late joiners included. A clip
// is a read of the draw's instants (no timer runs); only the skip is stored. The Hidden wheel's secrecy before the stop is
// asserted here on the clip; the rest of it is in hidden-wheel.test.ts.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const T0 = '2090-10-30T10:00:00.000Z'
const { stop: STOP } = SPIN
const CLIP_MS = 30_000

describe('the synced clip', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let stage: Stage
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock })
    stage = { request, db: testDb.db, clock, notifier }
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

  const iso = (offsetMs: number) => new Date(new Date(T0).getTime() + offsetMs).toISOString()

  const send = sendVia(() => request)

  /**
   * A Running Session with two teams of one Player each (One in team 1, Two in team 2) and two games in the Game pool: Halo with a
   * video (clip from second 90, 30 s long) and Kart without one. With `wheel` the Selection mode is the Lucky Wheel, `hidden`
   * makes it a Hidden wheel.
   */
  async function running({ wheel = false, hidden = false }: { wheel?: boolean, hidden?: boolean } = {}) {
    const selection = wheel ? { selectionMode: 'lucky_wheel', ...(hidden ? { hiddenWheel: true, vetoAllowance: 3 } : {}) } : {}
    const event = await startRunningEvent(stage, {
      host, players, seats: [['one', 1], ['two', 2]] as const, settings: { teamSize: 1, ...selection },
      games: [
        { key: 'halo', pool: true, values: { name: 'Halo Infinite', youtubeId: 'aaaaaaaaaaa', clipStart: 90, clipLength: 30, priceCents: 1999, priceSource: 'steam', priceCheckedAt: new Date('2026-11-03T10:00:00.000Z') } },
        { key: 'kart', pool: true, values: { name: 'Kart Racer' } },
      ],
    })
    return {
      slug: event.slug, eventId: event.eventId, hostCookie: event.host.cookie,
      cookies: { one: event.players.one.cookie, two: event.players.two.cookie },
      ids: { host: event.host.id, one: event.players.one.id, two: event.players.two.id },
      halo: event.games.halo, kart: event.games.kart,
    }
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
          game: { id: game.halo.id, name: 'Halo Infinite', youtubeId: 'aaaaaaaaaaa', clipStart: 90, clipLength: 30, price: { cents: 1999, source: 'steam', checkedAt: '2026-11-03T10:00:00.000Z' } },
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

      expect((await read(game, game.cookies.two)).clip?.game).toMatchObject({ id: game.kart.id, name: 'Kart Racer', youtubeId: null })
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
      // The names are ones no placeholder contains: "Kart" is in "Mario Kartoffel" and "Halo" in "Halo Hallo", which a Hidden wheel shows (F21).
      expect(de.wheel.placeholders.filter(placeholder => placeholder.includes('Halo Infinite') || placeholder.includes('Kart Racer'))).toEqual([])
      for (const secret of [game.halo.id, 'Halo Infinite', 'aaaaaaaaaaa', game.kart.id, 'Kart Racer']) expect(text).not.toContain(secret)
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
