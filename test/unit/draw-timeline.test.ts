import { describe, expect, it } from 'vitest'
import { clipEnded, clipRunning, clipWindow, drawGameKnown, drawInstants, isDue, settleAt, spinCommitAt, stopReached, vetoEndAfterSkip, vetoEndCap, vetoesSealed, windowEnded, windowFraction, windowOpen, type DrawInstants } from '../../shared/draw-timeline'

// The Draw's timeline (#414, ADR 0013 amendment 2026-10-31): a Draw's instants and what each decides at `now`. Every comparison
// keeps its edge, pinned here at the four boundary milliseconds (stop - 1, stop, end - 1, end); nothing may move them silently.
// The SQL twins (stoppedDraws, dueDraws) are held to the same table by test/integration/draw-timeline.test.ts.

const C = Date.parse('2090-10-30T10:00:00.000Z')
const ms = (date: Date | null) => date!.getTime()

describe('drawInstants', () => {
  it('a spin with a window: starts a lead after the commit, stops 6 s later, the window ends the clip length plus 30 s after the stop', () => {
    const instants = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true, clipLength: 30 })
    expect(ms(instants.spinStartAt)).toBe(C + 1500)
    expect(ms(instants.stopAt)).toBe(C + 7500)
    expect(ms(instants.vetoEndsAt)).toBe(C + 7500 + 60_000)
  })

  it('a spin without a window has no end, whatever the clip length', () => {
    for (const clipLength of [null, 10, 30, 120]) {
      const instants = drawInstants({ kind: 'spin', commitAt: C, windowOpens: false, clipLength })
      expect(ms(instants.spinStartAt)).toBe(C + 1500)
      expect(ms(instants.stopAt)).toBe(C + 7500)
      expect(instants.vetoEndsAt).toBeNull()
    }
  })

  it('a set draw with a window stops at the commit and has no spin start', () => {
    const instants = drawInstants({ kind: 'set', commitAt: C, windowOpens: true, clipLength: 30 })
    expect(instants.spinStartAt).toBeNull()
    expect(ms(instants.stopAt)).toBe(C)
    expect(ms(instants.vetoEndsAt)).toBe(C + 60_000)
  })

  it('a set draw without a window has no end, whatever the clip length', () => {
    for (const clipLength of [null, 10, 30, 120]) {
      const instants = drawInstants({ kind: 'set', commitAt: C, windowOpens: false, clipLength })
      expect(instants.spinStartAt).toBeNull()
      expect(ms(instants.stopAt)).toBe(C)
      expect(instants.vetoEndsAt).toBeNull()
    }
  })

  it('takes the commit as a number, a Date or an ISO string', () => {
    const expected = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true, clipLength: 30 })
    expect(drawInstants({ kind: 'spin', commitAt: new Date(C), windowOpens: true, clipLength: 30 })).toEqual(expected)
    expect(drawInstants({ kind: 'spin', commitAt: new Date(C).toISOString(), windowOpens: true, clipLength: 30 })).toEqual(expected)
  })

  // #505: the Veto window lasts the drawn game's clip length plus 30 s, 30 s for a game without a video.
  it.each([
    { clipLength: 10, window: 40_000 },
    { clipLength: 30, window: 60_000 },
    { clipLength: 120, window: 150_000 },
    { clipLength: null, window: 30_000 },
  ])('a window for a clip of $clipLength s lasts $window ms after the stop, for a set draw and a spin', ({ clipLength, window }) => {
    const set = drawInstants({ kind: 'set', commitAt: C, windowOpens: true, clipLength })
    expect(ms(set.vetoEndsAt) - ms(set.stopAt)).toBe(window)
    expect(ms(set.vetoEndsAt)).toBe(C + window)
    const spin = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true, clipLength })
    expect(ms(spin.vetoEndsAt) - ms(spin.stopAt)).toBe(window)
    expect(ms(spin.vetoEndsAt)).toBe(C + 7500 + window)
  })
})

const KINDS = ['spin', 'set'] as const
// A window of 40 s (10 s clip), one minute (30 s clip), 150 s (the longest clip) and 30 s (no video): every edge holds for each.
const CLIPS = [{ clipLength: 10, windowMs: 40_000 }, { clipLength: 30, windowMs: 60_000 }, { clipLength: 120, windowMs: 150_000 }, { clipLength: null, windowMs: 30_000 }]
const CASES = KINDS.flatMap(kind => CLIPS.map(clip => ({ kind, ...clip })))

