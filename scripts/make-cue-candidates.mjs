// Writes the sound candidates for the listening session of 0.13.3 (#535): three to four clearly different ideas for each of the eleven
// cues of app/utils/sound-cues.ts, synthesised here (no downloaded file, no dependency, nothing that needs a credit), and the manifest the
// listening page (#534) reads. The cue world is compibert-sound.md: cartoony, dry and short, tabletop toys and a cheap arcade, never casino
// or orchestral. Nothing here has been heard while writing it: every recipe reasons from the physics of the sound it names (attack, decay,
// spectrum, pitch movement), and the operator's ear decides in the session.
//
//   node scripts/make-cue-candidates.mjs     writes sound-candidates/<cue id>/<name>.wav and sound-candidates/manifest.json, then checks them
//
// Four families of ideas, so a cue's candidates differ in kind and not in settings:
//   holz-/spielzeug-  tabletop toys: modal synthesis (struck bars and blocks are a few damped sines at inharmonic ratios) plus short noise
//                     bursts for the strike, wooden blocks, tiles, glockenspiel bars, a woodblock ratchet;
//   chip-             a cheap arcade: square and pulse waves, triangle, a noise channel, stepped arpeggios, pitch slides, bit crushing;
//   filz-/papier-     soft and dry: filtered noise (paper, felt, a zipper), low rounded thumps, no sharp edge;
//   and one more idea per cue where the cue invites it (a roller shutter, a cork, a toy tom, a seal ring, a gong ...).
//
// Format as the shipped cue files have (app/utils/sound-cues.ts): 16-bit PCM, mono, 44.1 kHz WAV, peak at
// -1 dBFS (the cue's relative volume is the player's gain, CUE_VOLUME, not the file's), a short fade in and out, no DC offset, no silence at
// the start (a cue is scheduled to the millisecond: the transient sits in the first 5 ms, except where a candidate is a swell by nature, which
// says so with `swell`). Length: at most the doc's length for the cue. Deterministic: seeded noise per candidate, no Math.random, so a rerun
// gives the same bytes.
//
// After writing, the script reads every file back and fails loudly when one breaks the format, the length, the level, the onset, the DC rule,
// or when a manifest entry would fail the rules of `candidatesOf` in app/dev/listening-model.ts (#534).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const RATE = 44_100
const PEAK = 0.8913 // -1 dBFS
const TAU = Math.PI * 2
const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'sound-candidates')

// ---- the contract: cue ids and lengths come from the repo, so a drift fails here ------------------------------------------------------

const CUE_IDS = [...readFileSync(resolve(ROOT, 'app/utils/sound-cues.ts'), 'utf8').match(/export const CUE_IDS = \[([^\]]*)\]/)[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1])

/** The length column of compibert-sound.md per cue id, in ms ("30 ms", "0.5 s", "1.2 s loop"). */
const MAX_MS = {}
for (const line of readFileSync(resolve(ROOT, 'docs/design_handoff_compies/reference/docs/compibert-sound.md'), 'utf8').split('\n')) {
  const cells = line.split('|').map(cell => cell.trim())
  const id = CUE_IDS.find(known => cells[2] === `\`${known}\``)
  const length = id && cells[4]?.match(/^(\d+(?:\.\d+)?) (ms|s)\b/)
  if (length) MAX_MS[id] = Math.round(Number(length[1]) * (length[2] === 's' ? 1000 : 1))
}
for (const id of CUE_IDS) if (!MAX_MS[id]) throw new Error(`no length for ${id} in compibert-sound.md`)

// ---- a small synthesis kit (all buffers are Float64Array at RATE; times in seconds) -------------------------------------------------------

const frames = seconds => Math.round(seconds * RATE)
const buf = seconds => new Float64Array(frames(seconds))
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

