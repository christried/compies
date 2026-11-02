import { and, asc, eq, sql } from 'drizzle-orm'
import { draws, eventMembers, eventPoolGames, events, games, rounds, vetoes } from '../db/schema'
import { WHEEL_PLACEHOLDERS, drawSpin } from '../domain/wheel'
import { countSeats, type Place } from '../../shared/board'
import { isoInstant } from '../../shared/activity'
import type { RoundSpun, VetoCast } from '../../shared/event'
import { SPIN_DURATION_MS, SPIN_LEAD_MS, VETO_WINDOW_MS, gameTaken, gamesLeft, isBeingDrawn, opensWindow, roundState, setRejection, spinRejection, vetoRejection, waitsForRespin, type SetRejection, type SpinRejection } from '../../shared/rounds'
import { runningOf } from '../../shared/session-state'
import { hasWheel, settingsFromRow } from '../../shared/settings'
import { recordActivity } from './activity'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange, EventRow } from './event-access'
import { readSeats } from './board'
import { eventSessions, type SessionRow } from './sessions'
import { dueDraws, settleDue } from './settle'
import { partyVetoesLeft, readBonusTeams, readVetoes } from './vetoes'

// The Event's Rounds (GLOSSARY: Round, #228): the reads the rules and the Event read share, and the changes the Host
// makes, setting the next game, spinning the wheel and putting a Round back. The rules are `shared/rounds.ts`; every instant
// written here comes from the request's clock (ADR 0013, amended 2026-10-31), never the database's `now()`.

export type RoundRow = typeof rounds.$inferSelect
export type DrawRow = typeof draws.$inferSelect

/** The Event's Rounds in start order, the put-back ones too (the rules decide what they count for). */
export function readRounds(db: Db, eventId: string): Promise<RoundRow[]> {
  return db.select().from(rounds).where(eq(rounds.eventId, eventId)).orderBy(asc(rounds.startedAt), asc(rounds.id))
}

/** Every draw of the Event's Rounds. */
export async function readDraws(db: Db, eventId: string): Promise<DrawRow[]> {
  const found = await db.select({ draw: draws }).from(draws).innerJoin(rounds, eq(draws.roundId, rounds.id)).where(eq(rounds.eventId, eventId))
  return found.map(row => row.draw)
}

/** Whether a game is being drawn in the Event: a Round's draw is open, the wheel spins or its Veto window runs (isBeingDrawn). */
export async function roundBeingDrawn(db: Db, eventId: string): Promise<boolean> {
  const [roundRows, drawRows] = await Promise.all([readRounds(db, eventId), readDraws(db, eventId)])
  return roundRows.some(round => isBeingDrawn(round, drawRows))
}

/** The ids of the games in the Game pool, in the order of their names (the order the pools show them in). */
export async function readGamePool(db: Db, eventId: string): Promise<string[]> {
  const found = await db
    .select({ id: games.id })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(and(eq(eventPoolGames.eventId, eventId), eq(eventPoolGames.pool, 'main')))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  return found.map(row => row.id)
}

/** Why the Host cannot set the next game now, or null (shared/rounds.ts setRejection), from the rows the callers have read. */
export function setRejectionOf(eventRow: EventRow, sessions: readonly SessionRow[], places: readonly Place[], roundRows: readonly RoundRow[], drawRows: readonly DrawRow[], isHost: boolean): SetRejection | null {
  return setRejection({ isHost, settings: settingsFromRow(eventRow), sessions, seats: countSeats(places), rounds: roundRows, draws: drawRows })
}

/** Why the Host cannot spin the wheel now, or null (shared/rounds.ts spinRejection): the same rows, and the games left on the wheel. */
export function spinRejectionOf(eventRow: EventRow, sessions: readonly SessionRow[], places: readonly Place[], roundRows: readonly RoundRow[], drawRows: readonly DrawRow[], left: readonly string[], isHost: boolean): SpinRejection | null {
  return spinRejection({ isHost, settings: settingsFromRow(eventRow), sessions, seats: countSeats(places), rounds: roundRows, draws: drawRows, left })
}

/**
 * The Event read's share (#229): when a draw is due, settle it in a locked transaction before reading. The check is one cheap
 * select, so a read with nothing due stays lock-free; the settle re-checks under the lock, so two readers settle it once.
 */
export async function settleBeforeRead(db: Db, eventRow: Pick<EventRow, 'id'>, now: Date): Promise<void> {
  if ((await dueDraws(db, eventRow.id, now).limit(1)).length === 0) return
  await db.transaction(async (tx) => {
    await tx.select({ id: events.id }).from(events).where(eq(events.id, eventRow.id)).for('update')
    await settleDue(tx, eventRow, now)
  })
}

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish' | 'now'>

/** What the rules of a round change read in its transaction, all at the same time. */
async function readRoundFacts(tx: Db, eventRow: EventRow) {
  const [sessions, seats, roundRows, drawRows, pool] = await Promise.all([
    eventSessions(tx, eventRow.id),
    readSeats(tx, eventRow.id),
    readRounds(tx, eventRow.id),
    readDraws(tx, eventRow.id),
    readGamePool(tx, eventRow.id),
  ])
  return { sessions, places: seats.map(seat => seat.place), roundRows, drawRows, pool }
}

