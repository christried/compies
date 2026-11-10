import { asc, desc, eq, sql } from 'drizzle-orm'
import { bonusVetoes, coinTosses, draws, eventMembers, eventPoolGames, eventTeams, games, roundPlaces, rounds, users, vetoes } from '../db/schema'
import { numberedSessions } from '../domain/session'
import { countSeats, composeTeamName, moveRejection, placeOf, teamChoiceOpen, type MoveRejection, type Place, type Zone } from '../../shared/board'
import { coinRejection } from '../../shared/coin'
import { windowEnded } from '../../shared/draw-timeline'
import { finishRejection, lastGameRejection, standingsAndEnd, type FinishRejection, type FinishRequest, type LastGameRejection } from '../../shared/finish'
import {
  bonusVetoCounts,
  bonusVetoRejection,
  gamesLeft,
  isBeingDrawn,
  roundsStarted,
  setRejection,
  spinRejection,
  vetoRejection,
  vetoesLeftByParty,
  type BonusVetoRejection,
  type SetRejection,
  type SpinRejection,
  type VetoRejection,
} from '../../shared/rounds'
import { beforeFinish } from '../../shared/phase'
import { hasStarted, nextSession, runningOf, startRejection, type StartRejection } from '../../shared/session-state'
import { playersPerTeam, settingsFromRow, type EventSettings, type FloorFacts } from '../../shared/settings'
import type { CoinRow } from './coin'
import type { Db } from './db'
import type { EventRow } from './event-access'
import type { DrawRow, RoundRow } from './rounds'
import { eventSessions, type SessionRow } from './sessions'
import type { VetoRow } from './vetoes'

// The Event state (#416): the facts every rule of an Event runs on, read in parts, and each rule's reason for a User at
// `now`. The Event read and every write route under `changeEvent` take their facts from here, so the dock's reason and the route's refusal
// cannot drift apart (review 0.8 Q2, #288). The state is the writer's truth: all draws and their games, every Veto cast. What a viewer may
// know of it (a sealed Veto, a drawn game before its stop) is a separate step the Event read takes on top (knownVetoRows, drawGameKnown).
// The rules themselves are pure functions in `shared/`; the functions below only hand them the state's facts.
//
// A part is one statement, and a route asks only for the parts its rules need: the statements under the Event row lock are budgeted
// (test/integration/lock-statements.test.ts). A rule's parameter is typed with the parts it needs, so calling it on a state that lacks one
// is a compile error. The seats of a Member are `placeOf(row)`, never `zone` read on its own.

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never

export type StatePart = 'sessions' | 'members' | 'teams' | 'rounds' | 'vetoes' | 'bonus' | 'pool' | 'toss'

/** A Member of the Event with their profile, in the order they joined. */
export interface MemberRow { id: string, name: string, displayName: string | null, image: string | null, zone: Zone, team: number | null, teamWord: string | null, teamJoinedAt: Date | null }
export type GameRow = typeof games.$inferSelect
type PlaceRow = typeof roundPlaces.$inferSelect
/** A Round with a Result (#274): its game and its Places by place, then team. */
export interface ResultEntry { round: RoundRow, game: GameRow | null, places: { team: number, place: number, score: string | null }[] }

interface PartFacts {
  sessions: { sessions: SessionRow[] }
  members: { members: MemberRow[] }
  /** The stored Team names (#164), read only in an Event finished before 0.12 (#438; the previous deployment may still write rows). A null name is the Team colour's name. */
  teams: { teams: { position: number, frozenName: string | null }[] }
  rounds: {
    /** Every Round in start order with its game (null while it is being drawn), the put-back ones too (#228). */
    rounds: { round: RoundRow, game: GameRow | null }[]
    /** Every draw of the Event's Rounds, read in the same statement as the Rounds: a draw is never seen without its Round (#274, Spec N6). */
    draws: DrawRow[]
    /** The Rounds with a Result and their Places, by Round number (#274, #288). */
    results: ResultEntry[]
    /** The Standings and the end, composed once here from the Results; null for an Event that is not set up. */
    standing: ReturnType<typeof standingsAndEnd> | null
  }
  /** Every Veto cast in the Event, on settled and open draws alike, put-back Rounds included: spent stays spent. */
  vetoes: { vetoes: VetoRow[] }
  /** The team of every Bonus Veto the Host granted, one entry per Bonus Veto. */
  bonus: { bonusTeams: number[] }
  /** The ids of the games in the Game pool, in the order of their names. */
  pool: { pool: string[] }
  /** The toss the Event read shows: the latest one made in the Running Session, null without one. */
  toss: { toss: CoinRow | null }
}

