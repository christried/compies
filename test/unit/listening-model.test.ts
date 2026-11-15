import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CUE_BRIEF, MOMENT_OF, SHIPPED_NAME, STAMP_LAG_MS, arrivalCues, buildRun, candidatesOf, choicesReport, configFor, emptyChoices, stampCues, testCandidateOf, withTickGap,
  type RunConfig,
} from '../../app/dev/listening-model'
import { CUE_CREDITS_URL } from '../../app/utils/sound-credits'
import { CUE_IDS, TICK_MIN_GAP_MS, cueFileUrl, wheelCuePlan } from '../../app/utils/sound-cues'
import { REVEAL_AFTER_MS } from '../../app/utils/wheel'
import { msOf } from '../../shared/instant'

// The pure helpers of the listening page for the cue sounds (#534). The page itself has no test: it is a tool for the session of #535,
// and test/build/listening-page.test.ts pins that no production build carries it.

const root = resolve(import.meta.dirname, '../..')
const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)
const config = (fields: Partial<RunConfig> = {}): RunConfig => ({
  spinMs: 6000, hidden: false, reduced: false, windowMs: 0, start: 'beginning', clip: true, vetoes: 0, tickGapMs: TICK_MIN_GAP_MS, ...fields,
})
const ids = (plan: readonly { id: string, at: number }[], id: string) => plan.filter(cue => cue.id === id)
/** A valid credits file: every cue ships a candidate of its own, named after the cue (#536). */
const creditsOf = (fields: Record<string, unknown> = {}) => ({
  cues: Object.fromEntries(CUE_IDS.map(id => [id, { candidate: `${id}-ton`, source: `Rezept ${id}`, author: null, licence: 'generated', ...fields }])),
})
const credits = creditsOf()

describe('CUE_BRIEF', () => {
  it('is the character and the length of compibert-sound.md, for every cue', () => {
    const doc = readFileSync(resolve(root, 'docs/design_handoff_compies/reference/docs/compibert-sound.md'), 'utf8')
    for (const id of CUE_IDS) {
      const cells = doc.split('\n').map(line => line.split('|').map(cell => cell.trim())).find(row => row.includes(`\`${id}\``))!
      const at = cells.indexOf(`\`${id}\``)
      const [, amount, unit, loop] = /^([\d.]+) (ms|s)( loop)?$/.exec(cells[at + 2]!)!
      expect(CUE_BRIEF[id], id).toEqual({ character: cells[at + 1], lengthMs: Math.round(Number(amount) * (unit === 's' ? 1000 : 1)), loop: loop !== undefined })
    }
  })

  it('has one moment per cue', () => {
    expect(Object.keys(MOMENT_OF)).toEqual([...CUE_IDS])
  })
})

