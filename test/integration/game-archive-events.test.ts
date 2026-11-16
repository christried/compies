import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, draws, eventPoolGames, events, games, rounds } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { fileShareAssets } from '../../server/utils/share-assets'
import type { EventView } from '../../shared/event'
import { notesFromLines } from '../../shared/notes-doc'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { clockToStop, hostCreatesEvent, hostEntersResult, hostFinishes, hostSets, hostSpins, readEvent, readEventText, readFeed, signInAs, startRunningEvent, type Rig } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// An Archived game leaves the wheel, „Nächstes Spiel setzen“ and the Members' pool (#725, spec #717 § B, ADR 0013): the Event state's reading of the
// pool leaves it out, so the games left, the spin, the pool warning, the wheel and the picker follow with no pool row touched. What a Round or a Draw
// already holds stays. Every name and id is invented. The secrecy of the Members' reads is game-archive-secrecy.test.ts.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '30', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const T0 = '2090-10-30T10:00:00.000Z'
const NEEDED_ALL = ['halo', 'kart', 'dame'] as const

describe('Archived games and the Events (#725)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const store = memoryImageStore()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, imageStore: store, clock, shareAssets: fileShareAssets() })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:30' })
    clock.set(T0)
    notifier.clear()
    store.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => request)

  /**
   * A Running Session of an Event with two teams of one: Halo, Kart and Dame in the Game pool, Schach only in the library. With `wheel` the Selection mode
   * is the Lucky Wheel (visible unless `hidden`, no Veto allowance unless `vetoAllowance` says otherwise: the Veto window is vetoes.test.ts's).
   */
  async function running({ wheel = true, hidden = false, poolPreview = true, vetoAllowance = 0, gameCount = 10 }: { wheel?: boolean, hidden?: boolean, poolPreview?: boolean, vetoAllowance?: number, gameCount?: number } = {}) {
    const ev = await startRunningEvent(rig, {
      host,
      players,
      seats: [['one', 1], ['two', 2]],
      settings: { teamSize: 1, gameCount, poolPreview, ...(wheel ? { selectionMode: 'lucky_wheel', hiddenWheel: hidden, vetoAllowance } : {}) },
      games: [
        { key: 'halo', values: { name: 'Halo', imageKey: 'halo-key' }, pool: true },
        { key: 'kart', values: { name: 'Kart', imageKey: 'kart-key' }, pool: true },
        { key: 'dame', values: { name: 'Dame', imageKey: 'dame-key' }, pool: true },
        { key: 'schach', values: { name: 'Schach', imageKey: 'schach-key' }, pool: false },
      ],
      quiet: 'room-and-feed',
    })
    return { ...ev, hostCookie: ev.host.cookie, one: ev.players.one.cookie, two: ev.players.two.cookie }
  }

  type Party = Awaited<ReturnType<typeof running>>

  const archived = (gameId: string, value: boolean, cookie: string) => send('PUT', `/api/games/${gameId}/archived`, cookie, { archived: value })
  const archive = async (party: Party, ...ids: string[]) => {
    for (const id of ids) expect((await archived(id, true, party.hostCookie)).status).toBe(200)
  }
  const restore = async (party: Party, ...ids: string[]) => {
    for (const id of ids) expect((await archived(id, false, party.hostCookie)).status).toBe(200)
  }
  const poolRows = async (party: Party) => (await testDb.db.select().from(eventPoolGames).where(eq(eventPoolGames.eventId, party.eventId))).map(row => row.gameId).sort()
  const read = (party: Party, cookie = party.hostCookie) => readEvent(rig, cookie, party.slug)
  const names = (view: EventView) => (view.pool ?? []).map(game => game.name)
  const set = (party: Party, gameId: string, cookie = party.hostCookie) => send('POST', `/api/e/${party.slug}/rounds`, cookie, { gameId })
  const roundRows = (party: Party) => testDb.db.select().from(rounds).where(eq(rounds.eventId, party.eventId))
  const activityRows = (party: Party) => testDb.db.select().from(activity).where(eq(activity.eventId, party.eventId))

  describe('off the wheel and the picker', () => {
    it('takes an Archived game out of the games left, the wheel, the pool warning and a Member\'s pool, and puts it back on restore without a write to the pool', async () => {
      const party = await running()
      const { halo, kart, dame } = party.games
      const before = await poolRows(party)

      await archive(party, kart.id)

      const asHost = await read(party)
      expect(asHost.setGame?.left.sort()).toEqual([halo.id, dame.id].sort())
      expect(asHost.setGame?.poolWarning).toEqual({ needed: 10, have: 2 })
      expect(asHost.wheel).toMatchObject({ count: 2 })
      expect(asHost.wheel?.slices?.map(slice => slice.id).sort()).toEqual([halo.id, dame.id].sort())
      // The Host's own pool keeps every pool game (the mark is #726's).
      expect(names(asHost)).toEqual(['Dame', 'Halo', 'Kart'])
      const asMember = await read(party, party.one)
      expect(names(asMember)).toEqual(['Dame', 'Halo'])
      expect(asMember.wheel).toMatchObject({ count: 2 })
      expect(asMember.wheel?.slices?.map(slice => slice.name).sort()).toEqual(['Dame', 'Halo'])
      expect(await poolRows(party)).toEqual(before)

      await restore(party, kart.id)

      const restored = await read(party)
      expect(restored.setGame?.left.sort()).toEqual([halo.id, kart.id, dame.id].sort())
      expect(restored.setGame?.poolWarning).toEqual({ needed: 10, have: 3 })
      expect(restored.wheel).toMatchObject({ count: 3 })
      expect(names(await read(party, party.one))).toEqual(['Dame', 'Halo', 'Kart'])
      expect(await poolRows(party)).toEqual(before)
    })

    it.each([0, 1, 2, 3])('follows %i archived games of three: the wheel counts the rest, and with none left a spin answers pool_empty', async (count) => {
      const party = await running()
      const ids = NEEDED_ALL.map(key => party.games[key].id)

      await archive(party, ...ids.slice(0, count))

      const asHost = await read(party)
      expect(asHost.wheel?.count).toBe(3 - count)
      expect(asHost.wheel?.slices).toHaveLength(3 - count)
      expect(asHost.setGame?.left).toHaveLength(3 - count)
      expect((await read(party, party.one)).wheel?.count).toBe(3 - count)
      expect(asHost.setGame?.spinRejection).toBe(count === 3 ? 'pool_empty' : null)
      const spin = await send('POST', `/api/e/${party.slug}/rounds/spin`, party.hostCookie)
      if (count === 3) expect(await errorOf(spin)).toEqual({ status: 409, code: 'pool_empty' })
      else expect(spin.status).toBe(200)
    })

    it('never draws an Archived game: with one left every spin draws it', async () => {
      const party = await running()
      await archive(party, party.games.halo.id, party.games.kart.id)

      const { drawId } = await hostSpins(rig, party)

      const [draw] = await testDb.db.select().from(draws).where(eq(draws.id, drawId))
      expect(draw!.gameId).toBe(party.games.dame.id)
      expect(draw!.sliceGameIds).toEqual([party.games.dame.id])
    })

    it('keeps the Hidden wheel hidden: a Member\'s slices stay null and its count drops by one', async () => {
      const party = await running({ hidden: true, poolPreview: false })

      await archive(party, party.games.kart.id)

      const asMember = await read(party, party.one)
      expect(asMember.wheel).toMatchObject({ count: 2, slices: null })
      expect(asMember.pool).toBeNull()
      expect((await read(party)).wheel).toMatchObject({ count: 2 })
    })
  })

  describe('„Nächstes Spiel setzen“', () => {
    it('refuses an Archived game as an absent one, writes no Round and no Activity entry, and takes it again after the restore', async () => {
      const party = await running()
      await archive(party, party.games.kart.id)
      const feedBefore = await activityRows(party)

      expect(await errorOf(await set(party, party.games.kart.id))).toEqual({ status: 400, code: 'unknown_game' })

      expect(await roundRows(party)).toEqual([])
      expect(await activityRows(party)).toEqual(feedBefore)
      expect(await testDb.db.select().from(draws).where(inArray(draws.gameId, [party.games.kart.id]))).toEqual([])

      await restore(party, party.games.kart.id)
      expect((await set(party, party.games.kart.id)).status).toBe(200)
      expect(await roundRows(party)).toHaveLength(1)
    })

    it('refuses an Archived library game that is in no pool the same way', async () => {
      const party = await running()
      await archive(party, party.games.schach.id)

      expect(await errorOf(await set(party, party.games.schach.id))).toEqual({ status: 400, code: 'unknown_game' })
      expect(await roundRows(party)).toEqual([])
    })

    it('keeps the Round of a game that was set first and archived after', async () => {
      const party = await running()
      const roundId = await hostSets(rig, party, party.games.kart.id)

      await archive(party, party.games.kart.id)

      const [round] = await roundRows(party)
      expect(round).toMatchObject({ id: roundId, gameId: party.games.kart.id })
      for (const cookie of [party.hostCookie, party.one]) expect((await read(party, cookie)).rounds).toMatchObject([{ id: roundId, game: { id: party.games.kart.id, name: 'Kart' } }])
    })
  })

  describe('a pool change', () => {
    const patch = (party: Party, body: unknown) => send('PATCH', `/api/e/${party.slug}/settings`, party.hostCookie, body)
    const gameCountOf = async (party: Party) => (await testDb.db.select({ gameCount: events.gameCount }).from(events).where(eq(events.id, party.eventId)))[0]!.gameCount

    it('drops an Archived game that the new list omits, and keeps its row when the list keeps it', async () => {
      const party = await running()
      const { halo, kart, dame } = party.games
      await archive(party, kart.id)

      // The Host's own list shows the Archived game, so the client sends it back: it stays in the pool.
      expect((await patch(party, { pool: [halo.id, kart.id, dame.id] })).status).toBe(200)
      expect(await poolRows(party)).toEqual([halo.id, kart.id, dame.id].sort())

      expect((await patch(party, { pool: [halo.id, dame.id] })).status).toBe(200)
      expect(await poolRows(party)).toEqual([halo.id, dame.id].sort())
    })

    it('refuses to add an Archived game as an absent one: no pool row and no setting is written', async () => {
      const party = await running()
      const { halo, kart, dame, schach } = party.games
      await archive(party, schach.id)
      const before = await poolRows(party)

      expect(await errorOf(await patch(party, { settings: { gameCount: 7 }, pool: [halo.id, kart.id, dame.id, schach.id] }))).toEqual({ status: 400, code: 'unknown_game' })

      expect(await poolRows(party)).toEqual(before)
      expect(await gameCountOf(party)).toBe(10)
      await restore(party, schach.id)
      expect((await patch(party, { settings: { gameCount: 7 }, pool: [halo.id, kart.id, dame.id, schach.id] })).status).toBe(200)
      expect(await poolRows(party)).toEqual([halo.id, kart.id, dame.id, schach.id].sort())
      expect(await gameCountOf(party)).toBe(7)
    })

    it('refuses to create an Event with an Archived game in its pool, and writes no Event', async () => {
      const party = await running()
      await archive(party, party.games.schach.id)
      const count = async () => (await testDb.db.select({ id: events.id }).from(events)).length
      const before = await count()

      const created = await send('POST', '/api/e', party.hostCookie, {
        name: 'Neuer Abend', dateMode: 'poll', sessions: 1, slots: ['2091-10-30T20:30'], settings: { format: 'teams', teamCount: 2, teamSize: 2, gameCount: 5, pointsTable: { preset: 'linear', values: [1, 0] }, selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null },
        pool: [party.games.halo.id, party.games.schach.id],
      })

      expect(await errorOf(created)).toEqual({ status: 400, code: 'unknown_game' })
      expect(await count()).toBe(before)
    })

    it('still takes Event notes for an Archived game', async () => {
      const party = await running()
      await archive(party, party.games.kart.id)

      const saved = await send('PUT', `/api/e/${party.slug}/games/${party.games.kart.id}/notes`, party.hostCookie, { notes: notesFromLines(['Hausregel Kart']) })

      expect(saved.status).toBe(200)
    })
  })

  // After an archive or a restore commits, the room of every live Event of the owner that holds the game hears the payload-free `event.changed` (ADR 0013).
  describe('the room', () => {
    /** Host H's game in the pool of E1 (live), E2 (finished), E3 (deleted) and not in E4 (live); E5 is live and belongs to Host H2, who holds his own copy of the game. */
    async function world() {
      const signedHost = await signInAs(rig, host)
      const signedOther = await signInAs(rig, otherHost)
      const [game] = await testDb.db.insert(games).values({ name: 'Geheimspiel Zebra', imageKey: 'zebra-key', createdBy: signedHost.id }).returning()
      const [copy] = await testDb.db.insert(games).values({ name: 'Geheimspiel Zebra', imageKey: 'zebra-key', createdBy: signedOther.id }).returning()
      const e1 = await hostCreatesEvent(rig, signedHost, { name: 'E1', pool: [game!.id] })
      const e2 = await hostCreatesEvent(rig, signedHost, { name: 'E2', pool: [game!.id] })
      const e3 = await hostCreatesEvent(rig, signedHost, { name: 'E3', pool: [game!.id] })
      const e4 = await hostCreatesEvent(rig, signedHost, { name: 'E4' })
      const e5 = await hostCreatesEvent(rig, signedOther, { name: 'E5', pool: [copy!.id] })
      await testDb.db.update(events).set({ phase: 'finished', finishedAt: new Date(T0) }).where(eq(events.id, e2.eventId))
      await testDb.db.update(events).set({ deletedAt: new Date(T0) }).where(eq(events.id, e3.eventId))
      notifier.clear()
      return { signedHost, signedOther, game: game!, copy: copy!, e1, e2, e3, e4, e5 }
    }

    type World = Awaited<ReturnType<typeof world>>
    const heard = (w: World) => Object.fromEntries(Object.entries({ e1: w.e1, e2: w.e2, e3: w.e3, e4: w.e4, e5: w.e5 }).map(([key, ev]) => [key, notifier.messages(ev.eventId)]))
    const silent = { e1: [], e2: [], e3: [], e4: [], e5: [] }
    const once = { ...silent, e1: [{ v: 1, type: 'event.changed', serverTime: new Date(T0).getTime() }] }

    it('tells exactly the live Events of the owner that hold the game, once, on an archive and on a restore', async () => {
      const w = await world()

      expect((await archived(w.game.id, true, w.signedHost.cookie)).status).toBe(200)
      expect(heard(w)).toEqual(once)

      notifier.clear()
      expect((await archived(w.game.id, false, w.signedHost.cookie)).status).toBe(200)
      expect(heard(w)).toEqual(once)
    })

    it('tells every live Event that holds the game, one message each', async () => {
      const w = await world()
      await testDb.db.insert(eventPoolGames).values({ eventId: w.e4.eventId, gameId: w.game.id })
      notifier.clear()

      await archived(w.game.id, true, w.signedHost.cookie)

      expect(heard(w)).toEqual({ ...once, e4: once.e1 })
    })

    it('tells nobody when nothing changed: a repeat, another User\'s request and a body without the flag', async () => {
      const w = await world()
      await archived(w.game.id, true, w.signedHost.cookie)
      notifier.clear()

      expect((await archived(w.game.id, true, w.signedHost.cookie)).status).toBe(200)
      expect((await archived(w.game.id, true, w.signedOther.cookie)).status).toBe(404)
      expect((await send('PUT', `/api/games/${w.game.id}/archived`, w.signedHost.cookie, {})).status).toBe(400)
      expect((await archived(w.copy.id, false, w.signedOther.cookie)).status).toBe(200)

      expect(heard(w)).toEqual(silent)
    })

    it('carries neither the game\'s name nor its id nor its image key', async () => {
      const w = await world()

      await archived(w.game.id, true, w.signedHost.cookie)
      await archived(w.game.id, false, w.signedHost.cookie)

      const all = JSON.stringify(heard(w))
      for (const trace of [w.game.name, w.game.id, w.game.imageKey!]) expect(all).not.toContain(trace)
    })

    it('publishes after the commit: the Event read made on receiving the message already shows the change', async () => {
      const party = await running()
      const messages = notifier.messages(party.eventId).length

      await archive(party, party.games.kart.id)

      expect(notifier.messages(party.eventId).slice(messages).map(message => message.type)).toEqual(['event.changed'])
      expect((await read(party)).wheel?.count).toBe(2)
    })
  })

  // The image follows the pool (#725): a Member with the Pool preview on cannot fetch the picture of a pool game that was archived, as the pool list no longer
  // names it; a game a Round has set stays visible, and the owner's own access is unaffected.
  describe('the image', () => {
    const image = (party: Party, key: string, cookie: string) => send('GET', `/api/images/${party.games[key as 'kart'].imageKey}`, cookie)

    it('stops serving a pool game\'s picture to a Member when it is archived and serves it again after the restore, the owner throughout', async () => {
      const party = await running()
      await store.put('kart-key', new Uint8Array([1, 2, 3]), 'image/webp')

      expect((await image(party, 'kart', party.one)).status).toBe(200)

      await archive(party, party.games.kart.id)
      const refused = await image(party, 'kart', party.one)
      expect([refused.status, refused.statusText]).toEqual([404, 'Not Found'])
      expect((await image(party, 'kart', party.hostCookie)).status).toBe(200)

      await restore(party, party.games.kart.id)
      expect((await image(party, 'kart', party.one)).status).toBe(200)
    })

    it('keeps serving the picture of an Archived game a Round has set', async () => {
      const party = await running()
      await store.put('kart-key', new Uint8Array([1, 2, 3]), 'image/webp')
      await hostSets(rig, party, party.games.kart.id)

      await archive(party, party.games.kart.id)

      expect((await image(party, 'kart', party.one)).status).toBe(200)
      expect((await image(party, 'kart', party.hostCookie)).status).toBe(200)
    })
  })

  describe('what keeps an Archived game', () => {
    it('keeps an open spin: the slice list and the drawn game of the Host and of a Member stay from the stop on, and the draw settles', async () => {
      const party = await running()
      const { roundId, drawId } = await hostSpins(rig, party)
      const [draw] = await testDb.db.select().from(draws).where(eq(draws.id, drawId))
      const everyone = NEEDED_ALL.map(key => party.games[key])

      await archive(party, ...everyone.map(game => game.id))
      await clockToStop(rig, drawId)

      const drawnName = everyone.find(game => game.id === draw!.gameId)!.name
      for (const cookie of [party.hostCookie, party.one]) {
        const view = await read(party, cookie)
        expect(view.wheel?.spin).toMatchObject({ drawId, slices: 3, labels: draw!.sliceGameIds!.map(id => everyone.find(game => game.id === id)!.name), game: { id: draw!.gameId, name: drawnName } })
        expect(view.rounds).toMatchObject([{ id: roundId, game: { id: draw!.gameId } }])
        // The wheel itself is empty meanwhile.
        expect(view.wheel?.count).toBe(0)
      }
      const [after] = await testDb.db.select().from(draws).where(eq(draws.id, drawId))
      expect(after).toMatchObject({ gameId: draw!.gameId, sliceGameIds: draw!.sliceGameIds, outcome: 'set' })
    })

    it('keeps a Round that waits for its Result: it is read, its Result is entered, and the Results and the feed name the game', async () => {
      const party = await running()
      const roundId = await hostSets(rig, party, party.games.halo.id)

      await archive(party, party.games.halo.id)

      expect((await read(party, party.two)).rounds).toMatchObject([{ id: roundId, game: { name: 'Halo' } }])
      await hostEntersResult(rig, party, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      const view = await read(party, party.one)
      expect(JSON.stringify(view.results)).toContain('Halo')
      expect((await readFeed(rig, party.one, party.slug)).map(entry => entry.type)).toContain('game_set')
      expect(await readEventText(rig, party.one, party.slug)).toContain('Halo')
      expect(JSON.stringify(await readFeed(rig, party.one, party.slug))).toContain('Halo')
    })

    it('keeps a vetoed draw that waits for a respin as it was', async () => {
      const party = await running({ vetoAllowance: 1 })
      const { drawId } = await hostSpins(rig, party)
      await clockToStop(rig, drawId)
      expect((await send('POST', `/api/e/${party.slug}/draws/${drawId}/veto`, party.one)).status).toBe(200)
      clock.set((await testDb.db.select().from(draws).where(eq(draws.id, drawId)))[0]!.vetoEndsAt!)
      const waiting = await read(party)
      expect(waiting.setGame?.respin).toBe(true)
      const drawBefore = (await testDb.db.select().from(draws).where(eq(draws.id, drawId)))[0]!
      const roundsBefore = await roundRows(party)

      await archive(party, party.games.halo.id, party.games.kart.id, party.games.dame.id)

      expect((await read(party)).setGame?.respin).toBe(true)
      expect((await testDb.db.select().from(draws).where(eq(draws.id, drawId)))[0]).toEqual(drawBefore)
      expect(await roundRows(party)).toEqual(roundsBefore)
    })

    it('keeps the Share image, the history and the feed names of a game played and archived', async () => {
      const party = await running({ gameCount: 1 })
      const roundId = await hostSets(rig, party, party.games.halo.id)
      await hostEntersResult(rig, party, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      await archive(party, party.games.halo.id)
      await hostFinishes(rig, party, { outcome: 'winner', winners: [1] })
      expect((await send('POST', `/api/e/${party.slug}/ceremony`, party.hostCookie)).status).toBe(200)

      const picture = await send('GET', `/api/e/${party.slug}/share-image?format=wide`, party.one)
      expect(picture.status).toBe(200)
      expect(picture.headers.get('content-type')).toBe('image/png')
      expect(JSON.stringify(await readFeed(rig, party.one, party.slug, 'limit=100'))).toContain('Halo')
      expect(JSON.stringify((await read(party, party.one)).results)).toContain('Halo')
    })
  })
})
