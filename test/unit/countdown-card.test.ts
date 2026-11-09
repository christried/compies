import { describe, expect, it } from 'vitest'
import { announce, countdownFrame, durationWords, heardAt, lastSecondAt, PIP_COUNT } from '../../app/utils/countdown-card'
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

        expect(frame).toMatchObject({ view: 'running', s, final: true, text: String(s), pips: s, tone: s >= 6 ? 'warn' : 'err', digitFg: 'on', warning: s >= 6 })
        expect(frame.scale).toBeCloseTo(1 + (10 - s) * 0.035, 6)
      })
    }
  }

  it('grows from exactly 1 at 10 to 1.315 at 1', () => {
    expect(running(10_000).scale).toBe(1)
    expect(running(1_000).scale).toBeCloseTo(1.315, 6)
  })

  it('shows the time as m:ss and the bar at 11 seconds, with the run tone', () => {
    expect(running(11_000)).toMatchObject({ view: 'running', s: 11, final: false, text: '0:11', pips: null, tone: 'run', scale: 1, warning: false })
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

      expect(frame).toMatchObject({ view: 'paused', s, final: true, text: String(s), pips: s, tone: 'calm', digitFg: s >= 6 ? 'warning-fg' : 'error-fg', warning: s >= 6 })
      expect(frame.scale).toBeCloseTo(1 + (10 - s) * 0.035, 6)
    })
  }

  it('at 2:10 shows m:ss and the bar', () => {
    expect(countdownFrame(pausedWith(130_000), T0)).toMatchObject({ view: 'paused', text: '2:10', tone: 'calm', digitFg: 'ink', pips: null, scale: 1, warning: false })
  })

  it('does not move with the clock', () => {
    expect(countdownFrame(pausedWith(130_000), T0 + 60_000)).toEqual(countdownFrame(pausedWith(130_000), T0))
  })
})

describe('ready', () => {
  it('shows the full duration, calm, with the full bar', () => {
    expect(countdownFrame(READY, T0)).toMatchObject({ view: 'ready', s: 300, final: false, text: '5:00', tone: 'calm', digitFg: 'ink', pips: null, fill: 1, scale: 1, warning: false })
  })

  it('is never final, not even for the shortest duration', () => {
    expect(countdownFrame({ durationMs: 5000, remainingMs: 5000, startedAt: null }, T0)).toMatchObject({ view: 'ready', s: 5, final: false, text: '0:05', pips: null })
  })
})

describe('done', () => {
  const stored = countdownFrame({ durationMs: DURATION, remainingMs: 0, startedAt: null }, T0)
  const past = running(0)

  it('shows 0:00 on the error tone with no pip lit', () => {
    expect(stored).toMatchObject({ view: 'done', s: 0, final: false, text: '0:00', tone: 'err', digitFg: 'on', pips: 0, scale: 1, fill: 0, warning: false })
  })

  it('is the same frame for a stored zero and for a running one past its end', () => {
    expect(past).toEqual(stored)
    expect(countdownFrame({ durationMs: DURATION, remainingMs: DURATION, startedAt: T0 }, T0 + DURATION + 5000)).toEqual(stored)
  })
})

