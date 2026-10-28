import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import createGame from '../../server/api/games/index.post'
import joinInvite from '../../server/api/invite/[invite].post'
import { eventMembers, eventPoolGames, events, games, users } from '../../server/db/schema'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { GameView } from '../../shared/game'
import { settingsFromRow, type EventSettings } from '../../shared/settings'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Host changes an Event's settings and pools after creating it (#147).

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const outsider = { provider: 'discord', id: '4', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

describe('changing the settings of an Event (#147)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  let hostCookie: string
  let memberCookie: string

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/games': createGame,
      'POST /api/invite/:invite': joinInvite,
    })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1', admins: 'discord:9' })
    await testDb.db.delete(eventPoolGames)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(games)
    await testDb.db.delete(users)
    hostCookie = (await signIn(testDb.db, host)).cookie
    memberCookie = (await signIn(testDb.db, member)).cookie
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const json = (cookie: string) => ({ 'content-type': 'application/json', cookie })

  async function newGame(name: string) {
    const response = await request('/api/games', { method: 'POST', headers: json(hostCookie), body: JSON.stringify({ name }) })
    expect(response.status).toBe(200)
    return await response.json() as GameView
  }

  async function createdEvent(body: Record<string, unknown> = {}) {
    const response = await request('/api/e', {
      method: 'POST',
      headers: json(hostCookie),
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS, ...body }),
    })
    expect(response.status).toBe(200)
    const { slug, inviteUrl } = await response.json() as CreatedEvent
    const joined = await request(`/api/invite/${new URL(inviteUrl).pathname.slice('/e/'.length)}`, { method: 'POST', headers: { cookie: memberCookie } })
    expect(joined.status).toBe(200)
    return slug
  }

  function patch(slug: string, body: unknown, cookie = hostCookie) {
    return request(`/api/e/${slug}/settings`, { method: 'PATCH', headers: json(cookie), body: JSON.stringify(body) })
  }

  async function read(slug: string, cookie = hostCookie) {
    const response = await request(`/api/e/${slug}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return await response.json() as EventView
  }

  async function row(slug: string) {
    const [found] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return found!
  }

  async function setPhase(slug: string, phase: 'draft' | 'date_set' | 'running' | 'finished') {
    await testDb.db.update(events).set({ phase }).where(eq(events.slug, slug))
  }

  async function poolOf(slug: string, pool: 'main' | 'tiebreaker') {
    const { id } = await row(slug)
    return (await testDb.db.select().from(eventPoolGames).where(eq(eventPoolGames.eventId, id))).filter(entry => entry.pool === pool).map(entry => entry.gameId)
  }

  const luckyWheel: EventSettings = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 3 }

  describe('before the first Session', () => {
    it('stores a new Game count, Team size, Veto allowance and Hidden wheel, and answers with the new settings', async () => {
      const slug = await createdEvent({ settings: luckyWheel })

      const response = await patch(slug, { settings: { gameCount: 6, teamSize: 4, vetoAllowance: 5, hiddenWheel: true } })

      const expected = { ...luckyWheel, gameCount: 6, teamSize: 4, vetoAllowance: 5, hiddenWheel: true }
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ settings: expected })
      expect(settingsFromRow(await row(slug))).toEqual(expected)
      expect((await read(slug)).settings).toEqual(expected)
    })

    it('lets the Host change teams, points and Selection mode too', async () => {
      const slug = await createdEvent()

      const response = await patch(slug, {
        settings: { teamCount: 3, pointsTable: { preset: 'linear', values: [2, 1, 0] }, selectionMode: 'lucky_wheel', hiddenWheel: true },
      })

      expect(response.status).toBe(200)
      expect(settingsFromRow(await row(slug))).toMatchObject({ teamCount: 3, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 })
    })

    it('refuses wheel options sent to an Admin pick Event instead of answering 200 and storing false', async () => {
      const slug = await createdEvent()

      for (const settings of [{ hiddenWheel: true }, { vetoAllowance: 3 }]) {
        const response = await patch(slug, { settings })
        expect(response.status).toBe(400)
        expect(response.statusText).toBe('wheel_options_without_wheel')
      }
      expect(settingsFromRow(await row(slug))).toEqual(TEST_SETTINGS)
    })

    it('switches a Lucky Wheel Event to Admin pick without wheel keys and drops its wheel options', async () => {
      const slug = await createdEvent({ settings: { ...luckyWheel, hiddenWheel: true } })

      const response = await patch(slug, { settings: { selectionMode: 'admin_pick' } })

      expect(response.status).toBe(200)
      expect(settingsFromRow(await row(slug))).toEqual({ ...luckyWheel, selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null })
    })

    it('refuses a change that breaks a settings rule and keeps the row', async () => {
      const slug = await createdEvent()

      const response = await patch(slug, { settings: { gameCount: 99 } })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('game_count_range')
      expect(settingsFromRow(await row(slug))).toEqual(TEST_SETTINGS)
    })

    it('also works in the date_set Phase and while the Event is a draft', async () => {
      const slug = await createdEvent()
      for (const phase of ['date_set', 'draft'] as const) {
        await setPhase(slug, phase)
        expect((await patch(slug, { settings: { gameCount: 4 } })).status).toBe(200)
      }
    })
  })

  describe('pools', () => {
    it('replaces only the pool that is given', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')
      const chess = await newGame('Schach')
      const slug = await createdEvent({ pools: { main: [kart.id], tiebreaker: [pong.id] } })

      const response = await patch(slug, { settings: TEST_SETTINGS, pools: { main: [pong.id, chess.id] } })

      expect(response.status).toBe(200)
      expect((await poolOf(slug, 'main')).sort()).toEqual([pong.id, chess.id].sort())
      expect(await poolOf(slug, 'tiebreaker')).toEqual([pong.id])
    })

    it('empties a pool given as an empty list', async () => {
      const kart = await newGame('Mario Kart')
      const slug = await createdEvent({ pools: { main: [kart.id], tiebreaker: [kart.id] } })

      expect((await patch(slug, { pools: { tiebreaker: [] } })).status).toBe(200)

      expect(await poolOf(slug, 'main')).toEqual([kart.id])
      expect(await poolOf(slug, 'tiebreaker')).toEqual([])
    })

    it('changes settings and pools together', async () => {
      const kart = await newGame('Mario Kart')
      const slug = await createdEvent()

      const response = await patch(slug, { settings: { gameCount: 3 }, pools: { main: [kart.id] } })

      expect(response.status).toBe(200)
      expect((await row(slug)).gameCount).toBe(3)
      expect(await poolOf(slug, 'main')).toEqual([kart.id])
    })

    it('refuses an unknown game with unknown_game and changes nothing, settings included', async () => {
      const kart = await newGame('Mario Kart')
      const slug = await createdEvent({ pools: { main: [kart.id] } })

      const response = await patch(slug, { settings: { gameCount: 3 }, pools: { main: ['00000000-0000-4000-8000-000000000000'] } })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('unknown_game')
      expect(await poolOf(slug, 'main')).toEqual([kart.id])
      expect((await row(slug)).gameCount).toBe(10)
    })

    it('shows the games to a Member once the Hidden wheel is switched off, and hides them again when it is switched on', async () => {
      const kart = await newGame('Mario Kart')
      const slug = await createdEvent({ settings: { ...luckyWheel, hiddenWheel: true }, pools: { main: [kart.id], tiebreaker: [] } })
      expect((await read(slug, memberCookie)).pools).toEqual({ hidden: true, mainCount: 1, tiebreakerCount: 0 })

      expect((await patch(slug, { settings: { hiddenWheel: false } })).status).toBe(200)
      const revealed = (await read(slug, memberCookie)).pools
      expect(revealed.hidden).toBe(false)
      expect(JSON.stringify(revealed)).toContain('Mario Kart')

      expect((await patch(slug, { settings: { hiddenWheel: true } })).status).toBe(200)
      const hiddenAgain = await request(`/api/e/${slug}`, { headers: { cookie: memberCookie } })
      const raw = await hiddenAgain.text()
      expect(JSON.parse(raw).pools).toEqual({ hidden: true, mainCount: 1, tiebreakerCount: 0 })
      expect(raw).not.toContain('Mario Kart')
      expect(raw).not.toContain(kart.id)
    })

    it('refuses a malformed pool with invalid_pools', async () => {
      const slug = await createdEvent()

      const response = await patch(slug, { pools: { main: ['nope'] } })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_pools')
    })
  })

  describe('while the Event is running', () => {
    it.each([
      ['Format', { format: 'ffa' }],
      ['team count', { teamCount: 3, pointsTable: { preset: 'linear', values: [2, 1, 0] } }],
      ['points table', { pointsTable: { preset: 'winner_takes_all', values: [1, 0] } }],
      ['Selection mode', { selectionMode: 'lucky_wheel' }],
    ])('refuses a new %s with setting_locked and keeps the row', async (_name, change) => {
      const slug = await createdEvent()
      await setPhase(slug, 'running')

      const response = await patch(slug, { settings: change })

      expect(response.status).toBe(409)
      expect(response.statusText).toBe('setting_locked')
      expect(settingsFromRow(await row(slug))).toEqual(TEST_SETTINGS)
    })

    it('accepts the locked values unchanged together with a new Game count', async () => {
      const slug = await createdEvent()
      await setPhase(slug, 'running')

      const response = await patch(slug, { settings: { ...TEST_SETTINGS, gameCount: 5 } })

      expect(response.status).toBe(200)
      expect(settingsFromRow(await row(slug))).toEqual({ ...TEST_SETTINGS, gameCount: 5 })
    })

    it('still changes Team size, Veto allowance, Hidden wheel and the pools', async () => {
      const kart = await newGame('Mario Kart')
      const slug = await createdEvent({ settings: luckyWheel })
      await setPhase(slug, 'running')

      const response = await patch(slug, { settings: { teamSize: 2, vetoAllowance: 1, hiddenWheel: true }, pools: { tiebreaker: [kart.id] } })

      expect(response.status).toBe(200)
      expect(settingsFromRow(await row(slug))).toEqual({ ...luckyWheel, teamSize: 2, vetoAllowance: 1, hiddenWheel: true })
      expect(await poolOf(slug, 'tiebreaker')).toEqual([kart.id])
    })
  })

  describe('after the Event is finished', () => {
    it('refuses everything with wrong_phase, pools included', async () => {
      const kart = await newGame('Mario Kart')
      const slug = await createdEvent()
      await setPhase(slug, 'finished')

      for (const body of [{ settings: { gameCount: 5 } }, { pools: { main: [kart.id] } }]) {
        const response = await patch(slug, body)
        expect(response.status).toBe(409)
        expect(response.statusText).toBe('wrong_phase')
      }
      expect(await poolOf(slug, 'main')).toEqual([])
      expect((await row(slug)).gameCount).toBe(10)
    })
  })

  describe('who may change them', () => {
    it('answers a Member with 403 not_host', async () => {
      const slug = await createdEvent()

      const response = await patch(slug, { settings: { gameCount: 5 } }, memberCookie)

      expect(response.status).toBe(403)
      expect(response.statusText).toBe('not_host')
      expect((await row(slug)).gameCount).toBe(10)
    })

    it('answers a non-Member with 404, like any Event link', async () => {
      const slug = await createdEvent()
      const { cookie } = await signIn(testDb.db, outsider)

      const response = await patch(slug, { settings: { gameCount: 5 } }, cookie)

      expect(response.status).toBe(404)
    })
  })

  describe('an Event from before 1.3 (not set up)', () => {
    async function oldEvent() {
      const [hostRow] = await testDb.db.select().from(users).where(eq(users.email, host.email))
      const [memberRow] = await testDb.db.select().from(users).where(eq(users.email, member.email))
      const [created] = await testDb.db.insert(events).values({ slug: 'freitags-poll', inviteToken: 'tokenpoll00001', hostId: hostRow!.id, name: 'Freitags-Poll', phase: 'poll' }).returning()
      await testDb.db.insert(eventMembers).values([{ eventId: created!.id, userId: hostRow!.id }, { eventId: created!.id, userId: memberRow!.id }])
      return created!.slug
    }

    it('refuses a partial change with invalid_settings', async () => {
      const slug = await oldEvent()

      const response = await patch(slug, { settings: { gameCount: 5 } })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_settings')
      expect(settingsFromRow(await row(slug))).toBeNull()
    })

    it('refuses pools without settings: it has to be set up first', async () => {
      const slug = await oldEvent()

      const response = await patch(slug, { pools: { main: [] } })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_settings')
    })

    it('is set up by a full payload, and reads as set up afterwards', async () => {
      const slug = await oldEvent()

      const response = await patch(slug, { settings: TEST_SETTINGS })

      expect(response.status).toBe(200)
      expect(settingsFromRow(await row(slug))).toEqual(TEST_SETTINGS)
      expect((await read(slug)).settings).toEqual(TEST_SETTINGS)
    })
  })

  describe('settingsFloors in GET /api/e/:slug', () => {
    it('gives the Host the floors and every other Member null', async () => {
      const slug = await createdEvent()

      expect((await read(slug)).settingsFloors).toEqual({ teamSize: 1, vetoAllowance: 0 })
      expect((await read(slug, memberCookie)).settingsFloors).toBeNull()
    })
  })
})
