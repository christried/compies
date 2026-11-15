import {
  CUE_IDS, TICK_MIN_GAP_MS, cueFileUrl, thinTicks, vetoArrivalCues, vetoCuePlan, wheelCuePlan,
  type ArrivalCue, type Cue, type CueId, type VetoArrivalState,
} from '~/utils/sound-cues'
import { isText, parseCredits, type CueCredit, type Licence } from '~/utils/sound-credits'
import { pinCrossings } from '~/utils/wheel-pins'
import type { WheelTiming } from '~/utils/wheel'
import type { RoundGame } from '~~/shared/game'
import { isRecord } from '~~/shared/record'
import type { ClipView, SpinView, VetoCastView, VetoDrawView, WheelView } from '~~/shared/stage'

// The logic of the listening page for the cue sounds (#534, the session of #535): what each cue is meant to sound like, the candidates, a
// test run built through the REAL cue plan functions, and the eleven choices as the agent reads them back. Pure: no Vue, no DOM, no clock
// (`now` is handed in), so test/unit/listening-model.test.ts covers it. Dev server only (app/dev/ is no folder Nuxt scans; nuxt.config.ts
// registers the page, stage.ts decides).

/** The candidates' URL base: server/dev/cue-candidates.ts serves it from `sound-candidates/`. Not under `public/`, so no deployment has a file. */
export const CANDIDATE_BASE = '/_dev/cue-candidates'

/** What the brief says of each cue: the Cue column and the Length column of `reference/docs/compibert-sound.md`, word for word (a unit test reads the doc). */
export const CUE_BRIEF: Record<CueId, { character: string, lengthMs: number, loop: boolean }> = {
  'wheel-windup': { character: 'ratchet pulled back', lengthMs: 500, loop: false },
  'wheel-tick': { character: 'plastic flapper per peg, rate follows speed', lengthMs: 30, loop: false },
  'wheel-stop': { character: 'thunk + three-note chord', lengthMs: 600, loop: false },
  'wheel-morph': { character: 'hidden mode: scramble/zip as the fake name turns real', lengthMs: 500, loop: false },
  'wheel-slice-out': { character: 'slice pops out, „schwupp“', lengthMs: 300, loop: false },
  'veto-open': { character: 'shutter whoosh, window slides up', lengthMs: 400, loop: false },
  'veto-clock': { character: 'dry clock tick, last 10 s only, speeds up at 5 s', lengthMs: 40, loop: false },
  'veto-clip-close': { character: 'soft TV off', lengthMs: 300, loop: false },
  'veto-seal': { character: 'own veto confirmed: wax-stamp thud', lengthMs: 300, loop: false },
  'veto-drumroll': { character: 'snare roll before the reveal', lengthMs: 1200, loop: true },
  'veto-reveal': { character: 'all at once: cymbal hit + stamp per veto (staggered 80 ms)', lengthMs: 800, loop: false },
}

/** Where a cue sounds in a real Event: in a spin, in a Veto window, or at the arrival of a read (the own Party's cast, a stamp). */
export type Moment = 'spin' | 'window' | 'arrival'
export const MOMENT_OF: Record<CueId, Moment> = {
  'wheel-windup': 'spin', 'wheel-tick': 'spin', 'wheel-stop': 'spin', 'wheel-morph': 'spin', 'wheel-slice-out': 'spin',
  'veto-open': 'window', 'veto-clock': 'window', 'veto-clip-close': 'window', 'veto-seal': 'arrival', 'veto-drumroll': 'window', 'veto-reveal': 'window',
}

// Candidates -------------------------------------------------------------------------------------------------------------------------

export interface Candidate {
  /** Unique within its cue; the choice stores it. */
  name: string
  /** What the page fetches. */
  url: string
  /** The manifest's `file` (`<cue id>/<name>.<ext>`); for the shipped file its URL. What #593 reads back. */
  file: string
  source: string
  author: string | null
  /** `null` only for the shipped row of a cue whose credit is missing or faulty. */
  licence: Licence | null
  note: string | null
  /** The file the app ships for the cue (the first row of every cue, no manifest entry). */
  shipped: boolean
}

/** The name of the first row of every cue: the file the app ships. Choosing it means keeping the provisional sound (#536). */
export const SHIPPED_NAME = 'ausgeliefert'

const EXTENSIONS = ['wav', 'ogg', 'mp3']

