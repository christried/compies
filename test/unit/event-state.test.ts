import { describe, expect, it } from 'vitest'
import type { games, roundPlaces } from '../../server/db/schema'
import { GAME_COUNT_MAX } from '../../shared/settings'
import type { CoinRow } from '../../server/utils/coin'
import {
  bonusCountsOf,
  bonusVetoReason,
  coinReason,
  eventStateOf,
  finishReason,
  floorsOf,
  gamesLeftOf,
  lastGameReason,
  moveReason,
  roundBeingDrawnOf,
  setReason,
  spinReason,
  startOf,
  teamChoiceOf,
  teamNamesOf,
  vetoReason,
  vetoesLeftOf,
  type MemberRow,
  type StatePart,
  type StateRows,
} from '../../server/utils/event-state'
import type { EventRow } from '../../server/utils/event-access'
import type { DrawRow, RoundRow } from '../../server/utils/rounds'
import type { SessionRow } from '../../server/utils/sessions'
import type { VetoRow } from '../../server/utils/vetoes'

// The Event state's interface (#416): each rule's reason from in-memory rows, in the rule's own order, and the folds of the joined Rounds statement.
// The parts are the rows one statement each returns; a rule is typed with the parts it needs, so these states carry what each case asks for.

const NOW = new Date('2090-11-07T20:00:00.000Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

const wheelColumns = {
  format: 'teams',
  teamCount: 2,
  teamSize: 2,
  gameCount: 3,
  pointsTable: { preset: 'linear', values: [1, 0] },
  selectionMode: 'lucky_wheel',
  hiddenWheel: false,
  poolPreview: true,
  vetoAllowance: 2,
} satisfies Partial<EventRow>
const noSettings = { format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, poolPreview: null, vetoAllowance: null } satisfies Partial<EventRow>

function eventRow(fields: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    slug: 'abend',
    inviteToken: 'token',
    hostId: 'host',
    name: 'Abend',
    phase: 'running',
    ...wheelColumns,
    finishedAt: null,
    ceremonyStartsAt: null,
    ceremonyGag: null,
    deletedAt: null,
    createdAt: at(-600),
    updatedAt: at(-600),
    ...fields,
  }
}

const running = (fields: Partial<SessionRow> = {}): SessionRow => ({ id: 's1', eventId: 'e1', startsAt: at(-60), previousStartsAt: null, slotId: null, icsSequence: 0, removedAt: null, startedAt: at(-30), endedAt: null, ...fields })
const waiting = (id: string, startsAt: Date | null): SessionRow => running({ id, startsAt, startedAt: null })
const member = (id: string, zone: MemberRow['zone'], team: number | null = null, fields: Partial<MemberRow> = {}): MemberRow => ({ id, name: id, displayName: null, image: null, zone, team, teamWord: null, teamJoinedAt: null, ...fields })
/** Two teams of two, one Member in the Stands. */
const seated = (): MemberRow[] => [member('host', 'stands'), member('a', 'team', 1), member('b', 'team', 1), member('c', 'team', 2), member('d', 'team', 2)]

const round = (id: string, fields: Partial<RoundRow> = {}): RoundRow => ({ id, eventId: 'e1', gameId: `g-${id}`, startedAt: at(-20), setAt: at(-20), putBackAt: null, number: null, resultAt: null, correctedAt: null, ...fields })
const drawn = (id: string, fields: Partial<RoundRow> = {}) => round(id, { gameId: null, setAt: null, ...fields })
const draw = (id: string, roundId: string, fields: Partial<DrawRow> = {}): DrawRow => ({
  id,
  roundId,
  gameId: `g-${roundId}`,
  source: 'pool',
  kind: 'set',
  committedAt: at(-20),
  spinStartAt: null,
  stopAt: at(-20),
  vetoEndsAt: null,
  clipSkippedAt: null,
  outcome: 'set',
  settledAt: at(-20),
  sliceGameIds: null,
  sliceLabels: null,
  resultIndex: null,
  resultOffset: null,
  ...fields,
})
type GameRow = typeof games.$inferSelect
type PlaceRow = typeof roundPlaces.$inferSelect
const game = (id: string) => ({ id, name: id }) as unknown as GameRow
const place = (roundId: string, team: number, rank: number, score: string | null = null): PlaceRow => ({ roundId, team, place: rank, score })
type JoinedRow = StateRows<'rounds'>['rounds'][number]
const joined = (row: RoundRow, fields: Partial<Omit<JoinedRow, 'round'>> = {}): JoinedRow => ({ round: row, game: row.gameId ? game(row.gameId) : null, draw: null, place: null, ...fields })

