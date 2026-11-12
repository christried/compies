import { describe, expect, it } from 'vitest'
import { sliceSpans } from '~/utils/wheel'
import { refillAt, refillPlan, type RestSlice } from '~/utils/wheel-refill'

// The refill (#524, 04-motion § Lucky Wheel, put back and refill): when the games on a resting wheel change, the slices that stay move to
// their new places over 0.6 s on `EASE.io`, a new slice scales in over 0.3 s on `EASE.pop`, a slice that leaves closes over the 0.6 s, and
// under reduced motion the new layout fades in over 0.2 s. A pure function of the time since the data changed: no clock, no DOM.

/** The two eases of 04-motion, written out here so the test does not borrow the code's copies. */
const IO = [0.65, 0, 0.35, 1] as const
const POP = [0.34, 1.56, 0.64, 1] as const

/** The y of the cubic-bezier at progress x, by bisection on the curve's parameter (a second solver, not the code's). */
function ease([x1, y1, x2, y2]: readonly [number, number, number, number], x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const at = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3
  let low = 0
  let high = 1
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2
    if (at(x1, x2, middle) < x) low = middle
    else high = middle
  }
  return at(y1, y2, (low + high) / 2)
}

const list = (...keys: string[]): RestSlice[] => keys.map(key => ({ key, name: key.toUpperCase() }))
const plan = (from: RestSlice[], to: RestSlice[], reduced = false) => {
  const made = refillPlan(from, to, reduced)
  if (!made) throw new Error('expected a plan')
  return made
}
/** Start and end of the slice with `key` at `ms`, rounded by the matcher. */
function span(from: RestSlice[], to: RestSlice[], ms: number, key: string): [number, number] {
  const found = refillAt(plan(from, to), ms).slices.find(slice => slice.key === key)
  if (!found) throw new Error(`no slice ${key} at ${ms} ms`)
  return [found.start, found.end]
}
const numbers = (slices: { start: number, end: number }[]) => slices.flatMap(slice => [slice.start, slice.end])

const abc = list('a', 'b', 'c')
const abnc = list('a', 'b', 'n', 'c')

describe('growing by one', () => {
  it.each([
    [0, { a: [0, 120], b: [120, 240], n: [240, 240], c: [240, 360] }],
    [150, { a: [0, 117.9], b: [117.9, 235.8], n: [235.5, 242.4], c: [242.1, 360] }],
    [300, { a: [0, 105], b: [105, 210], n: [210, 255], c: [255, 360] }],
    [600, { a: [0, 90], b: [90, 180], n: [180, 270], c: [270, 360] }],
  ])('has the slices at %i ms where the algorithm puts them', (ms, expected) => {
    for (const [key, [start, end]] of Object.entries(expected)) {
      const [gotStart, gotEnd] = span(abc, abnc, ms, key)!
      expect(gotStart, `${key} start`).toBeCloseTo(start!, 1)
      expect(gotEnd, `${key} end`).toBeCloseTo(end!, 1)
    }
  })
})

describe('shrinking by one', () => {
  it.each([
    [0, { a: [0, 90], b: [90, 180], n: [180, 270], c: [270, 360] }],
    // b ends at 184.25, not 184.3: the pinned table had a rounding slip (180 + 60 · 0.0708).
    [150, { a: [0, 92.1], b: [92.1, 184.25], n: [184.25, 267.9], c: [267.9, 360] }],
    [300, { a: [0, 105], b: [105, 210], n: [210, 255], c: [255, 360] }],
  ])('has the slices at %i ms where the algorithm puts them', (ms, expected) => {
    for (const [key, [start, end]] of Object.entries(expected)) {
      const [gotStart, gotEnd] = span(abnc, abc, ms, key)!
      expect(gotStart, `${key} start`).toBeCloseTo(start!, 1)
      expect(gotEnd, `${key} end`).toBeCloseTo(end!, 1)
    }
  })

  it('closes the leaving slice to nothing and leaves the others on a fresh layout at 600 ms', () => {
    const slices = refillAt(plan(abnc, abc), 599.9).slices
    const n = slices.find(slice => slice.key === 'n')!
    expect(n.end - n.start).toBeCloseTo(0, 1)
    expect(refillAt(plan(abnc, abc), 600).slices.map(slice => slice.key)).toEqual(['a', 'b', 'c'])
  })
})

