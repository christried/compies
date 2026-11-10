import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import { activity, authAccounts, draws, eventMembers, eventPoolGames, events, games, pollSlots } from '../../server/db/schema'
import type { testClock } from '../../server/utils/clock'
import type { Db } from '../../server/utils/db'
import type { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityEntry, ActivityPage } from '../../shared/activity'
import type { EventFinished, EventView } from '../../shared/event'
import type { CoinTossed } from '../../shared/stage'
import { sendVia, type TestRequest } from './app'
import { TEST_SETTINGS } from './fixtures'
import { setAllowlist, signIn, type ProviderProfile } from './sign-in'

// The Event scenario (#418, spec #413): glossary verbs over the HTTP surface. A verb is the happy path: it asserts `status === 200`
// itself and answers what it created (an id, rows). A test that wants a refusal calls `send` (`sendVia`, ./app) and reads it with
// `errorOf`.
//
// In order of use:
// - `signInAs`, or `hostSignsIn` for a Host (it sets the allowlist).
// - `startRunningEvent` (an Event with a Running Session) or `setUpEvent` (the same, no Session started). Options: `host`,
//   `players` and `seats` (a Player not seated is a Member on the Bench), `outsiders` (none), `sessions` (2), `slots` (one per
//   Session, from 2090-10-30), `extraSlots` (none), `confirmed` (every Session), `settings` (spread over `TEST_SETTINGS`), `games`
//   (none), `join` ('rows'), `quiet` ('room').
// - A file that makes its own games over HTTP: `hostCreatesEvent` + `playersJoin`, then `startRunningSession` (the first Date, one
//   Player per team, the start) or `hostSetsDates` + `playersTakeSeats` + `hostStartsSession`.
// - The verbs on an Event take `(rig, event, …)`, the clock verbs `(rig, drawId)`, the reads `(rig, cookie, slug)`.
//
// What does not belong here: the cast (profiles, ids, emails, names) is the caller's, since assertions name it. A file that needs
// one extra thing keeps a short local wrapper that calls these verbs and then inserts its own rows; it never copies the sign-in /
// seat / start sequence.
//
// Not expressed: an Event with no settings (session-start updates the row after `setUpEvent`), and games made over HTTP with an
// image upload (hidden-wheel-world: its own `newGame`, then `hostCreatesEvent({ pool })`).

/** Where the verbs run: the app (`createTestApp`), its database, and the doubles the test already owns. A test rig, not the Event page's Stage (#415). */
export interface Rig {
  request: TestRequest
  db: Db
  /** For `clockToStop` and `clockToEnd`: the clock the app was built with. */
  clock?: ReturnType<typeof testClock>
  /** Cleared after the start when `quiet` says so. */
  notifier?: ReturnType<typeof memoryRoomNotifier>
}

/** A User who has signed in: the profile, the login cookie header, `users.id`. */
export interface Signed { profile: ProviderProfile, cookie: string, id: string }

/**
 * One game row inserted straight into the library: `values` are `games` insert columns (name, notes, youtubeId, clipStart, clipLength,
 * priceCents, priceSource, priceCheckedAt, imageKey, playersMin, playersMax, ...); `pool` puts it in the Event's Game pool
 * (`event_pool_games`). `createdBy` is the Host's id, set by the module.
 */
export interface GameSeed { key: string, values: Omit<typeof games.$inferInsert, 'createdBy'>, pool: boolean }

/** Where a Player takes a seat: a team position (1, 2, …) or the Stands. A Player not seated stays a Member on the Bench. */
export type Seat = number | 'stands'

