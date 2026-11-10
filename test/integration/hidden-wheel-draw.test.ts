import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draws, eventPoolGames, users, vetoes } from '../../server/db/schema'
import type { Db } from '../../server/utils/db'
import type { ActivityPage } from '../../shared/activity'
import type { EventView } from '../../shared/event'
import de from '../../i18n/locales/de.json'
import { WINDOW_MS } from '../draw-offsets'
import { mountedRoutes } from './app'
import { bodiesOf, EXPECTED_STATUS, expectStatuses, getRoutes, HOST, hiddenWheelWorld, NOT_SWEPT, OTHER_PARTY, OUTSIDER, PLAYER, vetoRead, type SweptRoute } from './hidden-wheel-world'
import { clockToEnd, clockToStop, hostPutsBack, hostSets, type Signed } from './scenario'
import { signIn } from './sign-in'

// The platform's random source with an override the slice-order test sets (F2): otherwise it is the real one, so every other test draws as production does.
const source = vi.hoisted(() => ({ override: null as ((n: number) => number) | null }))
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  const randomInt = ((...args: unknown[]) => (source.override && args.length === 1 ? source.override(args[0] as number) : (real.randomInt as (...a: unknown[]) => unknown)(...args))) as typeof real.randomInt
  return { ...real, default: { ...real, randomInt }, randomInt }
})

// What a Player learns from a game the Host sets, from a spin and from a Veto under a Hidden wheel (#228, #229, #231), and the
// sweep of every GET route over the same states (#418). Split out of hidden-wheel.test.ts in #418.

