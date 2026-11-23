import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventMembers, events, games, rounds, users } from '../../server/db/schema'
import type { ArchiveView } from '../../shared/archive'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostEntersResult, hostFinishes, hostSets, startRunningEvent, type Rig, type Signed } from './scenario'
import { setAllowlist, signIn, stubAuthEnv, type ProviderProfile } from './sign-in'

// The Archive list (#882, spec #683): `GET /api/archive` through the HTTP API. Every finished, not deleted Event the viewer is a Member
// of, newest Finish first, with its counts and the viewer's own part. One Event comes through the real finish (the scenario), the rest
// are rows inserted straight, as home.test.ts does, so a time or a settings column can be set exactly.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const one = { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined } as const
const two = { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined } as const
const three = { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined } as const
const four = { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined } as const
const stander = { provider: 'twitch', id: '6', name: 'Tribuene', email: 'stand@example.com', image: undefined } as const
const outsider = { provider: 'twitch', id: '7', name: 'Fremd', email: 'out@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Chefin', email: 'admin@example.com', image: undefined } as const

describe('GET /api/archive', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  let counter = 0

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db)
    rig = { request, db: testDb.db }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    counter = 0
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function signInAs(profile: ProviderProfile): Promise<Signed> {
    const { cookie } = await signIn(testDb.db, profile)
    const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email!))
    return { profile, cookie, id: row!.id }
  }

  function list(cookie: string | undefined) {
    return request('/api/archive', { headers: cookie ? { cookie } : {} })
  }

  async function read(cookie: string): Promise<ArchiveView> {
    const response = await list(cookie)
    expect(response.status).toBe(200)
    return await response.json() as ArchiveView
  }

  interface Inserted { eventId: string, slug: string, name: string }

  /**
   * A finished Event inserted straight: `finishedAt` and `createdAt` as given (`finishedAt: null` is the hand-edited row), its
   * settings columns 2 teams of 3 unless `settings` says null, and the Members with their seat (a team position or the Stands).
   */
  async function insertEvent(options: {
    hostId: string
    name?: string
    phase?: 'finished' | 'running'
    finishedAt?: Date | null
    createdAt?: Date
    deletedAt?: Date
    settings?: 'set' | 'null'
    members?: readonly { userId: string, team?: number }[]
    results?: number
    openRounds?: number
  }): Promise<Inserted> {
    counter += 1
    const name = options.name ?? `Archiv-Event ${counter}`
    const slug = `archiv-event-${counter}`
    const [row] = await testDb.db.insert(events).values({
      slug,
      inviteToken: `invite-${counter}`,
      hostId: options.hostId,
      name,
      phase: options.phase ?? 'finished',
      finishedAt: options.finishedAt === undefined ? new Date('2026-10-25T21:00:00Z') : options.finishedAt,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      ...(options.deletedAt ? { deletedAt: options.deletedAt } : {}),
      ...(options.settings === 'null' ? {} : { format: 'teams' as const, teamCount: 2, teamSize: 3 }),
    }).returning({ id: events.id })
    const eventId = row!.id
    await testDb.db.insert(eventMembers).values([{ eventId, userId: options.hostId }, ...(options.members ?? [])].map(member => ({
      eventId,
      userId: member.userId,
      ...('team' in member && member.team ? { zone: 'team' as const, team: member.team, teamJoinedAt: new Date('2026-10-20T18:00:00Z') } : {}),
    })))
    const results = options.results ?? 0
    if (results > 0 || options.openRounds) {
      const [game] = await testDb.db.insert(games).values({ name: `Spiel ${counter}`, createdBy: options.hostId }).returning({ id: games.id })
      const at = new Date('2026-10-25T19:00:00Z')
      for (let number = 1; number <= results; number++) {
        await testDb.db.insert(rounds).values({ eventId, gameId: game!.id, startedAt: at, setAt: at, number, resultAt: at })
      }
      // A Round set but without a Result (the finish ended the Session before its Result came).
      if (options.openRounds) await testDb.db.insert(rounds).values({ eventId, gameId: game!.id, startedAt: at, setAt: at })
    }
    return { eventId, slug, name }
  }

  it('requires a signed-in User', async () => {
    const response = await list(undefined)

    expect(response.status).toBe(401)
  })

  describe('what an entry holds', () => {
    it('lists an Event the Host really finished, for a seated Player and for the Host', async () => {
      const ev = await startRunningEvent(rig, {
        host,
        players: { one, two, three, four },
        seats: [['one', 1], ['two', 1], ['three', 2], ['four', 2]],
        sessions: 1,
        settings: { teamCount: 2, teamSize: 2, gameCount: 2, pointsTable: { preset: 'linear' as const, values: [1, 0] } },
        games: [{ key: 'halo', values: { name: 'Halo' }, pool: true }, { key: 'kart', values: { name: 'Kart' }, pool: true }],
        name: 'Freitags-Zocken',
      })
      for (const key of ['halo', 'kart'] as const) {
        const roundId = await hostSets(rig, ev, ev.games[key].id)
        await hostEntersResult(rig, ev, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      }
      await hostFinishes(rig, ev, { outcome: 'winner', winners: [1] })
      const [row] = await testDb.db.select().from(events).where(eq(events.slug, ev.slug))

      const player = await read(ev.players.one.cookie)
      const hosts = await read(ev.host.cookie)

      expect(player.events).toHaveLength(1)
      expect(player.events[0]).toMatchObject({
        slug: ev.slug,
        name: 'Freitags-Zocken',
        finishedAt: row!.finishedAt!.toISOString(),
        format: { teamCount: 2, teamSize: 2 },
        gameCount: 2,
        memberCount: 5,
        isHost: false,
        seated: true,
      })
      expect(hosts.events[0]).toMatchObject({ slug: ev.slug, isHost: true })
    })

    it('lists an Event for a Member on the Stands, who is not seated', async () => {
      const hostUser = await signInAs(host)
      const stands = await signInAs(stander)
      const seated = await signInAs(one)
      const ev = await insertEvent({ hostId: hostUser.id, members: [{ userId: seated.id, team: 1 }, { userId: stands.id }] })

      const view = await read(stands.cookie)

      expect(view.events).toHaveLength(1)
      expect(view.events[0]).toMatchObject({ slug: ev.slug, seated: false, isHost: false })
      expect((await read(seated.cookie)).events[0]).toMatchObject({ slug: ev.slug, seated: true })
    })

    it('reads the legacy bench zone as the Stands', async () => {
      const hostUser = await signInAs(host)
      const bench = await signInAs(stander)
      const ev = await insertEvent({ hostId: hostUser.id })
      await testDb.db.insert(eventMembers).values({ eventId: ev.eventId, userId: bench.id, zone: 'bench' })

      expect((await read(bench.cookie)).events[0]).toMatchObject({ seated: false })
    })

    it('lists an Event for a User who joined after the Finish', async () => {
      const hostUser = await signInAs(host)
      const late = await signInAs(stander)
      const ev = await insertEvent({ hostId: hostUser.id })
      await testDb.db.insert(eventMembers).values({ eventId: ev.eventId, userId: late.id })

      const view = await read(late.cookie)

      expect(view.events).toHaveLength(1)
      expect(view.events[0]).toMatchObject({ slug: ev.slug, seated: false })
    })

    it('counts only the Rounds with a Result as games, and every membership row including the Host as people', async () => {
      const hostUser = await signInAs(host)
      const a = await signInAs(one)
      const b = await signInAs(two)
      const c = await signInAs(stander)
      await insertEvent({ hostId: hostUser.id, members: [{ userId: a.id, team: 1 }, { userId: b.id, team: 2 }, { userId: c.id }], results: 3, openRounds: 1 })

      const view = await read(a.cookie)

      expect(view.events[0]).toMatchObject({ gameCount: 3, memberCount: 4 })
    })

    it('counts per Event, not across Events', async () => {
      const hostUser = await signInAs(host)
      const a = await signInAs(one)
      await insertEvent({ hostId: hostUser.id, members: [{ userId: a.id }], results: 2, finishedAt: new Date('2026-10-25T21:00:00Z') })
      await insertEvent({ hostId: hostUser.id, members: [{ userId: a.id }], results: 5, finishedAt: new Date('2026-10-24T21:00:00Z') })

      const view = await read(a.cookie)

      expect(view.events.map(entry => entry.gameCount)).toEqual([2, 5])
      expect(view.events.map(entry => entry.memberCount)).toEqual([2, 2])
    })

    it('answers format null for an Event whose settings were never set', async () => {
      const hostUser = await signInAs(host)
      await insertEvent({ hostId: hostUser.id, settings: 'null' })

      const view = await read(hostUser.cookie)

      expect(view.events[0]).toMatchObject({ format: null })
    })

    it('marks the Host on their own list only', async () => {
      const hostUser = await signInAs(host)
      const a = await signInAs(one)
      await insertEvent({ hostId: hostUser.id, members: [{ userId: a.id }] })

      expect((await read(hostUser.cookie)).events[0]).toMatchObject({ isHost: true })
      expect((await read(a.cookie)).events[0]).toMatchObject({ isHost: false })
    })
  })

  describe('which Events are listed', () => {
    it('answers an empty list for a User with no Events, and shows no trace of an Event they are no Member of', async () => {
      const hostUser = await signInAs(host)
      const fremd = await signInAs(outsider)
      const ev = await insertEvent({ hostId: hostUser.id, name: 'Geheimes Finale' })

      const response = await list(fremd.cookie)
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(JSON.parse(text)).toEqual({ events: [] })
      expect(text).not.toContain('Geheimes Finale')
      expect(text).not.toContain(ev.slug)
    })

    it('gives the Platform admin their own Events and nothing of the others', async () => {
      const hostUser = await signInAs(host)
      setAllowlist({ admins: `${admin.provider}:${admin.id}` })
      const chef = await signInAs(admin)
      const own = await insertEvent({ hostId: hostUser.id, name: 'Mit der Chefin', members: [{ userId: chef.id }] })
      const other = await insertEvent({ hostId: hostUser.id, name: 'Ohne die Chefin' })

      const response = await list(chef.cookie)
      const text = await response.text()

      expect((JSON.parse(text) as ArchiveView).events.map(entry => entry.slug)).toEqual([own.slug])
      expect(text).not.toContain(other.name)
      expect(text).not.toContain(other.slug)
    })

    it('gives the Platform admin who is no Member nothing, and no trace of the Event', async () => {
      const hostUser = await signInAs(host)
      setAllowlist({ admins: `${admin.provider}:${admin.id}` })
      const chef = await signInAs(admin)
      const other = await insertEvent({ hostId: hostUser.id, name: 'Ohne die Chefin' })

      const response = await list(chef.cookie)
      const text = await response.text()

      expect(JSON.parse(text)).toEqual({ events: [] })
      expect(text).not.toContain(other.name)
      expect(text).not.toContain(other.slug)
    })

    it('leaves out a running Event and a deleted one', async () => {
      const hostUser = await signInAs(host)
      const running = await insertEvent({ hostId: hostUser.id, name: 'Läuft noch', phase: 'running', finishedAt: null })
      const deleted = await insertEvent({ hostId: hostUser.id, name: 'Gelöscht', deletedAt: new Date('2026-10-26T10:00:00Z') })
      const kept = await insertEvent({ hostId: hostUser.id, name: 'Bleibt' })

      const view = await read(hostUser.cookie)

      expect(view.events.map(entry => entry.slug)).toEqual([kept.slug])
      expect(JSON.stringify(view)).not.toContain(running.slug)
      expect(JSON.stringify(view)).not.toContain(deleted.slug)
    })

    it('lists 0, 1 and 2 Events', async () => {
      const hostUser = await signInAs(host)
      expect(await read(hostUser.cookie)).toEqual({ events: [] })

      await insertEvent({ hostId: hostUser.id })
      expect((await read(hostUser.cookie)).events).toHaveLength(1)

      await insertEvent({ hostId: hostUser.id, finishedAt: new Date('2026-10-26T21:00:00Z') })
      expect((await read(hostUser.cookie)).events).toHaveLength(2)
    })
  })

  describe('the order', () => {
    it('lists the newest Finish first', async () => {
      const hostUser = await signInAs(host)
      const old = await insertEvent({ hostId: hostUser.id, finishedAt: new Date('2026-09-01T20:00:00Z') })
      const newest = await insertEvent({ hostId: hostUser.id, finishedAt: new Date('2026-11-01T20:00:00Z') })
      const middle = await insertEvent({ hostId: hostUser.id, finishedAt: new Date('2026-10-01T20:00:00Z') })

      const view = await read(hostUser.cookie)

      expect(view.events.map(entry => entry.slug)).toEqual([newest.slug, middle.slug, old.slug])
    })

    it('lists an Event without a finishedAt last, with finishedAt null', async () => {
      const hostUser = await signInAs(host)
      const undated = await insertEvent({ hostId: hostUser.id, finishedAt: null, createdAt: new Date('2026-12-01T10:00:00Z') })
      const dated = await insertEvent({ hostId: hostUser.id, finishedAt: new Date('2026-01-01T20:00:00Z') })

      const view = await read(hostUser.cookie)

      expect(view.events.map(entry => entry.slug)).toEqual([dated.slug, undated.slug])
      expect(view.events[1]).toMatchObject({ finishedAt: null })
    })

    it('puts the newer createdAt first when two Events finished at the same instant', async () => {
      const hostUser = await signInAs(host)
      const finishedAt = new Date('2026-10-25T21:00:00Z')
      const older = await insertEvent({ hostId: hostUser.id, finishedAt, createdAt: new Date('2026-10-01T10:00:00Z') })
      const newer = await insertEvent({ hostId: hostUser.id, finishedAt, createdAt: new Date('2026-10-10T10:00:00Z') })

      const view = await read(hostUser.cookie)

      expect(view.events.map(entry => entry.slug)).toEqual([newer.slug, older.slug])
    })
  })
})