describe('the curve and the duration', () => {
  it('runs 0.6 s on EASE.io: half way at 300 ms, not linear at 150 ms, final from 600 ms, the old layout before 0', () => {
    expect(plan(abc, abnc).ms).toBe(600)
    // EASE.io is symmetric: at 300 ms a kept slice has moved exactly half of its way (120 to 90 is 105).
    expect(span(abc, abnc, 300, 'a')![1]).toBeCloseTo(105, 6)
    expect(span(abc, abnc, 150, 'a')![1]).toBeCloseTo(120 - 30 * ease(IO, 0.25), 6)
    expect(span(abc, abnc, 150, 'a')![1]).not.toBeCloseTo(112.5, 1)
    for (const ms of [600, 6000]) {
      const slices = refillAt(plan(abc, abnc), ms).slices
      expect(numbers(slices)).toEqual(numbers(sliceSpans(4, -1, 0)))
    }
    expect(numbers(refillAt(plan(abc, abnc), -50).slices.filter(slice => slice.key !== 'n'))).toEqual(numbers(sliceSpans(3, -1, 0)))
  })

  it('scales a new slice in over 0.3 s on EASE.pop: wider than its slot at 150 ms, exactly its slot at 300 ms, never past 1.1', () => {
    const slot = (360 / 4) * ease(IO, 150 / 600)
    const at150 = span(abc, abnc, 150, 'n')!
    expect(at150[1] - at150[0]).toBeCloseTo(slot * ease(POP, 0.5), 6)
    expect(at150[1] - at150[0]).toBeGreaterThan(slot)
    // The pop grows about the slot's centre.
    expect((at150[0] + at150[1]) / 2).toBeCloseTo(span(abc, abnc, 150, 'b')![1] + slot / 2, 6)
    const at300 = span(abc, abnc, 300, 'n')!
    expect(at300[1] - at300[0]).toBeCloseTo(45, 6)
    let peak = 0
    for (let ms = 0; ms <= 300; ms++) peak = Math.max(peak, ease(POP, ms / 300))
    expect(peak).toBeGreaterThan(1.09)
    expect(peak).toBeLessThan(1.1)
    for (let ms = 0; ms <= 300; ms++) {
      const [start, end] = span(abc, abnc, ms, 'n')!
      expect(end - start).toBeLessThanOrEqual((360 / 4) * ease(IO, ms / 600) * 1.1 + 1e-9)
    }
  })
})

describe('the tiling', () => {
  it('has the slices side by side over the whole circle at every moment', () => {
    for (const [from, to] of [[abc, abnc], [abnc, abc], [list('a', 'b', 'c'), list('a', 'q', 'c')], [list('a', 'b', 'c', 'd'), list('a', 'x', 'y', 'd')]]) {
      for (const ms of [0, 75, 150, 225, 300, 450, 599, 600]) {
        const slices = refillAt(plan(from!, to!), ms).slices
        // The kept slices and the gap slots tile the circle; a new slice's pop is drawn over its slot, so it is left out of the sum.
        const keys = new Set(from!.map(slice => slice.key))
        const stays = (key: string) => keys.has(key) && to!.some(next => next.key === key)
        const width = (slice: { start: number, end: number }) => slice.end - slice.start
        const kept = slices.filter(slice => stays(slice.key)).reduce((sum, slice) => sum + width(slice), 0)
        const leaving = slices.filter(slice => keys.has(slice.key) && !stays(slice.key)).reduce((sum, slice) => sum + width(slice), 0)
        const slots = (360 / to!.length) * ease(IO, ms / 600) * to!.filter(next => !keys.has(next.key)).length
        expect(kept + leaving + slots).toBeCloseTo(360, 4)
      }
    }
  })
})