describe('candidatesOf', () => {
  it('gives the empty manifest the shipped file of every cue as the first row, with the credit\'s source, author and licence', () => {
    const { byCue, problems } = candidatesOf({ cues: {} }, credits)

    expect(problems).toEqual([])
    for (const id of CUE_IDS) {
      expect(byCue[id]).toEqual([{
        name: SHIPPED_NAME, url: cueFileUrl(id), file: cueFileUrl(id), source: `Rezept ${id}`, author: null, licence: 'generated', note: `Datei der App: ${id}-ton`, shipped: true,
      }])
    }
  })

  it('carries a CC0 credit\'s author into the shipped row', () => {
    const { byCue } = candidatesOf({ cues: {} }, creditsOf({ licence: 'CC0', author: 'Ada' }))

    expect(byCue['wheel-tick'][0]).toMatchObject({ licence: 'CC0', author: 'Ada', shipped: true })
  })

  it('keeps the shipped row of every cue when the credits are missing: no licence, a source that says so, and problems', () => {
    const { byCue, problems } = candidatesOf({ cues: {} }, null)

    expect(problems.length).toBeGreaterThan(0)
    for (const id of CUE_IDS) {
      expect(byCue[id]).toEqual([{
        name: SHIPPED_NAME, url: cueFileUrl(id), file: cueFileUrl(id), source: 'credits.json: kein Eintrag', author: null, licence: null, note: null, shipped: true,
      }])
    }
  })

  it('names a credit with a licence that needs a credit, and gives that cue the fallback row', () => {
    const { byCue, problems } = candidatesOf({ cues: {} }, { cues: { ...credits.cues, 'wheel-stop': { ...credits.cues['wheel-stop'], licence: 'CC-BY' } } })

    expect(problems.filter(problem => problem.includes('wheel-stop'))).toHaveLength(1)
    expect(byCue['wheel-stop'][0]).toMatchObject({ name: SHIPPED_NAME, licence: null, source: 'credits.json: kein Eintrag' })
    expect(byCue['wheel-tick'][0]).toMatchObject({ licence: 'generated', source: 'Rezept wheel-tick' })
  })

  it('shows a credit whose candidate is no longer in the manifest by its name, and makes no problem of it', () => {
    const { byCue, problems } = candidatesOf({ cues: { 'wheel-stop': [] } }, credits)

    expect(problems).toEqual([])
    expect(byCue['wheel-stop'][0]!.note).toBe('Datei der App: wheel-stop-ton')
  })

  it('reads the committed manifest and the committed credits without a problem, and every entry has its file on disk', () => {
    const manifest: unknown = JSON.parse(readFileSync(resolve(root, 'sound-candidates/manifest.json'), 'utf8'))
    const committed: unknown = JSON.parse(readFileSync(join(root, 'public', CUE_CREDITS_URL), 'utf8'))
    const { byCue, problems } = candidatesOf(manifest, committed)

    expect(problems).toEqual([])
    for (const id of CUE_IDS) {
      expect(byCue[id][0]!.name, id).toBe(SHIPPED_NAME)
      expect(byCue[id][0]!.licence, id).not.toBeNull()
      for (const candidate of byCue[id].filter(entry => !entry.shipped)) {
        expect(existsSync(resolve(root, 'sound-candidates', candidate.file)), candidate.file).toBe(true)
      }
    }
  })

  it('puts a valid entry after the shipped row, with the URL of the candidates route', () => {
    const entry = { name: 'tick-b', file: 'wheel-tick/tick-b.wav', source: 'sfxr preset coin, seed 12', author: null, licence: 'generated', note: 'dry' }
    const { byCue, problems } = candidatesOf({ cues: { 'wheel-tick': [entry] } }, credits)

    expect(problems).toEqual([])
    expect(byCue['wheel-tick'].map(candidate => candidate.name)).toEqual([SHIPPED_NAME, 'tick-b'])
    expect(byCue['wheel-tick'][1]).toMatchObject({ file: 'wheel-tick/tick-b.wav', url: '/_dev/cue-candidates/wheel-tick/tick-b.wav', licence: 'generated', note: 'dry', shipped: false })
  })

  it.each([
    ['a licence that needs a credit', { cues: { 'wheel-stop': [{ name: 'a', file: 'wheel-stop/a.wav', source: 's', licence: 'CC-BY' }] } }],
    ['a cue id that does not exist', { cues: { 'wheel-boom': [{ name: 'a', file: 'wheel-boom/a.wav', source: 's', licence: 'CC0' }] } }],
    ['a file in another cue\'s folder', { cues: { 'wheel-stop': [{ name: 'a', file: 'wheel-tick/a.wav', source: 's', licence: 'CC0' }] } }],
    ['an extension the player does not take', { cues: { 'wheel-stop': [{ name: 'a', file: 'wheel-stop/a.flac', source: 's', licence: 'CC0' }] } }],
    ['a missing source', { cues: { 'wheel-stop': [{ name: 'a', file: 'wheel-stop/a.wav', licence: 'CC0' }] } }],
  ])('names a problem and leaves the entry out for %s', (_what, manifest) => {
    const { byCue, problems } = candidatesOf(manifest, credits)

    expect(problems.length).toBeGreaterThan(0)
    for (const id of CUE_IDS) expect(byCue[id].map(candidate => candidate.name), id).toEqual([SHIPPED_NAME])
  })

  it('names a duplicate name within a cue and keeps the first', () => {
    const entry = { name: 'a', file: 'wheel-stop/a.wav', source: 's', licence: 'CC0' }
    const { byCue, problems } = candidatesOf({ cues: { 'wheel-stop': [entry, { ...entry, file: 'wheel-stop/b.wav' }] } }, credits)

    expect(problems).toHaveLength(1)
    expect(byCue['wheel-stop'].map(candidate => candidate.file)).toEqual([cueFileUrl('wheel-stop'), 'wheel-stop/a.wav'])
  })

  it('never throws: a manifest that is no object gives the shipped rows and a problem', () => {
    for (const manifest of [null, 'x', 3, [], { cues: 'x' }, { cues: { 'wheel-stop': 'x' } }]) {
      const { byCue, problems } = candidatesOf(manifest, credits)
      expect(byCue['wheel-stop'][0]!.name).toBe(SHIPPED_NAME)
      expect(problems.length).toBeGreaterThan(0)
    }
  })
})

