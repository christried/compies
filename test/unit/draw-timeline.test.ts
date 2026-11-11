import { describe, expect, it } from 'vitest'
import { clipEnded, clipRunning, clipWindow, drawGameKnown, drawInstants, isDue, settleAt, spinCommitAt, stopReached, vetoesSealed, windowEnded, windowFraction, windowOpen, type DrawInstants } from '../../shared/draw-timeline'

// The Draw's timeline (#414, ADR 0013 amendment 2026-10-31): a Draw's instants and what each decides at `now`. Every comparison
// keeps its edge, pinned here at the four boundary milliseconds (stop - 1, stop, end - 1, end); nothing may move them silently.
// The SQL twins (stoppedDraws, dueDraws) are held to the same table by test/integration/draw-timeline.test.ts.

const C = Date.parse('2090-10-30T10:00:00.000Z')
const ms = (date: Date | null) => date!.getTime()

describe('drawInstants', () => {
  it('a spin with a window: starts a lead after the commit, stops 6 s later, the window ends 60 s after the stop', () => {
    const instants = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true })
    expect(ms(instants.spinStartAt)).toBe(C + 1500)
    expect(ms(instants.stopAt)).toBe(C + 7500)
    expect(ms(instants.vetoEndsAt)).toBe(C + 67_500)
  })

  it('a spin without a window has no end', () => {
    const instants = drawInstants({ kind: 'spin', commitAt: C, windowOpens: false })
    expect(ms(instants.spinStartAt)).toBe(C + 1500)
    expect(ms(instants.stopAt)).toBe(C + 7500)
    expect(instants.vetoEndsAt).toBeNull()
  })

  it('a set draw with a window stops at the commit and has no spin start', () => {
    const instants = drawInstants({ kind: 'set', commitAt: C, windowOpens: true })
    expect(instants.spinStartAt).toBeNull()
    expect(ms(instants.stopAt)).toBe(C)
    expect(ms(instants.vetoEndsAt)).toBe(C + 60_000)
  })

  it('a set draw without a window has no end', () => {
    const instants = drawInstants({ kind: 'set', commitAt: C, windowOpens: false })
    expect(instants.spinStartAt).toBeNull()
    expect(ms(instants.stopAt)).toBe(C)
    expect(instants.vetoEndsAt).toBeNull()
  })

  it('takes the commit as a number, a Date or an ISO string', () => {
    const expected = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true })
    expect(drawInstants({ kind: 'spin', commitAt: new Date(C), windowOpens: true })).toEqual(expected)
    expect(drawInstants({ kind: 'spin', commitAt: new Date(C).toISOString(), windowOpens: true })).toEqual(expected)
  })
})

const KINDS = ['spin', 'set'] as const

describe.each(KINDS)('a %s draw with a Veto window', (kind) => {
  const draw = drawInstants({ kind, commitAt: C, windowOpens: true })
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
    expect(at(now => windowFraction(row, now))).toEqual([1, 1, 1 / 60_000, 0])
  })
})

describe.each(KINDS)('a %s draw without a Veto window', (kind) => {
  const draw = drawInstants({ kind, commitAt: C, windowOpens: false })
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
    const instants = drawInstants({ kind: 'spin', commitAt: C, windowOpens: true })
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
