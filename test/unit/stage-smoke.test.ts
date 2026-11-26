import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EventView } from '../../shared/event'
import { SMOKE_SHAPES, smokeNextEdge, smokeRate, smokeWindows } from '../../app/utils/stage-smoke'

// The stage smoke's plan (#675, note 19-rauch-auf-der-buehne): which windows slow it down, the rate in them and the five shapes. A pure
// function of the viewer's own Event read, as the sound cues are: no clock in it, so every device, a late joiner included, holds the same plan.
type SmokeView = Pick<EventView, 'wheel' | 'coin' | 'ceremony'>

const iso = (ms: number) => new Date(ms).toISOString()
const T = Date.parse('2026-11-26T20:00:00.000Z')

const none: SmokeView = { wheel: null, coin: null, ceremony: null }

function wheelView(spin: { spinStartAt: number, stopAt: number } | null, vetoEndsAt: number | null | 'no-draw'): SmokeView['wheel'] {
  return {
    count: 5,
    slices: null,
    spin: spin && {
      roundId: 'r1',
      drawId: 'd1',
      spinStartAt: iso(spin.spinStartAt),
      stopAt: iso(spin.stopAt),
      slices: 5,
      resultIndex: 0,
      resultOffset: 0,
      labels: null,
      game: null,
      current: true,
    },
    vetoes: {
      left: [],
      own: null,
      revealed: null,
      draw: vetoEndsAt === 'no-draw' ? null : { drawId: 'd1', kind: 'spin', stopAt: iso(T), vetoEndsAt: vetoEndsAt === null ? null : iso(vetoEndsAt), game: null },
    },
  }
}

describe('smokeWindows', () => {
  it('reads nothing from a read without a wheel, a coin and a ceremony', () => {
    expect(smokeWindows(none)).toEqual([])
  })

  it('the Lucky Wheel slows the smoke from the spin start to 2.2 s after the stop', () => {
    const view = { ...none, wheel: wheelView({ spinStartAt: T, stopAt: T + 5000 }, 'no-draw') }
    expect(smokeWindows(view)).toEqual([{ from: T, to: T + 5000 + 2200 }])
  })

  it('a wheel without a spin has no window', () => {
    expect(smokeWindows({ ...none, wheel: wheelView(null, 'no-draw') })).toEqual([])
  })

  it('the Veto reveal slows it from the end of the Veto window for 1.2 s', () => {
    const view = { ...none, wheel: wheelView(null, T + 30_000) }
    expect(smokeWindows(view)).toEqual([{ from: T + 30_000, to: T + 31_200 }])
  })

  it('a Veto window whose end is not known yet (a Member before the stop) has no window', () => {
    expect(smokeWindows({ ...none, wheel: wheelView(null, null) })).toEqual([])
  })

  it('the coin flip slows it from the toss to the landing', () => {
    const view = { ...none, coin: { id: 'c1', side: 'heads' as const, startedAt: iso(T + 100), landsAt: iso(T + 4100) } }
    expect(smokeWindows(view)).toEqual([{ from: T + 100, to: T + 4100 }])
  })

  it('the Award ceremony slows it from its start to its end', () => {
    const view = { ...none, ceremony: { startsAt: iso(T), endsAt: iso(T + 60_000), gag: 'trip' as const } }
    expect(smokeWindows(view)).toEqual([{ from: T, to: T + 60_000 }])
  })

  it('a spin and its Veto reveal give two windows', () => {
    const view = { ...none, wheel: wheelView({ spinStartAt: T, stopAt: T + 5000 }, T + 30_000) }
    expect(smokeWindows(view)).toEqual([{ from: T, to: T + 7200 }, { from: T + 30_000, to: T + 31_200 }])
  })
})