describe('buildRun', () => {
  it('plans a 6 s Hidden spin: wind-up at the start, stop 6 s later, the morph half a second after it, no slices for the wheel', () => {
    const run = buildRun(config({ hidden: true }), NOW, 1)
    const start = NOW + 3000

    expect(ids(run.plan, 'wheel-windup').map(cue => cue.at)).toEqual([start])
    expect(ids(run.plan, 'wheel-stop').map(cue => cue.at)).toEqual([start + 6000])
    expect(ids(run.plan, 'wheel-morph').map(cue => cue.at)).toEqual([start + 6000 + REVEAL_AFTER_MS])
    expect(run.wheel.slices).toBeNull()
    expect(run.spin!.labels).toEqual(Array(8).fill('?'))
    expect(run.plan.some(cue => cue.id.startsWith('veto-'))).toBe(false)
  })

  it('gives a visible wheel its seven games, and a new draw id for every run', () => {
    const run = buildRun(config(), NOW, 1)

    expect(run.wheel.slices).toHaveLength(7)
    expect(run.wheel.count).toBe(7)
    expect(ids(run.plan, 'wheel-morph')).toEqual([])
    expect(buildRun(config(), NOW, 2).spin!.drawId).not.toBe(run.spin!.drawId)
  })

  it('plans the 150 s window from the last 12 s as a late joiner reads it: the end is 12 s away, open and clip close are past', () => {
    const run = buildRun(config({ spinMs: 0, windowMs: 150_000, start: 'last12', vetoes: 2 }), NOW, 1)
    const end = NOW + 12_000

    expect(run.spin).toBeNull()
    expect(ids(run.plan, 'veto-reveal').map(cue => cue.at)).toEqual([end])
    expect(ids(run.plan, 'veto-clock')).toHaveLength(15)
    expect(ids(run.plan, 'veto-open')[0]!.at).toBeLessThan(NOW)
    expect(ids(run.plan, 'veto-clip-close')[0]!.at).toBeLessThan(NOW)
    expect(ids(run.plan, 'veto-drumroll').map(cue => cue.at)).toEqual([end - 1200])
    expect(run.revealed).toEqual([{ team: 1 }, { team: 2 }])
    expect(run.revealAt).toBe(end + STAMP_LAG_MS)
  })

  it('plans the 40 s window from the beginning after a spin, with a 10 s Clip, and never a veto-seal', () => {
    const run = buildRun(config({ windowMs: 40_000 }), NOW, 1)
    const stop = NOW + 3000 + 6000

    expect(ids(run.plan, 'veto-open').map(cue => cue.at)).toEqual([stop])
    expect(ids(run.plan, 'veto-reveal').map(cue => cue.at)).toEqual([stop + 40_000])
    expect(ids(run.plan, 'veto-clip-close').map(cue => cue.at)).toEqual([stop + 10_000])
    expect(ids(run.plan, 'veto-seal')).toEqual([])
    expect(run.draw).toMatchObject({ kind: 'spin', vetoEndsAt: new Date(stop + 40_000).toISOString() })
  })

  it('leaves the Clip out when it is off, and the wheel out of a window-only run', () => {
    const run = buildRun(config({ spinMs: 0, windowMs: 40_000, clip: false }), NOW, 1)

    expect(ids(run.plan, 'veto-clip-close')).toEqual([])
    expect(ids(run.plan, 'veto-open')[0]!.at).toBe(NOW + 3000)
    expect(run.plan.some(cue => cue.id.startsWith('wheel-'))).toBe(false)
  })

  it('leaves the wind-up, the ticks and the drumroll out under reduced motion', () => {
    const run = buildRun(config({ reduced: true, windowMs: 40_000 }), NOW, 1)

    expect(run.plan.some(cue => ['wheel-windup', 'wheel-tick', 'veto-drumroll'].includes(cue.id))).toBe(false)
    expect(run.tickCount).toBe(0)
  })

  it('holds the plan the real plan functions give, ascending, and the tick count of it', () => {
    const run = buildRun(config(), NOW, 1)
    const spin = run.spin!
    const real = wheelCuePlan({ spin, hiddenWheel: false, isHost: false, reducedMotion: false })

    expect(run.plan).toEqual(real)
    expect(run.tickCount).toBe(ids(real, 'wheel-tick').length)
    expect(run.plan.map(cue => cue.at)).toEqual([...run.plan.map(cue => cue.at)].sort((a, b) => a - b))
  })
})

