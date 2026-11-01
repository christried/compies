import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import pauseCountdown from '../../server/api/e/[slug]/countdown/pause.post'
import resetCountdown from '../../server/api/e/[slug]/countdown/reset.post'
import startCountdown from '../../server/api/e/[slug]/countdown/start.post'
import setCountdown from '../../server/api/e/[slug]/countdown/index.put'
import moveMember from '../../server/api/e/[slug]/move.post'
import putBackRound from '../../server/api/e/[slug]/rounds/[id].delete'
import setRound from '../../server/api/e/[slug]/rounds/index.post'
import rotateInvite from '../../server/api/e/[slug]/rotate.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import addSession from '../../server/api/e/[slug]/sessions/index.post'
import removeSession from '../../server/api/e/[slug]/sessions/[id].delete'
import reopenSession from '../../server/api/e/[slug]/sessions/[id]/reopen.post'
import rescheduleSession from '../../server/api/e/[slug]/sessions/[id]/reschedule.post'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import addSlot from '../../server/api/e/[slug]/slots/index.post'
import putVote from '../../server/api/e/[slug]/slots/[slotId]/vote.put'
import setTeamWord from '../../server/api/e/[slug]/team-word.post'
import resetTeamName from '../../server/api/e/[slug]/teams/[position]/reset-name.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import listGames from '../../server/api/games/index.get'
import createGame from '../../server/api/games/index.post'
import readGame from '../../server/api/games/[id].get'
import putImage from '../../server/api/games/[id]/image.put'
import getImage from '../../server/api/images/[key].get'
import joinInvite from '../../server/api/invite/[invite].post'
import { activity, eventMembers, eventPoolGames, events, games, pollSlots, users } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { ACTIVITY_TYPES, type ActivityEntry, type ActivityPage } from '../../shared/activity'
import type { Place } from '../../shared/board'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { GameView } from '../../shared/game'
import type { RoomMessageType } from '../../shared/realtime'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { hostPutsBack, hostSets, startRunningSession } from './running-session'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// THE secrecy test of release 1.3 (#148): under a Hidden wheel nobody but the Host learns which games are in the
// pools, not through the Event read, not through the image route, not through the library.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const player = { provider: 'discord', id: '2', name: 'Gast', email: 'player@example.com', image: undefined } as const
const stranger = { provider: 'discord', id: '4', name: 'Fremder', email: 'stranger@example.com', image: undefined } as const

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
function webp(payload: string): Uint8Array {
  const bytes = new Uint8Array(40)
  bytes.set([...ascii('RIFF'), 32, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii(payload)])
  return bytes
}

const HIDDEN_WHEEL = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 } as const