describe('the landing', () => {
  const cases: [string, RestSlice[], RestSlice[]][] = [
    ['grows by one', abc, abnc],
    ['shrinks by one', abnc, abc],
    ['grows by two in a row', list('a', 'b', 'c'), list('a', 'x', 'y', 'b', 'c')],
    ['swaps a game in one gap', list('a', 'b', 'c'), list('a', 'q', 'c')],
    ['changes at the start and the end', list('b', 'c'), list('a', 'b', 'c', 'd')],
    ['changes at the start only', list('a', 'b', 'c'), list('b', 'c')],
    ['loses two and gains one in different gaps', list('a', 'b', 'c', 'd', 'e'), list('a', 'c', 'x', 'e')],
  ]
  it.each(cases)('equals a fresh layout when it %s', (_name, from, to) => {
    const slices = refillAt(plan(from, to), 600).slices
    expect(slices.map(slice => slice.name)).toEqual(to.map(slice => slice.name))
    expect(numbers(slices)).toEqual(numbers(sliceSpans(to.length, -1, 0)))
    expect(slices.map(slice => slice.fillIndex)).toEqual(to.map((_, index) => index))
    expect(slices.every(slice => slice.fillCount === to.length)).toBe(true)
  })

  it('moves one slice out and another in within one gap', () => {
    const from = list('a', 'b', 'c')
    const to = list('a', 'q', 'c')
    const start = refillAt(plan(from, to), 0).slices
    expect(start.map(slice => slice.key)).toEqual(['a', 'b', 'q', 'c'])
    const b = start[1]!
    const q = start[2]!
    expect([b.start, b.end]).toEqual([120, 240])
    expect(q.start).toBeCloseTo(240, 6)
    expect(q.end).toBeCloseTo(240, 6)
    const end = refillAt(plan(from, to), 600).slices
    expect(end.map(slice => slice.key)).toEqual(['a', 'q', 'c'])
    expect([end[1]!.start, end[1]!.end]).toEqual([120, 240])
  })
})

describe('the edges', () => {
  const finite = (slices: { start: number, end: number }[]) => numbers(slices).every(Number.isFinite)

  it('opens a wheel from nothing as a pie from the top (0 to 1 game)', () => {
    const empty = plan([], list('x'))
    const first = refillAt(empty, 0).slices
    expect(first).toHaveLength(1)
    expect(first[0]!.end - first[0]!.start).toBe(0)
    expect(finite(first)).toBe(true)
    for (let ms = 0; ms <= 600; ms += 50) expect(finite(refillAt(empty, ms).slices)).toBe(true)
    const last = refillAt(empty, 600).slices
    expect([last[0]!.start, last[0]!.end]).toEqual([0, 360])
    // The slots sum to 360 · e on the way, from the top.
    const mid = refillAt(empty, 300).slices[0]!
    expect(mid.start).toBeCloseTo(0, 6)
    expect(mid.end).toBeCloseTo(180, 6)
  })

  it('closes a wheel to nothing (1 to 0 games)', () => {
    const closing = plan(list('x'), [])
    const first = refillAt(closing, 0).slices
    expect([first[0]!.start, first[0]!.end]).toEqual([0, 360])
    expect(refillAt(closing, 300).slices[0]!.end).toBeCloseTo(180, 6)
    expect(refillAt(closing, 600).slices).toEqual([])
  })

  it('goes from 1 to 2 and from 2 to 1 games', () => {
    const grow = plan(list('x'), list('x', 'y'))
    expect(refillAt(grow, 0).slices[0]).toMatchObject({ key: 'x', start: 0, end: 360 })
    expect(refillAt(grow, 600).slices.map(slice => [slice.start, slice.end])).toEqual([[0, 180], [180, 360]])
    const shrink = plan(list('x', 'y'), list('y'))
    const first = refillAt(shrink, 0).slices
    expect([first[0]!.start, first[0]!.end]).toEqual([0, 180])
    expect([first[1]!.start, first[1]!.end]).toEqual([180, 360])
    const middle = refillAt(shrink, 300).slices
    expect(middle[0]!.end - middle[0]!.start).toBeCloseTo(90, 6)
    expect([middle[1]!.start, middle[1]!.end]).toEqual([90, 360])
    expect(refillAt(shrink, 600).slices.map(slice => [slice.start, slice.end])).toEqual([[0, 360]])
  })

  it('goes from 2 to 3 games', () => {
    const slices = refillAt(plan(list('a', 'b'), list('a', 'b', 'c')), 600).slices
    expect(numbers(slices)).toEqual(numbers(sliceSpans(3, -1, 0)))
  })

  it('grows the dev library at its full size (176 games) by one, finite and quick', () => {
    const from = Array.from({ length: 176 }, (_, index) => ({ key: `g${index}`, name: `Spiel ${index}` }))
    const to = [...from.slice(0, 88), { key: 'new', name: 'Neu' }, ...from.slice(88)]
    const started = performance.now()
    const made = plan(from, to)
    const slices = refillAt(made, 150).slices
    const took = performance.now() - started
    expect(slices).toHaveLength(177)
    expect(finite(slices)).toBe(true)
    expect(took).toBeLessThan(5)
  })
})

