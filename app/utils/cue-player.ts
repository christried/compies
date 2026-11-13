import { CUE_VOLUME, type Cue, type CueId } from './sound-cues'

// The cue player (#531, spec #504 § The cue player): it hands every cue of a plan to the audio clock ahead of time, at the cue's server
// time minus the server's now, and keeps what it holds in step with the plan it is given (the plan is a pure function of the viewer's Event
// read, `wheelCuePlan`, so every device holds the same one). Plain TypeScript: the context, the clock and the files are handed in, so a
// test drives it with a fake context (test/fake-audio.ts). It starts no timer and waits for no frame: a hidden tab runs the audio clock,
// not a `setTimeout`, so a cue is scheduled on that clock before it is due and never from a callback near its moment.

/** The members of `AudioContext` the player reads: the unit test passes a fake that implements these. */
export type CueContext = Pick<AudioContext, 'currentTime' | 'state' | 'destination' | 'resume' | 'createGain' | 'createBufferSource' | 'decodeAudioData' | 'addEventListener' | 'removeEventListener'>

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
  /** How many times the cue was moved after it was scheduled (the clock's offset changed, #594); absent when it never was. */
  moved?: number
}

export interface CuePlayer {
  /** Off: cancels everything pending and schedules nothing. On: reconciles the last plan. */
  setEnabled: (on: boolean) => void
  /** The WHOLE current plan; the player diffs it against what it holds. */
  setPlan: (cues: readonly Cue[]) => void
  /** Fetches and decodes the files once per id. */
  preload: (ids: readonly CueId[]) => void
  /**
   * Plays a cue `delayMs` from now, for one that the arrival of a read causes (`veto-seal`, a set game's `veto-open`, #532): it is no part of
   * any plan and never cancelled by one. Gated like every cue: Ton off plays nothing and logs nothing; a context that does not run, a file
   * that is not decoded yet or one that failed is logged `skipped`; otherwise it starts at the context's `currentTime` plus the delay and is
   * logged `scheduled`.
   */
  playNow: (id: CueId, delayMs?: number) => void
  /** Looks at what is pending again against the clocks as they are now: moves what moved (#594). */
  refresh: () => void
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
/** A pending cue whose instant moved by more than this (ms) is scheduled again: the clock's offset changed after it was scheduled (#594). */
export const CUE_MOVE_MS = 25

/** A cue file whose request failed (the network, a 404) is asked for again after this long; one that failed to decode never is (#594). */
export const CUE_FILE_RETRY_MS = 30_000

/** `dropped`: the request failed, asked again at `retryAt` (server ms); `failed`: the bytes came and cannot be decoded, final. */
type BufferSlot = { state: 'loading' } | { state: 'failed' } | { state: 'dropped', retryAt: number } | { state: 'ready', buffer: AudioBuffer }

/**
 * A cue the player has handled: the source it started (none for a skipped one), the audio-clock time it was told to start at, its buffer (to
 * start a new source when it moves), why it has no source (a cue skipped for lateness comes back when the clock says it is ahead, #594) and
 * its line in the log.
 */
interface Entry { cue: Cue, source: AudioBufferSourceNode | null, when: number, buffer: AudioBuffer | null, skippedFor: 'late' | 'file' | null, line: CueLogEntry }

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

  /** True when a file is to be requested: never asked for, or its request failed and the wait is over (#594). */
  function asks(id: CueId, now: number) {
    const slot = buffers.get(id)
    return slot === undefined || (slot.state === 'dropped' && now >= slot.retryAt)
  }

  function load(id: CueId) {
    buffers.set(id, { state: 'loading' })
    void (async () => {
      let bytes: ArrayBuffer | null = null
      try {
        bytes = await loadFile(id)
      }
      catch {
        // A dropped request or a 404: its cues are skipped for now, and the file is asked for again after CUE_FILE_RETRY_MS.
        buffers.set(id, { state: 'dropped', retryAt: serverNow() + CUE_FILE_RETRY_MS })
      }
      if (bytes !== null) {
        try {
          buffers.set(id, { state: 'ready', buffer: await context.decodeAudioData(bytes) })
        }
        catch {
          // A browser that cannot decode the file: its cues are skipped, and it is never asked for again.
          buffers.set(id, { state: 'failed' })
        }
      }
      if (!disposed) reconcile()
    })()
  }

  /** source -> the cue's own gain -> bus, started at `when` on the audio clock. */
  function start(id: CueId, buffer: AudioBuffer, when: number): AudioBufferSourceNode {
    const source = context.createBufferSource()
    source.buffer = buffer
    const gain = context.createGain()
    gain.gain.value = CUE_VOLUME[id] / 100
    source.connect(gain)
    gain.connect(bus)
    source.start(when)
    return source
  }

  function schedule(cue: Cue, buffer: AudioBuffer, now: number) {
    const lead = cue.at - now
    const when = context.currentTime + Math.max(lead, 0) / 1000
    const source = start(cue.id, buffer, when)
    entries.set(keyOf(cue), { cue, source, when, buffer, skippedFor: null, line: record(cue, lead < 0 ? 'late' : 'scheduled', when) })
  }