/** A Round with its draw and, when it has a Result, its Places (the joined statement repeats the Round for each draw and Place). */
function played(id: string, number: number, places: [number, number][]): JoinedRow[] {
  const row = round(id, { number, resultAt: at(-10) })
  return places.map(([team, rank]) => joined(row, { draw: draw(`d-${id}`, id), place: place(id, team, rank) }))
}

const vetoRow = (drawId: string, team: number, drawVetoEndsAt: Date | null = at(-5)): VetoRow => ({ drawId, team, userId: `u${team}`, castAt: at(-12), drawVetoEndsAt })
const toss = (landsAt: Date): CoinRow => ({ id: 't1', eventId: 'e1', sessionId: 's1', side: 'heads', tossedBy: 'host', startedAt: at(-1), landsAt })

/** All eight parts, a running Event of two seated teams and a pool of three games; each case overrides what it is about. */
function state(overrides: Partial<StateRows<StatePart>> = {}, row: EventRow = eventRow()) {
  const rows: StateRows<StatePart> = { sessions: [running()], members: seated(), teams: [], rounds: [], vetoes: [], bonus: [], pool: ['g1', 'g2', 'g3'], toss: null, ...overrides }
  return eventStateOf(row, NOW, rows)
}
const manyRounds = (count: number): JoinedRow[] => Array.from({ length: count }, (_, index) => joined(round(`r${index}`), { draw: draw(`d${index}`, `r${index}`) }))

describe('eventStateOf', () => {
  it('folds the joined rows into each Round once, each draw once and each Place once', () => {
    const first = round('r1', { number: 1, resultAt: at(-10) })
    const second = round('r2')
    const rows = [
      // Round 1 has two draws (a respin) and two Places: the join gives four rows.
      joined(first, { draw: draw('d1', 'r1', { outcome: 'vetoed' }), place: place('r1', 1, 1, '9') }),
      joined(first, { draw: draw('d1', 'r1', { outcome: 'vetoed' }), place: place('r1', 2, 2) }),
      joined(first, { draw: draw('d2', 'r1'), place: place('r1', 1, 1, '9') }),
      joined(first, { draw: draw('d2', 'r1'), place: place('r1', 2, 2) }),
      joined(second, { draw: draw('d3', 'r2') }),
    ]

    const folded = state({ rounds: rows })

    expect(folded.rounds.map(entry => entry.round.id)).toEqual(['r1', 'r2'])
    expect(folded.draws.map(entry => entry.id)).toEqual(['d1', 'd2', 'd3'])
    expect(folded.results).toHaveLength(1)
    expect(folded.results[0]!.places).toEqual([{ team: 1, place: 1, score: '9' }, { team: 2, place: 2, score: null }])
  })

  it('has no draw and no Result for a Round without either', () => {
    const folded = state({ rounds: [joined(drawn('r1'))] })

    expect(folded.rounds).toHaveLength(1)
    expect(folded.draws).toEqual([])
    expect(folded.results).toEqual([])
  })

  it('lists the Results by Round number, whatever the start order, with their Places by place then team', () => {
    const folded = state({ rounds: [...played('r1', 2, [[2, 1], [1, 1]]), ...played('r2', 1, [[2, 2], [1, 1]])] })

    expect(folded.results.map(entry => entry.round.number)).toEqual([1, 2])
    expect(folded.results[1]!.places.map(entry => entry.team)).toEqual([1, 2])
  })

  it('composes the Standings once, from the Rounds with a Result, and has none without settings', () => {
    const folded = state({ rounds: played('r1', 1, [[1, 1], [2, 2]]) })
    const unset = state({ rounds: played('r1', 1, [[1, 1], [2, 2]]) }, eventRow(noSettings))

    expect(folded.standing!.standings.find(row => row.team === 1)).toMatchObject({ points: 1, rank: 1 })
    expect(folded.standing!.end).toMatchObject({ played: 1, gameCount: 3, complete: false })
    expect(unset.standing).toBeNull()
    expect(unset.settings).toBeNull()
  })

  it('carries only the parts it was given', () => {
    const bare = eventStateOf(eventRow(), NOW, { sessions: [running()] })

    expect(Object.keys(bare).sort()).toEqual(['eventRow', 'now', 'sessions', 'settings'])
  })
})

