import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'
import { events } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { GamePrice, GameView } from '../../shared/game'
import { createTestApp, mountedRoutes, type MountedRoute, type TestRequest } from './app'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, playersJoin, signInAs, startRunningSession, type Signed, type Stage } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// What the Hidden wheel's secrecy tests share (#148, split in #418): the app with its doubles, the cast, the four games and the
// Event they sit in, the readers and the trace helpers. `hiddenWheelWorld()` is called inside a `describe`; it registers the hooks
// and returns what the files use. The cookies and the database are assigned in hooks, so they are getters: a file that wants them
// as plain names copies them in a `beforeEach` of its own (it runs after the world's).

export const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
export const player = { provider: 'discord', id: '2', name: 'Gast', email: 'player@example.com', image: undefined } as const
export const stranger = { provider: 'discord', id: '4', name: 'Fremder', email: 'stranger@example.com', image: undefined } as const
export const second = { provider: 'twitch', id: '5', name: 'Zweite', email: 'second@example.com', image: undefined } as const

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
export function webp(payload: string): Uint8Array {
  const bytes = new Uint8Array(40)
  bytes.set([...ascii('RIFF'), 32, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii(payload)])
  return bytes
}

export const HIDDEN_WHEEL = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 } as const
export const LOBBY = { ...HIDDEN_WHEEL, teamCount: 2, teamSize: 1 } as const
/** The same Event with no Veto allowance: no window opens, so a draw settles at its stop (the spin tests below are about the stop). */
export const NO_WINDOW = { ...LOBBY, vetoAllowance: 0 } as const

/** The Veto read (`wheel.vetoes`, #231) with the defaults a case does not pin: no own part, nothing revealed, the spin's window. A new read field gets its default here, once. */
export function vetoRead({ left, own = null, revealed = null, draw = expect.objectContaining({ kind: 'spin' }) }: { left: number[], own?: object | null, revealed?: object[] | null, draw?: unknown }) {
  return { left, own, revealed, draw }
}

export interface Secret { id: string, name: string, videoId: string, notes: string, tag: string, imageUrl: string, imageKey: string, cents: number, price: GamePrice | null }

// The Price's amount is a trace (#338): distinct per game, it names the game whose Price a read carries.
export const priceTrace = (secret: Secret) => `"cents":${secret.cents}`
export const traces = (secret: Secret) => [secret.name, secret.id, secret.imageKey, secret.videoId, secret.notes, priceTrace(secret)]
// The Host's read holds every trace but a Tag: Tags live in the library only (#335).
export const playerTraces = (secret: Secret) => [...traces(secret), secret.tag]

export function expectNone(what: Record<string, string>, secrets: readonly Secret[], include: (secret: Secret) => string[] = playerTraces) {
  for (const [place, raw] of Object.entries(what)) {
    for (const secret of secrets) for (const trace of include(secret)) expect(raw, `${place} leaks ${trace}`).not.toContain(trace)
  }
}

// --- Every GET route (#418) -----------------------------------------------------------------------------------------------

/**
 * The files under server/api that answer every method and so are not swept, each with the reason. A new route without a method suffix
 * is neither swept nor named here: `getRoutes()` fails and says so, instead of leaving a read outside the secrecy check.
 */
export const NOT_SWEPT: Readonly<Record<string, string>> = {
  '[...].ts': 'the bare 404 of an unmatched /api path: it reads nothing',
  'auth/[...all].ts': 'Better Auth\'s own routes (sign-in, callbacks): no read of an Event or a game',
}

/** Every route that answers GET, from the files under server/api by Nitro's rule: a new read is in the sweep the day it lands. */
export function getRoutes(): MountedRoute[] {
  const swept: MountedRoute[] = []
  for (const route of mountedRoutes()) {
    if (route.method === 'get') swept.push(route)
    else if (route.method === null && !(route.file in NOT_SWEPT)) {
      throw new Error(`server/api/${route.file} answers every method, GET included: give it a method suffix or name it in NOT_SWEPT with the reason`)
    }
  }
  return swept
}

