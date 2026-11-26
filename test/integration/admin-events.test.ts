import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { events, sessions, users } from '../../server/db/schema'
import type { Db } from '../../server/utils/db'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { AdminView } from '../../shared/admin'
import { notesFromLines } from '../../shared/notes-doc'
import { createTestApp, sendVia } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, hostFinishes, hostEntersResult, hostSets, hostSignsIn, playersJoin, signInAs, startRunningEvent, type Rig, type Signed } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// The Events on the Admin page (#876, spec #938): the same read as the Users (`GET /api/admin`), one list entry per Event, Deleted Events included, and nothing
// of what happens inside an Event. The address of an Event is on its entry only where the Platform admin is a Member and the Event is not deleted (ADR 0006
// kept). The Users' half of the read is admin.test.ts's.

const admin = { provider: 'discord', id: '1', name: 'Wurzelwerk', email: 'admin@example.com', image: undefined } as const
const host = { provider: 'discord', id: '2', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const otherHost = { provider: 'twitch', id: '3', name: 'Andere', email: 'other@example.com', image: undefined } as const
const leaver = { provider: 'discord', id: '4', name: 'Dingo', email: 'dingo@example.com', image: undefined } as const
const wombat = { provider: 'twitch', id: '5', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const
const quokka = { provider: 'discord', id: '6', name: 'Quokka', email: 'quokka@example.com', image: undefined } as const

describe('the Events of the Admin page', () => {
  let client: PGlite
  let counted: Db
  let rig: Rig
  const log: string[] = []
  const notifier = memoryRoomNotifier()

  beforeAll(async () => {
    const testDb = await createTestDb()
    client = testDb.client
    // The same database with a logger, for the statement count of the read.
    counted = drizzle({ client, schema, logger: { logQuery: (query: string) => void log.push(query) } }) as unknown as Db
    rig = { request: createTestApp(counted, { roomNotifier: notifier }), db: counted, notifier }
  })

  afterAll(async () => {
    await client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ admins: 'discord:1' })
    notifier.clear()
    await resetDatabase(counted)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => rig.request)
  const read = async (cookie: string) => (await send('GET', '/api/admin', cookie)).json() as Promise<AdminView>
  const created = (eventId: string, iso: string) => counted.update(events).set({ createdAt: new Date(iso) }).where(eq(events.id, eventId))
  const named = async (who: Signed, displayName: string) => counted.update(users).set({ displayName }).where(eq(users.id, who.id))

  describe('the list', () => {
    it('lists every Event newest first, each with its name, its Host, its Phase, its counts and its creation', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const other = await hostSignsIn(rig, otherHost)
      await named(hostSigned, 'Gastgeberin')
      const old = await hostCreatesEvent(rig, hostSigned, { name: 'Alt', sessions: 1, slots: ['2090-10-30T20:30'] })
      const newer = await hostCreatesEvent(rig, hostSigned, { name: 'Neuer', sessions: 3, slots: ['2090-10-30T20:30', '2090-10-31T20:30', '2090-11-01T20:30'] })
      const newest = await hostCreatesEvent(rig, other, { name: 'Neuester', sessions: 2 })
      await playersJoin(rig, newer, [adminSigned, other])
      await created(old.eventId, '2026-01-10T10:00:00.000Z')
      await created(newer.eventId, '2026-02-10T10:00:00.000Z')
      await created(newest.eventId, '2026-03-10T10:00:00.000Z')

      const view = await read(adminSigned.cookie)

      expect(view.events.map(entry => entry.name)).toEqual(['Neuester', 'Neuer', 'Alt'])
      expect(view.events[1]).toEqual({
        name: 'Neuer',
        hostName: 'Gastgeberin',
        phase: 'poll',
        memberCount: 3,
        sessionCount: 3,
        createdAt: '2026-02-10T10:00:00.000Z',
        finishedAt: null,
        deletedAt: null,
        path: `/e/${newer.slug}`,
      })
      expect(view.events[2]).toMatchObject({ hostName: 'Gastgeberin', memberCount: 1, sessionCount: 1, createdAt: '2026-01-10T10:00:00.000Z' })
      expect(view.events[0]).toMatchObject({ hostName: null, memberCount: 1, sessionCount: 2 })
    })

    it('counts the Sessions that are not removed', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const made = await hostCreatesEvent(rig, hostSigned, { name: 'Zwei Sessions', sessions: 2 })
      const [first] = await counted.select({ id: sessions.id }).from(sessions).where(eq(sessions.eventId, made.eventId))
      await counted.update(sessions).set({ removedAt: new Date('2026-05-01T10:00:00.000Z') }).where(eq(sessions.id, first!.id))

      const view = await read(adminSigned.cookie)

      expect(view.events[0]).toMatchObject({ name: 'Zwei Sessions', sessionCount: 1 })
    })

    it('lists a finished Event with its Finish and its Phase', async () => {
      const adminSigned = await signInAs(rig, admin)
      const running = await startRunningEvent(rig, {
        host, players: { wombat, quokka }, seats: [['wombat', 1], ['quokka', 2]], name: 'Fertig',
        settings: { gameCount: 1 }, games: [{ key: 'halo', values: { name: 'Halo' }, pool: true }],
      })
      const roundId = await hostSets(rig, running, running.games.halo.id)
      await hostEntersResult(rig, running, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      await hostFinishes(rig, running, { outcome: 'winner', winners: [1] })
      await counted.update(events).set({ finishedAt: new Date('2026-06-02T18:30:00.000Z') }).where(eq(events.id, running.eventId))

      const view = await read(adminSigned.cookie)

      expect(view.events).toHaveLength(1)
      expect(view.events[0]).toMatchObject({ name: 'Fertig', phase: 'finished', memberCount: 3, finishedAt: '2026-06-02T18:30:00.000Z', deletedAt: null })
    })

    it('lists a Deleted Event, with its date and no address, though the Platform admin was a Member', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const gone = await hostCreatesEvent(rig, hostSigned, { name: 'Gelöschtes' })
      const kept = await hostCreatesEvent(rig, hostSigned, { name: 'Bleibt' })
      await playersJoin(rig, gone, [adminSigned])
      await playersJoin(rig, kept, [adminSigned])
      await counted.update(events).set({ deletedAt: new Date('2026-07-04T09:00:00.000Z') }).where(eq(events.id, gone.eventId))

      const view = await read(adminSigned.cookie)

      const entry = view.events.find(item => item.name === 'Gelöschtes')!
      expect(entry).toMatchObject({ deletedAt: '2026-07-04T09:00:00.000Z', memberCount: 2 })
      expect(entry).not.toHaveProperty('path')
      expect(view.events.find(item => item.name === 'Bleibt')).toMatchObject({ deletedAt: null, path: `/e/${kept.slug}` })
    })

    it('lists the Events of a Deleted User nowhere: they are gone outright (ADR 0020)', async () => {
      const adminSigned = await signInAs(rig, admin)
      const goner = await hostSignsIn(rig, leaver)
      const staying = await hostSignsIn(rig, host)
      await hostCreatesEvent(rig, goner, { name: 'Verschwunden' })
      await hostCreatesEvent(rig, staying, { name: 'Bleibt' })
      expect((await send('DELETE', '/api/me', goner.cookie)).status).toBe(200)

      const view = await read(adminSigned.cookie)

      expect(view.events.map(entry => entry.name)).toEqual(['Bleibt'])
    })

    it('lists no Events when there are none', async () => {
      const adminSigned = await signInAs(rig, admin)

      expect((await read(adminSigned.cookie)).events).toEqual([])
    })
  })

  describe('the address', () => {
    it('is on the entry of an Event the Platform admin is a Member of, and on no other: the host\'s own, one joined, one not', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const own = await hostCreatesEvent(rig, adminSigned, { name: 'Eigenes' })
      const joined = await hostCreatesEvent(rig, hostSigned, { name: 'Beigetreten' })
      const foreign = await hostCreatesEvent(rig, hostSigned, { name: 'Fremdes' })
      await playersJoin(rig, joined, [adminSigned])

      const view = await read(adminSigned.cookie)

      const pathOf = (name: string) => view.events.find(entry => entry.name === name)
      expect(pathOf('Eigenes')).toHaveProperty('path', `/e/${own.slug}`)
      expect(pathOf('Beigetreten')).toHaveProperty('path', `/e/${joined.slug}`)
      expect(pathOf('Fremdes')).not.toHaveProperty('path')
      const raw = JSON.stringify(view)
      expect(raw).not.toContain(foreign.slug)
      expect(raw).not.toContain(foreign.eventId)
      expect(raw).not.toContain(foreign.inviteToken)
      expect(raw).not.toContain(joined.inviteToken)
      expect(raw).not.toContain(own.inviteToken)
    })

    it('opens for the Platform admin exactly where it is given, and an Event without one still answers like a missing route', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const joined = await hostCreatesEvent(rig, hostSigned, { name: 'Beigetreten' })
      const foreign = await hostCreatesEvent(rig, hostSigned, { name: 'Fremdes' })
      await playersJoin(rig, joined, [adminSigned])

      const view = await read(adminSigned.cookie)

      const path = view.events.find(entry => entry.name === 'Beigetreten')!.path!
      expect((await send('GET', `/api${path}`, adminSigned.cookie)).status).toBe(200)
      expect((await send('GET', `/api/e/${foreign.slug}`, adminSigned.cookie)).status).toBe(404)
    })
  })

  describe('what is not on it', () => {
    /** An Event with everything the page must not show: Members with names, Teams with a name, a Message, Votes with Notes, games with notes and an Event note. */
    async function fullEvent(name: string, tag: string, members: Signed[]) {
      const world = await startRunningEvent(rig, {
        host, players: { wombat, quokka }, name, seats: [['wombat', 1], ['quokka', 2]], join: 'invite', quiet: false,
        sessions: 2, confirmed: 1, extraSlots: ['2090-11-05T19:00'],
        settings: { teamCount: 2, teamSize: 1, gameCount: 1, selectionMode: 'admin_pick' },
        games: [{ key: 'halo', pool: true, values: { name: `Spielname-${tag}`, notes: notesFromLines([`Spielnotiz-${tag}`])! } }],
      })
      await playersJoin(rig, world, members)
      expect((await send('POST', `/api/e/${world.slug}/team-word`, world.players.wombat.cookie, { word: `W${tag}` })).status).toBe(200)
      expect((await send('POST', `/api/e/${world.slug}/messages`, world.players.quokka.cookie, { id: randomUUID(), text: `Chattext-${tag}` })).status).toBe(200)
      expect((await send('PUT', `/api/e/${world.slug}/slots/${world.slotIds[1]}/vote`, world.players.wombat.cookie, { value: 'yes', note: `Stimmnotiz-${tag}` })).status).toBe(200)
      expect((await send('PUT', `/api/e/${world.slug}/games/${world.games.halo.id}/notes`, world.host.cookie, { notes: notesFromLines([`Eventnotiz-${tag}`]) })).status).toBe(200)
      return world
    }

    it('holds no Member\'s name, no Team name, no Message, no Vote or Note, no game and no Invite link of any Event, on the raw response', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hidden = await fullEvent('Geheimrunde', 'verborgen', [])
      const open = await fullEvent('Offene Runde', 'offen', [adminSigned])
      await named(hidden.host, 'Gastgeberin-Anzeige')

      const raw = await (await send('GET', '/api/admin', adminSigned.cookie)).text()
      const view = JSON.parse(raw) as AdminView

      // Control: both Events are listed, the Host by Display name and the Member count, and the one the Platform admin is a Member of has its address.
      expect(view.events.map(entry => entry.name).sort()).toEqual(['Geheimrunde', 'Offene Runde'])
      expect(view.events.find(entry => entry.name === 'Geheimrunde')).toMatchObject({ hostName: 'Gastgeberin-Anzeige', memberCount: 3 })
      expect(view.events.find(entry => entry.name === 'Offene Runde')).toMatchObject({ memberCount: 4, path: `/e/${open.slug}` })

      for (const tag of ['verborgen', 'offen']) {
        for (const secret of [`Spielname-${tag}`, `Spielnotiz-${tag}`, `Eventnotiz-${tag}`, `W${tag}`, `Chattext-${tag}`, `Stimmnotiz-${tag}`]) {
          expect(raw, secret).not.toContain(secret)
        }
      }
      for (const secret of ['Wombat', 'Quokka', 'Hostess', 'Wurzelwerk', '@example.com', hidden.inviteToken, open.inviteToken, hidden.slug, hidden.eventId, open.eventId, hidden.games.halo.id]) {
        expect(raw, secret).not.toContain(secret)
      }
      // The entry names only what the page shows.
      for (const entry of view.events) {
        expect(Object.keys(entry).sort(), entry.name).toEqual(expect.arrayContaining(['name', 'hostName', 'phase', 'memberCount', 'sessionCount', 'createdAt', 'finishedAt', 'deletedAt']))
        expect(Object.keys(entry).filter(key => !['name', 'hostName', 'phase', 'memberCount', 'sessionCount', 'createdAt', 'finishedAt', 'deletedAt', 'path'].includes(key)), entry.name).toEqual([])
      }
    })
  })

  describe('the queries', () => {
    it('are a fixed handful, whatever the number of Events', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const statementsOfARead = async () => {
        log.length = 0
        await read(adminSigned.cookie)
        return log.length
      }
      const one = await hostCreatesEvent(rig, hostSigned, { name: 'Eins' })
      await playersJoin(rig, one, [adminSigned])
      const withOne = await statementsOfARead()

      for (const name of ['Zwei', 'Drei', 'Vier', 'Fünf']) await hostCreatesEvent(rig, hostSigned, { name })
      const withFive = await statementsOfARead()

      expect(withFive).toBe(withOne)
    })
  })
})