describe('withTickGap', () => {
  const spin = buildRun(config(), NOW, 1).spin!
  const timing = { spinStartAt: msOf(spin.spinStartAt), stopAt: msOf(spin.stopAt), slices: spin.slices, resultIndex: spin.resultIndex, resultOffset: spin.resultOffset }
  const plan = wheelCuePlan({ spin, hiddenWheel: false, isHost: false, reducedMotion: false })

  it('gives fewer ticks for a larger cap and keeps every other cue', () => {
    const wider = withTickGap(plan, timing, 120)

    expect(ids(wider, 'wheel-tick').length).toBeLessThan(ids(plan, 'wheel-tick').length)
    expect(ids(wider, 'wheel-tick').length).toBeGreaterThan(0)
    expect(wider.filter(cue => cue.id !== 'wheel-tick')).toEqual(plan.filter(cue => cue.id !== 'wheel-tick'))
    expect(wider.map(cue => cue.at)).toEqual([...wider.map(cue => cue.at)].sort((a, b) => a - b))
  })

  it('gives the plan unchanged for the shipped cap', () => {
    expect(withTickGap(plan, timing, TICK_MIN_GAP_MS)).toEqual(plan)
  })

  it('reaches buildRun through the config', () => {
    expect(buildRun(config({ tickGapMs: 120 }), NOW, 1).tickCount).toBeLessThan(buildRun(config(), NOW, 1).tickCount)
  })
})

describe('configFor', () => {
  const controls = { spin: 'none', window: 'none', start: 'last12', clip: true, vetoes: 1, hidden: false, reduced: false, tickGapMs: 40 } as const

  it('takes the first value for a part with nothing selected, and the beginning where the late start is not allowed', () => {
    expect(configFor('spin', controls)).toMatchObject({ spinMs: 6000, windowMs: 0 })
    expect(configFor('window', controls)).toMatchObject({ spinMs: 0, windowMs: 40_000, start: 'last12' })
    expect(configFor('both', { ...controls, spin: '10', window: '150' })).toMatchObject({ spinMs: 10_000, windowMs: 150_000, start: 'beginning' })
  })
})