/** The row of the file the app ships: its source, author and licence from the cue's credit, or an honest gap when there is none. */
const shippedOf = (id: CueId, credit: CueCredit | undefined): Candidate => ({
  name: SHIPPED_NAME, url: cueFileUrl(id), file: cueFileUrl(id),
  source: credit?.source ?? 'credits.json: kein Eintrag', author: credit?.author ?? null, licence: credit?.licence ?? null,
  note: credit ? `Datei der App: ${credit.candidate}` : null, shipped: true,
})

/**
 * The candidates of every cue: the shipped file first (its credit read from `credits.json`, #536), then the manifest's entries in order. An
 * entry with a problem is left out and named in `problems` (shown in red at the top of the page), the credits' problems among them; nothing
 * throws, so a half-edited manifest still lists what it can.
 */
export function candidatesOf(manifest: unknown, creditsFile: unknown): { byCue: Record<CueId, Candidate[]>, problems: string[] } {
  const { credits, problems } = parseCredits(creditsFile)
  const byCue = Object.fromEntries(CUE_IDS.map(id => [id, [shippedOf(id, credits[id])]])) as Record<CueId, Candidate[]>
  const cues = isRecord(manifest) ? manifest.cues : undefined
  if (!isRecord(cues)) {
    problems.push('manifest.json: "cues" fehlt oder ist kein Objekt.')
    return { byCue, problems }
  }

  for (const [cue, entries] of Object.entries(cues)) {
    const id = CUE_IDS.find(known => known === cue)
    if (id === undefined) {
      problems.push(`${cue}: keine Cue-ID.`)
      continue
    }
    if (!Array.isArray(entries)) {
      problems.push(`${id}: die Liste fehlt.`)
      continue
    }
    entries.forEach((entry: unknown, index) => {
      const where = `${id} #${index + 1}`
      if (!isRecord(entry) || !isText(entry.name) || !isText(entry.file) || !isText(entry.source) || !isText(entry.licence)) {
        problems.push(`${where}: name, file, source oder licence fehlt.`)
        return
      }
      const { name, file, source, licence } = entry
      const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
      if (licence !== 'CC0' && licence !== 'generated') problems.push(`${where} (${name}): Lizenz "${licence}" ist nicht CC0 oder generated.`)
      else if (!file.startsWith(`${id}/`) || file.indexOf('/', id.length + 1) !== -1) problems.push(`${where} (${name}): die Datei liegt nicht im Ordner ${id}/.`)
      else if (!EXTENSIONS.includes(extension)) problems.push(`${where} (${name}): .${extension} ist weder wav noch ogg noch mp3.`)
      else if (byCue[id].some(known => known.name === name)) problems.push(`${where}: der Name "${name}" kommt in ${id} schon vor.`)
      else {
        byCue[id].push({
          name, url: `${CANDIDATE_BASE}/${file}`, file, source, author: isText(entry.author) ? entry.author : null, licence,
          note: isText(entry.note) ? entry.note : null, shipped: false,
        })
      }
    })
  }
  return { byCue, problems }
}

// Choices ----------------------------------------------------------------------------------------------------------------------------

/** `candidate` = a candidate's name; `null` with `noneFits` false = undecided. */
export interface Choice { candidate: string | null, noneFits: boolean }
export type Choices = Record<CueId, Choice>

export const emptyChoices = (): Choices => Object.fromEntries(CUE_IDS.map(id => [id, { candidate: null, noneFits: false }])) as Choices

/** The candidate a choice marks, or undefined for undecided, none-fits and a name the manifest no longer has. */
const markedOf = (byCue: Record<CueId, Candidate[]>, choices: Choices, id: CueId): Candidate | undefined =>
  choices[id].noneFits ? undefined : byCue[id].find(candidate => candidate.name === choices[id].candidate)

/** What a run plays for a cue: the marked candidate, else the shipped file (also for „keins passt“). */
export const testCandidateOf = (byCue: Record<CueId, Candidate[]>, choices: Choices, id: CueId): Candidate => markedOf(byCue, choices, id) ?? byCue[id][0]!

export interface ChoiceReport {
  decision: 'candidate' | 'none-fits' | 'undecided'
  candidate: string | null
  file: string | null
  source: string | null
  author: string | null
  licence: Licence | null
}

/** The eleven choices as the agent reads them back (the `<pre>` and `window.__compiesListeningChoices`), with the tick cap the session settled on. */
export function choicesReport(byCue: Record<CueId, Candidate[]>, choices: Choices, tickMinGapMs: number): { choices: Record<CueId, ChoiceReport>, tickMinGapMs: number } {
  const report = {} as Record<CueId, ChoiceReport>
  for (const id of CUE_IDS) {
    const marked = markedOf(byCue, choices, id)
    report[id] = marked
      ? { decision: 'candidate', candidate: marked.name, file: marked.file, source: marked.source, author: marked.author, licence: marked.licence }
      : { decision: choices[id].noneFits ? 'none-fits' : 'undecided', candidate: null, file: null, source: null, author: null, licence: null }
  }
  return { choices: report, tickMinGapMs }
}

