// Writes the eleven placeholder cue files of 0.13.3 (#531): beeps, thumps and sweeps of the lengths `compibert-sound.md` lists, until the
// listening session picks the real sounds (#535, #536). 16-bit PCM, mono, 44.1 kHz WAV, which every browser's decodeAudioData reads and which
// needs no encoder. Deterministic (a seeded generator for the noise, no Math.random), so a rerun gives the same bytes.
//
//   node scripts/make-placeholder-cues.mjs     writes public/sounds/cues/<cue id>.wav
//
// Every file peaks at -1 dBFS (0.89): the relative volume of the cues is the player's gain (CUE_VOLUME), not the file's. A 5 ms fade in and out
// on each keeps a file from clicking. The file names are the cue ids of app/utils/sound-cues.ts; the extension is CUE_FILE_EXTENSION there.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RATE = 44_100
const PEAK = 0.89
const FADE_S = 0.005
const OUT = resolve(import.meta.dirname, '../public/sounds/cues')
const TAU = Math.PI * 2

// mulberry32, as in scripts/bake-compibert.mjs.
function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** A sine whose frequency glides from `from` to `to` over `seconds`; the phase is integrated, so the sweep has no jumps. */
function sweep(from, to, seconds) {
  let phase = 0
  return (t) => {
    phase += TAU * (from + (to - from) * Math.min(t / seconds, 1)) / RATE
    return Math.sin(phase)
  }
}

const tone = hz => t => Math.sin(TAU * hz * t)
/** Fast attack to 1 over `attack` seconds, then an exponential decay with time constant `decay`. */
const pluck = (attack, decay) => t => (t < attack ? t / attack : Math.exp(-(t - attack) / decay))

// The cues: length in seconds and a function of time t (s) to a sample in about -1..1. Lengths as compibert-sound.md.
const CUES = {
  // Ratchet pulled back: a rising sweep.
  'wheel-windup': { seconds: 0.5, wave: (() => { const s = sweep(180, 420, 0.5); return t => s(t) * (0.4 + 0.6 * (t / 0.5)) })() },
  // Plastic flapper: a short high click.
  'wheel-tick': { seconds: 0.03, wave: (() => { const e = pluck(0.001, 0.006); return t => tone(1400)(t) * e(t) })() },
  // Thunk and a G-B-D chord from 150 ms.
  'wheel-stop': {
    seconds: 0.6,
    wave: (() => {
      const thump = pluck(0.002, 0.07)
      const chord = pluck(0.01, 0.18)
      return t => 0.7 * tone(110)(t) * thump(t) + (t >= 0.15 ? 0.3 * (tone(392)(t) + tone(494)(t) + tone(587)(t)) * chord(t - 0.15) : 0)
    })(),
  },
  // Scramble turning real: a quick sweep up, with a tremolo.
  'wheel-morph': { seconds: 0.5, wave: (() => { const s = sweep(300, 1200, 0.5); return t => s(t) * (0.6 + 0.4 * Math.sin(TAU * 24 * t)) })() },
  // Schwupp: a falling sweep.
  'wheel-slice-out': { seconds: 0.3, wave: (() => { const s = sweep(900, 300, 0.3); return t => s(t) * (1 - t / 0.3) })() },
  // Shutter whoosh, the window slides up: a rising sweep.
  'veto-open': { seconds: 0.4, wave: sweep(250, 700, 0.4) },
  // Dry clock tick.
  'veto-clock': { seconds: 0.04, wave: (() => { const e = pluck(0.002, 0.01); return t => tone(900)(t) * e(t) })() },
  // Soft TV off: a falling sweep.
  'veto-clip-close': { seconds: 0.3, wave: (() => { const s = sweep(600, 150, 0.3); return t => s(t) * (1 - 0.5 * (t / 0.3)) })() },
  // Wax-stamp thud.
  'veto-seal': { seconds: 0.3, wave: (() => { const e = pluck(0.003, 0.06); return t => tone(90)(t) * e(t) })() },
  // Snare roll: a train of short noise bursts every 50 ms, getting louder.
  'veto-drumroll': {
    seconds: 1.2,
    wave: (() => {
      const random = seeded(0xD2011)
      const burst = pluck(0.001, 0.012)
      let last = -1
      let noise = 0
      return (t) => {
        const index = Math.floor(t / 0.05)
        if (index !== last) { last = index; noise = random() * 2 - 1 }
        return (random() * 2 - 1 + 0.3 * noise) * burst(t - index * 0.05) * (0.3 + 0.7 * (t / 1.2))
      }
    })(),
  },
  // Cymbal-ish hit: a thud and a decaying chime.
  'veto-reveal': {
    seconds: 0.8,
    wave: (() => {
      const thump = pluck(0.002, 0.08)
      const chime = pluck(0.003, 0.25)
      return t => 0.7 * tone(80)(t) * thump(t) + 0.5 * tone(880)(t) * chime(t)
    })(),
  },
}

/** The samples of a cue, normalised to PEAK and faded in and out over FADE_S. */
function render({ seconds, wave }) {
  const count = Math.round(seconds * RATE)
  const samples = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const t = i / RATE
    const fade = Math.min(1, t / FADE_S, (seconds - t) / FADE_S)
    samples[i] = wave(t) * Math.max(fade, 0)
  }
  const top = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0)
  return samples.map(sample => (sample / top) * PEAK)
}

/** A 16-bit PCM mono WAV file of the samples. */
function wav(samples) {
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(36 + samples.length * 2, 4)
  bytes.write('WAVE', 8, 'ascii')
  bytes.write('fmt ', 12, 'ascii')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(RATE, 24)
  bytes.writeUInt32LE(RATE * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36, 'ascii')
  bytes.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, i) => bytes.writeInt16LE(Math.round(sample * 32_767), 44 + i * 2))
  return bytes
}

mkdirSync(OUT, { recursive: true })
for (const [id, cue] of Object.entries(CUES)) {
  writeFileSync(resolve(OUT, `${id}.wav`), wav(render(cue)))
}
console.log(`wrote ${Object.keys(CUES).length} files to ${OUT}`)
