import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The two generated cue files keep their cues sorted by id, so tickets that add different cue groups write different
// places of the file. In CUE_IDS order every new group landed at the end, and in 0.17 the files conflicted at every
// merge of three tickets, each resolved by hand as „keep both“ (#833).
const FILES = ['public/sounds/cues/credits.json', 'sound-candidates/manifest.json']

describe('the generated cue files', () => {
  it.each(FILES)('%s lists its cues sorted by id', (file) => {
    const ids = Object.keys((JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')) as { cues: Record<string, unknown> }).cues)
    expect(ids).toEqual([...ids].sort())
  })
})
