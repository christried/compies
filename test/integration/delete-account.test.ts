import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, authAccounts, authSessions, eventMembers, events, games, messages, pollSlots, pollVotes, users, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { AccountDeleted, AuthUser } from '../../shared/auth'
import { webpOf } from '../webp-fixtures'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { clockToStop, hostEntersResult, hostFinishes, hostSets, hostSpins, playerVetoes, readEvent, setUpEvent, startRunningEvent, type Rig, type Signed } from './scenario'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Deleting an account (#681, spec #907, ADR 0020): DELETE /api/me empties the signed-in User's row, takes them out of every Event that has not finished,
// cuts their typing everywhere and closes their sockets. No Event of theirs and no game of theirs yet (#917): that User is refused.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const doomed = { provider: 'discord', id: '2', name: 'Quokka', email: 'quokka@example.com', image: 'https://example.com/quokka.png' } as const
const mate = { provider: 'twitch', id: '3', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const
const rival = { provider: 'twitch', id: '4', name: 'Dingo', email: 'dingo@example.com', image: undefined } as const
const friend = { provider: 'discord', id: '6', name: 'Koala', email: 'koala@example.com', image: undefined } as const
const plain = { provider: 'twitch', id: '5', name: 'Leer', email: 'leer@example.com', image: undefined } as const

const T0 = '2090-10-30T10:00:00.000Z'
const NOW = '2090-10-30T11:00:00.000Z'
const lossy = () => webpOf({ form: 'lossy', width: 256, height: 256 })

describe('deleting an account', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)
  const store = memoryImageStore()
  let failDelete = false
  // The same store, but a delete can be made to fail: the object is removed on a best-effort basis after the commit.
  const flakyStore = { ...store, async delete(key: string) {
    if (failDelete) throw new Error('store is down')
    await store.delete(key)
  } }

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock, imageStore: flakyStore })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    store.clear()
    failDelete = false
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const send = sendVia(() => request)
  const deleteMe = (cookie?: string) => send('DELETE', '/api/me', cookie)
  const me = async (cookie: string) => (await (await send('GET', '/api/me', cookie)).json() as { user: AuthUser | null }).user
  const vote = (slug: string, slotId: string, who: Signed, value: 'yes' | 'maybe' | 'no', note?: string) =>
    send('PUT', `/api/e/${slug}/slots/${slotId}/vote`, who.cookie, note === undefined ? { value } : { value, note })
  const write = async (slug: string, who: Signed, text: string) => {
    const id = randomUUID()
    expect((await send('POST', `/api/e/${slug}/messages`, who.cookie, { id, text })).status).toBe(200)
    return id
  }

  const SETTINGS = { teamCount: 2, teamSize: 2, gameCount: 2, pointsTable: { preset: 'linear' as const, values: [1, 0] }, selectionMode: 'lucky_wheel' as const, vetoAllowance: 2 }
  const GAMES = [{ key: 'halo', pool: true, values: { name: 'Halo' } }, { key: 'kart', pool: true, values: { name: 'Kart' } }] as const

  /**
   * The world of the User who is deleted, in two Events of the Host and a third they know nothing of: A has not finished (a Running Session, a Lucky Wheel; the
   * User sits in team 1 with a Team word, has Votes with Notes on the two open Slots, two Messages of which the Host deleted one, a Veto and the joining's Activity
   * entries), B has finished (the User in `seat`, a Message, a Team word when seated, Votes inserted by hand since no poll is open after the Finish). C has none of them.
   */
  async function world(seat: 'team' | 'stands' = 'team') {
    const a = await startRunningEvent(rig, {
      host, players: { doomed, mate, rival, friend }, name: 'Event A',
      seats: [['doomed', 1], ['mate', 1], ['rival', 2], ['friend', 2]], settings: SETTINGS,
      sessions: 2, confirmed: 1, extraSlots: ['2090-11-05T19:00'], join: 'invite', quiet: false, games: GAMES,
    })
    const b = await startRunningEvent(rig, {
      host, players: { doomed, mate, rival, friend }, name: 'Event B',
      seats: seat === 'team' ? [['doomed', 1], ['mate', 1], ['rival', 2], ['friend', 2]] : [['doomed', 'stands'], ['mate', 1], ['rival', 2], ['friend', 'stands']], settings: SETTINGS, join: 'invite', quiet: false, games: GAMES,
    })
    const c = await setUpEvent(rig, { host, players: { mate }, name: 'Event C', seats: [['mate', 1]], quiet: false })

    // Event A
    const [, open1, open2] = a.slotIds as [string, string, string]
    expect((await send('POST', `/api/e/${a.slug}/team-word`, a.players.doomed.cookie, { word: 'Quokka' })).status).toBe(200)
    expect((await vote(a.slug, open1, a.players.doomed, 'yes', 'Gern')).status).toBe(200)
    expect((await vote(a.slug, open2, a.players.doomed, 'maybe', 'Mal sehen')).status).toBe(200)
    expect((await vote(a.slug, open1, a.players.mate, 'no', 'Lieber nicht')).status).toBe(200)
    const aLive = await write(a.slug, a.players.doomed, 'Hallo zusammen')
    const aHostDeleted = await write(a.slug, a.players.doomed, 'Das geht die Hostess nichts an')
    const mateWrote = await write(a.slug, a.players.mate, 'Moin')
    expect((await send('DELETE', `/api/e/${a.slug}/messages/${aHostDeleted}`, a.host.cookie)).status).toBe(200)
    const { drawId } = await hostSpins(rig, a)
    await clockToStop(rig, drawId)
    await playerVetoes(rig, a, drawId, a.players.doomed)

    // Event B
    if (seat === 'team') expect((await send('POST', `/api/e/${b.slug}/team-word`, b.players.doomed.cookie, { word: 'Zwei' })).status).toBe(200)
    const bMessage = await write(b.slug, b.players.doomed, 'Letzte Worte')
    for (const game of [b.games.halo, b.games.kart]) {
      const roundId = await hostSets(rig, b, game.id)
      await hostEntersResult(rig, b, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    }
    await hostFinishes(rig, b, { outcome: 'winner', winners: [1] })
    await testDb.db.insert(pollVotes).values([
      { slotId: b.slotIds[0]!, userId: a.players.doomed.id, value: 'yes', note: 'Alt' },
      { slotId: b.slotIds[0]!, userId: a.players.mate.id, value: 'no', note: 'Auch alt' },
    ])

    await testDb.db.update(users).set({ displayName: 'Quokka-Anzeige', canHost: true, isAdmin: true, newsSeen: '0.20.0', tourSeen: 3, appearance: 'dark', profileImageKey: null })
      .where(eq(users.id, a.players.doomed.id))
    notifier.clear()
    return { a, b, c, id: a.players.doomed.id, cookie: a.players.doomed.cookie, open1, open2, aLive, aHostDeleted, mateWrote, bMessage, drawId }
  }

  const userRow = async (id: string) => (await testDb.db.select().from(users).where(eq(users.id, id)))[0]!
  const messageRows = (writerId: string) => testDb.db.select().from(messages).where(eq(messages.writerId, writerId)).orderBy(messages.writtenAt, messages.id)
  const votesOf = (userId: string) => testDb.db.select().from(pollVotes).where(eq(pollVotes.userId, userId))
  const seatOf = async (eventId: string, userId: string) => (await testDb.db.select().from(eventMembers).where(eq(eventMembers.userId, userId))).filter(row => row.eventId === eventId)

  /** Every table the deletion may touch, as plain data, for "nothing changed" and "everything as it was". */
  async function snapshot() {
    return {
      users: await testDb.db.select().from(users).orderBy(users.id),
      sessions: await testDb.db.select().from(authSessions).orderBy(authSessions.id),
      accounts: await testDb.db.select().from(authAccounts).orderBy(authAccounts.id),
      messages: await testDb.db.select().from(messages).orderBy(messages.id),
      votes: await testDb.db.select().from(pollVotes).orderBy(pollVotes.slotId, pollVotes.userId),
      members: await testDb.db.select().from(eventMembers).orderBy(eventMembers.eventId, eventMembers.userId),
      vetoes: await testDb.db.select().from(vetoes).orderBy(vetoes.drawId, vetoes.team),
      feed: await testDb.db.select().from(activity).orderBy(activity.id),
      events: await testDb.db.select().from(events).orderBy(events.id),
      games: await testDb.db.select().from(games).orderBy(games.id),
    }
  }

  describe('the answer and the User\'s rows', () => {
    it('answers { deleted: true } and cuts the Messages: no text, deleted by their writer at the moment of the deletion, the Host\'s own deletion kept', async () => {
      const w = await world()
      const hostDeletedAt = (await messageRows(w.id)).find(row => row.id === w.aHostDeleted)!.deletedAt
      clock.set(NOW)

      const response = await deleteMe(w.cookie)

      expect(response.status).toBe(200)
      expect(await response.json() as AccountDeleted).toEqual({ deleted: true })
      const rows = await messageRows(w.id)
      expect(rows).toHaveLength(3)
      for (const row of rows) expect(row.text).toBeNull()
      expect(rows.find(row => row.id === w.aLive)).toMatchObject({ deletedBy: 'writer', deletedAt: new Date(NOW) })
      expect(rows.find(row => row.id === w.bMessage)).toMatchObject({ deletedBy: 'writer', deletedAt: new Date(NOW) })
      expect(rows.find(row => row.id === w.aHostDeleted)).toMatchObject({ deletedBy: 'host', deletedAt: hostDeletedAt })
      // Somebody else's Message is untouched.
      expect(await messageRows(w.a.players.mate.id)).toMatchObject([{ id: w.mateWrote, text: 'Moin', deletedAt: null }])
    })

    it('deletes the Votes with their Notes in every Event and clears the Team word, finished Events included', async () => {
      const w = await world()
      const words = () => testDb.db.select({ word: eventMembers.teamWord }).from(eventMembers).where(eq(eventMembers.userId, w.id))
      expect((await words()).map(row => row.word).sort()).toEqual(['Quokka', 'Zwei'])
      expect(await votesOf(w.id)).toHaveLength(3)

      await deleteMe(w.cookie)

      expect(await votesOf(w.id)).toEqual([])
      // Another Member's Votes are still there.
      expect(await votesOf(w.a.players.mate.id)).toHaveLength(2)
      expect(await words()).toEqual([{ word: null }])
    })

    it('ends the membership of an Event that has not finished and keeps a Player\'s Seat in a finished one, their Party and its frozen name', async () => {
      const w = await world()
      const finishedBefore = await readEvent(rig, w.b.host.cookie, w.b.slug)
      const seatBefore = finishedBefore.members.find(member => member.id === w.id)!
      expect(seatBefore).toMatchObject({ zone: 'team', team: 1, teamWord: 'Zwei' })

      await deleteMe(w.cookie)

      expect(await seatOf(w.a.eventId, w.id)).toEqual([])
      expect(await seatOf(w.c.eventId, w.id)).toEqual([])
      const finishedAfter = await readEvent(rig, w.b.host.cookie, w.b.slug)
      expect(finishedAfter.members.find(member => member.id === w.id)).toEqual({ id: w.id, name: '', image: null, deleted: true, isHost: false, zone: 'team', team: 1, teamWord: null })
      expect(finishedAfter.standings).toEqual(finishedBefore.standings)
      expect(finishedAfter.results).toEqual(finishedBefore.results)
      const liveAfter = await readEvent(rig, w.a.host.cookie, w.a.slug)
      expect(liveAfter.members.map(member => member.id)).not.toContain(w.id)
    })

    it('keeps a Member on the Stands of a finished Event on the Stands', async () => {
      const w = await world('stands')

      await deleteMe(w.cookie)

      const after = await readEvent(rig, w.b.host.cookie, w.b.slug)
      expect(after.members.find(member => member.id === w.id)).toEqual({ id: w.id, name: '', image: null, deleted: true, isHost: false, zone: 'stands', team: null, teamWord: null })
      expect(await seatOf(w.a.eventId, w.id)).toEqual([])
    })

    it('leaves the Vetoes and the Activity entries in place, still pointing at the User', async () => {
      const w = await world()
      const cast = await testDb.db.select().from(vetoes).where(eq(vetoes.userId, w.id))
      const feed = await testDb.db.select().from(activity).where(eq(activity.actorId, w.id))
      expect(cast).toHaveLength(1)
      expect(feed.length).toBeGreaterThan(0)

      await deleteMe(w.cookie)

      expect(await testDb.db.select().from(vetoes).where(eq(vetoes.userId, w.id))).toEqual(cast)
      expect(await testDb.db.select().from(activity).where(eq(activity.actorId, w.id))).toEqual(feed)
    })

    it('empties the row and marks it, with no provider account and no sign-in session; the row stays', async () => {
      const w = await world()
      const othersSessions = (await testDb.db.select().from(authSessions)).filter(row => row.userId !== w.id).length
      expect(othersSessions).toBeGreaterThan(0)
      clock.set(NOW)

      await deleteMe(w.cookie)

      expect(await userRow(w.id)).toMatchObject({
        id: w.id, name: '', email: `${w.id}@deleted.placeholder.invalid`, emailVerified: false, image: null, displayName: null, profileImageKey: null,
        canHost: false, isAdmin: false, newsSeen: null, tourSeen: 0, appearance: 'light', deletedAt: new Date(NOW),
      })
      expect(await testDb.db.select().from(authAccounts).where(eq(authAccounts.userId, w.id))).toEqual([])
      expect(await testDb.db.select().from(authSessions).where(eq(authSessions.userId, w.id))).toEqual([])
      // Nobody else lost an account or a session.
      expect(await testDb.db.select().from(authAccounts)).toHaveLength(4)
      expect((await testDb.db.select().from(authSessions)).length).toBe(othersSessions)
    })
  })

  describe('after the deletion', () => {
    it('answers as signed out to the old cookie, and the response expires the session cookie', async () => {
      const w = await world()
      expect((await me(w.cookie))?.id).toBe(w.id)

      const response = await deleteMe(w.cookie)

      const cookies = response.headers.getSetCookie()
      expect(cookies.some(cookie => /session_token=;/.test(cookie) && /max-age=0/i.test(cookie))).toBe(true)
      expect(await me(w.cookie)).toBeNull()
      expect((await send('GET', `/api/e/${w.a.slug}`, w.cookie)).status).toBe(401)
    })

    it('lets the same provider account sign in as a new User with nothing of the old one, and with the Host permission when its id is on the list (ADR 0002)', async () => {
      const w = await world()
      await deleteMe(w.cookie)
      setAllowlist({ hosts: 'discord:1,discord:2' })

      const { cookie } = await signIn(testDb.db, doomed)

      const fresh = await me(cookie)
      expect(fresh).toMatchObject({ name: 'Quokka', displayName: null, canHost: true, isAdmin: false })
      expect(fresh!.id).not.toBe(w.id)
      expect(await votesOf(fresh!.id)).toEqual([])
      expect(await messageRows(fresh!.id)).toEqual([])
      expect(await testDb.db.select().from(eventMembers).where(eq(eventMembers.userId, fresh!.id))).toEqual([])
      expect((await userRow(w.id)).deletedAt).toEqual(clock.now())
    })

    it('refuses a second call: the session is gone', async () => {
      const w = await world()
      await deleteMe(w.cookie)

      expect((await deleteMe(w.cookie)).status).toBe(401)
    })
  })

  describe('the uploaded Profile picture', () => {
    async function upload(cookie: string) {
      const response = await request('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp', cookie }, body: lossy() as BodyInit })
      expect(response.status).toBe(200)
      return (await response.json() as { image: string }).image
    }

    it('is removed from the store after the commit, and its address answers like a missing route', async () => {
      const w = await world()
      const address = await upload(w.cookie)
      expect(store.keys()).toHaveLength(1)
      expect((await request(address)).status).toBe(200)

      expect((await deleteMe(w.cookie)).status).toBe(200)

      expect(store.keys()).toEqual([])
      expect((await request(address)).status).toBe(404)
    })

    it('still answers 200 when the store cannot delete the object', async () => {
      const w = await world()
      await upload(w.cookie)
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      failDelete = true

      const response = await deleteMe(w.cookie)

      expect(response.status).toBe(200)
      expect(log).toHaveBeenCalled()
      expect((await userRow(w.id)).deletedAt).toEqual(clock.now())
    })

    it('needs no store for a User with no picture: a deployment without R2 configuration still deletes them', async () => {
      const w = await world()
      const bare = createTestApp(testDb.db, { roomNotifier: notifier, clock })

      const response = await bare('/api/me', { method: 'DELETE', headers: { cookie: w.cookie } })

      expect(response.status).toBe(200)
      expect((await userRow(w.id)).deletedAt).toEqual(clock.now())
    })
  })

  describe('a User who cannot be deleted yet', () => {
    it('is refused with account_hosts when they host an Event, and nothing changes', async () => {
      const w = await world()
      const before = await snapshot()

      const response = await deleteMe(w.a.host.cookie)

      expect(await errorOf(response)).toEqual({ status: 409, code: 'account_hosts' })
      expect(await snapshot()).toEqual(before)
      expect(notifier.closes(w.a.eventId)).toEqual([])
      expect(notifier.messages(w.a.eventId)).toEqual([])
    })

    it('is refused with account_hosts when they only own a game, and nothing changes', async () => {
      const w = await world()
      await testDb.db.insert(games).values({ name: 'Eigenes Spiel', createdBy: w.id })
      const before = await snapshot()

      const response = await deleteMe(w.cookie)

      expect(await errorOf(response)).toEqual({ status: 409, code: 'account_hosts' })
      expect(await snapshot()).toEqual(before)
      expect(notifier.closes(w.a.eventId)).toEqual([])
    })

    it('is refused with account_hosts for a Host of a finished Event only', async () => {
      const w = await world()
      await testDb.db.update(events).set({ hostId: w.id }).where(eq(events.id, w.b.eventId))
      const before = await snapshot()

      expect(await errorOf(await deleteMe(w.cookie))).toEqual({ status: 409, code: 'account_hosts' })
      expect(await snapshot()).toEqual(before)
    })

    it('answers 401 to a request signed out and changes nothing', async () => {
      const w = await world()
      const before = await snapshot()

      expect((await deleteMe()).status).toBe(401)
      expect(await snapshot()).toEqual(before)
      expect(notifier.closes(w.a.eventId)).toEqual([])
    })
  })

  describe('a failure', () => {
    it('leaves everything as it was: the rows, the image, and no message to any room', async () => {
      const w = await world()
      const picture = await request('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp', cookie: w.cookie }, body: lossy() as BodyInit })
      expect(picture.status).toBe(200)
      // The last statement fails: the placeholder email is taken already, so the unique index on the email refuses the emptied row.
      await testDb.db.insert(users).values({ name: 'Besetzt', email: `${w.id}@deleted.placeholder.invalid` })
      const before = await snapshot()
      const stored = store.keys()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await deleteMe(w.cookie)

      expect(response.status).toBe(500)
      expect(await snapshot()).toEqual(before)
      expect(store.keys()).toEqual(stored)
      for (const eventId of [w.a.eventId, w.b.eventId, w.c.eventId]) {
        expect(notifier.messages(eventId)).toEqual([])
        expect(notifier.closes(eventId)).toEqual([])
      }
      expect((await me(w.cookie))?.id).toBe(w.id)
    })

    it('lets one of two simultaneous deletions win: the other answers 401 or 500 and changes nothing more', async () => {
      const w = await world()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const answers = await Promise.all([deleteMe(w.cookie), deleteMe(w.cookie)])

      const statuses = answers.map(answer => answer.status).sort()
      expect(statuses[0]).toBe(200)
      expect([401, 500]).toContain(statuses[1])
      expect(await votesOf(w.id)).toEqual([])
      expect(notifier.closes(w.a.eventId)).toEqual([{ users: [w.id], messages: [expect.objectContaining({ type: 'event.changed' })] }])
    })
  })

  describe('the rooms', () => {
    it('tells each Event the User was a Member of: event.changed first, then one chat.deleted per Message that lost its text, and closes their sockets with event.changed', async () => {
      const w = await world()

      await deleteMe(w.cookie)

      expect(notifier.messages(w.a.eventId)).toEqual([
        expect.objectContaining({ type: 'event.changed', v: 1 }),
        expect.objectContaining({ type: 'chat.deleted', id: w.aLive, deletedBy: 'writer' }),
      ])
      expect(notifier.messages(w.b.eventId)).toEqual([
        expect.objectContaining({ type: 'event.changed', v: 1 }),
        expect.objectContaining({ type: 'chat.deleted', id: w.bMessage, deletedBy: 'writer' }),
      ])
      for (const eventId of [w.a.eventId, w.b.eventId]) {
        expect(notifier.closes(eventId)).toEqual([{ users: [w.id], messages: [expect.objectContaining({ type: 'event.changed', v: 1 })] }])
        expect(notifier.sends(eventId)).toEqual([{ to: null, messages: notifier.messages(eventId) }])
      }
    })

    it('says nothing in an Event the User was no Member of', async () => {
      const w = await world()

      await deleteMe(w.cookie)

      expect(notifier.messages(w.c.eventId)).toEqual([])
      expect(notifier.closes(w.c.eventId)).toEqual([])
    })

    it('says only event.changed for a User with no Message in the Event', async () => {
      const w = await world()
      await testDb.db.delete(messages).where(inArray(messages.id, [w.aLive, w.aHostDeleted]))

      await deleteMe(w.cookie)

      expect(notifier.messages(w.a.eventId)).toEqual([expect.objectContaining({ type: 'event.changed' })])
    })

    it('tells a User in no Event nothing at all, and deletes them', async () => {
      const w = await world()
      const lonely = await signIn(testDb.db, plain)
      const row = (await testDb.db.select({ id: users.id }).from(users).where(eq(users.email, plain.email)))[0]!

      expect((await deleteMe(lonely.cookie)).status).toBe(200)

      expect((await userRow(row.id)).deletedAt).toEqual(clock.now())
      for (const eventId of [w.a.eventId, w.b.eventId, w.c.eventId]) {
        expect(notifier.messages(eventId)).toEqual([])
        expect(notifier.closes(eventId)).toEqual([])
      }
    })

    it('records nothing for an Event its Host deleted, but still takes the User\'s Votes out of it', async () => {
      const w = await world()
      await testDb.db.update(events).set({ deletedAt: new Date(T0) }).where(eq(events.id, w.a.eventId))
      const slots = (await testDb.db.select({ id: pollSlots.id }).from(pollSlots).where(eq(pollSlots.eventId, w.a.eventId))).map(row => row.id)
      expect((await testDb.db.select().from(pollVotes).where(inArray(pollVotes.slotId, slots))).some(row => row.userId === w.id)).toBe(true)

      await deleteMe(w.cookie)

      expect(notifier.messages(w.a.eventId)).toEqual([])
      expect(notifier.closes(w.a.eventId)).toEqual([])
      expect((await testDb.db.select().from(pollVotes).where(inArray(pollVotes.slotId, slots))).some(row => row.userId === w.id)).toBe(false)
      expect(await seatOf(w.a.eventId, w.id)).toEqual([])
      // The other Events still hear it.
      expect(notifier.closes(w.b.eventId)).toHaveLength(1)
    })
  })
})