describe.each(CASES)('a $kind draw with a Veto window and a clip of $clipLength s', ({ kind, clipLength, windowMs }) => {
  const draw = drawInstants({ kind, commitAt: C, windowOpens: true, clipLength })
  const S = ms(draw.stopAt)
  const E = ms(draw.vetoEndsAt)
  const probes = [S - 1, S, E - 1, E]
  const row = { stopAt: draw.stopAt, vetoEndsAt: draw.vetoEndsAt }
  const at = (fn: (now: number) => unknown) => probes.map(now => fn(now))

  it('is known to a non-Host from the stop on, stop inclusive', () => {
    expect(at(now => drawGameKnown({ isHost: false, draw: row, now }))).toEqual([false, true, true, true])
  })

  it('has its stop reached from the stop on, stop inclusive: the client\'s spelling of the edge a non-Host knows the game at', () => {
    expect(at(now => stopReached(row, now))).toEqual([false, true, true, true])
    expect(at(now => stopReached(row, now))).toEqual(at(now => drawGameKnown({ isHost: false, draw: row, now })))
  })

  it('is known to the Host always', () => {
    expect(at(now => drawGameKnown({ isHost: true, draw: row, now }))).toEqual([true, true, true, true])
  })

  it('has its window open from the stop (inclusive) to the end (exclusive)', () => {
    expect(at(now => windowOpen(row, now))).toEqual([false, true, true, false])
  })

  it('has its window ended from the end on, never before the stop', () => {
    expect(at(now => windowEnded(row, now))).toEqual([false, false, false, true])
  })

  it('keeps the Vetoes sealed until the end, end exclusive', () => {
    expect(at(now => vetoesSealed(row, now))).toEqual([true, true, true, false])
  })

  it('is due at the end, inclusive, when it has no outcome', () => {
    expect(at(now => isDue({ ...row, outcome: null }, now))).toEqual([false, false, false, true])
  })

  it('is never due once it has an outcome', () => {
    expect(at(now => isDue({ ...row, outcome: 'set' }, now))).toEqual([false, false, false, false])
  })

  it('settles at the end of the window', () => {
    expect(settleAt(row).getTime()).toBe(E)
  })

  it('has a bar that is full at the stop and empty at the end', () => {
    expect(at(now => windowFraction(row, now))).toEqual([1, 1, 1 / windowMs, 0])
  })
})

describe.each(KINDS)('a %s draw without a Veto window', (kind) => {
  const draw = drawInstants({ kind, commitAt: C, windowOpens: false, clipLength: null })
  const S = ms(draw.stopAt)
  const probes = [S - 1, S, S + 1]
  const row = { stopAt: draw.stopAt, vetoEndsAt: null }
  const at = (fn: (now: number) => unknown) => probes.map(now => fn(now))

  it('is known to a non-Host from the stop on', () => {
    expect(at(now => drawGameKnown({ isHost: false, draw: row, now }))).toEqual([false, true, true])
  })

  it('has no window to open, end or seal', () => {
    expect(at(now => windowOpen(row, now))).toEqual([false, false, false])
    expect(at(now => windowEnded(row, now))).toEqual([false, false, false])
    expect(at(now => vetoesSealed(row, now))).toEqual([false, false, false])
  })

  it('is due from the stop on, inclusive', () => {
    expect(at(now => isDue({ ...row, outcome: null }, now))).toEqual([false, true, true])
    expect(at(now => isDue({ ...row, outcome: 'set' }, now))).toEqual([false, false, false])
  })

  it('settles at the stop', () => {
    expect(settleAt(row).getTime()).toBe(S)
  })

  it('has an empty bar', () => {
    expect(at(now => windowFraction(row, now))).toEqual([0, 0, 0])
  })
})

describe('spinCommitAt', () => {
  it('is the commit a spin was written with: the inverse of drawInstants, for the stage that lifts at the commit (#441)', () => {
    const instants = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true, clipLength: 30 })
    expect(spinCommitAt({ spinStartAt: instants.spinStartAt! })).toBe(C)
    expect(spinCommitAt({ spinStartAt: instants.spinStartAt!.toISOString() })).toBe(C)
    expect(spinCommitAt({ spinStartAt: C + 1500 })).toBe(C)
  })
})

describe('windowFraction from the Draw\'s own instants', () => {
  const stop = C + 7500

  it('follows a window longer than 60 s: 0.4 left at 90 s of 150 s', () => {
    expect(windowFraction({ stopAt: stop, vetoEndsAt: stop + 150_000 }, stop + 90_000)).toBeCloseTo(0.4, 10)
  })

  it('is 0 for a zero-length window, not NaN', () => {
    const instants: DrawInstants = { spinStartAt: null, stopAt: new Date(stop), vetoEndsAt: new Date(stop) }
    expect(windowFraction(instants, stop)).toBe(0)
    expect(windowFraction(instants, stop - 1)).toBe(0)
  })

  it('takes Dates and ISO strings', () => {
    const draw = { stopAt: new Date(stop).toISOString(), vetoEndsAt: new Date(stop + 60_000) }
    expect(windowFraction(draw, new Date(stop + 30_000))).toBe(0.5)
  })
})