export interface ScenarioEventOptions<Player extends string, Game extends string = never, Outsider extends string = never> {
  host: ProviderProfile
  /** Each signs in and becomes a Member of the Event (by rows, or by Invite with `join: 'invite'`). */
  players: Record<Player, ProviderProfile>
  /** `[player, seat]`: the Player moves THEMSELF there through POST move, as the builders do. A Player not listed is a Member on the Bench. */
  seats: readonly (readonly [NoInfer<Player>, Seat])[]
  /** Sign in, are no Member. */
  outsiders?: Record<Outsider, ProviderProfile>
  /** Default 'Freitags-Zocken'. */
  name?: string
  /** Default 2 (one Slot per Session). */
  sessions?: number
  /** Default `['2090-10-30T20:30', '2090-10-31T19:00']` cut to `sessions` (later ones follow day by day); the length must equal `sessions`. */
  slots?: readonly string[]
  /** Slots the poll offers after `slots`, beyond one Date per Session (a Session that waits for its Date, #164): `confirmed` does not count them. */
  extraSlots?: readonly string[]
  /** How many Slots get a Date through POST confirm, in Slot order. Default `sessions`; 0 leaves the Event in its poll. */
  confirmed?: number
  /** Spread over `TEST_SETTINGS`, e.g. `{ teamSize: 2, selectionMode: 'lucky_wheel', vetoAllowance: 1, hiddenWheel: true, gameCount: 10 }`. */
  settings?: Record<string, unknown>
  games?: readonly (GameSeed & { key: Game })[]
  /** Default 'rows': `event_members` inserted straight. 'invite': POST /api/invite/:invite, which writes `member_joined` feed entries and room messages like a real join. */
  join?: 'rows' | 'invite'
  /** After the setup: `notifier.clear()` / also delete the `activity` rows / nothing. Default 'room'. */
  quiet?: 'room' | 'room-and-feed' | false
}

/** What the verbs need of an Event: it is made by `hostCreatesEvent`; `startRunningEvent` and `setUpEvent` add the Players. */
export interface CreatedEvent { slug: string, eventId: string, inviteToken: string, slotIds: string[] }

export interface ScenarioEvent<Player extends string = string, Game extends string = never, Outsider extends string = never> extends CreatedEvent {
  host: Signed
  players: Record<Player, Signed>
  outsiders: Record<Outsider, Signed>
  games: Record<Game, typeof games.$inferSelect>
}

/** What a verb on an Event needs: its slug, its ids and the Host's login. `ScenarioEvent` is one. */
type EventRef = Pick<ScenarioEvent<string, string, string>, 'slug' | 'eventId' | 'inviteToken' | 'slotIds' | 'host'>

const sendOf = (rig: Rig) => sendVia(() => rig.request)

/** The first two Slots every file used; more Sessions follow a day apart. */
const DEFAULT_SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const defaultSlots = (sessions: number) => Array.from({ length: sessions }, (_, index) => DEFAULT_SLOTS[index] ?? `2090-11-${String(index).padStart(2, '0')}T19:00`)

async function expectOk(response: Response, what: string): Promise<Response> {
  if (response.status !== 200) throw new Error(`${what}: expected 200, got ${response.status} ${await response.clone().text()}`)
  return response
}

// --- Sign-in --------------------------------------------------------------------------------------------------------------

/** Signs the profile in through the OAuth round trip (Better Auth with the provider stubbed). */
export async function signInAs(rig: Rig, profile: ProviderProfile): Promise<Signed> {
  const { cookie } = await signIn(rig.db, profile)
  const [account] = await rig.db.select({ userId: authAccounts.userId }).from(authAccounts)
    .where(eq(authAccounts.accountId, profile.id))
  expect(account, `${profile.provider}:${profile.id} has no user row after signing in`).toBeDefined()
  return { profile, cookie, id: account!.userId }
}

/**
 * Signs the Host in with the Host permission: it sets the allowlist to that one account (`HOST_PROVIDER_IDS`) first, and so overwrites
 * `ADMIN_PROVIDER_IDS` (empty). A test that needs an Admin calls `setAllowlist` (./sign-in) after this.
 */
export async function hostSignsIn(rig: Rig, profile: ProviderProfile): Promise<Signed> {
  setAllowlist({ hosts: `${profile.provider}:${profile.id}` })
  return await signInAs(rig, profile)
}

// --- Setting an Event up --------------------------------------------------------------------------------------------------

/**
 * The Host creates an Event with a poll (POST /api/e). `settings` go in as given (default `TEST_SETTINGS`), so a file whose settings omit
 * a key keeps omitting it; `pool` is a list of library game ids for the Game pool. `startRunningEvent` and `setUpEvent` call this first.
 */
