import type { CueContext } from '../app/utils/cue-player'

// A fake Web Audio context for the cue player's tests (#531), shared by the unit project (test/unit/cue-player.test.ts) and the nuxt project
// (test/nuxt/event-cues.test.ts, which stubs it as the global `AudioContext`). Not a test file. The clock is the test's: `currentTime` moves
// only through `advance`, and a decoded buffer is `{ id }` read from the bytes the test's loader returned, so a started source says which
// cue it plays.

/** One buffer source: what it plays, when it was told to start, whether it was stopped and the gain it runs through. */
export class FakeSource {
  buffer: { id: string } | null = null
  startedAt: number | null = null
  stopCalls = 0
  private target: FakeGain | null = null

  connect(node: FakeGain) {
    this.target = node
    return node
  }

  start(when: number) {
    this.startedAt = when
  }

  stop() {
    this.stopCalls += 1
  }

  get id() {
    return this.buffer?.id
  }

  get gain() {
    return this.target?.gain.value
  }
}

export class FakeGain {
  gain = { value: 1 }
  connected: unknown = null

  connect(node: unknown) {
    this.connected = node
    return node
  }
}

export class FakeAudioContext {
  /** Every context a test created, in order: the nuxt test reaches the one the page made through this. */
  static instances: FakeAudioContext[] = []

  currentTime = 10
  state: string = 'running'
  destination = { kind: 'destination' }
  onstatechange: (() => void) | null = null
  closed = false
  decodeFails = false
  resumeRejects = false
  resumeCalls = 0
  gains: FakeGain[] = []
  sources: FakeSource[] = []

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  /** The way a test hands the fake to the player: it implements the few members the player reads. */
  get asContext(): CueContext {
    return this as unknown as CueContext
  }

  advance(ms: number) {
    this.currentTime += ms / 1000
  }

  setState(state: string) {
    this.state = state
    this.onstatechange?.()
  }

  createGain() {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }

  createBufferSource() {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }

  decodeAudioData(bytes: ArrayBuffer) {
    if (this.decodeFails) return Promise.reject(new Error('cannot decode'))
    return Promise.resolve({ id: new TextDecoder().decode(bytes) })
  }

  resume() {
    this.resumeCalls += 1
    if (this.resumeRejects) return Promise.reject(new Error('not allowed'))
    this.state = 'running'
    this.onstatechange?.()
    return Promise.resolve()
  }

  close() {
    this.closed = true
    return Promise.resolve()
  }

  /** The sources that were told to start, in the order they were. */
  started() {
    return this.sources.filter(source => source.startedAt !== null)
  }
}

/** The bytes of a cue file in a test: the cue id itself, which the fake decodes back to `{ id }`. */
export function bytesOf(id: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(id)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
