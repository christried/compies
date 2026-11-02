import { describe, expect, it } from 'vitest'
import { COUNTDOWN_MAX_S, COUNTDOWN_MIN_S, countdownRejection, countdownSeconds, countdownState, remainingMsAt, type CountdownFacts } from '../../shared/countdown'

// The Countdown's rules (#236, spec #218 § Countdown): the state it is in at a time, how much time is left, and why a Host's
// change is refused. Instants are epoch ms here; the database and the Event read give Dates and ISO strings, which the same rules take.

const DURATION = 60_000
const STARTED = 1_000_000
const READY: CountdownFacts = { durationMs: DURATION, remainingMs: DURATION, startedAt: null }
const PAUSED: CountdownFacts = { durationMs: DURATION, remainingMs: 25_000, startedAt: null }
/** Started at STARTED with the full minute left: it ends at STARTED + 60 s. */
const RUNNING: CountdownFacts = { durationMs: DURATION, remainingMs: DURATION, startedAt: STARTED }
/** Started at STARTED with 25 s left: it ends at STARTED + 25 s. */
const RESUMED: CountdownFacts = { durationMs: DURATION, remainingMs: 25_000, startedAt: STARTED }
const AT_ZERO: CountdownFacts = { durationMs: DURATION, remainingMs: 0, startedAt: null }

describe('the limits (spec #218 § Countdown: 5 s to 99:59)', () => {
  it('are 5 seconds and 5999 seconds', () => {
    expect(COUNTDOWN_MIN_S).toBe(5)
    expect(COUNTDOWN_MAX_S).toBe(5999)
  })
})

describe('countdownState', () => {
  it('is ready when it is not running and stands at its full duration', () => {
    expect(countdownState(READY, STARTED)).toBe('ready')
  })

  it('is paused when it is not running and some time is left, but not all', () => {
    expect(countdownState(PAUSED, STARTED)).toBe('paused')
  })

  it('is running from the start until the instant it ends', () => {
    expect(countdownState(RUNNING, STARTED)).toBe('running')
    expect(countdownState(RUNNING, STARTED + DURATION - 1)).toBe('running')
  })

  it('is running after a resume, with the time left it was paused with', () => {
    expect(countdownState(RESUMED, STARTED + 10_000)).toBe('running')
  })

  it('is ended from the instant it ends on, and stays ended', () => {
    expect(countdownState(RUNNING, STARTED + DURATION)).toBe('ended')
    expect(countdownState(RUNNING, STARTED + DURATION + 5_000)).toBe('ended')
  })

  it('is ended at zero, whether it was started or not', () => {
    expect(countdownState(AT_ZERO, STARTED)).toBe('ended')
    expect(countdownState({ ...RESUMED, remainingMs: 0 }, STARTED)).toBe('ended')
  })

  it('reads the same for a Date and an ISO string as for epoch ms', () => {
    const startedAt = new Date(STARTED).toISOString()
    expect(countdownState({ ...RESUMED, startedAt }, STARTED + 10_000)).toBe('running')
  })
})

describe('remainingMsAt', () => {
  it('is the time left while running: the end instant minus now', () => {
    expect(remainingMsAt(RUNNING, STARTED + 10_000)).toBe(50_000)
    expect(remainingMsAt(RESUMED, STARTED + 10_000)).toBe(15_000)
  })

  it('is the stored remainder while paused, whatever the time', () => {
    expect(remainingMsAt(PAUSED, STARTED)).toBe(25_000)
    expect(remainingMsAt(PAUSED, STARTED + 999_000)).toBe(25_000)
  })

  it('is the full duration while ready', () => {
    expect(remainingMsAt(READY, STARTED)).toBe(DURATION)
  })

  it('is zero from the end instant on, never negative', () => {
    expect(remainingMsAt(RUNNING, STARTED + DURATION)).toBe(0)
    expect(remainingMsAt(RUNNING, STARTED + DURATION + 30_000)).toBe(0)
  })

  it('is zero at zero', () => {
    expect(remainingMsAt(AT_ZERO, STARTED)).toBe(0)
  })
})

describe('countdownRejection', () => {
  const ENDED = RUNNING

  it('refuses start, pause and reset without a Countdown, and lets set create one', () => {
    expect(countdownRejection('start', null, STARTED)).toBe('no_countdown')
    expect(countdownRejection('pause', null, STARTED)).toBe('no_countdown')
    expect(countdownRejection('reset', null, STARTED)).toBe('no_countdown')
    expect(countdownRejection('set', null, STARTED)).toBeNull()
  })

  it('lets start run from ready and from paused, which resumes it', () => {
    expect(countdownRejection('start', READY, STARTED)).toBeNull()
    expect(countdownRejection('start', PAUSED, STARTED)).toBeNull()
  })

  it('refuses start while it runs, and after it ended', () => {
    expect(countdownRejection('start', RUNNING, STARTED + 1)).toBe('countdown_running')
    expect(countdownRejection('start', ENDED, STARTED + DURATION)).toBe('countdown_ended')
    expect(countdownRejection('start', AT_ZERO, STARTED)).toBe('countdown_ended')
  })

  it('lets pause run only while it runs', () => {
    expect(countdownRejection('pause', RUNNING, STARTED + 1)).toBeNull()
    expect(countdownRejection('pause', READY, STARTED)).toBe('countdown_not_running')
    expect(countdownRejection('pause', PAUSED, STARTED)).toBe('countdown_not_running')
    expect(countdownRejection('pause', ENDED, STARTED + DURATION)).toBe('countdown_not_running')
  })

  it('refuses set while it runs, and allows it otherwise', () => {
    expect(countdownRejection('set', RUNNING, STARTED + 1)).toBe('countdown_running')
    expect(countdownRejection('set', READY, STARTED)).toBeNull()
    expect(countdownRejection('set', PAUSED, STARTED)).toBeNull()
    expect(countdownRejection('set', ENDED, STARTED + DURATION)).toBeNull()
  })

  it('always allows reset once a Countdown exists', () => {
    expect(countdownRejection('reset', READY, STARTED)).toBeNull()
    expect(countdownRejection('reset', PAUSED, STARTED)).toBeNull()
    expect(countdownRejection('reset', RUNNING, STARTED + 1)).toBeNull()
    expect(countdownRejection('reset', ENDED, STARTED + DURATION)).toBeNull()
  })
})

describe('countdownSeconds (the Host types minutes and seconds, #236)', () => {
  it('is the length in seconds from minutes 0 to 99 and seconds 0 to 59', () => {
    expect(countdownSeconds('0', '5')).toBe(5)
    expect(countdownSeconds('1', '0')).toBe(60)
    expect(countdownSeconds('99', '59')).toBe(COUNTDOWN_MAX_S)
  })

  it('is null for a length below 5 seconds or above 99:59', () => {
    expect(countdownSeconds('0', '4')).toBeNull()
    expect(countdownSeconds('0', '0')).toBeNull()
    expect(countdownSeconds('100', '0')).toBeNull()
  })

  it('is null for seconds of 60 or more, and for anything but whole numbers', () => {
    expect(countdownSeconds('1', '60')).toBeNull()
    expect(countdownSeconds('', '30')).toBeNull()
    expect(countdownSeconds('1', 'x')).toBeNull()
    expect(countdownSeconds('1.5', '0')).toBeNull()
  })
})
