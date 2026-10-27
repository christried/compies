import type { VoteRow, VoteValue } from './poll'

// The "Wer kann wann?" matrix as CSV (#84). Pure: the caller passes what the matrix already shows and
// the translated labels. German Excel reads it on a double-click: BOM, semicolons, CRLF.

export interface PollCsvInput {
  labels: { name: string, past: string, yes: string, maybe: string, no: string }
  people: { id: string, name: string }[]
  slots: { id: string, day: string, time: string, past: boolean }[]
  votes: (Omit<VoteRow, 'note'> & { note?: VoteRow['note'] })[]
}

const BOM = String.fromCharCode(0xFEFF)
const VOTE_KEY: Record<VoteValue, keyof PollCsvInput['labels']> = { yes: 'yes', maybe: 'maybe', no: 'no' }

// A field that Excel would read as a formula gets an apostrophe, so it stays text.
const FORMULA_START = /^[=+\-@\t\r]/

function field(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** „Wer kann wann?“ as a CSV for German Excel: one row per person, one column per Slot, a Note after its label. */
export function buildPollCsv(input: PollCsvInput): string {
  const { labels } = input
  const voteOf = new Map(input.votes.map(vote => [`${vote.userId}|${vote.slotId}`, vote]))

  const header = [
    labels.name,
    ...input.slots.map(slot => `${slot.day} ${slot.time}${slot.past ? ` (${labels.past})` : ''}`),
  ]
  const rows = input.people.map((person) => {
    const cells = input.slots.map((slot) => {
      const vote = voteOf.get(`${person.id}|${slot.id}`)
      if (!vote) return ''
      const label = labels[VOTE_KEY[vote.value]]
      // A Note follows its label (#102), so a Note starting with = is not a formula.
      return vote.note ? `${label}: ${vote.note}` : label
    })
    return [person.name, ...cells]
  })

  return BOM + [header, ...rows].map(row => `${row.map(field).join(';')}\r\n`).join('')
}