describe('arrival buttons', () => {
  it('play a seal for the own cast, one per Veto for the reveal at 80 ms apart, and the opening of a set game', () => {
    expect(arrivalCues('own', NOW)).toEqual([{ id: 'veto-seal', delayMs: 0 }])
    expect(arrivalCues('reveal-2', NOW)).toEqual([{ id: 'veto-seal', delayMs: 0 }, { id: 'veto-seal', delayMs: 80 }])
    expect(arrivalCues('reveal-1', NOW)).toEqual([{ id: 'veto-seal', delayMs: 0 }])
    expect(arrivalCues('set', NOW)).toEqual([{ id: 'veto-open', delayMs: 0 }])
  })

  it('play the stamps of a run at the end of its window, and nothing for no Veto', () => {
    const run = buildRun(config({ spinMs: 0, windowMs: 40_000, vetoes: 2 }), NOW, 1)
    const at = run.revealAt!

    expect(stampCues(run.draw!, 2, at)).toHaveLength(2)
    expect(stampCues(run.draw!, 0, at)).toEqual([])
  })
})

describe('choicesReport', () => {
  const { byCue } = candidatesOf({ cues: { 'wheel-stop': [{ name: 'thunk', file: 'wheel-stop/thunk.wav', source: 'sfxr preset hit, seed 3', author: null, licence: 'CC0' }] } }, credits)

  it('has all eleven cues in order, undecided by default', () => {
    const report = choicesReport(byCue, emptyChoices(), 40)

    expect(Object.keys(report.choices)).toEqual([...CUE_IDS])
    expect(report.tickMinGapMs).toBe(40)
    expect(report.choices['wheel-tick']).toEqual({ decision: 'undecided', candidate: null, file: null, source: null, author: null, licence: null })
  })

  it('names the chosen candidate with its file and licence, and none-fits as its own decision', () => {
    const choices = emptyChoices()
    choices['wheel-stop'] = { candidate: 'thunk', noneFits: false }
    choices['wheel-tick'] = { candidate: null, noneFits: true }
    choices['wheel-windup'] = { candidate: SHIPPED_NAME, noneFits: false }
    const report = choicesReport(byCue, choices, 60)

    expect(report.choices['wheel-stop']).toEqual({ decision: 'candidate', candidate: 'thunk', file: 'wheel-stop/thunk.wav', source: 'sfxr preset hit, seed 3', author: null, licence: 'CC0' })
    expect(report.choices['wheel-tick']).toMatchObject({ decision: 'none-fits', candidate: null, file: null })
    expect(report.choices['wheel-windup']).toMatchObject({ decision: 'candidate', candidate: SHIPPED_NAME, file: cueFileUrl('wheel-windup'), licence: 'generated' })
    expect(report.tickMinGapMs).toBe(60)
  })

  it('shows a chosen name that is no longer in the manifest as undecided', () => {
    const choices = emptyChoices()
    choices['wheel-stop'] = { candidate: 'gone', noneFits: false }

    expect(choicesReport(byCue, choices, 40).choices['wheel-stop'].decision).toBe('undecided')
  })
})

describe('testCandidateOf', () => {
  const { byCue } = candidatesOf({ cues: { 'wheel-stop': [{ name: 'thunk', file: 'wheel-stop/thunk.wav', source: 's', licence: 'CC0' }] } }, credits)

  it('is the marked candidate, else the shipped file, also for none-fits', () => {
    const choices = emptyChoices()
    expect(testCandidateOf(byCue, choices, 'wheel-stop').name).toBe(SHIPPED_NAME)
    choices['wheel-stop'] = { candidate: 'thunk', noneFits: false }
    expect(testCandidateOf(byCue, choices, 'wheel-stop').name).toBe('thunk')
    choices['wheel-stop'] = { candidate: null, noneFits: true }
    expect(testCandidateOf(byCue, choices, 'wheel-stop').name).toBe(SHIPPED_NAME)
  })
})
