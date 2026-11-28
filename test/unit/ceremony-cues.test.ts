import { describe, expect, it } from 'vitest'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { CUE_GROUPS, ROW_STEP_SEMITONES, ceremonyCuePlan, cueFilesOf } from '../../app/utils/sound-cues'
import { CEREMONY_ROW_MS, CEREMONY_RUN_MS, CHIP_STEP_MS, GRID_FROM_WINNERS, ceremonyTimeline, type CeremonyGag, type RunShape } from '../../shared/ceremony'

// The Award ceremony's cue plan (#743, spec #718): which sound is due at which instant of the run, a pure function of the run's start, its shape on
// this screen and reduced motion. Every instant is the start plus a field of `ceremonyTimeline`, the function the GSAP tweens are built from (its own
// cases are in test/unit/ceremony.test.ts); the plan's instants equal the tweens' start times in test/nuxt/ceremony-run-tweens.test.ts. The laugh of
// #746 is a cue of this plan, so its cases are here too.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const shape = (partyCount: number, gag: CeremonyGag = 'trip', fields: Partial<RunShape> = {}): RunShape => ({ partyCount, winners: 1, gag, grid: false, ...fields })
const plan = (runShape: RunShape, reducedMotion = false) => ceremonyCuePlan({ startsAt: START, shape: runShape, reducedMotion })
const ids = (cues: readonly { id: string }[]) => cues.map(cue => cue.id)
/** The rate of the place `index` of the rows: the file's own pitch for the first, then the step the listening session may change (#748). */
const rateOf = (index: number) => 2 ** (index * ROW_STEP_SEMITONES / 12)

