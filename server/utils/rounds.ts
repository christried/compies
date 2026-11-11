import { eq } from 'drizzle-orm'
import { draws, events, games, rounds, vetoes } from '../db/schema'
import { WHEEL_PLACEHOLDERS, drawSpin } from '../domain/wheel'
import type { RoundSpun, VetoCast } from '../../shared/stage'
import { clipLengthOf, drawInstants, settleAt } from '../../shared/draw-timeline'
import { gameTaken, opensWindow, roundState, waitsForRespin } from '../../shared/rounds'
import { hasWheel } from '../../shared/settings'
import { recordActivity } from './activity'
import type { Db } from './db'
import { apiError } from './errors'
import type { ChangeCore, EventChange, EventRow } from './event-access'
import { dueDraws } from './draw-timeline'
import { gamesLeftOf, partyOf, readEventState, roundRowsOf, setReason, spinReason, vetoReason, vetoesLeftOf, withParts } from './event-state'
import { settleDue } from './settle'

// The Event's Rounds (GLOSSARY: Round, #228): the changes the Host makes, setting the next game, spinning the wheel and putting a Round
// back, and a Player's Veto. Their facts and reasons come from the Event state (event-state.ts, #416), read inside the change, in the parts each
// needs. The rules are `shared/rounds.ts`; every instant written here comes from the request's clock (ADR 0013, amended 2026-10-31), never the database's `now()`.

export type RoundRow = typeof rounds.$inferSelect
export type DrawRow = typeof draws.$inferSelect

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
 * setReason, `no_wheel`, or `unknown_game`.
 */
export async function setNextGame({ tx, eventRow, user, publish, now }: ChangeCore, gameId: string, vetoAllowed: boolean): Promise<{ roundId: string }> {
  const state = await readEventState(tx, eventRow, now, ['sessions', 'members', 'rounds', 'pool'])
  const rejection = setReason(state, eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)
  // The rules above refused an Event without settings. Host pick has no Vetoes (spec #218 § Vetoes).
  if (vetoAllowed && !hasWheel(state.settings!.selectionMode)) throw apiError('no_wheel')
  const [game] = await tx.select({ id: games.id, youtubeId: games.youtubeId, clipLength: games.clipLength }).from(games).where(eq(games.id, gameId))
  if (!game) throw apiError('unknown_game')
  const roundRows = roundRowsOf(state)
  // A retried „Setzen“ would open a second Round of the same game, and a vetoed game stays vetoed, library or pool (review 0.7, F14).
  if (gameTaken(game.id, state.draws, roundRows)) throw apiError('game_already_drawn')
  // The Vetoes are read only for a set that may open a window: the budget under the lock (#416) lets no route read more than it needs.
  const windowOpens = vetoAllowed && opensWindow(vetoesLeftOf(await withParts(tx, state, ['vetoes', 'bonus'])))

  const source = gamesLeftOf(state).includes(game.id) ? 'pool' : 'library'
  // With a window the Round takes its game when the draw settles, so it stays without one (and without `setAt`) until then.
  const roundId = await roundForDraw(tx, eventRow.id, roundRows, state.draws, now, windowOpens ? {} : { gameId: game.id, setAt: now })
  const instants = drawInstants({ kind: 'set', commitAt: now, windowOpens, clipLength: clipLengthOf(game), spinLengthMs: null })
  const timing = windowOpens
    ? { stopAt: instants.stopAt, vetoEndsAt: instants.vetoEndsAt }
    : { stopAt: instants.stopAt, outcome: 'set' as const, settledAt: settleAt(instants) }
  await insertDraw(tx, roundId, now, { gameId: game.id, source, kind: 'set', ...timing })
  await recordActivity(tx, publish, eventRow.id, { type: 'game_set', actorId: user.id, params: { roundId, gameId: game.id }, now })
  return { roundId }
}

/**
 * The Host spins the Lucky Wheel (#229, spec #218 § Drawing): the server draws one of the games left, uniformly. The Round is
 * being drawn (no game yet) and its `spin` draw is stored with everything a reload replays. Its instants come from the Draw
 * timeline (drawInstants): the spin starts a lead after the commit, so every client has the message and starts together, and
 * stops after its length, 6 to 10 s, drawn with the result (#520). When some Party has a Veto left
 * at the commit (opensWindow), the draw gets a Veto window that ends the drawn game's clip length plus 30 s after the stop (#231, #505), and settles at its
 * end; otherwise it settles at the stop (settleDue). A Round that waits for a respin takes the draw itself; otherwise a Round
 * starts. The feed's entry waits for the stop (`at`, not published). The room hears `event.changed` only; the clients refetch the
 * Event read, which shows the wheel per viewer (#258). Refused with the reason of spinReason.
 */