export async function hostCreatesEvent(rig: Rig, host: Signed, { name = 'Freitags-Zocken', sessions = 2, slots, settings = TEST_SETTINGS, pool }: {
  name?: string
  sessions?: number
  slots?: readonly string[]
  settings?: Record<string, unknown>
  pool?: readonly string[]
} = {}): Promise<CreatedEvent> {
  const created = await sendOf(rig)('POST', '/api/e', host.cookie, {
    name, dateMode: 'poll', sessions, slots: slots ?? defaultSlots(sessions), settings, ...(pool ? { pool } : {}),
  })
  await expectOk(created, 'POST /api/e')
  const { slug, inviteUrl } = await created.json() as { slug: string, inviteUrl: string }
  const [eventRow] = await rig.db.select({ id: events.id }).from(events).where(eq(events.slug, slug))
  const slotRows = await rig.db.select({ id: pollSlots.id }).from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)
  return { slug, eventId: eventRow!.id, inviteToken: new URL(inviteUrl).pathname.slice('/e/'.length), slotIds: slotRows.map(row => row.id) }
}

/** The signed-in Users join through the Invite link (POST /api/invite/:invite): Members on the Bench, with a `member_joined` entry and a room message each. */
export async function playersJoin(rig: Rig, event: Pick<CreatedEvent, 'inviteToken'>, players: readonly Signed[]): Promise<void> {
  for (const player of players) await expectOk(await sendOf(rig)('POST', `/api/invite/${event.inviteToken}`, player.cookie), `join as ${player.profile.name}`)
}

/** The Host confirms the first `count` Slots (default all) as the Sessions' Dates, in Slot order. */
export async function hostSetsDates(rig: Rig, event: Pick<EventRef, 'slug' | 'slotIds' | 'host'>, count: number = event.slotIds.length): Promise<void> {
  for (const slotId of event.slotIds.slice(0, count)) {
    await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/confirm`, event.host.cookie, { slotId }), 'confirm a Date')
  }
}

/** The Player moves THEMSELF to the seat (POST move with their own cookie). */
async function takeSeat(rig: Rig, slug: string, player: Signed, seat: Seat): Promise<void> {
  const to = seat === 'stands' ? { zone: 'stands' } : { zone: 'team', team: seat }
  await expectOk(await sendOf(rig)('POST', `/api/e/${slug}/move`, player.cookie, { userId: player.id, to }), `${player.profile.name} takes a seat`)
}

/** Each Player moves THEMSELF to their seat; the Host moving a Player is a request a test sends itself. */
export async function playersTakeSeats<Player extends string>(rig: Rig, event: { slug: string, players: Record<Player, Signed> }, seats: readonly (readonly [Player, Seat])[]): Promise<void> {
  for (const [key, seat] of seats) await takeSeat(rig, event.slug, event.players[key], seat)
}

/** The Host starts the next Session. */
export async function hostStartsSession(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>): Promise<void> {
  await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/sessions/start`, event.host.cookie), 'start the Session')
}

