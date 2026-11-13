import { describe, expect, it } from 'vitest'
import { CUE_CREDITS_URL, isText, parseCredits } from '../../app/utils/sound-credits'
import { CUE_IDS } from '../../app/utils/sound-cues'

// The shape of the credits file beside the shipped cue sounds (#536): what the parser accepts, and the German problem line for each way an
// entry can be wrong. The committed file itself is pinned in sound-files.test.ts.

const entry = (fields: Record<string, unknown> = {}) => ({ candidate: 'holz-ratsche', source: 'scripts/make-cue-candidates.mjs, Rezept holz-ratsche', author: null, licence: 'generated', ...fields })
const everyCue = () => Object.fromEntries(CUE_IDS.map(id => [id, entry()]))
const withCue = (id: string, value: unknown) => ({ cues: { ...everyCue(), [id]: value } })
const withoutCue = (id: string) => ({ cues: Object.fromEntries(Object.entries(everyCue()).filter(([key]) => key !== id)) })

describe('parseCredits', () => {
  it('reads eleven valid entries without a problem', () => {
    const { credits, problems } = parseCredits({ cues: everyCue() })

    expect(problems).toEqual([])
    expect(Object.keys(credits)).toEqual([...CUE_IDS])
    expect(credits['wheel-stop']).toEqual(entry())
  })

  it('takes CC0 with an author name', () => {
    const { credits, problems } = parseCredits(withCue('wheel-tick', entry({ licence: 'CC0', author: 'Ada' })))

    expect(problems).toEqual([])
    expect(credits['wheel-tick']).toMatchObject({ licence: 'CC0', author: 'Ada' })
  })

  it.each([
    ['an entry that is missing', 'wheel-stop', withoutCue('wheel-stop')],
    ['a licence that needs a credit', 'wheel-stop', withCue('wheel-stop', entry({ licence: 'CC-BY' }))],
    ['a licence in the wrong case', 'wheel-stop', withCue('wheel-stop', entry({ licence: 'cc0' }))],
    ['no source', 'wheel-stop', withCue('wheel-stop', entry({ source: undefined }))],
    ['an empty candidate', 'wheel-stop', withCue('wheel-stop', entry({ candidate: ' ' }))],
    ['an author that is a number', 'wheel-stop', withCue('wheel-stop', entry({ author: 3 }))],
    ['an empty author', 'wheel-stop', withCue('wheel-stop', entry({ author: '' }))],
    ['a key beyond the four', 'wheel-stop', withCue('wheel-stop', entry({ note: 'x' }))],
    ['an entry that is no object', 'wheel-stop', withCue('wheel-stop', 'x')],
    ['a cue id that does not exist', 'wheel-boom', withCue('wheel-boom', entry())],
  ])('names the cue and leaves the entry out for %s', (_what, id, raw) => {
    const { credits, problems } = parseCredits(raw)

    expect(problems.filter(problem => problem.includes(id))).toHaveLength(1)
    expect(Object.keys(credits)).not.toContain(id)
    // The other ten are untouched.
    expect(Object.keys(credits).length).toBe(id === 'wheel-boom' ? 11 : 10)
  })

  it.each([null, 'x', 3, [], { cues: 'x' }, { cues: null }, { cues: [] }])('never throws on %j: a problem and no credit', (raw) => {
    const { credits, problems } = parseCredits(raw)

    expect(problems.length).toBeGreaterThan(0)
    expect(credits).toEqual({})
  })

  it('is served from the cue folder', () => {
    expect(CUE_CREDITS_URL).toBe('/sounds/cues/credits.json')
  })

  it('takes a text guard that rejects what is no text (#594)', () => {
    expect(isText('x')).toBe(true)
    for (const value of ['', '  ', null, 3]) expect(isText(value)).toBe(false)
  })
})