/**
 * The Round a new draw belongs to (#231, #259): the one that waits for a respin (all its draws vetoed) takes the draw itself, else a new Round
 * starts at `now`. `patch` is what the Round takes at once (the set game); `{}` when the draw settles later.
 */
async function roundForDraw(tx: Db, eventId: string, roundRows: readonly RoundRow[], drawRows: readonly DrawRow[], now: Date, patch: { gameId?: string, setAt?: Date }): Promise<string> {
  const waiting = roundRows.find(round => waitsForRespin(round, drawRows))
  if (waiting) {
    if (Object.keys(patch).length > 0) await tx.update(rounds).set(patch).where(eq(rounds.id, waiting.id))
    return waiting.id
  }
  const [round] = await tx.insert(rounds).values({ eventId, startedAt: now, ...patch }).returning({ id: rounds.id })
  return round!.id
}

/** Stores one draw of a Round, committed at `now`; answers its id. */
async function insertDraw(tx: Db, roundId: string, now: Date, fields: Omit<typeof draws.$inferInsert, 'roundId' | 'committedAt'>): Promise<string> {
  const [draw] = await tx.insert(draws).values({ ...fields, roundId, committedAt: now }).returning({ id: draws.id })
  return draw!.id
}

/**
 * The Host sets the next game (#228): a Round with one `set` draw. A game that is in the Game pool and still left comes from the
 * pool and leaves it; any other library game comes from the library and never joins a pool. The Round is set at once, unless the
 * Host allowed a Veto (#232, „Veto erlauben“) and some Party has one left (opensWindow): then the draw carries a Veto window from
 * now, the Round gets no game until it settles (settleDue), and everyone sees the game from now on. A Veto allowed in a Selection
 * mode without a wheel is `no_wheel`. A Round that waits for a respin takes the game itself (#231). Refused with the reason of
 * setRejection, `no_wheel`, or `unknown_game`.
 */
export async function setNextGame({ tx, eventRow, user, publish, now }: Change, gameId: string, vetoAllowed: boolean): Promise<{ roundId: string }> {
  const { sessions, places, roundRows, drawRows, pool } = await readRoundFacts(tx, eventRow)
  const rejection = setRejectionOf(eventRow, sessions, places, roundRows, drawRows, eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)
  // The rules above refused an Event without settings. Host pick has no Vetoes (spec #218 § Vetoes).
  if (vetoAllowed && !hasWheel(settingsFromRow(eventRow)!.selectionMode)) throw apiError('no_wheel')
  const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, gameId))
  if (!game) throw apiError('unknown_game')
  // A retried „Setzen“ would open a second Round of the same game, and a vetoed game stays vetoed, library or pool (review 0.7, F14).
  if (gameTaken(game.id, drawRows, roundRows)) throw apiError('game_already_drawn')
  const windowOpens = vetoAllowed && opensWindow(partyVetoesLeft(eventRow, await readVetoes(tx, eventRow.id), await readBonusTeams(tx, eventRow.id)))

  const source = gamesLeft(pool, drawRows, roundRows).includes(game.id) ? 'pool' : 'library'
  // With a window the Round takes its game when the draw settles, so it stays without one (and without `setAt`) until then.
  const roundId = await roundForDraw(tx, eventRow.id, roundRows, drawRows, now, windowOpens ? {} : { gameId: game.id, setAt: now })
  const timing = windowOpens
    ? { stopAt: now, vetoEndsAt: new Date(now.getTime() + VETO_WINDOW_MS) }
    : { stopAt: now, outcome: 'set' as const, settledAt: now }
  await insertDraw(tx, roundId, now, { gameId: game.id, source, kind: 'set', ...timing })
  await recordActivity(tx, publish, eventRow.id, { type: 'game_set', actorId: user.id, params: { roundId, gameId: game.id }, now })
  publish({ type: 'round.set', roundId })
  return { roundId }
}

/**
 * The Host spins the Lucky Wheel (#229, spec #218 § Drawing): the server draws one of the games left, uniformly. The Round is
 * being drawn (no game yet) and its `spin` draw is stored with everything a reload replays. The spin starts a lead after the
 * commit, so every client has the message and starts together, and stops after its duration. When some Party has a Veto left
 * at the commit (opensWindow), the draw gets a Veto window that ends VETO_WINDOW_MS after the stop (#231), and settles at its
 * end; otherwise it settles at the stop (settleDue). A Round that waits for a respin takes the draw itself; otherwise a Round
 * starts. The feed's entry waits for the stop (`at`, not published). The message carries the slice count, the placeholders of
 * a Hidden wheel and the instants, never a game. Refused with the reason of spinRejection.
 */