export async function spinWheel({ tx, eventRow, user, publish, now }: ChangeCore, randomInt: (n: number) => number): Promise<RoundSpun> {
  const state = await readEventState(tx, eventRow, now, ['sessions', 'members', 'rounds', 'pool'])
  const rejection = spinReason(state, eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)
  // The rules above refused an Event without settings. The Vetoes are read after them: a refused spin reads no more.
  const hidden = state.settings!.hiddenWheel
  const vetoesLeft = vetoesLeftOf(await withParts(tx, state, ['vetoes', 'bonus']))

  const left = gamesLeftOf(state)
  const spin = drawSpin(left, hidden ? WHEEL_PLACEHOLDERS : null, randomInt)
  const gameId = spin.sliceGameIds[spin.resultIndex]!
  // The window's end depends on the drawn game's clip (#505): read only when a window opens, the budget under the lock (#416) lets no route read more than it needs.
  const windowOpens = opensWindow(vetoesLeft)
  const [drawn] = windowOpens ? await tx.select({ youtubeId: games.youtubeId, clipLength: games.clipLength }).from(games).where(eq(games.id, gameId)) : []
  const instants = drawInstants({ kind: 'spin', commitAt: now, windowOpens, clipLength: drawn ? clipLengthOf(drawn) : null, spinLengthMs: spin.spinLengthMs })
  const roundId = await roundForDraw(tx, eventRow.id, roundRowsOf(state), state.draws, now, {})
  const drawId = await insertDraw(tx, roundId, now, {
    gameId,
    source: 'pool',
    kind: 'spin',
    ...instants,
    sliceGameIds: spin.sliceGameIds,
    sliceLabels: spin.sliceLabels,
    resultIndex: spin.resultIndex,
    resultOffset: spin.resultOffset,
  })
  await recordActivity(tx, publish, eventRow.id, { type: 'game_drawn', actorId: null, params: { roundId, drawId, gameId }, at: instants.stopAt })
  return { roundId, drawId }
}

/**
 * A Player casts their Party's Veto on a draw (#231, spec #218 § Vetoes), in the caller's transaction on the locked Event, with
 * `broadcast: false`: the cast is sealed until the window ends, so nothing tells the room that it happened. Only the Users of
 * the casting Party get `veto.cast` (the named send), the Host among them only when they play in that Party. Anything due settles
 * first. Refused with the reason of vetoReason (the Event state, #416); the table's primary key is the Party's one Veto per draw, and a clash that
 * got past the check (it cannot under the lock) answers `veto_already_cast` too.
 */
export async function castVeto({ tx, eventRow, user, publishTo, now }: Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publishTo' | 'now'>, drawId: string): Promise<VetoCast> {
  const state = await readEventState(tx, eventRow, now, ['sessions', 'members', 'rounds', 'vetoes', 'bonus'])
  const rejection = vetoReason(state, user.id, state.draws.find(row => row.id === drawId) ?? null)
  if (rejection) throw apiError(rejection)

  // No rejection: the User plays in a team.
  const team = partyOf(state, user.id)!
  const [cast] = await tx.insert(vetoes).values({ drawId, team, userId: user.id, castAt: now }).onConflictDoNothing().returning({ team: vetoes.team })
  if (!cast) throw apiError('veto_already_cast')
  // The Users of the casting Party come from the Members the state read: nobody changes seats under the lock.
  const party = state.members.filter(member => partyOf(state, member.id) === team)
  publishTo(party.map(member => member.id), { type: 'veto.cast', drawId, team })
  return { drawId, team }
}

/**
 * The Host puts an open Round back (#228): the Round is gone, its game returns to the Game pool if it came from there (a
 * library game returns nowhere), and Vetoes spent in it stay spent (the rows stay). Only a set Round that stands and has no Result
 * can be put back: an unknown or put-back one is `round_not_found`, one being drawn `round_being_drawn`, one with a Result `round_not_open` (#273).
 */
export async function putBackRound({ tx, eventRow, user, publish, now }: ChangeCore, roundId: string | undefined): Promise<{ roundId: string }> {
  const round = roundRowsOf(await readEventState(tx, eventRow, now, ['rounds'])).find(row => row.id === roundId && row.putBackAt === null)
  if (!round) throw apiError('round_not_found')
  if (roundState(round) === 'drawn') throw apiError('round_being_drawn')
  // A Round with a Result stands for good (#273): its Result is in the feed, and putting the Round back would take the Result away.
  if (round.resultAt !== null) throw apiError('round_not_open')

  await tx.update(rounds).set({ putBackAt: now }).where(eq(rounds.id, round.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'game_put_back', actorId: user.id, params: { roundId: round.id, gameId: round.gameId! }, now })
  return { roundId: round.id }
}
