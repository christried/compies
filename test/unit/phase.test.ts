import { describe, expect, it } from 'vitest'
import { phaseOf, reopenRejection, reopenValues, rescheduleRejection, rescheduleValues, setDateRejection, setDateValues } from '../../server/domain/phase'

// Phase transitions (#1 § Domain rules). Each transition is a pure rule next to the others: the
// handlers load the Event, ask the rule, and write the returned values with a conditional update.

const now = new Date('2026-10-22T09:00:00.000Z')
const later = new Date('2026-10-24T18:00:00.000Z')

describe('setDateRejection', () => {
  const open = { phase: 'poll' as const, startsAt: later, now, taken: false, undated: 2 }

  it('lets the Host set a free future Slot while a Session waits for a Date', () => {
    expect(setDateRejection(open)).toBeNull()
  })

  it('refuses any phase other than poll, so a set Date cannot be changed this way', () => {
    expect(setDateRejection({ ...open, phase: 'date_set' })).toBe('wrong_phase')
    expect(setDateRejection({ ...open, phase: 'draft' })).toBe('wrong_phase')
  })

  it('refuses when no Session is left without a Date', () => {
    expect(setDateRejection({ ...open, undated: 0 })).toBe('wrong_phase')
  })

  it('refuses a Slot that already became a Date', () => {
    expect(setDateRejection({ ...open, taken: true })).toBe('slot_taken')
  })

  it('refuses a time that is not in the future, including the very same instant', () => {
    expect(setDateRejection({ ...open, startsAt: now })).toBe('in_past')
    expect(setDateRejection({ ...open, startsAt: new Date('2026-10-21T18:00:00.000Z') })).toBe('in_past')
  })

  it('checks the phase first, then the taken Slot, then the time', () => {
    expect(setDateRejection({ ...open, phase: 'date_set', taken: true, startsAt: now })).toBe('wrong_phase')
    expect(setDateRejection({ ...open, undated: 0, taken: true })).toBe('wrong_phase')
    expect(setDateRejection({ ...open, taken: true, startsAt: now })).toBe('slot_taken')
  })
})

describe('setDateValues', () => {
  it('gives the undated Session the Date and the Slot it came from, forgetting the previous Date', () => {
    expect(setDateValues(later, 'slot-1', 2)).toEqual({ phase: 'poll', session: { startsAt: later, previousStartsAt: null, slotId: 'slot-1' } })
  })

  it('moves the Event to date_set with the last Session that needed a Date', () => {
    expect(setDateValues(later, 'slot-1', 1).phase).toBe('date_set')
  })

  it('leaves the Slot empty when the Date matches no Slot', () => {
    expect(setDateValues(later, null, 1).session.slotId).toBeNull()
  })
})

describe('phaseOf', () => {
  it('is the date poll while any Session has no Date, and date set once all have one', () => {
    expect(phaseOf([later, null])).toBe('poll')
    expect(phaseOf([null, null])).toBe('poll')
    expect(phaseOf([later, later])).toBe('date_set')
    expect(phaseOf([later])).toBe('date_set')
  })
})

describe('rescheduleRejection', () => {
  it('lets the Host move a set Date to a future time', () => {
    expect(rescheduleRejection({ hasDate: true, startsAt: later, now })).toBeNull()
  })

  it('refuses a Session that has no set Date yet, so Reschedule never acts on an undated one', () => {
    expect(rescheduleRejection({ hasDate: false, startsAt: later, now })).toBe('wrong_phase')
  })

  it('refuses a time that is not in the future', () => {
    expect(rescheduleRejection({ hasDate: true, startsAt: now, now })).toBe('in_past')
  })

  it('checks the Date before the time', () => {
    expect(rescheduleRejection({ hasDate: false, startsAt: now, now })).toBe('wrong_phase')
  })
})

describe('rescheduleValues', () => {
  it('sets the new Date and forgets the previous one; the .ics sequence is counted in SQL by the handler', () => {
    expect(rescheduleValues(later)).toEqual({ startsAt: later, previousStartsAt: null })
  })
})

describe('reopenRejection', () => {
  it('lets the Host reopen a set Date', () => {
    expect(reopenRejection({ phase: 'date_set' })).toBeNull()
  })

  it('refuses a poll or any other phase: there is no set Date to withdraw', () => {
    expect(reopenRejection({ phase: 'poll' })).toBe('wrong_phase')
    expect(reopenRejection({ phase: 'draft' })).toBe('wrong_phase')
  })
})

describe('reopenValues', () => {
  it('goes back to the poll and frees the Session of its Date and Slot; the handler keeps the old Date as previousStartsAt', () => {
    expect(reopenValues()).toEqual({ phase: 'poll', session: { startsAt: null, slotId: null } })
  })
})
