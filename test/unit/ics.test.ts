import { describe, expect, it } from 'vitest'
import { buildIcs, sessionEntries, type CalendarCopy, type IcsEntry } from '../../server/domain/ics'
import { SESSION_DURATION_MS } from '../../shared/event'
import { berlinToUtc } from '../../shared/time'

// The .ics a Member downloads (#1 § Domain rules, #53): one entry per Session with a Date, stable UID,
// SEQUENCE from the Session's icsSequence, UTC times, 7 h long, a display alarm one hour before. Lines are
// CRLF and folded at 75 octets (RFC 5545).

const now = new Date('2026-10-22T09:00:00.000Z')

const base: IcsEntry = {
  uid: '3f2a9c1e-0000-4000-8000-000000000001@compies',
  sequence: 0,
  startsAt: new Date('2026-10-24T18:00:00.000Z'),
  summary: 'Freitags-Zocken (Compies)',
  description: 'Zum Event: https://compies.example/e/freitags-zocken-k7q2',
  alarm: 'Freitags-Zocken startet in 1 Stunde',
  url: 'https://compies.example/e/freitags-zocken-k7q2',
}

const copy: CalendarCopy = {
  summary: '{event} (Compies)',
  sessionSummary: '{event} · Session {n} (Compies)',
  description: 'Zum Event: {url}',
  alarm: '{event} startet in 1 Stunde',
}

/** The file with folded lines joined again, one entry per property line. */
function unfolded(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n')
}

describe('buildIcs', () => {
  it('is a VCALENDAR with CRLF line endings', () => {
    const ics = buildIcs([base], now)

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
  })

  it('writes one VEVENT per entry, in the order given', () => {
    const second: IcsEntry = { ...base, uid: 'second@compies', startsAt: new Date('2026-10-31T18:00:00.000Z') }
    const lines = unfolded(buildIcs([base, second], now))

    expect(lines.filter(line => line === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(lines.indexOf(`UID:${base.uid}`)).toBeLessThan(lines.indexOf('UID:second@compies'))
  })

  it('writes a file with no VEVENT when there are no entries', () => {
    expect(unfolded(buildIcs([], now))).not.toContain('BEGIN:VEVENT')
  })

  it('uses the stable UID and the Session sequence', () => {
    const lines = unfolded(buildIcs([{ ...base, sequence: 3 }], now))

    expect(lines).toContain('UID:3f2a9c1e-0000-4000-8000-000000000001@compies')
    expect(lines).toContain('SEQUENCE:3')
  })

  it('writes DTSTART in UTC and a DTEND seven hours later', () => {
    const lines = unfolded(buildIcs([base], now))

    expect(lines).toContain('DTSTART:20261024T180000Z')
    expect(lines).toContain('DTEND:20261025T010000Z')
    expect(SESSION_DURATION_MS).toBe(7 * 60 * 60_000)
  })

  it('stamps the file with the moment it was made, in UTC', () => {
    expect(unfolded(buildIcs([base], now))).toContain('DTSTAMP:20261022T090000Z')
  })

  it('adds a display alarm one hour before the start', () => {
    const lines = unfolded(buildIcs([base], now))
    const alarm = lines.slice(lines.indexOf('BEGIN:VALARM'), lines.indexOf('END:VALARM') + 1)

    expect(alarm).toEqual([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Freitags-Zocken startet in 1 Stunde',
      'TRIGGER:-PT1H',
      'END:VALARM',
    ])
  })

  it('carries the summary, the Event link and the description', () => {
    const lines = unfolded(buildIcs([base], now))

    expect(lines).toContain('SUMMARY:Freitags-Zocken (Compies)')
    expect(lines).toContain('URL:https://compies.example/e/freitags-zocken-k7q2')
    expect(lines).toContain('DESCRIPTION:Zum Event: https://compies.example/e/freitags-zocken-k7q2')
  })

  it('escapes commas, semicolons and backslashes in text values', () => {
    const lines = unfolded(buildIcs([{ ...base, summary: 'Essen, Trinken; Spiele\\Abend' }], now))

    expect(lines).toContain('SUMMARY:Essen\\, Trinken\\; Spiele\\\\Abend')
  })

  it('folds long lines at 75 octets without splitting a multi-byte character', () => {
    const name = 'Ä'.repeat(60)
    const ics = buildIcs([{ ...base, summary: name }], now)

    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
    expect(unfolded(ics)).toContain(`SUMMARY:${name}`)
  })
})

describe('sessionEntries', () => {
  const at = (local: string) => berlinToUtc(local)
  const input = (sessions: { id: string, startsAt: Date | null, startedAt?: Date | null, icsSequence?: number }[]) => ({
    eventName: 'Freitags-Zocken',
    url: 'https://compies.example/e/freitags-zocken-k7q2',
    sessions: sessions.map(session => ({ icsSequence: 0, startedAt: null, ...session })),
    copy,
  })

  it('gives a single Session the plain title, with no number', () => {
    const [entry] = sessionEntries(input([{ id: 'a', startsAt: at('2026-11-07T20:00') }]))

    expect(entry).toEqual({
      uid: 'a@compies',
      sequence: 0,
      startsAt: at('2026-11-07T20:00'),
      summary: 'Freitags-Zocken (Compies)',
      description: 'Zum Event: https://compies.example/e/freitags-zocken-k7q2',
      alarm: 'Freitags-Zocken startet in 1 Stunde',
      url: 'https://compies.example/e/freitags-zocken-k7q2',
    })
  })

  it('gives one entry per dated Session, in Date order, with the Session number in the title', () => {
    const entries = sessionEntries(input([
      { id: 'b', startsAt: at('2026-11-08T20:00'), icsSequence: 2 },
      { id: 'a', startsAt: at('2026-11-07T20:00') },
    ]))

    expect(entries.map(entry => [entry.uid, entry.summary, entry.sequence])).toEqual([
      ['a@compies', 'Freitags-Zocken · Session 1 (Compies)', 0],
      ['b@compies', 'Freitags-Zocken · Session 2 (Compies)', 2],
    ])
  })

  it('leaves undated Sessions out, and numbers the dated one among the Event’s Sessions', () => {
    const entries = sessionEntries(input([
      { id: 'a', startsAt: null },
      { id: 'b', startsAt: at('2026-11-08T20:00') },
    ]))

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ uid: 'b@compies', summary: 'Freitags-Zocken · Session 1 (Compies)' })
  })

  it('gives no entries when no Session has a Date', () => {
    expect(sessionEntries(input([{ id: 'a', startsAt: null }]))).toEqual([])
  })
})
