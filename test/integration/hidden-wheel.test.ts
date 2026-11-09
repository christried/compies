import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import pauseCountdown from '../../server/api/e/[slug]/countdown/pause.post'
import resetCountdown from '../../server/api/e/[slug]/countdown/reset.post'
import startCountdown from '../../server/api/e/[slug]/countdown/start.post'
import tossCoin from '../../server/api/e/[slug]/coin.post'
import setCountdown from '../../server/api/e/[slug]/countdown/index.put'
import moveMember from '../../server/api/e/[slug]/move.post'
import castVeto from '../../server/api/e/[slug]/draws/[drawId]/veto.post'
import putBackRound from '../../server/api/e/[slug]/rounds/[id].delete'
import putResult from '../../server/api/e/[slug]/rounds/[id]/result.put'
import setRound from '../../server/api/e/[slug]/rounds/index.post'
import spinWheel from '../../server/api/e/[slug]/rounds/spin.post'
import rotateInvite from '../../server/api/e/[slug]/rotate.post'
import finishEvent from '../../server/api/e/[slug]/finish.post'
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
import { activity, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { ACTIVITY_TYPES, type ActivityEntry, type ActivityPage } from '../../shared/activity'
import type { Place } from '../../shared/board'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { GamePrice, GameView } from '../../shared/game'
import type { RoomMessageType } from '../../shared/realtime'
import de from '../../i18n/locales/de.json'
import { SPIN, WINDOW_MS } from '../draw-offsets'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { hostPutsBack, hostSets, startRunningSession } from './running-session'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The platform's random source with an override the slice-order test sets (F2): otherwise it is the real one, so every other test draws as production does.
const source = vi.hoisted(() => ({ override: null as ((n: number) => number) | null }))
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  const randomInt = ((...args: unknown[]) => (source.override && args.length === 1 ? source.override(args[0] as number) : (real.randomInt as (...a: unknown[]) => unknown)(...args))) as typeof real.randomInt
  return { ...real, default: { ...real, randomInt }, randomInt }
})

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

/** The Veto read (`wheel.vetoes`, #231) with the defaults a case does not pin: no own part, nothing revealed, the spin's window. A new read field gets its default here, once. */
function vetoRead({ left, own = null, revealed = null, draw = expect.objectContaining({ kind: 'spin' }) }: { left: number[], own?: object | null, revealed?: object[] | null, draw?: unknown }) {
  return { left, own, revealed, draw }
}