/** The Host ends the Running Session. */
export async function hostEndsSession(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>): Promise<void> {
  await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/sessions/end`, event.host.cookie), 'end the Session')
}

/**
 * The whole set-up, in this order: sign in (Host, Players, outsiders), create the Event, make the Members, insert the games, set the
 * Dates, seat the Players, start the Session when `start` says so, then `quiet`. Every Player in `players` is a Member, seated or not.
 */
async function buildEvent<Player extends string, Game extends string = never, Outsider extends string = never>(rig: Rig, options: ScenarioEventOptions<Player, Game, Outsider>, start: boolean): Promise<ScenarioEvent<Player, Game, Outsider>> {
  const { sessions = 2, confirmed = sessions, join = 'rows', quiet = 'room' } = options
  const dated = options.slots ?? defaultSlots(sessions)
  expect(dated, 'slots and sessions must have the same length').toHaveLength(sessions)
  const slots = [...dated, ...(options.extraSlots ?? [])]

  const host = await hostSignsIn(rig, options.host)
  const players = {} as Record<Player, Signed>
  for (const [key, profile] of Object.entries<ProviderProfile>(options.players)) players[key as Player] = await signInAs(rig, profile)
  const outsiders = {} as Record<Outsider, Signed>
  for (const [key, profile] of Object.entries<ProviderProfile>(options.outsiders ?? {})) outsiders[key as Outsider] = await signInAs(rig, profile)

  const created = await hostCreatesEvent(rig, host, { name: options.name, sessions, slots, settings: { ...TEST_SETTINGS, ...options.settings } })
  const members = Object.values<Signed>(players)
  if (join === 'invite') await playersJoin(rig, created, members)
  else if (members.length > 0) await rig.db.insert(eventMembers).values(members.map(player => ({ eventId: created.eventId, userId: player.id })))

  const seeded = {} as Record<Game, typeof games.$inferSelect>
  const seeds = options.games ?? []
  if (seeds.length > 0) {
    const rows = await rig.db.insert(games).values(seeds.map(seed => ({ ...seed.values, createdBy: host.id }))).returning()
    const pooled = rows.filter((_, index) => seeds[index]!.pool)
    if (pooled.length > 0) await rig.db.insert(eventPoolGames).values(pooled.map(row => ({ eventId: created.eventId, gameId: row.id })))
    for (const [index, seed] of seeds.entries()) seeded[seed.key] = rows[index]!
  }

  const event: ScenarioEvent<Player, Game, Outsider> = { ...created, host, players, outsiders, games: seeded }
  await hostSetsDates(rig, event, confirmed)
  await playersTakeSeats(rig, event, options.seats)
  if (start) await hostStartsSession(rig, event)
  if (quiet === 'room-and-feed') await rig.db.delete(activity)
  if (quiet) rig.notifier?.clear()
  return event
}

/**
 * An Event with a Running Session: the Host and the Players signed in, the Event created, its Members, games, Dates (`confirmed`) and
 * seats, the Session started, then `quiet`.
 */
export async function startRunningEvent<Player extends string, Game extends string = never, Outsider extends string = never>(rig: Rig, options: ScenarioEventOptions<Player, Game, Outsider>): Promise<ScenarioEvent<Player, Game, Outsider>> {
  return await buildEvent(rig, options, true)
}

/**
 * An Event that has no Running Session: the Host and the Players signed in, the Event created, its Members, games, Dates (`confirmed`)
 * and seats, then `quiet`; no Session start.
 */
export async function setUpEvent<Player extends string, Game extends string = never, Outsider extends string = never>(rig: Rig, options: ScenarioEventOptions<Player, Game, Outsider>): Promise<ScenarioEvent<Player, Game, Outsider>> {
  return await buildEvent(rig, options, false)
}

// --- During the Session ---------------------------------------------------------------------------------------------------

/**
 * Sets the first Session's Date, seats the Players in teams 1, 2, … (one each) and starts the Session: for an Event a file made itself
 * (`hostCreatesEvent`), so the first Slot is looked up by the slug.
 */
export async function startRunningSession(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>, seated: readonly Signed[]): Promise<void> {
  const [eventRow] = await rig.db.select().from(events).where(eq(events.slug, event.slug))
  const [slot] = await rig.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)
  await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/confirm`, event.host.cookie, { slotId: slot!.id }), 'confirm a Date')
  for (const [index, player] of seated.entries()) await takeSeat(rig, event.slug, player, index + 1)
  await hostStartsSession(rig, event)
}

/** The Host sets a game in the Running Session; answers the Round's id. */
export async function hostSets(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>, gameId: string): Promise<string> {
  const response = await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/rounds`, event.host.cookie, { gameId }), 'set a game')
  return (await response.json() as { roundId: string }).roundId
}

/** The Host puts a Round back. */
export async function hostPutsBack(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>, roundId: string): Promise<void> {
  await expectOk(await sendOf(rig)('DELETE', `/api/e/${event.slug}/rounds/${roundId}`, event.host.cookie), 'put a Round back')
}

/** The Host spins the Lucky Wheel; answers the Round's and the draw's ids. */
export async function hostSpins(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>): Promise<{ roundId: string, drawId: string }> {
  const response = await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/rounds/spin`, event.host.cookie), 'spin the wheel')
  return await response.json() as { roundId: string, drawId: string }
}