describe('setReason', () => {
  it('asks the Host first', () => {
    expect(setReason(state({ sessions: [] }), false)).toBe('not_host')
  })

  it('needs a Running Session, then settings', () => {
    expect(setReason(state({ sessions: [] }), true)).toBe('no_running_session')
    expect(setReason(state({ sessions: [waiting('s2', at(60))] }), true)).toBe('no_running_session')
    expect(setReason(state({}, eventRow(noSettings)), true)).toBe('not_set_up')
  })

  it('wants every team to have a Player and the teams to be equally big', () => {
    expect(setReason(state({ members: [member('host', 'stands'), member('a', 'bench')] }), true)).toBe('teams_empty')
    expect(setReason(state({ members: [member('a', 'team', 1), member('b', 'team', 1), member('c', 'team', 2)] }), true)).toBe('teams_uneven')
  })

  it('refuses at the Game count, with 0, 1 and 2 Rounds started', () => {
    const settings = eventRow({ gameCount: 2 })

    expect(setReason(state({ rounds: [] }, settings), true)).toBeNull()
    expect(setReason(state({ rounds: manyRounds(1) }, settings), true)).toBeNull()
    expect(setReason(state({ rounds: manyRounds(2) }, settings), true)).toBe('game_count_reached')
  })

  it('does not count a put-back Round', () => {
    const putBack = joined(round('r0', { putBackAt: at(-5) }), { draw: draw('d0', 'r0') })

    expect(setReason(state({ rounds: [putBack, ...manyRounds(1)] }, eventRow({ gameCount: 2 })), true)).toBeNull()
  })

  it('lets a Round that waits for a respin take the draw, past the Game count', () => {
    const waitingRound = joined(drawn('r9'), { draw: draw('d9', 'r9', { outcome: 'vetoed' }) })

    expect(setReason(state({ rounds: [...manyRounds(2), waitingRound] }, eventRow({ gameCount: 3 })), true)).toBeNull()
  })

  it('refuses while a Round is being drawn: one open draw, also after a vetoed one', () => {
    const open = joined(drawn('r9'), { draw: draw('d9', 'r9', { outcome: null, settledAt: null }) })
    const respun = [joined(drawn('r8'), { draw: draw('d8', 'r8', { outcome: 'vetoed' }) }), joined(drawn('r8'), { draw: draw('d9', 'r8', { outcome: null, settledAt: null }) })]

    expect(setReason(state({ rounds: [open] }), true)).toBe('round_being_drawn')
    expect(setReason(state({ rounds: respun }), true)).toBe('round_being_drawn')
  })
})

describe('spinReason', () => {
  it('gives the reasons of setting first', () => {
    expect(spinReason(state({ sessions: [] }), false)).toBe('not_host')
    expect(spinReason(state({ sessions: [] }), true)).toBe('no_running_session')
    expect(spinReason(state({ rounds: [joined(drawn('r9'), { draw: draw('d9', 'r9', { outcome: null, settledAt: null }) })] }), true)).toBe('round_being_drawn')
  })

  it('refuses a Selection mode without a wheel, then an empty pool', () => {
    expect(spinReason(state({}, eventRow({ selectionMode: 'admin_pick', vetoAllowance: null })), true)).toBe('no_wheel')
    expect(spinReason(state({ pool: [] }), true)).toBe('pool_empty')
    expect(spinReason(state({ pool: ['g-r0'], rounds: manyRounds(1) }), true)).toBe('pool_empty')
    expect(spinReason(state(), true)).toBeNull()
  })
})

describe('gamesLeftOf', () => {
  it('is the pool minus every game taken, in the pool order', () => {
    expect(gamesLeftOf(state({ pool: ['g-r0', 'g2', 'g3'], rounds: manyRounds(1) }))).toEqual(['g2', 'g3'])
  })

  it('gives a game back when its Round is put back', () => {
    const putBack = joined(round('r0', { putBackAt: at(-5) }), { draw: draw('d0', 'r0') })

    expect(gamesLeftOf(state({ pool: ['g-r0', 'g2'], rounds: [putBack] }))).toEqual(['g-r0', 'g2'])
  })
})