describe('the Clip window', () => {
  const S = C + 7500

  it('starts at the stop and ends the clip length later', () => {
    expect(clipWindow({ stopAt: S }, { clipLength: 30 })).toEqual({ startAt: S, endsAt: S + 30_000 })
  })

  it('takes the stop as a Date or an ISO string too', () => {
    expect(clipWindow({ stopAt: new Date(S) }, { clipLength: 5 })).toEqual({ startAt: S, endsAt: S + 5_000 })
    expect(clipWindow({ stopAt: new Date(S).toISOString() }, { clipLength: 60 })).toEqual({ startAt: S, endsAt: S + 60_000 })
  })

  it('runs from the start (inclusive) to the end (exclusive)', () => {
    const clip = clipWindow({ stopAt: S }, { clipLength: 30 })
    const E = S + 30_000
    expect([S - 1, S, E - 1, E].map(now => clipRunning(clip, now))).toEqual([false, true, true, false])
  })

  it('has ended from its end on, end inclusive', () => {
    const clip = clipWindow({ stopAt: S }, { clipLength: 30 })
    const E = S + 30_000
    expect([S - 1, S, E - 1, E].map(now => clipEnded(clip, now))).toEqual([false, false, false, true])
  })
})

// #506: a skip of the Clip ends the window 30 s after it when that is sooner; it never moves the end later.
describe('vetoEndAfterSkip (#506)', () => {
  const windowOf = (clipLength: number | null) => drawInstants({ kind: 'set', commitAt: C, windowOpens: true, clipLength })
  const after = (clipLength: number | null, skipAt: number) => {
    const moved = vetoEndAfterSkip(windowOf(clipLength), skipAt)
    return moved === null ? null : ms(moved)
  }

  it('the cap is 30 s after the skip', () => {
    expect(ms(vetoEndCap(C))).toBe(C + 30_000)
    expect(ms(vetoEndCap(new Date(C + 5)))).toBe(C + 30_005)
  })

  it('a skip early in a 150 s window ends it 30 s later', () => {
    expect(after(120, C + 10_000)).toBe(C + 40_000)
    expect(after(120, C)).toBe(C + 30_000)
  })

  it('moves the end while more than 30 s are left, and not from exactly 30 s on', () => {
    expect(after(120, C + 119_999)).toBe(C + 149_999)
    expect(after(120, C + 120_000)).toBeNull()
    expect(after(120, C + 120_001)).toBeNull()
    expect(after(120, C + 130_000)).toBeNull()
  })

  it('changes nothing at the end of the window or after it', () => {
    for (const skipAt of [C + 149_999, C + 150_000, C + 200_000]) expect(after(120, skipAt)).toBeNull()
  })

  it('works for the other clip lengths', () => {
    expect(after(30, C + 10_000)).toBe(C + 40_000)
    expect(after(10, C + 9_999)).toBe(C + 39_999)
  })

  it('never shortens the 30 s window of a game without a video', () => {
    for (const skipAt of [C, C + 1, C + 29_999]) expect(after(null, skipAt)).toBeNull()
  })

  it('has nothing to move for a draw without a window', () => {
    expect(vetoEndAfterSkip({ vetoEndsAt: null }, C)).toBeNull()
  })

  it('works for a spin, from its stop', () => {
    const spin = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true, clipLength: 120 })
    const stop = ms(spin.stopAt)
    expect(stop).toBe(C + 7500)
    expect(ms(vetoEndAfterSkip(spin, stop + 10_000))).toBe(stop + 40_000)
  })

  it('takes the skip and the end as a number, a Date or an ISO string', () => {
    const end = C + 150_000
    for (const vetoEndsAt of [end, new Date(end), new Date(end).toISOString()]) {
      for (const skipAt of [C + 10_000, new Date(C + 10_000), new Date(C + 10_000).toISOString()]) {
        expect(ms(vetoEndAfterSkip({ vetoEndsAt }, skipAt))).toBe(C + 40_000)
      }
    }
  })

  it.each(CASES)('never moves the end later, in a $kind draw with a clip of $clipLength s', ({ kind, clipLength }) => {
    const draw = drawInstants({ kind, commitAt: C, windowOpens: true, clipLength })
    const stop = ms(draw.stopAt)
    const end = ms(draw.vetoEndsAt)
    const skips = [stop, stop + 1, end - 30_001, end - 30_000, end - 29_999, end - 1, end, end + 1]
    for (let s = stop; s <= end + 60_000; s += 1000) skips.push(s)
    for (const skipAt of skips) {
      const moved = vetoEndAfterSkip(draw, skipAt)
      if (moved === null) continue
      expect(ms(moved), `skip at stop + ${skipAt - stop}`).toBe(skipAt + 30_000)
      expect(ms(moved)).toBeGreaterThanOrEqual(stop)
      expect(ms(moved)).toBeLessThan(end)
    }
  })
})
