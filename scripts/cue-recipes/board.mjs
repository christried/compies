// The recipes of the Game board's cues (#742, spec #718): { name, note (German, what the operator reads), ms (the file's length),
// make(rng) -> Float64Array, swell?: true, fadeOut?: seconds }. make-cue-candidates.mjs loads every file of this folder and calls each `make` once
// with the noise seeded from the file path, so a rerun gives the same bytes. A recipe for no cue id, or two files for one id, fails there.
// The first recipe of each cue is the one that ships provisionally (ship-cue-sound.mjs): the one closest to the line of compibert-sound.md.
// Nothing here has been heard while writing it; the operator chooses in the listening session (#748).
import { TAU, buf, add, mix, peakTo, shape, expo, osc, noise, crush, svf, modal, bar, burst, thump } from '../cue-kit.mjs'

/** A rubber band's twang falling back: a triangle that dips and settles, its pitch following a damped wobble. */
const wobble = (seconds, base, depth, rate, tau) => shape(osc('tri', seconds, t => base + depth * Math.exp(-t / tau) * Math.cos(TAU * rate * t)), t => Math.min(1, t / 0.003) * Math.exp(-t / (seconds * 0.45)))

export default {
  // ---- drag-pick: the lift, a little "bloop" up, 0.12 s. Short and soft, a rising pitch with no tail. ---------------------------------------
  'drag-pick': [
    {
      // A bubble coming up in a toy bath: a sine that rises from 380 to 900 Hz and fades fast, with a hint of its octave.
      name: 'blubb-hoch', ms: 110, fadeOut: 0.012, note: 'kleines Blubb nach oben, weich',
      make() {
        const rise = t => 380 + 520 * (t / 0.11) ** 0.8
        return mix(0.11, [shape(osc('sine', 0.11, rise, { phase: 0.25 }), t => Math.min(1, t / 0.002) * Math.exp(-t / 0.05)), 0, 1], [shape(osc('sine', 0.11, t => 2 * rise(t), { phase: 0.25 }), t => Math.exp(-t / 0.025)), 0, 0.18])
      },
    },
    {
      // A cheap arcade jump: a square wave leaping from 500 to 1100 Hz, crushed to five bits, a hard stop.
      name: 'chip-huepfer', ms: 100, fadeOut: 0.008, note: 'Arcade-Hüpfer nach oben',
      make() {
        return shape(crush(osc('square', 0.1, t => 500 * (1100 / 500) ** (t / 0.1), { duty: 0.5 }), 5), t => Math.max(0, 1 - t / 0.1) ** 0.5)
      },
    },
    {
      // A felt hammer lifted off a wooden key: a soft low knock and a puff of air, a touch of rising band-passed noise on top.
      name: 'filz-abheben', ms: 90, fadeOut: 0.01, note: 'Filz löst sich vom Holz, kurz und leise',
      make(rng) {
        const air = shape(svf(noise(0.09, rng), 'band', t => 900 + 3000 * (t / 0.09), 1.2), t => Math.min(1, t / 0.002) * Math.exp(-t / 0.03))
        return mix(0.09, [thump(0.09, 420, 240, 0.02, 0.03), 0, 1], [peakTo(air), 0, 0.5])
      },
    },
    {
      // A cork leaving a bottle neck, tiny: a short hollow pop, a resonance that rises from 500 to 800 Hz.
      name: 'korken-plopp', ms: 100, fadeOut: 0.01, note: 'winziges Korken-Plopp',
      make(rng) {
        const body = shape(osc('sine', 0.1, t => 500 + 300 * (t / 0.1) ** 0.6, { phase: 0.25 }), t => Math.exp(-t / 0.04))
        return mix(0.1, [body, 0, 1], [burst(0.1, rng, 0.006, { bp: 1400, q: 0.8 }), 0, 0.4])
      },
    },
  ],

  // ---- drag-snap: the avatar clicks into its place, 0.15 s. A dry magnetic click, no tail. -----------------------------------------------
  'drag-snap': [
    {
      // Two magnets meeting: a hard high click, and under it a small dull knock, nothing rings on.
      name: 'magnet-klick', ms: 120, fadeOut: 0.01, note: 'trockenes Magnet-Klicken, kein Nachklang',
      make(rng) {
        return mix(0.12, [modal(0.12, [{ hz: 2800, tau: 0.004 }, { hz: 4300, amp: 0.5, tau: 0.003 }]), 0, 1], [burst(0.12, rng, 0.002, { hp: 3000 }), 0, 0.7], [thump(0.12, 300, 160, 0.012, 0.02), 0, 0.8])
      },
    },
    {
      // An arcade lock-in: two quick square blips, 880 then 1320 Hz, crushed to four bits.
      name: 'chip-einrasten', ms: 110, fadeOut: 0.008, note: 'zwei kurze Arcade-Blips, der zweite höher',
      make() {
        const blip = (hz, len) => shape(crush(osc('square', len, hz, { duty: 0.5 }), 4), t => Math.max(0, 1 - t / len) ** 0.7)
        return mix(0.11, [blip(880, 0.05), 0, 0.9], [blip(1320, 0.055), 0.05, 1])
      },
    },
    {
      // A card slid into a slot of a wooden box: a flat paper swish that ends in a dry wooden tock.
      name: 'karte-in-schlitz', ms: 140, fadeOut: 0.012, note: 'Papier gleitet ein, trockenes Holz-Tock',
      make(rng) {
        const swish = shape(svf(noise(0.06, rng), 'band', 3200, 0.9), t => Math.min(1, t / 0.002) * Math.exp(-t / 0.03))
        return mix(0.14, [peakTo(swish), 0, 0.5], [bar(0.14, 700, 0.02, { tilt: 0.4 }), 0.045, 1])
      },
    },
    {
      // A peg pressed into its hole: a tight wooden tick and a small hollow thud together, soft felt at the end.
      name: 'stift-ins-loch', ms: 100, fadeOut: 0.01, note: 'Holzstift sitzt im Loch, kurz und dumpf',
      make(rng) {
        return mix(0.1, [bar(0.1, 1100, 0.012, { tilt: 0.45 }), 0, 1], [thump(0.1, 220, 120, 0.015, 0.02), 0, 0.9], [burst(0.1, rng, 0.003, { bp: 2400, q: 0.9 }), 0, 0.4])
      },
    },
  ],

  // ---- drag-reject: the avatar bounces home, 0.35 s. A rubber boing that falls back down. ----------------------------------------------
  'drag-reject': [
    {
      // A rubber band twanged and let go: a pitch that wobbles from 520 Hz down towards 240 and settles.
      name: 'gummi-boing', ms: 330, fadeOut: 0.04, note: 'Gummiband-Boing, fällt zurück',
      make() {
        return wobble(0.33, 300, 260, 14, 0.11)
      },
    },
    {
      // A cheap arcade "nope": a pulse wave that falls in two steps, 440 then 260 Hz, crushed to four bits.
      name: 'chip-nope', ms: 300, fadeOut: 0.03, note: 'Arcade-Nope, zwei Stufen abwärts',
      make() {
        const step = (hz, len) => shape(crush(osc('square', len, hz, { duty: 0.3 }), 4), t => Math.max(0, 1 - t / len) ** 0.5)
        return mix(0.3, [step(440, 0.14), 0, 1], [step(260, 0.16), 0.14, 0.9])
      },
    },
    {
      // A soft felt thud and a slide whistle sliding home: a rounded thump, then a sine that falls from 900 to 300 Hz.
      name: 'filz-plumps', ms: 300, fadeOut: 0.04, note: 'weicher Plumps, dann Pfeifton nach unten',
      make() {
        const slide = shape(osc('sine', 0.26, t => 900 - 600 * (t / 0.26) ** 0.7, { phase: 0.25 }), t => Math.min(1, t / 0.004) * Math.min(1, (0.26 - t) / 0.05))
        return mix(0.3, [thump(0.3, 260, 110, 0.03, 0.05), 0, 0.8], [slide, 0.02, 0.6])
      },
    },
    {
      // A door spring: a metal twang, two inharmonic partials with a vibrato that slows down while it dies away.
      name: 'tuerfeder', ms: 340, fadeOut: 0.05, note: 'Türfeder-Sproing, schwingt aus',
      make() {
        const tone = hz => shape(osc('sine', 0.34, t => hz * (1 + 0.06 * Math.exp(-t / 0.12) * Math.sin(TAU * (30 - 60 * t) * t)), { phase: 0.25 }), t => Math.min(1, t / 0.002) * Math.exp(-t / 0.1))
        const out = buf(0.34)
        add(out, tone(330), 0, 1)
        add(out, tone(330 * 2.4), 0, 0.4)
        return out
      },
    },
  ],
}
