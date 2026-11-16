import { describe, expect, it } from 'vitest'
import { findCandidates, flatten, lineOf, measureCandidates, readKeys, rowsFrom, summaryOf } from '../../scripts/wording/read-keys.mjs'
import { tagKey } from '~~/shared/key-tag'

// What the wording command prints about a page (scripts/wording/read-keys.mjs, #627): rows from the tags the page carries, the line of
// each, and the counts of the last line. The page reading itself (the TreeWalker and the Range) is measured in the browser, not here.
const messages = flatten({ auth: { title: 'Anmelden', intro: 'Zeig uns, wer du bist.' }, board: { slotsFree: '{n} Platz frei | {n} Plätze frei' } })
const BOX = { x: 10, y: 20.4, width: 100.6, height: 30 }

type Kind = 'text' | 'aria-label' | 'title' | 'alt' | 'placeholder'
type Row = { key: string, text: string, kind: Kind, element: string, box: typeof BOX | null, partial: boolean }
const row = (fields: Partial<Row>): Row => ({ key: 'auth.title', text: 'Anmelden', kind: 'text' as const, element: 'h1', box: BOX, partial: false, ...fields })

describe('rowsFrom', () => {
  it('gives one row per tag with its key, its visible text and its box', () => {
    const candidates = [{ i: 0, kind: 'text' as const, element: 'h1', raw: tagKey('auth.title', 'Anmelden') }]

    expect(rowsFrom(candidates, [[BOX]])).toEqual([row({})])
  })

  it('reads a text that code joined as several rows, each with its own box', () => {
    const second = { ...BOX, x: 120 }
    const candidates = [{ i: 0, kind: 'text' as const, element: 'p', raw: `${tagKey('auth.title', 'Anmelden')}, ${tagKey('auth.intro', 'Zeig uns, wer du bist.')}` }]

    const rows = rowsFrom(candidates, [[BOX, second]])

    expect(rows.map((r: Row) => [r.key, r.text, r.box])).toEqual([['auth.title', 'Anmelden', BOX], ['auth.intro', 'Zeig uns, wer du bist.', second]])
  })

  it('an attribute row takes the element\'s box', () => {
    const candidates = [{ i: 0, kind: 'aria-label' as const, element: 'button#close', raw: tagKey('auth.title', 'Anmelden') }]

    expect(rowsFrom(candidates, [[BOX]])[0]).toMatchObject({ kind: 'aria-label' as const, element: 'button#close', box: BOX })
  })

  it('a row whose box is missing or null is not painted, and none is dropped', () => {
    const candidates = [
      { i: 0, kind: 'text' as const, element: 'p', raw: tagKey('auth.title', 'Anmelden') },
      { i: 1, kind: 'text' as const, element: 'p', raw: tagKey('auth.intro', 'Zeig uns, wer du bist.') },
    ]

    const rows = rowsFrom(candidates, [[null]])

    expect(rows).toHaveLength(2)
    expect(rows.map((r: Row) => r.box)).toEqual([null, null])
  })

  it('keeps a partial tag as a partial row', () => {
    const raw = tagKey('auth.intro', 'Absatz eins\n\nAbsatz zwei')
    const candidates = [{ i: 0, kind: 'text' as const, element: 'p', raw: raw.slice(0, raw.indexOf('\n\n')) }]

    expect(rowsFrom(candidates, [[BOX]])[0]).toMatchObject({ key: 'auth.intro', text: 'Absatz eins', partial: true })
  })
})

describe('lineOf', () => {
  it('prints key, kind, element, box and the text of a verbatim message', () => {
    expect(lineOf(row({}), messages)).toBe('auth.title  text  <h1>  10,20 101x30  "Anmelden"')
  })

  it('does not print an interpolated text, which can carry a name', () => {
    const line = lineOf(row({ key: 'board.slotsFree', text: '2 Plätze frei' }), messages)

    expect(line).toContain('‹eingesetzt›')
    expect(line).not.toContain('2 Plätze frei')
  })

  it('says not painted for a row without a box', () => {
    expect(lineOf(row({ box: null }), messages)).toBe('auth.title  text  <h1>  not painted  "Anmelden"')
  })

  it('does not print a text under a key the messages do not have', () => {
    expect(lineOf(row({ key: 'gone.key', text: 'Etwas' }), messages)).toContain('‹eingesetzt›')
  })

  it('marks a partial row', () => {
    expect(lineOf(row({ partial: true }), messages)).toMatch(/\[partial\]$/)
  })
})

describe('summaryOf', () => {
  it('counts rows, distinct keys, keys missing from the messages, untagged text nodes and partial rows', () => {
    const rows = [row({}), row({ element: 'a' }), row({ key: 'gone.key' }), row({ key: 'auth.intro', partial: true })]

    expect(summaryOf(rows, messages, 7)).toEqual({ rows: 4, keys: 3, missing: 1, untagged: 7, partial: 1 })
  })
})

describe('flatten', () => {
  it('names each leaf of the messages by its dotted path', () => {
    expect(messages['auth.title']).toBe('Anmelden')
    expect(Object.keys(messages)).toEqual(['auth.title', 'auth.intro', 'board.slotsFree'])
  })
})

// `readKeys` is the two steps the walk uses on their own (#629): find the candidates, measure them; over a stub tab it still gives `rowsFrom`'s rows.
describe('readKeys', () => {
  const candidates = [{ i: 0, kind: 'text' as const, element: 'h1', raw: tagKey('auth.title', 'Anmelden') }]
  const stub = () => ({ tab: { evaluate: async (expression: string) => (expression.includes('createTreeWalker') ? { candidates, untagged: 3 } : [[BOX]]) } })

  it('returns the rows rowsFrom makes of what the page gave, and the untagged count', async () => {
    const { tab } = stub()

    expect(await readKeys(tab)).toEqual({ rows: rowsFrom(candidates, [[BOX]]), untagged: 3 })
  })

  it('is findCandidates then measureCandidates', async () => {
    const { tab } = stub()
    const found = await findCandidates(tab)

    expect(found).toEqual({ candidates, untagged: 3 })
    expect(await measureCandidates(tab, found.candidates)).toEqual([[BOX]])
  })

  it('measures nothing on a page without a candidate', async () => {
    const tab = { evaluate: async () => ({ candidates: [], untagged: 5 }) }

    expect(await measureCandidates(tab, [])).toEqual([])
    expect(await readKeys(tab)).toEqual({ rows: [], untagged: 5 })
  })
})
