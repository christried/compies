// The recipes of the lucky wheel's cues (#535, split per moment by #740): { name, note (German, what the operator reads), ms (the file's length),
// make(rng) -> Float64Array, swell?: true, fadeOut?: seconds }. make-cue-candidates.mjs loads every file of this folder and calls each `make` once
// with the noise seeded from the file path, so a rerun gives the same bytes. A recipe for no cue id, or two files for one id, fails there.
import { RATE, TAU, buf, mix, add, peakTo, shape, expo, osc, noise, crushNoise, crush, svf, modal, bar, burst, thump, pluckEnv } from '../cue-kit.mjs'

export default {
  // ---- wheel-tick: a plastic flapper over a peg, up to 25 a second. Short, no tail that smears; the transient is the whole sound. ---------
  'wheel-tick': [
    {
      // A thin plastic tongue snapping off a peg: bright, three high resonances that die in a few ms, plus the flick's noise.
      name: 'plastik-klapper', ms: 24, note: 'heller Plastikklapper, knackig',
      make(rng) {
        const body = modal(0.024, [{ hz: 2100, tau: 0.0045 }, { hz: 3350, amp: 0.6, tau: 0.003 }, { hz: 5200, amp: 0.35, tau: 0.002 }])
        return mix(0.024, [body, 0, 1], [burst(0.024, rng, 0.0007, { hp: 3500 }), 0, 0.8])
      },
    },
    {
      // A small wooden block: bar overtones, lower and rounder than plastic, a dry "tok".
      name: 'holz-klick', ms: 26, note: 'trockener Holzklick, hoch',
      make(rng) {
        return mix(0.026, [bar(0.026, 1250, 0.006, { tilt: 0.35 }), 0, 1], [burst(0.026, rng, 0.0008, { bp: 2600, q: 1.2 }), 0, 0.5])
      },
    },
    {
      // A cheap arcade pip: a 25 % pulse wave dropping a fifth in 14 ms, crushed to 5 bits.
      name: 'chip-pip', ms: 22, note: 'Arcade-Pip, kurz nach unten',
      make() {
        const pip = osc('square', 0.022, t => 1400 + 800 * Math.exp(-t / 0.006), { duty: 0.25 })
        return shape(crush(pip, 5), pluckEnv(0.0004, 0.007))
      },
    },
    {
      // Felt on wood: a rounded sine "dup" and a muffled noise touch, nothing bright at all.
      name: 'filz-tupf', ms: 28, note: 'weiches Filz-Tupfen, tief',
      make(rng) {
        return mix(0.028, [shape(osc('sine', 0.028, 520, { phase: 0.25 }), expo(0.007)), 0, 1], [burst(0.028, rng, 0.003, { lp: 1200 }), 0, 0.5])
      },
    },
  ],

  // ---- wheel-windup: a ratchet pulled back, 0.5 s. A spring winds tighter, so the clicks come faster and a touch higher. ------------------
  'wheel-windup': [
    {
      // A wooden ratchet pawl over wooden teeth: twelve wood clicks, the gap shrinking by a tenth each time, louder and higher as it tightens.
      name: 'holz-ratsche', ms: 500, fadeOut: 0.01, note: 'Holzratsche, wird schneller',
      make(rng) {
        const out = buf(0.5)
        let t = 0
        let gap = 0.062
        while (t < 0.47) {
          const f = t / 0.5
          add(out, mix(0.03, [bar(0.03, 750 + 650 * f, 0.005), 0, 1], [burst(0.03, rng, 0.0008, { hp: 2500 }), 0, 0.6]), t, 0.5 + 0.5 * f)
          t += gap
          gap *= 0.915
        }
        return out
      },
    },
    {
      // Arcade "charging up": twelve square-wave steps a minor third apart, each with a small blip so the steps stay audible.
      name: 'chip-aufzug', ms: 500, note: 'Arcade-Aufladen, Stufen nach oben',
      make() {
        const step = 0.5 / 12
        const sig = osc('square', 0.5, t => 196 * 2 ** (Math.floor(t / step) * 3 / 12), { duty: 0.25 })
        return shape(sig, t => 0.6 + 0.4 * Math.exp(-(t % step) / 0.04))
      },
    },
    {
      // A wind-up toy's key: fourteen small metal tine clicks at an even gap, each a step higher.
      name: 'spielzeug-kurbel', ms: 500, fadeOut: 0.01, note: 'Aufzieh-Spielzeug, Zähnchen steigen',
      make(rng) {
        const out = buf(0.5)
        for (let k = 0; k < 14; k++) {
          const hz = 1100 * 2 ** (k * 1.2 / 12)
          const click = mix(0.03, [modal(0.03, [{ hz, tau: 0.006 }, { hz: hz * 2.4, amp: 0.5, tau: 0.0035 }]), 0, 1], [burst(0.03, rng, 0.0007, { hp: 3000 }), 0, 0.4])
          add(out, click, k * 0.034, 0.5 + 0.5 * (k / 13))
        }
        return out
      },
    },
    {
      // Soft: rustling noise whose band slides up two octaves, in soft pulses (a thumb pulling a paper strip), swelling.
      name: 'filz-zug', ms: 500, swell: true, note: 'weiches Aufziehen, Papierrascheln',
      make(rng) {
        const rustle = svf(noise(0.5, rng), 'band', t => 400 * 4.5 ** (t / 0.5), 1.4)
        return peakTo(shape(rustle, t => (0.35 + 0.65 * (t / 0.5)) * (0.45 + 0.55 * Math.cos(TAU * 28 * t))))
      },
    },
  ],

  // ---- wheel-stop: thunk + three-note chord, 0.6 s. The thunk is the stop, at t = 0; the chord follows within 150 ms. ---------------------
  'wheel-stop': [
    {
      // A wooden thunk and a marimba triad (C-E-G, a quick roll): marimba bars sound the fundamental and the double octave plus a tenth.
      name: 'holz-dur', ms: 600, fadeOut: 0.08, note: 'Holz-Plock und Marimba-Dreiklang',
      make(rng) {
        const thunk = mix(0.25, [bar(0.25, 150, 0.05, { tilt: 0.3 }), 0, 1], [burst(0.25, rng, 0.006, { lp: 900 }), 0, 0.6])
        const note = hz => modal(0.55, [{ hz, tau: 0.32 }, { hz: hz * 4, amp: 0.3, tau: 0.12 }, { hz: hz * 10, amp: 0.1, tau: 0.04 }])
        return mix(0.6, [thunk, 0, 1], [note(523.25), 0.04, 0.5], [note(659.26), 0.08, 0.5], [note(783.99), 0.12, 0.5])
      },
    },
    {
      // Arcade "stage clear": a kick-like thump, then a C-E-G arpeggio in 25 % pulse waves, 50 ms apart, ringing out as a chord.
      name: 'chip-akkord', ms: 600, fadeOut: 0.08, note: 'Arcade-Bumm und schneller Dreiklang',
      make() {
        const kick = thump(0.15, 170, 70, 0.03, 0.05)
        // Crushed before the envelope: a crushed tail would drop below the first step and leave a flat offset instead of a decay.
        const note = hz => shape(crush(osc('square', 0.55, hz, { duty: 0.25 }), 5), t => Math.min(1, t / 0.002) * Math.exp(-t / 0.3))
        return mix(0.6, [kick, 0, 1], [note(523.25), 0.05, 0.3], [note(659.26), 0.1, 0.3], [note(783.99), 0.15, 0.3])
      },
    },
    {
      // A felt-padded thump and a toy glockenspiel triad an octave up: metal bars ring longer and brighter than wood.
      name: 'glocken-akkord', ms: 600, fadeOut: 0.08, note: 'Filz-Bums, heller Glockenspiel-Dreiklang',
      make(rng) {
        const thunk = mix(0.2, [thump(0.2, 110, 80, 0.03, 0.045), 0, 1], [burst(0.2, rng, 0.004, { lp: 600 }), 0, 0.5])
        const bell = hz => modal(0.55, [{ hz, tau: 0.4 }, { hz: hz * 2.76, amp: 0.3, tau: 0.18 }, { hz: hz * 5.4, amp: 0.12, tau: 0.07 }])
        return mix(0.6, [thunk, 0, 0.8], [bell(1046.5), 0, 0.45], [bell(1318.5), 0.035, 0.45], [bell(1568), 0.07, 0.45])
      },
    },
    {
      // A toy melodica or organ: a soft thump, then a G-B-D chord of slightly detuned triangle waves with a 5 Hz wobble, low-passed warm.
      name: 'orgel-akkord', ms: 600, fadeOut: 0.08, note: 'Spielzeug-Orgel, weicher Dreiklang',
      make(rng) {
        const voice = hz => mix(0.55,
          [osc('tri', 0.55, hz * 0.998), 0, 0.5],
          [osc('tri', 0.55, hz * 1.002), 0, 0.5])
        const chord = mix(0.55, [voice(392), 0, 1], [voice(493.88), 0, 1], [voice(587.33), 0, 1])
        shape(chord, t => Math.min(1, t / 0.012) * Math.exp(-t / 0.45) * (1 + 0.08 * Math.sin(TAU * 5 * t)))
        const warm = svf(chord, 'low', 2800)
        const thunk = mix(0.15, [thump(0.15, 140, 90, 0.03, 0.04), 0, 1], [burst(0.15, rng, 0.006, { lp: 700 }), 0, 0.6])
        // The chord is the long part and the thump only its edge: at equal peaks the thump would drown it (its energy is in the first 100 ms).
        return mix(0.6, [thunk, 0, 0.45], [peakTo(warm), 0.02, 1])
      },
    },
  ],

  // ---- wheel-morph: scramble/zip as the fake name turns real, 0.5 s. ------------------------------------------------------------------
  'wheel-morph': [
    {
      // Arcade scramble: sixteen random pentatonic square notes of 24 ms, then it lands on one clear note (G5).
      name: 'chip-scramble', ms: 500, fadeOut: 0.03, note: 'Arcade-Zufallstöne, landet auf einem Ton',
      make(rng) {
        const pool = [392, 440, 523.25, 587.33, 659.26, 784, 880, 1046.5, 1174.7, 1318.5]
        const notes = []
        for (let i = 0; i < 16; i++) {
          let pick
          do pick = pool[Math.floor(rng() * pool.length)]
          while (pick === notes[i - 1])
          notes.push(pick)
        }
        const sig = osc('square', 0.5, t => (t < 0.384 ? notes[Math.floor(t / 0.024)] : 784), { duty: 0.5 })
        return shape(crush(sig, 5), t => (t < 0.384 ? 0.7 + 0.3 * Math.exp(-(t % 0.024) / 0.01) : Math.exp(-(t - 0.384) / 0.12)))
      },
    },
    {
      // A zipper pulled up: noise gated by the teeth (110 rising to 350 per second) under a band that opens from 1.5 to 4 kHz, then a stop click.
      name: 'reissverschluss', ms: 500, note: 'Reißverschluss, schnell hochgezogen',
      make(rng) {
        const teeth = buf(0.5)
        let phase = 0
        for (let i = 0; i < teeth.length; i++) {
          phase += (110 + 240 * (i / RATE / 0.46)) / RATE
          teeth[i] = Math.exp(-(phase % 1) / 0.17)
        }
        const sweep = svf(noise(0.5, rng), 'band', t => 1500 * (4 / 1.5) ** (t / 0.5), 1.5)
        const zip = shape(peakTo(sweep), (t, i) => teeth[i] * (t > 0.46 ? 0 : 1))
        return mix(0.5, [peakTo(zip), 0, 1], [modal(0.04, [{ hz: 2300, tau: 0.006 }, { hz: 3900, amp: 0.5, tau: 0.004 }]), 0.462, 0.3])
      },
    },
    {
      // Letter tiles clattering as they re-sort: about eighteen random wooden clicks at random pitches, then one clear wooden note.
      name: 'buchstaben-klackern', ms: 500, note: 'Holzplättchen klackern, dann ein klarer Ton',
      make(rng) {
        const out = buf(0.5)
        let t = 0
        while (t < 0.36) {
          const hz = 450 + rng() * 1100
          const click = mix(0.04, [bar(0.04, hz, 0.006, { tilt: 0.35 }), 0, 1], [burst(0.04, rng, 0.0008, { hp: 2500 }), 0, 0.5])
          add(out, click, t, 0.45 + 0.55 * rng())
          t += 0.02 * (0.7 + 0.6 * rng())
        }
        return add(out, bar(0.14, 1180, 0.07), 0.37, 1)
      },
    },
    {
      // A bubbling sine that climbs while its pitch is re-rolled 30 times a second, with a tremolo; it settles on a steady E6.
      name: 'blubber-wirbel', ms: 500, fadeOut: 0.03, note: 'Blubbernde Tonleiter, löst sich auf',
      make(rng) {
        const jitter = Array.from({ length: 13 }, () => 0.75 + 0.5 * rng())
        const f = t => (t < 0.4 ? 300 * 4.4 ** (t / 0.4) * jitter[Math.floor(t / 0.033)] : 1318.5)
        const sig = osc('sine', 0.5, f)
        return shape(sig, t => (t < 0.4 ? 0.75 + 0.25 * Math.sin(TAU * 18 * t) : Math.exp(-(t - 0.4) / 0.06)))
      },
    },
  ],

  // ---- wheel-slice-out: a slice pops out, "schwupp", 0.3 s. A pop, then a fall. -------------------------------------------------------
  'wheel-slice-out': [
    {
      // A little bubble pop (a sine jumping up), then a sine gliding down more than two octaves.
      name: 'schwupp-gleiter', ms: 300, fadeOut: 0.02, note: 'kleines Plopp, dann fallender Schwupp',
      make() {
        const pop = shape(osc('sine', 0.05, t => 350 + 750 * Math.min(1, t / 0.012), { phase: 0.1 }), expo(0.01))
        const glide = shape(osc('sine', 0.29, t => 1200 * 0.2167 ** (t / 0.26)), t => Math.min(1, t / 0.006) * Math.exp(-t / 0.1))
        return mix(0.3, [pop, 0, 0.8], [glide, 0.01, 0.8])
      },
    },
    {
      // Arcade slide: a thin 12.5 % pulse sliding down three octaves, linear fade, a puff of noise at the start, crushed.
      name: 'chip-rutsch', ms: 300, fadeOut: 0.02, note: 'Arcade-Rutsch nach unten, dünn',
      make(rng) {
        const slide = shape(crush(osc('square', 0.28, t => 1600 * 0.1125 ** (t / 0.28), { duty: 0.125 }), 5), t => Math.max(0, 1 - t / 0.28))
        return mix(0.3, [slide, 0, 1], [shape(crushNoise(0.012, rng, 9000), expo(0.004)), 0, 0.5])
      },
    },
    {
      // Paper pulled quickly past: noise in a band that falls from 3.5 kHz to 500 Hz, a soft low tap at the start.
      name: 'papier-zisch', ms: 300, fadeOut: 0.02, note: 'weiches Papier-Zischen nach unten',
      make(rng) {
        const swish = svf(noise(0.3, rng), 'band', t => 3500 * (500 / 3500) ** (t / 0.28), 1.1)
        return mix(0.3, [shape(peakTo(swish), pluckEnv(0.005, 0.09)), 0, 1], [thump(0.04, 400, 200, 0.01, 0.015), 0, 0.5])
      },
    },
    {
      // A cork pulled from a bottle: the resonance of the bottle neck jumps up (180 to 520 Hz in 18 ms), then a short falling whistle.
      name: 'korken-plopp', ms: 300, fadeOut: 0.02, note: 'Korkenplopp mit kurzem Pfeifen',
      make() {
        const pop = shape(osc('sine', 0.06, t => 180 + 340 * Math.min(1, t / 0.018), { phase: 0.1 }), expo(0.014))
        const whistle = shape(osc('sine', 0.24, t => 1000 - 500 * (t / 0.2)), t => Math.min(1, t / 0.01) * Math.exp(-t / 0.07))
        return mix(0.3, [pop, 0, 1], [whistle, 0.04, 0.3])
      },
    },
  ],
}
