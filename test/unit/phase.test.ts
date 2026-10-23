import { describe, expect, it } from 'vitest'
import { addSessionRejection, phaseAfterChange, phaseOf, removeSessionRejection, reopenRejection, reopenValues, rescheduleRejection, rescheduleValues, setDateRejection, setDateValues } from '../../server/domain/phase'

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
    expect(setDateValues(later, 'slot-1')).toEqual({ startsAt: later, previousStartsAt: null, slotId: 'slot-1' })
  })

  it('leaves the Slot empty when the Date matches no Slot', () => {
    expect(setDateValues(later, null).slotId).toBeNull()
  })
})

describe('phaseAfterChange', () => {
  it('follows the Dates in the date poll and date set', () => {
    expect(phaseAfterChange('poll', [later, null])).toBe('poll')
    expect(phaseAfterChange('date_set', [later, later])).toBe('date_set')
    expect(phaseAfterChange('date_set', [later, null])).toBe('poll')
  })

  it('keeps running, finished and archived Events as they are, whatever the Dates say', () => {
    expect(phaseAfterChange('running', [null])).toBe('running')
    expect(phaseAfterChange('finished', [later])).toBe('finished')
    expect(phaseAfterChange('archived', [null])).toBe('archived')
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
  it('lets the Host move a set Date to a future time that no other Session has', () => {
    expect(rescheduleRejection({ hasDate: true, startsAt: later, now, duplicate: false })).toBeNull()
  })

  it('refuses a Session that has no set Date yet, so Reschedule never acts on an undated one', () => {
    expect(rescheduleRejection({ hasDate: false, startsAt: later, now, duplicate: false })).toBe('wrong_phase')
  })

  it('refuses a time that is not in the future', () => {
    expect(rescheduleRejection({ hasDate: true, startsAt: now, now, duplicate: false })).toBe('in_past')
  })

  it('refuses a Date another Session already has, with duplicate_date', () => {
    expect(rescheduleRejection({ hasDate: true, startsAt: later, now, duplicate: true })).toBe('duplicate_date')
  })

  it('checks the Date before the time', () => {
    expect(rescheduleRejection({ hasDate: false, startsAt: now, now, duplicate: false })).toBe('wrong_phase')
  })
})

describe('rescheduleValues', () => {
  it('sets the new Date and forgets the previous one; the .ics sequence is counted in SQL by the handler', () => {
    expect(rescheduleValues(later)).toEqual({ startsAt: later, previousStartsAt: null })
  })
})

describe('reopenRejection', () => {
  it('lets the Host reopen one set Date in every Phase before finished, also while running', () => {
    expect(reopenRejection({ phase: 'date_set', hasDate: true })).toBeNull()
    expect(reopenRejection({ phase: 'poll', hasDate: true })).toBeNull()
    expect(reopenRejection({ phase: 'running', hasDate: true })).toBeNull()
  })

  it('refuses a Session that has no Date, and any phase that is not editable', () => {
    expect(reopenRejection({ phase: 'poll', hasDate: false })).toBe('wrong_phase')
    expect(reopenRejection({ phase: 'finished', hasDate: true })).toBe('wrong_phase')
  })
})

describe('reopenValues', () => {
  it('frees the Session of its Date and Slot; the handler keeps the old Date as previousStartsAt', () => {
    expect(reopenValues()).toEqual({ startsAt: null, slotId: null })
  })
})

describe('addSessionRejection', () => {
  const now = new Date('2090-01-01T00:00:00Z')
  const future = new Date('2090-02-01T19:00:00Z')

  it('adds an undated Session in an editable phase, and a dated one with a future Date that is nobody\'s', () => {
    expect(addSessionRejection({ phase: 'poll', count: 1, startsAt: null, now, duplicate: false })).toBeNull()
    expect(addSessionRejection({ phase: 'date_set', count: 1, startsAt: future, now, duplicate: false })).toBeNull()
  })

  it('refuses a ninth Session, a past Date, another Session\'s Date and a phase that is not editable', () => {
    expect(addSessionRejection({ phase: 'poll', count: 8, startsAt: null, now, duplicate: false })).toBe('sessions_max')
    expect(addSessionRejection({ phase: 'poll', count: 1, startsAt: new Date('2089-01-01T19:00:00Z'), now, duplicate: false })).toBe('in_past')
    expect(addSessionRejection({ phase: 'poll', count: 1, startsAt: future, now, duplicate: true })).toBe('duplicate_date')
    expect(addSessionRejection({ phase: 'finished', count: 1, startsAt: null, now, duplicate: false })).toBe('wrong_phase')
  })
})

describe('removeSessionRejection', () => {
  it('removes a Session of an editable Event while another one stays', () => {
    expect(removeSessionRejection({ phase: 'poll', count: 2 })).toBeNull()
    expect(removeSessionRejection({ phase: 'date_set', count: 3 })).toBeNull()
  })

  it('never removes the last Session', () => {
    expect(removeSessionRejection({ phase: 'poll', count: 1 })).toBe('last_session')
  })

  it('refuses a phase that is not editable', () => {
    expect(removeSessionRejection({ phase: 'finished', count: 2 })).toBe('wrong_phase')
  })
})