  function skip(cue: Cue, reason: 'late' | 'file') {
    entries.set(keyOf(cue), { cue, source: null, when: context.currentTime, buffer: null, skippedFor: reason, line: record(cue, 'skipped', context.currentTime) })
  }

  /**
   * Puts a held cue on the audio clock again as the server clock reads now: a new source, or none when it is more than `CUE_LATE_MS` past. Its
   * line is rewritten in place (the three clock fields together, so `perf + (when - currentTime) * 1000` stays the cue's instant) and counts the move.
   */
  function replace(entry: Entry, buffer: AudioBuffer, now: number) {
    const lead = entry.cue.at - now
    const currentTime = context.currentTime
    stop(entry)
    if (lead < -CUE_LATE_MS) {
      entry.source = null
      entry.buffer = null
      entry.skippedFor = 'late'
      entry.when = currentTime
    }
    else {
      entry.when = currentTime + Math.max(lead, 0) / 1000
      entry.source = start(entry.cue.id, buffer, entry.when)
      entry.buffer = buffer
      entry.skippedFor = null
    }
    entry.line.when = entry.when
    entry.line.currentTime = currentTime
    entry.line.perf = globalThis.performance?.now() ?? 0
    entry.line.outcome = entry.source === null ? 'skipped' : lead < 0 ? 'late' : 'scheduled'
    entry.line.moved = (entry.line.moved ?? 0) + 1
  }

  /**
   * Looks at every cue the player holds against the clocks as they are now (#594). The server clock's offset changes after a cue was scheduled
   * (the first `clock.pong`, a later round), and a started source cannot be moved: a pending one (it has a source and its `when` is ahead of
   * the audio clock) whose instant moved by more than `CUE_MOVE_MS` is stopped and started again. One that sounded is left alone, so no cue
   * sounds twice. A cue skipped for lateness comes back when the clock now says it is ahead: the wrong clock that skipped it was the one that
   * scheduled the far cues at the wrong time. No gap rule between ticks at the move: every pending cue moves by the same delta, so the gaps
   * among them hold, and only the boundary between a tick that sounded and the first moved one can shrink, once, in a rare re-sync.
   */
  function look(now: number) {
    const currentTime = context.currentTime
    for (const entry of entries.values()) {
      const lead = entry.cue.at - now
      if (entry.source === null) {
        if (entry.skippedFor !== 'late' || lead < -CUE_LATE_MS) continue
        const slot = buffers.get(entry.cue.id)
        if (slot?.state === 'ready') replace(entry, slot.buffer, now)
        continue
      }
      if (!(entry.when > currentTime) || entry.buffer === null) continue
      const target = currentTime + Math.max(lead, 0) / 1000
      if (Math.round(Math.abs(target - entry.when) * 1000) > CUE_MOVE_MS) replace(entry, entry.buffer, now)
    }
  }

  /**
   * Brings what the player holds in line with the stored plan: what left the plan and is not yet due is cancelled, what is new is scheduled.
   * A cue that is due or past is only forgotten and rings out: the Clip's close leaves the plan with the read that follows its own moment (#532).
   */
  function reconcile() {
    if (disposed || !enabled) return
    const now = serverNow()
    const wanted = new Set(plan.map(keyOf))
    for (const [key, entry] of entries) {
      if (wanted.has(key)) continue
      if (entry.cue.at > now) cancel(key, entry, now)
      else entries.delete(key)
    }
    // A context that does not run holds sound back, and a source started on it fires when its clock resumes, long after the cue's moment.
    if (!running()) return
    look(now)
    for (const cue of plan) {
      if (entries.has(keyOf(cue))) continue
      const slot = buffers.get(cue.id)
      if (asks(cue.id, now)) {
        load(cue.id)
        continue
      }
      if (slot?.state === 'loading') continue
      if (slot?.state !== 'ready') skip(cue, 'file')
      else if (cue.at - now < -CUE_LATE_MS) skip(cue, 'late')
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
  // A listener, not the one `onstatechange` slot: two players on one context (the listening page) must not take each other's handler (#594).
  context.addEventListener('statechange', onState)

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
    refresh() {
      if (!disposed) reconcile()
    },
    setPlan(cues) {
      if (disposed) return
      plan = cues
      reconcile()
    },
    preload(ids) {
      if (disposed) return
      const now = serverNow()
      for (const id of ids) {
        if (asks(id, now)) load(id)
      }
    },
    playNow(id, delayMs = 0) {
      if (disposed || !enabled) return
      const cue: Cue = { id, at: serverNow() + delayMs }
      const slot = buffers.get(id)
      if (!running() || slot?.state !== 'ready') {
        // A seal that waits for a download would sound late: a file that is not there yet is asked for, and this cue is skipped.
        if (asks(id, serverNow())) load(id)
        record(cue, 'skipped', context.currentTime)
        return
      }
      const when = context.currentTime + delayMs / 1000
      start(id, slot.buffer, when)
      record(cue, 'scheduled', when)
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
      context.removeEventListener('statechange', onState)
      disposed = true
    },
  }
}
