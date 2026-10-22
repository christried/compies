import { describe, expect, it } from 'vitest'
import { setDateRejection, setDateValues } from '../../server/domain/phase'

// Phase transitions (#1 § Domain rules). Set Date moves poll → date_set; the rule is pure so that
// Reschedule and Reopen (#14) can be added next to it with the same shape.

const now = new Date('2026-10-22T09:00:00.000Z')
const later = new Date('2026-10-24T18:00:00.000Z')

describe('setDateRejection', () => {
  it('lets the Host set a future time while the Session is in the poll phase', () => {
    expect(setDateRejection({ phase: 'poll', startsAt: later, now })).toBeNull()
  })

  it('refuses any phase other than poll, so a set Date or a Session before its poll cannot be changed this way', () => {
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
  it('moves to date_set, sets the Date and forgets the previous one', () => {
    expect(setDateValues(later)).toEqual({ phase: 'date_set', startsAt: later, previousStartsAt: null })
  })
})