/** A Player casts a Veto against a draw (POST draws/:drawId/veto). */
export async function playerVetoes(rig: Rig, event: Pick<EventRef, 'slug'>, drawId: string, player: Signed): Promise<void> {
  await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/draws/${drawId}/veto`, player.cookie), `${player.profile.name} casts a Veto`)
}

/** The Host enters a Result on an open Round: one `{ team, place, score? }` per Party. Answers the Round's id and number. */
export async function hostEntersResult(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>, roundId: string, places: readonly { team: number, place: number, score?: string }[]): Promise<{ roundId: string, number: number }> {
  const response = await expectOk(await sendOf(rig)('PUT', `/api/e/${event.slug}/rounds/${roundId}/result`, event.host.cookie, { places }), 'enter a Result')
  return await response.json() as { roundId: string, number: number }
}

/** The Host finishes the Event with a winner or a tie. */
export async function hostFinishes(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>, { outcome, winners }: { outcome: 'winner' | 'tie', winners: readonly number[] }): Promise<EventFinished> {
  const response = await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/finish`, event.host.cookie, { outcome, winners }), 'finish the Event')
  return await response.json() as EventFinished
}

/** The Host tosses the Coin. */
export async function hostTossesCoin(rig: Rig, event: Pick<EventRef, 'slug' | 'host'>): Promise<CoinTossed> {
  const response = await expectOk(await sendOf(rig)('POST', `/api/e/${event.slug}/coin`, event.host.cookie), 'toss the Coin')
  return await response.json() as CoinTossed
}

// --- The clock ------------------------------------------------------------------------------------------------------------

async function drawRow(rig: Rig, drawId: string) {
  if (!rig.clock) throw new Error('The rig has no clock: build the app with a testClock and pass it as `clock`')
  const [row] = await rig.db.select().from(draws).where(eq(draws.id, drawId))
  expect(row, `no draw ${drawId}`).toBeDefined()
  return { clock: rig.clock, row: row! }
}

/** Moves the clock to the draw's stop: the wheel has landed, the Veto window opens (a set draw's stop is its commit). */
export async function clockToStop(rig: Rig, drawId: string): Promise<void> {
  const { clock, row } = await drawRow(rig, drawId)
  clock.set(row.stopAt)
}

/** Moves the clock to the end of the draw's Veto window; throws when the draw has no window. */
export async function clockToEnd(rig: Rig, drawId: string): Promise<void> {
  const { clock, row } = await drawRow(rig, drawId)
  if (!row.vetoEndsAt) throw new Error(`The draw ${drawId} opened no Veto window`)
  clock.set(row.vetoEndsAt)
}

// --- Reads ----------------------------------------------------------------------------------------------------------------

/** The raw text of the Event read, for a secrecy check that searches the answer for a trace. */
export async function readEventText(rig: Rig, cookie: string, slug: string): Promise<string> {
  return await (await expectOk(await sendOf(rig)('GET', `/api/e/${slug}`, cookie), 'read the Event')).text()
}

/** The Event read (GET /api/e/:slug) as the User with `cookie` gets it. */
export async function readEvent(rig: Rig, cookie: string, slug: string): Promise<EventView> {
  return JSON.parse(await readEventText(rig, cookie, slug)) as EventView
}

/** The raw text of the Activity feed; `query` is the query string, with or without the `?` (`'limit=100'`). */
export async function readFeedText(rig: Rig, cookie: string, slug: string, query = ''): Promise<string> {
  const search = query && !query.startsWith('?') ? `?${query}` : query
  return await (await expectOk(await sendOf(rig)('GET', `/api/e/${slug}/activity${search}`, cookie), 'read the feed')).text()
}

/** The entries of the Activity feed, newest first. */
export async function readFeed(rig: Rig, cookie: string, slug: string, query = ''): Promise<ActivityEntry[]> {
  return (JSON.parse(await readFeedText(rig, cookie, slug, query)) as ActivityPage).entries
}
