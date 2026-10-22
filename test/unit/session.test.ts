import { describe, expect, it } from 'vitest'
import { parseAddedSlot, parseNewSession, slotsEditable } from '../../server/domain/session'
import { berlinToUtc } from '../../shared/time'

// Thursday 22 Oct 2026, 12:00 in Berlin (CEST). Times below are Berlin wall-clock values.
const now = new Date('2026-10-22T10:00:00Z')

function poll(overrides: Record<string, unknown> = {}) {
  return { name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2026-10-30T20:30'], ...overrides }
}

function slotsOnDays(count: number) {
  return Array.from({ length: count }, (_, day) => `2026-11-${String(day + 1).padStart(2, '0')}T20:00`)
}

describe('parseNewSession', () => {
  it('turns a poll into a trimmed name and UTC Slots (Europe/Berlin, CET after the change)', () => {
    const result = parseNewSession(poll({ name: ' Freitags-Zocken ', slots: ['2026-10-30T20:30', '2026-10-31T19:00'] }), now)

    expect(result).toEqual({
      ok: true,
      session: {
        dateMode: 'poll',
        name: 'Freitags-Zocken',
        slots: [new Date('2026-10-30T19:30:00Z'), new Date('2026-10-31T18:00:00Z')],
      },
    })
  })

  it('turns a direct Date into a UTC instant', () => {
    const result = parseNewSession({ name: 'Abend', dateMode: 'direct', startsAt: '2026-11-07T20:00' }, now)

    expect(result).toEqual({
      ok: true,
      session: { dateMode: 'direct', name: 'Abend', startsAt: new Date('2026-11-07T19:00:00Z') },
    })
  })

  it('counts the name in characters, 1 to 60, emoji as one', () => {
    expect(parseNewSession(poll({ name: 'x'.repeat(60) }), now).ok).toBe(true)
    expect(parseNewSession(poll({ name: '🎮'.repeat(60) }), now).ok).toBe(true)
    expect(parseNewSession(poll({ name: 'x'.repeat(61) }), now)).toEqual({ ok: false, error: 'invalid_name' })
    expect(parseNewSession(poll({ name: '   ' }), now)).toEqual({ ok: false, error: 'invalid_name' })
    expect(parseNewSession(poll({ name: 42 }), now)).toEqual({ ok: false, error: 'invalid_name' })
  })

  it('accepts only the two date modes', () => {
    expect(parseNewSession(poll({ dateMode: 'weekly' }), now)).toEqual({ ok: false, error: 'invalid_mode' })
    expect(parseNewSession({ name: 'Abend' }, now)).toEqual({ ok: false, error: 'invalid_mode' })
  })

  it('takes 1 to 8 Slots in poll mode', () => {
    expect(parseNewSession(poll({ slots: [] }), now)).toEqual({ ok: false, error: 'invalid_slots' })
    expect(parseNewSession(poll({ slots: undefined }), now)).toEqual({ ok: false, error: 'invalid_slots' })
    expect(parseNewSession(poll({ slots: slotsOnDays(9) }), now)).toEqual({ ok: false, error: 'invalid_slots' })
    expect(parseNewSession(poll({ slots: slotsOnDays(8) }), now).ok).toBe(true)
  })

  it('rejects a time that is not a real Berlin wall-clock time', () => {
    for (const slot of ['2026-10-30 20:30', '2026-10-30T25:00', '2026-02-30T10:00', '2026-03-29T02:30', 42]) {
      expect(parseNewSession(poll({ slots: [slot] }), now)).toEqual({ ok: false, error: 'invalid_time' })
    }
  })

  it('rejects a Slot in the past or right now', () => {
    expect(parseNewSession(poll({ slots: ['2026-10-22T11:00'] }), now)).toEqual({ ok: false, error: 'in_past' })
    expect(parseNewSession(poll({ slots: ['2026-10-22T12:00'] }), now)).toEqual({ ok: false, error: 'in_past' })
    expect(parseNewSession(poll({ slots: ['2026-10-22T12:01'] }), now).ok).toBe(true)
  })

  it('rejects a direct Date in the past', () => {
    expect(parseNewSession({ name: 'Abend', dateMode: 'direct', startsAt: '2026-10-01T20:00' }, now)).toEqual({ ok: false, error: 'in_past' })
  })

  it('rejects two Slots in the same minute', () => {
    expect(parseNewSession(poll({ slots: ['2026-10-30T20:30', '2026-10-30T20:30'] }), now)).toEqual({ ok: false, error: 'duplicate_slot' })
    expect(parseNewSession(poll({ slots: ['2026-10-30T20:30', '2026-10-30T20:31'] }), now).ok).toBe(true)
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

  it('holds at most 8 Slots per Session', () => {
    const seven = slotsOnDays(7).map(local => berlinToUtc(local))
    const eight = slotsOnDays(8).map(local => berlinToUtc(local))
    expect(parseAddedSlot('2026-12-01T20:00', seven, now).ok).toBe(true)
    expect(parseAddedSlot('2026-12-01T20:00', eight, now)).toEqual({ ok: false, error: 'slots_max' })
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