// Test runs --------------------------------------------------------------------------------------------------------------------------

/** The files decode before the first cue: a run starts this long after the button. */
export const LEAD_MS = 3000
/** A real read arrives a moment after the window's end, and the stamps follow it. */
export const STAMP_LAG_MS = 300
/** The Clip of a window ends 30 s before the window does (the real timeline: window = Clip length + 30 s). */
const CLIP_TAIL_MS = 30_000
const LATE_START_MS = 12_000

export interface RunConfig {
  spinMs: 0 | 6000 | 10_000
  hidden: boolean
  reduced: boolean
  windowMs: 0 | 40_000 | 150_000
  /** `last12`: the window's end is 12 s away, as for a late joiner's read; only with no spin. */
  start: 'beginning' | 'last12'
  clip: boolean
  vetoes: 0 | 1 | 2
  tickGapMs: number
}

export interface Run {
  drawId: string
  /** The wheel's spin, null for a window-only run. */
  spin: SpinView | null
  wheel: WheelView
  draw: VetoDrawView | null
  clip: Pick<ClipView, 'drawId' | 'endsAt'> | null
  /** The Vetoes the reveal holds, written into `wheel.vetoes.revealed` at `revealAt`. */
  revealed: VetoCastView[]
  /** When the page reads again after the window's end (`end` + STAMP_LAG_MS), null without a window. */
  revealAt: number | null
  plan: Cue[]
  tickCount: number
}

const iso = (ms: number) => new Date(ms).toISOString()

