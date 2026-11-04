import { describe, expect, it } from 'vitest'
import { draftFromResult, draftPlaces, draftPoints, moveRow, newResultDraft, setScore, toggleLevel, type ResultDraft } from '../../app/utils/result-draft'
import { rowIndexAt } from '../../app/utils/row-drag'

// The result sheet's state rules (#273): the order of the Parties, which neighbours are level, the typed Scores, and what they make
// of them (the Places to send and the points to preview). Pure, so the sheet only draws them.

const linear3 = { values: [2, 1, 0] }

describe('newResultDraft', () => {
  it('lists the Parties in team order, none level, no Score', () => {
    expect(newResultDraft(3)).toEqual({ order: [1, 2, 3], level: [false, false, false], scores: {} })
  })

  it('holds 2 and 8 Parties', () => {
    expect(newResultDraft(2).order).toEqual([1, 2])
    expect(newResultDraft(8).order).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('moveRow', () => {
  const draft = (order: number[], level: boolean[]): ResultDraft => ({ order, level, scores: { 1: '4' } })

  it('moves a row down and up, keeping the Scores', () => {
    expect(moveRow(draft([1, 2, 3], [false, false, false]), 0, 1).order).toEqual([2, 1, 3])
    expect(moveRow(draft([1, 2, 3], [false, false, false]), 2, 0).order).toEqual([3, 1, 2])
    expect(moveRow(draft([1, 2, 3], [false, false, false]), 0, 1).scores).toEqual({ 1: '4' })
  })

  it('returns the draft unchanged when the row stays or the target is out of range', () => {
    const before = draft([1, 2, 3], [false, true, false])
    expect(moveRow(before, 1, 1)).toEqual(before)
    expect(moveRow(before, 0, 3)).toEqual(before)
    expect(moveRow(before, -1, 1)).toEqual(before)
  })

  it('does not change the draft it was given', () => {
    const before = draft([1, 2, 3], [false, true, true])
    moveRow(before, 0, 2)
    expect(before.order).toEqual([1, 2, 3])
    expect(before.level).toEqual([false, true, true])
  })

  it('clears the flags of every gap that touches a row between from and to, and keeps the ones outside', () => {
    // Gap i sits between rows i-1 and i. Moving row 1 to row 2 touches rows 1 and 2: gaps 1, 2 and 3.
    const moved = moveRow(draft([1, 2, 3, 4, 5], [false, true, true, true, true]), 1, 2)
    expect(moved.level).toEqual([false, false, false, false, true])
    // Moving row 3 up to row 2 touches rows 2 and 3: gaps 2, 3 and 4.
    expect(moveRow(draft([1, 2, 3, 4, 5], [false, true, true, true, true]), 3, 2).level).toEqual([false, true, false, false, false])
  })
})

describe('toggleLevel', () => {
  it('flips the flag of the gap above a row', () => {
    const once = toggleLevel(newResultDraft(3), 1)
    expect(once.level).toEqual([false, true, false])
    expect(toggleLevel(once, 1).level).toEqual([false, false, false])
  })

  it('ignores index 0 and an index out of range', () => {
    const draft = newResultDraft(3)
    expect(toggleLevel(draft, 0)).toEqual(draft)
    expect(toggleLevel(draft, 3)).toEqual(draft)
    expect(toggleLevel(draft, -1)).toEqual(draft)
  })
})

describe('setScore', () => {
  it('keeps what is typed for a team', () => {
    expect(setScore(newResultDraft(2), 2, ' 16 ').scores).toEqual({ 2: ' 16 ' })
  })

  it('cuts at 7 characters as the User sees them', () => {
    expect(setScore(newResultDraft(2), 1, '123456789').scores).toEqual({ 1: '1234567' })
    expect(setScore(newResultDraft(2), 1, '👨‍👩‍👧'.repeat(9)).scores).toEqual({ 1: '👨‍👩‍👧'.repeat(7) })
  })
})

describe('draftPlaces', () => {
  it('lists the Parties top to bottom with their Places and trimmed Scores, null when empty', () => {
    const draft = setScore(setScore(moveRow(newResultDraft(3), 0, 2), 1, ' 16 '), 3, '   ')
    expect(draftPlaces(draft)).toEqual([
      { team: 2, place: 1, score: null },
      { team: 3, place: 2, score: null },
      { team: 1, place: 3, score: '16' },
    ])
  })

  it('gives level rows the Place of the row above (1, 1, 3) and all level 1, 1, 1', () => {
    expect(draftPlaces(toggleLevel(newResultDraft(3), 1)).map(entry => entry.place)).toEqual([1, 1, 3])
    expect(draftPlaces(toggleLevel(toggleLevel(newResultDraft(3), 1), 2)).map(entry => entry.place)).toEqual([1, 1, 1])
  })

  it('keeps a Score of 0', () => {
    expect(draftPlaces(setScore(newResultDraft(2), 1, '0'))[0]!.score).toBe('0')
  })
})

describe('draftPoints', () => {
  it('gives each row, top to bottom, the points of its Place', () => {
    expect(draftPoints(newResultDraft(3), linear3)).toEqual([2, 1, 0])
  })

  it('gives a Shared place the better Place\'s points', () => {
    expect(draftPoints(toggleLevel(newResultDraft(3), 1), linear3)).toEqual([2, 2, 0])
    expect(draftPoints(toggleLevel(toggleLevel(newResultDraft(3), 1), 2), linear3)).toEqual([2, 2, 2])
  })

  it('follows the order and a custom table', () => {
    expect(draftPoints(moveRow(newResultDraft(3), 2, 0), { values: [5, 3, 0] })).toEqual([5, 3, 0])
  })
})

describe('draftFromResult (#275)', () => {
  const stored = (rows: [number, number, string | null][]) => rows.map(([team, place, score]) => ({ team, place, score }))
  /** An unchanged save sends exactly the stored Places, so the server finds the Result equal and writes nothing. */
  const roundTrip = (rows: ReturnType<typeof stored>) => expect(draftPlaces(draftFromResult(rows))).toEqual(rows)

  it('lists the Parties in Place order with no gap level, for 1, 2, 3', () => {
    const draft = draftFromResult(stored([[2, 1, null], [3, 2, null], [1, 3, null]]))
    expect(draft.order).toEqual([2, 3, 1])
    expect(draft.level).toEqual([false, false, false])
    roundTrip(stored([[2, 1, null], [3, 2, null], [1, 3, null]]))
  })

  it('sets the flag where a row has the Place of the row above (1, 1, 3 and 1, 2, 2)', () => {
    expect(draftFromResult(stored([[1, 1, null], [2, 1, null], [3, 3, null]])).level).toEqual([false, true, false])
    expect(draftFromResult(stored([[1, 1, null], [2, 2, null], [3, 2, null]])).level).toEqual([false, false, true])
    roundTrip(stored([[1, 1, null], [2, 1, null], [3, 3, null]]))
    roundTrip(stored([[1, 1, null], [2, 2, null], [3, 2, null]]))
  })

  it('sets every flag when all Parties are level', () => {
    expect(draftFromResult(stored([[1, 1, null], [2, 1, null], [3, 1, null]])).level).toEqual([false, true, true])
    roundTrip(stored([[1, 1, null], [2, 1, null], [3, 1, null]]))
  })

  it('sorts a Result given out of order by Place, then by team', () => {
    const draft = draftFromResult(stored([[3, 3, null], [2, 1, null], [1, 1, null]]))
    expect(draft.order).toEqual([1, 2, 3])
    expect(draft.level).toEqual([false, true, false])
  })

  it('keeps the Scores as stored and gives a Party without one an empty field', () => {
    const draft = draftFromResult(stored([[1, 1, '16'], [2, 2, null], [3, 3, '0']]))
    expect(draft.scores).toEqual({ 1: '16', 2: '', 3: '0' })
    roundTrip(stored([[1, 1, '16'], [2, 2, null], [3, 3, '0']]))
  })

  it('does not change the list it is given', () => {
    const rows = stored([[3, 3, null], [1, 1, null], [2, 2, null]])
    draftFromResult(rows)
    expect(rows.map(row => row.team)).toEqual([3, 1, 2])
  })

  it('holds 2 and 8 Parties', () => {
    roundTrip(stored([[2, 1, '3'], [1, 2, null]]))
    roundTrip(stored([[1, 1, '7'], [4, 1, null], [2, 3, null], [3, 3, null], [8, 5, null], [5, 6, '1234567'], [6, 6, null], [7, 8, null]]))
    expect(draftFromResult(stored([[4, 1, null], [1, 1, null], [2, 3, null], [3, 3, null], [8, 5, null], [5, 6, null], [6, 6, null], [7, 8, null]])).order).toEqual([1, 4, 2, 3, 8, 5, 6, 7])
  })
})

describe('rowIndexAt', () => {
  it('counts the row middles above the point', () => {
    const middles = [10, 30, 50]
    expect(rowIndexAt(0, middles)).toBe(0)
    expect(rowIndexAt(20, middles)).toBe(1)
    expect(rowIndexAt(40, middles)).toBe(2)
  })

  it('clamps below the last middle and works for a single row', () => {
    expect(rowIndexAt(500, [10, 30, 50])).toBe(2)
    expect(rowIndexAt(-50, [10, 30, 50])).toBe(0)
    expect(rowIndexAt(99, [10])).toBe(0)
  })
})