/** The query a route needs to answer at all; no other GET route needs one. */
const QUERIES: Readonly<Record<string, string>> = {
  '/api/e/:slug/activity': '?limit=100',
  '/api/e/:slug/share-image': '?format=wide',
}

// The viewers of the sweep: the keys of `EXPECTED_STATUS`.
export const PLAYER = 'the Player'
export const OUTSIDER = 'the non-Member'
export const HOST = 'the Host'
export const OTHER_PARTY = 'the other Party'

const answers = (player: number, nonMember: number, host: number, otherParty = player) => ({ [PLAYER]: player, [OUTSIDER]: nonMember, [HOST]: host, [OTHER_PARTY]: otherParty })

/**
 * The status each viewer gets from each GET route, before and after a draw's stop, with no Veto cast (#418). Each row was checked
 * against its handler, so a cell that a run answers differently is a finding, not a row to change.
 */
export const EXPECTED_STATUS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // Home lists the viewer's own Events, empty for a non-Member.
  '/api/e': answers(200, 200, 200),
  // ADR 0006: a non-Member gets the missing-route answer.
  '/api/e/:slug': answers(200, 404, 200),
  '/api/e/:slug/activity': answers(200, 404, 200),
  '/api/e/:slug/ics': answers(200, 404, 200),
  // A Member of a running Event gets `wrong_phase` (`beforeFinish`) before the format is read; a non-Member 404 from `loadEvent`.
  '/api/e/:slug/share-image': answers(409, 404, 409),
  // `requireLibraryViewer`: only Hosts and the Admin, the others get the missing-route answer.
  '/api/games': answers(404, 404, 200),
  '/api/games/:id': answers(404, 404, 200),
  '/api/games/tags': answers(404, 404, 200),
  // Reads `events`, no viewer.
  '/api/health': answers(200, 200, 200),
  // `canSeeImage`: the Host always; a Member only for a game a Round set or a draw stopped on (`seen`, below).
  '/api/images/:key': answers(404, 404, 200),
  // Needs a signed room call: every refusal is the same 401, whatever the cookie.
  '/api/internal/deploy-check': answers(401, 401, 401),
  // The signed-out Invite preview (name and Host only).
  '/api/invite/:invite': answers(200, 200, 200),
  // The viewer's own profile.
  '/api/me': answers(200, 200, 200),
}

/**
 * Every swept entry answers its row of `EXPECTED_STATUS`, so an unexpected status fails and not only a leaked body (#418). From the stop
 * on, `seen` is the drawn game's image key: the Player and the other Party (Members) get its picture, and nothing else of that route.
 */
export function expectStatuses(sweep: readonly SweptRoute[], { seen }: { seen?: string } = {}): void {
  for (const entry of sweep) {
    const row = EXPECTED_STATUS[entry.route]
    expect(row, `${entry.route} has no expected status: add a row to EXPECTED_STATUS`).toBeDefined()
    expect(row?.[entry.who], `${entry.route} has no expected status for ${entry.who}`).toBeDefined()
    const memberOfTheStop = entry.who === PLAYER || entry.who === OTHER_PARTY
    const seenPicture = seen !== undefined && entry.route === '/api/images/:key' && memberOfTheStop && entry.path.endsWith(seen)
    expect(entry.status, `${entry.label} as ${entry.who}`).toBe(seenPicture ? 200 : row![entry.who])
  }
}

export interface SweptRoute {
  /** `GET /api/games/:id (id=...)`: the route as Nitro names it, and the value when a param takes several. */
  label: string
  route: string
  path: string
  who: string
  status: number
  contentType: string | null
  /** The raw text; `null` for a picture (its status and content type are what is checked). */
  body: string | null
}

