import { flushPromises } from '@vue/test-utils'
import { effectScope, nextTick, ref, shallowRef, TransitionGroup } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import { useStageOrder } from '~/composables/useStageOrder'
import { RISE_DELAY_MS, stageBlocks, type StageInput } from '~/utils/event-stage'
import { REFLOW_CLASS, riseSettleMs } from '~/utils/motion'
import { defaultSettings } from '~~/shared/settings'
import type { CountdownView, ResultView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { regionHeadings, stubScreen, viewWithSessions, type EventOverrides } from './event-page'
import { afterResult, FIRST, members, mount, SESSION, serveState, STARTED, team, unmountPage } from './event-page-states'

// The stage follows the game (#441): the block where something just happened takes the top of the stage half a second after its moment, with the page's glide,
// or at once when the news is older; under reduced motion it fades in, and a hidden tab takes the order at once. The order itself is the Stage module's table
// (event-stage.test.ts); here the page's clock for it (useStageOrder) and what the page does with it. The Event read carries the instants, so no room message
// and nothing on the server is involved: the tests set the system time and read the Event again.

const T = Date.parse('2090-11-10T20:00:00.000Z')
const iso = (epoch: number) => new Date(epoch).toISOString()
const RUNNING_ONE = SESSION(1, FIRST, { startedAt: STARTED })

const countdownAt = (startedAt: number | null, lastStartedAt: number | null = startedAt): CountdownView => ({
  durationMs: 600_000, remainingMs: 600_000, startedAt: startedAt === null ? null : iso(startedAt), lastStartedAt: lastStartedAt === null ? null : iso(lastStartedAt),
})
/** A Result entered at `at`, the second one of the Event. */
const resultAt = (at: number): ResultView => ({ ...afterResult.results![0]!, roundId: 'r9', number: 2, resultAt: iso(at) })

/** The Event read of a running Event with the open Round and the first Result of `afterResult` (both settled long ago), and what the test adds. */
const readOf = (slug: string, overrides: EventOverrides = {}) => viewWithSessions(slug, [RUNNING_ONE], 0, {
  event: { phase: 'running', isHost: false },
  settings: defaultSettings(),
  teams: [team(1), team(2)],
  members: members(),
  runningSessionId: `session-${slug}-0`,
  ...afterResult,
  ...overrides,
})

const TODAY = ['Gerade dran', 'Tabelle', 'Spielbrett', 'Sessions', 'So wird gespielt']
const LIFTED = ['Countdown', 'Gerade dran', 'Tabelle', 'Spielbrett', 'Sessions', 'So wird gespielt']
const WAITING = ['Gerade dran', 'Tabelle', 'Countdown', 'Spielbrett', 'Sessions', 'So wird gespielt']

/** The page's motion setting, as the tokens put it in `--cp-motion`. */
function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
}

