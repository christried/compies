import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import listHome from '../../server/api/e/index.get'
import readEvent from '../../server/api/e/[slug].get'
import deleteEvent from '../../server/api/e/[slug].delete'
import getActivity from '../../server/api/e/[slug]/activity.get'
import icsFile from '../../server/api/e/[slug]/ics.get'
import openRoom from '../../server/api/e/[slug]/room.post'
import rotateInvite from '../../server/api/e/[slug]/rotate.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import putResult from '../../server/api/e/[slug]/rounds/[id]/result.put'
import finishEvent from '../../server/api/e/[slug]/finish.post'
import previewInvite from '../../server/api/invite/[invite].get'
import joinInvite from '../../server/api/invite/[invite].post'
import deployCheck from '../../server/api/internal/deploy-check.get'
import { activity, countdowns, draws, eventMembers, eventPoolGames, events, games, pollSlots, roundPlaces, rounds, sessions, users, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, signRoomCall } from '../../shared/room-auth'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Deleting an Event (#333, spec #332, GLOSSARY: Deleted Event): the Host's soft delete through `changeEvent`. It sets the deleted mark and
// writes nothing else; every read of the Event, the invite routes, Home and the deploy check then ignore it (ADR 0006, ADR 0013).

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const second = { provider: 'discord', id: '3', name: 'Zweite', email: 'second@example.com', image: undefined } as const
const stranger = { provider: 'twitch', id: '4', name: 'Neu', email: 'neu@example.com', image: undefined } as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'
const SETTINGS = {
  ...TEST_SETTINGS,
  gameCount: 1,
  pointsTable: { preset: 'linear' as const, values: [1, 0] },
  selectionMode: 'lucky_wheel' as const,
  vetoAllowance: 1,
}

type Phase = 'poll' | 'date_set' | 'between' | 'running' | 'finished'

describe('deleting an Event', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e': listHome,
      'GET /api/e/:slug': readEvent,
      'DELETE /api/e/:slug': deleteEvent,
      'GET /api/e/:slug/activity': getActivity,
      'GET /api/e/:slug/ics': icsFile,
      'POST /api/e/:slug/room': openRoom,
      'POST /api/e/:slug/rotate': rotateInvite,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/move': moveMember,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/sessions/end': endSession,
      'POST /api/e/:slug/rounds': setGame,
      'PUT /api/e/:slug/rounds/:id/result': putResult,
      'POST /api/e/:slug/finish': finishEvent,
      'GET /api/invite/:invite': previewInvite,
      'POST /api/invite/:invite': joinInvite,
      'GET /api/internal/deploy-check': deployCheck,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await testDb.db.delete(countdowns)
    await testDb.db.delete(vetoes)
    await testDb.db.delete(draws)
    await testDb.db.delete(roundPlaces)
    await testDb.db.delete(rounds)
    await testDb.db.delete(sessions)
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

  async function idOf(email: string) {
    const [row] = await testDb.db.select().from(users).where(eq(users.email, email))
    return row!.id
  }

  async function eventRowOf(slug: string) {
    const [row] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return row!
  }

  /**
   * An Event in the given Phase, made through the API. `member` and `second` are Members (joined directly, as the finished-Event
   * fixture does); `member` sits in team 1 and `second` in team 2 once a Session starts. The Event has two Sessions.
   */
  async function eventIn(phase: Phase) {
    const context = await buildEvent(phase)
    notifier.clear()
    return context
  }

  async function buildEvent(phase: Phase) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const memberCookie = (await signIn(testDb.db, member)).cookie
    const secondCookie = (await signIn(testDb.db, second)).cookie
    const strangerCookie = (await signIn(testDb.db, stranger)).cookie
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS, settings: SETTINGS })
    const { slug, inviteUrl } = await created.json() as { slug: string, inviteUrl: string }
    const { id: eventId } = await eventRowOf(slug)
    for (const profile of [member, second]) await testDb.db.insert(eventMembers).values({ eventId, userId: await idOf(profile.email) })
    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
    const context = { slug, eventId, inviteUrl, hostCookie, memberCookie, secondCookie, strangerCookie, slotIds, host: await idOf(host.email) }
    if (phase === 'poll') return context
    expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })).status).toBe(200)
    if (phase === 'date_set') return context
    expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[1] })).status).toBe(200)
    expect((await send('POST', `/api/e/${slug}/move`, memberCookie, { userId: await idOf(member.email), to: { zone: 'team', team: 1 } })).status).toBe(200)
    expect((await send('POST', `/api/e/${slug}/move`, secondCookie, { userId: await idOf(second.email), to: { zone: 'team', team: 2 } })).status).toBe(200)
    expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
    if (phase === 'running') return context
    if (phase === 'finished') {
      // A finished Event (#277): the Host sets one game in the running Session, enters team 1's win and finishes it.
      const [halo] = await testDb.db.insert(games).values({ name: 'Halo', createdBy: context.host }).returning()
      await testDb.db.insert(eventPoolGames).values({ eventId, gameId: halo!.id })
      const round = (await (await send('POST', `/api/e/${slug}/rounds`, hostCookie, { gameId: halo!.id })).json() as { roundId: string }).roundId
      expect((await send('PUT', `/api/e/${slug}/rounds/${round}/result`, hostCookie, { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/finish`, hostCookie, { outcome: 'winner', winners: [1] })).status).toBe(200)
      return context
    }
    expect((await send('POST', `/api/e/${slug}/sessions/end`, hostCookie)).status).toBe(200)
    return context
  }

  /** The Host's delete, from the Event's slug. */
  function remove(cookie: string | undefined, slug: string) {
    return send('DELETE', `/api/e/${slug}`, cookie)
  }

  /**
   * The Event's rows the delete must not touch, without the deleted mark. `updatedAt` is the ORM's bookkeeping, stamped on every
   * UPDATE of the row, so it is left out; every other column of the Event must stay as it was.
   */
  async function rowsOf(eventId: string) {
    const [row] = await testDb.db.select().from(events).where(eq(events.id, eventId))
    const { deletedAt: _deletedAt, updatedAt: _updatedAt, ...rest } = row!
    return {
      event: rest,
      sessions: await testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId)),
      members: await testDb.db.select().from(eventMembers).where(eq(eventMembers.eventId, eventId)),
      slots: await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)),
      activity: await testDb.db.select().from(activity).where(eq(activity.eventId, eventId)),
    }
  }

  describe('DELETE /api/e/:slug', () => {
    it.each<[Phase]>([['poll'], ['date_set'], ['between'], ['finished']])('lets the Host delete an Event in the %s Phase, and writes nothing else (#333)', async (phase) => {
      const game = await eventIn(phase)
      const before = await rowsOf(game.eventId)

      const response = await remove(game.hostCookie, game.slug)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ slug: game.slug })
      expect((await eventRowOf(game.slug)).deletedAt?.getTime()).toBe(new Date(T0).getTime())
      const after = await rowsOf(game.eventId)
      expect(after).toEqual(before)
      expect(notifier.messages(game.eventId).map(message => message.type)).toEqual(['event.changed'])
      expect(typeof notifier.messages(game.eventId)[0]!.serverTime).toBe('number')
    })

    it('refuses while a Session runs (409 session_running), publishes nothing, and allows the delete once the Session ended', async () => {
      const game = await eventIn('running')

      const refused = await remove(game.hostCookie, game.slug)

      expect(refused.status).toBe(409)
      expect(refused.statusText).toBe('session_running')
      expect((await eventRowOf(game.slug)).deletedAt).toBeNull()
      expect(notifier.messages(game.eventId)).toEqual([])

      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      notifier.clear()
      expect((await remove(game.hostCookie, game.slug)).status).toBe(200)
      expect((await eventRowOf(game.slug)).deletedAt).not.toBeNull()
    })

    it('answers a Member who is not the Host 403 not_host, a stranger 404, and a signed-out User 401, and changes nothing', async () => {
      const game = await eventIn('date_set')

      const asMember = await remove(game.memberCookie, game.slug)
      expect(asMember.status).toBe(403)
      expect(asMember.statusText).toBe('not_host')

      const asStranger = await remove(game.strangerCookie, game.slug)
      expect(asStranger.status).toBe(404)
      expect(asStranger.statusText).toBe('Event not found')

      const signedOut = await remove(undefined, game.slug)
      expect(signedOut.status).toBe(401)

      expect((await eventRowOf(game.slug)).deletedAt).toBeNull()
      expect(notifier.messages(game.eventId)).toEqual([])
    })

    it('answers 410 Event deleted to a second delete by the Host and to one by a Member, keeps the first instant, and publishes nothing more', async () => {
      const game = await eventIn('date_set')
      expect((await remove(game.hostCookie, game.slug)).status).toBe(200)
      const firstInstant = (await eventRowOf(game.slug)).deletedAt
      notifier.clear()
      clock.set('2090-10-30T11:00:00.000Z')

      const again = await remove(game.hostCookie, game.slug)
      expect(again.status).toBe(410)
      expect(again.statusText).toBe('Event deleted')

      const byMember = await remove(game.memberCookie, game.slug)
      expect(byMember.status).toBe(410)
      expect(byMember.statusText).toBe('Event deleted')

      expect((await eventRowOf(game.slug)).deletedAt).toEqual(firstInstant)
      expect(notifier.messages(game.eventId)).toEqual([])
    })

    it('makes every Event route answer 410 Event deleted for a Member and the Host, and 404 for a stranger', async () => {
      const game = await eventIn('date_set')
      expect((await remove(game.hostCookie, game.slug)).status).toBe(200)

      const routes: [string, string, unknown?][] = [
        ['GET', `/api/e/${game.slug}`],
        ['GET', `/api/e/${game.slug}/activity`],
        ['POST', `/api/e/${game.slug}/room`],
        ['GET', `/api/e/${game.slug}/ics`],
        ['PATCH', `/api/e/${game.slug}/settings`, { settings: { gameCount: 4 } }],
        ['POST', `/api/e/${game.slug}/rotate`],
      ]
      for (const [method, path, body] of routes) {
        for (const cookie of [game.hostCookie, game.memberCookie]) {
          const response = await send(method, path, cookie, body)
          expect(response.status, `${method} ${path}`).toBe(410)
          expect(response.statusText, `${method} ${path}`).toBe('Event deleted')
        }
        const stranger = await send(method, path, game.strangerCookie, body)
        expect(stranger.status, `${method} ${path}`).toBe(404)
        expect(stranger.statusText, `${method} ${path}`).toBe('Event not found')
      }
    })

    it('answers the Invite link of a deleted Event 410 to a Member and 404 to a newcomer, who does not join', async () => {
      const game = await eventIn('date_set')
      const invite = new URL(game.inviteUrl).pathname.slice('/e/'.length)
      expect((await remove(game.hostCookie, game.slug)).status).toBe(200)

      const memberJoin = await send('POST', `/api/invite/${invite}`, game.memberCookie)
      expect(memberJoin.status).toBe(410)
      expect(memberJoin.statusText).toBe('Event deleted')

      const newcomerJoin = await send('POST', `/api/invite/${invite}`, game.strangerCookie)
      expect(newcomerJoin.status).toBe(404)
      expect(newcomerJoin.statusText).toBe('Event not found')
      const joined = await testDb.db.select().from(eventMembers).where(eq(eventMembers.userId, await idOf(stranger.email)))
      expect(joined).toEqual([])

      const preview = await send('GET', `/api/invite/${invite}`, undefined)
      expect(preview.status).toBe(404)
      expect(preview.statusText).toBe('Event not found')
    })

    it('drops the deleted Event from Home for the Host and a Member, and keeps the other Event of the Host', async () => {
      const first = await eventIn('date_set')
      const hostCookie = first.hostCookie
      const created = await send('POST', '/api/e', hostCookie, { name: 'Zweites Event', dateMode: 'poll', sessions: 2, slots: SLOTS, settings: SETTINGS })
      const { slug: otherSlug } = await created.json() as { slug: string }
      const { id: otherId } = await eventRowOf(otherSlug)
      await testDb.db.insert(eventMembers).values({ eventId: otherId, userId: await idOf(member.email) })

      expect((await remove(hostCookie, first.slug)).status).toBe(200)

      for (const cookie of [hostCookie, first.memberCookie]) {
        const response = await send('GET', '/api/e', cookie)
        const body = await response.json() as { events: { slug: string }[] }
        expect(body.events.map(row => row.slug)).toEqual([otherSlug])
      }
    })

    it('makes the deploy check ignore a deleted Event whose Session is dated today', async () => {
      vi.stubEnv('ROOM_INTERNAL_SECRET', 'internal-secret')
      vi.stubEnv('ROOM_INTERNAL_SECRET_PREVIOUS', 'old-internal-secret')
      const game = await eventIn('date_set')
      const ask = async () => {
        const call = await signRoomCall('', 'internal-secret', Date.now())
        return request('/api/internal/deploy-check', { headers: { [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp, [ROOM_CALL_SIGNATURE_HEADER]: call.signature } })
      }

      const blocked = await (await ask()).json() as { ok: boolean, reason: unknown }
      expect(blocked.ok).toBe(false)

      expect((await remove(game.hostCookie, game.slug)).status).toBe(200)

      const allowed = await (await ask()).json() as { ok: boolean, reason: unknown }
      expect(allowed).toMatchObject({ ok: true, reason: null })
    })
  })
})