describe('vetoesLeftOf and vetoReason', () => {
  const windowDraw = draw('dw', 'rw', { stopAt: at(-1), vetoEndsAt: at(10), outcome: null, settledAt: null })
  const withWindow = (extra: Partial<StateRows<StatePart>> = {}) => state({ rounds: [joined(drawn('rw'), { draw: windowDraw })], ...extra })

  it('counts the allowance and the Bonus Vetoes against every cast, a sealed one too', () => {
    const left = vetoesLeftOf(state({ bonus: [1, 1], vetoes: [vetoRow('dw', 1, at(10)), vetoRow('dx', 2, at(-5)), vetoRow('dy', 2, at(-5))] }))

    expect(left).toEqual([3, 0])
  })

  it('has no Parties for an Event that is not set up', () => {
    expect(vetoesLeftOf(state({}, eventRow(noSettings)))).toEqual([])
  })

  it('refuses a Host outside the teams and a Member on the Stands: not_a_player', () => {
    expect(vetoReason(withWindow(), 'host', windowDraw)).toBe('not_a_player')
    expect(vetoReason(withWindow({ members: [member('x', 'bench')] }), 'x', windowDraw)).toBe('not_a_player')
    expect(vetoReason(withWindow(), 'stranger', windowDraw)).toBe('not_a_player')
  })

  it('asks for a Running Session, then a draw with a window', () => {
    expect(vetoReason(withWindow({ sessions: [] }), 'a', windowDraw)).toBe('no_running_session')
    expect(vetoReason(withWindow(), 'a', null)).toBe('no_veto_window')
    expect(vetoReason(withWindow(), 'a', draw('dn', 'rw'))).toBe('no_veto_window')
  })

  it('refuses a window that has closed or a draw that settled', () => {
    const ended = draw('dw', 'rw', { stopAt: at(-10), vetoEndsAt: at(-5), outcome: null, settledAt: null })
    const settled = draw('dw', 'rw', { stopAt: at(-1), vetoEndsAt: at(10), outcome: 'set' })

    expect(vetoReason(withWindow(), 'a', ended)).toBe('veto_window_closed')
    expect(vetoReason(withWindow(), 'a', settled)).toBe('veto_window_closed')
  })

  it('refuses a second cast of the Party on the draw, and a Party with no Veto left', () => {
    expect(vetoReason(withWindow({ vetoes: [vetoRow('dw', 1, windowDraw.vetoEndsAt)] }), 'b', windowDraw)).toBe('veto_already_cast')
    expect(vetoReason(withWindow({ vetoes: [vetoRow('dx', 1), vetoRow('dy', 1)] }), 'a', windowDraw)).toBe('no_vetoes_left')
  })

  it('lets a Party with a Bonus Veto cast after its allowance is spent', () => {
    expect(vetoReason(withWindow({ bonus: [1], vetoes: [vetoRow('dx', 1), vetoRow('dy', 1)] }), 'a', windowDraw)).toBeNull()
    expect(vetoReason(withWindow(), 'c', windowDraw)).toBeNull()
  })
})

describe('bonusVetoReason and bonusCountsOf', () => {
  it('asks the Host, a set-up Event with a wheel, and a Phase before the finish', () => {
    expect(bonusVetoReason(state({ bonus: [] }), false, null)).toBe('not_host')
    expect(bonusVetoReason(state({ bonus: [] }, eventRow(noSettings)), true, null)).toBe('not_set_up')
    expect(bonusVetoReason(state({ bonus: [] }, eventRow({ selectionMode: 'admin_pick', vetoAllowance: null })), true, null)).toBe('no_wheel')
    expect(bonusVetoReason(state({ bonus: [] }, eventRow({ phase: 'finished' })), true, null)).toBe('wrong_phase')
    expect(bonusVetoReason(state({ bonus: [] }), true, null)).toBeNull()
  })

  it('checks the team and the limit of 9 per Party', () => {
    const full = state({ bonus: Array.from({ length: 9 }, () => 2) })

    expect(bonusVetoReason(full, true, 3)).toBe('invalid_value')
    expect(bonusVetoReason(full, true, 0)).toBe('invalid_value')
    expect(bonusVetoReason(full, true, 2)).toBe('bonus_veto_limit')
    expect(bonusVetoReason(full, true, 1)).toBeNull()
    expect(bonusCountsOf(full)).toEqual([0, 9])
  })
})