describe('Hidden wheel secrecy (#148)', () => {
  const world = hiddenWheelWorld()
  const { request, notifier, clock, rawRead, playerTraces, priceTrace, newGame, runningEvent, imageStatus, whatThePlayerGets, expectNone, NO_WINDOW, host, player, second, stranger, sweepGets, stage } = world
  let db: Db
  let hostSigned: Signed
  let hostCookie: string
  let playerCookie: string

  beforeEach(() => {
    db = world.db
    hostSigned = world.hostSigned
    hostCookie = world.hostCookie
    playerCookie = world.playerCookie
  })

  afterEach(() => {
    source.override = null
  })

  // A game the Host sets is every Member's from the moment it is set, and nothing else becomes known with it (#228).
  describe('a game the Host sets (#228)', () => {
    it('shows a Player no game of the pools before a set: nothing in the Event read, the feed or the room, and no image', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      expectNone(await whatThePlayerGets(slug, eventId), [a, b, c, e])
      expect((JSON.parse(await rawRead(playerCookie, slug)) as EventView)).toMatchObject({ pool: null, rounds: [], setGame: null })
      // The pool warning (#234) is the Host's: the Host's read carries it here (2 games in the pool, 16 needed), the Player's and the room's do not.
      expect((JSON.parse(await rawRead(hostCookie, slug)) as EventView).setGame?.poolWarning).toEqual({ needed: 16, have: 2 })
      expect(await rawRead(playerCookie, slug)).not.toContain('poolWarning')
      expect(JSON.stringify(notifier.messages(eventId))).not.toContain('poolWarning')
      for (const secret of [a, b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('shows a Player exactly the game that is set, never its notes, and nothing else of the pools', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      await hostSets(stage(), { slug, host: hostSigned }, a.id)

      const got = await whatThePlayerGets(slug, eventId)
      expect(got.event).toContain('Alpha Arena')
      expect(got.event).toContain(a.imageKey)
      expect((JSON.parse(got.event) as EventView)).toMatchObject({ pool: null, rounds: [{ game: { id: a.id, name: 'Alpha Arena', youtubeId: 'aaaaaaaaaaa' } }] })
      expect(got.feed).toContain('Alpha Arena')
      expect(got.feed).not.toContain('"price"')
      expect(got.room).not.toContain('"price"')
      expectNone(got, [a], secret => [secret.notes, secret.tag])
      expectNone(got, [b, c, e])
      expect(await imageStatus(a)).toBe(200)
      for (const secret of [b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('shows a Player a game from the library when the Host sets it, and none of the pool\'s games', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      await hostSets(stage(), { slug, host: hostSigned }, e.id)

      const got = await whatThePlayerGets(slug, eventId)
      expect((JSON.parse(got.event) as EventView).rounds).toMatchObject([{ game: { id: e.id, name: 'Epsilon Eck' } }])
      expectNone(got, [a, b, c])
      expectNone(got, [e], secret => [secret.notes, secret.tag])
      expect(await imageStatus(e)).toBe(200)
      for (const secret of [a, b, c]) expect(await imageStatus(secret)).toBe(404)
    })

    it('carries no Tag in the Host\'s or a Player\'s read of a set game and of its Result, and the Price only of the set game for a Player (#335, #338)', async () => {
      const { slug, a, b, c, e } = await runningEvent()
      const roundId = await hostSets(stage(), { slug, host: hostSigned }, a.id)
      // The Host sees the pool (Alpha, Beta) and the set game; the Player sees the set game only.
      const reads = async () => [await rawRead(hostCookie, slug), await rawRead(playerCookie, slug)]
      const expectPrices = (hostRaw: string, playerRaw: string) => {
        expect(hostRaw).toContain('"price"')
        expect(hostRaw).toContain('"checkedAt"')
        expect(hostRaw).toContain(priceTrace(a))
        expect(hostRaw).toContain(priceTrace(b))
        expect(hostRaw).not.toContain(priceTrace(c))
        expect(hostRaw).not.toContain(priceTrace(e))
        expect(playerRaw).toContain('"price"')
        expect(playerRaw).toContain('"checkedAt"')
        expect(playerRaw).toContain(priceTrace(a))
        for (const secret of [b, c, e]) expect(playerRaw).not.toContain(priceTrace(secret))
      }

      const [hostBefore, playerBefore] = await reads()
      expect(playerBefore).toContain('Alpha Arena')
      for (const raw of [hostBefore!, playerBefore!]) {
        expect(raw).not.toContain('"tags"')
        for (const secret of [a, b, c, e]) expect(raw).not.toContain(secret.tag)
      }
      expectPrices(hostBefore!, playerBefore!)

      const entered = await request(`/api/e/${slug}/rounds/${roundId}/result`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] }),
      })
      expect(entered.status).toBe(200)
      const [hostAfter, playerAfter] = await reads()
      expect((JSON.parse(hostAfter!) as EventView).results).toMatchObject([{ game: { price: a.price } }])
      expect((JSON.parse(playerAfter!) as EventView).results).toMatchObject([{ game: { price: a.price } }])
      for (const raw of [hostAfter!, playerAfter!]) {
        expect((JSON.parse(raw) as EventView).results).toHaveLength(1)
        expect(raw).not.toContain('"tags"')
        for (const secret of [a, b, c, e]) expect(raw).not.toContain(secret.tag)
      }
      expectPrices(hostAfter!, playerAfter!)
    })

    it('gives the Host the notes of the set game on its Round, and every game of the pools', async () => {
      const { slug, a } = await runningEvent()
      await hostSets(stage(), { slug, host: hostSigned }, a.id)

      const view = JSON.parse(await rawRead(hostCookie, slug)) as EventView

      expect(view.rounds).toMatchObject([{ game: { name: 'Alpha Arena' }, notes: a.notes }])
      expect(view.pool?.map(game => game.name)).toEqual(['Alpha Arena', 'Beta Bowling'])
    })

    it('reveals nothing more when the Host puts the Round back: the pools stay hidden, the games not set stay unknown', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()
      const roundId = await hostSets(stage(), { slug, host: hostSigned }, a.id)

      await hostPutsBack(stage(), { slug, host: hostSigned }, roundId)

      const got = await whatThePlayerGets(slug, eventId)
      expect(JSON.parse(got.event)).toMatchObject({ pool: null, rounds: [] })
      expectNone(got, [b, c, e])
      expectNone(got, [a], secret => [secret.notes, secret.tag])
      for (const secret of [b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('keeps the Player\'s read the same however many games the pools hold after a set, but for the wheel\'s own count', async () => {
      const { slug, eventId, a } = await runningEvent()
      await hostSets(stage(), { slug, host: hostSigned }, a.id)
      const before = JSON.parse(await rawRead(playerCookie, slug)) as EventView

      const delta = await newGame('Delta Dart', 'ddddddddddd')
      await db.insert(eventPoolGames).values({ eventId, gameId: delta.id })

      expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
      const after = JSON.parse(await rawRead(playerCookie, slug)) as EventView
      // The count is the wheel's: the Player learns how many games there are from the wheel and from nowhere else (spec story 13).
      expect(before.wheel).toEqual({ count: 1, slices: null, spin: null, vetoes: expect.anything() })
      expect(after.wheel).toEqual({ count: 2, slices: null, spin: null, vetoes: expect.anything() })
      expect({ ...after, wheel: null }).toEqual({ ...before, wheel: null })
    })
  })

  // A spin under a Hidden wheel reveals the drawn game at the stop and nothing else (#229, spec #218 § Hidden wheel on the wire).
  describe('a spin (#229)', () => {
    const spin = (slug: string, cookie = hostCookie) => request(`/api/e/${slug}/rounds/spin`, { method: 'POST', headers: { cookie } })

    /** A spin of a Running Session under a Hidden wheel, and the games on the wheel in the order of the draw. */
    async function spun() {
      const running = await runningEvent(NO_WINDOW)
      const response = await spin(running.slug)
      expect(response.status).toBe(200)
      const [row] = await db.select().from(draws)
      const drawn = [running.a, running.b].find(secret => secret.id === row!.gameId)!
      const undrawn = [running.a, running.b].find(secret => secret.id !== row!.gameId)!
      return { ...running, row: row!, drawn, undrawn, stopAt: row!.stopAt.getTime() }
    }

    const PLACEHOLDERS: readonly string[] = [...de.wheel.placeholders, de.wheel.placeholderQ]

    it('tells a Player before the stop no game: not in the Event read, the room message or the feed, and no picture', async () => {
      const { slug, eventId, a, b, c, e } = await spun()

      const got = await whatThePlayerGets(slug, eventId)

      expectNone(got, [a, b, c, e])
      for (const secret of [a, b, c, e]) expect(await imageStatus(secret)).toBe(404)
      expect((JSON.parse(got.feed) as ActivityPage).entries.map(entry => entry.type)).not.toContain('game_drawn')
    })

    it('gives the Player the wheel as placeholders: the count, shuffled names, and no game', async () => {
      const { slug, row } = await spun()

      const view = JSON.parse(await rawRead(playerCookie, slug)) as EventView

      expect(view.wheel).toEqual({
        count: 1,
        slices: null,
        spin: {
          roundId: row.roundId, drawId: row.id, spinStartAt: row.spinStartAt!.toISOString(), stopAt: row.stopAt.toISOString(), slices: 2, resultIndex: row.resultIndex, resultOffset: row.resultOffset, labels: row.sliceLabels, game: null, current: true,
        },
        vetoes: vetoRead({ left: [0, 0], own: { team: 1, cast: false, rejection: 'no_veto_window' }, draw: null }),
      })
      expect(row.sliceLabels).toHaveLength(2)
      expect(new Set(row.sliceLabels).size).toBe(2)
      for (const label of row.sliceLabels!) expect(PLACEHOLDERS).toContain(label)
    })

    it('tells the room only that the Event changed on a spin, and nothing of the wheel', async () => {
      const { eventId } = await spun()

      expect(notifier.messages(eventId).map(message => message.type)).toEqual(['event.changed'])
    })

    it('knows the drawn game on every surface from the same instant and not a millisecond earlier', async () => {
      const { slug, eventId, drawn, undrawn, c, e, row, stopAt } = await spun()

      clock.set(new Date(stopAt - 1))
      const before = await whatThePlayerGets(slug, eventId)
      expectNone(before, [drawn, undrawn, c, e])
      expect((JSON.parse(before.event) as EventView).clip).toBeNull()
      expect((JSON.parse(before.event) as EventView).wheel?.spin?.game).toBeNull()
      // Before the stop no Price reaches the Player: not in the Event read, the feed or the room (#338).
      for (const place of [before.event, before.feed, before.room]) expect(place).not.toContain('"price"')
      // The Host knows the drawn game's Price before the stop.
      expect((JSON.parse(await rawRead(hostCookie, slug)) as EventView).wheel?.spin?.game?.price).toEqual(drawn.price)
      expect(await imageStatus(drawn)).toBe(404)

      clock.set(new Date(stopAt))
      const at = await whatThePlayerGets(slug, eventId)
      const view = JSON.parse(at.event) as EventView
      expect(view.wheel?.spin?.game).toMatchObject({ id: drawn.id })
      expect(view.clip).toMatchObject({ drawId: row.id, game: { id: drawn.id } })
      expect(view.rounds).toMatchObject([{ game: { id: drawn.id } }])
      // From the stop on the drawn game's Price is on every surface that names it, and only its (#338).
      expect(view.wheel?.spin?.game?.price).toEqual(drawn.price)
      expect(view.clip?.game.price).toEqual(drawn.price)
      expect(view.rounds[0]!.game.price).toEqual(drawn.price)
      expect((JSON.parse(at.feed) as ActivityPage).entries.filter(entry => entry.type === 'game_drawn')).toMatchObject([{ games: { [drawn.id]: drawn.name } }])
      expect(at.feed).not.toContain('"price"')
      expect(at.room).not.toContain('"price"')
      expectNone(at, [undrawn, c, e])
      expect(await imageStatus(drawn)).toBe(200)
    })

    it('shows a Player the drawn game from the stop on, and the feed entry with its name, but no undrawn game', async () => {
      const { slug, eventId, drawn, undrawn, c, e, row, stopAt } = await spun()
      clock.set(new Date(stopAt))

      const got = await whatThePlayerGets(slug, eventId)

      const view = JSON.parse(got.event) as EventView
      expect(view.wheel?.spin?.game).toMatchObject({ id: drawn.id, name: drawn.name })
      expect(view.wheel?.spin?.labels?.[row.resultIndex!]).toBe(drawn.name)
      expect(view.rounds).toMatchObject([{ game: { id: drawn.id, name: drawn.name } }])
      expect(got.feed).toContain(drawn.name)
      expect((JSON.parse(got.feed) as ActivityPage).entries.filter(entry => entry.type === 'game_drawn')).toMatchObject([{ games: { [drawn.id]: drawn.name } }])
      expectNone(got, [undrawn, c, e])
      expectNone(got, [drawn], secret => [secret.notes, secret.tag])
      expect(await imageStatus(drawn)).toBe(200)
      for (const secret of [undrawn, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('keeps the undrawn game off the wheel for a Player after the removal too: the wheel has the count and nothing more', async () => {
      const { slug, undrawn, stopAt } = await spun()
      clock.set(new Date(stopAt + WINDOW_MS))

      const raw = await rawRead(playerCookie, slug)

      expect((JSON.parse(raw) as EventView).wheel).toMatchObject({ count: 1, slices: null })
      for (const trace of playerTraces(undrawn)) expect(raw).not.toContain(trace)
    })

    it('gives the Host the real names on the wheel throughout: before and after the stop', async () => {
      const { slug, a, b, row, stopAt } = await spun()

      const before = JSON.parse(await rawRead(hostCookie, slug)) as EventView
      expect(before.wheel?.spin?.labels).toEqual(row.sliceGameIds!.map(id => [a, b].find(secret => secret.id === id)!.name))
      expect(before.wheel?.spin?.game).toMatchObject({ id: row.gameId })
      expect(before.wheel?.slices).toHaveLength(1)

      clock.set(new Date(stopAt))
      const after = JSON.parse(await rawRead(hostCookie, slug)) as EventView
      expect(after.wheel?.spin?.labels).toEqual(before.wheel?.spin?.labels)
    })

    it('lays a Hidden wheel out in an order of its own, not that of the pool, and the drawn game is the slice at the result index (F2)', async () => {
      // Every draw of the source answers 0: result 0, and Fisher-Yates then turns the games left one place, whatever the pool's order.
      source.override = () => 0
      const running = await runningEvent(NO_WINDOW, 4)
      const before = JSON.parse(await rawRead(hostCookie, running.slug)) as EventView
      const poolOrder = before.wheel!.slices!.map(slice => slice.id)
      expect(poolOrder).toHaveLength(6)

      expect((await spin(running.slug)).status).toBe(200)

      const [row] = await db.select().from(draws)
      expect(row!.sliceGameIds).not.toEqual(poolOrder)
      expect([...row!.sliceGameIds!].sort()).toEqual([...poolOrder].sort())
      expect(row!.gameId).toBe(row!.sliceGameIds![row!.resultIndex!])
      // The Host's names follow the spin's own order, and the Player's placeholders have as many labels.
      const hostView = JSON.parse(await rawRead(hostCookie, running.slug)) as EventView
      expect(hostView.wheel!.spin!.labels).toEqual(row!.sliceGameIds!.map(id => before.wheel!.slices!.find(slice => slice.id === id)!.name))
      const playerView = JSON.parse(await rawRead(playerCookie, running.slug)) as EventView
      expect(playerView.wheel!.spin!.labels).toHaveLength(6)
    })

    it('hides the drawn game up to the last millisecond before the stop', async () => {
      const { slug, eventId, a, b, stopAt } = await spun()
      clock.set(new Date(stopAt - 1))

      expectNone(await whatThePlayerGets(slug, eventId), [a, b])
    })
  })

  // A Veto is sealed until the end of its window (#231, spec #218 § Vetoes): no other Party learns that one was cast, nor which.
  describe('a Veto (#231)', () => {
    const idOf = async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0]!.id

    /** A Running Session with a Veto allowance of 3; the wheel stopped, and Player 1 (team 1) cast the Veto. The room's record starts at the cast. */
    async function playerCasts() {
      const running = await runningEvent()
      const spun = await request(`/api/e/${running.slug}/rounds/spin`, { method: 'POST', headers: { cookie: hostCookie } })
      expect(spun.status).toBe(200)
      const { drawId } = await spun.json() as { drawId: string }
      const [row] = await db.select().from(draws)
      clock.set(row!.stopAt)
      notifier.clear()
      const cast = await request(`/api/e/${running.slug}/draws/${drawId}/veto`, { method: 'POST', headers: { cookie: playerCookie } })
      expect(cast.status).toBe(200)
      return { ...running, drawId, row: row!, playerId: await idOf(player.email), secondId: await idOf(second.email) }
    }

    const wheelOf = async (cookie: string, slug: string) => (JSON.parse(await rawRead(cookie, slug)) as EventView).wheel!

    it('reaches nobody before the end of the window: not the other Party, nor the Host, through the read, the numbers, the feed or the room', async () => {
      const { slug, eventId, playerId, secondId } = await playerCasts()

      const other = await wheelOf((await signIn(db, second)).cookie, slug)
      expect(other.vetoes).toEqual({ left: [3, 3], own: { team: 2, cast: false, rejection: null }, revealed: null, draw: expect.objectContaining({ kind: 'spin' }) })
      expect(await wheelOf(hostCookie, slug)).toMatchObject({ vetoes: { left: [3, 3], own: null, revealed: null } })
      for (const cookie of [hostCookie, (await signIn(db, second)).cookie]) {
        expect(JSON.stringify((JSON.parse(await rawRead(cookie, slug)) as EventView).wheel), 'the Event read').not.toContain(playerId)
        const feed = JSON.parse(await (await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie } })).text()) as ActivityPage
        expect(feed.entries.map(entry => entry.type)).not.toContain('vetoes_revealed')
      }
      // The Party's own Player sees it at once.
      expect((await wheelOf(playerCookie, slug)).vetoes).toEqual(vetoRead({ left: [2, 3], own: { team: 1, cast: true, rejection: 'veto_already_cast' } }))
      // The room: only the named send to the Party's Users, and neither event.changed nor any other message.
      expect(notifier.sends(eventId)).toEqual([{ to: [playerId], messages: [expect.objectContaining({ type: 'veto.cast', team: 1 })] }])
      expect(JSON.stringify(notifier.messages(eventId))).not.toContain(secondId)
    })

    it('names the caster to nobody: not the Party\'s Player, not the Host, not the other Party, before or after the end of the window (#355)', async () => {
      const { slug, row, playerId, secondId } = await playerCasts()
      const secondCookie = (await signIn(db, second)).cookie
      const hostId = await idOf(host.email)
      // The feed names Members in other entries (a move): only the Veto entry must hold no Player.
      const feedText = async (cookie: string) => JSON.stringify(((await (await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie } })).json()) as ActivityPage).entries.filter(entry => entry.type === 'vetoes_revealed'))

      const everyRead = async () => {
        for (const [who, cookie] of [['the Player', playerCookie], ['the Host', hostCookie], ['the other Party', secondCookie]] as const) {
          const wheel = JSON.stringify(await wheelOf(cookie, slug))
          for (const id of [playerId, secondId, hostId]) expect(wheel, `${who}'s Event read`).not.toContain(id)
          const feed = await feedText(cookie)
          for (const id of [playerId, secondId]) expect(feed, `${who}'s feed`).not.toContain(id)
        }
      }
      await everyRead()
      expect((await wheelOf(playerCookie, slug)).vetoes.own).toEqual({ team: 1, cast: true, rejection: 'veto_already_cast' })

      clock.set(row.vetoEndsAt!)
      await everyRead()
      expect((await wheelOf(hostCookie, slug)).vetoes.revealed).toEqual([{ team: 1 }])
    })

    it('keeps the Veto allowance floor of the Host where it was before the end of the window, and the allowance cannot be lowered under the sealed cast', async () => {
      const { slug, row } = await playerCasts()
      const hostView = async () => JSON.parse(await rawRead(hostCookie, slug)) as EventView
      const lower = async () => await request(`/api/e/${slug}/settings`, { method: 'PATCH', headers: { 'cookie': hostCookie, 'content-type': 'application/json' }, body: JSON.stringify({ settings: { vetoAllowance: 0 } }) })

      expect((await hostView()).settingsFloors?.vetoAllowance).toBe(0)
      const refused = await lower()
      expect(refused.status).toBe(409)
      expect((await refused.json() as { statusMessage: string }).statusMessage).toBe('locked_while_drawn')

      clock.set(row.vetoEndsAt!)
      expect((await hostView()).settingsFloors?.vetoAllowance).toBe(1)
    })

    it('reaches everyone at the end of the window: the Party that cast it, not the Player', async () => {
      const { slug, row } = await playerCasts()
      clock.set(row.vetoEndsAt!)

      const other = await wheelOf((await signIn(db, second)).cookie, slug)

      expect(other.vetoes).toEqual({ left: [2, 3], own: { team: 2, cast: false, rejection: 'veto_window_closed' }, revealed: [{ team: 1 }], draw: expect.objectContaining({ kind: 'spin' }) })
    })
  })

  // The secrecy check over every read (#418): CODING_STANDARDS § Secrecy records that every 0.7 miss sat on a surface nobody had named.
  // So the routes are not listed here: they are every file under server/api that answers GET (the test app's own scan), and a new read
  // is under the check the day it lands. The Event read, the Activity feed, the image route, the library, the Share image, the .ics,
  // Home's cards, the Invite preview and `me` are the surfaces a drawn game or a Veto can show on; the room carries no game data and
  // is no GET (the room tests above stay).
  describe('every GET route (#418)', () => {
    it('sweeps every route that answers GET, the Share image, the .ics and Home among them, and names the ones it leaves out', () => {
      const routes = getRoutes().map(route => route.route)

      expect(routes).toEqual(expect.arrayContaining(['/api/e', '/api/e/:slug', '/api/e/:slug/activity', '/api/e/:slug/ics', '/api/e/:slug/share-image', '/api/games', '/api/games/:id', '/api/images/:key', '/api/invite/:invite', '/api/me']))
      expect(routes).toHaveLength(mountedRoutes().filter(route => route.method === 'get').length)
      // Each file left out answers every method and exists: a name that outlives its file is a finding too.
      for (const file of Object.keys(NOT_SWEPT)) expect(mountedRoutes().find(route => route.file === file)?.method, `${file} is no longer a route without a method`).toBeNull()
      // Every GET route has its row of expected statuses, and every row names a GET route (#418).
      for (const route of routes) expect(EXPECTED_STATUS, `${route} has no row in EXPECTED_STATUS`).toHaveProperty([route])
      for (const route of Object.keys(EXPECTED_STATUS)) expect(routes, `EXPECTED_STATUS names ${route}, which is no GET route`).toContain(route)
    })

    const strangerCookie = async () => (await signIn(db, stranger)).cookie
    const okOf = (sweep: readonly SweptRoute[], who: string) => sweep.filter(entry => entry.who === who && entry.status === 200).map(entry => entry.route)
    const statusOf = (sweep: readonly SweptRoute[], route: string, who: string) => sweep.filter(entry => entry.route === route && entry.who === who).map(entry => entry.status)

    /** A spin of a Running Session under a Hidden wheel with no Veto window; the wheel holds Alpha, Beta and `extraGames` more. */
    async function spunWheel(extraGames: number) {
      const running = await runningEvent(NO_WINDOW, extraGames)
      const spun = await request(`/api/e/${running.slug}/rounds/spin`, { method: 'POST', headers: { cookie: hostCookie } })
      expect(spun.status).toBe(200)
      const [row] = await db.select().from(draws)
      const pool = [running.a, running.b, ...running.more]
      const drawn = pool.find(secret => secret.id === row!.gameId)!
      return { ...running, drawn, undrawn: pool.filter(secret => secret.id !== drawn.id), games: [running.a, running.b, running.c, running.e, ...running.more], stopAt: row!.stopAt.getTime() }
    }

    it.each([0, 4])('shows a Player and a non-Member no game of the draw on any GET route before its stop, and the drawn one to the Player from the stop on (%i more games in the pool)', async (extraGames) => {
      const { slug, inviteToken, drawn, undrawn, c, e, games, stopAt } = await spunWheel(extraGames)
      const viewers = [{ who: PLAYER, cookie: playerCookie }, { who: OUTSIDER, cookie: await strangerCookie() }, { who: HOST, cookie: hostCookie }]
      const sweep = () => sweepGets({ viewers, event: { slug, inviteToken }, games })

      clock.set(new Date(stopAt - 1))
      const before = await sweep()
      expectStatuses(before)

      // No trace of any game, on any route, for the Player or the non-Member. A picture is checked by its status: the image route
      // answers the Player a 404 here, and a 404 has a body to search.
      expectNone({ ...bodiesOf(before, PLAYER), ...bodiesOf(before, OUTSIDER) }, games)
      // The controls: the sweep reads bodies (the Host's holds the drawn game's name) and it is not passing on 404s.
      expect(bodiesOf(before, HOST)['GET /api/e/:slug as the Host']).toContain(drawn.name)
      expect(okOf(before, PLAYER)).toEqual(expect.arrayContaining(['/api/e', '/api/e/:slug', '/api/e/:slug/activity', '/api/e/:slug/ics', '/api/me']))
      expect(statusOf(before, '/api/e/:slug/share-image', PLAYER)).toEqual([409])
      expect(statusOf(before, '/api/e/:slug/share-image', OUTSIDER)).toEqual([404])
      expect(statusOf(before, '/api/images/:key', PLAYER)).toEqual(games.map(() => 404))
      expect(statusOf(before, '/api/images/:key', OUTSIDER)).toEqual(games.map(() => 404))
      // The Host's images answer a picture: its bytes are no text, so the sweep keeps its status and type.
      expect(before.filter(entry => entry.route === '/api/images/:key' && entry.who === HOST).map(entry => [entry.status, entry.contentType, entry.body])).toEqual(games.map(() => [200, 'image/webp', null]))

      clock.set(new Date(stopAt))
      const after = await sweep()
      expectStatuses(after, { seen: drawn.imageKey })

      // From the stop on the Player knows the drawn game, and still no other game of the pools, no notes or Tag of the drawn one.
      expect(Object.values(bodiesOf(after, PLAYER)).some(body => body.includes(drawn.name)), 'a body the Player reads names the drawn game').toBe(true)
      // The extra games are all Z...: one Price amount, so an undrawn one's Price is the drawn one's own, which the Player now reads (#338).
      expectNone(bodiesOf(after, PLAYER), [...undrawn, c, e], secret => playerTraces(secret).filter(trace => trace !== priceTrace(drawn)))
      expectNone(bodiesOf(after, PLAYER), [drawn], secret => [secret.notes, secret.tag])
      expect(after.find(entry => entry.route === '/api/images/:key' && entry.who === PLAYER && entry.path.endsWith(drawn.imageKey))?.status).toBe(200)
      // The non-Member learns nothing at any time (ADR 0006).
      expectNone(bodiesOf(after, OUTSIDER), games)
    })

    // GLOSSARY, Veto window: „until it ends, only a Party's own Players see its casts, and a Host who moves into a Party during its
    // window sees them too, a privilege of the Host, who may move anyone at any time“. The Host of this sweep is in no Party. And
    // #355: „No cast time in any payload“, `own.cast: boolean` („your Party has cast“); the database keeps the caster, no read names
    // them. So a sealed cast changes nothing a viewer outside its Party can read, on any route: the bodies are byte-identical.
    it('changes no GET route for the Host, the other Party or a non-Member when a Party casts a Veto before the end of its window, and reveals it at the end (#231, #355)', async () => {
      const { slug, inviteToken, secondCookie, a, b, c, e } = await runningEvent()
      const spun = await request(`/api/e/${slug}/rounds/spin`, { method: 'POST', headers: { cookie: hostCookie } })
      expect(spun.status).toBe(200)
      const { drawId } = await spun.json() as { drawId: string }
      await clockToStop(stage(), drawId)
      const [row] = await db.select().from(draws)
      const drawn = [a, b].find(secret => secret.id === row!.gameId)!
      const seen = drawn.imageKey
      const viewers = [{ who: HOST, cookie: hostCookie }, { who: OTHER_PARTY, cookie: secondCookie }, { who: OUTSIDER, cookie: await strangerCookie() }]
      const sweep = () => sweepGets({ viewers, event: { slug, inviteToken }, games: [a, b, c, e] })
      const playerRead = async () => (JSON.parse(await rawRead(playerCookie, slug)) as EventView).wheel!.vetoes.own

      expect(await db.select().from(vetoes)).toHaveLength(0)
      const before = await sweep()
      expectStatuses(before, { seen })
      expect(await playerRead()).toMatchObject({ team: 1, cast: false })
      const cast = await request(`/api/e/${slug}/draws/${drawId}/veto`, { method: 'POST', headers: { cookie: playerCookie } })
      expect(cast.status).toBe(200)
      expect(await db.select().from(vetoes)).toHaveLength(1)
      const after = await sweep()
      expectStatuses(after, { seen })

      expect(after.map(entry => entry.label)).toEqual(before.map(entry => entry.label))
      for (const [index, entry] of before.entries()) {
        expect(after[index], `${entry.label} as ${entry.who} changed with a sealed cast`).toEqual(entry)
      }
      // The controls: the sweep read Event bodies for all three, the cast is real (Player 1's own read changed), and the end of the
      // window reveals it to the Host and the other Party.
      expect(okOf(before, HOST)).toContain('/api/e/:slug')
      expect(okOf(before, OTHER_PARTY)).toContain('/api/e/:slug')
      expect(okOf(before, OUTSIDER)).not.toContain('/api/e/:slug')
      // The Members' 200s on the four Event routes; the non-Member's 404 there and 200 on Home are the table's (#418).
      for (const route of ['/api/e', '/api/e/:slug', '/api/e/:slug/activity', '/api/e/:slug/ics']) for (const who of [HOST, OTHER_PARTY]) expect(statusOf(before, route, who), `${route} as ${who}`).toEqual([200])
      expect(await playerRead()).toMatchObject({ team: 1, cast: true })
      await clockToEnd(stage(), drawId)
      const revealed = await sweep()
      expectStatuses(revealed, { seen })
      for (const who of [HOST, OTHER_PARTY]) {
        const sealedRead = before.find(entry => entry.route === '/api/e/:slug' && entry.who === who)
        const revealedRead = revealed.find(entry => entry.route === '/api/e/:slug' && entry.who === who)
        expect(revealedRead!.body, `the Event read of ${who} at the end of the window`).not.toBe(sealedRead!.body)
        expect((JSON.parse(revealedRead!.body!) as EventView).wheel!.vetoes.revealed).toEqual([{ team: 1 }])
      }
    })
  })
})
