import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, eventMembers, events, messages, pollVotes, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { endMembership } from '../../server/utils/invite'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { createTestApp, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { clockToStop, hostSpins, playerVetoes, readEvent, setUpEvent, startRunningEvent, type Rig, type Signed } from './scenario'
import { stubAuthEnv } from './sign-in'

// The rule that ends a membership (#681, spec #907, ADR 0020), called the way 0.22's removal of a Member will call it (#697): inside a transaction of the
// caller's, for one Event and one User. The Seat, the Team word and the Votes with their Notes go; Messages, Activity entries and Vetoes stay.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const people = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
  stands: { provider: 'twitch', id: '6', name: 'Tribuene', email: 'stands@example.com', image: undefined },
} as const
const outsider = { provider: 'discord', id: '7', name: 'Fremder', email: 'outsider@example.com', image: undefined } as const

const T0 = '2090-10-30T10:00:00.000Z'

describe('the rule that ends a membership', () => {
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

  /** What 0.22 does: the rule inside the caller's own transaction. */
  const end = (eventId: string, userId: string) => testDb.db.transaction(tx => endMembership(tx, eventId, userId))

  const vote = (slug: string, slotId: string, who: Signed, value: 'yes' | 'maybe' | 'no', note?: string) =>
    send('PUT', `/api/e/${slug}/slots/${slotId}/vote`, who.cookie, note === undefined ? { value } : { value, note })

  /**
   * A Lucky Wheel Event with a Running Session: One and Two in team 1, Three and Four in team 2, a Member on the Stands. Of its three Slots the first is the
   * Date of the first Session, so the poll for the second Session is open with two Slots. One has a Team word, a Message, a Veto, and Votes with Notes on both
   * Slots; Two and Stands have a Vote each.
   */
  async function running() {
    const ev = await startRunningEvent(rig, {
      host, players: people, outsiders: { outsider },
      seats: [['one', 1], ['two', 1], ['three', 2], ['four', 2], ['stands', 'stands']] as const,
      settings: { teamSize: 2, gameCount: 10, selectionMode: 'lucky_wheel', vetoAllowance: 2 },
      sessions: 2, confirmed: 1, extraSlots: ['2090-11-05T19:00'], join: 'invite', quiet: false,
      games: [{ key: 'halo', pool: true, values: { name: 'Halo' } }, { key: 'kart', pool: true, values: { name: 'Kart' } }],
    })
    const [, open1, open2] = ev.slotIds as [string, string, string]
    const { one, two, stands } = ev.players
    expect((await send('POST', `/api/e/${ev.slug}/team-word`, one.cookie, { word: 'Quokka' })).status).toBe(200)
    expect((await send('POST', `/api/e/${ev.slug}/messages`, one.cookie, { id: randomUUID(), text: 'Hallo zusammen' })).status).toBe(200)
    expect((await vote(ev.slug, open1, one, 'yes', 'Gern')).status).toBe(200)
    expect((await vote(ev.slug, open2, one, 'maybe', 'Mal sehen')).status).toBe(200)
    expect((await vote(ev.slug, open1, two, 'no')).status).toBe(200)
    expect((await vote(ev.slug, open1, stands, 'yes', 'Von der Tribüne')).status).toBe(200)
    const { drawId } = await hostSpins(rig, ev)
    await clockToStop(rig, drawId)
    await playerVetoes(rig, ev, drawId, one)
    return { ev, open1, open2 }
  }

  const rowsOf = (eventId: string, userId: string) => testDb.db.select().from(eventMembers).where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
  const votesOf = (userId: string) => testDb.db.select().from(pollVotes).where(eq(pollVotes.userId, userId))

  describe('in an Event that has not finished', () => {
    it('removes a Player: the membership with its Seat and Team word and their Votes with the Notes; the Event read follows', async () => {
      const { ev, open1, open2 } = await running()
      const before = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(before.members.find(member => member.id === ev.players.one.id)).toMatchObject({ zone: 'team', team: 1, teamWord: 'Quokka' })
      expect(before.progress).toEqual({ voted: 1, total: 6 })

      expect(await end(ev.eventId, ev.players.one.id)).toBe(true)

      expect(await rowsOf(ev.eventId, ev.players.one.id)).toEqual([])
      expect(await votesOf(ev.players.one.id)).toEqual([])
      const after = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(after.members.map(member => member.id)).not.toContain(ev.players.one.id)
      expect(after.members).toHaveLength(before.members.length - 1)
      expect(after.progress).toEqual({ voted: 0, total: 5 })
      expect(after.votes.map(row => [row.slotId, row.userId]).sort()).toEqual([[open1, ev.players.two.id], [open1, ev.players.stands.id]].sort())
      expect(JSON.stringify(after.votes)).not.toContain('Gern')
      expect(after.votes.filter(row => row.slotId === open2)).toEqual([])
    })

    it('removes a Member on the Stands the same way', async () => {
      const { ev, open1 } = await running()

      expect(await end(ev.eventId, ev.players.stands.id)).toBe(true)

      expect(await rowsOf(ev.eventId, ev.players.stands.id)).toEqual([])
      expect(await votesOf(ev.players.stands.id)).toEqual([])
      const after = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(after.members.map(member => member.id)).not.toContain(ev.players.stands.id)
      expect(after.progress).toEqual({ voted: 1, total: 5 })
      expect(after.votes.filter(row => row.slotId === open1).map(row => row.userId).sort()).toEqual([ev.players.one.id, ev.players.two.id].sort())
    })

    it('leaves the User\'s Message, Activity entries and Vetoes in place, still pointing at them', async () => {
      const { ev } = await running()
      const written = await testDb.db.select().from(messages).where(eq(messages.writerId, ev.players.one.id))
      const feed = await testDb.db.select().from(activity).where(eq(activity.actorId, ev.players.one.id))
      const cast = await testDb.db.select().from(vetoes).where(eq(vetoes.userId, ev.players.one.id))
      expect(written).toHaveLength(1)
      expect(feed.length).toBeGreaterThan(0)
      expect(cast).toHaveLength(1)

      await end(ev.eventId, ev.players.one.id)

      expect(await testDb.db.select().from(messages).where(eq(messages.writerId, ev.players.one.id))).toEqual(written)
      expect(await testDb.db.select().from(activity).where(eq(activity.actorId, ev.players.one.id))).toEqual(feed)
      expect(await testDb.db.select().from(vetoes).where(eq(vetoes.userId, ev.players.one.id))).toEqual(cast)
    })

    it('touches no other Member\'s Votes, Seat or Team word, and not the Event', async () => {
      const { ev } = await running()
      const others = async () => ({
        votes: await testDb.db.select().from(pollVotes).orderBy(pollVotes.slotId, pollVotes.userId),
        members: await testDb.db.select().from(eventMembers).orderBy(eventMembers.userId),
        events: await testDb.db.select().from(events),
      })
      const before = await others()
      const mine = (rows: { userId: string }[]) => rows.filter(row => row.userId !== ev.players.one.id)

      await end(ev.eventId, ev.players.one.id)

      const after = await others()
      expect(after.votes).toEqual(mine(before.votes))
      expect(after.members).toEqual(mine(before.members))
      expect(after.events).toEqual(before.events)
    })

    it('leaves the same User\'s Votes, Seat and Team word in another Event alone', async () => {
      const { ev } = await running()
      const other = await setUpEvent(rig, {
        host, name: 'Zweites Event', players: { one: people.one }, seats: [['one', 1]], sessions: 2, confirmed: 1, extraSlots: ['2090-11-05T19:00'], quiet: false,
      })
      expect((await send('POST', `/api/e/${other.slug}/team-word`, other.players.one.cookie, { word: 'Zwei' })).status).toBe(200)
      expect((await vote(other.slug, other.slotIds[1]!, other.players.one, 'yes', 'Auch hier')).status).toBe(200)
      const [otherVote] = await testDb.db.select().from(pollVotes).where(eq(pollVotes.slotId, other.slotIds[1]!))

      await end(ev.eventId, ev.players.one.id)

      expect(await rowsOf(other.eventId, ev.players.one.id)).toMatchObject([{ zone: 'team', team: 1, teamWord: 'Zwei' }])
      expect(await testDb.db.select().from(pollVotes).where(eq(pollVotes.slotId, other.slotIds[1]!))).toEqual([otherVote])
    })

    it('returns false for a User who is no Member and changes nothing', async () => {
      const { ev } = await running()
      const before = { votes: await testDb.db.select().from(pollVotes), members: await testDb.db.select().from(eventMembers) }

      expect(await end(ev.eventId, ev.outsiders.outsider.id)).toBe(false)
      expect(await end(ev.eventId, ev.players.one.id)).toBe(true)
      expect(await end(ev.eventId, ev.players.one.id)).toBe(false)

      const after = { votes: await testDb.db.select().from(pollVotes), members: await testDb.db.select().from(eventMembers) }
      expect(after.members).toHaveLength(before.members.length - 1)
      expect(after.votes).toHaveLength(before.votes.length - 2)
    })

    it.each([0, 1, 2])('works for an Event with %i other Players: the one who goes leaves exactly the others', async (others) => {
      const names = ['two', 'three'] as const
      const rest = Object.fromEntries(names.slice(0, others).map(name => [name, people[name]]))
      const ev = await setUpEvent(rig, {
        host, players: { one: people.one, ...rest }, seats: [['one', 1]], sessions: 2, confirmed: 1, extraSlots: ['2090-11-05T19:00'], quiet: false,
      })
      expect((await vote(ev.slug, ev.slotIds[1]!, ev.players.one, 'yes', 'Ich')).status).toBe(200)
      expect((await vote(ev.slug, ev.slotIds[2]!, ev.players.one, 'no')).status).toBe(200)
      expect((await readEvent(rig, ev.host.cookie, ev.slug)).progress).toEqual({ voted: 1, total: 2 + others })

      expect(await end(ev.eventId, ev.players.one.id)).toBe(true)

      const view = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(view.members).toHaveLength(1 + others)
      expect(view.members.map(member => member.id)).not.toContain(ev.players.one.id)
      expect(view.progress).toEqual({ voted: 0, total: 1 + others })
      expect(view.votes).toEqual([])
    })

    it('also ends the membership in an Event the Host deleted', async () => {
      const { ev } = await running()
      await testDb.db.update(events).set({ deletedAt: new Date(T0) }).where(eq(events.id, ev.eventId))

      expect(await end(ev.eventId, ev.players.one.id)).toBe(true)

      expect(await rowsOf(ev.eventId, ev.players.one.id)).toEqual([])
      expect(await votesOf(ev.players.one.id)).toEqual([])
    })

    it('is rolled back with the caller\'s transaction', async () => {
      const { ev } = await running()

      await expect(testDb.db.transaction(async (tx) => {
        expect(await endMembership(tx, ev.eventId, ev.players.one.id)).toBe(true)
        throw new Error('caller fails')
      })).rejects.toThrow('caller fails')

      expect(await rowsOf(ev.eventId, ev.players.one.id)).toHaveLength(1)
      expect(await votesOf(ev.players.one.id)).toHaveLength(2)
    })
  })

  describe('in a finished Event', () => {
    it('returns false and changes nothing: the Player keeps their Seat, Team word and Votes, and a Member on the Stands stays', async () => {
      const { ev } = await running()
      await testDb.db.update(events).set({ phase: 'finished', finishedAt: new Date(T0) }).where(eq(events.id, ev.eventId))
      const before = { votes: await testDb.db.select().from(pollVotes).orderBy(pollVotes.slotId, pollVotes.userId), members: await testDb.db.select().from(eventMembers).orderBy(eventMembers.userId) }

      expect(await end(ev.eventId, ev.players.one.id)).toBe(false)
      expect(await end(ev.eventId, ev.players.stands.id)).toBe(false)

      expect(await testDb.db.select().from(pollVotes).orderBy(pollVotes.slotId, pollVotes.userId)).toEqual(before.votes)
      expect(await testDb.db.select().from(eventMembers).orderBy(eventMembers.userId)).toEqual(before.members)
    })
  })
})
