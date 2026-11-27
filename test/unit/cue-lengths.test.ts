import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { CUE_IDS } from '../../app/utils/sound-cues'

// The one table of the cues' lengths (#740) that the file test reads, held against
// `compibert-sound.md`: a row the document has cleanly (the cue id alone in its cell) must say the same, and a row flagged `docRow: false`
// must be one the document does not have cleanly, so the flag cannot lie either way.

const doc = readFileSync(resolve(import.meta.dirname, '../../docs/design_handoff_compies/reference/docs/compibert-sound.md'), 'utf8')
const rows = doc.split('\n').map(line => line.split('|').map(cell => cell.trim()))

/** The Length cell of the row whose Cue-id cell is exactly `<id>`, as `{ ms, loop }`; undefined when the document has no such row. */
function docLengthOf(id: string) {
  const row = rows.find(cells => cells.includes(`\`${id}\``))
  if (!row) return undefined
  const [, amount, unit, loop] = /^([\d.]+) (ms|s)( loop)?$/.exec(row[row.indexOf(`\`${id}\``) + 2]!) ?? []
  return { ms: Math.round(Number(amount) * (unit === 's' ? 1000 : 1)), loop: loop !== undefined }
}

describe('CUE_LENGTHS', () => {
  it.each(CUE_IDS)('%s agrees with the document when it has a clean row, and only then', (id) => {
    const fromDoc = docLengthOf(id)

    if (CUE_LENGTHS[id].docRow) expect(fromDoc, 'the document has a clean row').toEqual({ ms: CUE_LENGTHS[id].ms, loop: CUE_LENGTHS[id].loop })
    else expect(fromDoc, 'the document has no clean row').toBeUndefined()
  })
})
