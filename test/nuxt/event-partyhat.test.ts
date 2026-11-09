import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import type { ResultView, StandingView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { SANNE, serve, stubScreen, viewWithSessions, type EventOverrides } from './event-page'
import { afterResult, ENDED, FIRST, members, mount, played, type Seat, SESSION, serveState, STARTED, team, unmountPage } from './event-page-states'
import { motion } from './motion'

// The party hat on the Event page's header per viewer (#38, 04-motion § Compibert): a Player seated in a Leading Party wears it, the rest of the
// Event does not; it follows the read, so a Result or a Correction moves it, and it pops only when it appears on the open page.
// The viewer is Kitty unless a test says otherwise; Larsi and Sanne (the Host) are the other Members.

interface Call { el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions }
let calls: Call[]
const realAnimate = Element.prototype.animate
const POP = 'cubic-bezier(.34,1.56,.64,1)'

const RUNNING = SESSION(1, FIRST, { startedAt: STARTED })
const hat = (page: { get: (selector: string) => { find: (selector: string) => { exists: () => boolean } } }) => page.get('header .compibert').find('.compibert-hat').exists()
/** The hat's art group calls, the only Web Animations this file counts (the rest of the page animates too). */
const hatCalls = () => calls.filter(call => call.el.classList.contains('compibert-hat-art'))

/** A running Event with the Standings and Result of `overrides`, Kitty seated as `seat` (default: on the Bench). */
function runningWith(overrides: EventOverrides, seat: Parameters<typeof members>[0] = {}) {
  return serveState({ sessions: [RUNNING], missing: 0, phase: 'running', running: 0, overrides: { ...overrides, members: members(seat) } })
}

beforeEach(() => {
  signInAs(kitty)
  stubScreen(true)
  calls = []
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options })
    return { currentTime: 0 } as Animation
  } as unknown as typeof Element.prototype.animate
  motion('full')
})

afterEach(() => {
  unmountPage()
  Element.prototype.animate = realAnimate
  vi.restoreAllMocks()
})