describe('finishReason and lastGameReason', () => {
  const finished = (count: number) => [...Array.from({ length: count }, (_, index) => played(`r${index}`, index + 1, [[1, 1], [2, 2]])).flat()]
  const tied = [...played('r1', 1, [[1, 1], [2, 2]]), ...played('r2', 2, [[1, 2], [2, 1]]), ...played('r3', 3, [[1, 1], [2, 1]])]

  it('asks the Host, then the Phase running', () => {
    expect(finishReason(state({ rounds: finished(3) }), false, { outcome: 'winner', winners: [1] })).toBe('not_host')
    expect(finishReason(state({ rounds: finished(3) }, eventRow({ phase: 'finished' })), true, { outcome: 'winner', winners: [1] })).toBe('wrong_phase')
    expect(lastGameReason(state({ rounds: finished(3) }), false)).toBe('not_host')
    expect(lastGameReason(state({ rounds: finished(3) }, eventRow({ phase: 'finished' })), true)).toBe('wrong_phase')
  })

  it('answers wrong_phase for an Event that is not set up, after the Host', () => {
    const unset = state({ rounds: [] }, eventRow(noSettings))

    expect(finishReason(unset, true, { outcome: 'winner', winners: [] })).toBe('wrong_phase')
    expect(finishReason(unset, false, { outcome: 'winner', winners: [] })).toBe('not_host')
    expect(lastGameReason(unset, true)).toBe('wrong_phase')
  })

  it('wants every Round up to the Game count to have its Result, with 0, 1 and 2 of 3 in', () => {
    for (const count of [0, 1, 2]) {
      expect(finishReason(state({ rounds: finished(count) }), true, { outcome: 'winner', winners: [1] })).toBe('results_missing')
      expect(lastGameReason(state({ rounds: finished(count) }), true)).toBe('results_missing')
    }
  })

  it('finishes a sole winner on the outcome and the winners the Host saw', () => {
    const complete = state({ rounds: finished(3) })

    expect(finishReason(complete, true, { outcome: 'winner', winners: [1] })).toBeNull()
    expect(finishReason(complete, true, { outcome: 'tie', winners: [1, 2] })).toBe('standings_changed')
    expect(finishReason(complete, true, { outcome: 'winner', winners: [2] })).toBe('standings_changed')
  })

  it('finishes a Tie only with all its Parties', () => {
    const complete = state({ rounds: tied })

    expect(finishReason(complete, true, { outcome: 'tie', winners: [1, 2] })).toBeNull()
    expect(finishReason(complete, true, { outcome: 'tie', winners: [1] })).toBe('standings_changed')
    expect(finishReason(complete, true, { outcome: 'winner', winners: [1] })).toBe('standings_changed')
  })

  it('adds the last game only to a Tie, below the maximum', () => {
    expect(lastGameReason(state({ rounds: finished(3) }), true)).toBe('no_tie')
    expect(lastGameReason(state({ rounds: tied }), true)).toBeNull()
    expect(lastGameReason(state({ rounds: tied }, eventRow({ gameCount: 20 })), true)).toBe('results_missing')
  })

  it('refuses the last game at the Game count maximum with game_count_range, and still lets the Host finish the Tie', () => {
    const alternating = Array.from({ length: GAME_COUNT_MAX }, (_, index) => played(`r${index}`, index + 1, index % 2 === 0 ? [[1, 1], [2, 2]] : [[1, 2], [2, 1]])).flat()
    const maximum = state({ rounds: alternating }, eventRow({ gameCount: GAME_COUNT_MAX }))

    expect(lastGameReason(maximum, true)).toBe('game_count_range')
    expect(finishReason(maximum, true, { outcome: 'tie', winners: [1, 2] })).toBeNull()
  })
})

