// The recipes of the Emotes' sounds (#770, spec #719 § C, `compibert-sound.md` lines 82-85): { name, note (German, what the operator reads), ms (the
// file's length), make(rng) -> Float64Array, fadeOut?: seconds, swell?: true }. make-cue-candidates.mjs loads every file of this folder and calls each
// `make` once with the noise seeded from the file path, so a rerun gives the same bytes. Four cues of a room's reactions, cartoony, dry and short, never a
// vowel that moves like speech: `emo-clap` 2-3 claps, `emo-haha` a wheezy giggle, `emo-grr` a short growl, `emo-roar` a small dino's roar, cute, not scary.
// Each cue's FIRST recipe is the one that ships for now (provisional): nobody has heard any of these yet, the operator picks by ear in #771.
import { buf, mix, add, shape, expo, osc, svf, noise, crushNoise, crush, burst, peakTo, pluckEnv, heldEnv, bar, TAU } from '../cue-kit.mjs'

/** One falling pulse of a pitched voice: `kind` through a low-pass, gliding from `from` to `to` Hz over its length, an attack of 3 ms and a decay of `tau`. */
const pulse = (kind, dur, from, to, lp, tau) => shape(svf(osc(kind, dur, t => from + (to - from) * Math.min(1, t / dur)), 'low', lp, 0.9), pluckEnv(0.003, tau))

