import { CROSSFADE_MS, IO_EASE, POP_EASE, REDISTRIBUTE_MS, bezier, sliceSpans } from './wheel'

// The refill (#524, spec #503 § The motion, 04-motion § Lucky Wheel, put back and refill): when the games on a resting wheel change, the
// slices that stay move to their new places over 0.6 s on `EASE.io`, a new slice scales in over 0.3 s on `EASE.pop`, a slice that leaves
// closes over the same 0.6 s, and under reduced motion the new layout fades in over 0.2 s. A pure function of the time since the data
// changed, no clock and no DOM: this is the one motion of the wheel that is not a function of the server's time (ADR 0013), because it
// answers a change of data, not a moment the server sets. The component keeps the local clock and starts a plan only at rest.

const POP_MS = 300

/**
 * A slice as the plan knows it: what tells it from another across a change of data, and its name. `key` is the game's id for a viewer who
 * has the slices; for a Member under a Hidden wheel, who gets only the count, it is the slot's number, so nothing of the pool reaches
 * here that the server did not send that viewer. A key is never rendered.
 */
export interface RestSlice { key: string, name: string }

interface RefillSlice {
  key: string
  name: string
  /** Degrees from the top, as `sliceSpans` gives them. */
  start: number
  end: number
  /** Which fill the slice takes and of how many: its place in the new layout, or in the old one for a slice that leaves, so no colour changes at the end. */
  fillIndex: number
  fillCount: number
}

export interface RefillPlan {
  from: readonly RestSlice[]
  to: readonly RestSlice[]
  reduced: boolean
  /** How long the plan runs: 0.6 s, or 0.2 s under reduced motion. */
  ms: number
}

/**
 * The plan from one layout to the next, or null when the change is not one to play: only a name changed, the games that stay do not keep
 * their order (the Host's toggle of the Hidden wheel, a reorder), or nothing stays (every key is another one). Those show the new layout
 * at once, as before. A list that grows from or shrinks to nothing does play.
 */
export function refillPlan(from: readonly RestSlice[], to: readonly RestSlice[], reduced: boolean): RefillPlan | null {
  if (from.length === to.length && from.every((slice, index) => slice.key === to[index]!.key)) return null
  const place = new Map(from.map((slice, index) => [slice.key, index]))
  const kept = to.flatMap(slice => place.get(slice.key) ?? [])
  if (kept.length === 0 && from.length > 0 && to.length > 0) return null
  if (kept.some((index, position) => position > 0 && index < kept[position - 1]!)) return null
  // Reduced motion fades the new layout in for the app's one crossfade length (04-motion: „Reduced: … fade 0.2“).
  return { from, to, reduced, ms: reduced ? CROSSFADE_MS : REDISTRIBUTE_MS }
}

/**
 * The layout `elapsed` ms after the data changed, and the rotor's opacity. The slices of `to` and, until it ends, the ones of `from` that
 * leave. The kept slices go from their old span to their new one by the ease; between two of them, a run of leaving slices (each
 * closing from the old share to nothing) is followed by a run of new ones (each slot opening from nothing to the new share), so the
 * spans tile the circle at every moment. A new slice is drawn `EASE.pop` times its slot about the slot's centre: it may overshoot its
 * neighbours by a tenth for a moment, that is the pop. From `ms` on the result is the fresh layout of `to`.
 */
export function refillAt(plan: RefillPlan, elapsed: number): { slices: RefillSlice[], opacity: number } {
  const { from, to } = plan
  const final = () => sliceSpans(to.length, -1, 0).map((span, index) => ({ key: to[index]!.key, name: to[index]!.name, ...span, fillIndex: index, fillCount: to.length }))
  if (plan.reduced) return { slices: final(), opacity: Math.min(Math.max(elapsed / CROSSFADE_MS, 0), 1) }
  if (elapsed >= plan.ms) return { slices: final(), opacity: 1 }

  const move = bezier(IO_EASE, elapsed / REDISTRIBUTE_MS)
  const pop = bezier(POP_EASE, elapsed / POP_MS)
  const evenFrom = sliceSpans(from.length, -1, 0)
  const evenTo = sliceSpans(to.length, -1, 0)
  const fromShare = from.length > 0 ? 360 / from.length : 0
  const toShare = to.length > 0 ? 360 / to.length : 0
  const inFrom = new Map(from.map((slice, index) => [slice.key, index]))
  const slices: RefillSlice[] = []
  let cursor = 0
  let fromAt = 0
  let toAt = 0

  /** The leaving slices of `from` and the new ones of `to` up to (not including) the next kept slice: the leaving ones first. */
  function gap(fromEnd: number, toEnd: number) {
    for (; fromAt < fromEnd; fromAt++) {
      const width = fromShare * (1 - move)
      slices.push({ key: from[fromAt]!.key, name: from[fromAt]!.name, start: cursor, end: cursor + width, fillIndex: fromAt, fillCount: from.length })
      cursor += width
    }
    for (; toAt < toEnd; toAt++) {
      const slot = toShare * move
      const width = Math.min(360, slot * pop)
      const centre = cursor + slot / 2
      slices.push({ key: to[toAt]!.key, name: to[toAt]!.name, start: centre - width / 2, end: centre + width / 2, fillIndex: toAt, fillCount: to.length })
      cursor += slot
    }
  }

  for (const [toIndex, slice] of to.entries()) {
    const fromIndex = inFrom.get(slice.key)
    if (fromIndex === undefined) continue
    gap(fromIndex, toIndex)
    const before = evenFrom[fromIndex]!
    const after = evenTo[toIndex]!
    const start = before.start + (after.start - before.start) * move
    const end = before.end + (after.end - before.end) * move
    slices.push({ key: slice.key, name: slice.name, start, end, fillIndex: toIndex, fillCount: to.length })
    cursor = end
    fromAt = fromIndex + 1
    toAt = toIndex + 1
  }
  gap(from.length, to.length)
  return { slices, opacity: 1 }
}
