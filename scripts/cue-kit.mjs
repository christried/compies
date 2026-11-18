// The synthesis kit of the sound candidates (#535, moved out of make-cue-candidates.mjs by #740): the helpers the generator and the recipe
// files of scripts/cue-recipes/ share. All buffers are Float64Array at RATE; times in seconds. A new helper goes here, not into a recipe file.

export const RATE = 44_100
export const PEAK = 0.8913 // -1 dBFS
export const TAU = Math.PI * 2

// ---- a small synthesis kit ---------------------------------------------------------------------------------------------------------------

export const frames = seconds => Math.round(seconds * RATE)
export const buf = seconds => new Float64Array(frames(seconds))
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

export function fnv(text) {
  let h = 0x811C9DC5
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

// mulberry32, as in scripts/bake-compibert.mjs.
export function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Sums layers `[buffer, atSeconds, gain]` into a new buffer of `seconds`; what runs past the end is cut. */
export function mix(seconds, ...layers) {
  const out = buf(seconds)
  for (const [layer, at = 0, gain = 1] of layers) add(out, layer, at, gain)
  return out
}

/** Adds `layer` into `target` from `at` seconds on, in place; returns target. */
export function add(target, layer, at = 0, gain = 1) {
  const offset = frames(at)
  for (let i = 0; i < layer.length && offset + i < target.length; i++) if (offset + i >= 0) target[offset + i] += layer[i] * gain
  return target
}

/** Scales a buffer to the given peak, in place. Used on layers so the gains in a mix mean something. */
export function peakTo(b, level = 1) {
  let top = 0
  for (const x of b) top = Math.max(top, Math.abs(x))
  if (top > 0) for (let i = 0; i < b.length; i++) b[i] *= level / top
  return b
}

/** Multiplies a buffer by `fn(t, i)`, in place. */
export function shape(b, fn) {
  for (let i = 0; i < b.length; i++) b[i] *= fn(i / RATE, i)
  return b
}

export const expo = tau => t => Math.exp(-t / tau)

/** An oscillator: sine, tri, saw or square (polyBLEP-smoothed against the worst aliasing). `hz` and `duty` are numbers or functions of t; `phase` in cycles (0.25 on a sine starts at the peak, so a thump has its transient at once). */
export function osc(kind, seconds, hz, { duty = 0.5, phase = 0 } = {}) {
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

export function noise(seconds, rng) {
  const out = buf(seconds)
  for (let i = 0; i < out.length; i++) out[i] = rng() * 2 - 1
  return out
}

/** The noise channel of a console: noise held for 1/holdHz s per value, so it sounds grainy and low-fi instead of smooth. */
export function crushNoise(seconds, rng, holdHz) {
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
export function crush(b, bits) {
  const step = 2 / (2 ** bits)
  for (let i = 0; i < b.length; i++) b[i] = Math.round(b[i] / step) * step
  return b
}

/** A state-variable filter (Cytomic/TPT form, stable under a moving cutoff). `mode` low | high | band (band has unity gain at the centre); `cutoff` in Hz or a function of t. */
export function svf(input, mode, cutoff, q = 0.707) {
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
export function modal(seconds, partials) {
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
export function bar(seconds, hz, tau, { ratios = [1, 2.76, 5.4, 8.93], tilt = 0.5 } = {}) {
  return modal(seconds, ratios.map((ratio, i) => ({ hz: hz * ratio, amp: tilt ** i, tau: tau / (1 + i * 0.8) })))
}

/** A short noise burst, filtered, with an exponential decay: the strike of a mallet, a flick of plastic, a puff of air. */
export function burst(seconds, rng, tau, { lp, hp, bp, q = 0.8 } = {}) {
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
export const thump = (seconds, from, to, drop, tau) =>
  shape(osc('sine', seconds, t => to + (from - to) * Math.exp(-t / drop), { phase: 0.25 }), expo(tau)).map(x => Math.tanh(2.2 * x))

/** A plain attack-then-decay envelope. */
export const pluckEnv = (attack, tau) => t => (t < attack ? t / attack : Math.exp(-(t - attack) / tau))

/** A held-note envelope: `attack` s up, full until `length` s, then a release with time constant `release`. */
export const heldEnv = (attack, length, release) => t => Math.min(1, t / attack) * (t < length ? 1 : Math.exp(-(t - length) / release))

/** A brassy note by modal synthesis (#744): the harmonic series of `hz`, the upper partials quieter (`rolloff`) and shorter-lived, each starting at its peak so the note has its onset at once. */
export const brass = (seconds, hz, tau, { count = 8, rolloff = 1 } = {}) =>
  modal(seconds, Array.from({ length: count }, (_, i) => ({ hz: hz * (i + 1), amp: (i + 1) ** -rolloff, tau: tau / (1 + i * 0.25), phase: Math.PI / 2 })))
