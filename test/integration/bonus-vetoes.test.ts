import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import grantBonusVeto from '../../server/api/e/[slug]/bonus-vetoes.post'
import castVeto from '../../server/api/e/[slug]/draws/[drawId]/veto.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import spinWheel from '../../server/api/e/[slug]/rounds/spin.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import { activity, bonusVetoes, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityPage } from '../../shared/activity'
import type { BonusVetoGranted, EventView } from '../../shared/event'
import { BONUS_VETO_MAX, VETO_WINDOW_MS } from '../../shared/rounds'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { startRunningSession } from './running-session'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Bonus Vetoes (#233, spec #218 § Bonus Vetoes): the Host grants a Party one, through the HTTP API with the in-memory room and a test
// clock. The rules are unit-tested in rounds.test.ts; this file checks what a Host, a Member and the Event read observe.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const SLOT = '2090-10-30T20:30'
const T0 = '2090-10-30T10:00:00.000Z'
// A draw starts a lead after its spin, stops after 6 s, and its Veto window (when one opens) runs 60 s past the stop.
const LEAD = 1500
const STOP = LEAD + 6000
const END = STOP + VETO_WINDOW_MS

describe('Bonus Vetoes (#233)', () => {
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
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/rounds/spin': spinWheel,
      'POST /api/e/:slug/draws/:drawId/veto': castVeto,
      'POST /api/e/:slug/bonus-vetoes': grantBonusVeto,
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
    await testDb.db.delete(vetoes)
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
   * A Running Session (or only an Event, with `started: false`) of a Lucky Wheel Event, or of a Host pick one with `mode`: one Player in
   * each of two Parties, four games in the Game pool, the Veto allowance `allowance` (Lucky Wheel only).
   */
  async function event({ mode = 'lucky_wheel', allowance = 1, started = true }: { mode?: 'lucky_wheel' | 'admin_pick', allowance?: number, started?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const one = (await signIn(testDb.db, players.one)).cookie
    const two = (await signIn(testDb.db, players.two)).cookie
    const created = await send('POST', '/api/e', hostCookie, {
      name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: [SLOT],
      settings: { ...TEST_SETTINGS, teamSize: 1, selectionMode: mode, vetoAllowance: mode === 'lucky_wheel' ? allowance : null },
    })
    expect(created.status).toBe(200)
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const [hostRow] = await testDb.db.select().from(users).where(eq(users.email, host.email))
    for (const profile of [players.one, players.two]) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: row!.id })
    }
    const inserted = await testDb.db.insert(games).values([
      { name: 'Halo', createdBy: hostRow!.id },
      { name: 'Kart', createdBy: hostRow!.id },
      { name: 'Dart', createdBy: hostRow!.id },
      { name: 'Uno', createdBy: hostRow!.id },
    ]).returning()
    await testDb.db.insert(eventPoolGames).values(inserted.map(game => ({ eventId: eventRow!.id, gameId: game.id, pool: 'main' as const })))
    if (started) await startRunningSession(request, testDb.db, { slug, hostCookie, seated: [{ cookie: one, email: players.one.email }, { cookie: two, email: players.two.email }] })
    notifier.clear()
    return { slug, eventId: eventRow!.id, hostCookie, one, two }
  }

  type Party = Awaited<ReturnType<typeof event>>

  const grant = (party: Party, team: number, cookie = party.hostCookie) => send('POST', `/api/e/${party.slug}/bonus-vetoes`, cookie, { team })
  const read = async (party: Party, cookie = party.hostCookie) => await (await send('GET', `/api/e/${party.slug}`, cookie)).json() as EventView
  const spin = (party: Party) => send('POST', `/api/e/${party.slug}/rounds/spin`, party.hostCookie)
  const cast = (party: Party, drawId: string, cookie: string) => send('POST', `/api/e/${party.slug}/draws/${drawId}/veto`, cookie)
  const feedOf = async (party: Party, cookie: string) => (await (await send('GET', `/api/e/${party.slug}/activity`, cookie)).json() as ActivityPage).entries
  const bonusRows = (party: Party) => testDb.db.select().from(bonusVetoes).where(eq(bonusVetoes.eventId, party.eventId))

  /** Spins and answers the draw's id. */
  async function spun(party: Party) {
    const response = await spin(party)
    expect(response.status).toBe(200)
    return await response.json() as { roundId: string, drawId: string }
  }

  it('is the Host only: a Member gets 403 and nothing is granted', async () => {
    const party = await event()

    expect(await errorOf(await grant(party, 1, party.one))).toEqual({ status: 403, code: 'not_host' })
    expect(await bonusRows(party)).toEqual([])
  })

  it('is the Lucky Wheel only: under Host pick the grant is refused with no_wheel', async () => {
    const party = await event({ mode: 'admin_pick' })

    expect(await errorOf(await grant(party, 1))).toEqual({ status: 409, code: 'no_wheel' })
    expect(await bonusRows(party)).toEqual([])
    expect((await read(party)).bonusVetoes).toBeNull()
  })

  it('answers a team the Event does not have, or a body without one, with invalid_value', async () => {
    const party = await event()

    expect(await errorOf(await grant(party, 3))).toEqual({ status: 400, code: 'invalid_value' })
    expect(await errorOf(await grant(party, 0))).toEqual({ status: 400, code: 'invalid_value' })
    expect(await errorOf(await send('POST', `/api/e/${party.slug}/bonus-vetoes`, party.hostCookie, {}))).toEqual({ status: 400, code: 'invalid_value' })
    expect(await bonusRows(party)).toEqual([])
  })

  it(`stops at ${BONUS_VETO_MAX} for one Party, with the reason on the tenth, while another Party may still get one`, async () => {
    const party = await event()

    for (let granted = 1; granted <= BONUS_VETO_MAX; granted += 1) {
      const response = await grant(party, 1)
      expect(response.status).toBe(200)
      expect(await response.json() as BonusVetoGranted).toEqual({ team: 1, granted })
    }
    expect(await errorOf(await grant(party, 1))).toEqual({ status: 409, code: 'bonus_veto_limit' })
    expect(await grant(party, 2).then(response => response.json())).toEqual({ team: 2, granted: 1 })

    expect((await read(party)).bonusVetoes).toEqual({ granted: [BONUS_VETO_MAX, 1], rejection: null })
    expect(await bonusRows(party)).toHaveLength(BONUS_VETO_MAX + 1)
  })

  it('is refused once the Event has finished, and the Host learns the reason from the read', async () => {
    const party = await event()
    await testDb.db.update(events).set({ phase: 'finished' }).where(eq(events.id, party.eventId))

    expect(await errorOf(await grant(party, 1))).toEqual({ status: 409, code: 'wrong_phase' })
    expect((await read(party)).bonusVetoes).toEqual({ granted: [0, 0], rejection: 'wrong_phase' })
    expect(await bonusRows(party)).toEqual([])
  })

  it('is usable at once inside an open veto window: a Party with no Veto left gets one and casts it on the open draw', async () => {
    const party = await event({ allowance: 1 })
    // Draw 1: both Parties have a Veto, so the window opens. Party 1 spends its one Veto on it.
    const first = await spun(party)
    clock.advance(STOP)
    expect((await cast(party, first.drawId, party.one)).status).toBe(200)
    // The window ends: the draw is vetoed, and the Round waits for a respin. Draw 2 opens a window too (Party 2 still has its Veto).
    clock.advance(END - STOP)
    await read(party)
    const second = await spun(party)
    clock.advance(STOP)
    expect(await errorOf(await cast(party, second.drawId, party.one))).toEqual({ status: 409, code: 'no_vetoes_left' })
    expect((await read(party, party.one)).wheel?.vetoes.left).toEqual([0, 1])

    expect((await grant(party, 1)).status).toBe(200)

    expect((await read(party, party.one)).wheel?.vetoes.left).toEqual([1, 1])
    expect((await cast(party, second.drawId, party.one)).status).toBe(200)
    expect((await read(party, party.one)).wheel?.vetoes.left).toEqual([0, 1])
  })

  it('is written to the feed as an entry that names the Party, for a Member, and reaches the room as a change', async () => {
    const party = await event()

    expect((await grant(party, 2)).status).toBe(200)

    const entries = await feedOf(party, party.one)
    expect(entries.filter(entry => entry.type === 'bonus_veto_granted')).toMatchObject([{ type: 'bonus_veto_granted', params: { team: 2 }, actor: { name: 'Hostess' } }])
    expect(notifier.messages(party.eventId).map(message => message.type)).toEqual(['event.changed', 'activity.added'])
  })

  it('shows the Host how many each Party has, and a Member nothing', async () => {
    const party = await event()
    await grant(party, 1)
    await grant(party, 1)
    await grant(party, 2)

    expect((await read(party)).bonusVetoes).toEqual({ granted: [2, 1], rejection: null })
    expect((await read(party, party.one)).bonusVetoes).toBeNull()
  })

  it('shows the Host no Bonus Veto without a Lucky Wheel, and the Parties of a Lucky Wheel Event before its first Session starts too', async () => {
    const adminPick = await event({ mode: 'admin_pick' })
    const unstarted = await event({ started: false })

    expect((await read(adminPick)).bonusVetoes).toBeNull()
    expect((await read(unstarted)).bonusVetoes).toEqual({ granted: [0, 0], rejection: null })
  })
})