describe('the order of the stage on the Event page', () => {
  /** The blocks that were animated with the Web Animations API, by the block they sit in. */
  let animated: { block: string | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions }[]
  /** What was animated inside the stage: other parts of the page animate too (the footer's „Neu“ chip). */
  const inStage = () => animated.filter(entry => entry.block !== undefined)
  let scrolls: ReturnType<typeof vi.fn>[]

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
    animated = []
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        animated.push({ block: this.closest<HTMLElement>('[data-block]')?.dataset.block, keyframes, options })
        return { cancel() {}, finish() {}, currentTime: 0 }
      },
    })
    // The page never scrolls by itself (#441): any call of a scroll API fails the test below.
    scrolls = [
      vi.spyOn(window, 'scrollBy').mockImplementation(() => {}),
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {}),
    ]
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() })
    scrolls.push(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>)
  })

  afterEach(() => {
    unmountPage()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(Element.prototype, 'animate')
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  /** The page, mounted on the read as it is, and then the clock: the page needs real timers to load, the half second needs fake ones. */
  async function open(overrides: EventOverrides = {}, { now = T }: { now?: number } = {}) {
    const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: { ...afterResult, ...overrides } })
    const page = await mount(served.slug)
    await flushPromises()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date(now))
    /** The next read of the Event, as the room's `event.changed` makes the page take it. */
    const read = async (overrides: EventOverrides = {}) => {
      served.set(readOf(served.slug, overrides))
      await refreshEvent(served.slug)
      await flushPromises()
    }
    const group = () => page.findComponent(TransitionGroup)
    return { page, read, group, headings: () => regionHeadings(page) }
  }

  it('lifts a block half a second after its moment, with the page\'s glide', async () => {
    const { read, headings, group } = await open()
    expect(headings()).toEqual(TODAY)

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })

    // News 100 ms after the moment: the Countdown arrives where it sits, and waits for the rest of the half second.
    expect(headings()).toEqual(WAITING)
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100 - 1)
    expect(headings()).toEqual(WAITING)

    await vi.advanceTimersByTimeAsync(1)
    expect(headings()).toEqual(LIFTED)
    expect(group().props('moveClass')).toBe(REFLOW_CLASS)
    expect(inStage()).toEqual([])
  })

  it('lifts a block at once when the news is older than half a second', async () => {
    const { read, headings } = await open()

    vi.setSystemTime(new Date(T + 2000))
    await read({ countdown: countdownAt(T) })

    expect(headings()).toEqual(LIFTED)
  })

  it('lifts a Result above the open Rounds, and a newer Countdown above that, newest first', async () => {
    const { read, headings } = await open()

    vi.setSystemTime(new Date(T + 2000))
    await read({ results: [afterResult.results![0]!, resultAt(T)], standings: afterResult.standings, end: { played: 2, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } })
    expect(headings()).toEqual(['Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])

    vi.setSystemTime(new Date(T + 5000))
    await read({ results: [afterResult.results![0]!, resultAt(T)], countdown: countdownAt(T + 4000) })
    expect(headings()).toEqual(['Countdown', 'Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])
  })

  it('calls no scroll API when the stage reorders: the page never scrolls by itself', async () => {
    const { read, headings } = await open()

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)

    expect(headings()[0]).toBe('Countdown')
    for (const scroll of scrolls) expect(scroll).not.toHaveBeenCalled()
  })

  it('fades the rising block in for 0.14 s under reduced motion, and animates nothing else', async () => {
    const { read, headings, group } = await open()
    motion('reduced')

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })
    expect(inStage()).toEqual([])

    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)
    await flushPromises()

    expect(headings()).toEqual(LIFTED)
    expect(inStage()).toHaveLength(1)
    expect(inStage()[0]).toEqual({ block: 'countdown', keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 140, easing: 'ease-out', fill: 'backwards' } })
    // The glide is the class's own: it has nothing under reduced motion (`reduced:transition-none`).
    expect(String(group().props('moveClass')).split(' ')).toContain('reduced:transition-none')
  })

  it('does not fade a block that arrives, or one that only shifts down because another rose', async () => {
    const { read } = await open()
    motion('reduced')

    vi.setSystemTime(new Date(T + 2000))
    await read({ countdown: countdownAt(T) })
    await flushPromises()

    // The Countdown arrives lifted: nobody saw it anywhere else, so it only appears. Gerade dran and Tabelle shift down and keep their order.
    expect(inStage()).toEqual([])
  })

  it('takes the order at once in a hidden tab: no wait, no glide and no animation', async () => {
    const { read, headings, group } = await open()
    motion('reduced')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })

    expect(headings()).toEqual(LIFTED)
    expect(group().props('moveClass')).toBeUndefined()
    expect(inStage()).toEqual([])
  })

  it('shows the settled order on the first render of a reload, whether the moment is 100 ms or an hour old', async () => {
    for (const age of [100, 3_600_000]) {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(T + age))
      const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: { ...afterResult, countdown: countdownAt(T) } })

      const page = await mount(served.slug)

      expect(regionHeadings(page)).toEqual(LIFTED)
      vi.useRealTimers()
    }
  })

  it('shows the same order on the phone\'s Event tab', async () => {
    stubScreen(false)
    const { read, headings } = await open()
    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)

    expect(headings()).toEqual(LIFTED)
  })

  it('does not lower a block after a reload: the Countdown shown lifted at first paint stays there at the first read and when its half second ends (#442)', async () => {
    // The page opens at T + 100, 100 ms after the moment: the null clock shows the Countdown lifted. The first read counts it 0.4 s later, and used to drop it into its rank place first.
    const { read, headings } = await open({ countdown: countdownAt(T) }, { now: T + 100 })
    expect(headings()).toEqual(LIFTED)

    vi.setSystemTime(new Date(T + 200))
    await read({ countdown: countdownAt(T) })
    expect(headings()).toEqual(LIFTED)

    for (const step of [100, 199, 1, 600]) {
      await vi.advanceTimersByTimeAsync(step)
      expect(headings()).toEqual(LIFTED)
    }
    expect(inStage()).toEqual([])
  })

  it('does not lower the Standings for a second Result: they stay above the open Rounds from the read to the end of the half second (#442)', async () => {
    const { read, headings } = await open()
    vi.setSystemTime(new Date(T + 2000))
    await read({ results: [afterResult.results![0]!, resultAt(T)], standings: afterResult.standings, end: { played: 2, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } })
    expect(headings()).toEqual(['Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])

    // The second Result's moment is T + 2000, its read 200 ms later: its half second is not over, and the block used to fall below „Gerade dran“ and rise again.
    vi.setSystemTime(new Date(T + 2200))
    await read({ results: [afterResult.results![0]!, resultAt(T + 2000)], standings: afterResult.standings, end: { played: 2, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } })
    expect(headings()).toEqual(['Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])

    for (const step of [299, 1, 600]) {
      await vi.advanceTimersByTimeAsync(step)
      expect(headings()).toEqual(['Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])
    }
  })

  it('keeps a lifted Countdown where it is when the Host pauses it, and moves nothing for a Bonus Veto', async () => {
    const { read, headings } = await open({ countdown: countdownAt(T) })
    expect(headings()).toEqual(LIFTED)

    vi.setSystemTime(new Date(T + 3000))
    await read({ countdown: { ...countdownAt(T), startedAt: null, remainingMs: 597_000 } })
    expect(headings()).toEqual(LIFTED)

    await read({ countdown: countdownAt(T), bonusVetoes: { left: [1, 0], granted: [] } } as unknown as EventOverrides)
    expect(headings()).toEqual(LIFTED)
  })
  // The Standings' sequence starts when their block has arrived on top (#442). `open()` starts at T with the first Result entered and the open Round above the Standings; a read adds a Result
  // whose moment is `at`. The stage's table keeps the Standings before the Result until the block has arrived, the panel's tab plays at once. Every number comes from RISE_DELAY_MS and riseSettleMs().
  describe('the Standings wait for their block (#442)', () => {
    /** Spiel 2 is Team 2's again, and the Standings reorder: Team 1 leads. */
    const AFTER_ONE = [{ team: 1, rank: 1, points: 3 }, { team: 2, rank: 2, points: 1 }]
    const AFTER_TWO = [{ team: 1, rank: 1, points: 6 }, { team: 2, rank: 2, points: 1 }]
    const BEFORE_ROWS = { teams: ['2', '1'], points: ['1', '0'] }
    const numbered = (number: number, at: number): ResultView => ({ ...resultAt(at), roundId: `r${number + 7}`, number })
    const endOf = (played: number) => ({ played, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null })
    /** The read of Spiel 2 (and 3): the Results, the Standings and the count. */
    const withResults = (standings: typeof AFTER_ONE, ...results: ResultView[]): EventOverrides => ({ results: [afterResult.results![0]!, ...results], standings, end: endOf(1 + results.length) })

    const stageRows = (page: { element: Element }) => [...page.element.querySelectorAll('[data-block="standings"] tbody tr')]
    const stageTable = (page: { element: Element }) => ({
      teams: stageRows(page).map(row => row.getAttribute('data-team')),
      points: stageRows(page).map(row => row.querySelector('.font-num [aria-hidden="true"]')?.textContent),
    })
    const stagePills = (page: { element: Element }) => page.element.querySelectorAll('[data-block="standings"] [data-delta]').length
    const panelPills = (page: { element: Element }) => page.element.querySelectorAll('aside [data-delta]').length
    const stamp = (page: { element: Element }) => page.element.querySelector('[data-block="standings"] [data-stamp]')?.textContent
    /** The sequence's animations on the stage block: the pills' pop (420 ms) and the stamp (480 ms); under reduced motion their fades (200 ms). */
    const sequence = (reduced = false) => inStage().filter(entry => entry.block === 'standings' && (reduced ? entry.options.duration === 200 : entry.options.duration === 420 || entry.options.duration === 480))
    const live = (page: { element: Element }) => page.element.querySelector('p[role="status"][aria-live="polite"]')?.textContent
    const settle = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms)
      await flushPromises()
    }
    const TABELLE_FIRST = ['Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt']

    it('starts after the block\'s move: the old table until then, the Tabelle tab plays at once, and nothing but the table waits', async () => {
      const { page, read, headings } = await open()

      vi.setSystemTime(new Date(T + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))

      // At the read: the block is still below the open Rounds, its table is the one before the Result, no pill; the panel's tab has its pills and the live region has the news.
      expect(headings()).toEqual(TODAY)
      expect(stageTable(page)).toEqual(BEFORE_ROWS)
      expect(stagePills(page)).toBe(0)
      expect(panelPills(page)).toBe(2)
      expect(live(page)).toContain('Spiel 2 ist eingetragen.')

      await settle(RISE_DELAY_MS - 100 - 1)
      expect(headings()).toEqual(TODAY)
      expect(stageTable(page)).toEqual(BEFORE_ROWS)
      expect(stagePills(page)).toBe(0)

      // T + 500: the block rises and glides, the table is still the old one and nothing of the sequence has started.
      await settle(1)
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stageTable(page)).toEqual(BEFORE_ROWS)
      expect(stagePills(page)).toBe(0)
      expect(sequence()).toEqual([])

      await settle(riseSettleMs() - 1)
      expect(stagePills(page)).toBe(0)
      expect(sequence()).toEqual([])

      await settle(1)
      expect(stagePills(page)).toBe(2)
      expect(stageTable(page).teams).toEqual(['1', '2'])
      expect(stageTable(page).points).toEqual(['0', '1'])
      expect(sequence().filter(entry => entry.options.duration === 420)).toHaveLength(2)
      expect(sequence().filter(entry => entry.options.duration === 420)[0]!.options).toMatchObject({ duration: 420, delay: 300 })
      expect(sequence().filter(entry => entry.options.duration === 480)).toHaveLength(1)
      expect(sequence().filter(entry => entry.options.duration === 480)[0]!.options).toMatchObject({ duration: 480, delay: 520 })
      expect(stamp(page)).toBe('Sieg in Spiel 2!')
    })

    it('starts half a second after the moment when the block is on top already, and the block never leaves it', async () => {
      const { page, read, headings } = await open()
      vi.setSystemTime(new Date(T + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))
      await settle(RISE_DELAY_MS + riseSettleMs())
      expect(stagePills(page)).toBe(2)

      // The second Result, 2 s later: the Standings are on top from the first.
      vi.setSystemTime(new Date(T + 3000))
      await read(withResults(AFTER_TWO, numbered(2, T), numbered(3, T + 2900)))
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stagePills(page)).toBe(0)
      expect(stageTable(page)).toEqual({ teams: ['1', '2'], points: ['3', '1'] })

      await settle(2900 + RISE_DELAY_MS - 3000 - 1)
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stagePills(page)).toBe(0)
      expect(stageTable(page).points).toEqual(['3', '1'])

      // No settle: the block does not move, so the sequence starts at the rise.
      await settle(1)
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stagePills(page)).toBe(2)
      expect(stageTable(page).teams).toEqual(['1', '2'])
      expect(stamp(page)).toBe('Sieg in Spiel 3!')
    })

    it('plays two Results read inside one wait as one sequence from the table the viewer saw, and the block never drops back', async () => {
      const { page, read, headings } = await open()
      vi.setSystemTime(new Date(T + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))
      const steps: string[][] = [headings()]

      vi.setSystemTime(new Date(T + 250))
      await read(withResults(AFTER_TWO, numbered(2, T), numbered(3, T + 200)))
      steps.push(headings())
      expect(stageTable(page)).toEqual(BEFORE_ROWS)

      // The block rises at the second Result's moment plus half a second (T + 700) and arrives at the end of its glide.
      await settle(200 + RISE_DELAY_MS - 250)
      steps.push(headings())
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stagePills(page)).toBe(0)
      await settle(riseSettleMs() - 1)
      expect(stagePills(page)).toBe(0)
      steps.push(headings())
      await settle(1)

      // One set of pills with both Results' gain, one stamp: the second's.
      expect(stagePills(page)).toBe(2)
      expect([...page.element.querySelectorAll('[data-block="standings"] [data-delta]')].map(pill => pill.textContent?.trim())).toEqual(['+6', '+0'])
      expect(page.element.querySelectorAll('[data-block="standings"] [data-stamp]')).toHaveLength(1)
      expect(stamp(page)).toBe('Sieg in Spiel 3!')
      expect(sequence().filter(entry => entry.options.duration === 480)).toHaveLength(1)
      // Once risen the block stayed on top: no drop between the two rises.
      expect(steps.slice(2).every(step => step.indexOf('Tabelle') <= step.indexOf('Gerade dran'))).toBe(true)
    })

    it('plays two Results in a row as two sequences in order: the second counts from the first\'s result, and the block stays on top', async () => {
      const { page, read, headings } = await open()
      vi.setSystemTime(new Date(T + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))
      await settle(RISE_DELAY_MS + riseSettleMs())
      expect(stagePills(page)).toBe(2)

      vi.setSystemTime(new Date(T + 2100))
      await read(withResults(AFTER_TWO, numbered(2, T), numbered(3, T + 2000)))

      // The first Result's pills leave, the table on screen is the first sequence's end until the second one starts at its rise.
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(stagePills(page)).toBe(0)
      expect(stageTable(page)).toEqual({ teams: ['1', '2'], points: ['3', '1'] })
      expect(headings()).toEqual(TABELLE_FIRST)

      await settle(2000 + RISE_DELAY_MS - 2100)
      expect(stagePills(page)).toBe(2)
      expect([...page.element.querySelectorAll('[data-block="standings"] [data-delta]')].map(pill => pill.textContent?.trim())).toEqual(['+3', '+0'])
      expect(headings()).toEqual(TABELLE_FIRST)
    })

    it('starts after the Standings\' own rise when another block is rising: a Countdown at T and a Result at T + 200', async () => {
      const { page, read, headings } = await open()

      vi.setSystemTime(new Date(T + 250))
      await read({ countdown: countdownAt(T), ...withResults(AFTER_ONE, numbered(2, T + 200)) })
      expect(headings()).toEqual(WAITING)

      await settle(RISE_DELAY_MS - 250)
      expect(headings()).toEqual(LIFTED)
      expect(stagePills(page)).toBe(0)

      // The Countdown's glide ends at T + 910, the Standings rise at T + 700 and arrive at T + 1110: not at the Countdown's end.
      await settle(200)
      expect(headings()).toEqual(['Tabelle', 'Countdown', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])
      await settle(riseSettleMs() - 1)
      expect(stagePills(page)).toBe(0)
      await settle(1)
      expect(stagePills(page)).toBe(2)
    })

    it('treats a Correction like a Result: the same wait, and the stamp says the game was won', async () => {
      const { page, read, headings } = await open()

      vi.setSystemTime(new Date(T + 100))
      await read({ results: [{ ...afterResult.results![0]!, corrected: true, correctedAt: iso(T) }], standings: AFTER_ONE })

      expect(headings()).toEqual(TODAY)
      expect(stageTable(page)).toEqual(BEFORE_ROWS)
      expect(live(page)).toContain('Spiel 1 wurde korrigiert.')
      await settle(RISE_DELAY_MS - 100)
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stagePills(page)).toBe(0)

      await settle(riseSettleMs())
      expect(stagePills(page)).toBe(2)
      expect(stamp(page)).toBe('Spiel 1 gewonnen')
    })

    it('starts after the fade under reduced motion: the rise plus 0.14 s, highlights and 0.2 s fades as today', async () => {
      const { page, read, headings } = await open()
      motion('reduced')

      vi.setSystemTime(new Date(T + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))
      await settle(RISE_DELAY_MS - 100)
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(inStage().filter(entry => entry.block === 'standings')).toEqual([expect.objectContaining({ options: expect.objectContaining({ duration: 140 }) })])
      expect(stagePills(page)).toBe(0)
      expect(stageTable(page)).toEqual(BEFORE_ROWS)

      await settle(riseSettleMs() - 1)
      expect(stagePills(page)).toBe(0)
      await settle(1)
      expect(stagePills(page)).toBe(2)
      expect(sequence(true).length).toBeGreaterThan(0)
    })

    it('does not wait in a hidden tab: the news is not made, the order and the table are the new ones at once, and nothing plays', async () => {
      const { page, read, headings } = await open()
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

      vi.setSystemTime(new Date(T + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))

      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stageTable(page).teams).toEqual(['1', '2'])
      expect(stagePills(page)).toBe(0)
      expect(live(page)).toBe('')
      await settle(2000)
      expect(stagePills(page)).toBe(0)
      expect(inStage()).toEqual([])
    })

    it('holds on the phone\'s Event tab too', async () => {
      stubScreen(false)
      const { page, read, headings } = await open()

      vi.setSystemTime(new Date(T + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))
      expect(stageTable(page)).toEqual(BEFORE_ROWS)

      await settle(RISE_DELAY_MS - 100)
      expect(headings()).toEqual(TABELLE_FIRST)
      expect(stagePills(page)).toBe(0)
      await settle(riseSettleMs())
      expect(stagePills(page)).toBe(2)
    })

    it('does not wait for a Result that was read late: the block is there, the sequence starts at the read', async () => {
      const { page, read } = await open()

      vi.setSystemTime(new Date(T + 5000))
      await read(withResults(AFTER_ONE, numbered(2, T)))

      expect(stagePills(page)).toBe(2)
      expect(stageTable(page).teams).toEqual(['1', '2'])
    })

    it('waits only the rest of the glide for a read in the middle of it', async () => {
      const { page, read } = await open()

      vi.setSystemTime(new Date(T + RISE_DELAY_MS + 100))
      await read(withResults(AFTER_ONE, numbered(2, T)))
      expect(stageTable(page)).toEqual(BEFORE_ROWS)

      await settle(riseSettleMs() - 100 - 1)
      expect(stagePills(page)).toBe(0)
      await settle(1)
      expect(stagePills(page)).toBe(2)
    })
  })
})