/** What every state holds, whatever parts it has read: the locked or loaded Event row, its settings (null when not set up) and the request's clock. */
export interface BaseState { eventRow: EventRow, settings: EventSettings | null, now: Date }
export type EventState<P extends StatePart = never> = BaseState & UnionToIntersection<PartFacts[P]>

/** The row shapes the statements return, by part. `rounds` is the joined statement: one row per Round, draw and Place. */
interface PartRows {
  sessions: SessionRow[]
  members: MemberRow[]
  teams: PartFacts['teams']['teams']
  rounds: { round: RoundRow, game: GameRow | null, draw: DrawRow | null, place: PlaceRow | null }[]
  vetoes: VetoRow[]
  bonus: number[]
  pool: string[]
  toss: CoinRow | null
}
export type StateRows<P extends StatePart> = { [K in P]: PartRows[K] }

/** The key a part leaves in the state, to tell which parts a state has. */
const PART_KEY = { sessions: 'sessions', members: 'members', teams: 'teams', rounds: 'rounds', vetoes: 'vetoes', bonus: 'bonusTeams', pool: 'pool', toss: 'toss' } as const satisfies Record<StatePart, string>

/** Whether the state has read these parts (a type guard: the state keeps what it had and gains what they hold). */
export function hasParts<S extends BaseState, P extends StatePart>(state: S, parts: readonly P[]): state is S & EventState<P> {
  return parts.every(part => PART_KEY[part] in state)
}

function foldRounds(settings: EventSettings | null, rows: PartRows['rounds']): PartFacts['rounds'] {
  const roundList = new Map<string, PartFacts['rounds']['rounds'][number]>()
  const drawList = new Map<string, DrawRow>()
  // The Places of each Round by team: the primary key is (round, team), so a team's Place is one row however often the join repeats it.
  const placeList = new Map<string, Map<number, ResultEntry['places'][number]>>()
  for (const row of rows) {
    if (!roundList.has(row.round.id)) roundList.set(row.round.id, { round: row.round, game: row.game })
    if (row.draw) drawList.set(row.draw.id, row.draw)
    if (row.place) {
      const places = placeList.get(row.round.id) ?? new Map()
      placeList.set(row.round.id, places)
      places.set(row.place.team, { team: row.place.team, place: row.place.place, score: row.place.score })
    }
  }
  // A Round with a Result has its Places in the same transaction (the Result is written under the lock), so resultAt is the one test.
  const results = [...roundList.values()]
    .filter(entry => entry.round.resultAt !== null)
    .sort((a, b) => (a.round.number ?? 0) - (b.round.number ?? 0))
    .map(entry => ({
      round: entry.round,
      game: entry.game,
      places: [...(placeList.get(entry.round.id)?.values() ?? [])].sort((a, b) => a.place - b.place || a.team - b.team),
    }))
  return {
    rounds: [...roundList.values()],
    draws: [...drawList.values()],
    results,
    standing: settings === null ? null : standingsAndEnd(results.map(entry => entry.places), settings),
  }
}

type AllFacts = UnionToIntersection<PartFacts[StatePart]>

/** The facts of the parts these rows carry. A part that is not in `rows` leaves no key. */
function factsOf(settings: EventSettings | null, rows: Partial<PartRows>): Partial<AllFacts> {
  const facts: Partial<AllFacts> = {}
  if (rows.sessions) facts.sessions = rows.sessions
  if (rows.members) facts.members = rows.members
  if (rows.teams) facts.teams = rows.teams
  if (rows.rounds) Object.assign(facts, foldRounds(settings, rows.rounds))
  if (rows.vetoes) facts.vetoes = rows.vetoes
  if (rows.bonus) facts.bonusTeams = rows.bonus
  if (rows.pool) facts.pool = rows.pool
  if (rows.toss !== undefined) facts.toss = rows.toss
  return facts
}

/**
 * The state from rows already read, pure: what the reader assembles with, and what a test feeds with in-memory rows. `rows` has one entry per
 * part the state carries; the joined Rounds rows are folded here, each Round once, each draw once, each Place once.
 */
export function eventStateOf<P extends StatePart>(eventRow: EventRow, now: Date, rows: StateRows<P>): EventState<P> {
  const settings = settingsFromRow(eventRow)
  // The one cast of the module: the public signatures carry the parts, and `factsOf` builds exactly the keys of the rows it was given.
  return { eventRow, settings, now, ...factsOf(settings, rows) } as unknown as EventState<P>
}

