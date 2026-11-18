import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUE_BRIEF, MOMENT_LABEL, MOMENT_OF, MOMENT_SETUP } from '../../app/dev/listening-model'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { CUE_GROUPS, CUE_IDS, CUE_VOLUME } from '../../app/utils/sound-cues'

// A new cue is one row in each table keyed by cue id (#740). Sorted key sets, so the order tickets add rows in does not matter: a row
// missing from a table, or left over for an id that is gone, fails here (and the missing one fails typecheck first).

const sorted = (keys: readonly string[]) => [...keys].sort()
const ids = sorted(CUE_IDS)

describe('the tables keyed by cue id', () => {
  it.each([
    ['CUE_VOLUME', CUE_VOLUME],
    ['CUE_GROUPS', CUE_GROUPS],
    ['CUE_LENGTHS', CUE_LENGTHS],
    ['CUE_BRIEF', CUE_BRIEF],
    ['MOMENT_OF', MOMENT_OF],
  ])('%s has exactly one row per cue id', (_name, table) => {
    expect(sorted(Object.keys(table))).toEqual(ids)
  })

  it('has no repeated cue id', () => {
    expect(new Set(CUE_IDS).size).toBe(CUE_IDS.length)
  })

  it('gives every cue at least one group', () => {
    for (const id of CUE_IDS) expect(CUE_GROUPS[id].length, id).toBeGreaterThan(0)
  })

  it('gives every moment a label, and a setup only to a cue', () => {
    for (const id of CUE_IDS) expect(MOMENT_LABEL[MOMENT_OF[id]], id).toBeTruthy()
    for (const id of Object.keys(MOMENT_SETUP)) expect(ids, id).toContain(id)
  })
})

// The two plain-Node scripts cannot import sound-cues.ts (aliases) and read the ids from its text with this regex: a comment or a
// row in the array that breaks it would break them silently.
describe('CUE_IDS as the scripts read it', () => {
  it('gives exactly the ids, with the regex of make-cue-candidates.mjs and ship-cue-sound.mjs', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../app/utils/sound-cues.ts'), 'utf8')
    const read = [...text.match(/export const CUE_IDS = \[([^\]]*)\]/)![1]!.matchAll(/'([a-z-]+)'/g)].map(match => match[1])

    expect(read).toEqual([...CUE_IDS])
  })
})
