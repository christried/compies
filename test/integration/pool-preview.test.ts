import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventMembers, eventPoolGames, events } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { GamePrice, GameView } from '../../shared/game'
import { TEST_SETTINGS } from './fixtures'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { second } from './hidden-wheel-world'
import { hostPutsBack, hostSets, readEventText, readFeedText, signInAs, startRunningSession, type Signed, type Stage } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// The secrecy of the Pool preview (#225), the same promise as the Hidden wheel's (hidden-wheel.test.ts): with the
// Pool preview off a Player learns nothing about the pools, not through the Event read, not through the image route,
// not as a count. Under Host pick and under a visible wheel alike. The Host always sees both pools.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const player = { provider: 'discord', id: '2', name: 'Gast', email: 'player@example.com', image: undefined } as const

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
function webp(payload: string): Uint8Array {
  const bytes = new Uint8Array(40)
  bytes.set([...ascii('RIFF'), 32, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii(payload)])
  return bytes
}

const HOST_PICK = { ...TEST_SETTINGS, poolPreview: false } as const
const VISIBLE_WHEEL = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 3, poolPreview: false } as const

describe('Pool preview secrecy (#225)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  const store = memoryImageStore()
  const notifier = memoryRoomNotifier()
  // The stage is made when used: `beforeAll` assigns the app and the database.
  const stage = (): Stage => ({ request, db: testDb.db, notifier })
  let hostSigned: Signed
  let playerSigned: Signed
  let hostCookie: string
  let playerCookie: string

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { imageStore: store, roomNotifier: notifier })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1', admins: 'discord:9' })
    await resetDatabase(testDb.db)
    store.clear()
    notifier.clear()
    hostSigned = await signInAs(stage(), host)
    playerSigned = await signInAs(stage(), player)
    hostCookie = hostSigned.cookie
    playerCookie = playerSigned.cookie
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  interface PoolGame { id: string, name: string, videoId: string, imageUrl: string, imageKey: string, notes: string, tag: string, cents: number, price: GamePrice | null }

  async function newGame(name: string, videoId: string): Promise<PoolGame> {
    // Lower case, so the key and the label are one string (#335). The Price's cents are distinct per game (#338): the amount names its game in a read.
    const tag = `tag-${name.split(' ')[0]!.toLowerCase()}`
    const cents = 1000 + 111 * (name.charCodeAt(0) - 64)
    const created = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name, youtubeUrl: `https://youtu.be/${videoId}`, notes: `Hausregel zu ${name}`, tags: [tag], price: { cents, source: 'steam' } }),
    })
    expect(created.status).toBe(200)
    const { id, price } = await created.json() as GameView
    const uploaded = await request(`/api/games/${id}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'cookie': hostCookie },
      body: webp(name) as BodyInit,
    })
    expect(uploaded.status).toBe(200)
    const view = await uploaded.json() as GameView
    return { id, name, videoId, imageUrl: view.imageUrl!, imageKey: view.imageUrl!.slice('/api/images/'.length), notes: view.notes!, tag, cents, price }
  }

  /** A, B in the Game pool, C in the library only (#279: there is no Tiebreaker pool); the Player has joined. */
  async function setUp(settings: Record<string, unknown>) {
    const pool = [await newGame('Alpha Arena', 'aaaaaaaaaaa'), await newGame('Beta Bowling', 'bbbbbbbbbbb'), await newGame('Gamma Garten', 'ccccccccccc')]
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({
        name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings,
        pool: [pool[0]!.id, pool[1]!.id],
      }),
    })
    expect(response.status).toBe(200)
    const { slug, inviteUrl } = await response.json() as CreatedEvent
    const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
    expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: playerCookie } })).status).toBe(200)
    return { slug, pool }
  }

  const rawRead = (cookie: string, slug: string) => readEventText(stage(), cookie, slug)

  // Everything a pool game shows: the Event read of a viewer who may see the pools holds all of it, that of one who may not holds none of it (notes too, #223, #224).
  // The Price's amount is a trace too (#338): distinct per game, it names the game whose Price a read carries.
  const priceTrace = (game: PoolGame) => `"cents":${game.cents}`
  const traces = (game: PoolGame) => [game.name, game.id, game.imageKey, game.videoId, game.notes, priceTrace(game)]
  // What a Member who may see the pools gets of a game: its picture, name and Price; the notes are the Host's (#224, #338).
  const memberTraces = (game: PoolGame) => [game.name, game.id, game.imageKey, game.videoId, priceTrace(game)]
  // A Tag is in no Event read at all, not even the Host's (#335): the library carries it, nothing else does. The Host's read must hold every trace, so the Tag is not one.
  const playerTraces = (game: PoolGame) => [...traces(game), game.tag]

  function fetchImage(game: PoolGame, cookie: string) {
    return request(game.imageUrl, { headers: { cookie } })
  }

  function patch(slug: string, settings: Record<string, unknown>) {
    return request(`/api/e/${slug}/settings`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'cookie': hostCookie }, body: JSON.stringify({ settings }) })
  }

  describe.each([
    ['Host pick', HOST_PICK],
    ['a visible Lucky Wheel', VISIBLE_WHEEL],
  ])('under %s with the Pool preview off', (_mode, settings) => {
    it('gives a Player nothing about the pools: not a count, name, id, image key or video id anywhere in the raw response', async () => {
      const { slug, pool } = await setUp(settings)

      const raw = await rawRead(playerCookie, slug)

      expect((JSON.parse(raw) as EventView).pool).toBeNull()
      for (const trace of pool.flatMap(playerTraces)) expect(raw).not.toContain(trace)
      expect(raw).not.toMatch(/api\/images/)
    })

    it('gives a Player the same response however many games the pools hold', async () => {
      const { slug } = await setUp(settings)
      const before = await rawRead(playerCookie, slug)

      const delta = await newGame('Delta Dart', 'ddddddddddd')
      const [eventRow] = await testDb.db.select({ id: events.id }).from(events)
      await testDb.db.insert(eventPoolGames).values({ eventId: eventRow!.id, gameId: delta.id })

      // The control: the Host sees the new game, so the insert really changed the pools.
      expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
      expect(await rawRead(playerCookie, slug)).toBe(before)
    })

    it('refuses the Player the image of a pool game, in either pool, as a missing route', async () => {
      const { pool } = await setUp(settings)

      for (const game of pool) {
        const response = await fetchImage(game, playerCookie)
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
      }
    })

    it('gives the Host the Game pool in full, and the images', async () => {
      const { slug, pool } = await setUp(settings)

      const raw = await rawRead(hostCookie, slug)

      for (const trace of pool.slice(0, 2).flatMap(traces)) expect(raw).toContain(trace)
      expect((JSON.parse(raw) as EventView).pool).toMatchObject([{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }])
      for (const game of pool) {
        const response = await fetchImage(game, hostCookie)
        expect(response.status).toBe(200)
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp(game.name))
      }
    })

    it('shows the Player the games and serves the images from the moment the Host turns the Pool preview on, and hides them again when it is turned off', async () => {
      const { slug, pool } = await setUp(settings)

      expect((await patch(slug, { poolPreview: true })).status).toBe(200)
      const open = await rawRead(playerCookie, slug)
      expect((JSON.parse(open) as EventView).pool).toMatchObject([{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }])
      for (const trace of pool.slice(0, 2).flatMap(memberTraces)) expect(open).toContain(trace)
      for (const game of pool.slice(0, 2)) expect((await fetchImage(game, playerCookie)).status).toBe(200)

      expect((await patch(slug, { poolPreview: false })).status).toBe(200)
      const closed = await rawRead(playerCookie, slug)
      for (const trace of pool.flatMap(playerTraces)) expect(closed).not.toContain(trace)
      expect((JSON.parse(closed) as EventView).pool).toBeNull()
      for (const game of pool) expect((await fetchImage(game, playerCookie)).status).toBe(404)
    })
  })

  it('gives a Player the games of a Host pick Event created with the Pool preview on (the default)', async () => {
    const { slug, pool } = await setUp(TEST_SETTINGS)

    const raw = await rawRead(playerCookie, slug)

    expect((JSON.parse(raw) as EventView).pool).toMatchObject([{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }])
    for (const trace of pool.slice(0, 2).flatMap(memberTraces)) expect(raw).toContain(trace)
    for (const game of pool.slice(0, 2)) expect((await fetchImage(game, playerCookie)).status).toBe(200)
  })

  it('gives a Player who may see the pools only the id, name, picture, video id and Price of each game, never its notes, Tags, players, Suitabilities or clip', async () => {
    const { slug, pool } = await setUp(TEST_SETTINGS)

    const raw = await rawRead(playerCookie, slug)
    const { pool: shown } = JSON.parse(raw) as EventView

    // The face's keys: the Price is what a Member's pool game adds to the picture and the name (#338).
    for (const game of shown!) {
      expect(Object.keys(game).sort()).toEqual(['id', 'imageUrl', 'name', 'price', 'youtubeId'])
    }
    expect(shown![0]!.price).toEqual(pool[0]!.price)
    expect(shown![1]!.price).toEqual(pool[1]!.price)
    for (const game of pool) expect(raw).not.toContain(game.notes)
    for (const game of pool) expect(raw).not.toContain(game.tag)
    // The control: the Host's game carries every field, the notes and the Price too.
    const hostPool = (JSON.parse(await rawRead(hostCookie, slug)) as EventView).pool!
    expect(Object.keys(hostPool[0]!).sort()).toEqual(['clipLength', 'clipStart', 'id', 'imageUrl', 'name', 'notes', 'playersMax', 'playersMin', 'price', 'suitabilities', 'youtubeId'])
    expect(hostPool[0]).toMatchObject({ notes: pool[0]!.notes, price: pool[0]!.price })
  })

  it.each([
    ['the Pool preview on', TEST_SETTINGS, true],
    ['the Pool preview off', HOST_PICK, false],
    ['a visible Lucky Wheel', VISIBLE_WHEEL, false],
  ])('carries no Tag in the Host\'s or a Player\'s Event read, and the Price only where the pool shows it, with %s (#335, #338)', async (_rule, settings, playerSeesPool) => {
    const { slug, pool } = await setUp(settings)
    const [alpha, beta, gamma] = pool as [PoolGame, PoolGame, PoolGame]

    // The Host sees the pool in full, Gamma (in the library only) not at all.
    const hostRaw = await rawRead(hostCookie, slug)
    expect(hostRaw).not.toContain('"tags"')
    expect(hostRaw).toContain('"price"')
    expect(hostRaw).toContain('"checkedAt"')
    expect(hostRaw).toContain(priceTrace(alpha))
    expect(hostRaw).toContain(priceTrace(beta))
    expect(hostRaw).not.toContain(priceTrace(gamma))
    for (const game of pool) expect(hostRaw).not.toContain(game.tag)

    const playerRaw = await rawRead(playerCookie, slug)
    expect(playerRaw).not.toContain('"tags"')
    for (const game of pool) expect(playerRaw).not.toContain(game.tag)
    if (playerSeesPool) {
      expect(playerRaw).toContain('"price"')
      expect(playerRaw).toContain('"checkedAt"')
      expect(playerRaw).toContain(priceTrace(alpha))
      expect(playerRaw).toContain(priceTrace(beta))
    }
    else {
      expect(playerRaw).not.toContain('"price"')
      expect(playerRaw).not.toContain('"checkedAt"')
      for (const game of pool) expect(playerRaw).not.toContain(priceTrace(game))
    }
    expect(playerRaw).not.toContain(priceTrace(gamma))
    // The control: the library does carry them.
    const library = await request('/api/games', { headers: { cookie: hostCookie } })
    expect(await library.text()).toContain(pool[0]!.tag)
  })

  // A game the Host sets is every Member's from the moment it is set, with the Pool preview off too, and nothing else is (#228).
  // A visible Lucky Wheel in a running Session shows the games left in the Game pool on the wheel, also with the Pool preview off
  // (#229): their id and name are the wheel's, but never a picture, a video id or notes.
  describe.each([
    ['Host pick', HOST_PICK, false],
    ['a visible Lucky Wheel', VISIBLE_WHEEL, true],
  ])('a game the Host sets under %s with the Pool preview off', (_mode, settings, onWheel) => {
    /** The games of the Game pool, which a visible wheel shows by name. */
    const wheelGames = new Set<string>()
    /** What must not reach the Player: everything of a game, but a name and an id the wheel shows. */
    const hidden = (game: PoolGame) => (wheelGames.has(game.id) ? [game.imageKey, game.videoId, game.notes, game.tag, priceTrace(game)] : playerTraces(game))
    /** A Running Session: Player and Second in a team each, Alpha and Beta in the Game pool, Gamma and Epsilon only in the library. */
    async function runningEvent() {
      const { slug, pool } = await setUp(settings)
      const library = await newGame('Epsilon Eck', 'eeeeeeeeeee')
      const secondSigned = await signInAs(stage(), second)
      const [eventRow] = await testDb.db.select().from(events)
      await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: secondSigned.id })
      await startRunningSession(stage(), { slug, host: hostSigned }, [playerSigned, secondSigned])
      notifier.clear()
      wheelGames.clear()
      if (onWheel) for (const game of [pool[0]!, pool[1]!]) wheelGames.add(game.id)
      return { slug, eventId: eventRow!.id, alpha: pool[0]!, beta: pool[1]!, gamma: pool[2]!, library }
    }

    async function whatThePlayerGets(slug: string, eventId: string) {
      const feed = await readFeedText(stage(), playerCookie, slug, 'limit=100')
      return { event: await rawRead(playerCookie, slug), feed, room: JSON.stringify(notifier.messages(eventId)) }
    }

    function expectNone(what: Record<string, string>, games: PoolGame[], include: (game: PoolGame) => string[] = hidden) {
      for (const [place, raw] of Object.entries(what)) {
        for (const game of games) for (const trace of include(game)) expect(raw, `${place} leaks ${trace}`).not.toContain(trace)
      }
    }

    it('shows a Player no game of the pools before a set, and no image', async () => {
      const { slug, eventId, alpha, beta, gamma, library } = await runningEvent()

      expectNone(await whatThePlayerGets(slug, eventId), [alpha, beta, gamma, library])
      // The pool warning (#234) is the Host's: the Host's read carries it (2 games in the pool, at least 10 needed), the Player's does not.
      expect((JSON.parse(await rawRead(hostCookie, slug)) as EventView).setGame?.poolWarning).not.toBeNull()
      expect(JSON.parse(await rawRead(playerCookie, slug))).toMatchObject({ setGame: null })
      expect(await rawRead(playerCookie, slug)).not.toContain('poolWarning')
      for (const game of [alpha, beta, gamma, library]) expect((await fetchImage(game, playerCookie)).status).toBe(404)
    })

    it('shows a Player exactly the game that is set, never its notes, and no other game of the pools', async () => {
      const { slug, eventId, alpha, beta, gamma, library } = await runningEvent()

      await hostSets(stage(), { slug, host: hostSigned }, alpha.id)

      const got = await whatThePlayerGets(slug, eventId)
      expect(JSON.parse(got.event)).toMatchObject({ pool: null, rounds: [{ game: { id: alpha.id, name: 'Alpha Arena', price: alpha.price } }] })
      expect(got.feed).toContain('Alpha Arena')
      expect(got.feed).not.toContain('"price"')
      expect(got.room).not.toContain('"price"')
      expect(got.room).not.toContain('"checkedAt"')
      expectNone(got, [alpha], game => [game.notes, game.tag])
      expectNone(got, [beta, gamma, library])
      expect((await fetchImage(alpha, playerCookie)).status).toBe(200)
      for (const game of [beta, gamma, library]) expect((await fetchImage(game, playerCookie)).status).toBe(404)
    })

    it('gives a Player the set game with its Price and no notes or Tags, under the same keys as its name', async () => {
      const { slug, alpha } = await runningEvent()
      await hostSets(stage(), { slug, host: hostSigned }, alpha.id)

      const [round] = (JSON.parse(await rawRead(playerCookie, slug)) as EventView).rounds
      expect(Object.keys(round!.game).sort()).toEqual(['clipLength', 'clipStart', 'id', 'imageUrl', 'name', 'playersMax', 'playersMin', 'price', 'suitabilities', 'youtubeId'])
      expect(round!.game.price).toEqual(alpha.price)
    })

    it('shows a Player a library game that is set, and none of the pools\' games', async () => {
      const { slug, eventId, alpha, beta, gamma, library } = await runningEvent()

      await hostSets(stage(), { slug, host: hostSigned }, library.id)

      const got = await whatThePlayerGets(slug, eventId)
      expect((JSON.parse(got.event) as EventView).rounds).toMatchObject([{ game: { name: 'Epsilon Eck' } }])
      expectNone(got, [alpha, beta, gamma])
      expect((await fetchImage(library, playerCookie)).status).toBe(200)
      for (const game of [alpha, beta, gamma]) expect((await fetchImage(game, playerCookie)).status).toBe(404)
    })

    it('names the set game in the Result a Player reads, and no other game of the pools (#273)', async () => {
      const { slug, eventId, alpha, beta, gamma, library } = await runningEvent()
      const roundId = await hostSets(stage(), { slug, host: hostSigned }, alpha.id)

      const entered = await request(`/api/e/${slug}/rounds/${roundId}/result`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] }),
      })
      expect(entered.status).toBe(200)

      const got = await whatThePlayerGets(slug, eventId)
      expect(got.feed).toContain('Alpha Arena')
      expect(got.feed).not.toContain('"price"')
      expect(got.room).not.toContain('"price"')
      expectNone(got, [alpha], game => [game.notes, game.tag])
      expectNone(got, [beta, gamma, library])
    })

    it('names the set game in the Results a Player reads (#274), and no other game of the pools; the room sends nothing new', async () => {
      const { slug, eventId, alpha, beta, gamma, library } = await runningEvent()
      const roundId = await hostSets(stage(), { slug, host: hostSigned }, alpha.id)

      const entered = await request(`/api/e/${slug}/rounds/${roundId}/result`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] }),
      })
      expect(entered.status).toBe(200)

      const got = await whatThePlayerGets(slug, eventId)
      const view = JSON.parse(got.event) as EventView
      expect(view.results).toMatchObject([{ number: 1, game: { id: alpha.id, name: 'Alpha Arena', price: alpha.price } }])
      expect(got.feed).not.toContain('"price"')
      expect(got.room).not.toContain('"price"')
      expect(view.standings?.map(row => row.team)).toEqual([1, 2])
      const results = JSON.stringify({ results: view.results, standings: view.standings, end: view.end })
      expectNone({ results }, [alpha], game => [game.notes, game.tag])
      expectNone({ results }, [beta, gamma, library])
      // Nothing new goes to the room: the Result travels as the event.changed and the feed entry it already sent.
      expect(new Set(notifier.messages(eventId).map(message => message.type))).toEqual(new Set(['event.changed', 'activity.added']))
    })

    it('names only the set game in a Correction a Player reads, and the room carries no other pool game (#275)', async () => {
      const { slug, eventId, alpha, beta, gamma, library } = await runningEvent()
      const roundId = await hostSets(stage(), { slug, host: hostSigned }, alpha.id)
      const put = (places: unknown) => request(`/api/e/${slug}/rounds/${roundId}/result`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ places }),
      })
      expect((await put([{ team: 1, place: 1 }, { team: 2, place: 2 }])).status).toBe(200)
      expect((await put([{ team: 1, place: 2 }, { team: 2, place: 1 }])).status).toBe(200)

      const got = await whatThePlayerGets(slug, eventId)
      const view = JSON.parse(got.event) as EventView
      expect(view.results).toMatchObject([{ number: 1, corrected: true, game: { id: alpha.id, name: 'Alpha Arena', price: alpha.price } }])
      expect((JSON.parse(got.feed) as { entries: { type: string }[] }).entries.map(entry => entry.type)).toContain('result_corrected')
      expect(got.feed).toContain('Alpha Arena')
      expect(got.feed).not.toContain('"price"')
      expect(got.room).not.toContain('"price"')
      expectNone(got, [alpha], game => [game.notes, game.tag])
      expectNone(got, [beta, gamma, library])
    })

    it('carries no Tag in the Host\'s or a Player\'s read of a set game and of its Result, and the Price only of the set game for a Player (#335, #338)', async () => {
      const { slug, alpha, beta, gamma, library } = await runningEvent()
      const roundId = await hostSets(stage(), { slug, host: hostSigned }, alpha.id)
      // The Host sees the pool (Alpha, Beta) and the set game; the Player sees the set game only.
      const reads = async () => [await rawRead(hostCookie, slug), await rawRead(playerCookie, slug)]
      const expectPrices = (hostRaw: string, playerRaw: string) => {
        expect(hostRaw).toContain('"price"')
        expect(hostRaw).toContain('"checkedAt"')
        expect(hostRaw).toContain(priceTrace(alpha))
        expect(hostRaw).toContain(priceTrace(beta))
        expect(hostRaw).not.toContain(priceTrace(gamma))
        expect(hostRaw).not.toContain(priceTrace(library))
        expect(playerRaw).toContain('"price"')
        expect(playerRaw).toContain('"checkedAt"')
        expect(playerRaw).toContain(priceTrace(alpha))
        for (const game of [beta, gamma, library]) expect(playerRaw).not.toContain(priceTrace(game))
      }

      const [hostBefore, playerBefore] = await reads()
      expect(playerBefore).toContain('Alpha Arena')
      for (const raw of [hostBefore!, playerBefore!]) {
        expect(raw).not.toContain('"tags"')
        for (const game of [alpha, beta, gamma, library]) expect(raw).not.toContain(game.tag)
      }
      expectPrices(hostBefore!, playerBefore!)

      const entered = await request(`/api/e/${slug}/rounds/${roundId}/result`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] }),
      })
      expect(entered.status).toBe(200)
      const [hostAfter, playerAfter] = await reads()
      expect((JSON.parse(hostAfter!) as EventView).results).toMatchObject([{ game: { price: alpha.price } }])
      expect((JSON.parse(playerAfter!) as EventView).results).toMatchObject([{ game: { price: alpha.price } }])
      for (const raw of [hostAfter!, playerAfter!]) {
        expect((JSON.parse(raw) as EventView).results).toHaveLength(1)
        expect(raw).not.toContain('"tags"')
        for (const game of [alpha, beta, gamma, library]) expect(raw).not.toContain(game.tag)
      }
      expectPrices(hostAfter!, playerAfter!)
    })

    it('reveals nothing more when the Round is put back', async () => {
      const { slug, eventId, alpha, beta, gamma, library } = await runningEvent()
      const roundId = await hostSets(stage(), { slug, host: hostSigned }, alpha.id)

      await hostPutsBack(stage(), { slug, host: hostSigned }, roundId)

      const got = await whatThePlayerGets(slug, eventId)
      expect(JSON.parse(got.event)).toMatchObject({ pool: null, rounds: [] })
      expect(got.event).not.toContain('"price"')
      expect(got.feed).not.toContain('"price"')
      expect(got.room).not.toContain('"price"')
      expectNone(got, [beta, gamma, library])
    })
  })
})