describe('coinReason', () => {
  it('asks the Host, a Running Session, then that no toss is in the air', () => {
    expect(coinReason(state(), false)).toBe('not_host')
    expect(coinReason(state({ sessions: [] }), true)).toBe('no_running_session')
    expect(coinReason(state({ toss: toss(at(1)) }), true)).toBe('coin_in_air')
    expect(coinReason(state({ toss: toss(at(-1)) }), true)).toBeNull()
    expect(coinReason(state({ toss: null }), true)).toBeNull()
  })
})

describe('moveReason and the seats', () => {
  it('names a Member the Event does not have', () => {
    expect(moveReason(state(), { actorId: 'host', userId: 'stranger', to: { zone: 'bench' } })).toBe('member_not_found')
  })

  it('lets a Player move only themselves, the Host anyone', () => {
    expect(moveReason(state(), { actorId: 'a', userId: 'b', to: { zone: 'bench' } })).toBe('host_only')
    expect(moveReason(state(), { actorId: 'host', userId: 'b', to: { zone: 'bench' } })).toBeNull()
  })

  it('refuses a move to the seat the Member is in, to a team that does not exist and into a full team', () => {
    expect(moveReason(state(), { actorId: 'host', userId: 'a', to: { zone: 'team', team: 1 } })).toBe('already_there')
    expect(moveReason(state(), { actorId: 'host', userId: 'a', to: { zone: 'team', team: 3 } })).toBe('no_such_team')
    expect(moveReason(state(), { actorId: 'host', userId: 'host', to: { zone: 'team', team: 1 } })).toBe('team_full')
  })

  it('locks the teams for a Player once the first Session has started, and before Team choice opens', () => {
    expect(moveReason(state(), { actorId: 'a', userId: 'a', to: { zone: 'bench' } })).toBe('teams_locked')
    const before = state({ sessions: [waiting('s2', at(60))] })
    expect(moveReason(before, { actorId: 'a', userId: 'a', to: { zone: 'bench' } })).toBeNull()
    expect(moveReason(state({ sessions: [waiting('s2', null)] }), { actorId: 'a', userId: 'a', to: { zone: 'bench' } })).toBe('team_choice_closed')
  })

  it('says whether Team choice is open and whether the first Session has started', () => {
    expect(teamChoiceOf(state({ sessions: [waiting('s2', at(60))] }))).toMatchObject({ started: false, open: true })
    expect(teamChoiceOf(state({ sessions: [running({ endedAt: at(-1) })] }))).toMatchObject({ started: true, open: false })
  })
})

describe('startOf', () => {
  it('names the next Session with its number and why it cannot start now', () => {
    const next = state({ sessions: [running({ id: 's1', endedAt: at(-1) }), waiting('s2', at(60))] })

    expect(startOf(next)).toMatchObject({ next: { id: 's2', number: 2 }, rejection: null })
    expect(startOf(state({ sessions: [running(), waiting('s2', at(60))] })).rejection).toBe('session_running')
  })

  it('refuses without settings, without a dated Session and with uneven teams', () => {
    expect(startOf(state({ sessions: [waiting('s2', at(60))] }, eventRow(noSettings))).rejection).toBe('not_set_up')
    expect(startOf(state({ sessions: [waiting('s2', null)] }))).toMatchObject({ next: null, rejection: 'no_dated_session' })
    expect(startOf(state({ sessions: [waiting('s2', at(60))], members: [member('a', 'team', 1), member('b', 'team', 1), member('c', 'team', 2)] })).rejection).toBe('teams_uneven')
  })
})

describe('floorsOf', () => {
  it('counts the Game count floor as the Rounds started, a put-back Round not', () => {
    const putBack = joined(round('r9', { putBackAt: at(-5) }), { draw: draw('d9', 'r9') })

    expect(floorsOf(state({ rounds: [...manyRounds(2), putBack] })).roundsStarted).toBe(2)
    expect(floorsOf(state({ rounds: [putBack] })).roundsStarted).toBe(0)
    expect(floorsOf(state({ rounds: [] })).roundsStarted).toBe(0)
  })

  it('takes the Team size floor from the fullest team that remains', () => {
    const members = [member('a', 'team', 1), member('b', 'team', 1), member('c', 'team', 1), member('d', 'team', 2), member('e', 'bench')]

    expect(floorsOf(state({ members })).playersPerTeam).toEqual([3, 1])
  })

  it('counts a Veto only when its draw window has ended: a cast in a window that runs does not move the floor', () => {
    const floors = floorsOf(state({ vetoes: [vetoRow('d1', 1, at(5)), vetoRow('d2', 2, at(-5)), vetoRow('d3', 2, at(-4))] }))

    expect(floors.vetoesSpent).toBe(2)
    expect(floorsOf(state({ vetoes: [vetoRow('d1', 1, at(5))] })).vetoesSpent).toBe(0)
    expect(floorsOf(state({ vetoes: [vetoRow('d1', 1, null)] })).vetoesSpent).toBe(0)
  })
})

