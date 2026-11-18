import { describe, expect, it } from 'vitest'
import { ceremonyRun, LEAD_MS } from '../../app/dev/listening-model'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { CUE_VOLUME, ceremonyCuePlan, cueFilesOf, reachableGroups, type GroupInput } from '../../app/utils/sound-cues'
import { CEREMONY_BONK_MS, CEREMONY_ROW_MS, CEREMONY_RUN_MS, CHIP_STEP_MS, ceremonyTimeline, type CeremonyGag, type RunShape } from '../../shared/ceremony'

// The Award ceremony's cue plan (#743, spec #718): which sound is due at which instant of the run, a pure function of the run's start, its shape on
// this screen and reduced motion. Every instant is the start plus a field of `ceremonyTimeline`, the function the GSAP tweens are built from; the
// plan's instants equal the tweens' start times in test/nuxt/ceremony-run-tweens.test.ts.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const shape = (partyCount: number, gag: CeremonyGag = 'trip', fields: Partial<RunShape> = {}): RunShape => ({ partyCount, winners: 1, gag, grid: false, ...fields })
const plan = (runShape: RunShape, reducedMotion = false) => ceremonyCuePlan({ startsAt: START, shape: runShape, reducedMotion })
const ids = (cues: readonly { id: string }[]) => cues.map(cue => cue.id)

describe('ceremonyTimeline: the moments the sound needs', () => {
  it('gives each place below its own instant, 450 ms apart up to 2 Winners, the last Place first', () => {
    expect(ceremonyTimeline(shape(4)).rowAtMs).toEqual([600, 600 + CEREMONY_ROW_MS, 600 + 2 * CEREMONY_ROW_MS])
    expect(ceremonyTimeline({ partyCount: 5, winners: 2, gag: 'trip', grid: false }).rowAtMs).toEqual([600, 1050, 1500])
  })

  it('gives chips 200 ms apart from 3 Winners on', () => {
    const { rowAtMs } = ceremonyTimeline({ partyCount: 7, winners: 3, gag: 'bonk', grid: false })

    expect(rowAtMs).toEqual([600, 600 + CHIP_STEP_MS, 600 + 2 * CHIP_STEP_MS, 600 + 3 * CHIP_STEP_MS])
  })

  it('is empty when nobody finished below the Winners', () => {
    expect(ceremonyTimeline(shape(1)).rowAtMs).toEqual([])
    expect(ceremonyTimeline({ partyCount: 3, winners: 3, gag: 'trip', grid: false }).rowAtMs).toEqual([])
  })

  it('has the bonk land 920 ms after the run, which is where the picture\'s trophy ends its fall', () => {
    const m = ceremonyTimeline(shape(4, 'bonk'))

    expect(CEREMONY_BONK_MS).toBe(920)
    expect(m.bonkAtMs).toBe(m.runEndAtMs + 920)
    expect(m.bonkAtMs).toBe(3870)
  })

  it('keeps its other moments as they were (the hand-worked example of 4 Parties and one Winner)', () => {
    expect(ceremonyTimeline(shape(4))).toMatchObject({ rowAtMs: [600, 1050, 1500], runAtMs: 2250, runEndAtMs: 2950 })
  })
})