/** A game of the fixture, like the `halo` of test/nuxt/lucky-wheel.test.ts: the wheel and the window only name it. */
const GAME: RoundGame = { id: 'g-test', name: 'Testspiel', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const SLICES = 8
const RESULT_INDEX = 3

/**
 * The plan's tick cues at another cap than TICK_MIN_GAP_MS: `wheelCuePlan` takes no cap, so the plan's ticks are dropped and the pin
 * crossings are thinned again at `gapMs` (the listening session tunes the cap by ear, #535). The shipped constant is never touched.
 */
export function withTickGap(plan: readonly Cue[], timing: WheelTiming, gapMs: number): Cue[] {
  if (gapMs === TICK_MIN_GAP_MS || !plan.some(cue => cue.id === 'wheel-tick')) return [...plan]
  const ticks = thinTicks(pinCrossings(timing).map(crossing => crossing.at), gapMs).map((at): Cue => ({ id: 'wheel-tick', at }))
  // The sort is stable: on one instant the order of the plan stays.
  return [...plan.filter(cue => cue.id !== 'wheel-tick'), ...ticks].sort((a, b) => a.at - b.at)
}

/**
 * A test run: the spin and the Veto window as the Event read would give them at `now` (epoch ms), and the plan the REAL `wheelCuePlan` and
 * `vetoCuePlan` make of them, from the same five and four fields as `planOf` in useCuePlayer.ts (the game and the Vetoes stay out of them).
 * `counter` makes a new draw id for every run: the wheel reads reduced motion again for a new one.
 */
export function buildRun(config: RunConfig, now: number, counter: number): Run {
  const drawId = `listen-${counter}`
  const start = now + LEAD_MS
  const spinning = config.spinMs > 0
  const stop = start + config.spinMs
  const spin: SpinView | null = spinning
    ? {
        roundId: 'listen-round', drawId, spinStartAt: iso(start), stopAt: iso(stop), slices: SLICES, resultIndex: RESULT_INDEX, resultOffset: 0.5,
        labels: Array.from({ length: SLICES }, (_, index) => config.hidden ? '?' : `Spiel ${index + 1}`), game: GAME, current: true,
      }
    : null

  const windowed = config.windowMs > 0
  // After a spin the window opens at the stop; alone it starts at the lead or, for the late joiner's read, ends 12 s from now.
  const end = !windowed ? 0 : spinning ? stop + config.windowMs : config.start === 'last12' ? now + LATE_START_MS : start + config.windowMs
  const opens = windowed ? end - config.windowMs : 0
  const draw: VetoDrawView | null = windowed ? { drawId, kind: 'spin', stopAt: iso(opens), vetoEndsAt: iso(end), game: GAME } : null
  const clip = windowed && config.clip ? { drawId, endsAt: iso(end - CLIP_TAIL_MS) } : null

  const games = Array.from({ length: SLICES }, (_, index) => ({ id: `g${index + 1}`, name: `Spiel ${index + 1}` })).filter((_, index) => index !== RESULT_INDEX)
  const wheel: WheelView = {
    count: games.length, slices: config.hidden ? null : games, spin, vetoes: { left: [2, 2], own: null, revealed: null, draw },
  }

  let plan = [
    ...wheelCuePlan({
      spin: spin ? { spinStartAt: spin.spinStartAt, stopAt: spin.stopAt, slices: spin.slices, resultIndex: spin.resultIndex, resultOffset: spin.resultOffset } : null,
      hiddenWheel: config.hidden,
      isHost: false,
      reducedMotion: config.reduced,
    }),
    ...vetoCuePlan({ draw: draw ? { drawId, kind: draw.kind, stopAt: draw.stopAt, vetoEndsAt: draw.vetoEndsAt } : null, clip, reducedMotion: config.reduced }),
  ]
  if (spin) plan = withTickGap(plan, { spinStartAt: start, stopAt: stop, slices: SLICES, resultIndex: RESULT_INDEX, resultOffset: 0.5 }, config.tickGapMs)

  return {
    drawId, spin, wheel, draw, clip,
    revealed: Array.from({ length: config.vetoes }, (_, index) => ({ team: index + 1 })),
    revealAt: windowed ? end + STAMP_LAG_MS : null,
    plan,
    tickCount: plan.filter(cue => cue.id === 'wheel-tick').length,
  }
}

/** The controls of the page, as they stand: what a run button reads. */
export interface Controls {
  spin: 'none' | '6' | '10'
  window: 'none' | '40' | '150'
  start: RunConfig['start']
  clip: boolean
  vetoes: RunConfig['vetoes']
  hidden: boolean
  reduced: boolean
  tickGapMs: number
}

/**
 * The run a button makes: `spin` the wheel alone, `window` the window alone, `both` the full run. A part with nothing selected takes its first
 * value (6 s, 40 s); the late start only fits a window alone, since after a spin the window opens at the stop.
 */
export function configFor(kind: 'spin' | 'window' | 'both', controls: Controls): RunConfig {
  const spinMs = controls.spin === '10' ? 10_000 : 6000
  const windowMs = controls.window === '150' ? 150_000 : 40_000
  return {
    spinMs: kind === 'window' ? 0 : spinMs,
    windowMs: kind === 'spin' ? 0 : windowMs,
    start: kind === 'window' ? controls.start : 'beginning',
    clip: controls.clip,
    vetoes: controls.vetoes,
    hidden: controls.hidden,
    reduced: controls.reduced,
    // An emptied field is no cap: the shipped one.
    tickGapMs: controls.tickGapMs > 0 ? controls.tickGapMs : TICK_MIN_GAP_MS,
  }
}

// Arrival cues -----------------------------------------------------------------------------------------------------------------------

/** The stamps of the reveal: what the page plays as its read arrives after the window's end, `vetoArrivalCues` as the Event page asks it. */
export function stampCues(draw: VetoDrawView, count: number, now: number): ArrivalCue[] {
  const before: VetoArrivalState = { draw, ownCast: false, revealedCount: null }
  return vetoArrivalCues(before, { draw, ownCast: false, revealedCount: count }, now)
}

export type ArrivalButton = 'own' | 'reveal-1' | 'reveal-2' | 'set'

/** The arrival buttons for `veto-seal` and a set game's `veto-open`: a fixture draw and the read that follows it. */
export function arrivalCues(button: ArrivalButton, now: number): ArrivalCue[] {
  const draw: VetoDrawView = { drawId: 'listen-arrival', kind: 'spin', stopAt: iso(now - 40_000), vetoEndsAt: iso(now - STAMP_LAG_MS), game: GAME }
  if (button === 'own') return vetoArrivalCues({ draw, ownCast: false, revealedCount: null }, { draw, ownCast: true, revealedCount: null }, now)
  if (button === 'set') {
    const set: VetoDrawView = { drawId: 'listen-set', kind: 'set', stopAt: iso(now), vetoEndsAt: iso(now + 30_000), game: GAME }
    return vetoArrivalCues({ draw, ownCast: false, revealedCount: null }, { draw: set, ownCast: false, revealedCount: null }, now)
  }
  return stampCues(draw, button === 'reveal-1' ? 1 : 2, now)
}
