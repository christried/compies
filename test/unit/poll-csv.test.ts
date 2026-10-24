import { describe, expect, it } from 'vitest'
import { buildPollCsv, type PollCsvInput } from '../../shared/poll-csv'

// The CSV a Member downloads from "Wer kann wann?" (#84): UTF-8 with BOM, semicolons, CRLF, and a
// formula guard so a Display name cannot run as a formula in Excel.

const labels = { name: 'Name', past: 'vorbei', yes: 'Ja', maybe: 'Meh', no: 'Nein' }

const input: PollCsvInput = {
  labels,
  people: [{ id: 'u1', name: 'Anna' }, { id: 'u2', name: 'Bo' }],
  slots: [
    { id: 's1', day: 'Sa 24.10.', time: '20:30', past: false },
    { id: 's2', day: 'So 25.10.', time: '19:00', past: true },
  ],
  votes: [
    { slotId: 's1', userId: 'u1', value: 'yes' },
    { slotId: 's2', userId: 'u1', value: 'no' },
    { slotId: 's1', userId: 'u2', value: 'maybe' },
  ],
}

function lines(csv: string): string[] {
  return csv.slice(1).split('\r\n').slice(0, -1)
}

describe('buildPollCsv', () => {
  it('starts with a UTF-8 byte order mark, uses semicolons and CRLF line ends', () => {
    const csv = buildPollCsv(input)

    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).not.toMatch(/[^\r]\n/)
    expect(lines(csv)[0]).toBe('Name;Sa 24.10. 20:30;So 25.10. 19:00 (vorbei)')
  })

  it('writes one row per Member in matrix order, with Ja, Meh, Nein or an empty cell', () => {
    expect(lines(buildPollCsv(input)).slice(1)).toEqual([
      'Anna;Ja;Nein',
      'Bo;Meh;',
    ])
  })

  it('quotes a field with a semicolon, a quote or a line break, doubling the quotes', () => {
    const csv = buildPollCsv({
      ...input,
      people: [{ id: 'u1', name: 'Mo; "Der"\nKönig' }],
      votes: [],
    })

    expect(lines(csv)[1]).toBe('"Mo; ""Der""\nKönig";;')
  })

  it('gives a field that starts like a formula a leading apostrophe', () => {
    const csv = buildPollCsv({
      ...input,
      people: [{ id: 'a', name: '=SUM(1)' }, { id: 'b', name: '+1' }, { id: 'c', name: '-2' }, { id: 'd', name: '@x' }, { id: 'e', name: '\tTab' }, { id: 'f', name: '\rCR' }],
      votes: [],
    })

    expect(csv).toContain(`'=SUM(1);`)
    expect(csv).toContain(`'+1;`)
    expect(csv).toContain(`'-2;`)
    expect(csv).toContain(`'@x;`)
    expect(csv).toContain(`'\tTab;`)
    expect(csv).toContain(`"'\rCR";`)
  })

  it('leaves an ordinary name with umlauts as it is', () => {
    const csv = buildPollCsv({ ...input, people: [{ id: 'u', name: 'Jörg Müller' }], votes: [] })

    expect(lines(csv)[1]).toBe('Jörg Müller;;')
  })
})