describe('the edges', () => {
  it('1000 ms left and 1 ms left are both the 1 row', () => {
    expect(running(1000)).toMatchObject({ view: 'running', s: 1, text: '1', pips: 1, tone: 'err' })
    expect(running(1)).toMatchObject({ view: 'running', s: 1, text: '1', pips: 1, tone: 'err', warning: false })
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

describe('the pip row', () => {
  it('is ten pips wide', () => {
    expect(PIP_COUNT).toBe(10)
  })
})

describe('what the status region says', () => {
  /** What the region heard of a running Countdown with `leftMs` left (of 300 s). */
  const heardRunning = (leftMs: number) => {
    const { facts, at } = runningWith(leftMs)
    return heardAt(facts, at)
  }
  const heardReady = () => heardAt(READY, T0)
  const heardPaused = (leftMs: number) => heardAt(pausedWith(leftMs), T0)
  const heardDone = () => heardAt({ durationMs: DURATION, remainingMs: 0, startedAt: null }, T0)

  describe('at the first sample', () => {
    it('says the set of a ready card when the stage announces it', () => {
      expect(announce(null, heardReady(), true)).toBe('set')
    })

    it('says nothing for a ready card that was there when the page opened', () => {
      expect(announce(null, heardReady(), false)).toBeNull()
    })

    it.each([
      ['running', () => heardRunning(100_000)],
      ['paused', () => heardPaused(100_000)],
      ['done', heardDone],
    ])('says nothing for a %s card, even when the stage announces', (_view, heard) => {
      expect(announce(null, heard(), true)).toBeNull()
    })
  })

  describe('on a change of the view', () => {
    it.each([
      ['ready to running', heardReady, () => heardRunning(100_000), 'running'],
      ['running to paused', () => heardRunning(100_000), () => heardPaused(100_000), 'paused'],
      ['paused to running', () => heardPaused(100_000), () => heardRunning(100_000), 'running'],
      ['running to done', () => heardRunning(100), heardDone, 'done'],
      ['running to ready', () => heardRunning(100_000), heardReady, 'reset'],
      ['done to ready', heardDone, heardReady, 'reset'],
      ['paused to ready', () => heardPaused(100_000), heardReady, 'reset'],
    ] as const)('%s says %s', (_change, before, now, message) => {
      expect(announce(before(), now(), false)).toBe(message)
    })

    it('says only the start when a ready card of 8 s starts inside the last ten', () => {
      const short: CountdownFacts = { durationMs: 8000, remainingMs: 8000, startedAt: null }
      const started: CountdownFacts = { durationMs: 8000, remainingMs: 8000, startedAt: T0 }

      expect(announce(heardAt(short, T0), heardAt(started, T0), false)).toBe('running')
    })
  })

  describe('inside one view', () => {
    it('says the last ten when a running card gets from 10.5 s to 9.5 s left (the 11 row to the 10 row)', () => {
      expect(announce(heardRunning(10_500), heardRunning(9_500), false)).toBe('final')
    })

    it('says nothing from 9.5 s to 8.5 s left, already inside the last ten', () => {
      expect(announce(heardRunning(9_500), heardRunning(8_500), false)).toBeNull()
    })

    it('says nothing from 224 s to 223 s left', () => {
      expect(announce(heardRunning(224_000), heardRunning(223_000), false)).toBeNull()
    })

    it('says nothing when a paused card is already in the last ten', () => {
      expect(announce(heardPaused(130_000), heardPaused(7_000), false)).toBeNull()
    })

    it('says the set when a ready card gets another length', () => {
      const longer: CountdownFacts = { durationMs: 600_000, remainingMs: 600_000, startedAt: null }

      expect(announce(heardReady(), heardAt(longer, T0), false)).toBe('set')
    })

    it('says nothing when a running or paused card gets another length', () => {
      const running = (durationMs: number) => heardAt({ durationMs, remainingMs: durationMs, startedAt: T0 }, T0 + 1000)
      const paused = (durationMs: number) => heardAt({ durationMs, remainingMs: 100_000, startedAt: null }, T0)

      expect(announce(running(300_000), running(600_000), false)).toBeNull()
      expect(announce(paused(300_000), paused(600_000), false)).toBeNull()
    })

    it('says nothing for the same input twice: it is asked on every frame', () => {
      const seen = heardRunning(9_500)

      expect(announce(seen, seen, true)).toBeNull()
      expect(announce(heardReady(), heardReady(), true)).toBeNull()
    })

    it('says nothing from done to done', () => {
      expect(announce(heardDone(), heardDone(), false)).toBeNull()
    })
  })
})

describe('the last second', () => {
  it.each([
    [1000, true],
    [1, true],
    [0, false],
    [1001, false],
  ])('a running Countdown with %i ms left: %s', (leftMs, seen) => {
    const { facts, at } = runningWith(leftMs)

    expect(lastSecondAt(facts, at)).toBe(seen)
  })

  it('a paused one with 500 ms left is not the last second the viewer saw', () => {
    expect(lastSecondAt(pausedWith(500), T0)).toBe(false)
  })

  it('a ready one is not', () => {
    expect(lastSecondAt(READY, T0)).toBe(false)
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