describe('the clock of the stage order', () => {
  const stageInput = (overrides: EventOverrides = {}) => readOf('clock', overrides) as unknown as StageInput
  let scope: ReturnType<typeof effectScope>
  /** How far the page's server clock reads from the system time: negative = it lags (the estimate is behind). */
  let skew: number
  const now = () => Date.now() + skew

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date(T))
    skew = 0
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /** The order clock on a view the test replaces, as the page's `data` is replaced by every read. */
  function clock(initial: StageInput | null = stageInput(), ready: () => boolean = () => true) {
    const view = shallowRef<StageInput | null>(initial)
    const { orderAt, counted, arrivals } = scope.run(() => useStageOrder(() => view.value, now, ready))!
    return { view, orderAt, counted, arrivals }
  }
  const read = async (view: ReturnType<typeof clock>['view'], next: StageInput) => {
    view.value = next
    await nextTick()
  }

  it('does not lower a block the page showed risen: a reload\'s first read keeps the Countdown on top (#442)', async () => {
    // The page mounts at T + 100 with a Countdown 100 ms old: orderAt is null, so the block is shown lifted. The first read sets orderAt = T + 100 and
    // the moment is not counted for 0.4 s more, which used to drop the block into its rank place and lift it again.
    vi.setSystemTime(new Date(T + 100))
    const { view, orderAt, counted } = clock(stageInput({ countdown: countdownAt(T) }))
    expect(orderAt.value).toBeNull()

    vi.setSystemTime(new Date(T + 200))
    await read(view, stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBe(T + 200)
    const lifted = (list: string[]) => list.filter(block => block !== 'head' && block !== 'reopen')[0]
    expect(lifted(stageBlocks(view.value!, 'running', orderAt.value, counted.value))).toBe('countdown')
    // Without what the page counted the block drops into its rank place: the fault, pinned.
    expect(lifted(stageBlocks(view.value!, 'running', orderAt.value))).toBe('rounds')
  })

  it('starts at null: every moment counted, as the server render and the first client render have it', () => {
    const { orderAt } = clock(stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('takes the page\'s clock at a read, and arms one timer for the next rise: the moment plus half a second', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))

    await read(view, stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBe(T + 100)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100)
    expect(orderAt.value).toBe(T + RISE_DELAY_MS)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('counts a rise that the page\'s clock lags behind: the timer takes its due instant, never less', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T) }))

    // The server clock estimate is 80 ms behind the timer: the moment must still count when it fires.
    skew = -80
    await vi.advanceTimersByTimeAsync(400)

    expect(orderAt.value).toBe(T + RISE_DELAY_MS)
  })

  it('arms no timer for a read with no moment, for a moment already counted, or for a pause', async () => {
    const { view } = clock()
    vi.setSystemTime(new Date(T + 2000))

    await read(view, stageInput())
    expect(vi.getTimerCount()).toBe(0)

    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(vi.getTimerCount()).toBe(0)

    await read(view, stageInput({ countdown: { ...countdownAt(T), startedAt: null } }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('arms for the nearest rise first, then for the next one', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T), results: [afterResult.results![0]!, resultAt(T + 300)] }))

    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100)
    expect(orderAt.value).toBe(T + RISE_DELAY_MS)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(300)
    expect(orderAt.value).toBe(T + 300 + RISE_DELAY_MS)
    // The Standings' block moves (the Countdown, newer than the first Result, sits above it), so its arrival is one more tick after its glide (#442); the Countdown has none.
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(riseSettleMs())
    expect(orderAt.value).toBe(T + 300 + RISE_DELAY_MS + riseSettleMs())
    expect(vi.getTimerCount()).toBe(0)
  })

  it('counts a moment once and never forgets it: a newer moment keeps the first one until it is counted itself (#442)', async () => {
    const { view, counted } = clock()
    vi.setSystemTime(new Date(T + 2000))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(counted.value.countdown).toBe(T)

    // The Countdown resumes at T + 2100: the read counts nothing new for 0.5 s, and the first moment stays.
    vi.setSystemTime(new Date(T + 2200))
    await read(view, stageInput({ countdown: countdownAt(T, T + 2100) }))
    expect(counted.value.countdown).toBe(T)

    await vi.advanceTimersByTimeAsync(2100 + RISE_DELAY_MS - 2200)
    expect(counted.value.countdown).toBe(T + 2100)
  })

  it('follows the view while its clock is null: a hidden tab counts every moment, and the first read after it lowers nothing (#442)', async () => {
    const { view, orderAt, counted } = clock()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    vi.setSystemTime(new Date(T + 100))

    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(orderAt.value).toBeNull()
    expect(counted.value.countdown).toBe(T)

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.setSystemTime(new Date(T + 200))
    await read(view, stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBe(T + 200)
    expect(stageBlocks(view.value!, 'running', orderAt.value, counted.value).indexOf('countdown')).toBeLessThan(stageBlocks(view.value!, 'running', orderAt.value, counted.value).indexOf('rounds'))
  })

  it('arms the arrival tick for the Standings only, and no timer is left when everything has arrived (#442)', async () => {
    const { view, orderAt, arrivals } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(arrivals.value).toEqual({})
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)
    expect(vi.getTimerCount()).toBe(0)

    vi.setSystemTime(new Date(T + 2000))
    await read(view, stageInput({ countdown: countdownAt(T), results: [afterResult.results![0]!, resultAt(T + 2000)] }))
    expect(arrivals.value.standings).toBe(T + 2000 + RISE_DELAY_MS + riseSettleMs())
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(riseSettleMs())
    expect(orderAt.value).toBe(T + 2000 + RISE_DELAY_MS + riseSettleMs())
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the arrival of a moment after the moment is counted: a read inside the glide waits for the rest of it (#442)', async () => {
    const { view, arrivals } = clock()
    vi.setSystemTime(new Date(T + 2000))
    await read(view, stageInput({ countdown: countdownAt(T), results: [afterResult.results![0]!, resultAt(T + 2000)] }))
    const arrival = T + 2000 + RISE_DELAY_MS + riseSettleMs()
    expect(arrivals.value.standings).toBe(arrival)

    // The rise is counted, then a read arrives in the middle of the glide.
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS + 100)
    await read(view, stageInput({ countdown: countdownAt(T), results: [afterResult.results![0]!, resultAt(T + 2000)] }))

    expect(arrivals.value.standings).toBe(arrival)
  })

  it('has no arrival for a Standings that was there at mount or comes with a null clock, and none for a view without a Result moment (#442)', async () => {
    const { view, arrivals } = clock(stageInput({ results: [afterResult.results![0]!, resultAt(T)] }))
    expect(arrivals.value).toEqual({})

    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ results: [afterResult.results![0]!, resultAt(T)] }))
    expect(arrivals.value).toEqual({})
  })

  it('never goes backwards: a resync of the clock does not lower a block that has risen', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 2000))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(orderAt.value).toBe(T + 2000)

    skew = -1000
    await read(view, stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBe(T + 2000)
  })

  it('is null while the tab is hidden, and a tab that turns hidden drops its timer', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(vi.getTimerCount()).toBe(1)

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(orderAt.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    await read(view, stageInput({ countdown: countdownAt(T + 50) }))
    expect(orderAt.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    // Back visible it stays null until the next read.
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(orderAt.value).toBeNull()
    await read(view, stageInput({ countdown: countdownAt(T + 50) }))
    expect(orderAt.value).toBe(T + 100)
  })

  it('clears its timer and its listener when its scope ends', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(vi.getTimerCount()).toBe(1)

    scope.stop()

    expect(vi.getTimerCount()).toBe(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(orderAt.value).toBe(T + 100)
  })
  describe('before the server clock is ready (#488)', () => {
    // Until the first clock.pong the page's clock is the device's own (useServerClock): a read must not take it. A device clock a minute ahead
    // used to set orderAt a minute ahead for good (no 0.5 s wait, the Standings never held), one a minute behind armed the timer on the wrong clock.
    it('takes no order from a device clock that runs ahead, and the synced clock once it is ready', async () => {
      const ready = ref(false)
      const { view, orderAt } = clock(stageInput(), () => ready.value)
      vi.setSystemTime(new Date(T + 100))
      skew = 60_000

      await read(view, stageInput({ countdown: countdownAt(T) }))

      expect(orderAt.value).toBeNull()
      expect(vi.getTimerCount()).toBe(0)

      skew = 0
      ready.value = true
      await nextTick()

      expect(orderAt.value).toBe(T + 100)
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100)
      expect(orderAt.value).toBe(T + RISE_DELAY_MS)
    })

    it('arms no timer on a device clock that runs behind, and arms it on the synced clock once it is ready', async () => {
      const ready = ref(false)
      const { view, orderAt } = clock(stageInput(), () => ready.value)
      vi.setSystemTime(new Date(T + 100))
      skew = -60_000

      await read(view, stageInput({ countdown: countdownAt(T) }))

      expect(orderAt.value).toBeNull()
      expect(vi.getTimerCount()).toBe(0)

      skew = 0
      ready.value = true
      await nextTick()
      await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100)

      expect(orderAt.value).toBe(T + RISE_DELAY_MS)
    })
  })
})
