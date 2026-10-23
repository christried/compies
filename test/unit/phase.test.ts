import { describe, expect, it } from 'vitest'
import { reopenRejection, reopenValues, rescheduleRejection, rescheduleValues, setDateRejection, setDateValues } from '../../server/domain/phase'

// Phase transitions (#1 § Domain rules). Each transition is a pure rule next to the others: the
// handlers load the Event, ask the rule, and write the returned values with a conditional update.

const now = new Date('2026-10-22T09:00:00.000Z')
const later = new Date('2026-10-24T18:00:00.000Z')

describe('setDateRejection', () => {
  it('lets the Host set a future time while the Event is in the poll phase', () => {
    expect(setDateRejection({ phase: 'poll', startsAt: later, now })).toBeNull()
  })

  it('refuses any phase other than poll, so a set Date or an Event before its poll cannot be changed this way', () => {
    expect(setDateRejection({ phase: 'date_set', startsAt: later, now })).toBe('wrong_phase')
    expect(setDateRejection({ phase: 'draft', startsAt: later, now })).toBe('wrong_phase')
  })

  it('refuses a time that is not in the future, including the very same instant', () => {
    expect(setDateRejection({ phase: 'poll', startsAt: now, now })).toBe('in_past')
    expect(setDateRejection({ phase: 'poll', startsAt: new Date('2026-10-21T18:00:00.000Z'), now })).toBe('in_past')
  })

  it('checks the phase before the time', () => {
    expect(setDateRejection({ phase: 'date_set', startsAt: now, now })).toBe('wrong_phase')
  })
})

describe('setDateValues', () => {
  it('moves the Event to date_set and gives its Session the Date and the Slot it came from, forgetting the previous Date', () => {
    expect(setDateValues(later, 'slot-1')).toEqual({ phase: 'date_set', session: { startsAt: later, previousStartsAt: null, slotId: 'slot-1' } })
  })

  it('leaves the Slot empty when the Date matches no Slot', () => {
    expect(setDateValues(later, null).session.slotId).toBeNull()
  })
})

describe('rescheduleRejection', () => {
  it('lets the Host move a set Date to a future time', () => {
    expect(rescheduleRejection({ phase: 'date_set', startsAt: later, now })).toBeNull()
  })

  it('refuses an Event that has no set Date yet, so Reschedule never acts on a poll', () => {
    expect(rescheduleRejection({ phase: 'poll', startsAt: later, now })).toBe('wrong_phase')
    expect(rescheduleRejection({ phase: 'draft', startsAt: later, now })).toBe('wrong_phase')
  })

  it('refuses a time that is not in the future', () => {
    expect(rescheduleRejection({ phase: 'date_set', startsAt: now, now })).toBe('in_past')
  })

  it('checks the phase before the time', () => {
    expect(rescheduleRejection({ phase: 'poll', startsAt: now, now })).toBe('wrong_phase')
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