function fnv(text) {
  let h = 0x811C9DC5
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

// mulberry32, as in scripts/bake-compibert.mjs.
function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Sums layers `[buffer, atSeconds, gain]` into a new buffer of `seconds`; what runs past the end is cut. */
function mix(seconds, ...layers) {
  const out = buf(seconds)
  for (const [layer, at = 0, gain = 1] of layers) add(out, layer, at, gain)
  return out
}

/** Adds `layer` into `target` from `at` seconds on, in place; returns target. */
function add(target, layer, at = 0, gain = 1) {
  const offset = frames(at)
  for (let i = 0; i < layer.length && offset + i < target.length; i++) if (offset + i >= 0) target[offset + i] += layer[i] * gain
  return target
}

/** Scales a buffer to the given peak, in place. Used on layers so the gains in a mix mean something. */
function peakTo(b, level = 1) {
  let top = 0
  for (const x of b) top = Math.max(top, Math.abs(x))
  if (top > 0) for (let i = 0; i < b.length; i++) b[i] *= level / top
  return b
}

/** Multiplies a buffer by `fn(t, i)`, in place. */
function shape(b, fn) {
  for (let i = 0; i < b.length; i++) b[i] *= fn(i / RATE, i)
  return b
}

const expo = tau => t => Math.exp(-t / tau)

/** An oscillator: sine, tri, saw or square (polyBLEP-smoothed against the worst aliasing). `hz` and `duty` are numbers or functions of t; `phase` in cycles (0.25 on a sine starts at the peak, so a thump has its transient at once). */
function osc(kind, seconds, hz, { duty = 0.5, phase = 0 } = {}) {
  const out = buf(seconds)
  let p = phase
  const blep = (x, dt) => {
    if (x < dt) {
      const u = x / dt
      return u + u - u * u - 1
    }
    if (x > 1 - dt) {
      const u = (x - 1) / dt
      return u * u + u + u + 1
    }
    return 0
  }
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const f = typeof hz === 'function' ? hz(t) : hz
    const dt = f / RATE
    const d = typeof duty === 'function' ? clamp(duty(t), 0.05, 0.95) : duty
    if (kind === 'sine') out[i] = Math.sin(TAU * p)
    else if (kind === 'tri') out[i] = 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5)
    else if (kind === 'saw') out[i] = 2 * p - 1 - blep(p, dt)
    else out[i] = (p < d ? 1 : -1) + blep(p, dt) - blep((p + 1 - d) % 1, dt)
    p += dt
    p -= Math.floor(p)
  }
  return out
}

function noise(seconds, rng) {
  const out = buf(seconds)
  for (let i = 0; i < out.length; i++) out[i] = rng() * 2 - 1
  return out
}

/** The noise channel of a console: noise held for 1/holdHz s per value, so it sounds grainy and low-fi instead of smooth. */
function crushNoise(seconds, rng, holdHz) {
  const out = buf(seconds)
  const hold = Math.max(1, Math.round(RATE / holdHz))
  let value = 0
  for (let i = 0; i < out.length; i++) {
    if (i % hold === 0) value = rng() * 2 - 1
    out[i] = value
  }
  return out
}

/** Bit crush: the amplitude on a grid of 2^bits steps (a buffer at about -1..1). */
function crush(b, bits) {
  const step = 2 / (2 ** bits)
  for (let i = 0; i < b.length; i++) b[i] = Math.round(b[i] / step) * step
  return b
}

/** A state-variable filter (Cytomic/TPT form, stable under a moving cutoff). `mode` low | high | band (band has unity gain at the centre); `cutoff` in Hz or a function of t. */
function svf(input, mode, cutoff, q = 0.707) {
  const out = new Float64Array(input.length)
  const k = 1 / q
  let ic1 = 0
  let ic2 = 0
  for (let i = 0; i < input.length; i++) {
    const fc = clamp(typeof cutoff === 'function' ? cutoff(i / RATE) : cutoff, 20, RATE * 0.45)
    const g = Math.tan(Math.PI * fc / RATE)
    const a1 = 1 / (1 + g * (g + k))
    const a2 = g * a1
    const a3 = g * a2
    const x = input[i]
    const v3 = x - ic2
    const v1 = a1 * ic1 + a2 * v3
    const v2 = ic2 + a2 * ic1 + a3 * v3
    ic1 = 2 * v1 - ic1
    ic2 = 2 * v2 - ic2
    out[i] = mode === 'low' ? v2 : mode === 'band' ? k * v1 : x - k * v1 - v2
  }
  return out
}

/** A struck object by modal synthesis: damped sines `{ hz, amp, tau }` (tau = decay time constant in s). */
function modal(seconds, partials) {
  const out = buf(seconds)
  for (const { hz, amp = 1, tau, phase = 0 } of partials) {
    if (hz > RATE * 0.45) continue
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE
      out[i] += amp * Math.sin(TAU * hz * t + phase) * Math.exp(-t / tau)
    }
  }
  return out
}

/** A struck bar (wood, glockenspiel): the free-bar overtones 1 : 2.76 : 5.40 : 8.93, each weaker and shorter-lived than the one below. */
function bar(seconds, hz, tau, { ratios = [1, 2.76, 5.4, 8.93], tilt = 0.5 } = {}) {
  return modal(seconds, ratios.map((ratio, i) => ({ hz: hz * ratio, amp: tilt ** i, tau: tau / (1 + i * 0.8) })))
}

