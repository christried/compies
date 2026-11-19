import { describe, expect, it } from 'vitest'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { CUE_GROUPS, CUE_VOLUME, ceremonyCuePlan, cueFilesOf } from '../../app/utils/sound-cues'
import { ceremonyTimeline, type CeremonyGag, type RunShape } from '../../shared/ceremony'

// Compibert's laugh in the Award ceremony (#746, spec #718): `cb-laugh` sounds at `getUpAtMs`, the instant the rig turns to `laugh`, for one Winner and for
// every shape of a Tie. It is a voice cue inside the ceremony's plan, so it is requested with the ceremony's group and nothing else.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const shape = (partyCount: number, gag: CeremonyGag = 'trip', fields: Partial<RunShape> = {}): RunShape => ({ partyCount, winners: 1, gag, grid: false, ...fields })
const plan = (runShape: RunShape, reducedMotion = false) => ceremonyCuePlan({ startsAt: START, shape: runShape, reducedMotion })
const laughs = (runShape: RunShape) => plan(runShape).filter(cue => cue.id === 'cb-laugh')

const GAGS: CeremonyGag[] = ['trip', 'bonk']
const TIES: [parties: number, winners: number, grid: boolean][] = [[4, 2, false], [5, 3, false], [5, 3, true], [8, 4, true], [4, 4, true]]

describe('the laugh of the Award ceremony', () => {
  it.each(GAGS.flatMap(gag => [2, 4].map(parties => [parties, gag] as const)))('is the laugh at getUpAtMs, after the stamp, for one Winner of %i Parties, the %s', (parties, gag) => {
    const runShape = shape(parties, gag)
    const m = ceremonyTimeline(runShape)

    expect(laughs(runShape)).toEqual([{ id: 'cb-laugh', at: START + m.getUpAtMs }])
    expect(plan(runShape).at(-1)).toEqual({ id: 'cb-laugh', at: START + m.getUpAtMs })
  })

  it.each(GAGS)('is after the stamp, the fanfare and the crowd, the %s', (gag) => {
    const runShape = shape(4, gag)
    const m = ceremonyTimeline(runShape)
    const cues = plan(runShape)

    expect(m.getUpAtMs - m.stampAtMs).toBeGreaterThan(0)
    expect(cues.find(cue => cue.id === 'cb-laugh')!.at).toBeGreaterThan(cues.find(cue => cue.id === 'cer-crowd')!.at)
    expect(cues.find(cue => cue.id === 'cb-laugh')!.at).toBeGreaterThan(cues.find(cue => cue.id === 'cer-fanfare')!.at)
  })

  it.each(GAGS.flatMap(gag => TIES.map(([parties, winners, grid]) => [parties, winners, grid, gag] as const)))(
    'is the laugh at getUpAtMs, last, for %i Parties and %i Winners (grid %s), the %s',
    (parties, winners, grid, gag) => {
      const runShape = shape(parties, gag, { winners, grid })
      const m = ceremonyTimeline(runShape)

      expect(laughs(runShape)).toEqual([{ id: 'cb-laugh', at: START + m.getUpAtMs }])
      expect(plan(runShape).at(-1)!.id).toBe('cb-laugh')
    },
  )

  it('is earlier in the grid of 3 Winners than in the chain, by the difference of the two plates', () => {
    const chain = ceremonyTimeline(shape(5, 'trip', { winners: 3, grid: false }))
    const grid = ceremonyTimeline(shape(5, 'trip', { winners: 3, grid: true }))

    expect(grid.plateAtMs).toBeLessThan(chain.plateAtMs)
    expect(laughs(shape(5, 'trip', { winners: 3, grid: false }))[0]!.at - laughs(shape(5, 'trip', { winners: 3, grid: true }))[0]!.at).toBe(chain.plateAtMs - grid.plateAtMs)
  })

  it.each([[1], [2]])('is not in the plan under reduced motion, which is the fanfare alone (%i Winners)', (winners) => {
    expect(plan(shape(4, 'trip', { winners }), true).map(cue => cue.id)).toEqual(['cer-fanfare'])
  })

  it('is requested with the ceremony\'s group only', () => {
    expect(CUE_GROUPS['cb-laugh']).toEqual(['ceremony'])
    expect(cueFilesOf(['ceremony'])).toContain('cb-laugh')
    expect(cueFilesOf(['wheel', 'veto', 'coin', 'standings', 'tour'])).not.toContain('cb-laugh')
  })

  it('has the Vol and the length of the spec\'s table, pinned here since it has no document row', () => {
    expect(CUE_VOLUME['cb-laugh']).toBe(40)
    expect(CUE_LENGTHS['cb-laugh']).toEqual({ ms: 500, loop: false, docRow: false })
  })
})