describe('ceremonyCuePlan', () => {
  it.each([[2, 1], [4, 3], [8, 7]])('has a row per place below for %i Parties: %i rows, each a step higher than the one before', (parties, rows) => {
    const cues = plan(shape(parties))

    const rowCues = cues.filter(cue => cue.id === 'cer-row')
    expect(rowCues).toHaveLength(rows)
    expect(rowCues.map(cue => cue.rate)).toEqual(Array.from({ length: rows }, (_, index) => rateOf(index)))
    expect(rowCues[0]!.rate).toBe(1)
  })

  it('is the drop at the start, the rows, the run and the trip, at the instants of the shared timeline', () => {
    const timeline = ceremonyTimeline(shape(4))

    expect(plan(shape(4))).toEqual([
      { id: 'cer-drop', at: START },
      { id: 'cer-row', at: START + timeline.rowAtMs[0]!, rate: rateOf(0) },
      { id: 'cer-row', at: START + timeline.rowAtMs[1]!, rate: rateOf(1) },
      { id: 'cer-row', at: START + timeline.rowAtMs[2]!, rate: rateOf(2) },
      { id: 'cer-run', at: START + timeline.runAtMs },
      { id: 'cer-trip', at: START + timeline.runEndAtMs },
      { id: 'cer-stamp', at: START + timeline.stampAtMs },
      { id: 'cer-fanfare', at: START + timeline.stampAtMs },
      { id: 'cer-crowd', at: START + timeline.stampAtMs },
      { id: 'cb-laugh', at: START + timeline.getUpAtMs },
    ])
  })

  it('ends with the bonk instead of the trip when the server picked the bonk, never both', () => {
    const timeline = ceremonyTimeline(shape(4, 'bonk'))
    const cues = plan(shape(4, 'bonk'))

    expect(ids(cues)).toEqual(['cer-drop', 'cer-row', 'cer-row', 'cer-row', 'cer-run', 'cer-bonk', 'cer-stamp', 'cer-fanfare', 'cer-crowd', 'cb-laugh'])
    expect(cues.find(cue => cue.id === 'cer-bonk')).toEqual({ id: 'cer-bonk', at: START + timeline.bonkAtMs })
    expect(cues.find(cue => cue.id === 'cer-stamp')).toEqual({ id: 'cer-stamp', at: START + timeline.stampAtMs })
    expect(ids(plan(shape(4, 'trip')))).not.toContain('cer-bonk')
  })

  it('has no row when the Winner is the only Party, and still drops, runs and trips', () => {
    expect(ids(plan(shape(1)))).toEqual(['cer-drop', 'cer-run', 'cer-trip', 'cer-stamp', 'cer-fanfare', 'cer-crowd', 'cb-laugh'])
  })

  it('is the same plan on a screen with another grid for one Winner (every device hears the same instants)', () => {
    expect(plan(shape(4, 'trip', { grid: true }))).toEqual(plan(shape(4, 'trip', { grid: false })))
  })

  it('drops nothing for being past: a plan far in the past is the whole plan', () => {
    expect(ceremonyCuePlan({ startsAt: 0, shape: shape(4), reducedMotion: false })).toHaveLength(10)
  })

  it('is the fanfare alone under reduced motion, at the start, for one Winner and for a Tie (the end frame shows at the start)', () => {
    expect(plan(shape(4), true)).toEqual([{ id: 'cer-fanfare', at: START }])
    expect(plan(shape(4, 'trip', { winners: 2 }), true)).toEqual([{ id: 'cer-fanfare', at: START }])
  })

  // A ceremony that ends a Tie sounds (#745): the same plan, the instants of `ceremonyTimeline` for its Winner count and its grid.
  it.each<CeremonyGag>(['trip', 'bonk'])('is the plan of the shared timeline for 2 Winners of 4 Parties, %s (a chain)', (gag) => {
    const timeline = ceremonyTimeline({ partyCount: 4, winners: 2, gag, grid: false })

    expect(plan(shape(4, gag, { winners: 2 }))).toEqual([
      { id: 'cer-drop', at: START },
      { id: 'cer-row', at: START + timeline.rowAtMs[0]!, rate: rateOf(0) },
      { id: 'cer-row', at: START + timeline.rowAtMs[1]!, rate: rateOf(1) },
      { id: 'cer-run', at: START + timeline.runAtMs },
      gag === 'trip' ? { id: 'cer-trip', at: START + timeline.runEndAtMs } : { id: 'cer-bonk', at: START + timeline.bonkAtMs },
      { id: 'cer-stamp', at: START + timeline.stampAtMs },
      { id: 'cer-fanfare', at: START + timeline.stampAtMs },
      { id: 'cer-crowd', at: START + timeline.stampAtMs },
      { id: 'cb-laugh', at: START + timeline.getUpAtMs },
    ])
  })

  it('lays 3 Winners out as a chain or a grid: the same cues, and only the stamp trio and the laugh differ, the grid\'s earlier', () => {
    const chain = plan(shape(5, 'trip', { winners: 3, grid: false }))
    const grid = plan(shape(5, 'trip', { winners: 3, grid: true }))
    const earlier = ceremonyTimeline({ partyCount: 5, winners: 3, gag: 'trip', grid: false }).plateAtMs - ceremonyTimeline({ partyCount: 5, winners: 3, gag: 'trip', grid: true }).plateAtMs
    const peak = ['cer-stamp', 'cer-fanfare', 'cer-crowd', 'cb-laugh']

    expect(ids(grid)).toEqual(ids(chain))
    expect(grid.filter(cue => !peak.includes(cue.id))).toEqual(chain.filter(cue => !peak.includes(cue.id)))
    expect(earlier).toBeGreaterThan(0)
    for (const id of peak) {
      expect(chain.find(cue => cue.id === id)!.at - grid.find(cue => cue.id === id)!.at, id).toBe(earlier)
    }
  })

  it('has two chips 200 ms apart, each a step higher, for 4 Winners of 6 Parties (a grid)', () => {
    const timeline = ceremonyTimeline({ partyCount: 6, winners: 4, gag: 'trip' })
    const rows = plan(shape(6, 'trip', { winners: 4, grid: true })).filter(cue => cue.id === 'cer-row')

    expect(rows.map(cue => cue.at)).toEqual(timeline.rowAtMs.map(ms => START + ms))
    expect(rows[1]!.at - rows[0]!.at).toBe(CHIP_STEP_MS)
    expect(rows.map(cue => cue.rate)).toEqual([rateOf(0), rateOf(1)])
  })

  it('has the rows 450 ms apart for 2 Winners and the chips 200 ms apart from 3', () => {
    const gaps = (winners: number, grid: boolean) => {
      const at = plan(shape(8, 'trip', { winners, grid })).filter(cue => cue.id === 'cer-row').map(cue => cue.at)
      return at.slice(1).map((value, index) => value - at[index]!)
    }

    expect(new Set(gaps(2, false))).toEqual(new Set([CEREMONY_ROW_MS]))
    expect(new Set(gaps(3, false))).toEqual(new Set([CHIP_STEP_MS]))
    expect(new Set(gaps(3, true))).toEqual(new Set([CHIP_STEP_MS]))
    expect(new Set(gaps(4, true))).toEqual(new Set([CHIP_STEP_MS]))
  })

  it('has no row when nobody finished below the Winners, and still drops, runs, trips and stamps', () => {
    const none = ['cer-drop', 'cer-run', 'cer-trip', 'cer-stamp', 'cer-fanfare', 'cer-crowd', 'cb-laugh']

    expect(ids(plan(shape(2, 'trip', { winners: 2 })))).toEqual(none)
    expect(ids(plan(shape(3, 'trip', { winners: 3 })))).toEqual(none)
    expect(ids(plan(shape(4, 'trip', { winners: 4, grid: true })))).toEqual(none)
  })

  it('has one row, at the file\'s own pitch, with one Party below', () => {
    expect(plan(shape(3, 'trip', { winners: 2 })).filter(cue => cue.id === 'cer-row')).toEqual([{ id: 'cer-row', at: START + 600, rate: 1 }])
  })

  it('is ascending by instant, with one stamp, fanfare and crowd and one gag cue, for every Party and Winner count, both gags and both grids', () => {
    for (const gag of ['trip', 'bonk'] as const) {
      for (let parties = 1; parties <= 8; parties++) {
        for (let winners = 1; winners <= parties; winners++) {
          for (const grid of [false, true]) {
            const cues = plan(shape(parties, gag, { winners, grid }))
            const label = `${parties} Parties, ${winners} Winners, ${gag}, grid ${grid}`
            const at = cues.map(cue => cue.at)
            expect(at, label).toEqual([...at].sort((a, b) => a - b))
            for (const id of ['cer-drop', 'cer-run', 'cer-stamp', 'cer-fanfare', 'cer-crowd']) expect(ids(cues).filter(each => each === id), `${label}: ${id}`).toHaveLength(1)
            expect(ids(cues).filter(id => id === 'cer-trip' || id === 'cer-bonk'), label).toEqual([gag === 'trip' ? 'cer-trip' : 'cer-bonk'])
          }
        }
      }
    }
  })

  it('is one plan on every screen where the layout is alike: 2 Winners are always a chain, 4 and more always a grid; only 3 differ', () => {
    // `ceremonyLayout` gives 2 Winners a chain and 4 and more a grid on every screen, so the `grid` a screen passes is the same there.
    for (const gag of ['trip', 'bonk'] as const) {
      expect(plan(shape(5, gag, { winners: 2, grid: false }))).toEqual(plan({ partyCount: 5, winners: 2, gag, grid: 2 >= GRID_FROM_WINNERS }))
      expect(plan(shape(6, gag, { winners: 4, grid: true }))).toEqual(plan({ partyCount: 6, winners: 4, gag, grid: 4 >= GRID_FROM_WINNERS }))
      expect(plan(shape(6, gag, { winners: 3, grid: true }))).not.toEqual(plan(shape(6, gag, { winners: 3, grid: false })))
    }
  })
})

