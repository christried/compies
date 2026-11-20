// The recipes of the Award ceremony's peak (#744, spec #718): the „SIEGER“ stamp, the fanfare on it and the crowd under the fanfare. Four ideas for
// each cue, different in kind (tabletop toys, a cheap arcade, felt and paper, one more). Nothing here has been heard while writing it: each recipe
// reasons from the physics of the sound it names, and the operator's ear decides in the listening session (#748). Same contract as the other files
// of this folder (scripts/cue-recipes/veto.mjs): { name, note (German), ms, make(rng) -> Float64Array, swell?, fadeOut? }.
import { TAU, bar, brass, burst, crush, crushNoise, heldEnv, mix, noise, osc, peakTo, shape, svf, thump } from '../cue-kit.mjs'

// The notes of the fanfares, in Hz: C5, E5, G5, C6.
const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

/** A cheer that is already going when it starts, rises to its full roar and holds: 0.35 at the first sample, full after about 0.4 s. */
const roar = t => 0.35 + 0.65 * (1 - Math.exp(-t / 0.15))

export default {
  // ---- cer-stamp: the „SIEGER“ stamp, 0.2 s. One heavy hit on the card, no tail. ----------------------------------------------------------------
  'cer-stamp': [
    {
      // A rubber stamp pressed hard on a card: a low thump and the dull slap of rubber on paper.
      name: 'gummi-stempel', ms: 200, note: 'Gummistempel auf Karton, dumpf',
      make(rng) {
        return mix(0.2, [thump(0.2, 150, 60, 0.03, 0.06), 0, 1], [burst(0.2, rng, 0.015, { lp: 1500 }), 0, 0.7])
      },
    },
    {
      // A metal office stamp: the same thump, and the short ring of the metal body above it.
      name: 'metall-stempel', ms: 200, note: 'Metallstempel, kurzes Nachklingen',
      make(rng) {
        return mix(0.2, [thump(0.2, 140, 65, 0.03, 0.05), 0, 1], [bar(0.2, 620, 0.05), 0, 0.35], [burst(0.2, rng, 0.008, { lp: 2500 }), 0, 0.5])
      },
    },
    {
      // A stamp with a felt pad: a rounded, low thud, hardly any edge.
      name: 'filz-stempel', ms: 150, note: 'Filzpolster, tiefer weicher Schlag',
      make(rng) {
        return mix(0.15, [thump(0.15, 110, 55, 0.05, 0.07), 0, 1], [burst(0.15, rng, 0.012, { lp: 600 }), 0, 0.6])
      },
    },
    {
      // A wooden handle knocking on the table as the stamp lands: a knock of the wood on top of the thump.
      name: 'holz-griff', ms: 200, note: 'Holzgriff schlägt auf den Tisch',
      make(rng) {
        return mix(0.2, [thump(0.2, 160, 70, 0.025, 0.05), 0, 1], [bar(0.2, 330, 0.04), 0, 0.5], [burst(0.2, rng, 0.004, { hp: 1500 }), 0, 0.3])
      },
    },
  ],

  // ---- cer-fanfare: a brassy toy fanfare, 2.5 s, the loudest cue. Three notes stepping up, then a held one. ------------------------------------
  'cer-fanfare': [
    {
      // A toy trumpet: a square wave through a low-pass, three notes of 0.4 s and a held high C with a little vibrato.
      name: 'spielzeug-trompete', ms: 2500, fadeOut: 0.08, note: 'Spielzeugtrompete: C, E, G, dann ein langes C',
      make() {
        const note = (hz, length) => svf(shape(osc('square', length + 0.4, t => hz * (1 + 0.008 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.4))), heldEnv(0.002, length, 0.08)), 'low', 2600)
        return mix(2.5, [note(C5, 0.4), 0, 1], [note(E5, 0.4), 0.5, 1], [note(G5, 0.4), 1, 1], [note(C6, 1.1), 1.5, 1])
      },
    },
    {
      // A tin brass band: the harmonic series of each note, struck, the held note ringing out.
      name: 'blech-kapelle', ms: 2500, fadeOut: 0.08, note: 'Blechbläser, Obertonreihe, langes Ausklingen',
      make() {
        const note = (hz, tau) => brass(1.2, hz, tau, { rolloff: 1.1 })
        return peakTo(mix(2.5, [note(C5, 0.35), 0, 1], [note(E5, 0.35), 0.5, 1], [note(G5, 0.35), 1, 1], [note(C6, 0.8), 1.5, 1]))
      },
    },
    {
      // An arcade jingle: a fast arpeggio of a 25 % pulse, crushed to five bits, then the high C held.
      name: 'chip-arpeggio', ms: 1800, fadeOut: 0.06, note: 'Arcade-Jingle, schneller Dreiklang, hohes C',
      make() {
        const step = [C5, E5, G5, C6, E5 * 2, G5 * 2]
        const run = step.map((hz, i) => [shape(osc('square', 0.14, hz, { duty: 0.25 }), heldEnv(0.001, 0.09, 0.02)), i * 0.12, 1])
        const held = shape(osc('square', 1.2, C6 * 2, { duty: 0.25 }), heldEnv(0.001, 0.7, 0.15))
        return crush(mix(1.8, ...run, [held, 0.72, 1]), 5)
      },
    },
    {
      // A party kazoo: a sawtooth with a buzzing tremolo, four rising notes, the last one held.
      name: 'kazoo-fanfare', ms: 2200, fadeOut: 0.1, note: 'Partykazoo, brummend, vier steigende Töne',
      make() {
        const note = (hz, length) => svf(shape(osc('saw', length + 0.4, hz), t => heldEnv(0.003, length, 0.07)(t) * (0.8 + 0.2 * Math.sin(TAU * 28 * t))), 'low', 3200)
        return mix(2.2, [note(G5 / 2, 0.3), 0, 1], [note(C5, 0.3), 0.4, 1], [note(E5, 0.3), 0.8, 1], [note(G5, 1.1), 1.2, 1])
      },
    },
  ],

  // ---- cer-crowd: a cheer under the fanfare, 2 s. A swell by nature: it is already going at the first sample, and leaves softly. ----------------
  'cer-crowd': [
    {
      // A crowd in a hall: noise through a band-pass around 1.6 kHz and a murmur below it, a roar that holds and fades.
      name: 'saal-publikum', ms: 2000, swell: true, fadeOut: 0.3, note: 'Publikum im Saal, Rauschen, das anschwillt',
      make(rng) {
        const bed = svf(noise(2, rng), 'band', 1600, 0.8)
        const murmur = svf(noise(2, rng), 'band', 700, 1)
        return shape(mix(2, [peakTo(bed), 0, 1], [peakTo(murmur), 0, 0.5]), t => roar(t) * (t < 1.3 ? 1 : Math.exp(-(t - 1.3) / 0.35)))
      },
    },
    {
      // A cheer from a cheap console: held noise, crushed, band-passed so it stays grainy.
      name: 'chip-publikum', ms: 2000, swell: true, fadeOut: 0.3, note: 'Arcade-Jubel, körniges Rauschen',
      make(rng) {
        const grain = crush(crushNoise(2, rng, 9000), 4)
        return shape(peakTo(svf(grain, 'band', 2000, 0.7)), t => roar(t) * (t < 1.2 ? 1 : Math.exp(-(t - 1.2) / 0.3)))
      },
    },
    {
      // Applause: sixty claps scattered over the first 1.6 s, a thin bed of noise under them so it never goes quiet.
      name: 'klatsch-publikum', ms: 2000, swell: true, fadeOut: 0.3, note: 'Applaus, viele einzelne Klatscher',
      make(rng) {
        const claps = Array.from({ length: 60 }, (_, i) => [burst(0.08, rng, 0.012, { bp: 1800 + 1200 * rng(), q: 0.7 }), i === 0 ? 0 : 1.7 * rng(), 0.5 + 0.5 * rng()])
        const bed = peakTo(svf(noise(2, rng), 'band', 2200, 0.8), 0.5)
        return shape(mix(2, ...claps, [bed, 0, 1]), t => roar(t) * (t < 1.3 ? 1 : Math.exp(-(t - 1.3) / 0.3)))
      },
    },
    {
      // A cheer with whistles: the band-passed bed and three cheering whistles gliding up over it.
      name: 'jubel-pfeifen', ms: 2000, swell: true, fadeOut: 0.3, note: 'Jubel mit Pfiffen, die nach oben gleiten',
      make(rng) {
        const bed = peakTo(svf(noise(2, rng), 'band', 1400, 0.8))
        const whistle = (from, to) => shape(osc('sine', 0.5, t => from + (to - from) * Math.min(1, t / 0.3)), t => Math.min(1, t / 0.02) * Math.exp(-t / 0.3))
        return shape(mix(2, [bed, 0, 1], [whistle(2200, 3200), 0.2, 0.25], [whistle(2000, 3000), 0.6, 0.2], [whistle(2400, 3400), 1, 0.2]), t => roar(t) * (t < 1.3 ? 1 : Math.exp(-(t - 1.3) / 0.3)))
      },
    },
  ],
}