export default {
  // ---- emo-clap: 2-3 claps, 0.6 s. The transient at once, dry, a little room behind the last one. ----------------------------------------
  'emo-clap': [
    {
      // Three hand claps: a band-passed noise burst of 30 ms each, 130 ms apart, the last a touch softer, and a tiny second slap right after the first.
      name: 'drei-klatscher', ms: 600, fadeOut: 0.08, note: 'drei trockene Klatscher, wie echte Hände',
      make(rng) {
        const out = buf(0.6)
        const clap = (at, gain) => {
          add(out, burst(0.1, rng, 0.012, { bp: 1800, q: 1.1 }), at, gain)
          add(out, burst(0.05, rng, 0.006, { bp: 2600, q: 1.4 }), at + 0.011, gain * 0.5)
        }
        clap(0, 1)
        clap(0.13, 0.9)
        clap(0.27, 0.75)
        return out
      },
    },
    {
      // Two wooden blocks instead of hands: a struck bar each, high and hollow, with a flick of noise on the strike, 150 ms apart.
      name: 'holz-klapper', ms: 600, fadeOut: 0.1, note: 'zwei hohle Holzklötze, nicht ganz Hände',
      make(rng) {
        const out = buf(0.6)
        add(out, bar(0.3, 820, 0.05, { tilt: 0.45 }), 0, 0.8)
        add(out, burst(0.02, rng, 0.004, { bp: 3000, q: 0.8 }), 0, 0.5)
        add(out, bar(0.3, 760, 0.06, { tilt: 0.45 }), 0.15, 0.7)
        add(out, burst(0.02, rng, 0.004, { bp: 3000, q: 0.8 }), 0.15, 0.4)
        return out
      },
    },
    {
      // The noise channel of a console held at 6 kHz and high-passed: three clipped, grainy slaps of 25 ms, 110 ms apart.
      name: 'chip-klatsch', ms: 600, fadeOut: 0.06, note: 'drei körnige Arcade-Klatscher',
      make(rng) {
        const out = buf(0.6)
        for (const [at, gain] of [[0, 1], [0.11, 0.9], [0.22, 0.8]]) {
          add(out, shape(svf(crushNoise(0.05, rng, 6000), 'high', 1200), expo(0.01)), at, gain)
        }
        return crush(peakTo(out), 6)
      },
    },
    {
      // A room (#771): two claps 200 ms apart, each followed by three flutter echoes 35 ms apart, so the hall rings after them like a gym.
      // Its own closure: the one in `drei-klatscher` draws its noise in a fixed order and its bytes must not change.
      name: 'halle-klatscher', ms: 600, fadeOut: 0.1, note: 'zwei Klatscher mit Echo, wie in einer Turnhalle',
      make(rng) {
        const out = buf(0.6)
        const clap = (at, gain, bp) => {
          add(out, burst(0.1, rng, 0.012, { bp, q: 1.1 }), at, gain)
          add(out, burst(0.05, rng, 0.006, { bp: bp + 800, q: 1.4 }), at + 0.011, gain * 0.5)
        }
        for (const [at, gain] of [[0, 1], [0.2, 0.85]]) {
          clap(at, gain, 1800)
          ;[0.45, 0.2, 0.09].forEach((echo, i) => clap(at + 0.035 * (i + 1), gain * echo, 2200))
        }
        return out
      },
    },
  ],

  // ---- emo-haha: a wheezy giggle, 0.7 s. Short falling pulses with breath between, never a vowel. ------------------------------------------
  'emo-haha': [
    {
      // Five falling triangle pulses, each lower than the one before, a breath of noise between: a wheeze, not a word.
      name: 'keuch-kichern', ms: 700, fadeOut: 0.1, note: 'ein keuchendes Kichern, mit Atem dazwischen',
      make(rng) {
        const out = buf(0.7)
        const starts = [0, 0.13, 0.26, 0.4, 0.55]
        starts.forEach((at, i) => {
          const base = 560 - i * 35
          add(out, pulse('tri', 0.09, base, base * 0.62, 2600, 0.06), at, 0.9 - i * 0.08)
          add(out, burst(0.05, rng, 0.02, { bp: 3200, q: 0.7 }), at + 0.085, 0.25)
        })
        return out
      },
    },
    {
      // Six chip blips, a 25 % pulse wave each, every one gliding down: a console's snicker.
      name: 'chip-gickser', ms: 700, fadeOut: 0.06, note: 'ein Arcade-Gickern aus sechs Blips',
      make() {
        const out = buf(0.7)
        for (let i = 0; i < 6; i++) {
          const base = 780 - i * 40
          add(out, shape(osc('square', 0.07, t => base * (1 - 0.35 * t / 0.07), { duty: 0.25 }), pluckEnv(0.002, 0.04)), i * 0.105, 0.9 - i * 0.07)
        }
        return out
      },
    },
    {
      // A rubber squeak toy squeezed four times: a sine with a fast wobble sliding down, a puff of air on each squeeze.
      name: 'quietschtier', ms: 700, fadeOut: 0.12, note: 'vier Quietscher wie ein Gummitier, mit Luft',
      make(rng) {
        const out = buf(0.7)
        for (let i = 0; i < 4; i++) {
          const base = 1000 - i * 70
          const squeak = osc('sine', 0.12, t => (base - 380 * t / 0.12) * (1 + 0.04 * Math.sin(TAU * 38 * t)))
          add(out, shape(squeak, pluckEnv(0.004, 0.07)), i * 0.16, 0.85)
          add(out, burst(0.06, rng, 0.025, { bp: 4000, q: 0.6 }), i * 0.16, 0.3)
        }
        return out
      },
    },
    {
      // A snort, then two squeaks (#771): a band of noise closing from 1800 to 900 Hz, two sine glides up, a breath out. Sine glides only, no formant.
      name: 'pruste-kiekser', ms: 700, fadeOut: 0.12, note: 'ein Prusten, dann zwei hohe Kiekser',
      make(rng) {
        const out = buf(0.7)
        add(out, shape(svf(noise(0.12, rng), 'band', t => 1800 - 900 * Math.min(1, t / 0.1), 1.1), pluckEnv(0.004, 0.05)), 0, 0.9)
        const squeak = () => shape(osc('sine', 0.09, t => 650 + 500 * t / 0.09), pluckEnv(0.004, 0.05))
        add(out, squeak(), 0.16, 0.8)
        add(out, squeak(), 0.3, 0.7)
        add(out, burst(0.2, rng, 0.08, { bp: 3000, q: 0.6 }), 0.45, 0.35)
        return out
      },
    },
  ],

  // ---- emo-grr: a short growl, 0.6 s, a swell by nature: it comes up in a few ms. ---------------------------------------------------------
  'emo-grr': [
    {
      // A low saw, its level wobbling 32 times a second through a low-pass: the rattle of a growl.
      name: 'saege-knurren', ms: 600, swell: true, fadeOut: 0.12, note: 'tiefes, raues Knurren',
      make() {
        const voice = svf(osc('saw', 0.6, t => 118 - 28 * Math.min(1, t / 0.5)), 'low', 720, 1.4)
        return shape(voice, t => heldEnv(0.008, 0.38, 0.09)(t) * (0.55 + 0.45 * Math.cos(TAU * 32 * t)))
      },
    },
    {
      // A narrow pulse train (the rattle comes from its edges), 90 Hz, 27 Hz wobble, a rasp of noise through a band around 450 Hz on top.
      name: 'puls-rasseln', ms: 600, swell: true, fadeOut: 0.12, note: 'rasselndes Grollen mit Rauschen',
      make(rng) {
        const body = shape(svf(osc('square', 0.6, t => 96 - 20 * Math.min(1, t / 0.5), { duty: 0.18 }), 'low', 900, 1), t => 0.5 + 0.5 * Math.cos(TAU * 27 * t))
        const rasp = shape(svf(noise(0.6, rng), 'band', 450, 1.6), t => 0.5 + 0.5 * Math.cos(TAU * 27 * t))
        return shape(mix(0.6, [peakTo(body), 0, 1], [peakTo(rasp), 0, 0.5]), heldEnv(0.008, 0.4, 0.08))
      },
    },
    {
      // A triangle driven into saturation so the harmonics come in, 80 Hz sliding down, a slow 25 Hz tremolo: a purr that bites.
      name: 'schnurr-saettigung', ms: 600, swell: true, fadeOut: 0.14, note: 'ein Schnurren, das beißt',
      make() {
        const voice = osc('tri', 0.6, t => 86 - 14 * Math.min(1, t / 0.5)).map(x => Math.tanh(3.5 * x))
        return shape(svf(voice, 'low', 1100, 0.8), t => heldEnv(0.01, 0.36, 0.1)(t) * (0.6 + 0.4 * Math.cos(TAU * 25 * t)))
      },
    },
    {
      // A hiss (#771): air through a band falling from 3800 to 1800 Hz with an 18 Hz flutter, a small square growl under it at 75 Hz. No low tone as the body.
      name: 'katzen-fauchen', ms: 600, swell: true, fadeOut: 0.12, note: 'ein Fauchen aus Luft, mit kleinem Grollen darunter',
      make(rng) {
        const hiss = shape(svf(noise(0.6, rng), 'band', t => 3800 - 2000 * Math.min(1, t / 0.5), 1.1), t => 0.7 + 0.3 * Math.cos(TAU * 18 * t))
        const low = svf(osc('square', 0.6, 75, { duty: 0.2 }), 'low', 500, 1)
        return shape(mix(0.6, [peakTo(hiss), 0, 1], [peakTo(low), 0, 0.35]), heldEnv(0.008, 0.36, 0.08))
      },
    },
  ],

  // ---- emo-roar: a small dino's roar, 1.0 s, cute, not scary: it rises, falls and ends rounded. -----------------------------------------
  'emo-roar': [
    {
      // A saw and a pulse falling together from 320 to 160 Hz, a 30 Hz growl on the level, a low-pass that closes with the pitch and a rounded end.
      name: 'mini-dino', ms: 1000, swell: true, fadeOut: 0.2, note: 'kleines Dino-Brüllen, fällt von hoch nach tief',
      make() {
        const fall = t => 320 - 160 * Math.min(1, t / 0.8)
        const mixed = mix(1, [peakTo(osc('saw', 1, fall)), 0, 1], [peakTo(osc('square', 1, t => fall(t) * 1.005, { duty: 0.3 })), 0, 0.55])
        const closed = svf(mixed, 'low', t => 2200 - 1500 * Math.min(1, t / 0.8), 1.2)
        return shape(closed, t => heldEnv(0.02, 0.62, 0.11)(t) * (0.6 + 0.4 * Math.cos(TAU * 30 * t)))
      },
    },
    {
      // Mostly breath: noise swept through a band from 1000 down to 420 Hz, a thin saw under it, an angry little snort that ends in air.
      name: 'dino-schnauben', ms: 1000, swell: true, fadeOut: 0.25, note: 'ein Schnauben, mehr Luft als Ton',
      make(rng) {
        const breath = shape(svf(noise(1, rng), 'band', t => 1000 - 580 * Math.min(1, t / 0.7), 1.3), t => 0.65 + 0.35 * Math.cos(TAU * 22 * t))
        const tone = svf(osc('saw', 1, t => 230 - 80 * Math.min(1, t / 0.7)), 'low', 900, 1)
        return shape(mix(1, [peakTo(breath), 0, 1], [peakTo(tone), 0, 0.6]), heldEnv(0.015, 0.55, 0.14))
      },
    },
    {
      // A console's roar: a square wave with a moving duty, 300 Hz down to 150, a fast vibrato, crushed to five bits so it stays a toy.
      name: 'chip-gebruell', ms: 1000, swell: true, fadeOut: 0.18, note: 'körniges Arcade-Gebrüll wie ein Spielmonster',
      make() {
        const roar = osc('square', 1, t => (300 - 150 * Math.min(1, t / 0.8)) * (1 + 0.03 * Math.sin(TAU * 18 * t)), { duty: t => 0.3 + 0.2 * Math.sin(TAU * 7 * t) })
        return crush(peakTo(shape(svf(roar, 'low', 1800, 0.9), heldEnv(0.02, 0.6, 0.11))), 5)
      },
    },
    {
      // A young animal (#771): the pitch rises first, 220 to 430 Hz in 0.28 s, then falls to 190, with a 14 Hz wobble; a saw and a sine an octave above it.
      // If it sounds sharp, lower the saw's share, not the contour: it must stay cute.
      name: 'jungtier-quaek', ms: 1000, swell: true, fadeOut: 0.22, note: 'ein junges Dino quäkt: hoch hinauf, dann wieder herunter',
      make() {
        const pitch = t => (t < 0.28 ? 220 + 210 * t / 0.28 : 430 - 240 * Math.min(1, (t - 0.28) / 0.57)) * (1 + 0.025 * Math.sin(TAU * 14 * t))
        const voice = mix(1, [peakTo(osc('saw', 1, pitch)), 0, 1], [peakTo(osc('sine', 1, t => pitch(t) * 2)), 0, 0.3])
        return shape(svf(voice, 'low', t => 2200 - 800 * Math.min(1, t / 0.8), 1), heldEnv(0.012, 0.6, 0.13))
      },
    },
  ],
}