/**
 * Reads every GET route as each viewer. The params come from the Event under test: `slug` its slug, `invite` its Invite token,
 * `id` every game's id, `key` every game's image key; a route with several params takes the product. A param with no filler fails
 * the call, so a new `:x` is added here and not skipped.
 */
export async function sweepGets(request: TestRequest, { viewers, event, games }: {
  viewers: readonly { who: string, cookie?: string }[]
  event: { slug: string, inviteToken: string }
  games: readonly Secret[]
}): Promise<SweptRoute[]> {
  const valuesOf = (param: string): string[] => {
    if (param === 'slug') return [event.slug]
    if (param === 'invite') return [event.inviteToken]
    if (param === 'id') return games.map(game => game.id)
    if (param === 'key') return games.map(game => game.imageKey)
    throw new Error(`a new route parameter \`:${param}\`: add a filler to the sweep`)
  }
  const swept: SweptRoute[] = []
  for (const { route, params } of getRoutes()) {
    let combinations: Record<string, string>[] = [{}]
    for (const param of params) combinations = combinations.flatMap(so => valuesOf(param).map(value => ({ ...so, [param]: value })))
    for (const filled of combinations) {
      const many = params.filter(param => valuesOf(param).length > 1)
      const path = Object.entries(filled).reduce((made, [param, value]) => made.replace(`:${param}`, value), route) + (QUERIES[route] ?? '')
      const label = `GET ${route}${QUERIES[route] ?? ''}${many.length > 0 ? ` (${many.map(param => `${param}=${filled[param]}`).join(', ')})` : ''}`
      for (const { who, cookie } of viewers) {
        const response = await request(path, { headers: cookie ? { cookie } : {} })
        const contentType = response.headers.get('content-type')
        const picture = contentType?.startsWith('image/') ?? false
        const body = picture ? null : await response.text()
        swept.push({ label, route, path, who, status: response.status, contentType, body })
      }
    }
  }
  return swept
}

/** The sweep's bodies as `expectNone` takes them: the route and the viewer name the place a trace leaks to. */
export const bodiesOf = (sweep: readonly SweptRoute[], who?: string): Record<string, string> => Object.fromEntries(
  sweep.filter(entry => entry.body !== null && (who === undefined || entry.who === who)).map(entry => [`${entry.label} as ${entry.who}`, entry.body!]),
)

// --- The world ------------------------------------------------------------------------------------------------------------

