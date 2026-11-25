import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, eventMembers, events, messages, pollVotes, users, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { MessagePage } from '../../shared/chat'
import type { HomeView } from '../../shared/event'
import { createTestApp, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { clockToStop, hostSpins, playerVetoes, readEvent, readFeed, setUpEvent, signInAs, startRunningEvent, type Rig, type Signed } from './scenario'
import { stubAuthEnv } from './sign-in'

// The Host removes a Member from an Event (#697, spec #894 § Host removes Members, ADR 0006, 0013, 0020): POST /api/e/:slug/remove-member ends the membership through the
// rule of the Deleted User (`endMembership`, #681), writes a `member_removed` entry, can rotate the Invite link in the same transaction, and sends the removed User one
// last message, `member.removed`, before the room closes their sockets (`publishLast`, #913). The Seat, the Team word and the Votes with their Notes go; Messages, older
// Activity entries and Vetoes stay. A removed User is no Member: every read and write of the Event answers 404, never 410.

// `createInviteToken` can be told to answer a fixed token, so that the rotation of the Invite link fails on the unique index of `invite_token`.
const token = vi.hoisted(() => ({ override: null as string | null }))
vi.mock('../../server/domain/slug', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/domain/slug')>()
  return { ...real, createInviteToken: () => token.override ?? real.createInviteToken() }
})

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const people = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
  stands: { provider: 'twitch', id: '6', name: 'Tribuene', email: 'stands@example.com', image: undefined },
} as const
const outsider = { provider: 'discord', id: '7', name: 'Fremder', email: 'outsider@example.com', image: undefined } as const
const newcomer = { provider: 'twitch', id: '8', name: 'Neu', email: 'newcomer@example.com', image: undefined } as const

const T0 = '2090-10-30T10:00:00.000Z'

