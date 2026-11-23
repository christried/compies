import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventMembers, events, eventTeams, games, roundPlaces, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { ArchiveView } from '../../shared/archive'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostEntersResult, hostFinishes, hostSets, hostStartsCeremony, readEvent, startRunningEvent, type Rig, type Signed } from './scenario'
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

const T0 = '2026-11-22T12:00:00.000Z'

/** One Round with a Result: each Party's Place (`[team, place]`); two Parties on one Place share it. */
type Placed = readonly (readonly [team: number, place: number])[]

describe('GET /api/archive', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  let counter = 0
  // The request's clock (ADR 0013): the Award ceremony stamps its start from it, and the read decides on it whether a run is going (#883).
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { clock })
    rig = { request, db: testDb.db, clock }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    counter = 0
    clock.set(T0)
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
    members?: readonly { userId: string, team?: number, word?: string, joinedAt?: Date }[]
    /** The Event's Party count; its Points table is linear down to 0, 10 games planned. */
    teams?: number
    results?: number
    /** Rounds with a Result and their Places (the Standings stand on them); they count as games like `results`. */
    placed?: readonly Placed[]
    openRounds?: number
    /** The ceremony columns as an old deployment or the Host's start leaves them. */
    ceremonyShown?: boolean
    ceremonyStartsAt?: Date
    /** Stored names (`event_teams`), which an Event finished before 0.12 still has. */
    stored?: readonly { position: number, frozenName: string | null }[]
  }): Promise<Inserted> {
    counter += 1
    const teams = options.teams ?? 2
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
      ...(options.settings === 'null'
        ? {}
        : {
            format: 'teams' as const,
            teamCount: teams,
            teamSize: 3,
            gameCount: 10,
            pointsTable: { preset: 'linear' as const, values: Array.from({ length: teams }, (_, index) => teams - 1 - index) },
            selectionMode: 'admin_pick' as const,
          }),
      ...(options.ceremonyShown ? { ceremonyShown: true } : {}),
      ...(options.ceremonyStartsAt ? { ceremonyStartsAt: options.ceremonyStartsAt, ceremonyGag: 'trip' as const } : {}),
    }).returning({ id: events.id })
    const eventId = row!.id
    const members = options.members ?? []
    // The Host may be one of the seated Players: then their row is the one with the seat.
    const rows = members.some(member => member.userId === options.hostId) ? members : [{ userId: options.hostId }, ...members]
    await testDb.db.insert(eventMembers).values(rows.map(member => ({
      eventId,
      userId: member.userId,
      ...('team' in member && member.team
        ? {
            zone: 'team' as const,
            team: member.team,
            teamJoinedAt: 'joinedAt' in member && member.joinedAt ? member.joinedAt : new Date('2026-10-20T18:00:00Z'),
            ...('word' in member && member.word ? { teamWord: member.word } : {}),
          }
        : {}),
    })))
    if (options.stored?.length) await testDb.db.insert(eventTeams).values(options.stored.map(entry => ({ eventId, ...entry })))
    const results = options.results ?? 0
    const placed = options.placed ?? []
    if (results > 0 || placed.length > 0 || options.openRounds) {
      const [game] = await testDb.db.insert(games).values({ name: `Spiel ${counter}`, createdBy: options.hostId }).returning({ id: games.id })
      const at = new Date('2026-10-25T19:00:00Z')
      for (let number = 1; number <= results; number++) {
        await testDb.db.insert(rounds).values({ eventId, gameId: game!.id, startedAt: at, setAt: at, number, resultAt: at })
      }
      for (const [index, places] of placed.entries()) {
        const [round] = await testDb.db.insert(rounds).values({ eventId, gameId: game!.id, startedAt: at, setAt: at, number: results + index + 1, resultAt: at }).returning({ id: rounds.id })
        await testDb.db.insert(roundPlaces).values(places.map(([team, place]) => ({ roundId: round!.id, team, place })))
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

  // The Winners and the viewer's rank (#883, spec #683): derived on read from the Results and the Points table, and only once the Award
  // ceremony has been started and its run is over. A closed entry carries neither, nor anything derived from them (CODING_STANDARDS § Secrecy).
  describe('the result of an Event', () => {
    /** The keys of an entry whose result is closed: `resultOpen` is the only new one. */
    const CLOSED_KEYS = ['finishedAt', 'format', 'gameCount', 'isHost', 'memberCount', 'name', 'resultOpen', 'seated', 'slug']

    /** A Host and two seated Players on teams 1 and 2 with their words, an Event whose Winner is team 1. */
    async function twoPartyEvent(options: { ceremonyShown?: boolean, ceremonyStartsAt?: Date } = {}) {
      const hostUser = await signInAs(host)
      const player = await signInAs(one)
      const other = await signInAs(two)
      const ev = await insertEvent({
        hostId: hostUser.id,
        teams: 2,
        members: [{ userId: player.id, team: 1, word: 'Quokkas' }, { userId: other.id, team: 2, word: 'Wombats' }],
        placed: [[[1, 1], [2, 2]]],
        ...options,
      })
      return { hostUser, player, other, ev }
    }

    describe('before the Award ceremony', () => {
      it('holds no Winner and no rank, in the object and in the raw text, for the Host and for a Member alike', async () => {
        const { hostUser, player, ev } = await twoPartyEvent()

        const texts = []
        for (const viewer of [hostUser, player]) {
          const response = await list(viewer.cookie)
          const text = await response.text()
          texts.push(text)
          const entry = (JSON.parse(text) as ArchiveView).events[0]!

          expect(entry.slug).toBe(ev.slug)
          expect(Object.keys(entry).sort()).toEqual(CLOSED_KEYS)
          expect(entry.resultOpen).toBe(false)
          expect('winners' in entry).toBe(false)
          expect('rank' in entry).toBe(false)
          for (const secret of ['winners', 'rank', 'Quokkas', 'Wombats']) expect(text).not.toContain(secret)
        }
        // The same closed entry for both, but for the viewer's own seat and Host mark.
        const [hostEntry, playerEntry] = texts.map(text => (JSON.parse(text) as ArchiveView).events[0]!)
        expect({ ...hostEntry, isHost: null, seated: null }).toEqual({ ...playerEntry, isHost: null, seated: null })
      })

      it('holds nothing of a Tie either: no second Winner, no count of Winners', async () => {
        const hostUser = await signInAs(host)
        const player = await signInAs(one)
        await insertEvent({
          hostId: hostUser.id,
          teams: 4,
          members: [{ userId: player.id, team: 3, word: 'Dachse' }],
          placed: [[[1, 1], [2, 1], [3, 3], [4, 3]]],
        })

        const text = await (await list(player.cookie)).text()

        expect(Object.keys((JSON.parse(text) as ArchiveView).events[0]!).sort()).toEqual(CLOSED_KEYS)
        expect(text).not.toContain('Dachse')
      })

      it('keeps the Tribüne and the Host mark on a closed entry', async () => {
        const { hostUser, ev } = await twoPartyEvent()
        const stands = await signInAs(stander)
        await testDb.db.insert(eventMembers).values({ eventId: ev.eventId, userId: stands.id })

        expect((await read(stands.cookie)).events[0]).toMatchObject({ seated: false, isHost: false, resultOpen: false })
        expect((await read(hostUser.cookie)).events[0]).toMatchObject({ seated: false, isHost: true, resultOpen: false })
      })
    })

    describe('once the Award ceremony has run', () => {
      it('names the one Winner with its Team name and gives each Player their rank', async () => {
        const { hostUser, player, other } = await twoPartyEvent({ ceremonyShown: true })

        const first = (await read(player.cookie)).events[0]!
        const second = (await read(other.cookie)).events[0]!

        expect(first).toMatchObject({ resultOpen: true, winners: [{ position: 1, name: 'Quokkas' }], rank: 1, seated: true })
        expect(second).toMatchObject({ resultOpen: true, winners: [{ position: 1, name: 'Quokkas' }], rank: 2 })
        // The Winner count is the Winners' list; the other Party's name is never sent.
        expect(JSON.stringify(second)).not.toContain('Wombats')
        expect((await read(hostUser.cookie)).events[0]).toMatchObject({ resultOpen: true, winners: [{ position: 1, name: 'Quokkas' }], rank: null })
      })

      it('lists every Party on Place 1 as a Winner in the order of the teams (Unentschieden), each Player with rank 1', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        const b = await signInAs(two)
        const c = await signInAs(three)
        await insertEvent({
          hostId: hostUser.id,
          teams: 3,
          ceremonyShown: true,
          members: [{ userId: a.id, team: 1, word: 'Eins' }, { userId: b.id, team: 3, word: 'Drei' }, { userId: c.id, team: 2, word: 'Zwei' }],
          placed: [[[3, 1], [1, 1], [2, 3]]],
        })

        const first = (await read(a.cookie)).events[0]!

        expect(first.winners).toEqual([{ position: 1, name: 'Eins' }, { position: 3, name: 'Drei' }])
        expect(first.rank).toBe(1)
        expect((await read(b.cookie)).events[0]!.rank).toBe(1)
        expect((await read(c.cookie)).events[0]!.rank).toBe(3)
      })

      it('gives a shared rank below the top as it is (1, 2, 2), and the skipped one after a shared first (1, 1, 3)', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        const b = await signInAs(two)
        const c = await signInAs(three)
        const seats = [{ userId: a.id, team: 1 }, { userId: b.id, team: 2 }, { userId: c.id, team: 3 }]
        await insertEvent({ hostId: hostUser.id, teams: 3, ceremonyShown: true, members: seats, placed: [[[1, 1], [2, 2], [3, 2]]], finishedAt: new Date('2026-10-26T21:00:00Z') })
        await insertEvent({ hostId: hostUser.id, teams: 3, ceremonyShown: true, members: seats, placed: [[[1, 1], [2, 1], [3, 3]]], finishedAt: new Date('2026-10-25T21:00:00Z') })

        const forB = (await read(b.cookie)).events.map(entry => entry.rank)
        const forC = (await read(c.cookie)).events.map(entry => entry.rank)

        expect(forB).toEqual([2, 1])
        expect(forC).toEqual([2, 3])
      })

      it('adds up several Rounds with the Points table', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        const b = await signInAs(two)
        await insertEvent({
          hostId: hostUser.id,
          ceremonyShown: true,
          members: [{ userId: a.id, team: 1 }, { userId: b.id, team: 2 }],
          placed: [[[2, 1], [1, 2]], [[2, 1], [1, 2]], [[1, 1], [2, 2]]],
        })

        expect((await read(a.cookie)).events[0]).toMatchObject({ winners: [{ position: 2, name: null }], rank: 2, gameCount: 3 })
        expect((await read(b.cookie)).events[0]).toMatchObject({ rank: 1 })
      })

      it('gives a Member on the Stands no rank, and a Host who plays theirs, with the Host mark', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        const stands = await signInAs(stander)
        await insertEvent({
          hostId: hostUser.id,
          ceremonyShown: true,
          members: [{ userId: hostUser.id, team: 2 }, { userId: a.id, team: 1 }, { userId: stands.id }],
          placed: [[[1, 1], [2, 2]]],
        })

        const onStands = (await read(stands.cookie)).events[0]!
        const hosting = (await read(hostUser.cookie)).events[0]!

        expect(onStands).toMatchObject({ resultOpen: true, seated: false, rank: null, winners: [{ position: 1, name: null }] })
        expect(hosting).toMatchObject({ isHost: true, seated: true, rank: 2 })
      })

      it('shows the same Team name as the Event read: words in the order they joined, null without words', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        const b = await signInAs(two)
        const c = await signInAs(three)
        const ev = await insertEvent({
          hostId: hostUser.id,
          teams: 3,
          ceremonyShown: true,
          members: [
            { userId: a.id, team: 1, word: 'Gurken', joinedAt: new Date('2026-10-20T19:00:00Z') },
            { userId: b.id, team: 1, word: 'Wilde', joinedAt: new Date('2026-10-20T18:00:00Z') },
            { userId: c.id, team: 2, word: 'Hasen' },
          ],
          // Everyone on Place 1: a three-way Tie puts every Party on the card.
          placed: [[[1, 1], [2, 1], [3, 1]]],
        })

        const winners = (await read(a.cookie)).events[0]!.winners!
        const names = (await readEvent(rig, a.cookie, ev.slug)).teams

        expect(winners.map(winner => winner.name)).toEqual(['Wilde Gurken', 'Hasen', null])
        expect(winners).toEqual(names)
      })

      it('takes a stored name of an Event finished before 0.12 only for a team that has a row, and null stays the colour name', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        const b = await signInAs(two)
        const c = await signInAs(three)
        const ev = await insertEvent({
          hostId: hostUser.id,
          teams: 3,
          ceremonyShown: true,
          members: [{ userId: a.id, team: 1, word: 'Neu' }, { userId: b.id, team: 2, word: 'Auch' }, { userId: c.id, team: 3, word: 'Wort' }],
          placed: [[[1, 1], [2, 1], [3, 1]]],
          stored: [{ position: 1, frozenName: 'Alte Hasen' }, { position: 2, frozenName: null }],
        })

        const winners = (await read(a.cookie)).events[0]!.winners!
        const names = (await readEvent(rig, a.cookie, ev.slug)).teams

        expect(winners).toEqual([{ position: 1, name: 'Alte Hasen' }, { position: 2, name: null }, { position: 3, name: 'Wort' }])
        expect(winners).toEqual(names)
      })

      it('is open for an Event whose start was never stored, only the flag (the previous deployment)', async () => {
        const { player } = await twoPartyEvent({ ceremonyShown: true })

        expect((await read(player.cookie)).events[0]).toMatchObject({ resultOpen: true, rank: 1 })
      })

      it('is open for an Event with a stored start and no flag, the previous deployment\'s start, once its run is over', async () => {
        const { player } = await twoPartyEvent({ ceremonyStartsAt: new Date('2026-11-22T11:00:00Z') })

        expect((await read(player.cookie)).events[0]).toMatchObject({ resultOpen: true, rank: 1 })
      })

      it('shows an open entry without Winners and without rank when no Round has a Result', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        await insertEvent({ hostId: hostUser.id, ceremonyShown: true, members: [{ userId: a.id, team: 1 }] })

        const entry = (await read(a.cookie)).events[0]!

        expect(entry).toMatchObject({ resultOpen: true, winners: [], rank: null, gameCount: 0 })
      })

      it('shows an open entry without Winners and without rank when the Event has no settings', async () => {
        const hostUser = await signInAs(host)
        const a = await signInAs(one)
        await insertEvent({ hostId: hostUser.id, ceremonyShown: true, settings: 'null', members: [{ userId: a.id, team: 1 }], results: 2 })

        expect((await read(a.cookie)).events[0]).toMatchObject({ resultOpen: true, winners: [], rank: null, format: null })
      })
    })

    describe('around the run of the ceremony', () => {
      /** The Host starts the ceremony at the clock's now; answers the run's end as a number. */
      async function start(hostUser: Signed, slug: string): Promise<{ startsAt: number, endsAt: number }> {
        const started = await hostStartsCeremony(rig, { slug, host: hostUser })
        return { startsAt: Date.parse(started.startsAt), endsAt: Date.parse(started.endsAt) }
      }

      it('stays closed in the lead and during the first run for the Host and a Member, and opens at the end of the run', async () => {
        const { hostUser, player, ev } = await twoPartyEvent()
        const { startsAt, endsAt } = await start(hostUser, ev.slug)

        for (const at of [Date.parse(T0), startsAt, startsAt + 1, endsAt - 1]) {
          clock.set(new Date(at))
          for (const viewer of [hostUser, player]) {
            const text = await (await list(viewer.cookie)).text()
            expect(JSON.parse(text).events[0].resultOpen, `at ${at - startsAt} ms`).toBe(false)
            for (const secret of ['winners', 'rank', 'Quokkas']) expect(text).not.toContain(secret)
          }
        }

        clock.set(new Date(endsAt))
        expect((await read(player.cookie)).events[0]).toMatchObject({ resultOpen: true, rank: 1, winners: [{ position: 1, name: 'Quokkas' }] })
        expect((await read(hostUser.cookie)).events[0]).toMatchObject({ resultOpen: true })
        clock.set(new Date(endsAt + 60_000))
        expect((await read(player.cookie)).events[0]).toMatchObject({ resultOpen: true, rank: 1 })
      })

      it('closes again during a restart of the ceremony and opens after its new end', async () => {
        const { hostUser, player, ev } = await twoPartyEvent()
        const first = await start(hostUser, ev.slug)
        clock.set(new Date(first.endsAt))
        expect((await read(player.cookie)).events[0]!.resultOpen).toBe(true)

        const second = await start(hostUser, ev.slug)
        expect(second.endsAt).toBeGreaterThan(first.endsAt)

        for (const at of [first.endsAt, second.startsAt, second.endsAt - 1]) {
          clock.set(new Date(at))
          const text = await (await list(player.cookie)).text()
          expect(JSON.parse(text).events[0].resultOpen, `at ${at}`).toBe(false)
          expect(text).not.toContain('Quokkas')
        }
        clock.set(new Date(second.endsAt))
        expect((await read(player.cookie)).events[0]).toMatchObject({ resultOpen: true, rank: 1 })
      })

      it('ends the run later for a Tie: its end follows the Winner count, as the ceremony\'s answer does', async () => {
        const hostUser = await signInAs(host)
        const player = await signInAs(one)
        const ev = await insertEvent({ hostId: hostUser.id, teams: 4, members: [{ userId: player.id, team: 1, word: 'Eins' }], placed: [[[1, 1], [2, 1], [3, 3], [4, 3]]] })
        const { endsAt } = await start(hostUser, ev.slug)

        clock.set(new Date(endsAt - 1))
        expect((await read(player.cookie)).events[0]!.resultOpen).toBe(false)
        clock.set(new Date(endsAt))
        expect((await read(player.cookie)).events[0]).toMatchObject({ resultOpen: true, winners: [{ position: 1, name: 'Eins' }, { position: 2, name: null }] })
      })
    })

    it('answers the list of several Events in one read, each with its own result', async () => {
      const hostUser = await signInAs(host)
      const a = await signInAs(one)
      const shown = await insertEvent({ hostId: hostUser.id, ceremonyShown: true, members: [{ userId: a.id, team: 2, word: 'Zwei' }], placed: [[[2, 1], [1, 2]]], finishedAt: new Date('2026-10-26T21:00:00Z') })
      const closed = await insertEvent({ hostId: hostUser.id, members: [{ userId: a.id, team: 2, word: 'Zwei' }], placed: [[[2, 1], [1, 2]]], finishedAt: new Date('2026-10-25T21:00:00Z') })
      await insertEvent({ hostId: hostUser.id, ceremonyShown: true, members: [{ userId: a.id, team: 1 }], placed: [[[2, 1], [1, 2]]], finishedAt: new Date('2026-10-24T21:00:00Z') })

      const entries = (await read(a.cookie)).events

      expect(entries.map(entry => [entry.slug, entry.resultOpen, entry.rank])).toEqual([
        [shown.slug, true, 1],
        [closed.slug, false, undefined],
        [entries[2]!.slug, true, 2],
      ])
    })
  })
})
