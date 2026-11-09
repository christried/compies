import { describe, expect, it } from 'vitest'
import { countdownFrame, durationWords } from '../../app/utils/countdown-card'
import de from '../../i18n/locales/de.json'
import type { CountdownFacts } from '../../shared/countdown'

// What the Countdown card shows at a time (#340, 13-countdown § CountdownCard): every visual is a function of the facts and the
// ticker's value, never of when the viewer arrived, so a viewer who mounts at 7.4 s left gets the 7 row at once.

const T0 = 1_000_000
const DURATION = 300_000
const READY: CountdownFacts = { durationMs: DURATION, remainingMs: DURATION, startedAt: null }
/** A Countdown that runs and has `leftMs` left at the returned instant. */
const runningWith = (leftMs: number) => ({ facts: { durationMs: DURATION, remainingMs: DURATION, startedAt: T0 } as CountdownFacts, at: T0 + DURATION - leftMs })
const pausedWith = (leftMs: number): CountdownFacts => ({ durationMs: DURATION, remainingMs: leftMs, startedAt: null })

function running(leftMs: number) {
  const { facts, at } = runningWith(leftMs)
  return countdownFrame(facts, at)
}

describe('the last ten seconds while it runs', () => {
  for (let s = 10; s >= 1; s--) {
    for (const left of [s * 1000 - 500, s * 1000]) {
      it(`${left} ms left is the ${s} row: bare seconds, scale, ${s} pips and the ${s >= 6 ? 'warning' : 'error'} tone`, () => {
        const frame = running(left)

        expect(frame).toMatchObject({ view: 'running', s, final: true, text: String(s), pips: s, tone: s >= 6 ? 'warn' : 'err', digitFg: 'on' })
        expect(frame.scale).toBeCloseTo(1 + (10 - s) * 0.035, 6)
      })
    }
  }

  it('grows from exactly 1 at 10 to 1.315 at 1', () => {
    expect(running(10_000).scale).toBe(1)
    expect(running(1_000).scale).toBeCloseTo(1.315, 6)
  })

  it('shows the time as m:ss and the bar at 11 seconds, with the run tone', () => {
    expect(running(11_000)).toMatchObject({ view: 'running', s: 11, final: false, text: '0:11', pips: null, tone: 'run', scale: 1 })
    expect(running(10_001)).toMatchObject({ s: 11, text: '0:11', pips: null })
  })

  it('shows m:ss with unpadded minutes above that, and the bar as the share left', () => {
    const frame = running(224_600)

    expect(frame).toMatchObject({ s: 225, text: '3:45', tone: 'run', pips: null })
    expect(frame.fill).toBeCloseTo(0.7487, 3)
  })
})

describe('paused', () => {
  for (const s of [7, 3]) {
    it(`inside the last ten at ${s} s keeps the pips and the scale of that second, on paper with a readable digit colour`, () => {
      const frame = countdownFrame(pausedWith(s * 1000 - 400), T0)

      expect(frame).toMatchObject({ view: 'paused', s, final: true, text: String(s), pips: s, tone: 'calm', digitFg: s >= 6 ? 'warning-fg' : 'error-fg' })
      expect(frame.scale).toBeCloseTo(1 + (10 - s) * 0.035, 6)
    })
  }

  it('at 2:10 shows m:ss and the bar', () => {
    expect(countdownFrame(pausedWith(130_000), T0)).toMatchObject({ view: 'paused', text: '2:10', tone: 'calm', digitFg: 'ink', pips: null, scale: 1 })
  })

  it('does not move with the clock', () => {
    expect(countdownFrame(pausedWith(130_000), T0 + 60_000)).toEqual(countdownFrame(pausedWith(130_000), T0))
  })
})

describe('ready', () => {
  it('shows the full duration, calm, with the full bar', () => {
    expect(countdownFrame(READY, T0)).toMatchObject({ view: 'ready', s: 300, final: false, text: '5:00', tone: 'calm', digitFg: 'ink', pips: null, fill: 1, scale: 1 })
  })

  it('is never final, not even for the shortest duration', () => {
    expect(countdownFrame({ durationMs: 5000, remainingMs: 5000, startedAt: null }, T0)).toMatchObject({ view: 'ready', s: 5, final: false, text: '0:05', pips: null })
  })
})

describe('done', () => {
  const stored = countdownFrame({ durationMs: DURATION, remainingMs: 0, startedAt: null }, T0)
  const past = running(0)

  it('shows 0:00 on the error tone with no pip lit', () => {
    expect(stored).toMatchObject({ view: 'done', s: 0, final: false, text: '0:00', tone: 'err', digitFg: 'on', pips: 0, scale: 1, fill: 0 })
  })

  it('is the same frame for a stored zero and for a running one past its end', () => {
    expect(past).toEqual(stored)
    expect(countdownFrame({ durationMs: DURATION, remainingMs: DURATION, startedAt: T0 }, T0 + DURATION + 5000)).toEqual(stored)
  })
})

describe('the edges', () => {
  it('1000 ms left and 1 ms left are both the 1 row', () => {
    expect(running(1000)).toMatchObject({ view: 'running', s: 1, text: '1', pips: 1, tone: 'err' })
    expect(running(1)).toMatchObject({ view: 'running', s: 1, text: '1', pips: 1, tone: 'err' })
  })

  it('0 ms left is done', () => {
    expect(running(0).view).toBe('done')
  })

  it('the shortest duration, 5 s, runs final from its first frame', () => {
    const facts: CountdownFacts = { durationMs: 5000, remainingMs: 5000, startedAt: T0 }

    expect(countdownFrame(facts, T0)).toMatchObject({ view: 'running', s: 5, final: true, text: '5', pips: 5, tone: 'err', fill: 1 })
  })

  it('the longest duration, 5999 s, reads 99:59', () => {
    expect(countdownFrame({ durationMs: 5_999_000, remainingMs: 5_999_000, startedAt: null }, T0).text).toBe('99:59')
  })
})

describe('the duration in words, for the screen reader', () => {
  /** The two plural keys as vue-i18n reads them: the first choice for 1, the second for any other count. */
  const t = (key: 'countdown.nMinutes' | 'countdown.nSeconds', n: number) => {
    const choices = de.countdown[key === 'countdown.nMinutes' ? 'nMinutes' : 'nSeconds'].split(' | ')
    return choices[n === 1 ? 0 : 1]!.replace('{n}', String(n))
  }

  it.each([
    [225, '3 Minuten 45 Sekunden'],
    [60, '1 Minute'],
    [1, '1 Sekunde'],
    [7, '7 Sekunden'],
    [120, '2 Minuten'],
    [0, '0 Sekunden'],
  ])('%i s reads %s', (seconds, words) => {
    expect(durationWords(seconds, t)).toBe(words)
  })
})
