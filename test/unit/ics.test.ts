import { describe, expect, it } from 'vitest'
import { buildIcs, ICS_DURATION_MS } from '../../server/domain/ics'

// The .ics a Member downloads (#1 § Domain rules): stable UID, SEQUENCE from icsSequence, UTC times,
// 7 h long, a display alarm one hour before. Lines are CRLF and folded at 75 octets (RFC 5545).

const base = {
  uid: '3f2a9c1e-0000-4000-8000-000000000001@compies',
  sequence: 0,
  startsAt: new Date('2026-10-24T18:00:00.000Z'),
  now: new Date('2026-10-22T09:00:00.000Z'),
  summary: 'Freitags-Zocken (COMPIES)',
  description: 'Zur Event: https://compies.example/e/freitags-zocken-k7q2',
  alarm: 'Freitags-Zocken startet in 1 Stunde',
  url: 'https://compies.example/e/freitags-zocken-k7q2',
}

/** The file with folded lines joined again, one entry per property line. */
function unfolded(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n')
}

describe('buildIcs', () => {
  it('is one VEVENT in a VCALENDAR with CRLF line endings', () => {
    const ics = buildIcs(base)

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).not.toMatch(/[^\r]\n/)
  })

  it('uses the stable UID and the Event sequence', () => {
    const lines = unfolded(buildIcs({ ...base, sequence: 3 }))

    expect(lines).toContain('UID:3f2a9c1e-0000-4000-8000-000000000001@compies')
    expect(lines).toContain('SEQUENCE:3')
  })

  it('writes DTSTART in UTC and a DTEND seven hours later', () => {
    const lines = unfolded(buildIcs(base))

    expect(lines).toContain('DTSTART:20261024T180000Z')
    expect(lines).toContain('DTEND:20261025T010000Z')
    expect(ICS_DURATION_MS).toBe(7 * 60 * 60_000)
  })

  it('stamps the file with the moment it was made, in UTC', () => {
    expect(unfolded(buildIcs(base))).toContain('DTSTAMP:20261022T090000Z')
  })

  it('adds a display alarm one hour before the start', () => {
    const lines = unfolded(buildIcs(base))
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
    const lines = unfolded(buildIcs(base))

    expect(lines).toContain('SUMMARY:Freitags-Zocken (COMPIES)')
    expect(lines).toContain('URL:https://compies.example/e/freitags-zocken-k7q2')
    expect(lines).toContain('DESCRIPTION:Zur Event: https://compies.example/e/freitags-zocken-k7q2')
  })

  it('escapes commas, semicolons and backslashes in text values', () => {
    const lines = unfolded(buildIcs({ ...base, summary: 'Essen, Trinken; Spiele\\Abend' }))

    expect(lines).toContain('SUMMARY:Essen\\, Trinken\\; Spiele\\\\Abend')
  })

  it('folds long lines at 75 octets without splitting a multi-byte character', () => {
    const name = 'Ä'.repeat(60)
    const ics = buildIcs({ ...base, summary: name })

    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
    expect(unfolded(ics)).toContain(`SUMMARY:${name}`)
  })
})
