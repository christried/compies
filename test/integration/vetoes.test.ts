import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import castVeto from '../../server/api/e/[slug]/draws/[drawId]/veto.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import putBack from '../../server/api/e/[slug]/rounds/[id].delete'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import spinWheel from '../../server/api/e/[slug]/rounds/spin.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import { activity, bonusVetoes, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityPage } from '../../shared/activity'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { VETO_WINDOW_MS } from '../../shared/rounds'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Vetoes (#231, spec #218 § Vetoes, Deadlines, Realtime room, Settings lock): the window that opens at the wheel's stop, the
// sealed casts, the reveal at its end, and the respin of a vetoed Round. Through the HTTP API with the in-memory room and a
// test clock; no timer runs on the server, so a test moves the clock past an instant and reads or writes.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const people = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
  bench: { provider: 'twitch', id: '6', name: 'Bank', email: 'bench@example.com', image: undefined },
  stands: { provider: 'twitch', id: '7', name: 'Tribuene', email: 'stands@example.com', image: undefined },
} as const
const outsider = { provider: 'discord', id: '8', name: 'Fremder', email: 'outsider@example.com', image: undefined } as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'
const LEAD = 1500
const STOP = LEAD + 6000
const END = STOP + VETO_WINDOW_MS

/** The Veto read (`wheel.vetoes`, #231) with the defaults a case does not pin: no own part, nothing revealed, the spin's window. A new read field gets its default here, once. */
function vetoRead({ left, own = null, revealed = null, draw = expect.objectContaining({ kind: 'spin' }) }: { left: number[], own?: object | null, revealed?: object[] | null, draw?: unknown }) {
  return { left, own, revealed, draw }
}