describe('the Host removes a Member', () => {
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
    token.override = null
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const send = sendVia(() => request)

  const vote = (slug: string, slotId: string, who: Signed, value: 'yes' | 'maybe' | 'no', note?: string) =>
    send('PUT', `/api/e/${slug}/slots/${slotId}/vote`, who.cookie, note === undefined ? { value } : { value, note })

  const remove = (slug: string, cookie: string | undefined, body: unknown) => send('POST', `/api/e/${slug}/remove-member`, cookie, body)

  const code = async (response: Response) => (await response.json() as { statusMessage: string }).statusMessage

  /**
   * A Lucky Wheel Event with a Running Session, joined through the Invite link: One and Two in team 1, Three and Four in team 2, a Member on the Stands. Of its three Slots the
   * first is the Date of the first Session, so the poll for the second Session is open with two Slots. One has a Team word, a Message, Votes with Notes on both Slots and the
   * Veto of team 1 on the open Veto window; Two and Stands have a Vote each, Three and Four none.
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
    return { ev, open1, open2, drawId }
  }

  /** What a refused removal must leave as it was: the Members, the Votes, the Event rows (the Invite token) and the feed. */
  async function stateOf(eventId: string) {
    return {
      members: await testDb.db.select().from(eventMembers).where(eq(eventMembers.eventId, eventId)).orderBy(eventMembers.userId),
      votes: await testDb.db.select().from(pollVotes).orderBy(pollVotes.slotId, pollVotes.userId),
      events: await testDb.db.select().from(events).orderBy(events.id),
      activity: await testDb.db.select().from(activity).where(eq(activity.eventId, eventId)).orderBy(activity.id),
      messages: await testDb.db.select().from(messages).where(eq(messages.eventId, eventId)).orderBy(messages.id),
      vetoes: await testDb.db.select().from(vetoes).orderBy(vetoes.userId),
    }
  }

  const membership = (eventId: string, userId: string) => testDb.db.select().from(eventMembers).where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
  const votesOf = (userId: string) => testDb.db.select().from(pollVotes).where(eq(pollVotes.userId, userId))
  const inviteOf = async (eventId: string) => (await testDb.db.select({ token: events.inviteToken }).from(events).where(eq(events.id, eventId)))[0]!.token

  describe('what goes', () => {
    it('takes a Player out: the membership with Seat and Team word, their Votes with the Notes, in a Running Session with an open Veto window', async () => {
      const { ev, open1, open2 } = await running()
      const before = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(before.members.find(member => member.id === ev.players.one.id)).toMatchObject({ zone: 'team', team: 1, teamWord: 'Quokka' })
      expect(before.teams.find(team => team.position === 1)?.name).toBe('Quokka')
      expect(before.progress).toEqual({ voted: 1, total: 6 })

      const response = await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: false })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ userId: ev.players.one.id, inviteUrl: null })
      expect(await membership(ev.eventId, ev.players.one.id)).toEqual([])
      expect(await votesOf(ev.players.one.id)).toEqual([])
      const after = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(after.members.map(member => member.id)).not.toContain(ev.players.one.id)
      expect(after.members).toHaveLength(before.members.length - 1)
      expect(after.progress).toEqual({ voted: 0, total: 5 })
      expect(after.votes.map(row => [row.slotId, row.userId]).sort()).toEqual([[open1, ev.players.two.id], [open1, ev.players.stands.id]].sort())
      expect(after.votes.filter(row => row.slotId === open2)).toEqual([])
      expect(JSON.stringify(after.votes)).not.toContain('Gern')
      expect(after.teams.find(team => team.position === 1)?.name).toBeNull()
    })

    it('takes a Member on the Stands out the same way', async () => {
      const { ev, open1 } = await running()

      expect((await remove(ev.slug, ev.host.cookie, { userId: ev.players.stands.id, rotateInvite: false })).status).toBe(200)

      expect(await membership(ev.eventId, ev.players.stands.id)).toEqual([])
      expect(await votesOf(ev.players.stands.id)).toEqual([])
      const after = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(after.members.map(member => member.id)).not.toContain(ev.players.stands.id)
      expect(after.progress).toEqual({ voted: 1, total: 5 })
      expect(after.votes.filter(row => row.slotId === open1).map(row => row.userId).sort()).toEqual([ev.players.one.id, ev.players.two.id].sort())
    })

    it('takes the only Player of a team out, and a Member who has no Votes at all', async () => {
      const ev = await setUpEvent(rig, {
        host, players: { one: people.one, two: people.two }, seats: [['one', 1]], sessions: 1, confirmed: 1, slots: ['2090-10-30T20:30'], join: 'invite', quiet: false,
      })

      const response = await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: false })

      expect(response.status).toBe(200)
      const after = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(after.members.map(member => member.id).sort()).toEqual([ev.host.id, ev.players.two.id].sort())
      expect((await remove(ev.slug, ev.host.cookie, { userId: ev.players.two.id, rotateInvite: false })).status).toBe(200)
    })
  })

  describe('what stays', () => {
    it('keeps their Messages, their older Activity entries and the Vetoes, and the Host still reads them by name', async () => {
      const { ev } = await running()
      const one = ev.players.one
      const written = await testDb.db.select().from(messages).where(eq(messages.writerId, one.id))
      const cast = await testDb.db.select().from(vetoes).where(eq(vetoes.userId, one.id))
      const older = await testDb.db.select().from(activity).where(eq(activity.eventId, ev.eventId))
      const hostView = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(written).toHaveLength(1)
      expect(cast).toHaveLength(1)

      expect((await remove(ev.slug, ev.host.cookie, { userId: one.id, rotateInvite: false })).status).toBe(200)

      expect(await testDb.db.select().from(messages).where(eq(messages.writerId, one.id))).toEqual(written)
      expect(await testDb.db.select().from(vetoes).where(eq(vetoes.userId, one.id))).toEqual(cast)
      const rows = await testDb.db.select().from(activity).where(eq(activity.eventId, ev.eventId))
      for (const row of older) expect(rows.find(other => other.id === row.id), `entry ${row.type} stays`).toEqual(row)
      expect(older.some(row => row.actorId === one.id || (row.params as { userId?: string }).userId === one.id)).toBe(true)
      // The Party keeps its Veto: the Host's read of the wheel is as it was, and the Party's other Player cannot cast it again.
      const after = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(after.wheel).toEqual(hostView.wheel)
      expect(after.bonusVetoes).toEqual(hostView.bonusVetoes)
      const again = await send('POST', `/api/e/${ev.slug}/draws/${cast[0]!.drawId}/veto`, ev.players.two.cookie)
      expect(again.status).toBeGreaterThanOrEqual(400)
      expect(await testDb.db.select().from(vetoes).where(eq(vetoes.userId, ev.players.two.id))).toEqual([])
      expect(await testDb.db.select().from(vetoes)).toHaveLength(1)

      const page = await (await send('GET', `/api/e/${ev.slug}/messages`, ev.host.cookie)).json() as MessagePage
      expect(page.messages).toMatchObject([{ writerId: one.id, text: 'Hallo zusammen' }])
      expect(page.writers[one.id]).toMatchObject({ name: 'Eins' })
      expect(page.writers[one.id]!.deleted).toBeUndefined()
      const feed = await readFeed(rig, ev.host.cookie, ev.slug, 'limit=100')
      const joined = feed.find(entry => entry.type === 'member_joined' && entry.actor?.id === one.id)
      expect(joined?.actor).toEqual({ id: one.id, name: 'Eins' })
      const removed = feed.filter(entry => entry.type === 'member_removed')
      expect(removed).toHaveLength(1)
      expect(removed[0]).toMatchObject({ actor: { id: ev.host.id, name: 'Hostess' }, params: { userId: one.id }, people: { [one.id]: 'Eins' } })
    })

    it('carries a removed User to the Chat read as name and picture alone, no e-mail and no other column of the User (0.21-9, #916)', async () => {
      const { ev } = await running()
      const one = ev.players.one
      await testDb.db.update(users).set({ image: 'https://example.com/eins.png' }).where(eq(users.id, one.id))
      expect((await remove(ev.slug, ev.host.cookie, { userId: one.id, rotateInvite: false })).status).toBe(200)

      const body = await (await send('GET', `/api/e/${ev.slug}/messages`, ev.host.cookie)).text()
      const page = JSON.parse(body) as MessagePage

      expect(page.messages).toMatchObject([{ writerId: one.id, text: 'Hallo zusammen' }])
      expect(Object.keys(page.writers[one.id]!).sort()).toEqual(['image', 'name'])
      expect(page.writers[one.id]).toEqual({ name: 'Eins', image: 'https://example.com/eins.png' })
      expect(body).not.toContain('one@example.com')
    })
  })

  describe('rotating the Invite link', () => {
    it('with rotateInvite the old link answers 404, the answer and the Host\'s read hold the new link, a newcomer joins through it, and the only entry is member_removed', async () => {
      const { ev } = await running()
      const feedBefore = (await testDb.db.select().from(activity).where(eq(activity.eventId, ev.eventId))).length
      const oldToken = await inviteOf(ev.eventId)

      const response = await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: true })

      expect(response.status).toBe(200)
      const answer = await response.json() as { userId: string, inviteUrl: string }
      expect(answer.userId).toBe(ev.players.one.id)
      expect(await inviteOf(ev.eventId)).not.toBe(oldToken)
      expect(answer.inviteUrl).toBe((await readEvent(rig, ev.host.cookie, ev.slug)).inviteUrl)
      const oldInvite = ev.inviteToken
      expect((await send('GET', `/api/invite/${oldInvite}`, undefined)).status).toBe(404)
      const newcomerSigned = await signInAs(rig, newcomer)
      expect((await send('POST', `/api/invite/${oldInvite}`, newcomerSigned.cookie)).status).toBe(404)
      const newInvite = new URL(answer.inviteUrl).pathname.slice('/e/'.length)
      expect((await send('GET', `/api/invite/${newInvite}`, undefined)).status).toBe(200)
      expect((await send('POST', `/api/invite/${newInvite}`, newcomerSigned.cookie)).status).toBe(200)
      // The removal wrote its one entry; the rotation wrote none, and the newcomer's join is the other new one.
      const feed = await testDb.db.select().from(activity).where(eq(activity.eventId, ev.eventId))
      expect(feed.map(row => row.type).slice(feedBefore).sort()).toEqual(['member_joined', 'member_removed'])
    })

    it('without it the token stays and inviteUrl is null', async () => {
      const { ev } = await running()
      const oldToken = await inviteOf(ev.eventId)

      const answer = await (await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: false })).json()

      expect(answer).toEqual({ userId: ev.players.one.id, inviteUrl: null })
      expect(await inviteOf(ev.eventId)).toBe(oldToken)
      expect((await send('GET', `/api/invite/${ev.inviteToken}`, undefined)).status).toBe(200)
    })

    it('leaves the Member in, with their Votes, the feed and the token, and tells the room nothing, when the rotation fails', async () => {
      const { ev } = await running()
      const other = await setUpEvent(rig, { host, name: 'Zweites Event', players: {}, seats: [], sessions: 1, confirmed: 0, slots: ['2090-10-30T20:30'] })
      token.override = await inviteOf(other.eventId)
      notifier.clear()
      const before = await stateOf(ev.eventId)
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: true })

      expect(response.status).toBe(500)
      expect(logged).toHaveBeenCalled()
      expect(await stateOf(ev.eventId)).toEqual(before)
      expect(notifier.messages(ev.eventId)).toEqual([])
      expect(notifier.closes(ev.eventId)).toEqual([])
    })
  })

  describe('refusals', () => {
    it.each([
      ['a Member who is not the Host', 403, 'not_host', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.players.two.cookie, body: { userId: ev.players.one.id, rotateInvite: false } })],
      ['a User who is no Member', 404, 'Event not found', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.outsiders.outsider.cookie, body: { userId: ev.players.one.id, rotateInvite: false } })],
      ['the Host naming themselves', 400, 'invalid_value', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.host.cookie, body: { userId: ev.host.id, rotateInvite: false } })],
      ['a UUID that is no Member of the Event', 404, 'member_not_found', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.host.cookie, body: { userId: ev.outsiders.outsider.id, rotateInvite: false } })],
      ['a userId that is no UUID', 400, 'invalid_value', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.host.cookie, body: { userId: 'eins', rotateInvite: false } })],
      ['a body without rotateInvite', 400, 'invalid_value', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.host.cookie, body: { userId: ev.players.one.id } })],
      ['a rotateInvite that is no boolean', 400, 'invalid_value', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.host.cookie, body: { userId: ev.players.one.id, rotateInvite: 'true' } })],
      ['a body that is no object', 400, 'invalid_value', (ev: Awaited<ReturnType<typeof running>>['ev']) => ({ cookie: ev.host.cookie, body: 'eins' })],
    ])('refuses %s with %i %s and changes nothing, in the rows, the feed and the room', async (_name, status, statusMessage, build) => {
      const { ev } = await running()
      notifier.clear()
      const before = await stateOf(ev.eventId)
      const { cookie, body } = build(ev)

      const response = await remove(ev.slug, cookie, body)

      expect(response.status).toBe(status)
      expect(await code(response)).toBe(statusMessage)
      expect(await stateOf(ev.eventId)).toEqual(before)
      expect(notifier.messages(ev.eventId)).toEqual([])
      expect(notifier.closes(ev.eventId)).toEqual([])
    })

    it('refuses a signed-out request with 401', async () => {
      const { ev } = await running()
      const before = await stateOf(ev.eventId)

      expect((await remove(ev.slug, undefined, { userId: ev.players.one.id, rotateInvite: false })).status).toBe(401)

      expect(await stateOf(ev.eventId)).toEqual(before)
    })

    it('refuses a finished Event with wrong_phase for the Host and not_host for a Member, and changes nothing', async () => {
      const { ev } = await running()
      await testDb.db.update(events).set({ phase: 'finished', finishedAt: new Date(T0) }).where(eq(events.id, ev.eventId))
      notifier.clear()
      const before = await stateOf(ev.eventId)

      const byHost = await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: true })
      const byMember = await remove(ev.slug, ev.players.two.cookie, { userId: ev.players.one.id, rotateInvite: true })

      expect([byHost.status, await code(byHost)]).toEqual([409, 'wrong_phase'])
      expect([byMember.status, await code(byMember)]).toEqual([403, 'not_host'])
      expect(await stateOf(ev.eventId)).toEqual(before)
      expect(notifier.messages(ev.eventId)).toEqual([])
      expect(notifier.closes(ev.eventId)).toEqual([])
    })

    it('answers the second removal of the same Member, from a second tab, with member_not_found and sends nothing', async () => {
      const { ev } = await running()
      expect((await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: false })).status).toBe(200)
      notifier.clear()
      const before = await stateOf(ev.eventId)

      const again = await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: true })

      expect([again.status, await code(again)]).toEqual([404, 'member_not_found'])
      expect(await stateOf(ev.eventId)).toEqual(before)
      expect(notifier.messages(ev.eventId)).toEqual([])
      expect(notifier.closes(ev.eventId)).toEqual([])
    })
  })

  describe('after the removal', () => {
    it('answers the removed User 404 Event not found on every read and write, never 410, and Home lacks the Event', async () => {
      const { ev, open1, drawId } = await running()
      const one = ev.players.one
      expect((await remove(ev.slug, ev.host.cookie, { userId: one.id, rotateInvite: false })).status).toBe(200)

      const answers = {
        'the Event read': await send('GET', `/api/e/${ev.slug}`, one.cookie),
        'the Chat read': await send('GET', `/api/e/${ev.slug}/messages`, one.cookie),
        'the feed read': await send('GET', `/api/e/${ev.slug}/activity`, one.cookie),
        'the room token': await send('POST', `/api/e/${ev.slug}/room`, one.cookie),
        'a vote': await vote(ev.slug, open1, one, 'yes'),
        'a message': await send('POST', `/api/e/${ev.slug}/messages`, one.cookie, { id: randomUUID(), text: 'Noch da?' }),
        'a move': await send('POST', `/api/e/${ev.slug}/move`, one.cookie, { userId: one.id, to: { zone: 'stands' } }),
        'a Veto': await send('POST', `/api/e/${ev.slug}/draws/${drawId}/veto`, one.cookie),
        'a rotation': await send('POST', `/api/e/${ev.slug}/rotate`, one.cookie),
      }
      for (const [name, response] of Object.entries(answers)) {
        expect(response.status, name).toBe(404)
        expect(await code(response), name).toBe('Event not found')
      }
      const home = await (await send('GET', '/api/e', one.cookie)).json() as HomeView
      expect(home.events.map(entry => entry.slug)).not.toContain(ev.slug)
    })

    it('lets the removed User join again through the current Invite link: a new Member on the Stands, with no Votes and no Team word, and a new member_joined entry', async () => {
      const { ev } = await running()
      const one = ev.players.one
      expect((await remove(ev.slug, ev.host.cookie, { userId: one.id, rotateInvite: false })).status).toBe(200)
      const joinedBefore = (await readFeed(rig, ev.host.cookie, ev.slug, 'limit=100')).filter(entry => entry.type === 'member_joined').length

      expect((await send('POST', `/api/invite/${ev.inviteToken}`, one.cookie)).status).toBe(200)

      const view = await readEvent(rig, ev.host.cookie, ev.slug)
      expect(view.members.find(member => member.id === one.id)).toMatchObject({ zone: 'stands', team: null, teamWord: null })
      expect(view.votes.filter(row => row.userId === one.id)).toEqual([])
      expect((await readFeed(rig, ev.host.cookie, ev.slug, 'limit=100')).filter(entry => entry.type === 'member_joined')).toHaveLength(joinedBefore + 1)
    })
  })

  describe('the room', () => {
    it('gets event.changed and activity.added for everyone and one last member.removed for the removed User alone', async () => {
      const { ev } = await running()
      notifier.clear()

      expect((await remove(ev.slug, ev.host.cookie, { userId: ev.players.one.id, rotateInvite: false })).status).toBe(200)

      expect(notifier.messages(ev.eventId).map(message => message.type)).toEqual(['event.changed', 'activity.added'])
      expect(notifier.sends(ev.eventId).every(sent => sent.to === null)).toBe(true)
      expect(notifier.closes(ev.eventId)).toEqual([{ users: [ev.players.one.id], messages: [{ type: 'member.removed', v: 1, serverTime: expect.any(Number) }] }])
    })

    it('sends the same when the removal rotates the Invite link', async () => {
      const { ev } = await running()
      notifier.clear()

      expect((await remove(ev.slug, ev.host.cookie, { userId: ev.players.stands.id, rotateInvite: true })).status).toBe(200)

      expect(notifier.messages(ev.eventId).map(message => message.type)).toEqual(['event.changed', 'activity.added'])
      expect(notifier.closes(ev.eventId)).toEqual([{ users: [ev.players.stands.id], messages: [{ type: 'member.removed', v: 1, serverTime: expect.any(Number) }] }])
    })
  })

  describe('a removed User who deletes their account later', () => {
    it('is listed as deleted in their old entry and in the member_removed entry, with an empty name', async () => {
      const { ev } = await running()
      const one = ev.players.one
      expect((await remove(ev.slug, ev.host.cookie, { userId: one.id, rotateInvite: false })).status).toBe(200)

      expect((await send('DELETE', '/api/me', one.cookie)).status).toBe(200)

      const feed = await readFeed(rig, ev.host.cookie, ev.slug, 'limit=100')
      const joined = feed.find(entry => entry.type === 'member_joined' && entry.actor?.id === one.id)
      const removed = feed.find(entry => entry.type === 'member_removed')
      expect(joined).toMatchObject({ actor: { id: one.id, name: '' }, deleted: [one.id] })
      expect(removed).toMatchObject({ params: { userId: one.id }, people: { [one.id]: '' }, deleted: [one.id] })
    })

    it('reads their Messages in the Chat as the deleted line with no text, and the writer as „Gelöschtes Konto“ with no name or picture', async () => {
      const { ev } = await running()
      const one = ev.players.one
      expect((await remove(ev.slug, ev.host.cookie, { userId: one.id, rotateInvite: false })).status).toBe(200)

      expect((await send('DELETE', '/api/me', one.cookie)).status).toBe(200)

      const body = await (await send('GET', `/api/e/${ev.slug}/messages`, ev.host.cookie)).text()
      const page = JSON.parse(body) as MessagePage
      expect(page.messages).toMatchObject([{ writerId: one.id, text: null, deletedBy: 'writer' }])
      expect(page.writers[one.id]).toEqual({ name: '', image: null, deleted: true })
      for (const secret of ['Hallo zusammen', 'Eins', 'one@example.com']) expect(body, secret).not.toContain(secret)
    })
  })
})
