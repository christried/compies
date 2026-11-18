// The recipes of the Veto window's cues (#535, split per moment by #740): { name, note (German, what the operator reads), ms (the file's length),
// make(rng) -> Float64Array, swell?: true, fadeOut?: seconds }. make-cue-candidates.mjs loads every file of this folder and calls each `make` once
// with the noise seeded from the file path, so a rerun gives the same bytes. A recipe for no cue id, or two files for one id, fails there.
import { RATE, TAU, frames, buf, mix, add, peakTo, shape, expo, osc, noise, crushNoise, crush, svf, modal, bar, burst, thump } from '../cue-kit.mjs'

export default {
  // ---- veto-open: a shutter whoosh, the window slides up, 0.4 s. Rising. -------------------------------------------------------------
  'veto-open': [
    {
      // A roller shutter running up: noise whose band rises from 500 to 2500 Hz, chopped by the slats clattering faster and faster, a soft "tok" at the top.
      name: 'rollladen', ms: 400, swell: true, note: 'Rollladen rattert hoch, Klack oben',
      make(rng) {
        const sweep = peakTo(svf(noise(0.4, rng), 'band', t => 500 * 5 ** (t / 0.38), 1.2))
        let phase = 0
        shape(sweep, (t) => {
          phase += (30 + 70 * (t / 0.4)) / RATE
          return (t < 0.355 ? 1 : 0) * (0.45 + 0.55 * (0.5 + 0.5 * Math.cos(TAU * phase))) * (0.5 + 0.5 * Math.min(1, t / 0.01))
        })
        return mix(0.4, [sweep, 0, 1], [bar(0.06, 520, 0.025), 0.35, 0.6])
      },
    },
    {
      // Arcade arpeggio upward: C4 G4 C5 E5 G5 C6 in 50 ms steps, the last one holding, in 25 % pulse waves.
      name: 'chip-hochlauf', ms: 400, fadeOut: 0.03, note: 'Arcade-Arpeggio nach oben',
      make() {
        const notes = [261.63, 392, 523.25, 659.26, 783.99, 1046.5]
        const sig = osc('square', 0.4, t => notes[Math.min(5, Math.floor(t / 0.05))], { duty: 0.25 })
        return shape(crush(sig, 5), t => (t < 0.3 ? 0.7 + 0.3 * Math.exp(-(t % 0.05) / 0.02) : Math.exp(-(t - 0.3) / 0.08)))
      },
    },
    {
      // A sheet of paper swept up: a wide soft band of noise that rises and swells to 0.26 s and falls again, a low puff at the start for the timing.
      name: 'papier-fahne', ms: 400, swell: true, note: 'weiches Rauschen nach oben, wie ein Blatt',
      make(rng) {
        const air = peakTo(svf(noise(0.4, rng), 'band', t => 500 * 5 ** (t / 0.4), 0.9))
        shape(air, t => (t < 0.26 ? 0.2 + 0.8 * (t / 0.26) ** 1.5 : Math.cos((t - 0.26) / 0.14 * Math.PI / 2) ** 2))
        return mix(0.4, [air, 0, 1], [thump(0.06, 170, 120, 0.02, 0.02), 0, 0.3])
      },
    },
    {
      // A slide whistle up (300 to 900 Hz, a little vibrato), cut off by a wooden clack as the window arrives at 0.3 s.
      name: 'schiebe-klack', ms: 400, note: 'kurzes Gleiten nach oben, dann Holzklack',
      make(rng) {
        const slide = shape(osc('sine', 0.31, t => 300 + 600 * (t / 0.3) ** 1.3 + 12 * Math.sin(TAU * 30 * t)), t => (0.8 + 0.2 * (t / 0.3)) * (t < 0.29 ? 1 : Math.max(0, 1 - (t - 0.29) / 0.02)))
        return mix(0.4, [slide, 0, 0.8], [bar(0.1, 700, 0.03), 0.3, 0.8], [burst(0.04, rng, 0.0015, { hp: 2000 }), 0.3, 0.6])
      },
    },
  ],

  // ---- veto-clock: a dry clock tick, the last 10 s only, speeding up at 5 s (so up to a few a second), 40 ms. Short, no tail. -------------
  'veto-clock': [
    {
      // A clockwork escapement: two high metal resonances and a small body at 800 Hz, over a sharp hairline click.
      name: 'uhr-tick', ms: 32, note: 'feines Uhrwerk-Tick',
      make(rng) {
        const body = modal(0.032, [{ hz: 3100, tau: 0.004 }, { hz: 4900, amp: 0.5, tau: 0.0025 }, { hz: 800, amp: 0.8, tau: 0.012 }])
        return mix(0.032, [body, 0, 1], [burst(0.032, rng, 0.0008, { hp: 4000 }), 0, 0.7])
      },
    },
    {
      // A low wooden "tock" of a hollow block, a quarter of the pitch of the wheel's ticks so the two do not blur when both play.
      name: 'holz-tock', ms: 36, note: 'tiefer Holz-Tock, trocken',
      make() {
        return bar(0.036, 620, 0.012, { tilt: 0.4 })
      },
    },
    {
      // A digital countdown beep: a flat 1.5 kHz square, a hard stop, crushed to four bits.
      name: 'chip-piep', ms: 30, note: 'Countdown-Piep, flach und digital',
      make() {
        return shape(crush(osc('square', 0.03, 1500, { duty: 0.5 }), 4), t => (t < 0.008 ? 1 : Math.exp(-(t - 0.008) / 0.006)))
      },
    },
    {
      // A soft heartbeat "dub": a rounded 240 Hz sine and a muffled felt noise, tense but not sharp.
      name: 'filz-dub', ms: 34, note: 'weiches Dub, tief, wie ein Puls',
      make(rng) {
        return mix(0.034, [shape(osc('sine', 0.034, 240, { phase: 0.25 }), expo(0.012)), 0, 1], [burst(0.034, rng, 0.004, { lp: 900 }), 0, 0.5])
      },
    },
  ],

  // ---- veto-clip-close: soft TV off, 0.3 s. -------------------------------------------------------------------------------------------
  'veto-clip-close': [
    {
      // A tube TV switching off: the deflection whine falls from 1.5 kHz to 80 Hz, softened, with the last dot ticking out.
      name: 'roehren-aus', ms: 300, fadeOut: 0.02, note: 'Röhren-Fernseher aus, Ton fällt, kleines Tick',
      make() {
        const f = t => 1500 * 0.0533 ** (t / 0.22)
        const whine = mix(0.26, [osc('sine', 0.26, f), 0, 1], [osc('sine', 0.26, t => 2 * f(t)), 0, 0.3])
        const soft = svf(shape(whine, expo(0.09)), 'low', 3000)
        return mix(0.3, [peakTo(soft), 0, 1], [thump(0.1, 90, 70, 0.02, 0.025), 0.22, 0.5])
      },
    },
    {
      // Arcade power-down: a pulse wave sliding from 900 to 110 Hz while its pulse width narrows from 50 % to 10 %, linear fade, crushed.
      name: 'chip-ausgang', ms: 300, fadeOut: 0.02, note: 'Arcade-Ausschalten, Pulsbreite schrumpft',
      make() {
        const slide = osc('square', 0.26, t => 900 * 0.1222 ** (t / 0.25), { duty: t => 0.5 - 0.4 * (t / 0.25) })
        return shape(crush(slide, 5), t => Math.max(0, 1 - t / 0.26))
      },
    },
    {
      // A felt lid dropping: a low sine falling from 260 to 110 Hz and a muffled puff of air, no edge at all.
      name: 'filz-klapp', ms: 260, fadeOut: 0.02, note: 'weiches Zuklappen, gepolstert',
      make(rng) {
        return mix(0.26, [shape(osc('sine', 0.26, t => 260 * 0.42 ** (t / 0.09), { phase: 0.25 }), expo(0.08)), 0, 1], [burst(0.26, rng, 0.035, { lp: 800 }), 0, 0.6])
      },
    },
    {
      // A toggle switch flicked off: a hard little click, then the hum it cuts falls away (130 Hz with its octave).
      name: 'schalter-aus', ms: 300, fadeOut: 0.03, note: 'Kippschalter-Klick, Brummen läuft aus',
      make(rng) {
        const click = mix(0.04, [bar(0.04, 1900, 0.004, { tilt: 0.3 }), 0, 1], [burst(0.04, rng, 0.001, { hp: 3000 }), 0, 0.6])
        const f = t => 130 * 0.6 ** (t / 0.2)
        const hum = shape(mix(0.28, [osc('sine', 0.28, f), 0, 1], [osc('sine', 0.28, t => 2 * f(t)), 0, 0.4]), expo(0.06))
        return mix(0.3, [click, 0, 1], [hum, 0.005, 0.6])
      },
    },
  ],

  // ---- veto-seal: the own veto confirmed, a wax-stamp thud, 0.3 s. Low, dull, final. -----------------------------------------------------
  'veto-seal': [
    {
      // A stamp pressed into soft wax: a low thump from 150 to 70 Hz, a muffled contact, and a short damp squelch of the wax giving way.
      name: 'stempel-dumpf', ms: 280, fadeOut: 0.03, note: 'dumpfer Stempel auf Wachs',
      make(rng) {
        const squelch = shape(peakTo(svf(noise(0.2, rng), 'low', 400)), t => Math.min(1, t / 0.01) * Math.exp(-t / 0.06))
        return mix(0.28, [thump(0.25, 150, 70, 0.03, 0.07), 0, 1], [burst(0.03, rng, 0.01, { lp: 700 }), 0, 0.6], [squelch, 0.01, 0.15])
      },
    },
    {
      // A wooden mallet on a hollow wooden box: three body resonances (185, 340, 585 Hz) and the mallet's dull touch.
      name: 'holz-bums', ms: 250, fadeOut: 0.03, note: 'Holzklotz-Bums, hohl',
      make(rng) {
        const body = modal(0.25, [{ hz: 185, tau: 0.09 }, { hz: 340, amp: 0.5, tau: 0.06 }, { hz: 585, amp: 0.25, tau: 0.04 }])
        return mix(0.25, [body, 0, 1], [burst(0.25, rng, 0.004, { lp: 1800 }), 0, 0.7])
      },
    },
    {
      // An 8-bit kick: a square wave falling from 220 to 45 Hz in about 100 ms, a puff of noise, crushed to four bits.
      name: 'chip-bumm', ms: 200, fadeOut: 0.02, note: 'Arcade-Bass-Bumm',
      make(rng) {
        const kick = shape(crush(osc('square', 0.2, t => 60 + 160 * Math.exp(-t / 0.035)), 4), expo(0.08))
        return mix(0.2, [kick, 0, 1], [shape(crushNoise(0.02, rng, 8000), expo(0.008)), 0, 0.4])
      },
    },
    {
      // A brass seal ring stamped down: a smaller thud, and the ring's little metallic ting 45 ms later (kept quiet, the thud is the cue).
      name: 'siegel-ting', ms: 300, fadeOut: 0.03, note: 'Stempel mit kleinem Metall-Ting',
      make(rng) {
        const ring = modal(0.2, [{ hz: 2900, tau: 0.08 }, { hz: 4300, amp: 0.4, tau: 0.05 }])
        return mix(0.3, [thump(0.2, 140, 60, 0.03, 0.06), 0, 1], [burst(0.03, rng, 0.008, { lp: 900 }), 0, 0.5], [ring, 0.045, 0.22])
      },
    },
  ],

  // ---- veto-drumroll: a roll leading into veto-reveal's hit, 1.2 s. It builds, and its last hit lands at the very end. ----------------------
  'veto-drumroll': [
    {
      // A snare roll: a drum body (190 and 320 Hz) and snare-wire noise per hit, the gap shrinking from 72 to 28 ms, hands alternating, crescendo.
      name: 'snare-wirbel', ms: 1200, swell: true, fadeOut: 0.012, note: 'Snare-Wirbel, wird schneller und lauter',
      make(rng) {
        const out = buf(1.2)
        let t = 0
        let i = 0
        while (t < 1.18) {
          const f = t / 1.2
          const vel = (0.28 + 0.72 * f ** 1.2) * (i % 2 ? 1 : 0.85) * (0.9 + 0.2 * rng())
          const hit = mix(0.09, [modal(0.09, [{ hz: 190, tau: 0.016 }, { hz: 320, amp: 0.4, tau: 0.01 }]), 0, 0.6], [burst(0.09, rng, 0.03, { hp: 1800, lp: 9000 }), 0, 1])
          add(out, hit, t, vel)
          t += 0.072 - 0.044 * f
          i++
        }
        return out
      },
    },
    {
      // The console's noise channel as a roll: grainy noise ticks (45 down to 30 ms) over a triangle bass that climbs from 110 to 360 Hz with a tremolo.
      name: 'chip-wirbel', ms: 1200, swell: true, fadeOut: 0.012, note: 'Arcade-Rauschwirbel, Bass steigt',
      make(rng) {
        const out = buf(1.2)
        let t = 0
        while (t < 1.18) {
          const f = t / 1.2
          add(out, shape(svf(crushNoise(0.03, rng, 5500), 'high', 1000), expo(0.009)), t, 0.3 + 0.7 * f)
          t += 0.045 - 0.015 * f
        }
        peakTo(out)
        const bass = shape(crush(osc('tri', 1.2, t => 110 + 250 * (t / 1.2) ** 1.3), 4), t => (0.35 + 0.65 * (t / 1.2)) * (0.7 + 0.3 * Math.sin(TAU * 16 * t)))
        return mix(1.2, [out, 0, 1], [bass, 0, 0.5])
      },
    },
    {
      // A toy tom-tom roll: each hit a short thump whose pitch falls 40 % in 40 ms, the tom tuned higher as the roll speeds up (140 to 230 Hz), 95 down to 34 ms.
      name: 'tom-wirbel', ms: 1200, swell: true, fadeOut: 0.012, note: 'Spielzeug-Tomtom, wird schneller und höher',
      make(rng) {
        const out = buf(1.2)
        let t = 0
        let i = 0
        while (t < 1.18) {
          const f = t / 1.2
          const f0 = (140 + 90 * f) * (i % 2 ? 1.1 : 1)
          const hit = mix(0.12, [shape(osc('sine', 0.12, s => f0 * (1 - 0.4 * Math.min(1, s / 0.04)), { phase: 0.25 }), expo(0.045)), 0, 1], [burst(0.12, rng, 0.004, { lp: 2500 }), 0, 0.4])
          add(out, hit, t, 0.3 + 0.7 * f)
          t += 0.095 - 0.061 * f
          i++
        }
        return out
      },
    },
    {
      // A rattle full of peas: random grains of band-passed noise (4.5 kHz), their density rising from 35 to 220 a second, louder as it fills.
      name: 'rassel', ms: 1200, swell: true, fadeOut: 0.012, note: 'Erbsen-Rassel, wird dichter und lauter',
      make(rng) {
        const grains = buf(1.2)
        let t = 0
        let count = 0
        while (t < 1.19) {
          const f = t / 1.2
          for (let n = 0; n < 130; n++) {
            const i = frames(t) + n
            if (i < grains.length) grains[i] += Math.exp(-n / RATE / 0.0025) * (0.5 + 0.5 * f) * (0.5 + rng())
          }
          // The first three peas fall 3 ms apart, so the roll has an onset in its first 10 ms; after that the gaps are random (Poisson).
          t += count++ < 3 ? 0.003 : -Math.log(1 - rng()) / (35 + 185 * f)
        }
        return peakTo(svf(shape(noise(1.2, rng), (s, i) => grains[i]), 'band', 4500, 1.5))
      },
    },
  ],

  // ---- veto-reveal: all at once, a cymbal hit (the stamps are veto-seal, played per veto), 0.8 s. -----------------------------------------
  'veto-reveal': [
    {
      // A toy drum machine's cymbal: six square waves at inharmonic pitches, high-passed into a metallic hiss with a fast and a slow decay, over a low stamp thump.
      name: 'becken-spielzeug', ms: 800, fadeOut: 0.08, note: 'Spielzeug-Becken mit Stempel-Bums',
      make(rng) {
        const metal = mix(0.8, ...[263, 400, 421, 474, 587, 845].map(hz => [osc('square', 0.8, hz), 0, 1]))
        const hiss = shape(peakTo(svf(metal, 'high', 4500)), t => 0.55 * Math.exp(-t / 0.09) + 0.45 * Math.exp(-t / 0.28))
        return mix(0.8, [hiss, 0, 1], [thump(0.15, 125, 70, 0.025, 0.06), 0, 0.8], [burst(0.1, rng, 0.012, { lp: 800 }), 0, 0.4])
      },
    },
    {
      // Arcade crash: bit-crushed noise (9 kHz hold) in two decays, an 8-bit kick, and a pulse wave plunging from 900 to 150 Hz for the explosion.
      name: 'chip-crash', ms: 800, fadeOut: 0.08, note: 'Arcade-Crash: Rauschen und Bass',
      make(rng) {
        const hiss = shape(peakTo(svf(crushNoise(0.8, rng, 9000), 'high', 1800)), t => 0.5 * Math.exp(-t / 0.07) + 0.5 * Math.exp(-t / 0.22))
        const kick = shape(crush(osc('square', 0.15, t => 70 + 140 * Math.exp(-t / 0.03)), 5), expo(0.07))
        const fall = shape(crush(osc('square', 0.25, t => 900 * 0.1667 ** (t / 0.25), { duty: 0.25 }), 5), t => Math.max(0, 1 - t / 0.25))
        return mix(0.8, [hiss, 0, 1], [kick, 0, 0.7], [fall, 0, 0.3])
      },
    },
    {
      // A "Tusch" on a toy drum kit: a snare crack with its body, a tom, and a short cymbal splash that is gone by half a second.
      name: 'tusch-schlag', ms: 500, fadeOut: 0.06, note: 'Trommelschlag mit kurzem Beckenzischen',
      make(rng) {
        const crack = burst(0.3, rng, 0.07, { hp: 1200, lp: 9000 })
        const body = modal(0.12, [{ hz: 330, tau: 0.03 }, { hz: 185, amp: 0.7, tau: 0.05 }])
        const tom = thump(0.25, 150, 100, 0.04, 0.1)
        const splash = burst(0.4, rng, 0.14, { hp: 6000 })
        return mix(0.6, [crack, 0, 0.9], [body, 0, 0.7], [tom, 0, 0.7], [splash, 0.005, 0.5])
      },
    },
    {
      // A small gong: six inharmonic partials (1, 1.47, 2.09, 2.57, 3.31, 4.10 times 520 Hz) with the lower ones detuned in pairs for the slow beating, a mallet strike.
      name: 'gong-klein', ms: 800, fadeOut: 0.1, note: 'kleiner heller Gong, klingt aus',
      make(rng) {
        const ratios = [1, 1.47, 2.09, 2.57, 3.31, 4.1]
        const amps = [1, 0.7, 0.5, 0.4, 0.3, 0.2]
        const taus = [0.7, 0.55, 0.4, 0.32, 0.25, 0.18]
        const partials = ratios.flatMap((ratio, i) => [{ hz: 520 * ratio, amp: amps[i], tau: taus[i] }, ...(i < 2 ? [{ hz: 520 * ratio + 2.2, amp: amps[i], tau: taus[i] }] : [])])
        return mix(0.8, [peakTo(modal(0.8, partials)), 0, 1], [burst(0.1, rng, 0.01, { hp: 3000 }), 0, 0.6], [thump(0.15, 110, 70, 0.03, 0.06), 0, 0.5])
      },
    },
  ],
}
