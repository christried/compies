// The recipe of Compibert's laugh in the Award ceremony (#746, spec #718): cb-laugh, 0.5 s, at the instant he gets up after the trophy lands. Same
// contract as the other files of this folder (scripts/cue-recipes/wheel-voice.mjs): { name, note (German, what the operator reads), ms, make(rng) ->
// Float64Array, fadeOut?: seconds }. Nothing here has been heard while writing it: each recipe reasons from the physics of the sound it names, and the
// operator's ear decides in the listening session (#748). He has no words: every candidate is a chuckle, a squeak or a puff, never a syllable or a
// vowel that moves like speech. The sound plays on its own, after the stamp, the fanfare and the crowd have started, so it is dry and short, and each
// recipe ends in near-silence (the generator fails a last sample above 2 % of the peak).
import { bar, burst, crush, mix, osc, shape, svf, thump, pluckEnv } from '../cue-kit.mjs'

export default {
  'cb-laugh': [
    {
      // Four short saw blips of 90 ms, each gliding up a fifth and back down, a little lower and quieter each time, through a soft low-pass: "hi-hi-hi-hi".
      name: 'kichern-blips', ms: 500, fadeOut: 0.05, note: 'vier kurze Blips, jeder gleitet eine Quinte hoch und zurück, kichernd',
      make() {
        const length = 0.09
        const layers = [0, 1, 2, 3].map((k) => {
          const base = 560 * 0.94 ** k
          const blip = osc('saw', length, t => base * 1.5 ** Math.sin(Math.PI * t / length))
          const fade = (t) => Math.min(1, (length - t) / 0.012)
          return [shape(svf(blip, 'low', 2600, 0.9), t => pluckEnv(0.002, 0.045)(t) * fade(t)), k * 0.11, 0.85 ** k]
        })
        return mix(0.5, ...layers)
      },
    },
    {
      // A squeak-laugh: one quick square glide up (700 to 2200 Hz in 0.12 s) that falls back to 900 Hz, taken through a high-pass so it stays thin and bright.
      name: 'kiekser', ms: 500, fadeOut: 0.05, note: 'ein Kiekser: schneller Gleiter nach oben, fällt zurück, dünn und hell',
      make() {
        const length = 0.34
        const hz = t => (t < 0.12 ? 700 * (2200 / 700) ** (t / 0.12) : 2200 * (900 / 2200) ** Math.min(1, (t - 0.12) / 0.22))
        const squeak = osc('square', length, hz, { duty: 0.4 })
        return mix(0.5, [shape(svf(squeak, 'high', 650, 0.8), t => pluckEnv(0.003, 0.16)(t) * Math.min(1, (length - t) / 0.03)), 0, 1])
      },
    },
    {
      // A belly chuckle: three low thumps (200 to 120 Hz) that fade, a wooden bar at 300 Hz on each and a small puff of air, so a phone speaker still shows them.
      name: 'bauch-glucks', ms: 500, fadeOut: 0.05, note: 'tiefes Bauchglucksen, drei weiche Stöße, leiser werdend',
      make(rng) {
        const pulse = (gain, at) => [
          [thump(0.14, 200, 120, 0.05, 0.05), at, gain],
          [bar(0.14, 300, 0.04), at, gain * 0.4],
          [burst(0.04, rng, 0.01, { lp: 1600 }), at, gain * 0.3],
        ]
        return mix(0.5, ...pulse(1, 0), ...pulse(0.75, 0.16), ...pulse(0.5, 0.32))
      },
    },
    {
      // Noise chuckles: three puffs of band-passed noise at 0, 0.14 and 0.28 s, crushed to four bits so they crackle like a cheap speaker.
      name: 'kratz-lacher', ms: 500, fadeOut: 0.05, note: 'drei rauschende Lacher, auf vier Bit zerkratzt',
      make(rng) {
        const puff = () => crush(burst(0.12, rng, 0.03, { bp: 1800, q: 1.5 }), 4)
        return mix(0.5, [puff(), 0, 1], [puff(), 0.14, 0.8], [puff(), 0.28, 0.6])
      },
    },
  ],
}