export async function spinWheel({ tx, eventRow, user, publish, now }: Change, randomInt: (n: number) => number): Promise<RoundSpun> {
  const { sessions, places, roundRows, drawRows, pool } = await readRoundFacts(tx, eventRow)
  const left = gamesLeft(pool, drawRows, roundRows)
  const rejection = spinRejectionOf(eventRow, sessions, places, roundRows, drawRows, left, eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)
  // The rules above refused an Event without settings.
  const hidden = settingsFromRow(eventRow)!.hiddenWheel
  const vetoesLeft = partyVetoesLeft(eventRow, await readVetoes(tx, eventRow.id), await readBonusTeams(tx, eventRow.id))

  const spin = drawSpin(left, hidden ? WHEEL_PLACEHOLDERS : null, randomInt)
  const spinStartAt = new Date(now.getTime() + SPIN_LEAD_MS)
  const stopAt = new Date(spinStartAt.getTime() + SPIN_DURATION_MS)
  const gameId = spin.sliceGameIds[spin.resultIndex]!
  const vetoEndsAt = opensWindow(vetoesLeft) ? new Date(stopAt.getTime() + VETO_WINDOW_MS) : null
  const roundId = await roundForDraw(tx, eventRow.id, roundRows, drawRows, now, {})
  const drawId = await insertDraw(tx, roundId, now, {
    gameId,
    source: 'pool',
    kind: 'spin',
    spinStartAt,
    stopAt,
    vetoEndsAt,
    sliceGameIds: spin.sliceGameIds,
    sliceLabels: spin.sliceLabels,
    resultIndex: spin.resultIndex,
    resultOffset: spin.resultOffset,
  })
  await recordActivity(tx, publish, eventRow.id, { type: 'game_drawn', actorId: null, params: { roundId, drawId, gameId }, at: stopAt })
  publish({
    type: 'round.spun',
    roundId,
    drawId,
    spinStartAt: isoInstant(spinStartAt),
    stopAt: isoInstant(stopAt),
    slices: spin.sliceGameIds.length,
    resultIndex: spin.resultIndex,
    resultOffset: spin.resultOffset,
    labels: spin.sliceLabels,
  })
  return { roundId, drawId }
}

/**
 * A Player casts their Party's Veto on a draw (#231, spec #218 § Vetoes), in the caller's transaction on the locked Event, with
 * `broadcast: false`: the cast is sealed until the window ends, so nothing tells the room that it happened. Only the Users of
 * the casting Party get `veto.cast` (the named send), the Host among them only when they play in that Party. Anything due settles
 * first. Refused with the reason of vetoRejection; the table's primary key is the Party's one Veto per draw, and a clash that
 * got past the check (it cannot under the lock) answers `veto_already_cast` too.
 */
export async function castVeto({ tx, eventRow, user, publishTo, now }: Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publishTo' | 'now'>, drawId: string): Promise<VetoCast> {
  const [sessions, drawRows, vetoRows, bonusTeams, [member]] = await Promise.all([
    eventSessions(tx, eventRow.id),
    readDraws(tx, eventRow.id),
    readVetoes(tx, eventRow.id),
    readBonusTeams(tx, eventRow.id),
    tx.select({ zone: eventMembers.zone, team: eventMembers.team }).from(eventMembers).where(and(eq(eventMembers.eventId, eventRow.id), eq(eventMembers.userId, user.id))),
  ])
  const draw = drawRows.find(row => row.id === drawId) ?? null
  const viewerTeam = member?.zone === 'team' ? member.team : null
  const rejection = vetoRejection({
    viewerTeam,
    draw,
    now,
    running: runningOf(sessions) !== undefined,
    castTeams: vetoRows.filter(row => row.drawId === drawId).map(row => row.team),
    left: partyVetoesLeft(eventRow, vetoRows, bonusTeams)[(viewerTeam ?? 1) - 1] ?? 0,
  })
  if (rejection) throw apiError(rejection)

  const team = viewerTeam!
  const [cast] = await tx.insert(vetoes).values({ drawId, team, userId: user.id, castAt: now }).onConflictDoNothing().returning({ team: vetoes.team })
  if (!cast) throw apiError('veto_already_cast')
  const party = await tx.select({ userId: eventMembers.userId }).from(eventMembers).where(and(eq(eventMembers.eventId, eventRow.id), eq(eventMembers.zone, 'team'), eq(eventMembers.team, team)))
  publishTo(party.map(row => row.userId), { type: 'veto.cast', drawId, team })
  return { drawId, team }
}

/**
 * The Host puts an open Round back (#228): the Round is gone, its game returns to the Game pool if it came from there (a
 * library game returns nowhere), and Vetoes spent in it stay spent (the rows stay). Only a set Round that stands can be put
 * back: an unknown or put-back one is `round_not_found`, one being drawn `round_being_drawn`.
 */
export async function putBackRound({ tx, eventRow, user, publish, now }: Change, roundId: string | undefined): Promise<{ roundId: string }> {
  const round = (await readRounds(tx, eventRow.id)).find(row => row.id === roundId && row.putBackAt === null)
  if (!round) throw apiError('round_not_found')
  if (roundState(round) === 'drawn') throw apiError('round_being_drawn')

  await tx.update(rounds).set({ putBackAt: now }).where(eq(rounds.id, round.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'game_put_back', actorId: user.id, params: { roundId: round.id, gameId: round.gameId! }, now })
  publish({ type: 'round.putBack', roundId: round.id })
  return { roundId: round.id }
}