describe('Vetoes', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'GET /api/e/:slug/activity': getActivity,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/move': moveMember,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/sessions/end': endSession,
      'POST /api/e/:slug/rounds': setGame,
      'POST /api/e/:slug/rounds/spin': spinWheel,
      'DELETE /api/e/:slug/rounds/:id': putBack,
      'POST /api/e/:slug/draws/:drawId/veto': castVeto,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await testDb.db.delete(bonusVetoes)
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
   * A Running Session of a Lucky Wheel Event with two Parties of two (One and Two in team 1, Three and Four in team 2), a Member
   * on the Bench and one in the Stands, an outsider who is no Member, and four games in the Game pool. The Veto allowance is
   * `allowance` per Party, the Game count `gameCount`.
   */
  async function running({ allowance = 2, gameCount = 10, hiddenWheel = false }: { allowance?: number, gameCount?: number, hiddenWheel?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = {} as Record<keyof typeof people | 'outsider', string>
    for (const [key, profile] of Object.entries({ ...people, outsider })) cookies[key as keyof typeof cookies] = (await signIn(testDb.db, profile)).cookie
    const created = await send('POST', '/api/e', hostCookie, {
      name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS,
      settings: { ...TEST_SETTINGS, teamSize: 2, gameCount, selectionMode: 'lucky_wheel', vetoAllowance: allowance, hiddenWheel },
    })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const eventId = eventRow!.id
    const ids = {} as Record<'host' | keyof typeof people | 'outsider', string>
    for (const [key, profile] of Object.entries({ host, ...people, outsider })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key as keyof typeof ids] = row!.id
    }
    for (const key of Object.keys(people) as (keyof typeof people)[]) await testDb.db.insert(eventMembers).values({ eventId, userId: ids[key] })

    const inserted = await testDb.db.insert(games).values([
      { name: 'Halo', createdBy: ids.host, priceCents: 1999, priceSource: 'steam', priceCheckedAt: new Date('2026-11-03T10:00:00.000Z') },
      { name: 'Kart', createdBy: ids.host },
      { name: 'Dart', createdBy: ids.host },
      { name: 'Uno', createdBy: ids.host },
    ]).returning()
    await testDb.db.insert(eventPoolGames).values(inserted.map(game => ({ eventId, gameId: game.id })))

    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
    for (const slotId of slotIds) expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId })).status).toBe(200)
    const seats = [['one', team(1)], ['two', team(1)], ['three', team(2)], ['four', team(2)], ['stands', { zone: 'stands' }]] as const
    for (const [key, to] of seats) expect((await send('POST', `/api/e/${slug}/move`, cookies[key], { userId: ids[key], to })).status).toBe(200)
    expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
    await testDb.db.delete(activity)
    notifier.clear()
    return { slug, eventId, hostCookie, cookies, ids, games: inserted }
  }

  type Party = Awaited<ReturnType<typeof running>>

  const read = async (party: Party, cookie = party.hostCookie) => await (await send('GET', `/api/e/${party.slug}`, cookie)).json() as EventView
  const spin = (party: Party, cookie = party.hostCookie) => send('POST', `/api/e/${party.slug}/rounds/spin`, cookie)
  const putBackRound = (party: Party, roundId: string) => send('DELETE', `/api/e/${party.slug}/rounds/${roundId}`, party.hostCookie)
  const set = (party: Party, gameId: string, vetoAllowed?: boolean) => send('POST', `/api/e/${party.slug}/rounds`, party.hostCookie, vetoAllowed === undefined ? { gameId } : { gameId, vetoAllowed })
  const cast = (party: Party, drawId: string, cookie: string) => send('POST', `/api/e/${party.slug}/draws/${drawId}/veto`, cookie)
  const roundRows = (party: Party) => testDb.db.select().from(rounds).where(eq(rounds.eventId, party.eventId)).orderBy(rounds.startedAt)
  const drawRows = () => testDb.db.select().from(draws).orderBy(draws.committedAt)
  const vetoRows = () => testDb.db.select().from(vetoes)
  const feedOf = async (party: Party, cookie: string) => (await (await send('GET', `/api/e/${party.slug}/activity`, cookie)).json() as ActivityPage).entries

  /** Spins and answers the Round's and the draw's ids. */
  async function spun(party: Party) {
    const response = await spin(party)
    expect(response.status).toBe(200)
    return await response.json() as { roundId: string, drawId: string }
  }

  describe('the Veto window', () => {
    it('opens at the stop and lasts 60 seconds when a Party has a Veto left: the draw stores its end', async () => {
      const party = await running({ allowance: 2 })

      await spun(party)

      expect(await drawRows()).toMatchObject([{ stopAt: new Date(iso(STOP)), vetoEndsAt: new Date(iso(END)), outcome: null, settledAt: null }])
    })

    it('opens no window when no Party has a Veto left: the draw sets at the stop, as without Vetoes', async () => {
      const party = await running({ allowance: 0 })
      const { roundId } = await spun(party)
      const [row] = await drawRows()
      expect(row!.vetoEndsAt).toBeNull()

      clock.advance(STOP)
      const view = await read(party)

      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId: row!.gameId, setAt: new Date(iso(STOP)) }])
      expect(view.rounds.map(round => round.game.id)).toEqual([row!.gameId])
    })

    it('opens a window when only a Bonus Veto is left: the allowance is 0, the Party has one on top', async () => {
      const party = await running({ allowance: 0 })
      await testDb.db.insert(bonusVetoes).values({ eventId: party.eventId, team: 2, grantedBy: party.ids.host, grantedAt: new Date(T0) })

      await spun(party)

      expect((await drawRows())[0]!.vetoEndsAt).toEqual(new Date(iso(END)))
    })

    it('opens no window for a game the Host sets: it sets at once, as in #228', async () => {
      const party = await running({ allowance: 2 })

      expect((await set(party, party.games[0]!.id)).status).toBe(200)

      expect(await drawRows()).toMatchObject([{ kind: 'set', vetoEndsAt: null, outcome: 'set' }])
    })
  })

  describe('a game the Host sets with „Veto erlauben“ (#232)', () => {
    /** Sets the first game with the switch on and answers the Round and the draw. */
    async function setWithVeto(party: Party, gameId = party.games[0]!.id) {
      const response = await set(party, gameId, true)
      expect(response.status).toBe(200)
      const { roundId } = await response.json() as { roundId: string }
      const [row] = (await drawRows()).filter(draw => draw.roundId === roundId && draw.outcome === null)
      return { roundId, drawId: row!.id, gameId }
    }

    it('opens a window at once: the Round has no game yet, the set draw stores the window, and a Player may cast', async () => {
      const party = await running()

      const { roundId, drawId, gameId } = await setWithVeto(party)

      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId: null, setAt: null }])
      expect(await drawRows()).toMatchObject([{ kind: 'set', gameId, stopAt: new Date(T0), vetoEndsAt: new Date(iso(VETO_WINDOW_MS)), outcome: null, settledAt: null }])
      const view = await read(party, party.cookies.one)
      expect(view.rounds).toEqual([])
      expect(view.wheel!.vetoes.draw).toMatchObject({ drawId, kind: 'set', stopAt: iso(0), vetoEndsAt: iso(VETO_WINDOW_MS), game: { id: gameId, name: 'Halo', price: { cents: 1999, source: 'steam', checkedAt: '2026-11-03T10:00:00.000Z' } } })
      expect(view.wheel!.vetoes.own).toMatchObject({ team: 1, cast: false, rejection: null })
      expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)
    })

    it('keeps the Round being drawn until the window ends: another set or spin is refused', async () => {
      const party = await running()
      await setWithVeto(party)

      clock.advance(VETO_WINDOW_MS - 1)

      expect(await errorOf(await set(party, party.games[1]!.id))).toEqual({ status: 409, code: 'round_being_drawn' })
      expect(await errorOf(await spin(party))).toEqual({ status: 409, code: 'round_being_drawn' })
    })

    it('gives the Round its game at the end of the window when nobody vetoed, stamped with that instant', async () => {
      const party = await running()
      const { roundId, gameId } = await setWithVeto(party)

      clock.advance(VETO_WINDOW_MS + 30_000)
      const view = await read(party, party.cookies.three)

      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId, setAt: new Date(iso(VETO_WINDOW_MS)) }])
      expect(await drawRows()).toMatchObject([{ outcome: 'set', settledAt: new Date(iso(VETO_WINDOW_MS)) }])
      expect(view.rounds.map(round => round.game.id)).toEqual([gameId])
      expect(view.wheel!.vetoes.revealed).toEqual([])
    })

    it('takes the game out of the games left when a Party vetoes, and the Host can spin into the same Round', async () => {
      const party = await running({ gameCount: 1 })
      const { roundId, drawId, gameId } = await setWithVeto(party)
      expect((await cast(party, drawId, party.cookies.three)).status).toBe(200)

      clock.advance(VETO_WINDOW_MS)
      const view = await read(party)

      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId: null, setAt: null }])
      expect(await drawRows()).toMatchObject([{ outcome: 'vetoed', settledAt: new Date(iso(VETO_WINDOW_MS)) }])
      expect(view.setGame?.left).not.toContain(gameId)
      expect(view.setGame?.left).toHaveLength(3)
      expect(view.setGame?.respin).toBe(true)
      expect(view.wheel!.vetoes.revealed).toMatchObject([{ team: 2 }])

      const respun = await spin(party)
      expect(respun.status).toBe(200)
      expect(await respun.json()).toMatchObject({ roundId })
      expect(await roundRows(party)).toHaveLength(1)
    })

    it('lets the Host set again into the same Round after a veto, and the Game count counts it once', async () => {
      const party = await running({ gameCount: 1 })
      const { roundId, drawId } = await setWithVeto(party)
      await cast(party, drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS)

      const response = await set(party, party.games[1]!.id)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ roundId })
      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId: party.games[1]!.id }])
      expect((await drawRows()).map(row => row.outcome)).toEqual(['vetoed', 'set'])
    })

    it('refuses a vetoed game from the library: a vetoed game cannot come back (F14)', async () => {
      const party = await running()
      const [library] = await testDb.db.insert(games).values({ name: 'Bibliothek', createdBy: party.ids.host }).returning()
      const { drawId } = await setWithVeto(party, library!.id)
      await cast(party, drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS)

      expect(await errorOf(await set(party, library!.id))).toEqual({ status: 409, code: 'game_already_drawn' })
      expect(await errorOf(await set(party, party.games[0]!.id))).not.toEqual({ status: 409, code: 'game_already_drawn' })
    })

    it('loses a library game too, and the pool stays as it was', async () => {
      const party = await running()
      const [library] = await testDb.db.insert(games).values({ name: 'Bibliothek', createdBy: party.ids.host }).returning()
      const { drawId } = await setWithVeto(party, library!.id)
      await cast(party, drawId, party.cookies.one)

      clock.advance(VETO_WINDOW_MS)
      const view = await read(party)

      expect(view.setGame?.left).toHaveLength(4)
      expect(await drawRows()).toMatchObject([{ source: 'library', outcome: 'vetoed' }])
    })

    it('sets at once when the switch is off or absent: no window, no draw in the read', async () => {
      const party = await running()

      expect((await set(party, party.games[0]!.id, false)).status).toBe(200)

      expect(await drawRows()).toMatchObject([{ kind: 'set', vetoEndsAt: null, outcome: 'set' }])
      expect(await roundRows(party)).toMatchObject([{ gameId: party.games[0]!.id }])
      expect((await read(party)).wheel!.vetoes.draw).toBeNull()
    })

    it('sets at once when no Party has a Veto left, even with the switch on', async () => {
      const party = await running({ allowance: 0 })

      expect((await set(party, party.games[0]!.id, true)).status).toBe(200)

      expect(await drawRows()).toMatchObject([{ kind: 'set', vetoEndsAt: null, outcome: 'set' }])
      expect(await roundRows(party)).toMatchObject([{ gameId: party.games[0]!.id }])
    })

    it('drops the window from the read when a later set has the switch off', async () => {
      const party = await running({ gameCount: 1 })
      const { drawId } = await setWithVeto(party)
      await cast(party, drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS)
      expect((await read(party)).wheel!.vetoes.draw).toMatchObject({ drawId })

      clock.advance(1)
      expect((await set(party, party.games[1]!.id)).status).toBe(200)

      expect((await read(party)).wheel!.vetoes.draw).toBeNull()
    })

    it('answers invalid_value to a switch that is no boolean', async () => {
      const party = await running()

      const response = await send('POST', `/api/e/${party.slug}/rounds`, party.hostCookie, { gameId: party.games[0]!.id, vetoAllowed: 'yes' })

      expect(await errorOf(response)).toEqual({ status: 400, code: 'invalid_value' })
    })

    it('shows the draw of the window to everyone as the set game, from the set instant on', async () => {
      const party = await running()
      const { drawId, gameId } = await setWithVeto(party)

      for (const cookie of [party.hostCookie, party.cookies.three, party.cookies.bench, party.cookies.stands]) {
        const veto = (await read(party, cookie)).wheel!.vetoes
        expect(veto.draw).toMatchObject({ drawId, kind: 'set', game: { id: gameId } })
      }
    })

    it('keeps another Party\'s cast sealed on the set draw, and reveals it at the end', async () => {
      const party = await running()
      const { drawId } = await setWithVeto(party)
      await cast(party, drawId, party.cookies.one)

      const other = (await read(party, party.cookies.three)).wheel!.vetoes
      expect(other).toMatchObject({ left: [2, 2], own: { team: 2, cast: false, rejection: null }, revealed: null })
      expect((await read(party, party.cookies.one)).wheel!.vetoes.own).toMatchObject({ team: 1, cast: true, rejection: 'veto_already_cast' })

      clock.advance(VETO_WINDOW_MS)
      expect((await read(party, party.cookies.three)).wheel!.vetoes).toMatchObject({ left: [1, 2], revealed: [{ team: 1 }] })
    })

    it('reveals only the set game to a Member under a Hidden wheel: nothing else of the pool', async () => {
      const party = await running({ hiddenWheel: true })
      await setWithVeto(party)

      const text = await (await send('GET', `/api/e/${party.slug}`, party.cookies.one)).text()
      const view = JSON.parse(text) as EventView

      expect(view.wheel!.vetoes.draw).toMatchObject({ kind: 'set', game: { name: 'Halo' } })
      expect(view.wheel!.slices).toBeNull()
      expect(view.pool).toBeNull()
      for (const name of ['Kart', 'Dart', 'Uno']) expect(text).not.toContain(name)
      for (const game of party.games.slice(1)) expect(text).not.toContain(game.id)
    })
  })

  describe('settling at the end of the window', () => {
    it('keeps the draw open until the window ends: a Round being drawn refuses another spin up to the last millisecond', async () => {
      const party = await running()
      await spun(party)

      clock.advance(END - 1)
      const view = await read(party)

      expect(view.rounds).toEqual([])
      expect((await drawRows())[0]!.outcome).toBeNull()
      expect(await errorOf(await spin(party))).toEqual({ status: 409, code: 'round_being_drawn' })
    })

    it('sets the Round with the drawn game at the end of the window when nobody vetoed, stamped with that instant, not the read', async () => {
      const party = await running()
      const { roundId } = await spun(party)
      const [row] = await drawRows()

      clock.advance(END + 90_000)
      const view = await read(party, party.cookies.three)

      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId: row!.gameId, setAt: new Date(iso(END)) }])
      expect(await drawRows()).toMatchObject([{ outcome: 'set', settledAt: new Date(iso(END)) }])
      expect(view.rounds.map(round => round.setAt)).toEqual([iso(END)])
    })

    it('settles once: reading again, or another Member reading, changes nothing', async () => {
      const party = await running()
      await spun(party)
      clock.advance(END)
      await read(party)
      const rounds = await roundRows(party)
      const draws = await drawRows()

      clock.advance(60_000)
      await read(party)
      await read(party, party.cookies.one)

      expect(await roundRows(party)).toEqual(rounds)
      expect(await drawRows()).toEqual(draws)
    })

    it('writes no feed entry for a draw nobody vetoed', async () => {
      const party = await running()
      await spun(party)

      clock.advance(END)
      await read(party)

      expect((await feedOf(party, party.hostCookie)).map(entry => entry.type)).toEqual(['game_drawn'])
    })
  })

  describe('the respin of a vetoed Round', () => {
    it('keeps the Round without a game when a Party vetoed, and the game is gone from the games left', async () => {
      const party = await running({ gameCount: 1 })
      const { roundId, drawId } = await spun(party)
      const [row] = await drawRows()
      clock.advance(STOP)
      expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)

      clock.advance(VETO_WINDOW_MS)
      const view = await read(party)

      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId: null, setAt: null, putBackAt: null }])
      expect(await drawRows()).toMatchObject([{ outcome: 'vetoed', settledAt: new Date(iso(END)) }])
      expect(view.rounds).toEqual([])
      expect(view.setGame?.left).not.toContain(row!.gameId)
      expect(view.setGame?.left).toHaveLength(3)
      expect(view.setGame?.respin).toBe(true)
    })

    it('is no longer the wheel\'s current spin once it was vetoed: the card names it no more (F6)', async () => {
      const party = await running()
      const { drawId } = await spun(party)
      clock.advance(STOP)
      await cast(party, drawId, party.cookies.one)
      // Sealed and open: the spin is still the latest draw, and nothing has settled.
      expect((await read(party, party.cookies.three)).wheel?.spin?.current).toBe(true)

      clock.advance(VETO_WINDOW_MS)

      expect((await read(party, party.cookies.three)).wheel?.spin?.current).toBe(false)
      expect((await read(party)).wheel?.spin?.current).toBe(false)
    })

    it('spins into the same Round: no new Round, and the Game count counts it once', async () => {
      const party = await running({ gameCount: 1 })
      const { roundId, drawId } = await spun(party)
      clock.advance(STOP)
      await cast(party, drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS)

      const response = await spin(party)

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ roundId })
      expect(await roundRows(party)).toHaveLength(1)
      const rows = await drawRows()
      expect(rows.map(row => row.roundId)).toEqual([roundId, roundId])
      expect(rows[0]!.gameId).not.toBe(rows[1]!.gameId)
      expect(rows[1]).toMatchObject({ outcome: null, vetoEndsAt: new Date(iso(END + STOP + VETO_WINDOW_MS)) })
    })

    it('sets a game the Host picks into the waiting Round, settled set at once', async () => {
      const party = await running({ gameCount: 1 })
      const { roundId, drawId } = await spun(party)
      clock.advance(STOP)
      await cast(party, drawId, party.cookies.three)
      clock.advance(VETO_WINDOW_MS)
      const [vetoedDraw] = await drawRows()
      const other = party.games.find(game => game.id !== vetoedDraw!.gameId)!

      const response = await set(party, other.id)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ roundId })
      expect(await roundRows(party)).toMatchObject([{ id: roundId, gameId: other.id }])
      expect((await drawRows()).map(row => row.outcome)).toEqual(['vetoed', 'set'])
      expect((await read(party)).rounds.map(round => round.id)).toEqual([roundId])
    })

    it('still refuses a new Round once the Game count is reached by Rounds that are not waiting', async () => {
      const party = await running({ gameCount: 1 })
      expect((await set(party, party.games[0]!.id)).status).toBe(200)

      expect(await errorOf(await spin(party))).toEqual({ status: 409, code: 'game_count_reached' })
    })

    it('counts the Veto allowance across Rounds: a Veto spent in a Round the Host put back stays spent', async () => {
      const party = await running({ allowance: 1 })
      const first = await spun(party)
      clock.advance(STOP)
      await cast(party, first.drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS)
      // The respin sets (team 2 keeps its Veto but does not use it), then the Host puts the Round back.
      const second = await spun(party)
      clock.advance(STOP + VETO_WINDOW_MS)
      expect((await putBackRound(party, second.roundId)).status).toBe(200)

      const view = await read(party)

      expect(view.wheel?.vetoes.left).toEqual([0, 1])
    })
  })

  describe('casting a Veto', () => {
    /** Spins and moves the clock to the stop: the window is open. */
    async function windowOpen(party: Party) {
      const drawn = await spun(party)
      clock.advance(STOP)
      return drawn
    }

    it('stores the Party\'s Veto with the Player who cast it and the server clock, and answers the draw and the Party', async () => {
      const party = await running()
      const { drawId } = await windowOpen(party)

      const response = await cast(party, drawId, party.cookies.three)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ drawId, team: 2 })
      expect(await vetoRows()).toEqual([{ drawId, team: 2, userId: party.ids.three, castAt: new Date(iso(STOP)) }])
    })

    it('lets both Parties cast on the same draw', async () => {
      const party = await running()
      const { drawId } = await windowOpen(party)

      expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)
      expect((await cast(party, drawId, party.cookies.four)).status).toBe(200)

      expect((await vetoRows()).map(row => row.team).sort()).toEqual([1, 2])
    })

    describe('the refusals', () => {
      it('answers 403 not_a_player to a Member on the Bench, a Member in the Stands, and the Host who plays in no Party', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)

        expect(await errorOf(await cast(party, drawId, party.cookies.bench))).toEqual({ status: 403, code: 'not_a_player' })
        expect(await errorOf(await cast(party, drawId, party.cookies.stands))).toEqual({ status: 403, code: 'not_a_player' })
        expect(await errorOf(await cast(party, drawId, party.hostCookie))).toEqual({ status: 403, code: 'not_a_player' })
        expect(await vetoRows()).toEqual([])
      })

      it('answers like any other address to somebody who is no Member of the Event, and 401 to nobody', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)

        expect((await cast(party, drawId, party.cookies.outsider)).status).toBe(404)
        expect((await send('POST', `/api/e/${party.slug}/draws/${drawId}/veto`, undefined)).status).toBe(401)
        expect(await vetoRows()).toEqual([])
      })

      it('answers 409 veto_window_closed from the end of the window on, to the millisecond, and before the stop', async () => {
        const party = await running()
        const { drawId } = await spun(party)

        expect(await errorOf(await cast(party, drawId, party.cookies.one))).toEqual({ status: 409, code: 'veto_window_closed' })
        clock.set(iso(END - 1))
        expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)
        clock.set(iso(END))
        expect(await errorOf(await cast(party, drawId, party.cookies.three))).toEqual({ status: 409, code: 'veto_window_closed' })
        clock.set(iso(END + 120_000))
        expect(await errorOf(await cast(party, drawId, party.cookies.three))).toEqual({ status: 409, code: 'veto_window_closed' })
        expect((await vetoRows()).map(row => row.team)).toEqual([1])
      })

      it('answers 409 no_running_session once the Session has ended, though the window was open (F15)', async () => {
        const party = await running()
        const { drawId } = await spun(party)
        clock.set(iso(STOP))
        expect((await send('POST', `/api/e/${party.slug}/sessions/end`, party.hostCookie)).status).toBe(200)

        expect(await errorOf(await cast(party, drawId, party.cookies.one))).toEqual({ status: 409, code: 'no_running_session' })
        expect(await vetoRows()).toEqual([])
        expect((await read(party, party.cookies.one)).wheel).toBeNull()
      })

      it('answers 409 veto_already_cast to a second Veto of a Party: the same Player, or a teammate', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)

        expect(await errorOf(await cast(party, drawId, party.cookies.one))).toEqual({ status: 409, code: 'veto_already_cast' })
        expect(await errorOf(await cast(party, drawId, party.cookies.two))).toEqual({ status: 409, code: 'veto_already_cast' })
        expect(await vetoRows()).toMatchObject([{ team: 1, userId: party.ids.one }])
      })

      it('lets exactly one of two teammates win when they cast at the same time', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)

        const answers = await Promise.all([cast(party, drawId, party.cookies.one), cast(party, drawId, party.cookies.two)])

        expect(answers.map(answer => answer.status).sort()).toEqual([200, 409])
        expect(await vetoRows()).toHaveLength(1)
      })

      it('answers 409 no_vetoes_left to a Party whose allowance is used up, while the other Party can still cast', async () => {
        const party = await running({ allowance: 1 })
        const first = await windowOpen(party)
        await cast(party, first.drawId, party.cookies.one)
        clock.advance(VETO_WINDOW_MS)
        const second = await windowOpen(party)

        expect(await errorOf(await cast(party, second.drawId, party.cookies.two))).toEqual({ status: 409, code: 'no_vetoes_left' })
        expect((await cast(party, second.drawId, party.cookies.three)).status).toBe(200)
      })

      it('lets a Bonus Veto on top of the allowance cast one more', async () => {
        const party = await running({ allowance: 1 })
        await testDb.db.insert(bonusVetoes).values({ eventId: party.eventId, team: 1, grantedBy: party.ids.host, grantedAt: new Date(T0) })
        const first = await windowOpen(party)
        await cast(party, first.drawId, party.cookies.one)
        clock.advance(VETO_WINDOW_MS)
        const second = await windowOpen(party)

        expect((await cast(party, second.drawId, party.cookies.two)).status).toBe(200)
      })

      it('answers 409 no_veto_window for a draw without a window, a draw the Event does not have, and an id that is none', async () => {
        const none = await running({ allowance: 0 })
        const { drawId } = await spun(none)
        clock.advance(STOP)

        expect(await errorOf(await cast(none, drawId, none.cookies.one))).toEqual({ status: 409, code: 'no_veto_window' })
        expect(await errorOf(await cast(none, '00000000-0000-4000-8000-000000000000', none.cookies.one))).toEqual({ status: 409, code: 'no_veto_window' })
        expect(await errorOf(await cast(none, 'nonsense', none.cookies.one))).toEqual({ status: 409, code: 'no_veto_window' })
      })

      it('answers 409 no_veto_window for a game the Host set', async () => {
        const party = await running()
        await set(party, party.games[0]!.id)
        const [row] = await drawRows()

        expect(await errorOf(await cast(party, row!.id, party.cookies.one))).toEqual({ status: 409, code: 'no_veto_window' })
      })

      it('writes and publishes nothing when it refuses', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        notifier.clear()

        await cast(party, drawId, party.cookies.bench)
        await cast(party, 'nonsense', party.cookies.one)

        expect(await vetoRows()).toEqual([])
        expect(notifier.sends(party.eventId)).toEqual([])
      })
    })

    describe('sealed until the window ends', () => {
      it('shows the casting Party that it cast: the caster and the teammate alike, the teammate locked out', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.one)

        for (const cookie of [party.cookies.one, party.cookies.two]) {
          const { vetoes: veto } = (await read(party, cookie)).wheel!
          expect(veto).toEqual(vetoRead({ left: [1, 2], own: { team: 1, cast: true, rejection: 'veto_already_cast' } }))
        }
      })

      it('shows the other Party, the Host, the Bench and the Stands nothing of it: not in the own part, nor in the numbers', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.one)

        const other = (await read(party, party.cookies.three)).wheel!.vetoes
        expect(other).toEqual({ left: [2, 2], own: { team: 2, cast: false, rejection: null }, revealed: null, draw: expect.objectContaining({ kind: 'spin' }) })
        for (const cookie of [party.hostCookie, party.cookies.bench, party.cookies.stands]) {
          expect((await read(party, cookie)).wheel!.vetoes).toEqual({ left: [2, 2], own: null, revealed: null, draw: expect.objectContaining({ kind: 'spin' }) })
        }
      })

      it('gives the cast to nobody else through the feed either', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.one)

        for (const cookie of [party.hostCookie, party.cookies.three]) {
          expect((await feedOf(party, cookie)).map(entry => entry.type)).toEqual(['game_drawn'])
        }
      })

      it('publishes the cast to the Users of the casting Party only, and no event.changed to the room', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        notifier.clear()

        await cast(party, drawId, party.cookies.one)

        const sends = notifier.sends(party.eventId)
        expect(sends).toHaveLength(1)
        expect([...sends[0]!.to!].sort()).toEqual([party.ids.one, party.ids.two].sort())
        expect(sends[0]!.messages).toEqual([expect.objectContaining({ type: 'veto.cast', drawId, team: 1, v: 1 })])
        expect(notifier.messages(party.eventId).map(message => message.type)).toEqual(['veto.cast'])
      })
    })

    describe('the reveal at the end of the window', () => {
      it('shows every Party\'s Veto to everyone from the end on, and counts the Vetoes as used up', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.two)
        await cast(party, drawId, party.cookies.three)

        clock.advance(VETO_WINDOW_MS)

        for (const cookie of [party.hostCookie, party.cookies.one, party.cookies.three, party.cookies.bench, party.cookies.stands]) {
          const veto = (await read(party, cookie)).wheel!.vetoes
          expect(veto.revealed).toMatchObject([{ team: 1 }, { team: 2 }])
          expect(veto.left).toEqual([1, 1])
        }
      })

      it('takes the vetoed game out of the games left for good, and the Round waits without a game', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        const [row] = await drawRows()
        await cast(party, drawId, party.cookies.one)

        clock.advance(VETO_WINDOW_MS)
        const view = await read(party)

        expect(view.setGame?.left).not.toContain(row!.gameId)
        expect(view.rounds).toEqual([])
        expect(view.setGame?.spinRejection).toBeNull()
      })

      it('writes „vetoes revealed“ into the feed from the end on, not before, with the Parties that cast them and the vetoed game', async () => {
        const party = await running()
        const { roundId, drawId } = await windowOpen(party)
        const [row] = await drawRows()
        await cast(party, drawId, party.cookies.two)
        await cast(party, drawId, party.cookies.three)
        clock.advance(VETO_WINDOW_MS - 1)
        await read(party)
        expect((await feedOf(party, party.cookies.one)).map(entry => entry.type)).toEqual(['game_drawn'])

        clock.advance(1)
        const entries = await feedOf(party, party.cookies.one)

        expect(entries.map(entry => entry.type)).toEqual(['vetoes_revealed', 'game_drawn'])
        expect(entries[0]).toMatchObject({
          at: iso(END),
          type: 'vetoes_revealed',
          params: { roundId, drawId, gameId: row!.gameId, vetoes: [{ team: 1 }, { team: 2 }] },
          people: {},
        })
      })

      it('settles twice without a change: no second entry, no second outcome', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.one)
        clock.advance(VETO_WINDOW_MS)
        await read(party)
        const draws = await drawRows()
        const rounds = await roundRows(party)

        clock.advance(10_000)
        await read(party, party.cookies.three)
        await read(party)

        expect(await drawRows()).toEqual(draws)
        expect(await roundRows(party)).toEqual(rounds)
        expect((await feedOf(party, party.hostCookie)).filter(entry => entry.type === 'vetoes_revealed')).toHaveLength(1)
      })

      it('lets a Player of the other Party see after the end that no Veto was cast on a draw that stood', async () => {
        const party = await running()
        await windowOpen(party)

        clock.advance(VETO_WINDOW_MS)

        expect((await read(party, party.cookies.three)).wheel!.vetoes).toEqual(vetoRead({ left: [2, 2], own: { team: 2, cast: false, rejection: 'veto_window_closed' }, revealed: [] }))
      })
    })

    // A Veto belongs to the Party (#355): no client ever learns which Player cast it; only the `vetoes` row keeps it.
    describe('no caster in any payload (#355)', () => {
      const viewers = ['host', 'one', 'two', 'three', 'bench', 'stands'] as const
      const cookieOf = (party: Party, who: typeof viewers[number]) => who === 'host' ? party.hostCookie : party.cookies[who]

      /** The text holds no id of any User of the Party: caster, teammate, other Party, Host, Bench, Stands. */
      function expectNoUserId(party: Party, text: string, where: string) {
        for (const id of Object.values(party.ids)) expect(text, where).not.toContain(id)
      }

      it('keeps the caster out of the Event read while the window runs: the casting Party sees that it cast, the others see nothing', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)

        for (const who of viewers) expectNoUserId(party, JSON.stringify((await read(party, cookieOf(party, who))).wheel), `the Event read of ${who}`)
        for (const who of ['one', 'two'] as const) expect((await read(party, cookieOf(party, who))).wheel!.vetoes.own, who).toEqual({ team: 1, cast: true, rejection: 'veto_already_cast' })
        expect((await read(party, party.cookies.three)).wheel!.vetoes.own!.cast).toBe(false)
        expect((await read(party, party.hostCookie)).wheel!.vetoes.own).toBeNull()
      })

      it('keeps the caster out of the reveal: every viewer gets the Parties that vetoed, nothing else', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.two)
        await cast(party, drawId, party.cookies.three)

        clock.advance(VETO_WINDOW_MS)

        for (const who of viewers) {
          const { wheel } = await read(party, cookieOf(party, who))
          expect(wheel!.vetoes.revealed, who).toEqual([{ team: 1 }, { team: 2 }])
          expectNoUserId(party, JSON.stringify(wheel), `the Event read of ${who} after the reveal`)
        }
      })

      it('names the Parties only in the feed entry, and no Player: `params.vetoes` has the team, `people` is empty', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.two)
        await cast(party, drawId, party.cookies.three)

        clock.advance(VETO_WINDOW_MS)

        for (const who of viewers) {
          const entry = (await feedOf(party, cookieOf(party, who))).find(item => item.type === 'vetoes_revealed')
          expect(entry, who).toBeDefined()
          expect((entry!.params as { vetoes: unknown[] }).vetoes, who).toEqual([{ team: 1 }, { team: 2 }])
          expect(entry!.people, who).toEqual({})
          expectNoUserId(party, JSON.stringify(entry), `the feed entry of ${who}`)
        }
      })

      it('strips the caster from an entry that was written with it: the old deployment still writes it while this one rolls out', async () => {
        const party = await running()
        const { roundId, drawId } = await windowOpen(party)
        const [row] = await drawRows()
        await testDb.db.insert(activity).values({
          eventId: party.eventId, type: 'vetoes_revealed', actorId: null, at: new Date(iso(-1000)),
          params: { roundId, drawId, gameId: row!.gameId, vetoes: [{ team: 1, userId: party.ids.two }] } as never,
        })

        for (const who of viewers) {
          const entry = (await feedOf(party, cookieOf(party, who))).find(item => item.type === 'vetoes_revealed')
          expect(entry, who).toBeDefined()
          expect((entry!.params as { vetoes: unknown[] }).vetoes, who).toEqual([{ team: 1 }])
          expect(entry!.people, who).toEqual({})
          expectNoUserId(party, JSON.stringify(entry), `the legacy feed entry of ${who}`)
        }
      })

      it('sends the room the Party only: no Player in any message, and the POST answers the draw and the Party', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        notifier.clear()

        const response = await cast(party, drawId, party.cookies.one)

        expect(await response.json()).toEqual({ drawId, team: 1 })
        // The `to` list of a send is routing (the whole Party), not payload: only the messages are checked.
        expectNoUserId(party, JSON.stringify(notifier.messages(party.eventId)), 'the room messages')
        expectNoUserId(party, JSON.stringify(notifier.sends(party.eventId).map(send => send.messages)), 'the sealed sends')
      })

      it('keeps the pool warning and the settings floors free of a Player: they carry numbers only', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)
        await cast(party, drawId, party.cookies.one)

        for (const cookie of [party.hostCookie, party.cookies.one]) {
          const view = await read(party, cookie)
          expectNoUserId(party, JSON.stringify({ pool: view.setGame?.poolWarning ?? null, floors: view.settingsFloors }), 'the pool warning and the floors')
        }
      })

      it('still stores the Player who cast it: only the database keeps it', async () => {
        const party = await running()
        const { drawId } = await windowOpen(party)

        await cast(party, drawId, party.cookies.one)

        expect(await vetoRows()).toEqual([{ drawId, team: 1, userId: party.ids.one, castAt: new Date(iso(STOP)) }])
      })
    })
  })

  // The clip is the latest draw's from its stop on (server/utils/clip.ts), settled or not: a Veto window needs nothing of it. The longest
  // clip (60 s) ends with the window, so a vetoed game's clip never outlives its reveal.
  describe('the clip of a draw (#230)', () => {
    it('plays from the stop through the whole Veto window, the same for every Member, and is gone at its end', async () => {
      const party = await running()
      const { drawId } = await spun(party)
      const [row] = await drawRows()
      await testDb.db.update(games).set({ clipLength: 60 }).where(eq(games.id, row!.gameId))

      clock.advance(STOP)
      for (const cookie of [party.hostCookie, party.cookies.one, party.cookies.three]) expect((await read(party, cookie)).clip).toMatchObject({ drawId, startAt: iso(STOP), endsAt: iso(END) })
      await cast(party, drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS - 1)
      expect((await read(party)).clip).not.toBeNull()

      clock.advance(1)
      expect((await read(party)).clip).toBeNull()
    })

    it('is replaced by the new draw of the respin', async () => {
      const party = await running()
      const first = await spun(party)
      clock.advance(STOP)
      await cast(party, first.drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS)
      const second = await spun(party)

      clock.advance(STOP)

      expect((await read(party)).clip?.drawId).toBe(second.drawId)
    })
  })

  describe('Rad verdecken while a Round is being drawn (review 1.4 A3)', () => {
    const hide = (party: Party, hiddenWheel: boolean) => send('PATCH', `/api/e/${party.slug}/settings`, party.hostCookie, { settings: { hiddenWheel } })

    it('is locked from the spin to the end of the window, with 409 locked_while_drawn, and free again after it settles', async () => {
      const party = await running()
      await spun(party)

      expect(await errorOf(await hide(party, true))).toEqual({ status: 409, code: 'locked_while_drawn' })
      clock.advance(STOP)
      expect(await errorOf(await hide(party, true))).toEqual({ status: 409, code: 'locked_while_drawn' })
      expect((await read(party)).roundBeingDrawn).toBe(true)

      clock.advance(VETO_WINDOW_MS)
      expect((await read(party)).roundBeingDrawn).toBe(false)
      expect((await hide(party, true)).status).toBe(200)
      expect((await read(party)).settings?.hiddenWheel).toBe(true)
    })

    it('is locked in a spin without a window until the stop, and free after it', async () => {
      const party = await running({ allowance: 0 })
      await spun(party)

      expect((await hide(party, true)).status).toBe(409)
      clock.advance(STOP)
      expect((await hide(party, true)).status).toBe(200)
    })

    it('leaves the other settings free during the draw, and a Hidden wheel that is set again as it was', async () => {
      const party = await running()
      await spun(party)

      expect((await send('PATCH', `/api/e/${party.slug}/settings`, party.hostCookie, { settings: { gameCount: 9 } })).status).toBe(200)
      expect((await hide(party, false)).status).toBe(200)
    })

    it('is free while a Round only waits for a respin', async () => {
      const party = await running()
      const { drawId } = await spun(party)
      clock.advance(STOP)
      await cast(party, drawId, party.cookies.one)
      clock.advance(VETO_WINDOW_MS)

      expect((await hide(party, true)).status).toBe(200)
    })
  })

  describe('the Veto allowance floor', () => {
    const setAllowance = (party: Party, vetoAllowance: number) => send('PATCH', `/api/e/${party.slug}/settings`, party.hostCookie, { settings: { vetoAllowance } })

    it('is the most Vetoes any Party has cast: the allowance cannot drop below it, and the Event read says so', async () => {
      const party = await running({ allowance: 3 })
      for (const cookie of [party.cookies.one, party.cookies.one]) {
        const { drawId } = await spun(party)
        clock.advance(STOP)
        await cast(party, drawId, cookie)
        clock.advance(VETO_WINDOW_MS)
        await read(party)
      }

      expect((await read(party)).settingsFloors?.vetoAllowance).toBe(2)
      expect(await errorOf(await setAllowance(party, 1))).toEqual({ status: 409, code: 'veto_allowance_below_spent' })
      expect((await setAllowance(party, 2)).status).toBe(200)
    })

    it('does not move for the Host while the window of the draw runs: a sealed Veto stays sealed, and the allowance cannot be lowered under it', async () => {
      const party = await running({ allowance: 3 })
      const { drawId } = await spun(party)
      clock.advance(STOP)
      expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)

      // The Host plays in no Party: nothing of the cast reaches the Host's floor before the end of the window.
      expect((await read(party)).settingsFloors?.vetoAllowance).toBe(0)
      expect(await errorOf(await setAllowance(party, 1))).toEqual({ status: 409, code: 'locked_while_drawn' })
      expect(await errorOf(await setAllowance(party, 4))).toEqual({ status: 409, code: 'locked_while_drawn' })
      expect((await read(party)).settings?.vetoAllowance).toBe(3)

      clock.advance(VETO_WINDOW_MS - 1)
      expect((await read(party)).settingsFloors?.vetoAllowance).toBe(0)

      clock.advance(1)
      expect((await read(party)).settingsFloors?.vetoAllowance).toBe(1)
      expect(await errorOf(await setAllowance(party, 0))).toEqual({ status: 409, code: 'veto_allowance_below_spent' })
      expect((await setAllowance(party, 1)).status).toBe(200)
    })

    it('stays 0 before any Veto is cast', async () => {
      const party = await running({ allowance: 3 })

      expect((await read(party)).settingsFloors?.vetoAllowance).toBe(0)
    })
  })
})