describe('roundBeingDrawnOf', () => {
  it('is true while a draw is open, also when its Round was started earlier, and false otherwise', () => {
    const open = joined(drawn('r9'), { draw: draw('d9', 'r9', { outcome: null, settledAt: null }) })

    expect(roundBeingDrawnOf(state({ rounds: [open] }))).toBe(true)
    expect(roundBeingDrawnOf(state({ rounds: manyRounds(2) }))).toBe(false)
    expect(roundBeingDrawnOf(state({ rounds: [] }))).toBe(false)
  })
})

describe('teamNamesOf', () => {
  const words = [member('a', 'team', 1, { teamWord: 'Gurken', teamJoinedAt: at(-3) }), member('b', 'team', 1, { teamWord: 'Bande', teamJoinedAt: at(-2) }), member('c', 'team', 2)]
  const finished = (fields: Partial<EventRow> = {}) => eventRow({ phase: 'finished', ...fields })

  it('composes the name from the words of the team in the order they joined, null without words', () => {
    expect(teamNamesOf(state({ members: words, teams: [] }))).toEqual([
      { position: 1, name: 'Gurken Bande' },
      { position: 2, name: null },
    ])
  })

  it('composes in an Event that is not finished even when stored names exist: the previous deployment may still write them (#438)', () => {
    const rows = [{ position: 1, frozenName: 'Alt' }, { position: 2, frozenName: null }]

    for (const phase of ['running', 'date_set'] as const) {
      expect(teamNamesOf(state({ members: words, teams: rows }, eventRow({ phase })))).toEqual([
        { position: 1, name: 'Gurken Bande' },
        { position: 2, name: null },
      ])
    }
  })

  it('shows the stored name of a finished Event, null for the colour whatever the words say', () => {
    for (const phase of ['finished', 'archived'] as const) {
      expect(teamNamesOf(state({ members: words, teams: [{ position: 1, frozenName: 'Alt' }, { position: 2, frozenName: null }] }, eventRow({ phase })))).toEqual([
        { position: 1, name: 'Alt' },
        { position: 2, name: null },
      ])
    }
    expect(teamNamesOf(state({ members: words, teams: [{ position: 1, frozenName: null }] }, finished()))[0]).toEqual({ position: 1, name: null })
  })

  it('composes a finished Event without a row, and mixes a stored name with a composed one', () => {
    expect(teamNamesOf(state({ members: words, teams: [] }, finished())).map(entry => entry.name)).toEqual(['Gurken Bande', null])
    expect(teamNamesOf(state({ members: words, teams: [{ position: 2, frozenName: 'Die allerlängsten' }] }, finished())).map(entry => entry.name)).toEqual(['Gurken Bande', 'Die allerlängsten'])
  })

  it('lists as many teams as the settings say, none for an Event that is not set up', () => {
    expect(teamNamesOf(state({ members: words }, eventRow({ teamCount: 3 })))).toHaveLength(3)
    expect(teamNamesOf(state({ members: words }, eventRow(noSettings)))).toEqual([])
  })

  it('names a team by one word, two words or the longest word four times', () => {
    const longest = 'Gurkenfreund'
    const four = ['a', 'b', 'c', 'd'].map((id, index) => member(id, 'team', 1, { teamWord: longest, teamJoinedAt: at(-10 + index) }))

    expect(teamNamesOf(state({ members: [member('a', 'team', 1, { teamWord: 'Eins', teamJoinedAt: at(-3) })] }))[0]?.name).toBe('Eins')
    expect(teamNamesOf(state({ members: four }))[0]?.name).toBe(Array(4).fill(longest).join(' '))
  })
})