/**
 * Reads the parts, each one statement, at the same time. The Coin flip is read after the Sessions, since it belongs to the Running Session,
 * so asking for it without them throws (`known`: Sessions the caller has already read).
 */
async function readRows<P extends StatePart>(db: Db, eventRow: EventRow, parts: readonly P[], known: SessionRow[] | undefined): Promise<Partial<PartRows>> {
  const wanted = new Set<StatePart>(parts)
  if (wanted.has('toss') && !wanted.has('sessions') && known === undefined) throw new Error('The Coin flip is read after the Sessions: ask for `sessions` with `toss`')
  // A drizzle query runs each time it is awaited: Promise.resolve runs it once, now, and the Coin flip waits for those results.
  const run = <T>(query: PromiseLike<T>): Promise<T> => Promise.resolve(query)
  const reads: { [K in StatePart]?: Promise<PartRows[K]> } = {}
  if (wanted.has('sessions')) reads.sessions = run(eventSessions(db, eventRow.id))
  if (wanted.has('members')) reads.members = run(readMembers(db, eventRow.id))
  if (wanted.has('teams')) reads.teams = run(db.select({ position: eventTeams.position, frozenName: eventTeams.frozenName }).from(eventTeams).where(eq(eventTeams.eventId, eventRow.id)))
  if (wanted.has('rounds')) reads.rounds = run(readRounds(db, eventRow.id))
  if (wanted.has('vetoes')) reads.vetoes = run(readVetoes(db, eventRow.id))
  if (wanted.has('bonus')) reads.bonus = run(readBonusTeams(db, eventRow.id))
  if (wanted.has('pool')) reads.pool = run(readPool(db, eventRow.id))
  if (wanted.has('toss')) reads.toss = (reads.sessions ?? Promise.resolve(known!)).then(sessions => readToss(db, sessions))
  const found: Partial<PartRows> = {}
  await Promise.all([
    reads.sessions?.then((rows) => { found.sessions = rows }),
    reads.members?.then((rows) => { found.members = rows }),
    reads.teams?.then((rows) => { found.teams = rows }),
    reads.rounds?.then((rows) => { found.rounds = rows }),
    reads.vetoes?.then((rows) => { found.vetoes = rows }),
    reads.bonus?.then((rows) => { found.bonus = rows }),
    reads.pool?.then((rows) => { found.pool = rows }),
    reads.toss?.then((row) => { found.toss = row }),
  ])
  return found
}

/**
 * The state of an Event with these parts, read in the caller's transaction or on the pool. A write route calls it inside its `changeEvent`
 * callback, so the lock is held and due draws are settled; the Event read calls it without a lock, and the Rounds statement is its one snapshot.
 */
export async function readEventState<P extends StatePart>(db: Db, eventRow: EventRow, now: Date, parts: readonly P[]): Promise<EventState<P>> {
  const rows = await readRows(db, eventRow, parts, undefined)
  // `readRows` returned the parts asked for.
  return eventStateOf(eventRow, now, rows as StateRows<P>)
}

/** The state with more parts read: only those it does not have yet, so no part is read twice. A route reads the heavy parts lazily, after its early refusals. */
export async function withParts<S extends BaseState, P extends StatePart>(db: Db, state: S, parts: readonly P[]): Promise<S & EventState<P>> {
  const missing = parts.filter(part => !(PART_KEY[part] in state))
  const rows = await readRows(db, state.eventRow, missing, hasParts(state, ['sessions']) ? state.sessions : undefined)
  return { ...state, ...factsOf(state.settings, rows) } as unknown as S & EventState<P>
}

/** The Members of the Event with their profile, in the order they joined. */
function readMembers(db: Db, eventId: string): Promise<MemberRow[]> {
  return db
    .select({ id: users.id, name: users.name, displayName: users.displayName, image: users.image, zone: eventMembers.zone, team: eventMembers.team, teamWord: eventMembers.teamWord, teamJoinedAt: eventMembers.teamJoinedAt })
    .from(eventMembers)
    .innerJoin(users, eq(eventMembers.userId, users.id))
    .where(eq(eventMembers.eventId, eventId))
    .orderBy(asc(eventMembers.joinedAt))
}

