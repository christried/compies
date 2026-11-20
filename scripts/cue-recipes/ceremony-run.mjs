// The recipes of the Award ceremony's run (#743, spec #718): the banner's drop, a place sliding in, the run, and the two gags. Four ideas for each
// cue, different in kind (tabletop toys, a cheap arcade, soft felt and paper, one more). Nothing here has been heard while writing it: each recipe
// reasons from the physics of the sound it names, and the operator's ear decides in the listening session (#748). Same contract as the other files
// of this folder (scripts/cue-recipes/veto.mjs): { name, note (German), ms, make(rng) -> Float64Array, swell?, fadeOut? }.
import { TAU, burst, crush, crushNoise, expo, mix, modal, noise, osc, peakTo, shape, svf, thump, bar } from '../cue-kit.mjs'

export default {
  // ---- cer-drop: a banner thud, 0.3 s. The banner falls and overshoots (back.out), so one heavy hit, no tail. ------------------------------------
  'cer-drop': [
    {
      // A plank dropped on a tabletop: a low thump, the knock of the wood above it and a dry slap of air.
      name: 'holz-brett', ms: 300, note: 'Brett fällt auf den Tisch, trocken',
      make(rng) {
        return mix(0.3, [thump(0.3, 160, 70, 0.04, 0.09), 0, 1], [burst(0.3, rng, 0.006, { lp: 1800 }), 0, 0.6], [bar(0.3, 330, 0.05), 0, 0.3])
      },
    },
    {
      // An arcade bump: a square wave that falls from 240 to 60 Hz in a hurry, crushed to five bits.
      name: 'chip-plumps', ms: 250, note: 'Arcade-Plumps, fallende Rechteckwelle',
      make() {
        return shape(crush(osc('square', 0.25, t => 60 + 180 * Math.exp(-t / 0.05), { duty: 0.5 }), 5), expo(0.07))
      },
    },
    {
      // A felt cushion dropped from a hand's height: a rounded 120 to 55 Hz sine and a muffled breath of noise, no edge at all.
      name: 'filz-kissen', ms: 300, note: 'Kissen plumpst, weich und tief',
      make(rng) {
        return mix(0.3, [thump(0.3, 120, 55, 0.06, 0.1), 0, 1], [burst(0.3, rng, 0.015, { lp: 700 }), 0, 0.8])
      },
    },
    {
      // A cloth banner: the flap of the fabric first, the weight of the hem a moment later.
      name: 'tuch-klatsch', ms: 300, note: 'Stoffbanner klatscht, dann der Saum',
      make(rng) {
        return mix(0.3, [burst(0.1, rng, 0.02, { bp: 1200, q: 0.6 }), 0, 0.9], [thump(0.25, 140, 65, 0.035, 0.08), 0.03, 1])
      },
    },
  ],

  // ---- cer-row: a place slides in, 0.25 s, the pitch rises with rank. TONAL (noise would not show the rise), below 8 kHz: it plays up to a tritone higher. -
  'cer-row': [
    {
      // A marimba bar: the strike and the free-bar overtones of a 523 Hz wooden bar.
      name: 'holz-marimba', ms: 250, note: 'Holzstab, Marimba-Ton',
      make(rng) {
        return mix(0.25, [bar(0.25, 523, 0.07), 0, 1], [burst(0.25, rng, 0.002, { hp: 2000 }), 0, 0.3])
      },
    },
    {
      // An arcade blip with a small climb: a 25 % pulse from 660 to 880 Hz in 40 ms, then holding, crushed to six bits.
      name: 'chip-blip', ms: 200, fadeOut: 0.02, note: 'Arcade-Blip mit kleinem Aufstieg',
      make() {
        const sig = osc('square', 0.2, t => 660 + 220 * Math.min(1, t / 0.04), { duty: 0.25 })
        return shape(crush(sig, 6), t => (t < 0.12 ? 1 : Math.exp(-(t - 0.12) / 0.04)))
      },
    },
    {
      // A soft bell of felt: a 392 Hz sine with two quieter overtones and a muffled thump under it.
      name: 'filz-glocke', ms: 250, note: 'weicher Glockenton, Filzhammer',
      make(rng) {
        return mix(0.25, [modal(0.25, [{ hz: 392, tau: 0.08 }, { hz: 784, amp: 0.4, tau: 0.05 }, { hz: 1176, amp: 0.15, tau: 0.03 }]), 0, 1], [burst(0.25, rng, 0.01, { lp: 600 }), 0, 0.3])
      },
    },
    {
      // A slide whistle that glides up in 80 ms and rings on at 600 Hz: the place slides in.
      name: 'schwupp-pfeife', ms: 250, note: 'Gleitpfeife schwupp, klingt oben nach',
      make() {
        const sig = osc('sine', 0.25, t => 400 + 200 * Math.min(1, t / 0.08))
        return shape(sig, t => (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / 0.09)))
      },
    },
  ],

  // ---- cer-run: the run, 0.7 s (CEREMONY_RUN_MS): about five footfalls and the trophy's rattle, which bobs every 0.15 s. -----------------------
  'cer-run': [
    {
      // Five wooden footfalls, a little louder each, and a small metal ping of the trophy between them.
      name: 'holz-stapfen', ms: 700, note: 'fünf Holzschritte, dazwischen das Pokal-Klingeln',
      make() {
        const feet = [0, 0.14, 0.28, 0.42, 0.56].map((t, i) => [bar(0.12, 280, 0.025, { tilt: 0.4 }), t, 0.7 + 0.075 * i])
        const ping = modal(0.06, [{ hz: 2300, tau: 0.02 }, { hz: 3700, amp: 0.6, tau: 0.012 }])
        return mix(0.7, ...feet, ...[0.07, 0.22, 0.37, 0.52, 0.67].map(t => [ping, t, 0.3]))
      },
    },
    {
      // A cheap console's walk: five bursts of grainy noise as steps, and a small 25 % pulse ding on every bob.
      name: 'chip-lauf', ms: 700, note: 'Arcade-Lauf, Rauschschritte und Ding',
      make(rng) {
        const steps = [0, 0.14, 0.28, 0.42, 0.56].map(t => [shape(crushNoise(0.05, rng, 6000), expo(0.012)), t, 0.8])
        const ding = shape(crush(osc('square', 0.05, 1320, { duty: 0.25 }), 5), expo(0.02))
        return mix(0.7, ...steps, ...[0.07, 0.22, 0.37, 0.52, 0.67].map(t => [ding, t, 0.35]))
      },
    },
    {
      // Soft felt steps: five dull thumps and a breath of paper rustle that swells with every bob.
      name: 'filz-tapsen', ms: 650, note: 'weiche Filzschritte, Papier raschelt mit',
      make(rng) {
        const feet = [0, 0.15, 0.3, 0.45, 0.6].map((t, i) => [thump(0.12, 150, 70, 0.025, 0.035), t, 0.8 + 0.04 * i])
        const rustle = shape(peakTo(svf(noise(0.65, rng), 'band', 2800, 0.7)), t => 0.12 + 0.1 * Math.sin(TAU * 6.67 * t) ** 2)
        return mix(0.65, ...feet, [rustle, 0, 0.35])
      },
    },
    {
      // A toy robot's trot: a low and a high wooden tock for every stride, and a woodblock ratchet under all of it for the rattle.
      name: 'klapper-trab', ms: 700, note: 'Spielzeug-Trab, Tok-Tak mit Ratschen',
      make(rng) {
        const strides = [0, 0.14, 0.28, 0.42, 0.56].flatMap(t => [[bar(0.08, 420, 0.02), t, 1], [bar(0.08, 640, 0.02), t + 0.06, 0.8]])
        const ratchet = Array.from({ length: 26 }, (_, k) => [burst(0.01, rng, 0.002, { hp: 1500 }), k * 0.025, 0.25])
        return mix(0.7, ...strides, ...ratchet)
      },
    },
  ],

  // ---- cer-trip: Stolpern, 0.4 s: he trips over the trophy, a stumble that ends in a thud. -------------------------------------------------------
  'cer-trip': [
    {
      // Two quick wooden ticks of a toe against the block, a wobbling slide down, then the fall.
      name: 'holz-stolper', ms: 400, note: 'zwei Holzticks, Rutsch nach unten, Plumps',
      make() {
        const slide = shape(osc('sine', 0.2, t => 640 - 400 * (t / 0.2)), t => Math.sin(Math.PI * t / 0.2) * 0.8)
        return mix(0.4, [bar(0.06, 700, 0.012), 0, 1], [bar(0.06, 560, 0.012), 0.07, 0.9], [slide, 0.1, 0.5], [thump(0.12, 130, 60, 0.03, 0.05), 0.29, 1.2])
      },
    },
    {
      // A "womp womp" of the arcade: three falling pulse notes, then a crushed low square for the thud.
      name: 'chip-stolper', ms: 400, fadeOut: 0.02, note: 'Arcade-Womp, drei fallende Töne, dumpfer Aufprall',
      make() {
        const notes = [523.25, 392, 329.63]
        const run = shape(crush(osc('square', 0.24, t => notes[Math.min(2, Math.floor(t / 0.08))], { duty: 0.25 }), 5), t => 0.7 * Math.exp(-(t % 0.08) / 0.05))
        const thud = shape(crush(osc('square', 0.16, t => 50 + 90 * Math.exp(-t / 0.03)), 4), expo(0.05))
        return mix(0.4, [run, 0, 0.8], [thud, 0.24, 1])
      },
    },
    {
      // A scuff of a sole on felt, a short wobble as he loses his balance, a muffled landing.
      name: 'filz-stolper', ms: 400, note: 'Schuh schleift, Wackeln, dumpfes Landen',
      make(rng) {
        const scuff = shape(peakTo(svf(noise(0.12, rng), 'band', 1800, 0.6)), expo(0.04))
        const wobble = shape(osc('sine', 0.15, t => 280 - 120 * t / 0.15), t => Math.sin(Math.PI * t / 0.15) * 0.5)
        return mix(0.4, [scuff, 0, 0.9], [wobble, 0.08, 0.5], [thump(0.14, 110, 55, 0.04, 0.06), 0.27, 1.1])
      },
    },
    {
      // A ball that bounces to rest: six ticks closing in on each other, then one big thud.
      name: 'purzel-ticks', ms: 400, note: 'Hüpfer werden schneller, dann ein Plumps',
      make() {
        const bounces = [0, 0.09, 0.165, 0.225, 0.27, 0.305].map((t, i) => [bar(0.05, 500 - 20 * i, 0.012), t, 1 - 0.12 * i])
        return mix(0.4, ...bounces, [thump(0.08, 120, 60, 0.02, 0.04), 0.32, 1.2])
      },
    },
  ],

  // ---- cer-bonk: Volltreffer, 0.4 s: the trophy lands on his head. A hollow knock with a wobble. --------------------------------------------------
  'cer-bonk': [
    {
      // A hollow wooden knock, a short "boing" that wobbles at 14 Hz, and the click of the strike.
      name: 'holz-bonk', ms: 400, note: 'hohles Holzklopfen mit Boing',
      make(rng) {
        const knock = modal(0.4, [{ hz: 480, tau: 0.07 }, { hz: 1180, amp: 0.5, tau: 0.04 }, { hz: 2100, amp: 0.25, tau: 0.025 }])
        const boing = shape(osc('sine', 0.3, t => 260 + 30 * Math.sin(TAU * 14 * t)), t => 0.45 * Math.exp(-t / 0.12))
        return mix(0.4, [knock, 0, 1], [boing, 0.02, 0.7], [burst(0.4, rng, 0.003, { hp: 1500 }), 0, 0.5])
      },
    },
    {
      // An arcade "boing": a square wave that falls from 320 to 180 Hz with a vibrato, crushed to five bits.
      name: 'chip-boing', ms: 400, fadeOut: 0.03, note: 'Arcade-Boing, wackelnde Rechteckwelle',
      make() {
        const sig = osc('square', 0.4, t => 180 + 140 * Math.exp(-t / 0.1) + 25 * Math.sin(TAU * 12 * t), { duty: 0.5 })
        return shape(crush(sig, 5), expo(0.14))
      },
    },
    {
      // A muffled thump on a cushioned head and a low tremolo of 230 Hz that rings on.
      name: 'filz-bonk', ms: 400, note: 'dumpfer Bonk, tiefes Nachwackeln',
      make(rng) {
        const wobble = shape(osc('sine', 0.4, 230), t => (0.6 + 0.4 * Math.sin(TAU * 9 * t)) * Math.exp(-t / 0.12))
        return mix(0.4, [thump(0.4, 170, 90, 0.05, 0.1), 0, 1], [wobble, 0, 0.5], [burst(0.4, rng, 0.01, { lp: 900 }), 0, 0.4])
      },
    },
    {
      // A cartoon bell struck on a head: a 640 Hz bar that rings and beats at 14 Hz, with a thump under the strike.
      name: 'glocke-bonk', ms: 400, note: 'Glocke auf dem Kopf, klingt wabernd nach',
      make() {
        const ring = shape(bar(0.4, 640, 0.14), t => 0.7 + 0.3 * Math.sin(TAU * 14 * t + Math.PI / 2))
        return mix(0.4, [ring, 0, 1], [thump(0.12, 200, 90, 0.02, 0.04), 0, 0.6])
      },
    },
  ],
}