// Compibert's laugh (#746, spec #718): `cb-laugh` sounds at `getUpAtMs`, the instant the rig turns to `laugh`, for one Winner and for every shape of a Tie.
describe('the laugh of the Award ceremony', () => {
  const GAGS: CeremonyGag[] = ['trip', 'bonk']
  const SHAPES: [parties: number, winners: number, grid: boolean][] = [[2, 1, false], [4, 1, false], [4, 2, false], [5, 3, false], [5, 3, true], [8, 4, true], [4, 4, true]]

  it.each(GAGS.flatMap(gag => SHAPES.map(([parties, winners, grid]) => [parties, winners, grid, gag] as const)))(
    'is the one laugh, at getUpAtMs, last and after the stamp, the fanfare and the crowd, for %i Parties and %i Winners (grid %s), the %s',
    (parties, winners, grid, gag) => {
      const runShape = shape(parties, gag, { winners, grid })
      const timeline = ceremonyTimeline(runShape)
      const cues = plan(runShape)

      expect(cues.filter(cue => cue.id === 'cb-laugh')).toEqual([{ id: 'cb-laugh', at: START + timeline.getUpAtMs }])
      expect(cues.at(-1)!.id).toBe('cb-laugh')
      expect(timeline.getUpAtMs - timeline.stampAtMs).toBeGreaterThan(0)
      for (const peak of ['cer-fanfare', 'cer-crowd']) expect(cues.find(cue => cue.id === 'cb-laugh')!.at, peak).toBeGreaterThan(cues.find(cue => cue.id === peak)!.at)
    },
  )
})

describe('the files of the ceremony', () => {
  it('include the eight of #743 and #744, in the order of the timeline', () => {
    expect(cueFilesOf(['ceremony'])).toEqual(expect.arrayContaining(['cer-drop', 'cer-row', 'cer-run', 'cer-trip', 'cer-bonk', 'cer-stamp', 'cer-fanfare', 'cer-crowd']))
    const files = cueFilesOf(['ceremony'])
    expect(files.indexOf('cer-drop')).toBeLessThan(files.indexOf('cer-row'))
    expect(files.indexOf('cer-run')).toBeLessThan(files.indexOf('cer-trip'))
  })

  it('include Compibert\'s laugh, which only this group requests (#746)', () => {
    expect(CUE_GROUPS['cb-laugh']).toEqual(['ceremony'])
    expect(cueFilesOf(['ceremony'])).toContain('cb-laugh')
    expect(cueFilesOf(['wheel', 'veto', 'coin', 'standings', 'tour'])).not.toContain('cb-laugh')
  })
})

describe('the tables of the ceremony\'s cues', () => {
  it('gives the run a file as long as the run is', () => {
    expect(CUE_LENGTHS['cer-run'].ms).toBe(CEREMONY_RUN_MS)
  })
})