/** A short noise burst, filtered, with an exponential decay: the strike of a mallet, a flick of plastic, a puff of air. */
function burst(seconds, rng, tau, { lp, hp, bp, q = 0.8 } = {}) {
  let b = noise(seconds, rng)
  if (hp) b = svf(b, 'high', hp)
  if (lp) b = svf(b, 'low', lp)
  if (bp) b = svf(b, 'band', bp, q)
  return peakTo(shape(b, expo(tau)))
}

/**
 * A low thump: a sine that falls from `from` to `to` Hz (time constant `drop`), starting at its peak, with its own decay, then softly
 * saturated: small laptop and phone speakers do not play below about 100 Hz, and the saturation adds the 3rd and 5th harmonics that carry
 * the thump up into what they do play.
 */
const thump = (seconds, from, to, drop, tau) =>
  shape(osc('sine', seconds, t => to + (from - to) * Math.exp(-t / drop), { phase: 0.25 }), expo(tau)).map(x => Math.tanh(2.2 * x))

/** A plain attack-then-decay envelope. */
const pluckEnv = (attack, tau) => t => (t < attack ? t / attack : Math.exp(-(t - attack) / tau))

// ---- the recipes ---------------------------------------------------------------------------------------------------------------------
// { name, note (German, what the operator reads), ms (the file's length), make(rng) -> Float64Array, swell?: true, fadeOut?: seconds }
// Cue lengths of the doc: wheel-tick 30 ms, veto-clock 40 ms, windup 500, stop 600, morph 500, slice-out 300, open 400, clip-close 300,
// seal 300, drumroll 1200, reveal 800.

const RECIPES = {
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

// ---- rendering ---------------------------------------------------------------------------------------------------------------------------

/** Trims or pads to the recipe's length, takes out the DC offset, fades in and out, and scales to PEAK. */
function render(raw, { ms, swell = false, fadeOut = 0.004 }) {
  const seconds = ms / 1000
  const count = frames(seconds)
  const samples = new Float64Array(count)
  for (let i = 0; i < count && i < raw.length; i++) samples[i] = raw[i]
  // DC: a one-pole high-pass, 20 Hz (120 Hz for a 20-40 ms tick, which has nothing to say below 200 Hz and needs the offset gone within a
  // few ms). Not the file's mean: a pulse wave with a skewed duty has an offset that dies with its envelope, and subtracting a global mean
  // would leave a flat step where the sound has faded out.
  const pole = 1 - TAU * (ms < 100 ? 120 : 20) / RATE
  let previous = 0
  let blocked = 0
  for (let i = 0; i < count; i++) {
    blocked = samples[i] - previous + pole * blocked
    previous = samples[i]
    samples[i] = blocked
  }
  const fadeIn = swell ? 0.003 : 0.0005
  let top = 0
  for (let i = 0; i < count; i++) {
    const t = i / RATE
    samples[i] *= Math.sin(Math.PI / 2 * clamp(t / fadeIn, 0, 1)) * Math.sin(Math.PI / 2 * clamp((seconds - t) / fadeOut, 0, 1))
    top = Math.max(top, Math.abs(samples[i]))
  }
  return samples.map(x => (x / top) * PEAK)
}

/** A 16-bit PCM mono WAV file of the samples. */
function wav(samples) {
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(36 + samples.length * 2, 4)
  bytes.write('WAVE', 8, 'ascii')
  bytes.write('fmt ', 12, 'ascii')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(RATE, 24)
  bytes.writeUInt32LE(RATE * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36, 'ascii')
  bytes.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, i) => bytes.writeInt16LE(Math.round(sample * 32_767), 44 + i * 2))
  return bytes
}

// ---- write -----------------------------------------------------------------------------------------------------------------------------

