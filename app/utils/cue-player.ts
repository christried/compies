import { CUE_VOLUME, type Cue, type CueId } from './sound-cues'

// The cue player (#531, spec #504 § The cue player): it hands every cue of a plan to the audio clock ahead of time, at the cue's server
// time minus the server's now, and keeps what it holds in step with the plan it is given (the plan is a pure function of the viewer's Event
// read, `wheelCuePlan`, so every device holds the same one). Plain TypeScript: the context, the clock and the files are handed in, so a
// test drives it with a fake context (test/fake-audio.ts). It starts no timer and waits for no frame: a hidden tab runs the audio clock,
// not a `setTimeout`, so a cue is scheduled on that clock before it is due and never from a callback near its moment.

/** The members of `AudioContext` the player reads: the unit test passes a fake that implements these. */
export type CueContext = Pick<AudioContext, 'currentTime' | 'state' | 'destination' | 'resume' | 'createGain' | 'createBufferSource' | 'decodeAudioData' | 'onstatechange'>

export interface CuePlayerOptions {
  context: CueContext
  /** The server's now in epoch ms (`useServerClock().now`). */
  serverNow: () => number
  /** The bytes of a cue's file: the composable fetches, the test returns bytes. */
  loadFile: (id: CueId) => Promise<ArrayBuffer>
  /** Called when `suspended` may have changed. */
  onChange?: () => void
  /** Ton (`useSound().enabled`); on unless said otherwise. */
  enabled?: boolean
}

/** What the player did with one cue, for the browser check (`window.__compiesCueLog`, #537). */
export interface CueLogEntry {
  id: CueId
  /** The cue's server time (epoch ms). */
  at: number
  /** The audio-clock time it was told to start at (seconds); the context's `currentTime` for a cue that was skipped. */
  when: number
  /** The audio clock when it was handled (seconds). */
  currentTime: number
  /** `performance.now()` when it was handled (0 where there is none). */
  perf: number
  outcome: 'scheduled' | 'late' | 'skipped' | 'cancelled'
}

export interface CuePlayer {
  /** Off: cancels everything pending and schedules nothing. On: reconciles the last plan. */
  setEnabled: (on: boolean) => void
  /** The WHOLE current plan; the player diffs it against what it holds. */
  setPlan: (cues: readonly Cue[]) => void
  /** Fetches and decodes the files once per id. */
  preload: (ids: readonly CueId[]) => void
  /** Asks the context to run (it needs a gesture) and reconciles. It never rejects. */
  resume: () => Promise<void>
  /** True unless the context runs. */
  readonly suspended: boolean
  /** Newest last, at most `LOG_LIMIT` entries. */
  readonly log: readonly CueLogEntry[]
  /** Cancels what is pending and lets go of the context's callback; the context stays open (its owner closes it). */
  dispose: () => void
}

/** A cue this far past its time still plays, at once; a later one is skipped (04-motion § Synchronised moments). */
const CUE_LATE_MS = 150
const LOG_LIMIT = 500

type BufferSlot = { state: 'loading' } | { state: 'failed' } | { state: 'ready', buffer: AudioBuffer }

/** A cue the player has handled: the source it started (none for a skipped one) and its line in the log. */
interface Entry { cue: Cue, source: AudioBufferSourceNode | null, line: CueLogEntry }

const keyOf = (cue: Cue) => `${cue.id}@${cue.at}`