/**
 * One statement for the Rounds, their games, their draws and their Places (Spec N6, #274, Spec N2 #288): a spin or a Result that commits
 * between two statements would give a draw whose Round the response lacks, or a Round open with its Result. Folded in `eventStateOf`:
 * each Round once, in start order, every draw once, and every Place once.
 */
function readRounds(db: Db, eventId: string): Promise<PartRows['rounds']> {
  return db
    .select({ round: rounds, game: games, draw: draws, place: roundPlaces })
    .from(rounds)
    .leftJoin(games, eq(rounds.gameId, games.id))
    .leftJoin(draws, eq(draws.roundId, rounds.id))
    .leftJoin(roundPlaces, eq(roundPlaces.roundId, rounds.id))
    .where(eq(rounds.eventId, eventId))
    .orderBy(asc(rounds.startedAt), asc(rounds.id))
}

/** `drawVetoEndsAt` is the end of the draw's window, which the Draw timeline (windowEnded, vetoesSealed) asks whether it has passed. */
function readVetoes(db: Db, eventId: string): Promise<VetoRow[]> {
  return db
    .select({ drawId: vetoes.drawId, team: vetoes.team, userId: vetoes.userId, castAt: vetoes.castAt, drawVetoEndsAt: draws.vetoEndsAt })
    .from(vetoes)
    .innerJoin(draws, eq(vetoes.drawId, draws.id))
    .innerJoin(rounds, eq(draws.roundId, rounds.id))
    .where(eq(rounds.eventId, eventId))
}

async function readBonusTeams(db: Db, eventId: string): Promise<number[]> {
  const found = await db.select({ team: bonusVetoes.team }).from(bonusVetoes).where(eq(bonusVetoes.eventId, eventId))
  return found.map(row => row.team)
}

/** The ids of the games in the Game pool, in the order of their names (the order the pools show them in). */
async function readPool(db: Db, eventId: string): Promise<string[]> {
  const found = await db
    .select({ id: games.id })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(eq(eventPoolGames.eventId, eventId))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  return found.map(row => row.id)
}

/**
 * The toss the Event read shows and the coin rule asks (#235): the latest toss made in the Running Session (`session_id`, #259; no time
 * comparison), else none. Nothing is shown without a Running Session, so the Session end clears it, and a toss without a Session (one the
 * 0.7 code wrote during the switch-over) belongs to none.
 */
async function readToss(db: Db, sessions: readonly SessionRow[]): Promise<CoinRow | null> {
  const running = runningOf(sessions)
  if (!running) return null
  const [row] = await db.select().from(coinTosses).where(eq(coinTosses.sessionId, running.id)).orderBy(desc(coinTosses.startedAt)).limit(1)
  return row ?? null
}

// The seats.

/** The place a Member stands in, or null for a User who is no Member of the Event. */
export function seatOf(state: EventState<'members'>, userId: string): Place | null {
  const row = state.members.find(member => member.id === userId)
  return row ? placeOf(row) : null
}

/** The Party a User plays in: the team of a Member on a team seat; null on the Bench, in the Stands and for a User who is no Member. */
export function partyOf(state: EventState<'members'>, userId: string): number | null {
  const place = seatOf(state, userId)
  return place?.zone === 'team' ? place.team : null
}

function seatsOf(state: EventState<'members'>) {
  return countSeats(state.members.map(placeOf))
}

/** The Rounds of the state without their games: what the Round rules take. */
export function roundRowsOf(state: EventState<'rounds'>): RoundRow[] {
  return state.rounds.map(({ round }) => round)
}

// The rules and their reasons. Each runs a rule of `shared/` on the state's facts, in the rule's own order.

/** Whether Team choice is open for the Event and whether its first Session has started (#164: any Session with `started_at`, also one that has ended). The move and the Event read both ask here. */
export function teamChoiceOf(state: EventState<'sessions'>) {
  const { settings, sessions } = state
  const started = hasStarted(sessions)
  return { settings, started, open: teamChoiceOpen({ settings, hasDatedSession: sessions.some(row => row.startsAt !== null), started }) }
}

/**
 * The start rule for the Event (#164): the Session that would start next (the earliest dated one that has not started), with the number it
 * is shown with, and why it cannot start now, null when it can. Parts: sessions, members.
 */
export function startOf(state: EventState<'sessions' | 'members'>): { next: (SessionRow & { number: number | null }) | null, rejection: StartRejection | null } {
  return {
    next: nextSession(numberedSessions([...state.sessions])),
    rejection: startRejection({ settings: state.settings, sessions: state.sessions, seats: seatsOf(state) }),
  }
}

