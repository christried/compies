// The recipes of Compibert's voice in the Tour (#747, spec #718): { name, note (German, what the operator reads), ms (the file's length),
// make(rng) -> Float64Array, fadeOut?: seconds }. make-cue-candidates.mjs loads every file of this folder and calls each `make` once with the
// noise seeded from the file path, so a rerun gives the same bytes. `cb-hi` greets the Member when the Tour opens: a short happy chirp, wordless,
// every candidate a sound (a chirp, a glide, a blip, a squeak), never a syllable. `cb-yay`, the Tour's cheer, is the wheel's (wheel-voice.mjs).
// Nobody has heard these yet: the operator picks by ear in #748.
import { buf, mix, add, shape, expo, osc, svf, bar, burst, peakTo, pluckEnv } from '../cue-kit.mjs'

/** A semitone ratio above `hz`. */
const up = (hz, semitones) => hz * 2 ** (semitones / 12)

export default {
  // ---- cb-hi: the greeting, 0.3 s. Short, happy and friendly, the transient at once, not as loud in character as the cheer. ----------------
  'cb-hi': [
    {
      // Two notes of a square wave, a fifth apart, each one dropping in from a little above: the "hi-hi" of a small bird.
      name: 'zwei-ton-piep', ms: 300, fadeOut: 0.04, note: 'Zwei-Ton-Piepser nach oben, vogelartig',
      make() {
        const out = buf(0.3)
        const note = (at, hz, dur, tau) => add(out, shape(osc('square', dur, t => hz * (1 + 0.05 * Math.exp(-t / 0.015)), { duty: 0.25 }), pluckEnv(0.002, tau)), at, 0.9)
        note(0, 988, 0.12, 0.08)
        note(0.12, up(988, 7), 0.17, 0.1)
        return out
      },
    },
    {
      // One quick glide up through a sine, a fast wobble on the pitch, and a little air in front: a chirp that smiles.
      name: 'gleiter-mit-wobble', ms: 300, fadeOut: 0.06, note: 'schneller Gleiter nach oben mit Wobble',
      make() {
        const glide = osc('sine', 0.3, t => 900 * 2 ** (1.4 * Math.min(1, t / 0.18) ** 0.7) * (1 + 0.03 * Math.sin(2 * Math.PI * 24 * t)), { phase: 0.25 })
        return shape(glide, t => Math.min(1, t / 0.003) * Math.exp(-Math.max(0, t - 0.12) / 0.07))
      },
    },
    {
      // Two chip blips, a 25 % pulse each, the second a fourth above the first and shorter: a console "bi-dip".
      name: 'chip-blip-paar', ms: 300, fadeOut: 0.03, note: 'zwei Arcade-Blips, der zweite höher',
      make() {
        const out = buf(0.3)
        add(out, shape(osc('square', 0.11, 1175, { duty: 0.25 }), pluckEnv(0.001, 0.06)), 0, 0.85)
        add(out, shape(osc('square', 0.14, up(1175, 5), { duty: 0.25 }), pluckEnv(0.001, 0.07)), 0.11, 0.85)
        return out
      },
    },
    {
      // A squeak, a saw that bends up an octave in 50 ms through a low-pass, and a glockenspiel bar ringing behind it.
      name: 'quieker-mit-klang', ms: 300, fadeOut: 0.06, note: 'kurzer Quieker, danach ein heller Klang',
      make(rng) {
        const squeak = osc('saw', 0.12, t => 700 * 2 ** (Math.min(1, t / 0.05)))
        const voice = shape(svf(squeak, 'low', 3200, 1.1), expo(0.06))
        return mix(0.3, [peakTo(voice), 0, 0.8], [burst(0.015, rng, 0.004, { bp: 3500, q: 0.8 }), 0, 0.25], [bar(0.2, up(1568, 0), 0.1), 0.1, 0.6])
      },
    },
  ],
}