describe('the party hat in the Event header, per viewer', () => {
  it('is on for a Player seated in the Leading Party after a Result', async () => {
    const { slug } = runningWith(afterResult, { kitty: { zone: 'team', team: 2 } })

    const page = await mount(slug)

    expect(hat(page)).toBe(true)
  })

  it('is off for a Player seated in a trailing Party', async () => {
    const { slug } = runningWith(afterResult, { kitty: { zone: 'team', team: 1 } })

    expect(hat(await mount(slug))).toBe(false)
  })

  it('is off for a Player on the Bench and in the Stands', async () => {
    expect(hat(await mount(runningWith(afterResult, { kitty: { zone: 'bench' } }).slug))).toBe(false)
    expect(hat(await mount(runningWith(afterResult, { kitty: { zone: 'stands' } }).slug))).toBe(false)
  })

  it('is off for everybody before the first Result, a Player in the first rank included', async () => {
    const beforeResult: EventOverrides = {
      results: [],
      standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
      end: { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
    }

    expect(hat(await mount(runningWith(beforeResult, { kitty: { zone: 'team', team: 2 } }).slug))).toBe(false)
  })

  it('is on for a Player in either Party that shares the first rank', async () => {
    const shared: EventOverrides = {
      results: [played],
      standings: [{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 1, points: 1 }],
      end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
    }

    expect(hat(await mount(runningWith(shared, { kitty: { zone: 'team', team: 1 } }).slug))).toBe(true)
    expect(hat(await mount(runningWith(shared, { kitty: { zone: 'team', team: 2 } }).slug))).toBe(true)
  })

  it('is on for the Host seated in the Leading Party, and off for the Host on the Bench', async () => {
    const hostRead = (sanne: Seat) => serve(slug => ({
      ...viewWithSessions(slug, [RUNNING], 0, {
        event: { phase: 'running', isHost: true },
        settings: defaultSettings(),
        teams: [team(1), team(2)],
        members: members({ sanne }),
        runningSessionId: `session-${slug}-0`,
        ...afterResult,
      }),
      viewerId: SANNE,
    }))
    signInAs({ ...kitty, id: SANNE, displayName: 'Sanne', canHost: true })

    expect(hat(await mount(hostRead({ zone: 'team', team: 2 }).slug))).toBe(true)
    expect(hat(await mount(hostRead({ zone: 'bench' }).slug))).toBe(false)
  })

  it('is on for the Winners\' Players on the finished page, and off for a trailing Party', async () => {
    const finished: EventOverrides = {
      ...afterResult,
      rounds: [],
      end: { played: 1, gameCount: 1, complete: true, tie: null, finish: null, lastGame: null },
    }
    const won = serveState({ sessions: [{ ...RUNNING, endedAt: ENDED }], missing: 0, phase: 'finished', overrides: { ...finished, members: members({ kitty: { zone: 'team', team: 2 } }) } })
    const lost = serveState({ sessions: [{ ...RUNNING, endedAt: ENDED }], missing: 0, phase: 'finished', overrides: { ...finished, members: members({ kitty: { zone: 'team', team: 1 } }) } })

    expect(hat(await mount(won.slug))).toBe(true)
    expect(hat(await mount(lost.slug))).toBe(false)
  })

  it('follows a Correction that moves the first rank: gone at once, and back with a pop on the open page', async () => {
    const served = runningWith(afterResult, { kitty: { zone: 'team', team: 2 } })
    const page = await mount(served.slug)
    expect(hat(page)).toBe(true)
    expect(hatCalls()).toHaveLength(0)

    const corrected: ResultView = { ...played, places: [{ team: 1, place: 1, points: 1, score: null }, { team: 2, place: 2, points: 0, score: null }], corrected: true, correctedAt: ENDED }
    const correction: EventOverrides = {
      results: [corrected],
      standings: [{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 2, points: 0 }] as StandingView[],
      end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
    }
    served.set(viewWithSessions(served.slug, [RUNNING], 0, {
      event: { phase: 'running', isHost: false },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members({ kitty: { zone: 'team', team: 2 } }),
      runningSessionId: `session-${served.slug}-0`,
      ...afterResult,
      ...correction,
    }))
    await refreshEvent(served.slug)
    await flushPromises()
    expect(hat(page)).toBe(false)
    expect(hatCalls()).toHaveLength(0)

    served.set(viewWithSessions(served.slug, [RUNNING], 0, {
      event: { phase: 'running', isHost: false },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members({ kitty: { zone: 'team', team: 2 } }),
      runningSessionId: `session-${served.slug}-0`,
      ...afterResult,
    }))
    await refreshEvent(served.slug)
    await flushPromises()

    expect(hat(page)).toBe(true)
    expect(hatCalls()).toHaveLength(1)
    expect(hatCalls()[0]!.keyframes).toEqual([{ transform: 'scale(0) rotate(-12deg)' }, { transform: 'scale(1) rotate(0deg)' }])
    expect(hatCalls()[0]!.options).toMatchObject({ duration: 220, easing: POP })
  })

  it('appears without an animation under reduced motion, on the same flip', async () => {
    motion('reduced')
    const served = runningWith(afterResult, { kitty: { zone: 'bench' } })
    const page = await mount(served.slug)
    expect(hat(page)).toBe(false)

    served.set(viewWithSessions(served.slug, [RUNNING], 0, {
      event: { phase: 'running', isHost: false },
      settings: defaultSettings(),
      teams: [team(1), team(2)],
      members: members({ kitty: { zone: 'team', team: 2 } }),
      runningSessionId: `session-${served.slug}-0`,
      ...afterResult,
    }))
    await refreshEvent(served.slug)
    await flushPromises()

    expect(hat(page)).toBe(true)
    expect(hatCalls()).toHaveLength(0)
  })
})