/** Why a User cannot move `userId` to `to` now (shared/board.ts moveRejection), or `member_not_found` for a User the Event does not have. Parts: sessions, members. */
export function moveReason(state: EventState<'sessions' | 'members'>, { actorId, userId, to }: { actorId: string, userId: string, to: Place }): MoveRejection | 'member_not_found' | null {
  const from = seatOf(state, userId)
  if (!from) return 'member_not_found'
  const { settings, started, open } = teamChoiceOf(state)
  return moveRejection({ actorId, actorIsHost: state.eventRow.hostId === actorId, userId, from, to, settings, teamChoiceOpen: open, started, seats: seatsOf(state) })
}

/** Why the Host cannot set the next game now, or null (shared/rounds.ts setRejection). Parts: sessions, members, rounds. */
export function setReason(state: EventState<'sessions' | 'members' | 'rounds'>, isHost: boolean): SetRejection | null {
  return setRejection({ isHost, settings: state.settings, sessions: state.sessions, seats: seatsOf(state), rounds: roundRowsOf(state), draws: state.draws })
}

/** The games left on the wheel: the pool minus every game taken in this Event. Parts: rounds, pool. */
export function gamesLeftOf(state: EventState<'rounds' | 'pool'>): string[] {
  return gamesLeft(state.pool, state.draws, roundRowsOf(state))
}

/** Why the Host cannot spin the wheel now, or null (shared/rounds.ts spinRejection): the reasons of setting a game, then the wheel and the games left. Parts: sessions, members, rounds, pool. */
export function spinReason(state: EventState<'sessions' | 'members' | 'rounds' | 'pool'>, isHost: boolean): SpinRejection | null {
  return spinRejection({ isHost, settings: state.settings, sessions: state.sessions, seats: seatsOf(state), rounds: roundRowsOf(state), draws: state.draws, left: gamesLeftOf(state) })
}

/**
 * Each Party's Vetoes left (index 0 = team 1) counting these casts: the allowance and the Bonus Vetoes of the Event, less the casts given.
 * The Event read passes the casts a viewer may know (knownVetoRows), so no number gives a sealed Veto away; a writer asks `vetoesLeftOf`.
 * An Event that is not set up has no Parties. Parts: bonus.
 */
export function vetoesLeftCounting(state: EventState<'bonus'>, casts: readonly Pick<VetoRow, 'team'>[]): number[] {
  const { settings } = state
  return vetoesLeftByParty({ allowance: settings?.vetoAllowance ?? null, teamCount: settings?.teamCount ?? 0, bonusTeams: state.bonusTeams, castTeams: casts.map(cast => cast.team) })
}

/** Each Party's Vetoes left from ALL casts, sealed ones too: the writer's truth. It is for writers; a read section never calls it (CODING_STANDARDS § Secrecy). Parts: vetoes, bonus. */
export function vetoesLeftOf(state: EventState<'vetoes' | 'bonus'>): number[] {
  return vetoesLeftCounting(state, state.vetoes)
}

/**
 * Why `userId` cannot cast a Veto on `draw` now, or null (shared/rounds.ts vetoRejection); `draw` null is a draw the Event does not have.
 * It depends on the User's own Party only (its cast on this draw, its Vetoes left), which the seal never changes: the Event read asks it too.
 * Parts: sessions, members, vetoes, bonus.
 */
export function vetoReason(state: EventState<'sessions' | 'members' | 'vetoes' | 'bonus'>, userId: string, draw: Pick<DrawRow, 'id' | 'stopAt' | 'vetoEndsAt' | 'outcome'> | null): VetoRejection | null {
  const viewerTeam = partyOf(state, userId)
  return vetoRejection({
    viewerTeam,
    draw: draw && { stopAt: draw.stopAt, vetoEndsAt: draw.vetoEndsAt, outcome: draw.outcome },
    now: state.now,
    running: runningOf(state.sessions) !== undefined,
    castTeams: draw ? state.vetoes.filter(row => row.drawId === draw.id).map(row => row.team) : [],
    left: vetoesLeftOf(state)[(viewerTeam ?? 1) - 1] ?? 0,
  })
}

/** How many Bonus Vetoes each Party has (index 0 = team 1). Parts: bonus. */
export function bonusCountsOf(state: EventState<'bonus'>): number[] {
  return bonusVetoCounts(state.bonusTeams, state.settings?.teamCount ?? 0)
}