describe('Hidden wheel secrecy (#148)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const store = memoryImageStore()
  const notifier = memoryRoomNotifier()
  // The server's clock (#226): the real time until a spin test moves it past a stop instant.
  const clock = testClock(new Date())
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
      'POST /api/e/:slug/finish': finishEvent,
      'POST /api/e/:slug/rounds': setRound,
      'POST /api/e/:slug/rounds/spin': spinWheel,
      'POST /api/e/:slug/draws/:drawId/veto': castVeto,
      'DELETE /api/e/:slug/rounds/:id': putBackRound,
      'PUT /api/e/:slug/rounds/:id/result': putResult,
      'PUT /api/e/:slug/countdown': setCountdown,
      'POST /api/e/:slug/countdown/start': startCountdown,
      'POST /api/e/:slug/coin': tossCoin,
      'POST /api/e/:slug/countdown/pause': pauseCountdown,
      'POST /api/e/:slug/countdown/reset': resetCountdown,
    }, { imageStore: store, roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1', admins: 'discord:9' })
    clock.set(new Date())
    await testDb.db.delete(draws)
    await testDb.db.delete(rounds)
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
    source.override = null
    vi.unstubAllEnvs()
  })

  interface Secret { id: string, name: string, videoId: string, notes: string, tag: string, imageUrl: string, imageKey: string, cents: number, price: GamePrice | null }

  async function newGame(name: string, videoId: string): Promise<Secret> {
    // Every game carries notes (#224): a Player must not get them under a Hidden wheel.
    const notes = `Hausregel fuer ${name}`
    // Lower case, so the key and the label are one string; no Event read carries a Tag, not even the Host's (#335).
    const tag = `tag-${name.split(' ')[0]!.toLowerCase()}`
    // Distinct cents per game (#338): the amount names its game in a read.
    const cents = 1000 + 111 * (name.charCodeAt(0) - 64)
    const created = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name, youtubeUrl: `https://youtu.be/${videoId}`, notes, tags: [tag], price: { cents, source: 'steam' } }),
    })
    expect(created.status).toBe(200)
    const { id, price } = await created.json() as GameView
    const uploaded = await request(`/api/games/${id}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'cookie': hostCookie },
      body: webp(name) as BodyInit,
    })
    expect(uploaded.status).toBe(200)
    const view = await uploaded.json() as GameView
    expect(view.youtubeId).toBe(videoId)
    return { id, name, videoId, notes, tag, imageUrl: view.imageUrl!, imageKey: view.imageUrl!.slice('/api/images/'.length), cents, price }
  }

  /** A, B in the Game pool, C in the library only (#279: there is no Tiebreaker pool); the Player has joined. */
  async function setUp(settings: Record<string, unknown> = HIDDEN_WHEEL) {
    const a = await newGame('Alpha Arena', 'aaaaaaaaaaa')
    const b = await newGame('Beta Bowling', 'bbbbbbbbbbb')
    const c = await newGame('Gamma Garten', 'ccccccccccc')
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({
        name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings,
        pool: [a.id, b.id],
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

  // The Price's amount is a trace (#338): distinct per game, it names the game whose Price a read carries.
  const priceTrace = (secret: Secret) => `"cents":${secret.cents}`
  const traces = (secret: Secret) => [secret.name, secret.id, secret.imageKey, secret.videoId, secret.notes, priceTrace(secret)]
  // The Host's read holds every trace but a Tag: Tags live in the library only (#335).
  const playerTraces = (secret: Secret) => [...traces(secret), secret.tag]

  function setWheelHidden(hidden: boolean) {
    // The Pool preview follows the wheel here, as a Host who made the wheel visible and turned the preview on (#225).
    return testDb.db.update(events).set({ hiddenWheel: hidden, poolPreview: !hidden })
  }

  it('gives a Player under a Hidden wheel nothing about the pools: not a count, name, id, image key, video id or notes anywhere in the raw response', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(playerCookie, slug)

    expect((JSON.parse(raw) as EventView).pool).toBeNull()
    for (const trace of secrets.flatMap(playerTraces)) expect(raw).not.toContain(trace)
    expect(raw).not.toMatch(/api\/images/)
  })

  it('gives a Player the same response however many games the pools hold (#222)', async () => {
    const { slug } = await setUp()
    const before = await rawRead(playerCookie, slug)

    const delta = await newGame('Delta Dart', 'ddddddddddd')
    const [eventRow] = await testDb.db.select({ id: events.id }).from(events).where(eq(events.slug, slug))
    await testDb.db.insert(eventPoolGames).values({ eventId: eventRow!.id, gameId: delta.id })
    const after = await rawRead(playerCookie, slug)

    // The control: the Host sees the new game, so the insert really changed the pools.
    expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
    expect(after).toBe(before)
  })

  it('gives the Host the games under a Hidden wheel', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(hostCookie, slug)

    for (const trace of secrets.slice(0, 2).flatMap(traces)) expect(raw).toContain(trace)
    expect((JSON.parse(raw) as EventView).pool).toMatchObject([{ name: 'Alpha Arena', notes: 'Hausregel fuer Alpha Arena' }, { name: 'Beta Bowling', notes: 'Hausregel fuer Beta Bowling' }])
  })

  it('gives the Player the games once the wheel is not hidden, and nothing about the pools when it is hidden again', async () => {
    const { slug, secrets } = await setUp()

    await setWheelHidden(false)
    const open = await rawRead(playerCookie, slug)
    expect((JSON.parse(open) as EventView).pool).toMatchObject([{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }])
    // A Player gets picture and name only (#224): everything but the notes.
    for (const trace of secrets.slice(0, 2).flatMap(traces).filter(trace => !secrets.some(secret => secret.notes === trace))) expect(open).toContain(trace)
    for (const secret of secrets) expect(open).not.toContain(secret.notes)
    for (const secret of secrets) expect(open).not.toContain(secret.tag)

    await setWheelHidden(true)
    const closed = await rawRead(playerCookie, slug)
    for (const trace of secrets.flatMap(playerTraces)) expect(closed).not.toContain(trace)
    expect((JSON.parse(closed) as EventView).pool).toBeNull()
  })

  it('gives the Player the games of an Event with a visible Lucky wheel from the start', async () => {
    const { slug } = await setUp({ ...HIDDEN_WHEEL, hiddenWheel: false })

    expect((JSON.parse(await rawRead(playerCookie, slug)) as EventView).pool).not.toBeNull()
  })

  it.each([
    ['a Hidden wheel', HIDDEN_WHEEL, false],
    ['a visible Lucky wheel', { ...HIDDEN_WHEEL, hiddenWheel: false }, true],
  ])('carries no Tag in the Host\'s or a Player\'s Event read under %s, and the Price only where the pool shows it (#335, #338)', async (_rule, settings, playerSeesPool) => {
    const { slug, secrets } = await setUp(settings)
    const [alpha, beta, gamma] = secrets as [Secret, Secret, Secret]

    // The Host sees the pool (Alpha, Beta) in full; Gamma (in the library only) is in no read.
    const hostRaw = await rawRead(hostCookie, slug)
    expect(hostRaw).not.toContain('"tags"')
    expect(hostRaw).toContain('"price"')
    expect(hostRaw).toContain('"checkedAt"')
    expect(hostRaw).toContain(priceTrace(alpha))
    expect(hostRaw).toContain(priceTrace(beta))
    expect(hostRaw).not.toContain(priceTrace(gamma))
    for (const secret of secrets) expect(hostRaw).not.toContain(secret.tag)

    const playerRaw = await rawRead(playerCookie, slug)
    expect(playerRaw).not.toContain('"tags"')
    for (const secret of secrets) expect(playerRaw).not.toContain(secret.tag)
    if (playerSeesPool) {
      expect(playerRaw).toContain('"price"')
      expect(playerRaw).toContain('"checkedAt"')
      expect(playerRaw).toContain(priceTrace(alpha))
      expect(playerRaw).toContain(priceTrace(beta))
    }
    else {
      expect(playerRaw).not.toContain('"price"')
      expect(playerRaw).not.toContain('"checkedAt"')
      for (const secret of secrets) expect(playerRaw).not.toContain(priceTrace(secret))
    }
    expect(playerRaw).not.toContain(priceTrace(gamma))
    // The control: the library does carry them.
    const library = await request('/api/games', { headers: { cookie: hostCookie } })
    expect(await library.text()).toContain(secrets[0]!.tag)
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
      // Gamma (C) is in the library only (#279), so the Player gets no image of it.
      for (const secret of secrets.slice(0, 2)) {
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
          pool: [a.id],
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
    const SERVER_SENT = ['event.changed', 'activity.added', 'member.joined', 'member.moved', 'team.wordSet', 'team.nameReset', 'team.nameFrozen', 'session.started', 'session.ended', 'veto.cast'] as const satisfies readonly RoomMessageType[]
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
        for (const trace of playerTraces(secret)) expect(raw, `${place} leaks ${trace}`).not.toContain(trace)
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
    /** With `castVeto` Player 1 casts a Veto in the open window before the Session ends: a Veto is refused after it (F15). */
    async function lobbyFlow({ castVeto = false }: { castVeto?: boolean } = {}) {
      const a = await newGame('Alpha Arena', 'aaaaaaaaaaa')
      const b = await newGame('Beta Bowling', 'bbbbbbbbbbb')
      const c = await newGame('Gamma Garten', 'ccccccccccc')
      const created = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({
          name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: LOBBY_SLOTS, settings: LOBBY_SETTINGS,
          pool: [a.id, b.id],
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
      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 6, teamSize: 2 }, pool: [a.id, d.id] })).status).toBe(200)

      // 9. The Host rotates the Invite link.
      expect((await send('POST', `/api/e/${slug}/rotate`, hostCookie)).status).toBe(200)

      // 10. The Host starts the Session, sets a game that is in no pool and puts it back (event.changed, activity.added), then ends
      // the Session (session.started, team.nameFrozen, session.ended). That game is everyone's from the moment it is set (#228).
      expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
      const e = await newGame('Epsilon Eck', 'eeeeeeeeeee')
      const roundId = await hostSets(request, slug, hostCookie, e.id)
      await hostPutsBack(request, slug, hostCookie, roundId)
      // A library game that stays open: its Round gets its Result once the Session has ended (#273, between Sessions).
      const f = await newGame('Foxtrot Fest', 'fffffffffff')
      const openRound = await hostSets(request, slug, hostCookie, f.id)
      // The Host spins the wheel (event.changed; the feed entry game_drawn waits for the stop); the Session ends with that Round still being drawn.
      expect((await send('POST', `/api/e/${slug}/rounds/spin`, hostCookie)).status).toBe(200)
      if (castVeto) {
        // The wheel stops (the clock moves past it) and Player 1 casts a Veto: veto.cast goes to Player 1's Party only (#231).
        const [drawn] = (await testDb.db.select().from(draws)).filter(row => row.kind === 'spin')
        clock.advance(SPIN.stop + 500)
        expect((await send('POST', `/api/e/${slug}/draws/${drawn!.id}/veto`, playerCookie)).status).toBe(200)
      }
      // The Host sets a Countdown and starts it (event.changed, #236); ending the Session clears it.
      expect((await send('PUT', `/api/e/${slug}/countdown`, hostCookie, { seconds: 60 })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/countdown/start`, hostCookie)).status).toBe(200)
      // The Host tosses the coin (event.changed, #235); its feed entry waits for the landing, which the clock passes below.
      expect((await send('POST', `/api/e/${slug}/coin`, hostCookie)).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/sessions/end`, hostCookie)).status).toBe(200)
      // Between Sessions the Host enters the Result of the open Round (#273): the feed names its game, and no game of the pools.
      expect((await send('PUT', `/api/e/${slug}/rounds/${openRound}/result`, hostCookie, { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] })).status).toBe(200)
      // The Host corrects that Result between Sessions too (#275): the Places swap, and the feed says so.
      expect((await send('PUT', `/api/e/${slug}/rounds/${openRound}/result`, hostCookie, { places: [{ team: 1, place: 2 }, { team: 2, place: 1 }] })).status).toBe(200)

      return { slug, eventId, games: [a, b, c, d] as const, set: f, player2Cookie }
    }

    it('produces every message type Nuxt sends to the room, and writes every Activity type', async () => {
      // The flow's leak tests below stay before the stop; this one casts a Veto after it, while the Session still runs.
      const { slug, eventId } = await lobbyFlow({ castVeto: true })

      expect(everyTypeListed).toBe(true)
      const sent = new Set(notifier.messages(eventId).map(message => message.type))
      for (const type of SERVER_SENT) expect(sent.has(type), `the flow sends no ${type}`).toBe(true)
      // The kinds of 0.7 and 0.8 (#226, #273) are in the enum; the flow writes the ones that exist so far (game_set and game_put_back, #228,
      // game_drawn, #229, which the feed shows from the stop on, vetoes_revealed, #231, from the end of the Veto window on, coin_tossed,
      // #235, from the landing on, result_entered, #273, and result_corrected, #275). The rest come with #233 (bonus_veto_granted) and
      // #277 (event_finished): the finish is written only by the case that finishes the flow's Event, below.
      const written = ACTIVITY_TYPES.filter(type => !['bonus_veto_granted', 'event_finished'].includes(type))
      clock.advance(WINDOW_MS + 10_000)
      expect(new Set((await activityOf(playerCookie, slug)).entries.map(entry => entry.type))).toEqual(new Set(written))
    })

    it('leaks no pool game through the room, the Activity feed or the Event read of either Player', async () => {
      const { slug, eventId, games, player2Cookie } = await lobbyFlow()
      const room = JSON.stringify(notifier.messages(eventId))
      const feed = (await activityOf(playerCookie, slug)).raw

      expectNoTrace('the room', room, games)
      expectNoTrace('the Activity feed of Player 1', feed, games)
      expectNoTrace('the Event read of Player 1', await rawRead(playerCookie, slug), games)
      expectNoTrace('the Event read of Player 2', await rawRead(player2Cookie, slug), games)
      // A Price is no part of the room or the feed, whoever reads them (#338).
      expect(room).not.toContain('"price"')
      expect(feed).not.toContain('"price"')
    })

    it('names only the set game in the Result entry a Player reads, while the wheel\'s draw is still unstopped (#273)', async () => {
      const { slug, eventId, games, set, player2Cookie } = await lobbyFlow()

      const entries = (await activityOf(playerCookie, slug)).entries.filter(entry => entry.type === 'result_entered')
      expect(entries).toMatchObject([{ type: 'result_entered', params: { gameId: set.id, number: 1, first: [1] }, games: { [set.id]: 'Foxtrot Fest' } }])
      expect(Object.keys(entries[0]!.games)).toEqual([set.id])
      expectNoTrace('the Activity feed entry of the Result', JSON.stringify(entries), games)
      expectNoTrace('the room\'s entry of the Result', JSON.stringify(notifier.messages(eventId).filter(message => message.type === 'activity.added' && message.entry.type === 'result_entered')), games)
      expectNoTrace('the Event read of Player 2', await rawRead(player2Cookie, slug), games)
    })

    it('names only the set game in the Correction a Player reads, and the Event read still names no pool game (#275)', async () => {
      const { slug, eventId, games, set, player2Cookie } = await lobbyFlow()

      const entries = (await activityOf(playerCookie, slug)).entries.filter(entry => entry.type === 'result_corrected')
      expect(entries).toMatchObject([{ type: 'result_corrected', params: { gameId: set.id, number: 1 }, games: { [set.id]: 'Foxtrot Fest' } }])
      expect(Object.keys(entries[0]!.games)).toEqual([set.id])
      expectNoTrace('the Activity feed entry of the Correction', JSON.stringify(entries), games)
      expectNoTrace('the room\'s entry of the Correction', JSON.stringify(notifier.messages(eventId).filter(message => message.type === 'activity.added' && message.entry.type === 'result_corrected')), games)
      expect((JSON.parse(await rawRead(player2Cookie, slug)) as EventView).results).toMatchObject([{ number: 1, corrected: true }])
      expectNoTrace('the Event read of Player 2', await rawRead(player2Cookie, slug), games)
    })

    it('names only the set game in the Results a Player reads (#274), and no pool game in the Standings or the end', async () => {
      const { slug, games, set, player2Cookie } = await lobbyFlow()
      const view = JSON.parse(await rawRead(player2Cookie, slug)) as EventView
      const raw = JSON.stringify({ results: view.results, standings: view.standings, end: view.end })

      expect(view.results).toMatchObject([{ number: 1, game: { id: set.id, name: 'Foxtrot Fest' } }])
      // The Correction swapped the Places: Party 2 leads the Standings now (#275).
      expect(view.standings?.map(row => row.team)).toEqual([2, 1])
      expect(view.end).toMatchObject({ played: 1, gameCount: 6, complete: false, tie: null, finish: null })
      // The Hidden wheel's spin is still unstopped for Player 2: its game is in none of the three fields.
      expectNoTrace('the results, the Standings and the end of Player 2', raw, games)
    })

    it('keeps the pools hidden through the finish (#277): the room, the feed and the reads name no pool game after it', async () => {
      const { slug, eventId, games, player2Cookie } = await lobbyFlow()
      // One Result stands (Foxtrot Fest, between Sessions): the Game count drops to it, so the Event is complete and the Host may finish.
      await testDb.db.update(events).set({ gameCount: 1 }).where(eq(events.id, eventId))

      expect((await send('POST', `/api/e/${slug}/finish`, hostCookie, { outcome: 'winner', winners: [2] })).status).toBe(200)

      const feed = await activityOf(playerCookie, slug)
      // The lobby flow's Correction (#275) swapped the Places, so Party 2 wins.
      expect(feed.entries[0]).toMatchObject({ type: 'event_finished', params: { winners: [2] } })
      expectNoTrace('the room after the finish', JSON.stringify(notifier.messages(eventId)), games)
      expectNoTrace('the Activity feed of Player 1 after the finish', feed.raw, games)
      expectNoTrace('the Event read of Player 2 after the finish', await rawRead(player2Cookie, slug), games)
    })

    it('shows the pools to a Player once the Hidden wheel is off and the Pool preview on, and the room still carries no game', async () => {
      const { slug, eventId, games } = await lobbyFlow()
      const [a, , , d] = games
      // The Session ended with a Round still being drawn; Rad verdecken is locked until its Veto window has run out (#231).
      clock.advance(WINDOW_MS + 10_000)

      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { hiddenWheel: false, poolPreview: true } })).status).toBe(200)

      const open = await rawRead(playerCookie, slug)
      expect((JSON.parse(open) as EventView).pool).toMatchObject([{ name: 'Alpha Arena' }, { name: 'Delta Dart' }])
      // Picture and name only (#224): the notes stay the Host's.
      for (const game of [a, d]) {
        for (const trace of traces(game).filter(trace => trace !== game.notes)) expect(open, `the open Event read lacks ${trace}`).toContain(trace)
        expect(open).not.toContain(game.notes)
        expect(open).not.toContain(game.tag)
      }
      expectNoTrace('the room', JSON.stringify(notifier.messages(eventId)), games)

      const hostRaw = await rawRead(hostCookie, slug)
      for (const game of [a, d]) expect(hostRaw).toContain(game.name)
    })
  })

  const second = { provider: 'twitch', id: '5', name: 'Zweite', email: 'second@example.com', image: undefined } as const
  const LOBBY = { ...HIDDEN_WHEEL, teamCount: 2, teamSize: 1 } as const
  /** The same Event with no Veto allowance: no window opens, so a draw settles at its stop (the spin tests below are about the stop). */
  const NO_WINDOW = { ...LOBBY, vetoAllowance: 0 } as const

  /** A Running Session under a Hidden wheel: Alpha and Beta in the Game pool, Gamma and Epsilon only in the library. */
  async function runningEvent(settings: Record<string, unknown> = LOBBY, extraGames = 0) {
    const [a, b, c, e] = [await newGame('Alpha Arena', 'aaaaaaaaaaa'), await newGame('Beta Bowling', 'bbbbbbbbbbb'), await newGame('Gamma Garten', 'ccccccccccc'), await newGame('Epsilon Eck', 'eeeeeeeeeee')]
    // More games for the Game pool, for a test that needs a wheel with many slices.
    const more = await Promise.all(Array.from({ length: extraGames }, (_, index) => newGame(`Zusatz ${index}`, `zzzzzzzzzz${index}`)))
    const created = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings, pool: [a.id, b.id, ...more.map(game => game.id)] }),
    })
    const { slug, inviteUrl } = await created.json() as CreatedEvent
    const token = new URL(inviteUrl).pathname.slice('/e/'.length)
    const secondCookie = (await signIn(testDb.db, second)).cookie
    for (const cookie of [playerCookie, secondCookie]) expect((await request(`/api/invite/${token}`, { method: 'POST', headers: { cookie } })).status).toBe(200)
    await startRunningSession(request, testDb.db, { slug, hostCookie, seated: [{ cookie: playerCookie, email: player.email }, { cookie: secondCookie, email: second.email }] })
    notifier.clear()
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    return { slug, eventId: eventRow!.id, a, b, c, e, secondCookie }
  }

  const imageStatus = async (secret: Secret) => (await request(secret.imageUrl, { headers: { cookie: playerCookie } })).status

  /** Everything the Player can read: the Event read, the feed and the room. */
  async function whatThePlayerGets(slug: string, eventId: string) {
    const feed = await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie: playerCookie } })
    return { event: await rawRead(playerCookie, slug), feed: await feed.text(), room: JSON.stringify(notifier.messages(eventId)) }
  }

  function expectNone(what: Record<string, string>, secrets: readonly Secret[], include: (secret: Secret) => string[] = playerTraces) {
    for (const [place, raw] of Object.entries(what)) {
      for (const secret of secrets) for (const trace of include(secret)) expect(raw, `${place} leaks ${trace}`).not.toContain(trace)
    }
  }

  // A game the Host sets is every Member's from the moment it is set, and nothing else becomes known with it (#228).
  describe('a game the Host sets (#228)', () => {
    it('shows a Player no game of the pools before a set: nothing in the Event read, the feed or the room, and no image', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      expectNone(await whatThePlayerGets(slug, eventId), [a, b, c, e])
      expect((JSON.parse(await rawRead(playerCookie, slug)) as EventView)).toMatchObject({ pool: null, rounds: [], setGame: null })
      // The pool warning (#234) is the Host's: the Host's read carries it here (2 games in the pool, 16 needed), the Player's and the room's do not.
      expect((JSON.parse(await rawRead(hostCookie, slug)) as EventView).setGame?.poolWarning).toEqual({ needed: 16, have: 2 })
      expect(await rawRead(playerCookie, slug)).not.toContain('poolWarning')
      expect(JSON.stringify(notifier.messages(eventId))).not.toContain('poolWarning')
      for (const secret of [a, b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('shows a Player exactly the game that is set, never its notes, and nothing else of the pools', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()

      await hostSets(request, slug, hostCookie, a.id)

      const got = await whatThePlayerGets(slug, eventId)
      expect(got.event).toContain('Alpha Arena')
      expect(got.event).toContain(a.imageKey)
      expect((JSON.parse(got.event) as EventView)).toMatchObject({ pool: null, rounds: [{ game: { id: a.id, name: 'Alpha Arena', youtubeId: 'aaaaaaaaaaa' } }] })
      expect(got.feed).toContain('Alpha Arena')
      expect(got.feed).not.toContain('"price"')
      expect(got.room).not.toContain('"price"')
      expectNone(got, [a], secret => [secret.notes, secret.tag])
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
      expectNone(got, [e], secret => [secret.notes, secret.tag])
      expect(await imageStatus(e)).toBe(200)
      for (const secret of [a, b, c]) expect(await imageStatus(secret)).toBe(404)
    })

    it('carries no Tag in the Host\'s or a Player\'s read of a set game and of its Result, and the Price only of the set game for a Player (#335, #338)', async () => {
      const { slug, a, b, c, e } = await runningEvent()
      const roundId = await hostSets(request, slug, hostCookie, a.id)
      // The Host sees the pool (Alpha, Beta) and the set game; the Player sees the set game only.
      const reads = async () => [await rawRead(hostCookie, slug), await rawRead(playerCookie, slug)]
      const expectPrices = (hostRaw: string, playerRaw: string) => {
        expect(hostRaw).toContain('"price"')
        expect(hostRaw).toContain('"checkedAt"')
        expect(hostRaw).toContain(priceTrace(a))
        expect(hostRaw).toContain(priceTrace(b))
        expect(hostRaw).not.toContain(priceTrace(c))
        expect(hostRaw).not.toContain(priceTrace(e))
        expect(playerRaw).toContain('"price"')
        expect(playerRaw).toContain('"checkedAt"')
        expect(playerRaw).toContain(priceTrace(a))
        for (const secret of [b, c, e]) expect(playerRaw).not.toContain(priceTrace(secret))
      }

      const [hostBefore, playerBefore] = await reads()
      expect(playerBefore).toContain('Alpha Arena')
      for (const raw of [hostBefore!, playerBefore!]) {
        expect(raw).not.toContain('"tags"')
        for (const secret of [a, b, c, e]) expect(raw).not.toContain(secret.tag)
      }
      expectPrices(hostBefore!, playerBefore!)

      const entered = await request(`/api/e/${slug}/rounds/${roundId}/result`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({ places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] }),
      })
      expect(entered.status).toBe(200)
      const [hostAfter, playerAfter] = await reads()
      expect((JSON.parse(hostAfter!) as EventView).results).toMatchObject([{ game: { price: a.price } }])
      expect((JSON.parse(playerAfter!) as EventView).results).toMatchObject([{ game: { price: a.price } }])
      for (const raw of [hostAfter!, playerAfter!]) {
        expect((JSON.parse(raw) as EventView).results).toHaveLength(1)
        expect(raw).not.toContain('"tags"')
        for (const secret of [a, b, c, e]) expect(raw).not.toContain(secret.tag)
      }
      expectPrices(hostAfter!, playerAfter!)
    })

    it('gives the Host the notes of the set game on its Round, and every game of the pools', async () => {
      const { slug, a } = await runningEvent()
      await hostSets(request, slug, hostCookie, a.id)

      const view = JSON.parse(await rawRead(hostCookie, slug)) as EventView

      expect(view.rounds).toMatchObject([{ game: { name: 'Alpha Arena' }, notes: a.notes }])
      expect(view.pool?.map(game => game.name)).toEqual(['Alpha Arena', 'Beta Bowling'])
    })

    it('reveals nothing more when the Host puts the Round back: the pools stay hidden, the games not set stay unknown', async () => {
      const { slug, eventId, a, b, c, e } = await runningEvent()
      const roundId = await hostSets(request, slug, hostCookie, a.id)

      await hostPutsBack(request, slug, hostCookie, roundId)

      const got = await whatThePlayerGets(slug, eventId)
      expect(JSON.parse(got.event)).toMatchObject({ pool: null, rounds: [] })
      expectNone(got, [b, c, e])
      expectNone(got, [a], secret => [secret.notes, secret.tag])
      for (const secret of [b, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('keeps the Player\'s read the same however many games the pools hold after a set, but for the wheel\'s own count', async () => {
      const { slug, eventId, a } = await runningEvent()
      await hostSets(request, slug, hostCookie, a.id)
      const before = JSON.parse(await rawRead(playerCookie, slug)) as EventView

      const delta = await newGame('Delta Dart', 'ddddddddddd')
      await testDb.db.insert(eventPoolGames).values({ eventId, gameId: delta.id })

      expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
      const after = JSON.parse(await rawRead(playerCookie, slug)) as EventView
      // The count is the wheel's: the Player learns how many games there are from the wheel and from nowhere else (spec story 13).
      expect(before.wheel).toEqual({ count: 1, slices: null, spin: null, vetoes: expect.anything() })
      expect(after.wheel).toEqual({ count: 2, slices: null, spin: null, vetoes: expect.anything() })
      expect({ ...after, wheel: null }).toEqual({ ...before, wheel: null })
    })
  })

  // A spin under a Hidden wheel reveals the drawn game at the stop and nothing else (#229, spec #218 § Hidden wheel on the wire).
  describe('a spin (#229)', () => {
    const spin = (slug: string, cookie = hostCookie) => request(`/api/e/${slug}/rounds/spin`, { method: 'POST', headers: { cookie } })

    /** The Player's whole view of the Event: the Event read, the feed and the room, as raw text. */
    async function whatThePlayerGets(slug: string, eventId: string) {
      const feed = await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie: playerCookie } })
      return { event: await rawRead(playerCookie, slug), feed: await feed.text(), room: JSON.stringify(notifier.messages(eventId)) }
    }

    /** A spin of a Running Session under a Hidden wheel, and the games on the wheel in the order of the draw. */
    async function spun() {
      const running = await runningEvent(NO_WINDOW)
      const response = await spin(running.slug)
      expect(response.status).toBe(200)
      const [row] = await testDb.db.select().from(draws)
      const drawn = [running.a, running.b].find(secret => secret.id === row!.gameId)!
      const undrawn = [running.a, running.b].find(secret => secret.id !== row!.gameId)!
      return { ...running, row: row!, drawn, undrawn, stopAt: row!.stopAt.getTime() }
    }

    const PLACEHOLDERS: readonly string[] = [...de.wheel.placeholders, de.wheel.placeholderQ]

    it('tells a Player before the stop no game: not in the Event read, the room message or the feed, and no picture', async () => {
      const { slug, eventId, a, b, c, e } = await spun()

      const got = await whatThePlayerGets(slug, eventId)

      expectNone(got, [a, b, c, e])
      for (const secret of [a, b, c, e]) expect(await imageStatus(secret)).toBe(404)
      expect((JSON.parse(got.feed) as ActivityPage).entries.map(entry => entry.type)).not.toContain('game_drawn')
    })

    it('gives the Player the wheel as placeholders: the count, shuffled names, and no game', async () => {
      const { slug, row } = await spun()

      const view = JSON.parse(await rawRead(playerCookie, slug)) as EventView

      expect(view.wheel).toEqual({
        count: 1,
        slices: null,
        spin: {
          roundId: row.roundId, drawId: row.id, spinStartAt: row.spinStartAt!.toISOString(), stopAt: row.stopAt.toISOString(), slices: 2, resultIndex: row.resultIndex, resultOffset: row.resultOffset, labels: row.sliceLabels, game: null, current: true,
        },
        vetoes: vetoRead({ left: [0, 0], own: { team: 1, cast: false, rejection: 'no_veto_window' }, draw: null }),
      })
      expect(row.sliceLabels).toHaveLength(2)
      expect(new Set(row.sliceLabels).size).toBe(2)
      for (const label of row.sliceLabels!) expect(PLACEHOLDERS).toContain(label)
    })

    it('tells the room only that the Event changed on a spin, and nothing of the wheel', async () => {
      const { eventId } = await spun()

      expect(notifier.messages(eventId).map(message => message.type)).toEqual(['event.changed'])
    })

    it('knows the drawn game on every surface from the same instant and not a millisecond earlier', async () => {
      const { slug, eventId, drawn, undrawn, c, e, row, stopAt } = await spun()

      clock.set(new Date(stopAt - 1))
      const before = await whatThePlayerGets(slug, eventId)
      expectNone(before, [drawn, undrawn, c, e])
      expect((JSON.parse(before.event) as EventView).clip).toBeNull()
      expect((JSON.parse(before.event) as EventView).wheel?.spin?.game).toBeNull()
      // Before the stop no Price reaches the Player: not in the Event read, the feed or the room (#338).
      for (const place of [before.event, before.feed, before.room]) expect(place).not.toContain('"price"')
      // The Host knows the drawn game's Price before the stop.
      expect((JSON.parse(await rawRead(hostCookie, slug)) as EventView).wheel?.spin?.game?.price).toEqual(drawn.price)
      expect(await imageStatus(drawn)).toBe(404)

      clock.set(new Date(stopAt))
      const at = await whatThePlayerGets(slug, eventId)
      const view = JSON.parse(at.event) as EventView
      expect(view.wheel?.spin?.game).toMatchObject({ id: drawn.id })
      expect(view.clip).toMatchObject({ drawId: row.id, game: { id: drawn.id } })
      expect(view.rounds).toMatchObject([{ game: { id: drawn.id } }])
      // From the stop on the drawn game's Price is on every surface that names it, and only its (#338).
      expect(view.wheel?.spin?.game?.price).toEqual(drawn.price)
      expect(view.clip?.game.price).toEqual(drawn.price)
      expect(view.rounds[0]!.game.price).toEqual(drawn.price)
      expect((JSON.parse(at.feed) as ActivityPage).entries.filter(entry => entry.type === 'game_drawn')).toMatchObject([{ games: { [drawn.id]: drawn.name } }])
      expect(at.feed).not.toContain('"price"')
      expect(at.room).not.toContain('"price"')
      expectNone(at, [undrawn, c, e])
      expect(await imageStatus(drawn)).toBe(200)
    })

    it('shows a Player the drawn game from the stop on, and the feed entry with its name, but no undrawn game', async () => {
      const { slug, eventId, drawn, undrawn, c, e, row, stopAt } = await spun()
      clock.set(new Date(stopAt))

      const got = await whatThePlayerGets(slug, eventId)

      const view = JSON.parse(got.event) as EventView
      expect(view.wheel?.spin?.game).toMatchObject({ id: drawn.id, name: drawn.name })
      expect(view.wheel?.spin?.labels?.[row.resultIndex!]).toBe(drawn.name)
      expect(view.rounds).toMatchObject([{ game: { id: drawn.id, name: drawn.name } }])
      expect(got.feed).toContain(drawn.name)
      expect((JSON.parse(got.feed) as ActivityPage).entries.filter(entry => entry.type === 'game_drawn')).toMatchObject([{ games: { [drawn.id]: drawn.name } }])
      expectNone(got, [undrawn, c, e])
      expectNone(got, [drawn], secret => [secret.notes, secret.tag])
      expect(await imageStatus(drawn)).toBe(200)
      for (const secret of [undrawn, c, e]) expect(await imageStatus(secret)).toBe(404)
    })

    it('keeps the undrawn game off the wheel for a Player after the removal too: the wheel has the count and nothing more', async () => {
      const { slug, undrawn, stopAt } = await spun()
      clock.set(new Date(stopAt + WINDOW_MS))

      const raw = await rawRead(playerCookie, slug)

      expect((JSON.parse(raw) as EventView).wheel).toMatchObject({ count: 1, slices: null })
      for (const trace of playerTraces(undrawn)) expect(raw).not.toContain(trace)
    })

    it('gives the Host the real names on the wheel throughout: before and after the stop', async () => {
      const { slug, a, b, row, stopAt } = await spun()

      const before = JSON.parse(await rawRead(hostCookie, slug)) as EventView
      expect(before.wheel?.spin?.labels).toEqual(row.sliceGameIds!.map(id => [a, b].find(secret => secret.id === id)!.name))
      expect(before.wheel?.spin?.game).toMatchObject({ id: row.gameId })
      expect(before.wheel?.slices).toHaveLength(1)

      clock.set(new Date(stopAt))
      const after = JSON.parse(await rawRead(hostCookie, slug)) as EventView
      expect(after.wheel?.spin?.labels).toEqual(before.wheel?.spin?.labels)
    })

    it('lays a Hidden wheel out in an order of its own, not that of the pool, and the drawn game is the slice at the result index (F2)', async () => {
      // Every draw of the source answers 0: result 0, and Fisher-Yates then turns the games left one place, whatever the pool's order.
      source.override = () => 0
      const running = await runningEvent(NO_WINDOW, 4)
      const before = JSON.parse(await rawRead(hostCookie, running.slug)) as EventView
      const poolOrder = before.wheel!.slices!.map(slice => slice.id)
      expect(poolOrder).toHaveLength(6)

      expect((await spin(running.slug)).status).toBe(200)

      const [row] = await testDb.db.select().from(draws)
      expect(row!.sliceGameIds).not.toEqual(poolOrder)
      expect([...row!.sliceGameIds!].sort()).toEqual([...poolOrder].sort())
      expect(row!.gameId).toBe(row!.sliceGameIds![row!.resultIndex!])
      // The Host's names follow the spin's own order, and the Player's placeholders have as many labels.
      const hostView = JSON.parse(await rawRead(hostCookie, running.slug)) as EventView
      expect(hostView.wheel!.spin!.labels).toEqual(row!.sliceGameIds!.map(id => before.wheel!.slices!.find(slice => slice.id === id)!.name))
      const playerView = JSON.parse(await rawRead(playerCookie, running.slug)) as EventView
      expect(playerView.wheel!.spin!.labels).toHaveLength(6)
    })

    it('hides the drawn game up to the last millisecond before the stop', async () => {
      const { slug, eventId, a, b, stopAt } = await spun()
      clock.set(new Date(stopAt - 1))

      expectNone(await whatThePlayerGets(slug, eventId), [a, b])
    })
  })

  // A Veto is sealed until the end of its window (#231, spec #218 § Vetoes): no other Party learns that one was cast, nor which.
  describe('a Veto (#231)', () => {
    const idOf = async (email: string) => (await testDb.db.select().from(users).where(eq(users.email, email)))[0]!.id

    /** A Running Session with a Veto allowance of 3; the wheel stopped, and Player 1 (team 1) cast the Veto. The room's record starts at the cast. */
    async function playerCasts() {
      const running = await runningEvent()
      const spun = await request(`/api/e/${running.slug}/rounds/spin`, { method: 'POST', headers: { cookie: hostCookie } })
      expect(spun.status).toBe(200)
      const { drawId } = await spun.json() as { drawId: string }
      const [row] = await testDb.db.select().from(draws)
      clock.set(row!.stopAt)
      notifier.clear()
      const cast = await request(`/api/e/${running.slug}/draws/${drawId}/veto`, { method: 'POST', headers: { cookie: playerCookie } })
      expect(cast.status).toBe(200)
      return { ...running, drawId, row: row!, playerId: await idOf(player.email), secondId: await idOf(second.email) }
    }

    const wheelOf = async (cookie: string, slug: string) => (JSON.parse(await rawRead(cookie, slug)) as EventView).wheel!

    it('reaches nobody before the end of the window: not the other Party, nor the Host, through the read, the numbers, the feed or the room', async () => {
      const { slug, eventId, playerId, secondId } = await playerCasts()

      const other = await wheelOf((await signIn(testDb.db, second)).cookie, slug)
      expect(other.vetoes).toEqual({ left: [3, 3], own: { team: 2, cast: false, rejection: null }, revealed: null, draw: expect.objectContaining({ kind: 'spin' }) })
      expect(await wheelOf(hostCookie, slug)).toMatchObject({ vetoes: { left: [3, 3], own: null, revealed: null } })
      for (const cookie of [hostCookie, (await signIn(testDb.db, second)).cookie]) {
        expect(JSON.stringify((JSON.parse(await rawRead(cookie, slug)) as EventView).wheel), 'the Event read').not.toContain(playerId)
        const feed = JSON.parse(await (await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie } })).text()) as ActivityPage
        expect(feed.entries.map(entry => entry.type)).not.toContain('vetoes_revealed')
      }
      // The Party's own Player sees it at once.
      expect((await wheelOf(playerCookie, slug)).vetoes).toEqual(vetoRead({ left: [2, 3], own: { team: 1, cast: true, rejection: 'veto_already_cast' } }))
      // The room: only the named send to the Party's Users, and neither event.changed nor any other message.
      expect(notifier.sends(eventId)).toEqual([{ to: [playerId], messages: [expect.objectContaining({ type: 'veto.cast', team: 1 })] }])
      expect(JSON.stringify(notifier.messages(eventId))).not.toContain(secondId)
    })

    it('names the caster to nobody: not the Party\'s Player, not the Host, not the other Party, before or after the end of the window (#355)', async () => {
      const { slug, row, playerId, secondId } = await playerCasts()
      const secondCookie = (await signIn(testDb.db, second)).cookie
      const hostId = await idOf(host.email)
      // The feed names Members in other entries (a move): only the Veto entry must hold no Player.
      const feedText = async (cookie: string) => JSON.stringify(((await (await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie } })).json()) as ActivityPage).entries.filter(entry => entry.type === 'vetoes_revealed'))

      const everyRead = async () => {
        for (const [who, cookie] of [['the Player', playerCookie], ['the Host', hostCookie], ['the other Party', secondCookie]] as const) {
          const wheel = JSON.stringify(await wheelOf(cookie, slug))
          for (const id of [playerId, secondId, hostId]) expect(wheel, `${who}'s Event read`).not.toContain(id)
          const feed = await feedText(cookie)
          for (const id of [playerId, secondId]) expect(feed, `${who}'s feed`).not.toContain(id)
        }
      }
      await everyRead()
      expect((await wheelOf(playerCookie, slug)).vetoes.own).toEqual({ team: 1, cast: true, rejection: 'veto_already_cast' })

      clock.set(row.vetoEndsAt!)
      await everyRead()
      expect((await wheelOf(hostCookie, slug)).vetoes.revealed).toEqual([{ team: 1 }])
    })

    it('keeps the Veto allowance floor of the Host where it was before the end of the window, and the allowance cannot be lowered under the sealed cast', async () => {
      const { slug, row } = await playerCasts()
      const hostView = async () => JSON.parse(await rawRead(hostCookie, slug)) as EventView
      const lower = async () => await request(`/api/e/${slug}/settings`, { method: 'PATCH', headers: { 'cookie': hostCookie, 'content-type': 'application/json' }, body: JSON.stringify({ settings: { vetoAllowance: 0 } }) })

      expect((await hostView()).settingsFloors?.vetoAllowance).toBe(0)
      const refused = await lower()
      expect(refused.status).toBe(409)
      expect((await refused.json() as { statusMessage: string }).statusMessage).toBe('locked_while_drawn')

      clock.set(row.vetoEndsAt!)
      expect((await hostView()).settingsFloors?.vetoAllowance).toBe(1)
    })

    it('reaches everyone at the end of the window: the Party that cast it, not the Player', async () => {
      const { slug, row } = await playerCasts()
      clock.set(row.vetoEndsAt!)

      const other = await wheelOf((await signIn(testDb.db, second)).cookie, slug)

      expect(other.vetoes).toEqual({ left: [2, 3], own: { team: 2, cast: false, rejection: 'veto_window_closed' }, revealed: [{ team: 1 }], draw: expect.objectContaining({ kind: 'spin' }) })
    })
  })
})