const manifest = { cues: {} }
for (const id of CUE_IDS) {
  const recipes = RECIPES[id]
  if (!recipes || recipes.length < 3) throw new Error(`${id}: fewer than three recipes`)
  manifest.cues[id] = []
  for (const recipe of recipes) {
    const file = `${id}/${recipe.name}.wav`
    const path = resolve(OUT, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, wav(render(recipe.make(seeded(fnv(file))), recipe)))
    manifest.cues[id].push({
      name: recipe.name,
      file,
      source: `scripts/make-cue-candidates.mjs, Rezept ${recipe.name}`,
      author: null,
      licence: 'generated',
      note: recipe.note,
    })
  }
}
for (const id of Object.keys(RECIPES)) if (!CUE_IDS.includes(id)) throw new Error(`${id}: a recipe for no cue id`)
writeFileSync(resolve(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

// ---- check what was written ----------------------------------------------------------------------------------------------------------

const problems = []
const fail = (where, message) => problems.push(`${where}: ${message}`)

/** The format, length, level, onset and DC rules of one file; returns the numbers for the report line. */
function inspect(where, path, id, swell) {
  if (!existsSync(path)) return fail(where, 'file missing')
  const bytes = readFileSync(path)
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.toString('ascii', 12, 16) !== 'fmt '
    || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== RATE || bytes.readUInt16LE(34) !== 16
    || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44) return fail(where, 'not a 16-bit PCM mono 44.1 kHz WAV')
  const count = (bytes.length - 44) / 2
  const sample = i => bytes.readInt16LE(44 + i * 2) / 32_768
  const ms = (count / RATE) * 1000
  let top = 0
  let sum = 0
  for (let i = 0; i < count; i++) {
    top = Math.max(top, Math.abs(sample(i)))
    sum += sample(i)
  }
  const peakDb = 20 * Math.log10(top)
  if (ms > MAX_MS[id] + 1e-6) fail(where, `${ms.toFixed(1)} ms is longer than the ${MAX_MS[id]} ms of the doc`)
  if (Math.abs(peakDb + 1) > 0.5) fail(where, `peak ${peakDb.toFixed(2)} dBFS is not within 0.5 dB of -1`)
  if (Math.abs(sum / count) > 0.01 * top) fail(where, `DC offset ${(sum / count).toFixed(4)}`)
  // Onset: a cue is scheduled to the millisecond. A transient reaches 30 % of the peak in 5 ms; a swell must at least be audible (10 %) in 10 ms.
  const window = frames(swell ? 0.01 : 0.005)
  let early = 0
  for (let i = 0; i < window; i++) early = Math.max(early, Math.abs(sample(i)))
  if (early < (swell ? 0.1 : 0.3) * top) fail(where, `no onset: ${(early / top * 100).toFixed(0)} % of the peak in the first ${swell ? 10 : 5} ms`)
  if (Math.abs(sample(count - 1)) > 0.02 * top) fail(where, 'the file ends on a non-zero sample (a click)')
  // A flat stretch off zero (a crushed tail that fell below the first bit step, minus the mean) is a DC step the global mean does not show.
  let run = 0
  for (let i = 1; i < count; i++) {
    run = bytes.readInt16LE(44 + i * 2) === bytes.readInt16LE(44 + (i - 1) * 2) && Math.abs(sample(i)) > 0.005 ? run + 1 : 0
    if (run > frames(0.012)) {
      fail(where, `a flat stretch off zero at ${((i / RATE) * 1000).toFixed(0)} ms (DC step)`)
      break
    }
  }
  return { ms, peakDb }
}

// The rules of `candidatesOf` (app/dev/listening-model.ts, #534): a known cue id, name/file/source/licence present, licence CC0 or generated,
// the file in the cue's own folder with extension wav/ogg/mp3, a name that is unique within its cue.
const text = value => typeof value === 'string' && value.trim() !== ''
const onDisk = JSON.parse(readFileSync(resolve(OUT, 'manifest.json'), 'utf8'))
for (const [cue, entries] of Object.entries(onDisk.cues)) {
  if (!CUE_IDS.includes(cue)) fail(cue, 'not a cue id')
  const names = new Set()
  for (const entry of entries) {
    const where = `${cue}/${entry.name}`
    if (![entry.name, entry.file, entry.source, entry.licence].every(text)) fail(where, 'name, file, source or licence missing')
    if (!['CC0', 'generated'].includes(entry.licence)) fail(where, `licence ${entry.licence}`)
    if (!entry.file.startsWith(`${cue}/`) || entry.file.indexOf('/', cue.length + 1) !== -1) fail(where, 'file is not in the cue folder')
    if (!['wav', 'ogg', 'mp3'].includes(entry.file.slice(entry.file.lastIndexOf('.') + 1).toLowerCase())) fail(where, 'extension')
    if (names.has(entry.name)) fail(where, 'duplicate name')
    names.add(entry.name)
    if (entry.author !== null || !text(entry.note)) fail(where, 'author must be null and a note is required')
    const swell = RECIPES[cue].find(recipe => recipe.name === entry.name)?.swell ?? false
    const result = inspect(where, resolve(OUT, entry.file), cue, swell)
    if (result) console.log(`${cue.padEnd(16)} ${entry.name.padEnd(20)} ${result.ms.toFixed(0).padStart(5)} ms  ${result.peakDb.toFixed(2)} dBFS`)
  }
  if (entries.length < 3) fail(cue, 'fewer than three candidates')
}
for (const id of CUE_IDS) if (!onDisk.cues[id]) fail(id, 'no candidates in the manifest')

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.map(problem => `  ${problem}`).join('\n')}`)
  process.exit(1)
}
console.log(`\nwrote and checked ${Object.values(onDisk.cues).flat().length} candidates for ${CUE_IDS.length} cues in ${OUT}`)