/** Why the Host cannot grant a Bonus Veto now, or null (shared/rounds.ts bonusVetoRejection); `team` null asks the Event-level reasons only. Parts: bonus. */
export function bonusVetoReason(state: EventState<'bonus'>, isHost: boolean, team: number | null): BonusVetoRejection | null {
  return bonusVetoRejection({ isHost, settings: state.settings, phase: state.eventRow.phase, team, granted: bonusCountsOf(state) })
}

/**
 * Why the Host cannot finish the Event with this outcome and these winners now, or null (shared/finish.ts finishRejection). An Event that is not
 * set up has no Standings and cannot be running, so it is `wrong_phase` after the Host's own check (#288). Parts: rounds.
 */
export function finishReason(state: EventState<'rounds'>, isHost: boolean, request: FinishRequest): FinishRejection | null {
  const { standing } = state
  if (standing === null) return isHost ? 'wrong_phase' : 'not_host'
  return finishRejection({ isHost, phase: state.eventRow.phase, end: standing.end, standings: standing.standings, ...request })
}

/** Why the Host cannot add the last game now, or null (shared/finish.ts lastGameRejection); `wrong_phase` for an Event that is not set up, as `finishReason`. Parts: rounds. */
export function lastGameReason(state: EventState<'rounds'>, isHost: boolean): LastGameRejection | null {
  const { standing, settings } = state
  if (standing === null || settings === null) return isHost ? 'wrong_phase' : 'not_host'
  return lastGameRejection({ isHost, phase: state.eventRow.phase, end: standing.end, gameCount: settings.gameCount })
}

/** Why the Host cannot toss the coin now, or null (shared/coin.ts coinRejection). Parts: sessions, toss. */
export function coinReason(state: EventState<'sessions' | 'toss'>, isHost: boolean): ReturnType<typeof coinRejection> {
  return coinRejection({ isHost, sessions: state.sessions, latest: state.toss, now: state.now })
}

/**
 * What the floors of the Event's settings are read from (#147, #163, #197, #228, #231): the Players seated in each team, the Rounds started and the
 * most Vetoes any Party has cast. The floors themselves are `floorsAt` (shared/settings.ts), measured at the team count the caller has parsed. The
 * Team size floor is the fullest team that remains (no Team size may push a Player out of their team), the Game count floor is the Rounds started, the
 * Veto allowance floor is the most Vetoes one Party has cast, counted from the casts on draws whose window has ended (windowEnded at `now`): a floor
 * that moved for a cast in a window still running would give a sealed Veto away to the Host (#231). Parts: members, rounds, vetoes.
 */
export function floorsOf(state: EventState<'members' | 'rounds' | 'vetoes'>): FloorFacts {
  const seats = seatsOf(state)
  const highest = Math.max(0, ...Object.keys(seats).map(Number))
  const castPerTeam = new Map<number, number>()
  for (const { team, drawVetoEndsAt } of state.vetoes) if (windowEnded({ vetoEndsAt: drawVetoEndsAt }, state.now)) castPerTeam.set(team, (castPerTeam.get(team) ?? 0) + 1)
  return {
    playersPerTeam: playersPerTeam(seats, highest),
    roundsStarted: roundsStarted(roundRowsOf(state)),
    vetoesSpent: Math.max(0, ...castPerTeam.values()),
  }
}

/** Whether a game is being drawn in the Event: a Round's draw is open, the wheel spins or its Veto window runs (isBeingDrawn). Parts: rounds. */
export function roundBeingDrawnOf(state: EventState<'rounds'>): boolean {
  return roundRowsOf(state).some(round => isBeingDrawn(round, state.draws))
}

/**
 * The Team names (#161, #438) of the teams the settings call for: composed from the words of the team's Players in the order they joined it, null for
 * no words (the colour's name). The one composition of a Team name. A stored name (event_teams, read only in an Event finished before 0.12; the
 * previous deployment may still write rows) counts only in a finished Event and only for a team that has a row: null there is the colour's name
 * even when words exist. Parts: members, teams.
 */
export function teamNamesOf(state: EventState<'members' | 'teams'>): { position: number, name: string | null }[] {
  const stored = !beforeFinish(state.eventRow.phase)
  return Array.from({ length: state.settings?.teamCount ?? 0 }, (_, index) => {
    const position = index + 1
    const row = stored ? state.teams.find(team => team.position === position) : undefined
    return { position, name: composeTeamName(state.members, position, row?.frozenName) }
  })
}
