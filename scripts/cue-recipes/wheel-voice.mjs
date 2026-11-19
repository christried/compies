// The recipes of Compibert's voice at the wheel (#671, spec #718): { name, note (German, what the operator reads), ms (the file's length),
// make(rng) -> Float64Array, swell?: true, fadeOut?: seconds }. make-cue-candidates.mjs loads every file of this folder and calls each `make` once
// with the noise seeded from the file path, so a rerun gives the same bytes. He has no words: every candidate is a sound (a glide, a chirp, a
// blip, a squeak, a gulp), never a run of syllables or a vowel that moves like speech. Nobody has heard these yet: the operator picks by ear in #748.
import { buf, mix, add, shape, expo, osc, crush, svf, bar, burst, thump, peakTo, pluckEnv, up } from '../cue-kit.mjs'

export default {
  // ---- cb-hype: excited as the spin starts, 0.6 s. Rising and bouncy, bright, the transient at once. -----------------------------------
  'cb-hype': [
    {
      // A rising 25 % pulse arpeggio, eight steps of 75 ms, a little vibrato: the console-game "yeah, here we go".
      name: 'chip-arpeggio', ms: 600, fadeOut: 0.04, note: 'Arcade-Arpeggio nach oben, mit Vibrato',
      make() {
        const step = 0.075
        const semis = [0, 4, 7, 12, 16, 19, 24, 28]
        return shape(
          osc('square', 0.6, t => up(523, semis[Math.min(7, Math.floor(t / step))]) * (1 + 0.012 * Math.sin(2 * Math.PI * 7 * t)), { duty: 0.25 }),
          t => 0.7 + 0.3 * Math.exp(-(t % step) / 0.04),
        )
      },
    },
    {
      // One fast upward glide, a saw through a bright low-pass that opens as it climbs, a quick wobble on the pitch.
      name: 'glitzer-gleiter', ms: 600, fadeOut: 0.06, note: 'schneller Gleiter nach oben, hell',
      make() {
        const glide = osc('saw', 0.6, t => 380 * 6.5 ** (Math.min(1, t / 0.5) ** 0.8) * (1 + 0.015 * Math.sin(2 * Math.PI * 11 * t)))
        return shape(svf(glide, 'low', t => 1200 + 5000 * (t / 0.6), 1.1), t => Math.exp(-Math.max(0, t - 0.4) / 0.08))
      },
    },
    {
      // Three bouncy low blips, each a sine that bends up a little, climbing a third each time.
      name: 'huepf-blips', ms: 600, fadeOut: 0.03, note: 'drei hüpfende Blips, steigend',
      make() {
        const out = buf(0.6)
        for (const [k, hz] of [220, 277, 349].entries()) {
          const blip = osc('sine', 0.17, t => hz * (1 + 0.35 * Math.min(1, t / 0.03)), { phase: 0.25 })
          add(out, shape(blip, pluckEnv(0.002, 0.05)), k * 0.2, 1)
          add(out, shape(osc('tri', 0.1, t => hz * 2 * (1 + 0.35 * Math.min(1, t / 0.03))), expo(0.025)), k * 0.2, 0.3)
        }
        return out
      },
    },
    {
      // A xylophone run upwards: six bars of a major pentatonic, 90 ms apart, the last one left to ring.
      name: 'xylophon-lauf', ms: 600, fadeOut: 0.06, note: 'Xylophon-Lauf nach oben',
      make() {
        const out = buf(0.6)
        for (const [k, semi] of [0, 2, 4, 7, 9, 12].entries()) add(out, bar(0.4, up(784, semi), 0.12), k * 0.09, 1)
        return out
      },
    },
  ],

  // ---- cb-gulp: the brake, 0.25 s. A swallow, dry and short, one beat of held breath. ------------------------------------------------
  'cb-gulp': [
    {
      // A low thump that falls, a noise click on top and a smaller second thump behind it: the throat closing twice.
      name: 'schluck-wumms', ms: 250, fadeOut: 0.03, note: 'Schlucken: tiefer Wumms, Klick, zweiter Wumms',
      make(rng) {
        return mix(0.25, [thump(0.25, 240, 80, 0.05, 0.07), 0, 1], [burst(0.02, rng, 0.003, { lp: 2800, hp: 400 }), 0, 0.5], [thump(0.14, 190, 70, 0.04, 0.05), 0.1, 0.6])
      },
    },
    {
      // A "glup" in one sine: it bends down by an octave and a half, then back up, with its octave beside it.
      name: 'glup-bogen', ms: 250, fadeOut: 0.04, note: 'ein Glup: Sinus fällt, steigt wieder',
      make() {
        const hz = t => (t < 0.09 ? 600 * 0.4 ** (t / 0.09) : 240 * 2.1 ** Math.min(1, (t - 0.09) / 0.12))
        const body = osc('sine', 0.25, hz, { phase: 0.25 })
        const octave = osc('sine', 0.25, t => 2 * hz(t))
        return shape(mix(0.25, [body, 0, 1], [octave, 0, 0.25]), t => Math.exp(-t / 0.13))
      },
    },
    {
      // A muffled water drop: a sine that jumps up 400 to 900 Hz in 25 ms, then rings out, taken through a soft low-pass.
      name: 'tropfen-pluck', ms: 250, fadeOut: 0.04, note: 'gedämpfter Wassertropfen',
      make(rng) {
        const drop = shape(osc('sine', 0.25, t => 400 + 500 * Math.min(1, t / 0.025), { phase: 0.25 }), expo(0.06))
        return mix(0.25, [svf(drop, 'low', 1800), 0, 1], [burst(0.01, rng, 0.002, { lp: 1500 }), 0, 0.3])
      },
    },
    {
      // Arcade down-blip: a 25 % pulse falling in five steps, crushed to 5 bits, a straight linear fade.
      name: 'chip-abwaerts', ms: 250, fadeOut: 0.03, note: 'Arcade-Blip, fünf Stufen nach unten',
      make() {
        const sig = osc('square', 0.25, t => 900 * 0.72 ** Math.floor(t / 0.04), { duty: 0.25 })
        return shape(crush(sig, 5), t => Math.max(0, 1 - t / 0.25))
      },
    },
  ],

  // ---- cb-yay: the cheer at the stop, 0.5 s. Bright and rising, a flourish at the end, nothing crowd-like. -----------------------------
  'cb-yay': [
    {
      // A rising two-note chirp (G5, then C6) and a quick flourish of three notes up to C7, ringing out.
      name: 'chirp-fanfare', ms: 500, fadeOut: 0.06, note: 'Zwei-Ton-Chirp nach oben, kleiner Schnörkel',
      make() {
        const out = buf(0.5)
        const note = (at, hz, dur, tau) => add(out, shape(osc('square', dur, t => hz * (1 + 0.04 * Math.exp(-t / 0.02)), { duty: 0.25 }), pluckEnv(0.002, tau)), at, 0.9)
        note(0, 784, 0.13, 0.12)
        note(0.12, 1047, 0.14, 0.12)
        note(0.25, 1319, 0.06, 0.06)
        note(0.29, 1568, 0.06, 0.06)
        note(0.33, 2093, 0.17, 0.09)
        return out
      },
    },
    {
      // A bright major arpeggio of glockenspiel bars (C6, E6, G6, C7), 60 ms apart, the top one ringing.
      name: 'glocken-dur', ms: 500, fadeOut: 0.08, note: 'heller Dur-Arpeggio auf Stäben',
      make() {
        const out = buf(0.5)
        for (const [k, semi] of [0, 4, 7, 12].entries()) add(out, bar(0.45, up(1047, semi), 0.16), k * 0.06, 1)
        return out
      },
    },
    {
      // A party horn: a saw that bends up a fourth in 80 ms and holds, through a low-pass, with a puff of air at the start.
      name: 'party-troete', ms: 500, fadeOut: 0.06, note: 'Partytröte, Blat nach oben',
      make(rng) {
        const horn = osc('saw', 0.5, t => 330 * 2 ** ((5 / 12) * Math.min(1, t / 0.08)) * (1 + 0.01 * Math.sin(2 * Math.PI * 8 * t)))
        const body = shape(svf(horn, 'low', 2600, 0.9), pluckEnv(0.004, 0.5))
        return mix(0.5, [peakTo(body), 0, 1], [burst(0.04, rng, 0.01, { bp: 2500, q: 0.8 }), 0, 0.35])
      },
    },
    {
      // A happy squeak: a sine that sweeps from 700 to 1900 Hz in 120 ms, settles at 1600 with a growing wobble and fades out.
      name: 'quiek-hoch', ms: 500, fadeOut: 0.08, note: 'fröhliches Quieken nach oben, pendelt sich ein',
      make() {
        const hz = t => (t < 0.12 ? 700 + 1200 * Math.sin((Math.PI / 2) * (t / 0.12)) : 1600 + 300 * Math.exp(-(t - 0.12) / 0.05)) * (1 + 0.03 * Math.min(1, t / 0.3) * Math.sin(2 * Math.PI * 9 * t))
        const squeak = osc('sine', 0.5, hz, { phase: 0.25 })
        const bright = osc('sine', 0.5, t => 2 * hz(t))
        return shape(mix(0.5, [squeak, 0, 1], [bright, 0, 0.3]), t => Math.exp(-t / 0.25))
      },
    },
  ],
}
