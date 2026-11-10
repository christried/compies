import { readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, countdowns, events, rounds, sessions } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { createTestApp, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostEntersResult, hostFinishes, hostSets, startRunningEvent, type Stage } from './scenario'
import { stubAuthEnv } from './sign-in'

// A finished Event is read-only for good (#277, spec #272): every write answers `wrong_phase`, and nothing it was asked to change changes.
// The table is list-driven: each write route of the Event API is one entry, sent by the User it needs (the Host, or a Player for the routes
// a Player uses). The guard test reads the folder of the routes and fails when a write is not in the table or in the explicit list of
// writes that a finished Event still takes (rotate and the ceremony) or that write nothing (room).

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
} as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'

describe('a finished Event is read-only', () => {
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

  const send = sendVia(() => request)

  /**
   * A running Lucky Wheel Event with one Result, finished: Game count 1, the Host set Halo and entered team 1's win, and finished it.
   * Players one and two sit in team 1, three and four in team 2. Returns the ids the table needs.
   */
  async function finishedWheel() {
    const ev = await startRunningEvent(stage, {
      host,
      players,
      seats: [['one', 1], ['two', 1], ['three', 2], ['four', 2]],
      slots: SLOTS,
      settings: {
        gameCount: 1,
        pointsTable: { preset: 'linear' as const, values: [1, 0] },
        selectionMode: 'lucky_wheel' as const,
        vetoAllowance: 1,
      },
      games: [
        { key: 'halo', values: { name: 'Halo' }, pool: true },
        { key: 'kart', values: { name: 'Kart' }, pool: true },
      ],
    })
    const session = (await testDb.db.select().from(sessions).where(eq(sessions.eventId, ev.eventId))).find(row => row.startedAt !== null)!.id
    const round = await hostSets(stage, ev, ev.games.halo.id)
    await hostEntersResult(stage, ev, round, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    await hostFinishes(stage, ev, { outcome: 'winner', winners: [1] })
    notifier.clear()
    const cookies = { one: ev.players.one.cookie, two: ev.players.two.cookie, three: ev.players.three.cookie, four: ev.players.four.cookie }
    const ids = { host: ev.host.id, one: ev.players.one.id, two: ev.players.two.id, three: ev.players.three.id, four: ev.players.four.id }
    return { slug: ev.slug, eventId: ev.eventId, hostCookie: ev.host.cookie, cookies, ids, round, session, slots: ev.slotIds, kart: ev.games.kart.id }
  }

  type Finished = Awaited<ReturnType<typeof finishedWheel>>

  /** One write of the Event API: its route file, what it is, the request it takes and the User who sends it (the Host, or the Player it is for). */
  type Write = { file: string, name: string, as: 'host' | 'player', method: string, path: string, body?: unknown }

  /** Every write of the Event API (see the table's header). */
  function writes(game: Finished): Write[] {
    const { slug, round, session, slots, kart, ids } = game
    return [
      { file: 'rounds/index.post.ts', name: 'set a game', as: 'host', method: 'POST', path: `/api/e/${slug}/rounds`, body: { gameId: kart } },
      { file: 'rounds/spin.post.ts', name: 'spin the wheel', as: 'host', method: 'POST', path: `/api/e/${slug}/rounds/spin` },
      { file: 'rounds/[id].delete.ts', name: 'put a Round back', as: 'host', method: 'DELETE', path: `/api/e/${slug}/rounds/${round}` },
      { file: 'rounds/[id]/result.put.ts', name: 'enter a Result', as: 'host', method: 'PUT', path: `/api/e/${slug}/rounds/${round}/result`, body: { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] } },
      { file: 'settings.patch.ts', name: 'change the settings', as: 'host', method: 'PATCH', path: `/api/e/${slug}/settings`, body: { settings: { gameCount: 3 } } },
      { file: 'sessions/index.post.ts', name: 'add a Session', as: 'host', method: 'POST', path: `/api/e/${slug}/sessions`, body: {} },
      { file: 'sessions/[id].delete.ts', name: 'remove a Session', as: 'host', method: 'DELETE', path: `/api/e/${slug}/sessions/${session}` },
      { file: 'sessions/[id]/reschedule.post.ts', name: 'reschedule a Session', as: 'host', method: 'POST', path: `/api/e/${slug}/sessions/${session}/reschedule`, body: { startsAt: '2090-11-02T19:00' } },
      { file: 'sessions/[id]/reopen.post.ts', name: 'reopen a Session', as: 'host', method: 'POST', path: `/api/e/${slug}/sessions/${session}/reopen` },
      { file: 'sessions/start.post.ts', name: 'start a Session', as: 'host', method: 'POST', path: `/api/e/${slug}/sessions/start` },
      { file: 'sessions/end.post.ts', name: 'end a Session', as: 'host', method: 'POST', path: `/api/e/${slug}/sessions/end` },
      { file: 'confirm.post.ts', name: 'set a Date', as: 'host', method: 'POST', path: `/api/e/${slug}/confirm`, body: { slotId: slots[0] } },
      { file: 'slots/index.post.ts', name: 'add a Slot', as: 'host', method: 'POST', path: `/api/e/${slug}/slots`, body: { startsAt: '2090-11-03T19:00' } },
      { file: 'slots/[slotId].patch.ts', name: 'move a Slot', as: 'host', method: 'PATCH', path: `/api/e/${slug}/slots/${slots[0]}`, body: { startsAt: '2090-11-04T19:00' } },
      { file: 'slots/[slotId].delete.ts', name: 'delete a Slot', as: 'host', method: 'DELETE', path: `/api/e/${slug}/slots/${slots[0]}` },
      { file: 'slots/[slotId]/vote.put.ts', name: 'vote on a Slot', as: 'player', method: 'PUT', path: `/api/e/${slug}/slots/${slots[0]}/vote`, body: { value: 'yes' } },
      { file: 'move.post.ts', name: 'move a Member', as: 'player', method: 'POST', path: `/api/e/${slug}/move`, body: { userId: ids.three, to: { zone: 'bench' } } },
      { file: 'team-word.post.ts', name: 'set a Team word', as: 'player', method: 'POST', path: `/api/e/${slug}/team-word`, body: { word: 'Gurken' } },
      { file: 'teams/[position]/reset-name.post.ts', name: 'reset a Team name', as: 'host', method: 'POST', path: `/api/e/${slug}/teams/1/reset-name` },
      { file: 'bonus-vetoes.post.ts', name: 'grant a Bonus Veto', as: 'host', method: 'POST', path: `/api/e/${slug}/bonus-vetoes`, body: { team: 1 } },
      { file: 'draws/[drawId]/veto.post.ts', name: 'cast a Veto', as: 'player', method: 'POST', path: `/api/e/${slug}/draws/${round}/veto`, body: {} },
      { file: 'clip/skip.post.ts', name: 'skip the clip', as: 'host', method: 'POST', path: `/api/e/${slug}/clip/skip` },
      { file: 'coin.post.ts', name: 'toss the coin', as: 'host', method: 'POST', path: `/api/e/${slug}/coin` },
      { file: 'countdown/index.put.ts', name: 'set the Countdown', as: 'host', method: 'PUT', path: `/api/e/${slug}/countdown`, body: { seconds: 60 } },
      { file: 'countdown/start.post.ts', name: 'start the Countdown', as: 'host', method: 'POST', path: `/api/e/${slug}/countdown/start` },
      { file: 'countdown/pause.post.ts', name: 'pause the Countdown', as: 'host', method: 'POST', path: `/api/e/${slug}/countdown/pause` },
      { file: 'countdown/reset.post.ts', name: 'reset the Countdown', as: 'host', method: 'POST', path: `/api/e/${slug}/countdown/reset` },
      { file: 'finish.post.ts', name: 'finish the Event again', as: 'host', method: 'POST', path: `/api/e/${slug}/finish`, body: { outcome: 'winner', winners: [1] } },
      { file: 'last-game.post.ts', name: 'add a last game', as: 'host', method: 'POST', path: `/api/e/${slug}/last-game` },
    ]
  }

  /** The writes a finished Event still takes or that write nothing: a new write must be in the table above, or here with its reason. */
  // The ceremony is the second write a finished Event takes (#309): the Host starts it there, and a Player is refused with not_host (own case below).
  const STILL_TAKEN = new Set(['rotate.post.ts', 'ceremony.post.ts'])
  const WRITES_NOTHING = new Set(['room.post.ts'])

  /** What a refused write must leave as it was: the Event row, its Sessions, its open and drawn Rounds, its Countdown and the feed. */
  async function stateOf(eventId: string) {
    return {
      event: await testDb.db.select().from(events).where(eq(events.id, eventId)),
      sessions: await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId)),
      rounds: await testDb.db.select().from(rounds).where(eq(rounds.eventId, eventId)),
      countdowns: await testDb.db.select().from(countdowns).where(eq(countdowns.eventId, eventId)),
      activity: await testDb.db.select().from(activity).where(eq(activity.eventId, eventId)),
    }
  }

  it('answers every write with wrong_phase, and changes nothing', async () => {
    const game = await finishedWheel()
    const before = await stateOf(game.eventId)

    const answers: { name: string, status: number, code: string }[] = []
    for (const write of writes(game)) {
      // The Host sends the Host's writes; a Player (a seated one, so the Event's refusal is the first answer) sends the Player's.
      const cookie = write.as === 'host' ? game.hostCookie : game.cookies.three
      const response = await send(write.method, write.path, cookie, write.body)
      answers.push({ name: write.name, status: response.status, code: (await response.json() as { statusMessage: string }).statusMessage })
    }

    expect(answers).toEqual(writes(game).map(write => ({ name: write.name, status: 409, code: 'wrong_phase' })))
    expect(await stateOf(game.eventId)).toEqual(before)
    expect(notifier.messages(game.eventId)).toEqual([])
  })

  it('still takes the start of the ceremony from the Host, and refuses it from a Player (#309)', async () => {
    const game = await finishedWheel()

    const player = await send('POST', `/api/e/${game.slug}/ceremony`, game.cookies.three)
    expect(player.status).toBe(403)
    expect((await player.json() as { statusMessage: string }).statusMessage).toBe('not_host')
    expect((await send('POST', `/api/e/${game.slug}/ceremony`, game.hostCookie)).status).toBe(200)
  })

  it('lists every write route of the Event API in the table, or in the explicit lists of writes that stay open', async () => {
    const folder = join(fileURLToPath(new URL('../..', import.meta.url)), 'server', 'api', 'e', '[slug]')
    const files = readdirSync(folder, { recursive: true }).map(entry => String(entry).split(sep).join('/')).filter(file => /\.(post|put|patch|delete)\.ts$/.test(file))
    const listed = writes(await finishedWheel()).map(write => write.file)
    const classified = new Set([...listed, ...STILL_TAKEN, ...WRITES_NOTHING])

    expect(files.filter(file => !classified.has(file)), 'a new write: add it to the table').toEqual([])
    expect(listed.filter(file => !files.includes(file)), 'a renamed or removed route: fix the table').toEqual([])
  })
})