describe('smokeRate', () => {
  const windows = [{ from: 1000, to: 2000 }]

  it('is 1 before a window, half speed from its first instant, 1 again from its end', () => {
    expect(smokeRate(windows, 999)).toBe(1)
    expect(smokeRate(windows, 1000)).toBe(0.5)
    expect(smokeRate(windows, 1500)).toBe(0.5)
    expect(smokeRate(windows, 1999)).toBe(0.5)
    expect(smokeRate(windows, 2000)).toBe(1)
    expect(smokeRate(windows, 9000)).toBe(1)
  })

  it('stays at half speed while any of two overlapping windows holds', () => {
    const overlapping = [{ from: 1000, to: 3000 }, { from: 2000, to: 2500 }]
    expect(smokeRate(overlapping, 2600)).toBe(0.5)
    expect(smokeRate(overlapping, 3000)).toBe(1)
  })

  it('is 1 without windows', () => {
    expect(smokeRate([], 1500)).toBe(1)
  })
})

describe('smokeNextEdge', () => {
  const windows = [{ from: 1000, to: 2000 }, { from: 5000, to: 6000 }]

  it('names the next start or end after now, and null after the last', () => {
    expect(smokeNextEdge(windows, 0)).toBe(1000)
    expect(smokeNextEdge(windows, 1000)).toBe(2000)
    expect(smokeNextEdge(windows, 2500)).toBe(5000)
    expect(smokeNextEdge(windows, 5500)).toBe(6000)
    expect(smokeNextEdge(windows, 6000)).toBeNull()
    expect(smokeNextEdge([], 0)).toBeNull()
  })
})

describe('SMOKE_SHAPES', () => {
  it('are five, with the colours, delays and leg durations of the approved design', () => {
    expect(SMOKE_SHAPES).toHaveLength(5)
    expect(SMOKE_SHAPES.map(s => s.hell)).toEqual(['pop', 'mint', 'primary', 'mint', 'primary'])
    expect(SMOKE_SHAPES.map(s => s.dunkel)).toEqual(['hot', 'cobalt', 'hot', 'cobalt', 'hot'])
    expect(SMOKE_SHAPES.map(s => s.delaySeconds)).toEqual([0, -9, -18, -27, -36])
    expect(SMOKE_SHAPES.map(s => s.legSeconds)).toEqual([18, 22, 26, 30, 34])
    expect(SMOKE_SHAPES.map(s => s.keyframes)).toEqual(['cp-smoke-rise-a', 'cp-smoke-rise-b', 'cp-smoke-rise-a', 'cp-smoke-rise-b', 'cp-smoke-rise-a'])
  })

  it('place the first shape at 4/-16 (46 x 60) from md and at -34/-14 (110 x 46) below it', () => {
    expect(SMOKE_SHAPES[0]!.wide).toEqual({ x: 4, y: -16, w: 46, h: 60 })
    expect(SMOKE_SHAPES[0]!.narrow).toEqual({ x: -34, y: -14, w: 110, h: 46 })
    expect(SMOKE_SHAPES[4]!.wide).toEqual({ x: -6, y: 48, w: 40, h: 50 })
    expect(SMOKE_SHAPES[4]!.narrow).toEqual({ x: -40, y: 66, w: 120, h: 38 })
  })
})

describe('the smoke keyframes', () => {
  // The seam is the stylesheet, as in motion-utilities.test.ts: jsdom does not run CSS animations.
  const css = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-theme.css'), 'utf8')
  const body = (name: string) => css.match(new RegExp(`@keyframes ${name}\\s*\\{([^@]*?\\})\\s*\\}`))?.[1] ?? ''

  it('rise-a drifts right and up, rise-b left and up, both only by transform and opacity', () => {
    const a = body('cp-smoke-rise-a')
    const b = body('cp-smoke-rise-b')
    expect(a).toMatch(/to\s*\{[^}]*translate3d\(3%,\s*-6%,\s*0\)\s*scale\(1\.08\)[^}]*opacity:\s*1/)
    expect(b).toMatch(/to\s*\{[^}]*translate3d\(-3%,\s*-6%,\s*0\)\s*scale\(1\.06\)[^}]*opacity:\s*1/)
    for (const frames of [a, b]) {
      expect(frames).toMatch(/from\s*\{[^}]*opacity:\s*\.8/)
      expect(frames).not.toMatch(/filter|left|top/)
    }
  })
})
