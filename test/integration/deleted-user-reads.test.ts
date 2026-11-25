import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityEntry } from '../../shared/activity'
import { createTestApp, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostEntersResult, hostFinishes, hostSets, readEvent, readEventText, readFeed, readFeedText, startRunningEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// A Deleted User on the reads (#915, spec #907, ADR 0020): the Event's Members and the Activity feed carry the mark, with the name and the picture
// cut by the read itself. Nothing sets the mark yet (0.21-10), so the test marks the row; the row keeps a name, a Display name and a picture URL
// to prove the read cuts them.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Quokka', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: 'https://example.com/zwei.png' },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Wombat', email: 'four@example.com', image: undefined },
  five: { provider: 'twitch', id: '6', name: 'Fuenf', email: 'five@example.com', image: undefined },
} as const

const T0 = '2090-10-30T10:00:00.000Z'
const DISPLAY = { one: 'Quokka-Anzeige', four: 'Wombat-Anzeige' }
const PICTURE = { one: 'https://example.com/quokka-secret.png', four: 'https://example.com/wombat-secret.png' }
const TRACES = { one: ['Quokka', 'quokka-secret'], four: ['Wombat', 'wombat-secret'] }

describe('a Deleted User on the reads', () => {
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

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => request)

  /**
   * A running Event: Quokka (one) and Zwei are in team 1, Drei and Fuenf in team 2, Wombat (four) is on the Stands. Everyone joined through the Invite link, so the feed
   * holds their `member_joined` and `member_moved` entries. Quokka and Wombat have a Display name and a picture in their row.
   */
  async function running() {
    const ev = await startRunningEvent(rig, {
      host,
      players,
      seats: [['one', 1], ['two', 1], ['three', 2], ['five', 2]],
      settings: { teamCount: 2, teamSize: 3, gameCount: 2, pointsTable: { preset: 'linear' as const, values: [1, 0] } },
      games: [{ key: 'halo', values: { name: 'Halo' }, pool: true }, { key: 'kart', values: { name: 'Kart' }, pool: true }],
      join: 'invite',
      quiet: false,
    })
    await testDb.db.update(users).set({ displayName: DISPLAY.one, image: PICTURE.one }).where(eq(users.id, ev.players.one.id))
    await testDb.db.update(users).set({ image: 'https://example.com/zwei.png' }).where(eq(users.id, ev.players.two.id))
    await testDb.db.update(users).set({ displayName: DISPLAY.four, image: PICTURE.four }).where(eq(users.id, ev.players.four.id))
    return ev
  }

  type World = Awaited<ReturnType<typeof running>>

  const mark = (ids: string[]) => testDb.db.update(users).set({ deletedAt: new Date('2090-10-30T09:00:00.000Z') }).where(inArray(users.id, ids))

  /** Both teams' Results for two Rounds, then the finish: team 1 wins. */
  async function finish(ev: World) {
    for (const game of [ev.games.halo, ev.games.kart]) {
      const roundId = await hostSets(rig, ev, game.id)
      await hostEntersResult(rig, ev, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    }
    await hostFinishes(rig, ev, { outcome: 'winner', winners: [1] })
  }

  /** The text holds nothing of the Users who are deleted: not the name, not the Display name, not the picture. */
  function expectNoTrace(text: string, ...deleted: (keyof typeof TRACES)[]) {
    for (const trace of deleted.flatMap(key => TRACES[key])) expect(text).not.toContain(trace)
  }

  describe.each([
    ['an Event that has not finished', async (_ev: World) => {}],
    ['a finished Event', finish],
  ])('the Members of %s', (_name, prepare) => {
    it('sends a Deleted Player in a team as marked, without name and picture, still in the team, and the others as before (the Host reads)', async () => {
      const ev = await running()
      await prepare(ev)
      await mark([ev.players.one.id])

      const view = await readEvent(rig, ev.host.cookie, ev.slug)

      const marked = view.members.find(member => member.id === ev.players.one.id)!
      expect(marked).toEqual({ id: ev.players.one.id, name: '', image: null, deleted: true, isHost: false, zone: 'team', team: 1, teamWord: null })
      const other = view.members.find(member => member.id === ev.players.two.id)!
      expect(other).toMatchObject({ id: ev.players.two.id, name: 'Zwei', image: 'https://example.com/zwei.png', zone: 'team', team: 1 })
      expect(other).not.toHaveProperty('deleted')
      expect(view.members.find(member => member.isHost)).not.toHaveProperty('deleted')
      expectNoTrace(await readEventText(rig, ev.host.cookie, ev.slug), 'one')
    })

    it('sends the same to a Member, and a Deleted Player on the Stands keeps the Stands', async () => {
      const ev = await running()
      await prepare(ev)
      await mark([ev.players.four.id])

      const view = await readEvent(rig, ev.players.three.cookie, ev.slug)

      expect(view.members.find(member => member.id === ev.players.four.id)).toEqual({ id: ev.players.four.id, name: '', image: null, deleted: true, isHost: false, zone: 'stands', team: null, teamWord: null })
      expect(view.members.find(member => member.id === ev.players.three.id)).not.toHaveProperty('deleted')
      expectNoTrace(await readEventText(rig, ev.players.three.cookie, ev.slug), 'four')
    })

    it('marks every Deleted User with their own id when two are deleted, and leaves nobody else marked', async () => {
      const ev = await running()
      await prepare(ev)
      await mark([ev.players.one.id, ev.players.four.id])

      const view = await readEvent(rig, ev.host.cookie, ev.slug)

      expect(view.members.filter(member => member.deleted).map(member => member.id).sort()).toEqual([ev.players.one.id, ev.players.four.id].sort())
      expect(view.members).toHaveLength(6)
      expectNoTrace(await readEventText(rig, ev.host.cookie, ev.slug), 'one', 'four')
    })

    it('sends no mark key to anybody while nobody is deleted', async () => {
      const ev = await running()
      await prepare(ev)

      const view = await readEvent(rig, ev.host.cookie, ev.slug)

      expect(view.members.every(member => !('deleted' in member))).toBe(true)
    })
  })

  describe('the Activity feed', () => {
    const entryOf = (entries: ActivityEntry[], type: ActivityEntry['type'], actorId: string) => entries.find(entry => entry.type === type && entry.actor?.id === actorId)!

    it('marks the actor of a member_joined entry: no name, the id in `deleted`', async () => {
      const ev = await running()
      await mark([ev.players.one.id])

      const entries = await readFeed(rig, ev.host.cookie, ev.slug, 'limit=100')

      const joined = entryOf(entries, 'member_joined', ev.players.one.id)
      expect(joined.actor).toEqual({ id: ev.players.one.id, name: '' })
      expect(joined.deleted).toEqual([ev.players.one.id])
      const unmarked = entryOf(entries, 'member_joined', ev.players.two.id)
      expect(unmarked.actor).toEqual({ id: ev.players.two.id, name: 'Zwei' })
      expect(unmarked).not.toHaveProperty('deleted')
      expectNoTrace(await readFeedText(rig, ev.host.cookie, ev.slug, 'limit=100'), 'one')
    })

    it('marks the person the Host moved, and not the Host, in the people of a member_moved entry', async () => {
      const ev = await running()
      expect((await send('POST', `/api/e/${ev.slug}/move`, ev.host.cookie, { userId: ev.players.four.id, to: { zone: 'team', team: 2 } })).status).toBe(200)
      await mark([ev.players.four.id])

      const entries = await readFeed(rig, ev.host.cookie, ev.slug, 'limit=100')

      const moved = entryOf(entries, 'member_moved', ev.host.id)
      expect(moved.actor).toEqual({ id: ev.host.id, name: 'Hostess' })
      expect(moved.people).toEqual({ [ev.players.four.id]: '' })
      expect(moved.deleted).toEqual([ev.players.four.id])
      expectNoTrace(await readFeedText(rig, ev.host.cookie, ev.slug, 'limit=100'), 'four')
    })

    it('marks two Deleted Users each with their own id, lists a Player who moved themselves once, and nobody else', async () => {
      const ev = await running()
      await mark([ev.players.one.id, ev.players.four.id])

      const entries = await readFeed(rig, ev.host.cookie, ev.slug, 'limit=100')

      expect(entryOf(entries, 'member_joined', ev.players.four.id).deleted).toEqual([ev.players.four.id])
      expect(entryOf(entries, 'member_joined', ev.players.one.id).deleted).toEqual([ev.players.one.id])
      // Quokka took their seat themselves: the actor is the person, and the id is listed once.
      expect(entryOf(entries, 'member_moved', ev.players.one.id)).toMatchObject({ actor: { id: ev.players.one.id, name: '' }, people: { [ev.players.one.id]: '' }, deleted: [ev.players.one.id] })
      expect(entryOf(entries, 'member_joined', ev.players.three.id)).not.toHaveProperty('deleted')
      expect(entryOf(entries, 'member_moved', ev.players.three.id)).not.toHaveProperty('deleted')
      expectNoTrace(await readFeedText(rig, ev.host.cookie, ev.slug, 'limit=100'), 'one', 'four')
    })

    it('carries the mark in the `activity.added` message of an entry written live', async () => {
      const ev = await running()
      await mark([ev.players.four.id])
      notifier.clear()

      expect((await send('POST', `/api/e/${ev.slug}/move`, ev.host.cookie, { userId: ev.players.four.id, to: { zone: 'team', team: 2 } })).status).toBe(200)

      const added = notifier.messages(ev.eventId).flatMap(message => message.type === 'activity.added' ? [message.entry] : [])
      expect(added).toHaveLength(1)
      expect(added[0]).toMatchObject({ type: 'member_moved', actor: { id: ev.host.id, name: 'Hostess' }, people: { [ev.players.four.id]: '' }, deleted: [ev.players.four.id] })
      expectNoTrace(JSON.stringify(added), 'four')
    })
  })
})
