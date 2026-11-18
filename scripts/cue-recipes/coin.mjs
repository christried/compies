// The recipes of the Coin flip's cues (#669, spec #718): { name, note (German, what the operator reads), ms (the file's length),
// make(rng) -> Float64Array, swell?: true, fadeOut?: seconds }. make-cue-candidates.mjs loads every file of this folder and calls each `make` once
// with the noise seeded from the file path, so a rerun gives the same bytes. A recipe for no cue id, or two files for one id, fails there.
// The first recipe of each cue is the provisional file the app ships (#718 § The candidate process): the most faithful to the document's words.
// `coin-result` is one sound for Kopf and Schwanz (the sound must not tell the side before the landing, ADR 0013): no recipe leans on a pitch
// that stands for either face.
import { RATE, TAU, buf, mix, add, peakTo, shape, expo, osc, noise, crush, svf, modal, bar, burst, thump } from '../cue-kit.mjs'

export default {
  // ---- coin-toss: a thumb flick and a whoosh, 0.3 s. The flick is the transient (first 5 ms), the whoosh rises behind it. ---------------
  'coin-toss': [
    {
      // A thumbnail flicks the coin: a tiny dry click and a small metal ping at once, then a band of air that rises from 600 to 3500 Hz as the coin flies off.
      name: 'daumen-flick', ms: 300, fadeOut: 0.05, note: 'Daumen-Schnipp, dann steigendes Rauschen',
      make(rng) {
        const air = peakTo(svf(noise(0.3, rng), 'band', t => 600 * 5.8 ** (t / 0.28), 1))
        shape(air, t => Math.sin(Math.PI * Math.min(1, t / 0.28) ** 0.7) * (0.35 + 0.65 * Math.min(1, t / 0.02)))
        return mix(0.3, [burst(0.02, rng, 0.003, { hp: 2500 }), 0, 1], [bar(0.12, 2600, 0.02), 0, 0.5], [air, 0, 0.55])
      },
    },
    {
      // An arcade launch: a pulse wave sweeping up from 400 to 2400 Hz in 250 ms, crushed to five bits, the loudest right at the start.
      name: 'chip-flick', ms: 280, fadeOut: 0.04, note: 'Arcade-Start, Pulswelle gleitet hoch',
      make() {
        const sweep = osc('square', 0.28, t => 400 * 6 ** (t / 0.25), { duty: 0.25 })
        return shape(crush(sweep, 5), t => (t < 0.2 ? 0.55 + 0.45 * Math.exp(-t / 0.03) : Math.max(0, 1 - (t - 0.2) / 0.08) * 0.55))
      },
    },
    {
      // A soft puff: a rounded thump from the thumb and a felt-muffled breath of air that widens upward, no sharp edge.
      name: 'filz-wusch', ms: 300, fadeOut: 0.06, note: 'weiches Wusch, kein scharfer Rand',
      make(rng) {
        const breath = peakTo(svf(noise(0.3, rng), 'band', t => 400 * 4.5 ** (t / 0.3), 0.8))
        shape(breath, t => Math.sin(Math.PI * Math.min(1, t / 0.3) ** 0.8))
        return mix(0.3, [thump(0.08, 190, 120, 0.02, 0.03), 0, 1], [breath, 0, 0.6])
      },
    },
    {
      // A high bar ping, as if the coin rang on the thumb, and a trace of air behind it: the shortest and the most musical idea.
      name: 'muenz-ping', ms: 300, fadeOut: 0.08, note: 'kurzer hoher Ping und etwas Luft',
      make(rng) {
        const air = peakTo(svf(noise(0.3, rng), 'band', 3200, 0.7))
        shape(air, t => Math.exp(-t / 0.06))
        return mix(0.3, [bar(0.3, 2400, 0.06), 0, 1], [burst(0.01, rng, 0.002, { hp: 3500 }), 0, 0.6], [air, 0, 0.25])
      },
    },
  ],

  // ---- coin-spin: a metallic shimmer while the coin is in the air, 0.8 s. A swell by nature: it needs to be audible in 10 ms. -------------
  'coin-spin': [
    {
      // A coin spinning: five inharmonic metal partials (1800 Hz times 1, 1.52, 2.31, 3.07, 4.2) held by a slow shimmer of 7 Hz, thinning out toward the end.
      name: 'muenz-schimmer', ms: 800, swell: true, fadeOut: 0.12, note: 'metallisches Schimmern mit langsamem Flimmern',
      make() {
        const partials = [1, 1.52, 2.31, 3.07, 4.2].map((ratio, i) => shape(osc('sine', 0.8, 1800 * ratio, { phase: i * 0.13 }), t => 0.8 ** i * (0.75 + 0.25 * Math.cos(TAU * (7 + i) * t + i))))
        return shape(mix(0.8, ...partials.map(partial => [partial, 0, 1])), t => (0.45 + 0.55 * Math.min(1, t / 0.01)) * (1 - 0.65 * (t / 0.8)))
      },
    },
    {
      // A whirring top: a saw that is rounded off, its pitch drifting up from 420 to 760 Hz, chopped 28 times a second by the turning edge.
      name: 'kreisel-surren', ms: 800, swell: true, fadeOut: 0.1, note: 'Surren wie ein Kreisel, Tonhöhe wandert',
      make(rng) {
        const whirr = svf(osc('saw', 0.8, t => 420 + 340 * (t / 0.8) ** 1.2), 'low', t => 1400 + 1500 * (t / 0.8), 0.9)
        shape(whirr, t => (0.4 + 0.6 * Math.min(1, t / 0.01)) * (0.55 + 0.45 * Math.cos(TAU * 28 * t)) * (0.8 + 0.2 * Math.sin(Math.PI * t / 0.8)))
        return mix(0.8, [peakTo(whirr), 0, 1], [peakTo(svf(noise(0.8, rng), 'band', 3500, 1.2)), 0, 0.15])
      },
    },
    {
      // A cheap arcade shimmer: a pulse wave runs through four high notes every 20 ms (a trill), crushed to five bits, fading as the coin climbs.
      name: 'chip-trillern', ms: 800, swell: true, fadeOut: 0.1, note: 'schneller Arcade-Triller, flimmert',
      make() {
        const notes = [1568, 2093, 2637, 3136]
        const trill = osc('square', 0.8, t => notes[Math.floor(t / 0.02) % notes.length], { duty: 0.25 })
        return shape(crush(trill, 5), t => (0.5 + 0.5 * Math.min(1, t / 0.008)) * (1 - 0.7 * (t / 0.8)))
      },
    },
    {
      // Small bells in the air: nine glockenspiel pings between 1400 and 2800 Hz, one every 90 ms, each a little softer, with a breath of air under them.
      name: 'glocken-hauch', ms: 800, swell: true, fadeOut: 0.12, note: 'kleine Glöckchen, die durcheinander klingeln',
      make(rng) {
        const out = buf(0.8)
        const pitches = [1760, 2349, 1397, 2637, 1865, 2794, 1568, 2217, 2489]
        pitches.forEach((hz, i) => add(out, bar(0.3, hz, 0.12), i * 0.09, 1 - 0.07 * i))
        peakTo(out)
        const air = peakTo(svf(noise(0.8, rng), 'band', 4000, 0.6))
        shape(air, t => (0.3 + 0.7 * Math.min(1, t / 0.01)) * (1 - 0.8 * (t / 0.8)))
        return mix(0.8, [out, 0, 1], [air, 0, 0.12])
      },
    },
  ],

  // ---- coin-land: a clink and a wobble rattle, 0.5 s. The first clink is the transient; the bounces come faster and softer. -----------
  'coin-land': [
    {
      // A coin on a hard table: a bright clink, then five bounces that come faster and softer (0.11 s, then 65 % of each gap), and under them a wobble, the
      // ring of the coin's edge with a tremolo that speeds up from 20 to 100 Hz as it settles.
      name: 'klirr-wobble', ms: 500, fadeOut: 0.1, note: 'Klirren, Aufsetzer werden schneller und leiser, Wobbeln',
      make(rng) {
        const out = buf(0.5)
        const clink = () => modal(0.12, [{ hz: 3300, tau: 0.02 }, { hz: 5100, amp: 0.6, tau: 0.012 }, { hz: 2200, amp: 0.7, tau: 0.03 }])
        add(out, clink(), 0, 1)
        add(out, burst(0.01, rng, 0.002, { hp: 3000 }), 0, 0.5)
        let at = 0
        let gap = 0.11
        for (let n = 1; n <= 5; n++) {
          at += gap
          gap *= 0.65
          add(out, shape(clink(), expo(0.5)), at, 0.55 ** n)
        }
        let phase = 0
        const wobble = shape(modal(0.34, [{ hz: 2700, tau: 0.18 }, { hz: 4100, amp: 0.4, tau: 0.1 }]), (t) => {
          phase += (20 + 80 * (t / 0.34)) / RATE
          return 0.5 + 0.5 * Math.cos(TAU * phase)
        })
        add(out, peakTo(wobble), 0.14, 0.3)
        return out
      },
    },
    {
      // A coin on a wooden table: a dry knock of a hollow block with a low body, then three softer knocks and a small roll of grains.
      name: 'holz-tisch-klack', ms: 500, fadeOut: 0.08, note: 'trockenes Holzklacken, drei Nachklacker',
      make(rng) {
        const out = buf(0.5)
        add(out, bar(0.2, 950, 0.025, { tilt: 0.45 }), 0, 1)
        add(out, thump(0.08, 210, 130, 0.02, 0.03), 0, 0.5)
        add(out, burst(0.01, rng, 0.002, { hp: 1800 }), 0, 0.5)
        ;[0.12, 0.2, 0.25].forEach((at, i) => add(out, bar(0.1, 950 * (1 + 0.04 * i), 0.02, { tilt: 0.45 }), at, 0.55 - 0.15 * i))
        const roll = peakTo(svf(noise(0.2, rng), 'band', 1500, 1.2))
        shape(roll, t => (Math.sin(TAU * 70 * t) > 0.2 ? 1 : 0.1) * Math.exp(-t / 0.08))
        add(out, roll, 0.27, 0.12)
        return out
      },
    },
    {
      // An arcade bounce: four short square blips that fall in pitch (1800, 1350, 1000, 800 Hz), the gaps shrinking from 90 ms, the last one a tiny rattle.
      name: 'chip-huepfer', ms: 500, fadeOut: 0.06, note: 'Arcade-Hüpfer, werden kürzer und tiefer',
      make(rng) {
        const out = buf(0.5)
        let at = 0
        let gap = 0.09
        ;[1800, 1350, 1000, 800].forEach((hz, i) => {
          add(out, shape(crush(osc('square', 0.04, t => hz * (1 - 0.3 * (t / 0.04)), { duty: 0.25 }), 5), expo(0.02 + 0.01 * (3 - i))), at, 0.8 ** i)
          at += gap
          gap *= 0.7
        })
        add(out, shape(svf(noise(0.12, rng), 'high', 2500), expo(0.03)), at, 0.15)
        return out
      },
    },
    {
      // A coin on a felt mat: a soft plump of a low thump and a handful of tiny bright pings that tinkle out and thin away.
      name: 'filz-plumps-klimper', ms: 500, fadeOut: 0.1, note: 'weiches Plumps und kleines Klimpern',
      make(rng) {
        const out = buf(0.5)
        add(out, thump(0.12, 170, 100, 0.025, 0.05), 0, 1)
        add(out, burst(0.02, rng, 0.004, { lp: 1500 }), 0, 0.5)
        ;[0.03, 0.08, 0.13, 0.19, 0.25, 0.33].forEach((at, i) => add(out, bar(0.15, 2400 + 310 * ((i * 5) % 7), 0.04), at, 0.5 * 0.75 ** i))
        return out
      },
    },
  ],

  // ---- coin-result: a short sting, one sound for Kopf and for Schwanz, 0.4 s. --------------------------------------------------------
  'coin-result': [
    {
      // Two glockenspiel bar pings, G6 then C7 (a fifth up and a fourth to the octave: a closing figure, so it says "done", not a face).
      name: 'ting-zweiklang', ms: 400, fadeOut: 0.08, note: 'zwei helle Stabspiel-Pings, schließender Abgang',
      make(rng) {
        return mix(0.4, [bar(0.4, 1568, 0.09), 0, 1], [bar(0.31, 2093, 0.16), 0.09, 1], [burst(0.01, rng, 0.002, { hp: 4000 }), 0, 0.3])
      },
    },
    {
      // A console jingle's last two notes: pulse wave C6, G6 and a held C7 (50 ms each, the last one 200 ms), crushed to five bits.
      name: 'chip-stich', ms: 400, fadeOut: 0.06, note: 'Arcade-Fanfärchen: drei Pulstöne',
      make() {
        const notes = [[1046.5, 0, 0.05], [1568, 0.05, 0.1], [2093, 0.1, 0.4]]
        const sig = osc('square', 0.4, t => notes.find(([, , until]) => t < until)?.[0] ?? 2093, { duty: 0.25 })
        return shape(crush(sig, 5), t => (t < 0.1 ? 0.9 : Math.exp(-(t - 0.1) / 0.12)))
      },
    },
    {
      // A toy drum tush: a wooden block, a short tom and a small ratchet, a flat sting that carries no pitch at all.
      name: 'holz-tusch', ms: 400, fadeOut: 0.08, note: 'Holzblock, Tom und kurze Ratsche, ohne Tonhöhe',
      make(rng) {
        const out = buf(0.4)
        add(out, bar(0.2, 800, 0.03, { tilt: 0.45 }), 0, 1)
        add(out, thump(0.2, 175, 105, 0.04, 0.08), 0.02, 0.8)
        for (let n = 0; n < 4; n++) add(out, burst(0.05, rng, 0.01, { bp: 2200, q: 1 }), 0.12 + n * 0.045, 0.5 - 0.08 * n)
        return out
      },
    },
    {
      // A bell sting: a fifth (E6 and B6) struck together, a click on top, ringing out a little.
      name: 'glocken-stich', ms: 400, fadeOut: 0.1, note: 'heller Glockenakkord, klingt kurz aus',
      make(rng) {
        return mix(0.4, [bar(0.4, 1319, 0.12), 0, 1], [bar(0.4, 1976, 0.1), 0, 0.8], [burst(0.01, rng, 0.002, { hp: 3000 }), 0, 0.4])
      },
    },
  ],
}