describe('ceremonyCuePlan', () => {
  it.each([[2, 1], [4, 3], [8, 7]])('has a row per place below for %i Parties: %i rows, each a semitone higher than the one before', (parties, rows) => {
    const cues = plan(shape(parties))

    const rowCues = cues.filter(cue => cue.id === 'cer-row')
    expect(rowCues).toHaveLength(rows)
    expect(rowCues.map(cue => cue.rate)).toEqual(Array.from({ length: rows }, (_, index) => 2 ** (index / 12)))
    expect(rowCues[0]!.rate).toBe(1)
    expect(rowCues.at(-1)!.rate).toBeCloseTo(2 ** ((rows - 1) / 12), 12)
  })

  it('is the drop at the start, the rows, the run and the trip, at the instants of the shared timeline', () => {
    const m = ceremonyTimeline(shape(4))

    expect(plan(shape(4))).toEqual([
      { id: 'cer-drop', at: START },
      { id: 'cer-row', at: START + m.rowAtMs[0]!, rate: 1 },
      { id: 'cer-row', at: START + m.rowAtMs[1]!, rate: 2 ** (1 / 12) },
      { id: 'cer-row', at: START + m.rowAtMs[2]!, rate: 2 ** (2 / 12) },
      { id: 'cer-run', at: START + m.runAtMs },
      { id: 'cer-trip', at: START + m.runEndAtMs },
      { id: 'cer-stamp', at: START + m.stampAtMs },
      { id: 'cer-fanfare', at: START + m.stampAtMs },
      { id: 'cer-crowd', at: START + m.stampAtMs },
    ])
  })

  it('ends with the bonk instead of the trip when the server picked the bonk, never both', () => {
    const m = ceremonyTimeline(shape(4, 'bonk'))
    const cues = plan(shape(4, 'bonk'))

    expect(ids(cues)).toEqual(['cer-drop', 'cer-row', 'cer-row', 'cer-row', 'cer-run', 'cer-bonk', 'cer-stamp', 'cer-fanfare', 'cer-crowd'])
    expect(cues.find(cue => cue.id === 'cer-bonk')).toEqual({ id: 'cer-bonk', at: START + m.bonkAtMs })
    expect(cues.find(cue => cue.id === 'cer-stamp')).toEqual({ id: 'cer-stamp', at: START + m.stampAtMs })
    expect(ids(plan(shape(4, 'trip')))).not.toContain('cer-bonk')
  })

  it('has no row when the Winner is the only Party, and still drops, runs and trips', () => {
    expect(ids(plan(shape(1)))).toEqual(['cer-drop', 'cer-run', 'cer-trip', 'cer-stamp', 'cer-fanfare', 'cer-crowd'])
  })

  it('is ascending by instant for every Party count and both gags', () => {
    for (const gag of ['trip', 'bonk'] as const) {
      for (let parties = 1; parties <= 8; parties++) {
        const at = plan(shape(parties, gag)).map(cue => cue.at)
        expect(at, `${parties} Parties, ${gag}`).toEqual([...at].sort((a, b) => a - b))
      }
    }
  })

  it('is the same plan on a screen with another grid for one Winner (every device hears the same instants)', () => {
    expect(plan(shape(4, 'trip', { grid: true }))).toEqual(plan(shape(4, 'trip', { grid: false })))
  })

  it('drops nothing for being past: a plan far in the past is the whole plan', () => {
    expect(ceremonyCuePlan({ startsAt: 0, shape: shape(4), reducedMotion: false })).toHaveLength(9)
  })

  it('is the fanfare alone under reduced motion, at the start', () => {
    expect(plan(shape(4), true)).toEqual([{ id: 'cer-fanfare', at: START }])
  })

  it('is the fanfare alone under reduced motion for a Tie too (the end frame shows at the start; #745 may change it)', () => {
    expect(plan(shape(4, 'trip', { winners: 2 }), true)).toEqual([{ id: 'cer-fanfare', at: START }])
  })

  // #745 gives a Tie its moments: until it does, a ceremony with several Winners is silent under full motion.
  it('is empty for a ceremony with several Winners', () => {
    expect(plan(shape(4, 'trip', { winners: 2 }))).toEqual([])
    expect(plan(shape(8, 'bonk', { winners: 3, grid: true }))).toEqual([])
  })
})

describe('the files of the ceremony', () => {
  const finished = (fields: Partial<GroupInput> = {}): GroupInput => ({ wheel: false, vetoAllowance: 0, vetoWindow: false, finished: true, ...fields })

  it('are reached by a finished Event alone, wheel or not', () => {
    expect(reachableGroups(finished())).toEqual(['ceremony'])
  })

  it('come after the wheel\'s and the Veto window\'s groups, in the order of the union', () => {
    expect(reachableGroups(finished({ wheel: true, vetoAllowance: 2 }))).toEqual(['wheel', 'veto', 'ceremony'])
  })

  it('are not reached by an Event that is not finished, nor by an input that does not say', () => {
    expect(reachableGroups(finished({ finished: false }))).toEqual([])
    expect(reachableGroups({ wheel: false, vetoAllowance: 0, vetoWindow: false })).toEqual([])
  })

  it('include the eight of #743 and #744, in the order of the timeline', () => {
    expect(cueFilesOf(['ceremony'])).toEqual(expect.arrayContaining(['cer-drop', 'cer-row', 'cer-run', 'cer-trip', 'cer-bonk', 'cer-stamp', 'cer-fanfare', 'cer-crowd']))
    const files = cueFilesOf(['ceremony'])
    expect(files.indexOf('cer-drop')).toBeLessThan(files.indexOf('cer-row'))
    expect(files.indexOf('cer-run')).toBeLessThan(files.indexOf('cer-trip'))
  })
})

describe('the tables of the ceremony\'s cues', () => {
  it('gives the run a file as long as the run is', () => {
    expect(CUE_LENGTHS['cer-run'].ms).toBe(CEREMONY_RUN_MS)
  })

  // The rows of compibert-sound.md that name more than one id (`cer-trip` / `cer-bonk`) or none of its own (the run) are no clean row: the shared Vol test leaves them out, so they are pinned here.
  it('gives the cues without a clean document row their Vol of the document', () => {
    expect({ 'cer-run': CUE_VOLUME['cer-run'], 'cer-trip': CUE_VOLUME['cer-trip'], 'cer-bonk': CUE_VOLUME['cer-bonk'] }).toEqual({ 'cer-run': 40, 'cer-trip': 60, 'cer-bonk': 60 })
  })
})

describe('ceremonyRun (the listening page\'s test ceremony)', () => {
  const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)

  it.each<CeremonyGag>(['trip', 'bonk'])('is the real plan of one Winner of four Parties, %s, from the lead on', (gag) => {
    expect(ceremonyRun(NOW, gag)).toEqual(ceremonyCuePlan({ startsAt: NOW + LEAD_MS, shape: { partyCount: 4, winners: 1, gag, grid: false }, reducedMotion: false }))
    expect(ids(ceremonyRun(NOW, gag)).filter(id => id === 'cer-row')).toHaveLength(3)
  })
})
