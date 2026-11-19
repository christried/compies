// The recipes of the Standings' cues (#741, spec #718): { name, note (German, what the operator reads), ms (the file's length),
// make(rng) -> Float64Array, swell?: true, fadeOut?: seconds }. make-cue-candidates.mjs loads every file of this folder and calls each `make` once
// with the noise seeded from the file path, so a rerun gives the same bytes. A recipe for no cue id, or two files for one id, fails there.
// The first recipe of each cue is the one that ships provisionally (ship-cue-sound.mjs): the one closest to the line of compibert-sound.md.
// Nothing here has been heard while writing it; the operator chooses in the listening session (#748).
import { TAU, buf, add, mix, peakTo, shape, expo, osc, noise, crushNoise, crush, svf, modal, bar, burst, thump } from '../cue-kit.mjs'

/** A confetti pop: a short dull "pomp" of air and a rounded thump under it. */
const pop = rng => mix(0.08, [burst(0.08, rng, 0.012, { hp: 300, lp: 5200 }), 0, 1], [thump(0.08, 380, 150, 0.012, 0.025), 0, 0.6])

export default {
  // ---- lb-swap: rows swap, a quick double whoosh, 0.3 s. Two short strokes, the second a little higher and a little louder. -------------------
  'lb-swap': [
    {
      // Two quick strokes of a hand over paper: a band of noise sweeps up (700 to 2600 Hz, then 1100 to 3800 Hz), each with a fast attack and a slow fall.
      name: 'doppel-wisch', ms: 280, swell: true, fadeOut: 0.01, note: 'zwei schnelle Wisch-Geräusche, das zweite höher',
      make(rng) {
        const whoosh = (len, lo, hi) => shape(peakTo(svf(noise(len, rng), 'band', t => lo * (hi / lo) ** (t / len), 1.1)), t => Math.min(1, t / 0.003) * Math.exp(-t / (len * 0.4)))
        return mix(0.28, [whoosh(0.13, 700, 2600), 0, 0.85], [whoosh(0.13, 1100, 3800), 0.13, 1])
      },
    },
    {
      // Two arcade slides, each a pulse wave rising in a quarter of a second's half (350 to 1400 Hz, then 500 to 1900 Hz), crushed to five bits.
      name: 'chip-doppelsprung', ms: 250, fadeOut: 0.012, note: 'zwei Arcade-Gleiter nach oben',
      make() {
        const slide = (len, from, to) => shape(crush(osc('square', len, t => from * (to / from) ** (t / len), { duty: 0.25 }), 5), t => Math.max(0, 1 - t / len) ** 0.6)
        return mix(0.25, [slide(0.11, 350, 1400), 0, 0.9], [slide(0.11, 500, 1900), 0.12, 1])
      },
    },
    {
      // Two cards flicked past each other: a band of noise around 3.2 kHz and the card's small wooden body, twice, 0.1 s apart.
      name: 'karten-schnipp', ms: 240, fadeOut: 0.012, note: 'zwei Kartenschnipser, trocken',
      make(rng) {
        const flick = () => mix(0.08, [burst(0.08, rng, 0.012, { bp: 3200, q: 0.9 }), 0, 1], [bar(0.08, 900, 0.015, { tilt: 0.4 }), 0, 0.35])
        return mix(0.24, [flick(), 0, 0.9], [flick(), 0.1, 1])
      },
    },
    {
      // A slide whistle that goes up and then down again, the two rows passing each other: 450 to 1350 Hz, then 1500 to 600 Hz.
      name: 'schiebe-hin-her', ms: 270, fadeOut: 0.015, note: 'Kazoo-Gleiten hoch und wieder runter',
      make() {
        const up = shape(osc('sine', 0.12, t => 450 + 900 * (t / 0.12) ** 1.2, { phase: 0.25 }), t => Math.min(1, t / 0.004) * Math.min(1, (0.12 - t) / 0.015))
        const down = shape(osc('sine', 0.12, t => 1500 - 900 * (t / 0.12) ** 1.2, { phase: 0.25 }), t => Math.min(1, t / 0.004) * Math.min(1, (0.12 - t) / 0.015))
        return mix(0.27, [up, 0, 0.9], [down, 0.125, 1])
      },
    },
  ],

  // ---- lb-count: a counter tick, one per displayed point, 15 a second at most, 25 ms. Dry and short, no tail. -----------------------------
  'lb-count': [
    {
      // A small mechanical counter: two high metal resonances and a low body, over a hairline click, quieter and higher than the wheel's flapper.
      name: 'zaehlwerk-tick', ms: 24, note: 'feines Zählwerk-Klick, trocken',
      make(rng) {
        const body = modal(0.024, [{ hz: 2400, tau: 0.004 }, { hz: 3700, amp: 0.5, tau: 0.003 }, { hz: 1100, amp: 0.6, tau: 0.006 }])
        return mix(0.024, [body, 0, 1], [burst(0.024, rng, 0.0007, { hp: 3500 }), 0, 0.7])
      },
    },
    {
      // An arcade blip: a flat 1.9 kHz square, a hard stop, crushed to four bits.
      name: 'chip-blip', ms: 22, note: 'kurzer Arcade-Blip, ein Punkt',
      make() {
        return shape(crush(osc('square', 0.022, 1900, { duty: 0.5 }), 4), t => (t < 0.006 ? 1 : Math.exp(-(t - 0.006) / 0.004)))
      },
    },
    {
      // A fingertip tapping felt: a rounded 420 Hz sine falling a little, and a muffled puff of air.
      name: 'filz-tipp', ms: 24, note: 'weiches Tippen auf Filz',
      make(rng) {
        return mix(0.024, [shape(osc('sine', 0.024, t => 420 - 120 * (t / 0.024), { phase: 0.25 }), expo(0.007)), 0, 1], [burst(0.024, rng, 0.004, { lp: 1500 }), 0, 0.5])
      },
    },
    {
      // A tiny coin ting: two bright resonances at 4.2 and 5.9 kHz, dying in a few ms.
      name: 'muenz-ting', ms: 24, note: 'winziges Münz-Ting, hell',
      make() {
        return modal(0.024, [{ hz: 4200, tau: 0.006 }, { hz: 5900, amp: 0.45, tau: 0.004 }])
      },
    },
  ],

  // ---- lb-winner: a mini celebration, a party horn and three confetti pops, 0.8 s. The pops land at 0.5, 0.6 and 0.7 s. -----------------
  'lb-winner': [
    {
      // A party horn blown once: a buzzing reed (a saw at 540 Hz rising to 600 with a little vibrato, and its octave), then three confetti pops.
      name: 'troete-knall', ms: 780, fadeOut: 0.02, note: 'Partytröte, dann drei Konfetti-Knalle',
      make(rng) {
        const reed = mix(0.42, [osc('saw', 0.42, t => 540 + 60 * (1 - Math.exp(-t / 0.05)) + 8 * Math.sin(TAU * 7 * t)), 0, 1], [osc('square', 0.42, t => 1080 + 120 * (1 - Math.exp(-t / 0.05)), { duty: 0.3 }), 0, 0.3])
        const horn = shape(peakTo(svf(reed, 'band', 1500, 0.6)), t => Math.min(1, t / 0.002) * Math.min(1, (0.42 - t) / 0.03))
        return mix(0.78, [horn, 0, 1], [pop(rng), 0.5, 0.8], [pop(rng), 0.6, 0.7], [pop(rng), 0.7, 0.8])
      },
    },
    {
      // A cheap arcade jingle: four pulse-wave notes (C5 E5 G5 C6, 60 ms each, the last holding) and three noise-channel pops.
      name: 'chip-jubel', ms: 700, fadeOut: 0.02, note: 'Arcade-Jingle, drei Rausch-Knalle',
      make(rng) {
        const notes = [523.25, 659.26, 783.99, 1046.5]
        const jingle = shape(crush(osc('square', 0.45, t => notes[Math.min(3, Math.floor(t / 0.06))], { duty: 0.25 }), 5), t => (t < 0.24 ? 0.8 : Math.exp(-(t - 0.24) / 0.07)))
        const noisePop = () => shape(crushNoise(0.07, rng, 7000), expo(0.014))
        return mix(0.7, [jingle, 0, 0.8], [noisePop(), 0.38, 0.9], [noisePop(), 0.48, 0.8], [noisePop(), 0.58, 0.9])
      },
    },
    {
      // Glockenspiel bars climbing (G5 B5 D6 G6, 70 ms apart) and three soft pops of tissue paper.
      name: 'glocken-jubel', ms: 780, fadeOut: 0.03, note: 'Glockenspiel steigt, drei weiche Papier-Knalle',
      make(rng) {
        const out = buf(0.78)
        for (const [i, hz] of [784, 988, 1175, 1568].entries()) add(out, bar(0.4, hz, 0.12), i * 0.07, 0.7 + 0.1 * i)
        const soft = () => mix(0.08, [burst(0.08, rng, 0.014, { hp: 400, lp: 2600 }), 0, 1], [thump(0.08, 300, 140, 0.015, 0.03), 0, 0.5])
        return mix(0.78, [out, 0, 0.8], [soft(), 0.5, 0.9], [soft(), 0.6, 0.8], [soft(), 0.7, 0.9])
      },
    },
    {
      // A noisemaker rattle (a wooden ratchet turning, 36 clicks a second slowing to 22) and three confetti pops after it.
      name: 'ratsche-konfetti', ms: 760, fadeOut: 0.02, note: 'Ratsche rattert aus, drei Konfetti-Knalle',
      make(rng) {
        const out = buf(0.76)
        let t = 0
        while (t < 0.42) {
          add(out, mix(0.02, [bar(0.02, 1300, 0.004, { tilt: 0.4 }), 0, 1], [burst(0.02, rng, 0.0015, { hp: 2000 }), 0, 0.5]), t, 0.55 * (1 - 0.4 * (t / 0.42)))
          t += 1 / (36 - 14 * (t / 0.42))
        }
        peakTo(out, 0.6)
        return mix(0.76, [out, 0, 1], [pop(rng), 0.48, 1], [pop(rng), 0.58, 0.85], [pop(rng), 0.68, 1])
      },
    },
  ],
}