describe('when there is no plan', () => {
  it('has none for equal keys with a changed name, a changed order, nothing kept, or nothing at all', () => {
    expect(refillPlan([{ key: 'a', name: 'A' }], [{ key: 'a', name: 'Anders' }], false)).toBeNull()
    expect(refillPlan(list('a', 'b'), list('b', 'a'), false)).toBeNull()
    expect(refillPlan(list('a'), list('b'), false)).toBeNull()
    expect(refillPlan([], [], false)).toBeNull()
  })

  it('has none when the kept keys change their relative order, although one is added', () => {
    expect(refillPlan(list('a', 'b', 'c'), list('c', 'x', 'a'), false)).toBeNull()
  })
})

describe('the names and the fills', () => {
  it('gives a leaving slice its old name and the others the new one, with the fills of the layout each belongs to', () => {
    const from = [{ key: 'a', name: 'Alt' }, { key: 'b', name: 'Bleibt' }, { key: 'c', name: 'Geht' }]
    const to = [{ key: 'z', name: 'Neu' }, { key: 'a', name: 'Umbenannt' }, { key: 'b', name: 'Bleibt' }]
    const slices = refillAt(plan(from, to), 100).slices
    expect(slices.map(slice => slice.key)).toEqual(['z', 'a', 'b', 'c'])
    expect(slices.map(slice => slice.name)).toEqual(['Neu', 'Umbenannt', 'Bleibt', 'Geht'])
    // Kept and added slices take their index in the new list, a leaving one its index in the old: no colour changes at the end.
    expect(slices.map(slice => [slice.fillIndex, slice.fillCount])).toEqual([[0, 3], [1, 3], [2, 3], [2, 3]])
  })
})

describe('under reduced motion', () => {
  it('shows the final layout at once and fades it in over 0.2 s, linearly', () => {
    const reduced = plan(abc, abnc, true)
    expect(reduced.ms).toBe(200)
    for (const [ms, opacity] of [[0, 0], [100, 0.5], [200, 1]] as const) {
      const shown = refillAt(reduced, ms)
      expect(shown.opacity).toBeCloseTo(opacity, 6)
      expect(shown.slices.map(slice => slice.key)).toEqual(['a', 'b', 'n', 'c'])
      expect(numbers(shown.slices)).toEqual(numbers(sliceSpans(4, -1, 0)))
    }
    expect(refillAt(plan(abnc, abc, true), 0).slices.map(slice => slice.key)).toEqual(['a', 'b', 'c'])
  })

  it('has opacity 1 and 600 ms when motion is not reduced', () => {
    const full = plan(abc, abnc)
    expect(full.ms).toBe(600)
    for (const ms of [0, 100, 300, 600]) expect(refillAt(full, ms).opacity).toBe(1)
  })
})
