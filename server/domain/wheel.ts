import de from '../../i18n/locales/de.json'

// The server's draw of a spin (#229, spec #218 § Drawing, Hidden wheel on the wire): pure, with the source of randomness
// passed in (the handler passes `crypto.randomInt`), so the tests script it and the draw is as uniform as the source.

/** What a spin stores and replays: the slices in order, the result slice, where in it the pointer rests, and the labels of a Hidden wheel. */
export interface Spin {
  /** The games left, in their order: one slice each. */
  sliceGameIds: string[]
  resultIndex: number
  /** Where in the result slice the pointer stops, from 0.2 up to, not including, 0.8: off the slice edges (04-motion: 0.5 ± 0.3). */
  resultOffset: number
  /** Placeholder names shuffled for this spin, one per slice; null on a visible wheel (the clients take the names from the Event read). */
  sliceLabels: string[] | null
}

/** The placeholder names of a Hidden wheel (brief §18): the copy's own list, so the names live in one place. */
export const WHEEL_PLACEHOLDERS: readonly string[] = de.wheel.placeholders

/** The offsets are drawn in thousandths between 0.2 and 0.8. */
const OFFSET_STEPS = 600

/** Fisher-Yates over a copy: every order is as likely as the source makes it. */
function shuffled<T>(items: readonly T[], randomInt: (n: number) => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/**
 * Draws a spin from the games left. `placeholders` is the list of a Hidden wheel (null on a visible wheel): shuffled per spin, so
 * a game cannot be followed from one spin to the next, one per slice and none twice; slices past the list are „???“ (06-copy).
 * `randomInt(n)` answers a whole number from 0 up to, not including, `n`.
 */
export function drawSpin(left: readonly string[], placeholders: readonly string[] | null, randomInt: (n: number) => number): Spin {
  const resultIndex = randomInt(left.length)
  const resultOffset = 0.2 + randomInt(OFFSET_STEPS) / 1000
  const names = placeholders === null ? null : shuffled(placeholders, randomInt)
  return {
    sliceGameIds: [...left],
    resultIndex,
    resultOffset,
    sliceLabels: names === null ? null : left.map((_, index) => names[index] ?? de.wheel.placeholderQ),
  }
}