/** Call inside a `describe`: registers `beforeAll`, `afterAll`, `beforeEach` and `afterEach`, and returns what the cases use. */
export function hiddenWheelWorld() {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let app: TestRequest
  const store = memoryImageStore()
  const notifier = memoryRoomNotifier()
  // The server's clock (#226): the real time until a spin test moves it past a stop instant.
  const clock = testClock(new Date())
  let hostSigned: Signed
  let playerSigned: Signed

  beforeAll(async () => {
    testDb = await createTestDb()
    app = createTestApp(testDb.db, { imageStore: store, roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1', admins: 'discord:9' })
    clock.set(new Date())
    await resetDatabase(testDb.db)
    store.clear()
    notifier.clear()
    hostSigned = await signInAs(stage(), host)
    playerSigned = await signInAs(stage(), player)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const request: TestRequest = (path, init) => app(path, init)
  // `testDb` and the stage are read when used: the hooks assign them.
  const db = {
    get db() {
      return testDb.db
    },
    get client() {
      return testDb.client
    },
  }
  const stage = (): Stage => ({ request, db: testDb.db, clock, notifier })

  async function newGame(name: string, videoId: string): Promise<Secret> {
    // Every game carries notes (#224): a Player must not get them under a Hidden wheel.
    const notes = `Hausregel fuer ${name}`
    // Lower case, so the key and the label are one string; no Event read carries a Tag, not even the Host's (#335).
    const tag = `tag-${name.split(' ')[0]!.toLowerCase()}`
    // Distinct cents per game (#338): the amount names its game in a read.
    const cents = 1000 + 111 * (name.charCodeAt(0) - 64)
    const created = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostSigned.cookie },
      body: JSON.stringify({ name, youtubeUrl: `https://youtu.be/${videoId}`, notes, tags: [tag], price: { cents, source: 'steam' } }),
    })
    expect(created.status).toBe(200)
    const { id, price } = await created.json() as GameView
    const uploaded = await request(`/api/games/${id}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'cookie': hostSigned.cookie },
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
    const created = await hostCreatesEvent(stage(), hostSigned, { sessions: 1, slots: ['2090-10-30T20:30'], settings, pool: [a.id, b.id] })
    await playersJoin(stage(), created, [playerSigned])
    return { slug: created.slug, secrets: [a, b, c], a }
  }

  async function rawRead(cookie: string, slug: string) {
    const response = await request(`/api/e/${slug}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return await response.text()
  }

  /**
   * A Running Session under a Hidden wheel: Alpha and Beta in the Game pool, Gamma and Epsilon only in the library. `more` are the
   * `extraGames` of the Game pool too. The Host's and the Player's sign-in and the set-up verbs are ./scenario's; the games are made
   * over HTTP with an image, so the builder stays here (#418).
   */
  async function runningEvent(settings: Record<string, unknown> = LOBBY, extraGames = 0) {
    const [a, b, c, e] = [await newGame('Alpha Arena', 'aaaaaaaaaaa'), await newGame('Beta Bowling', 'bbbbbbbbbbb'), await newGame('Gamma Garten', 'ccccccccccc'), await newGame('Epsilon Eck', 'eeeeeeeeeee')]
    // More games for the Game pool, for a test that needs a wheel with many slices.
    const more = await Promise.all(Array.from({ length: extraGames }, (_, index) => newGame(`Zusatz ${index}`, `zzzzzzzzzz${index}`)))
    const created = await hostCreatesEvent(stage(), hostSigned, { sessions: 1, slots: ['2090-10-30T20:30'], settings, pool: [a.id, b.id, ...more.map(game => game.id)] })
    const secondSigned = await signInAs(stage(), second)
    await playersJoin(stage(), created, [playerSigned, secondSigned])
    await startRunningSession(request, testDb.db, { slug: created.slug, hostCookie: hostSigned.cookie, seated: [{ cookie: playerSigned.cookie, email: player.email }, { cookie: secondSigned.cookie, email: second.email }] })
    notifier.clear()
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, created.slug))
    return { slug: created.slug, eventId: eventRow!.id, inviteToken: created.inviteToken, a, b, c, e, more, secondCookie: secondSigned.cookie }
  }

  const imageStatus = async (secret: Secret) => (await request(secret.imageUrl, { headers: { cookie: playerSigned.cookie } })).status

  /** Everything the Player can read: the Event read, the feed and the room. */
  async function whatThePlayerGets(slug: string, eventId: string) {
    const feed = await request(`/api/e/${slug}/activity?limit=100`, { headers: { cookie: playerSigned.cookie } })
    return { event: await rawRead(playerSigned.cookie, slug), feed: await feed.text(), room: JSON.stringify(notifier.messages(eventId)) }
  }

  return {
    testDb: db,
    request,
    stage,
    store,
    notifier,
    clock,
    get hostCookie() { return hostSigned.cookie },
    get playerCookie() { return playerSigned.cookie },
    newGame,
    setUp,
    rawRead,
    traces,
    playerTraces,
    priceTrace,
    expectNone,
    runningEvent,
    imageStatus,
    whatThePlayerGets,
    HIDDEN_WHEEL,
    LOBBY,
    NO_WINDOW,
    vetoRead,
    host,
    player,
    stranger,
    second,
    sweepGets: (options: Parameters<typeof sweepGets>[1]) => sweepGets(request, options),
  }
}