export function createCuePlayer(options: CuePlayerOptions): CuePlayer {
  const { context, serverNow, loadFile, onChange } = options
  let enabled = options.enabled ?? true
  let disposed = false
  let plan: readonly Cue[] = []
  const entries = new Map<string, Entry>()
  const buffers = new Map<CueId, BufferSlot>()
  const log: CueLogEntry[] = []

  // One bus: every cue runs source -> its own gain -> bus -> destination. No ducking, no master volume (#504).
  const bus = context.createGain()
  bus.gain.value = 1
  bus.connect(context.destination)

  const running = () => context.state === 'running'

  function record(cue: Cue, outcome: CueLogEntry['outcome'], when: number): CueLogEntry {
    const line: CueLogEntry = { id: cue.id, at: cue.at, when, currentTime: context.currentTime, perf: globalThis.performance?.now() ?? 0, outcome }
    log.push(line)
    if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT)
    return line
  }

  /** Stops a source that is pending or sounding; a source that already ended, or none, is nothing to stop. */
  function stop(entry: Entry) {
    try {
      entry.source?.stop()
    }
    catch {
      // A source that never started, or one that already ended: nothing left to stop.
    }
  }

  /** Drops an entry. A cue that is not yet due is logged as cancelled; one that already sounded keeps its outcome and is just cut off. */
  function cancel(key: string, entry: Entry, now: number) {
    stop(entry)
    if (entry.source !== null && entry.cue.at > now) entry.line.outcome = 'cancelled'
    entries.delete(key)
  }

  function load(id: CueId) {
    buffers.set(id, { state: 'loading' })
    void (async () => {
      try {
        const buffer = await context.decodeAudioData(await loadFile(id))
        buffers.set(id, { state: 'ready', buffer })
      }
      catch {
        // A 404 or a browser that cannot decode the file: its cues are skipped, and it is not asked for again.
        buffers.set(id, { state: 'failed' })
      }
      if (!disposed) reconcile()
    })()
  }

  function schedule(cue: Cue, buffer: AudioBuffer, now: number) {
    const lead = cue.at - now
    const when = context.currentTime + Math.max(lead, 0) / 1000
    const source = context.createBufferSource()
    source.buffer = buffer
    const gain = context.createGain()
    gain.gain.value = CUE_VOLUME[cue.id] / 100
    source.connect(gain)
    gain.connect(bus)
    source.start(when)
    entries.set(keyOf(cue), { cue, source, line: record(cue, lead < 0 ? 'late' : 'scheduled', when) })
  }

  function skip(cue: Cue) {
    entries.set(keyOf(cue), { cue, source: null, line: record(cue, 'skipped', context.currentTime) })
  }

  /** Brings what the player holds in line with the stored plan: what left the plan is cancelled, what is new is scheduled. */
  function reconcile() {
    if (disposed || !enabled) return
    const now = serverNow()
    const wanted = new Set(plan.map(keyOf))
    for (const [key, entry] of entries) {
      if (!wanted.has(key)) cancel(key, entry, now)
    }
    // A context that does not run holds sound back, and a source started on it fires when its clock resumes, long after the cue's moment.
    if (!running()) return
    for (const cue of plan) {
      if (entries.has(keyOf(cue))) continue
      const slot = buffers.get(cue.id)
      if (slot === undefined) {
        load(cue.id)
        continue
      }
      if (slot.state === 'loading') continue
      if (slot.state === 'failed' || cue.at - now < -CUE_LATE_MS) skip(cue)
      else schedule(cue, slot.buffer, now)
    }
  }

  /** The context's state moved: a running one schedules the plan, one that left running (an interruption) takes back what is not yet due. */
  function onState() {
    if (disposed) return
    if (running()) {
      reconcile()
    }
    else {
      const now = serverNow()
      for (const [key, entry] of entries) {
        if (entry.cue.at > now) cancel(key, entry, now)
      }
    }
    onChange?.()
  }
  context.onstatechange = onState

  return {
    setEnabled(on) {
      if (disposed || on === enabled) return
      enabled = on
      if (on) {
        reconcile()
        return
      }
      const now = serverNow()
      for (const [key, entry] of entries) cancel(key, entry, now)
    },
    setPlan(cues) {
      if (disposed) return
      plan = cues
      reconcile()
    },
    preload(ids) {
      if (disposed) return
      for (const id of ids) {
        if (!buffers.has(id)) load(id)
      }
    },
    async resume() {
      if (disposed) return
      // Called in the same turn as the gesture that asks for it: iOS only lets a context run from inside a gesture handler.
      try {
        await context.resume()
      }
      catch {
        // Refused, or no `resume` at all: the context stays as it is, and `suspended` says so.
      }
      reconcile()
      onChange?.()
    },
    get suspended() {
      return !running()
    },
    get log() {
      return log
    },
    dispose() {
      if (disposed) return
      const now = serverNow()
      for (const [key, entry] of entries) cancel(key, entry, now)
      context.onstatechange = null
      disposed = true
    },
  }
}
