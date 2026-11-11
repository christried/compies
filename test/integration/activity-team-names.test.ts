import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityEntry, ActivityType } from '../../shared/activity'
import { createTestApp, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { clockToEnd, clockToStop, hostEntersResult, hostFinishes, hostSets, hostSpins, playerVetoes, readEvent, readFeed, startRunningEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// The Activity feed names a team the way it was called in that moment (#440, ADR 0016, GLOSSARY: Activity feed): every entry that names a team
// stores that Team name in `params.teamNames`, keyed by the team's position, and nothing rewrites it afterwards. Through the HTTP API with the
// in-memory room and a test clock.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  a: { provider: 'discord', id: '2', name: 'Eins', email: 'a@example.com', image: undefined },
  b: { provider: 'discord', id: '3', name: 'Zwei', email: 'b@example.com', image: undefined },
  c: { provider: 'twitch', id: '4', name: 'Drei', email: 'c@example.com', image: undefined },
  d: { provider: 'twitch', id: '5', name: 'Vier', email: 'd@example.com', image: undefined },
  e: { provider: 'twitch', id: '6', name: 'Fuenf', email: 'e@example.com', image: undefined },
} as const
const T0 = '2090-10-30T10:00:00.000Z'
const GAME_NAMES = ['Halo', 'Kart', 'Dart', 'Uno'] as const
const wheel = { teamCount: 2, teamSize: 3, gameCount: 6, selectionMode: 'lucky_wheel', vetoAllowance: 2, hiddenWheel: false } as const
const hostPick = { teamCount: 2, teamSize: 3, gameCount: 2, selectionMode: 'admin_pick', vetoAllowance: null } as const

describe('The Activity feed names a team as it was called then (#440)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock })
    rig = { request, db: testDb.db, clock, notifier }
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
  afterEach(() => vi.unstubAllEnvs())

  const send = sendVia(() => request)

  /** Team 1: Eins and Zwei with the words „Wilde“ and „Gurken“ (in the order they joined), team 2: Drei and Vier without words, Fuenf on the Stands. */
  async function party(settings: Record<string, unknown> = wheel) {
    const ev = await startRunningEvent(rig, {
      host, players, seats: [['a', 1], ['b', 1], ['c', 2], ['d', 2], ['e', 'stands']], settings, quiet: 'room-and-feed',
      games: GAME_NAMES.map(name => ({ key: name, values: { name }, pool: true })),
    })
    await word(ev, ev.players.a.cookie, 'Wilde')
    await word(ev, ev.players.b.cookie, 'Gurken')
    return ev
  }
  type Party = Awaited<ReturnType<typeof party>>

  async function word(ev: Pick<Party, 'slug'>, cookie: string, value: string) {
    expect((await send('POST', `/api/e/${ev.slug}/team-word`, cookie, { word: value })).status).toBe(200)
  }
  const move = (ev: Party, who: keyof typeof players, to: unknown, as: 'host' | keyof typeof players = 'host') =>
    send('POST', `/api/e/${ev.slug}/move`, as === 'host' ? ev.host.cookie : ev.players[as].cookie, { userId: ev.players[who].id, to })
  const reset = (ev: Party, position: number) => send('POST', `/api/e/${ev.slug}/teams/${position}/reset-name`, ev.host.cookie)
  /** The entries of a type, oldest first. */
  async function entries<T extends ActivityType>(ev: Party, type: T) {
    return (await readFeed(rig, ev.players.a.cookie, ev.slug, 'limit=100')).filter(entry => entry.type === type).reverse() as Extract<ActivityEntry, { type: T }>[]
  }

  describe('stores the name the team had, for each kind that names a team', () => {
    it('member_moved: the team the Player goes to, never the one they leave; a move to the Stands stores an empty map', async () => {
      const ev = await party()

      expect((await move(ev, 'e', { zone: 'team', team: 1 })).status).toBe(200)
      expect((await move(ev, 'a', { zone: 'stands' })).status).toBe(200)
      expect((await move(ev, 'd', { zone: 'stands' })).status).toBe(200)
      expect((await move(ev, 'd', { zone: 'team', team: 2 })).status).toBe(200)

      const moves = (await entries(ev, 'member_moved')).map(entry => entry.params.teamNames)
      // Fuenf joins „Wilde Gurken“; Eins (who gave „Wilde“) leaves for the Stands, and nothing is named; Vier leaves team 2 and comes back to a team without words.
      expect(moves).toEqual([{ 1: 'Wilde Gurken' }, {}, {}, { 2: null }])
    })

    it('team_name_reset: the name it removed before the clear, null for a team that had no words', async () => {
      const ev = await party()

      expect((await reset(ev, 1)).status).toBe(200)
      expect((await reset(ev, 1)).status).toBe(200)
      expect((await reset(ev, 2)).status).toBe(200)

      expect((await entries(ev, 'team_name_reset')).map(entry => entry.params)).toEqual([
        { team: 1, teamNames: { 1: 'Wilde Gurken' } },
        { team: 1, teamNames: { 1: null } },
        { team: 2, teamNames: { 2: null } },
      ])
    })

    it('bonus_veto_granted: the name before the grant', async () => {
      const ev = await party()

      expect((await send('POST', `/api/e/${ev.slug}/bonus-vetoes`, ev.host.cookie, { team: 1 })).status).toBe(200)
      expect((await send('POST', `/api/e/${ev.slug}/bonus-vetoes`, ev.host.cookie, { team: 2 })).status).toBe(200)

      expect((await entries(ev, 'bonus_veto_granted')).map(entry => entry.params)).toEqual([
        { team: 1, teamNames: { 1: 'Wilde Gurken' } },
        { team: 2, teamNames: { 2: null } },
      ])
    })

    it('vetoes_revealed: the casting Parties only, written at the end of the window and not before', async () => {
      const ev = await party()
      const { drawId } = await hostSpins(rig, ev)
      await clockToStop(rig, drawId)
      await playerVetoes(rig, ev, drawId, ev.players.a)

      // The cast writes nothing: the window is sealed, and so is its entry.
      expect(await entries(ev, 'vetoes_revealed')).toEqual([])
      expect(await testDb.db.select().from(activity)).not.toContainEqual(expect.objectContaining({ type: 'vetoes_revealed' }))
      await clockToEnd(rig, drawId)

      const [reveal, ...more] = await entries(ev, 'vetoes_revealed')
      expect(more).toEqual([])
      expect(reveal!.params).toMatchObject({ vetoes: [{ team: 1 }], teamNames: { 1: 'Wilde Gurken' } })
      // Party 2 cast none: its name is not in the entry.
      expect(Object.keys(reveal!.params.teamNames!)).toEqual(['1'])
    })

    it('result_entered: the first Party, or every Party on Place 1', async () => {
      const ev = await party(hostPick)
      const first = await hostSets(rig, ev, ev.games.Halo.id)
      await hostEntersResult(rig, ev, first, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      const second = await hostSets(rig, ev, ev.games.Kart.id)
      await hostEntersResult(rig, ev, second, [{ team: 1, place: 1 }, { team: 2, place: 1 }])

      expect((await entries(ev, 'result_entered')).map(entry => entry.params)).toMatchObject([
        { first: [1], teamNames: { 1: 'Wilde Gurken' } },
        { first: [1, 2], teamNames: { 1: 'Wilde Gurken', 2: null } },
      ])
    })

    it('result_corrected: stores no name, its sentence names no team', async () => {
      const ev = await party(hostPick)
      const round = await hostSets(rig, ev, ev.games.Halo.id)
      await hostEntersResult(rig, ev, round, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      await hostEntersResult(rig, ev, round, [{ team: 1, place: 2 }, { team: 2, place: 1 }])

      const [correction] = await entries(ev, 'result_corrected')
      expect(correction).toBeDefined()
      expect(correction!.params).not.toHaveProperty('teamNames')
    })

    it('event_finished: the winner, or every Party of a Tie', async () => {
      const winner = await party(hostPick)
      const one = await hostSets(rig, winner, winner.games.Halo.id)
      await hostEntersResult(rig, winner, one, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      const two = await hostSets(rig, winner, winner.games.Kart.id)
      await hostEntersResult(rig, winner, two, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      await hostFinishes(rig, winner, { outcome: 'winner', winners: [1] })

      expect((await entries(winner, 'event_finished'))[0]!.params).toEqual({ winners: [1], teamNames: { 1: 'Wilde Gurken' } })

      await resetDatabase(testDb.db)
      const tie = await party(hostPick)
      const three = await hostSets(rig, tie, tie.games.Halo.id)
      await hostEntersResult(rig, tie, three, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      const four = await hostSets(rig, tie, tie.games.Kart.id)
      await hostEntersResult(rig, tie, four, [{ team: 1, place: 2 }, { team: 2, place: 1 }])
      await hostFinishes(rig, tie, { outcome: 'tie', winners: [1, 2] })

      expect((await entries(tie, 'event_finished'))[0]!.params).toEqual({ winners: [1, 2], teamNames: { 1: 'Wilde Gurken', 2: null } })
    })
  })

  describe('after a change', () => {
    it('keeps the old name in the old entry and gives the next entry the new one, while the Event read shows the current name', async () => {
      const ev = await party()
      expect((await move(ev, 'e', { zone: 'team', team: 1 })).status).toBe(200)

      await word(ev, ev.players.a.cookie, 'Neue')
      const view = await readEvent(rig, ev.players.c.cookie, ev.slug)
      expect((await reset(ev, 1)).status).toBe(200)

      expect(view.teams.find(team => team.position === 1)?.name).toBe('Neue Gurken')
      expect((await readEvent(rig, ev.players.c.cookie, ev.slug)).teams.find(team => team.position === 1)?.name).toBeNull()
      expect((await entries(ev, 'member_moved')).map(entry => entry.params.teamNames)).toEqual([{ 1: 'Wilde Gurken' }])
      expect((await entries(ev, 'team_name_reset')).map(entry => entry.params.teamNames)).toEqual([{ 1: 'Neue Gurken' }])
    })

    it('keeps the word in an old entry when its Player leaves the team or changes it (the Datenschutzerklärung says it stays)', async () => {
      const ev = await party()
      expect((await reset(ev, 1)).status).toBe(200)
      await word(ev, ev.players.a.cookie, 'Wilde')
      await word(ev, ev.players.b.cookie, 'Gurken')
      expect((await send('POST', `/api/e/${ev.slug}/bonus-vetoes`, ev.host.cookie, { team: 1 })).status).toBe(200)

      expect((await move(ev, 'a', { zone: 'stands' })).status).toBe(200)
      await word(ev, ev.players.b.cookie, 'Anders')
      expect((await reset(ev, 1)).status).toBe(200)

      expect((await entries(ev, 'bonus_veto_granted')).map(entry => entry.params.teamNames)).toEqual([{ 1: 'Wilde Gurken' }])
      expect((await entries(ev, 'team_name_reset')).map(entry => entry.params.teamNames)).toEqual([{ 1: 'Wilde Gurken' }, { 1: 'Anders' }])
      expect((await readEvent(rig, ev.players.c.cookie, ev.slug)).teams.find(team => team.position === 1)?.name).toBeNull()
    })

    it('publishes the entry to the room with the same names as the feed holds, and a Team word change still writes and publishes no entry', async () => {
      const ev = await party()
      notifier.clear()

      await word(ev, ev.players.a.cookie, 'Neue')
      expect(notifier.messages(ev.eventId).filter(message => message.type === 'activity.added')).toEqual([])
      expect(await entries(ev, 'team_name_reset')).toEqual([])

      expect((await reset(ev, 1)).status).toBe(200)

      const added = notifier.messages(ev.eventId).flatMap(message => (message.type === 'activity.added' ? [message.entry] : []))
      expect(added).toHaveLength(1)
      expect(added[0]!.params).toEqual({ team: 1, teamNames: { 1: 'Neue Gurken' } })
      expect((await entries(ev, 'team_name_reset'))[0]!.params).toEqual(added[0]!.params)
    })
  })

  describe('a Veto reveal', () => {
    it('keeps its names and still loses a caster a stored row holds (the cut of #355 rebuilds `vetoes`, and `teamNames` sits beside it)', async () => {
      const ev = await party()
      await testDb.db.insert(activity).values({
        eventId: ev.eventId, type: 'vetoes_revealed', actorId: null, at: new Date(new Date(T0).getTime() - 1000),
        params: { roundId: 'r', drawId: 'd', gameId: ev.games.Halo.id, vetoes: [{ team: 1, userId: ev.players.a.id }], teamNames: { 1: 'Wilde Gurken' } } as never,
      })

      const feed = await readFeed(rig, ev.players.c.cookie, ev.slug)

      const entry = feed.find(item => item.type === 'vetoes_revealed')
      expect(entry!.params).toMatchObject({ vetoes: [{ team: 1 }], teamNames: { 1: 'Wilde Gurken' } })
      expect(JSON.stringify(entry)).not.toContain(ev.players.a.id)
    })
  })

  describe('an entry written without names', () => {
    it('is served as stored, with no name added, whatever the team is called now (the old deployment writes them while this one rolls out, and every 0.11 entry is one)', async () => {
      const ev = await party()
      const at = (offset: number) => new Date(new Date(T0).getTime() - offset)
      const rows = [
        { type: 'member_moved', params: { userId: ev.players.e.id, from: { zone: 'stands' }, to: { zone: 'team', team: 1 } } },
        { type: 'team_name_reset', params: { team: 1 } },
        { type: 'bonus_veto_granted', params: { team: 1 } },
        { type: 'vetoes_revealed', params: { roundId: 'r', drawId: 'd', gameId: ev.games.Halo.id, vetoes: [{ team: 1 }] } },
        { type: 'result_entered', params: { roundId: 'r', number: 1, gameId: ev.games.Halo.id, first: [1] } },
        { type: 'event_finished', params: { winners: [1] } },
      ] as const
      await testDb.db.insert(activity).values(rows.map((row, index) => ({ eventId: ev.eventId, actorId: ev.host.id, at: at(1000 * (index + 1)), ...row }) as never))

      const feed = await readFeed(rig, ev.players.c.cookie, ev.slug, 'limit=100')

      for (const row of rows) {
        const entry = feed.find(item => item.type === row.type)
        expect(entry, row.type).toBeDefined()
        expect(entry!.params, row.type).toEqual(row.params)
      }
      // The Event read names the team as it is called now: the live half of „absent“ is the client's (test/nuxt/activity-feed.test.ts).
      expect((await readEvent(rig, ev.players.c.cookie, ev.slug)).teams.find(team => team.position === 1)?.name).toBe('Wilde Gurken')
    })
  })
})
