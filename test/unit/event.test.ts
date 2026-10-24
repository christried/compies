import { describe, expect, it } from 'vitest'
import { parseAddedSlot, parseNewEvent } from '../../server/domain/event'
import { slotsEditable } from '../../shared/event'
import { berlinToUtc } from '../../shared/time'

// Thursday 22 Oct 2026, 12:00 in Berlin (CEST). Times below are Berlin wall-clock values.
const now = new Date('2026-10-22T10:00:00Z')

function poll(overrides: Record<string, unknown> = {}) {
  return { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2026-10-30T20:30'], ...overrides }
}

function direct(overrides: Record<string, unknown> = {}) {
  return { name: 'Abend', dateMode: 'direct', sessions: 1, startsAt: ['2026-11-07T20:00'], ...overrides }
}

function slotsOnDays(count: number) {
  return Array.from({ length: count }, (_, day) => `2026-11-${String(day + 1).padStart(2, '0')}T20:00`)
}

describe('parseNewEvent', () => {
  it('turns a poll into a trimmed name, the Session count and UTC Slots (Europe/Berlin, CET after the change)', () => {
    const result = parseNewEvent(poll({ name: ' Freitags-Zocken ', slots: ['2026-10-30T20:30', '2026-10-31T19:00'] }), now)

    expect(result).toEqual({
      ok: true,
      event: {
        dateMode: 'poll',
        name: 'Freitags-Zocken',
        sessions: 1,
        slots: [new Date('2026-10-30T19:30:00Z'), new Date('2026-10-31T18:00:00Z')],
      },
    })
  })

  it('turns a direct Date per Session into UTC instants', () => {
    const result = parseNewEvent(direct({ sessions: 2, startsAt: ['2026-11-07T20:00', '2026-11-08T19:00'] }), now)

    expect(result).toEqual({
      ok: true,
      event: {
        dateMode: 'direct',
        name: 'Abend',
        sessions: 2,
        startsAt: [new Date('2026-11-07T19:00:00Z'), new Date('2026-11-08T18:00:00Z')],
      },
    })
  })

  it('counts the name in characters, 1 to 60, emoji as one', () => {
    expect(parseNewEvent(poll({ name: 'x'.repeat(60) }), now).ok).toBe(true)
    expect(parseNewEvent(poll({ name: '🎮'.repeat(60) }), now).ok).toBe(true)
    expect(parseNewEvent(poll({ name: 'x'.repeat(61) }), now)).toEqual({ ok: false, error: 'invalid_name' })
    expect(parseNewEvent(poll({ name: '   ' }), now)).toEqual({ ok: false, error: 'invalid_name' })
    expect(parseNewEvent(poll({ name: 42 }), now)).toEqual({ ok: false, error: 'invalid_name' })
  })

  it('accepts only the two date modes', () => {
    expect(parseNewEvent(poll({ dateMode: 'weekly' }), now)).toEqual({ ok: false, error: 'invalid_mode' })
    expect(parseNewEvent({ name: 'Abend' }, now)).toEqual({ ok: false, error: 'invalid_mode' })
  })

  it('takes a Session count from 1 to 8, whole numbers only', () => {
    for (const sessions of [0, 9, 1.5, '2', -1]) {
      expect(parseNewEvent(poll({ sessions }), now)).toEqual({ ok: false, error: 'invalid_sessions' })
      expect(parseNewEvent(direct({ sessions }), now)).toEqual({ ok: false, error: 'invalid_sessions' })
    }
    expect(parseNewEvent(poll({ sessions: 8, slots: slotsOnDays(8) }), now).ok).toBe(true)
  })

  it('takes 1 to 16 Slots in poll mode', () => {
    expect(parseNewEvent(poll({ slots: [] }), now)).toEqual({ ok: false, error: 'invalid_slots' })
    expect(parseNewEvent(poll({ slots: undefined }), now)).toEqual({ ok: false, error: 'invalid_slots' })
    expect(parseNewEvent(poll({ slots: slotsOnDays(17) }), now)).toEqual({ ok: false, error: 'invalid_slots' })
    expect(parseNewEvent(poll({ slots: slotsOnDays(16) }), now).ok).toBe(true)
  })

  it('makes one Session when the count is left out', () => {
    expect(parseNewEvent({ name: 'Abend', dateMode: 'poll', slots: ['2026-10-30T20:30'] }, now)).toMatchObject({ ok: true, event: { sessions: 1 } })
  })

  it('takes at least as many Slots as Sessions in poll mode', () => {
    expect(parseNewEvent(poll({ sessions: 2, slots: ['2026-10-30T20:30'] }), now)).toEqual({ ok: false, error: 'too_few_slots' })
    expect(parseNewEvent(poll({ sessions: 2, slots: slotsOnDays(2) }), now).ok).toBe(true)
  })

  it('takes exactly one Date per Session in direct mode', () => {
    expect(parseNewEvent(direct({ sessions: 2, startsAt: ['2026-11-07T20:00'] }), now)).toEqual({ ok: false, error: 'invalid_time' })
    expect(parseNewEvent(direct({ sessions: 1, startsAt: '2026-11-07T20:00' }), now)).toEqual({ ok: false, error: 'invalid_time' })
  })

  it('rejects a time that is not a real Berlin wall-clock time', () => {
    for (const slot of ['2026-10-30 20:30', '2026-10-30T25:00', '2026-02-30T10:00', '2026-03-29T02:30', 42]) {
      expect(parseNewEvent(poll({ slots: [slot] }), now)).toEqual({ ok: false, error: 'invalid_time' })
      expect(parseNewEvent(direct({ startsAt: [slot] }), now)).toEqual({ ok: false, error: 'invalid_time' })
    }
  })

  it('rejects a Slot in the past or right now', () => {
    expect(parseNewEvent(poll({ slots: ['2026-10-22T11:00'] }), now)).toEqual({ ok: false, error: 'in_past' })
    expect(parseNewEvent(poll({ slots: ['2026-10-22T12:00'] }), now)).toEqual({ ok: false, error: 'in_past' })
    expect(parseNewEvent(poll({ slots: ['2026-10-22T12:01'] }), now).ok).toBe(true)
  })

  it('rejects a direct Date in the past', () => {
    expect(parseNewEvent(direct({ startsAt: ['2026-10-01T20:00'] }), now)).toEqual({ ok: false, error: 'in_past' })
  })

  it('rejects two direct Dates that are the same', () => {
    expect(parseNewEvent(direct({ sessions: 2, startsAt: ['2026-11-07T20:00', '2026-11-07T20:00'] }), now)).toEqual({ ok: false, error: 'duplicate_date' })
    expect(parseNewEvent(direct({ sessions: 2, startsAt: ['2026-11-07T20:00', '2026-11-07T20:01'] }), now).ok).toBe(true)
  })

  it('rejects two Slots in the same minute', () => {
    expect(parseNewEvent(poll({ slots: ['2026-10-30T20:30', '2026-10-30T20:30'] }), now)).toEqual({ ok: false, error: 'duplicate_slot' })
    expect(parseNewEvent(poll({ slots: ['2026-10-30T20:30', '2026-10-30T20:31'] }), now).ok).toBe(true)
  })
})

describe('parseAddedSlot', () => {
  const existing = [berlinToUtc('2026-10-30T20:30')]

  it('turns a future Berlin time into a UTC Slot', () => {
    expect(parseAddedSlot('2026-10-31T20:00', existing, now)).toEqual({ ok: true, startsAt: new Date('2026-10-31T19:00:00Z') })
  })

  it('applies the create rules: a real time, in the future, unique per minute', () => {
    expect(parseAddedSlot('2026-10-30 20:30', existing, now)).toEqual({ ok: false, error: 'invalid_time' })
    expect(parseAddedSlot(undefined, existing, now)).toEqual({ ok: false, error: 'invalid_time' })
    expect(parseAddedSlot('2026-10-22T12:00', existing, now)).toEqual({ ok: false, error: 'in_past' })
    expect(parseAddedSlot('2026-10-30T20:30', existing, now)).toEqual({ ok: false, error: 'duplicate_slot' })
    expect(parseAddedSlot('2026-10-30T20:31', existing, now).ok).toBe(true)
  })

  it('holds at most 16 Slots per Event', () => {
    const fifteen = slotsOnDays(15).map(local => berlinToUtc(local))
    const sixteen = slotsOnDays(16).map(local => berlinToUtc(local))
    expect(parseAddedSlot('2026-12-01T20:00', fifteen, now).ok).toBe(true)
    expect(parseAddedSlot('2026-12-01T20:00', sixteen, now)).toEqual({ ok: false, error: 'slots_max' })
  })

  it('does not reject a new Slot because an older Slot has become past', () => {
    const withPast = [berlinToUtc('2026-10-01T18:00'), ...existing]
    expect(parseAddedSlot('2026-11-01T20:00', withPast, now).ok).toBe(true)
  })
})

describe('slotsEditable', () => {
  it('lets the Host change Slots only in the poll phase', () => {
    expect(slotsEditable('poll')).toBe(true)
    for (const phase of ['draft', 'date_set', 'running', 'finished', 'archived'] as const) {
      expect(slotsEditable(phase)).toBe(false)
    }
  })
})