describe('Hidden wheel secrecy (#148)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const store = memoryImageStore()
  const notifier = memoryRoomNotifier()
  let hostCookie: string
  let playerCookie: string

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/invite/:invite': joinInvite,
      'GET /api/games': listGames,
      'POST /api/games': createGame,
      'GET /api/games/:id': readGame,
      'PUT /api/games/:id/image': putImage,
      'GET /api/images/:key': getImage,
      'GET /api/e/:slug/activity': getActivity,
      'POST /api/e/:slug/move': moveMember,
      'POST /api/e/:slug/team-word': setTeamWord,
      'POST /api/e/:slug/teams/:position/reset-name': resetTeamName,
      'PUT /api/e/:slug/slots/:slotId/vote': putVote,
      'POST /api/e/:slug/slots': addSlot,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/sessions': addSession,
      'DELETE /api/e/:slug/sessions/:id': removeSession,
      'POST /api/e/:slug/sessions/:id/reschedule': rescheduleSession,
      'POST /api/e/:slug/sessions/:id/reopen': reopenSession,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/sessions/end': endSession,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/e/:slug/rotate': rotateInvite,
      'POST /api/e/:slug/rounds': setRound,
      'DELETE /api/e/:slug/rounds/:id': putBackRound,
      'PUT /api/e/:slug/countdown': setCountdown,
      'POST /api/e/:slug/countdown/start': startCountdown,
      'POST /api/e/:slug/countdown/pause': pauseCountdown,
      'POST /api/e/:slug/countdown/reset': resetCountdown,
    }, { imageStore: store, roomNotifier: notifier })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1', admins: 'discord:9' })
    await testDb.db.delete(eventPoolGames)
    await testDb.db.delete(activity)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(games)
    await testDb.db.delete(users)
    store.clear()
    notifier.clear()
    hostCookie = (await signIn(testDb.db, host)).cookie
    playerCookie = (await signIn(testDb.db, player)).cookie
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  interface Secret { id: string, name: string, videoId: string, notes: string, imageUrl: string, imageKey: string }

  async function newGame(name: string, videoId: string): Promise<Secret> {
    // Every game carries notes (#224): a Player must not get them under a Hidden wheel.
    const notes = `Hausregel fuer ${name}`
    const created = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name, youtubeUrl: `https://youtu.be/${videoId}`, notes }),
    })
    expect(created.status).toBe(200)
    const { id } = await created.json() as GameView
    const uploaded = await request(`/api/games/${id}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'cookie': hostCookie },
      body: webp(name) as BodyInit,
    })
    expect(uploaded.status).toBe(200)
    const view = await uploaded.json() as GameView
    expect(view.youtubeId).toBe(videoId)
    return { id, name, videoId, notes, imageUrl: view.imageUrl!, imageKey: view.imageUrl!.slice('/api/images/'.length) }
  }

  /** A, B in the Game pool, C in the Tiebreaker pool; the Player has joined. */
  async function setUp(settings: Record<string, unknown> = HIDDEN_WHEEL) {
    const a = await newGame('Alpha Arena', 'aaaaaaaaaaa')
    const b = await newGame('Beta Bowling', 'bbbbbbbbbbb')
    const c = await newGame('Gamma Garten', 'ccccccccccc')
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({
        name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings,
        pools: { main: [a.id, b.id], tiebreaker: [c.id] },
      }),
    })
    expect(response.status).toBe(200)
    const { slug, inviteUrl } = await response.json() as CreatedEvent
    const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
    expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: playerCookie } })).status).toBe(200)
    return { slug, secrets: [a, b, c], a }
  }

  async function rawRead(cookie: string, slug: string) {
    const response = await request(`/api/e/${slug}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return await response.text()
  }

  const traces = (secret: Secret) => [secret.name, secret.id, secret.imageKey, secret.videoId, secret.notes]

  function setWheelHidden(hidden: boolean) {
    // The Pool preview follows the wheel here, as a Host who made the wheel visible and turned the preview on (#225).
    return testDb.db.update(events).set({ hiddenWheel: hidden, poolPreview: !hidden })
  }

  it('gives a Player under a Hidden wheel nothing about the pools: not a count, name, id, image key, video id or notes anywhere in the raw response', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(playerCookie, slug)

    expect((JSON.parse(raw) as EventView).pools).toBeNull()
    for (const trace of secrets.flatMap(traces)) expect(raw).not.toContain(trace)
    expect(raw).not.toMatch(/api\/images/)
  })

  it('gives a Player the same response however many games the pools hold (#222)', async () => {
    const { slug } = await setUp()
    const before = await rawRead(playerCookie, slug)

    const delta = await newGame('Delta Dart', 'ddddddddddd')
    const [eventRow] = await testDb.db.select({ id: events.id }).from(events).where(eq(events.slug, slug))
    await testDb.db.insert(eventPoolGames).values([
      { eventId: eventRow!.id, gameId: delta.id, pool: 'main' },
      { eventId: eventRow!.id, gameId: delta.id, pool: 'tiebreaker' },
    ])
    const after = await rawRead(playerCookie, slug)

    // The control: the Host sees the new game, so the insert really changed the pools.
    expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
    expect(after).toBe(before)
  })

  it('gives the Host the games under a Hidden wheel', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(hostCookie, slug)

    for (const trace of secrets.flatMap(traces)) expect(raw).toContain(trace)
    expect((JSON.parse(raw) as EventView).pools).toMatchObject({
      main: [{ name: 'Alpha Arena', notes: 'Hausregel fuer Alpha Arena' }, { name: 'Beta Bowling', notes: 'Hausregel fuer Beta Bowling' }],
      tiebreaker: [{ name: 'Gamma Garten', notes: 'Hausregel fuer Gamma Garten' }],
    })
  })

  it('gives the Player the games once the wheel is not hidden, and nothing about the pools when it is hidden again', async () => {
    const { slug, secrets } = await setUp()

    await setWheelHidden(false)
    const open = await rawRead(playerCookie, slug)
    expect((JSON.parse(open) as EventView).pools).toMatchObject({ main: [{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }], tiebreaker: [{ name: 'Gamma Garten' }] })
    // A Player gets picture and name only (#224): everything but the notes.
    for (const trace of secrets.flatMap(traces).filter(trace => !secrets.some(secret => secret.notes === trace))) expect(open).toContain(trace)
    for (const secret of secrets) expect(open).not.toContain(secret.notes)

    await setWheelHidden(true)
    const closed = await rawRead(playerCookie, slug)
    for (const trace of secrets.flatMap(traces)) expect(closed).not.toContain(trace)
    expect((JSON.parse(closed) as EventView).pools).toBeNull()
  })

  it('gives the Player the games of an Event with a visible Lucky wheel from the start', async () => {
    const { slug } = await setUp({ ...HIDDEN_WHEEL, hiddenWheel: false })

    expect((JSON.parse(await rawRead(playerCookie, slug)) as EventView).pools).not.toBeNull()
  })

  describe('the image route', () => {
    async function fetchImage(secret: Secret, cookie?: string) {
      return await request(secret.imageUrl, { headers: cookie ? { cookie } : {} })
    }

    it('refuses the Player the image of an undrawn game under a Hidden wheel, in either pool', async () => {
      const { secrets } = await setUp()

      for (const secret of secrets) {
        const response = await fetchImage(secret, playerCookie)
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
      }
    })

    it('serves the Player the image once the wheel is not hidden, and refuses it again when hidden again', async () => {
      const { secrets, a } = await setUp()

      await setWheelHidden(false)
      for (const secret of secrets) {
        const response = await fetchImage(secret, playerCookie)
        expect(response.status).toBe(200)
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp(secret.name))
      }

      await setWheelHidden(true)
      expect((await fetchImage(a, playerCookie)).status).toBe(404)
    })

    it('serves the Host the images under a Hidden wheel, also after the Host lost the library permission', async () => {
      const { a } = await setUp()
      expect((await fetchImage(a, hostCookie)).status).toBe(200)

      await testDb.db.update(users).set({ canHost: false }).where(eq(users.name, 'Hostess'))

      expect((await fetchImage(a, hostCookie)).status).toBe(200)
    })

    it('refuses a signed-in User who is no Member of the Event, whatever the wheel says', async () => {
      const { a } = await setUp()
      const strangerCookie = (await signIn(testDb.db, stranger)).cookie

      expect((await fetchImage(a, strangerCookie)).status).toBe(404)
      await setWheelHidden(false)
      expect((await fetchImage(a, strangerCookie)).status).toBe(404)
      expect((await fetchImage(a)).status).toBe(404)
    })

    it('refuses a Member of a deleted Event', async () => {
      const { a } = await setUp()
      await setWheelHidden(false)
      expect((await fetchImage(a, playerCookie)).status).toBe(200)

      await testDb.db.update(events).set({ deletedAt: new Date() })

      expect((await fetchImage(a, playerCookie)).status).toBe(404)
    })

    it('serves a game that sits in a second Event with a visible wheel', async () => {
      const { a } = await setUp()
      const second = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({
          name: 'Samstags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-11-30T20:30'], settings: { ...HIDDEN_WHEEL, hiddenWheel: false },
          pools: { main: [a.id], tiebreaker: [] },
        }),
      })
      const { inviteUrl } = await second.json() as CreatedEvent
      expect((await fetchImage(a, playerCookie)).status).toBe(404)

      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: playerCookie } })

      expect((await fetchImage(a, playerCookie)).status).toBe(200)
    })
  })

  it('still answers 404 to the Player on the library routes', async () => {
    const { secrets, a } = await setUp()
    await setWheelHidden(false)

    expect((await request('/api/games', { headers: { cookie: playerCookie } })).status).toBe(404)
    for (const secret of secrets) {
      expect((await request(`/api/games/${secret.id}`, { headers: { cookie: playerCookie } })).status).toBe(404)
    }
    expect((await request(`/api/games/${a.id}`, { headers: { cookie: hostCookie } })).status).toBe(200)
  })

  // Every message type Nuxt sends to the room must be produced by this flow (#165): the type check fails until a new
  // type is added to SERVER_SENT and to a step of lobbyFlow. The Worker sends its own types (presence, the clock).
  describe('the room and the Activity feed under a Hidden wheel (#165)', () => {
    const SERVER_SENT = ['event.changed', 'activity.added', 'member.joined', 'member.moved', 'team.wordSet', 'team.nameReset', 'team.nameFrozen', 'session.started', 'session.ended', 'round.set', 'round.putBack', 'countdown.changed'] as const satisfies readonly RoomMessageType[]
    type WorkerSent = 'presence.sync' | 'presence.join' | 'presence.leave' | 'clock.pong'
    const everyTypeListed: Exclude<RoomMessageType, (typeof SERVER_SENT)[number] | WorkerSent> extends never ? true : never = true

    const LOBBY_SETTINGS = { ...HIDDEN_WHEEL, teamCount: 2, teamSize: 1 } as const
    const LOBBY_SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
    const player2 = { provider: 'twitch', id: '5', name: 'Zweite', email: 'second@example.com', image: undefined } as const
    const team = (position: number): Place => ({ zone: 'team', team: position })

    function send(method: string, path: string, cookie: string, body?: unknown) {
      return request(path, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }

    async function userIdOf(email: string) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, email))
      return row!.id
    }

    /** Fails on the first trace of a pool game that `raw` holds, and names the place it leaks to (#165). */
    function expectNoTrace(place: string, raw: string, secrets: readonly Secret[]) {
      for (const secret of secrets) {
        for (const trace of traces(secret)) expect(raw, `${place} leaks ${trace}`).not.toContain(trace)
      }
    }

    /** The Activity feed as a Member reads it: every page, following `next` until it is null (#159). */
    async function activityOf(cookie: string, slug: string) {
      let raw = ''
      const entries: ActivityEntry[] = []
      let before: string | null = null
      do {
        const query = before === null ? '' : `&before=${before}`
        const response = await request(`/api/e/${slug}/activity?limit=3${query}`, { headers: { cookie } })
        expect(response.status).toBe(200)
        const text = await response.text()
        raw += text
        const page = JSON.parse(text) as ActivityPage
        entries.push(...page.entries)
        before = page.next
      } while (before !== null)
      return { raw, entries }
    }

    /**
     * The lobby of 1.4 under a Hidden wheel: a Host, two Players in two teams of one, and every step a Player could see
     * through the room or the feed. Returns the Event and the four games that sit in its pools at some point (#165).
     */
    async function lobbyFlow() {
      const a = await newGame('Alpha Arena', 'aaaaaaaaaaa')
      const b = await newGame('Beta Bowling', 'bbbbbbbbbbb')
      const c = await newGame('Gamma Garten', 'ccccccccccc')
      const created = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({
          name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: LOBBY_SLOTS, settings: LOBBY_SETTINGS,
          pools: { main: [a.id, b.id], tiebreaker: [c.id] },
        }),
      })
      expect(created.status).toBe(200)
      const { slug, inviteUrl } = await created.json() as CreatedEvent
      const token = new URL(inviteUrl).pathname.slice('/e/'.length)
      const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
      const eventId = eventRow!.id
      const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
      const player2Cookie = (await signIn(testDb.db, player2)).cookie
      const ids = { player: await userIdOf(player.email), player2: await userIdOf(player2.email) }

      // 1. Both Players join through the Invite link (member.joined).
      expect((await send('POST', `/api/invite/${token}`, playerCookie)).status).toBe(200)
      expect((await send('POST', `/api/invite/${token}`, player2Cookie)).status).toBe(200)

      // 2. Both vote while the Date poll is open (no Session has a Date yet); one Vote has a Note.
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, playerCookie, { value: 'yes', note: 'bis 20:30' })).status).toBe(200)
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[1]}/vote`, playerCookie, { value: 'no' })).status).toBe(200)
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, player2Cookie, { value: 'maybe' })).status).toBe(200)
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[1]}/vote`, player2Cookie, { value: 'yes' })).status).toBe(200)

      // 3. The Host adds a third Slot.
      expect((await send('POST', `/api/e/${slug}/slots`, hostCookie, { startsAt: '2090-11-01T19:00' })).status).toBe(200)

      // 4. The Host sets the Date from the first Slot (date_set).
      expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })).status).toBe(200)

      // 5. The Host adds a second Session with a Date, reschedules it, reopens it and removes it.
      const added = await send('POST', `/api/e/${slug}/sessions`, hostCookie, { startsAt: '2090-12-01T19:00' })
      expect(added.status).toBe(200)
      const { id: sessionId } = await added.json() as { id: string }
      expect((await send('POST', `/api/e/${slug}/sessions/${sessionId}/reschedule`, hostCookie, { startsAt: '2090-12-02T19:00' })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/sessions/${sessionId}/reopen`, hostCookie)).status).toBe(200)
      expect((await send('DELETE', `/api/e/${slug}/sessions/${sessionId}`, hostCookie)).status).toBe(200)

      // 6. Player 1 moves into team 1, Player 2 into team 2; the Host moves Player 2 to the Bench and back.
      expect((await send('POST', `/api/e/${slug}/move`, playerCookie, { userId: ids.player, to: team(1) })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/move`, player2Cookie, { userId: ids.player2, to: team(2) })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/move`, hostCookie, { userId: ids.player2, to: { zone: 'bench' } })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/move`, hostCookie, { userId: ids.player2, to: team(2) })).status).toBe(200)

      // 7. Both set a Team word; the Host resets team 2's name; Player 2 sets a word again.
      expect((await send('POST', `/api/e/${slug}/team-word`, playerCookie, { word: 'Wilde' })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/team-word`, player2Cookie, { word: 'Gurken' })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/teams/2/reset-name`, hostCookie)).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/team-word`, player2Cookie, { word: 'Rote' })).status).toBe(200)

      // 8. The Host changes the Game count and the Team size, and swaps Beta Bowling for Delta Dart in the Game pool.
      const d = await newGame('Delta Dart', 'ddddddddddd')
      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 6, teamSize: 2 }, pools: { main: [a.id, d.id] } })).status).toBe(200)

      // 9. The Host rotates the Invite link.
      expect((await send('POST', `/api/e/${slug}/rotate`, hostCookie)).status).toBe(200)

      // 10. The Host starts the Session, sets a game that is in no pool and puts it back (round.set, round.putBack), then ends
      // the Session (session.started, team.nameFrozen, session.ended). That game is everyone's from the moment it is set (#228).
      expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
      const e = await newGame('Epsilon Eck', 'eeeeeeeeeee')
      const roundId = await hostSets(request, slug, hostCookie, e.id)
      await hostPutsBack(request, slug, hostCookie, roundId)
      // The Host sets a Countdown and starts it (countdown.changed, #236); ending the Session clears it.
      expect((await send('PUT', `/api/e/${slug}/countdown`, hostCookie, { seconds: 60 })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/countdown/start`, hostCookie)).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/sessions/end`, hostCookie)).status).toBe(200)

      return { slug, eventId, games: [a, b, c, d] as const, set: e, player2Cookie }
    }

    it('produces every message type Nuxt sends to the room, and writes every Activity type', async () => {
      const { slug, eventId } = await lobbyFlow()

      expect(everyTypeListed).toBe(true)
      const sent = new Set(notifier.messages(eventId).map(message => message.type))
      for (const type of SERVER_SENT) expect(sent.has(type), `the flow sends no ${type}`).toBe(true)
      // The 0.7 kinds (#226) are in the enum; the flow writes the ones that exist so far (game_set and game_put_back, #228).
      // The rest come with #229 (game_drawn), #231 (vetoes_revealed), #233 (bonus_veto_granted) and #235 (coin_tossed).
      const written = ACTIVITY_TYPES.filter(type => !['game_drawn', 'vetoes_revealed', 'bonus_veto_granted', 'coin_tossed'].includes(type))
      expect(new Set((await activityOf(playerCookie, slug)).entries.map(entry => entry.type))).toEqual(new Set(written))
    })

    it('leaks no pool game through the room, the Activity feed or the Event read of either Player', async () => {
      const { slug, eventId, games, player2Cookie } = await lobbyFlow()

      expectNoTrace('the room', JSON.stringify(notifier.messages(eventId)), games)
      expectNoTrace('the Activity feed of Player 1', (await activityOf(playerCookie, slug)).raw, games)
      expectNoTrace('the Event read of Player 1', await rawRead(playerCookie, slug), games)
      expectNoTrace('the Event read of Player 2', await rawRead(player2Cookie, slug), games)
    })

    it('shows the pools to a Player once the Hidden wheel is off and the Pool preview on, and the room still carries no game', async () => {
      const { slug, eventId, games } = await lobbyFlow()
      const [a, , c, d] = games

      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { hiddenWheel: false, poolPreview: true } })).status).toBe(200)

      const open = await rawRead(playerCookie, slug)
      expect((JSON.parse(open) as EventView).pools).toMatchObject({ main: [{ name: 'Alpha Arena' }, { name: 'Delta Dart' }], tiebreaker: [{ name: 'Gamma Garten' }] })
      // Picture and name only (#224): the notes stay the Host's.
      for (const game of [a, c, d]) {
        for (const trace of traces(game).filter(trace => trace !== game.notes)) expect(open, `the open Event read lacks ${trace}`).toContain(trace)
        expect(open).not.toContain(game.notes)
      }
      expectNoTrace('the room', JSON.stringify(notifier.messages(eventId)), games)

      const hostRaw = await rawRead(hostCookie, slug)
      for (const game of [a, c, d]) expect(hostRaw).toContain(game.name)
    })
  })

  // A game the Host sets is every Member's from the moment it is set, and nothing else becomes known with it (#228).
  describe('a game the Host sets (#228)', () => {
    const second = { provider: 'twitch', id: '5', name: 'Zweite', email: 'second@example.com', image: undefined } as const
    const LOBBY = { ...HIDDEN_WHEEL, teamCount: 2, teamSize: 1 } as const

    /** A Running Session under a Hidden wheel: Alpha and Beta in the Game pool, Gamma in the Tiebreaker pool, Epsilon only in the library. */
    async function runningEvent() {
      const [a, b, c, e] = [await newGame('Alpha Arena', 'aaaaaaaaaaa'), await newGame('Beta Bowling', 'bbbbbbbbbbb'), await newGame('Gamma Garten', 'ccccccccccc'), await newGame('Epsilon Eck', 'eeeeeeeeeee')]
      const created = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings: LOBBY, pools: { main: [a.id, b.id], tiebreaker: [c.id] } }),
      })
      const { slug, inviteUrl } = await created.json() as CreatedEvent
      const token = new URL(inviteUrl).pathname.slice('/e/'.length)
      const secondCookie = (await signIn(testDb.db, second)).cookie
      for (const cookie of [playerCookie, secondCookie]) expect((await request(`/api/invite/${token}`, { method: 'POST', headers: { cookie } })).status).toBe(200)
      await startRunningSession(request, testDb.db, { slug, hostCookie, seated: [{ cookie: playerCookie, email: player.email }, { cookie: secondCookie, email: second.email }] })
      notifier.clear()
      const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
      return { slug, eventId: eventRow!.id, a, b, c, e }
    }

    const imageStatus = async (secret: Secret) => (await request(secret.imageUrl, { headers: { cookie: playerCookie } })).status

    /** Everything the Player can read: the Event read, the feed and the room. */
    async function whatThePlayerGets(slug: string, eventId: string) {
      const feed = await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie: playerCookie } })
      return { event: await rawRead(playerCookie, slug), feed: await feed.text(), room: JSON.stringify(notifier.messages(eventId)) }
    }

    function expectNone(what: Record<string, string>, secrets: readonly Secret[], include: (secret: Secret) => string[] = traces) {
      for (const [place, raw] of Object.entries(what)) {
        for (const secret of secrets) for (const trace of include(secret)) expect(raw, `${place} leaks ${trace}`).not.toContain(trace)
      }
    }

    it('shows a Player no game of the pools before a set: nothing in the Event read, the feed or the room, and no image', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      expectNone(await whatThePlayerGets(slug, eventId), [a, b, c, e])
      expect((JSON.parse(await rawRead(playerCookie, slug)) as EventView)).toMatchObject({ pools: null, rounds: [], setGame: null })
      for (const secret of [a, b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('shows a Player exactly the game that is set, never its notes, and nothing else of the pools', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      await hostSets(request, slug, hostCookie, a.id)

      const got = await whatThePlayerGets(slug, eventId)
      expect(got.event).toContain('Alpha Arena')
      expect(got.event).toContain(a.imageKey)
      expect((JSON.parse(got.event) as EventView)).toMatchObject({ pools: null, rounds: [{ game: { id: a.id, name: 'Alpha Arena', youtubeId: 'aaaaaaaaaaa' } }] })
      expect(got.feed).toContain('Alpha Arena')
      expectNone(got, [a], secret => [secret.notes])
      expectNone(got, [b, c, e])
      expect(await imageStatus(a)).toBe(200)
      for (const secret of [b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('shows a Player a game from the library when the Host sets it, and none of the pool\'s games', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      await hostSets(request, slug, hostCookie, e.id)

      const got = await whatThePlayerGets(slug, eventId)
      expect((JSON.parse(got.event) as EventView).rounds).toMatchObject([{ game: { id: e.id, name: 'Epsilon Eck' } }])
      expectNone(got, [a, b, c])
      expectNone(got, [e], secret => [secret.notes])
      expect(await imageStatus(e)).toBe(200)
      for (const secret of [a, b, c]) expect(await imageStatus(secret)).toBe(404)
    })

    it('gives the Host the notes of the set game on its Round, and every game of the pools', async () => {
      const { slug, a } = await runningEvent()
      await hostSets(request, slug, hostCookie, a.id)

      const view = JSON.parse(await rawRead(hostCookie, slug)) as EventView

      expect(view.rounds).toMatchObject([{ game: { name: 'Alpha Arena' }, notes: a.notes }])
      expect(view.pools?.main.map(game => game.name)).toEqual(['Alpha Arena', 'Beta Bowling'])
    })

    it('reveals nothing more when the Host puts the Round back: the pools stay hidden, the games not set stay unknown', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()
      const roundId = await hostSets(request, slug, hostCookie, a.id)

      await hostPutsBack(request, slug, hostCookie, roundId)

      const got = await whatThePlayerGets(slug, eventId)
      expect(JSON.parse(got.event)).toMatchObject({ pools: null, rounds: [] })
      expectNone(got, [b, c, e])
      expectNone(got, [a], secret => [secret.notes])
      for (const secret of [b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('keeps the Player\'s read the same however many games the pools hold after a set', async () => {
      const { slug, eventId, a } = await runningEvent()
      await hostSets(request, slug, hostCookie, a.id)
      const before = await rawRead(playerCookie, slug)

      const delta = await newGame('Delta Dart', 'ddddddddddd')
      await testDb.db.insert(eventPoolGames).values({ eventId, gameId: delta.id, pool: 'main' })

      expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
      expect(await rawRead(playerCookie, slug)).toBe(before)
    })
  })
})
