import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Leaderboard from '~/components/Leaderboard.vue'
import { refreshEvent } from '~/composables/useEventView'
import { countTicks } from '~/utils/count-up'
import { STAMP_DELAY_MS } from '~/utils/motion'
import { cueFilesOf } from '~/utils/sound-cues'
import { defaultSettings } from '~~/shared/settings'
import { FakeAudioContext } from '../fake-audio'
import { filesReady, quiet, requestedOf, requests, resetRequests, serveCueFiles, setUpCuePage, started, tearDownCuePage } from './cue-harness'
import { stubScreen, viewWithSessions, type EventOverrides } from './event-page'
import { afterResult, ENDED, FIRST, halo, members, mount, mountedPage, openRound, played, SESSION, serveState, STARTED, team, unmountPage, type Setup } from './event-page-states'
import { motion } from './motion'

// The Standings' sounds on the Event page (#741, spec #718): a Result that this device shows as a change sounds once (swap, ticks, winner), a
// reload, a hidden tab and a finished Event stay as calm as they are today, and the files are requested for an Event that is set up and not
// finished. The Leaderboard's own rules are test/nuxt/leaderboard-cues.test.ts, the cues' test/unit/standings-cues.test.ts; the audio context is
// the fake of test/fake-audio.ts and the clock is the device's, as in test/nuxt/event-cues.test.ts.

const RUNNING_ONE = SESSION(1, FIRST, { startedAt: STARTED })
const ENDED_ONE = SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED })
const STANDINGS_FILES = cueFilesOf(['standings'])
const COUNT_MS = 600

serveCueFiles()

/** The Standings' sounds that started, in order: [id, seconds on the audio clock]. */
const sounds = () => started().filter(source => String(source.id).startsWith('lb-')).map(source => [String(source.id), source.startedAt!] as const)
const idsStarted = () => sounds().map(([id]) => id)
/** The sounds' ids and their delays after the first, in ms: the beats of one sequence, whatever the clock. */
const beats = () => ({ ids: idsStarted(), delays: sounds().map(([, at]) => (at - sounds()[0]![1]) * 1000) })

const beforeResult: EventOverrides = {
  rounds: [openRound],
  results: [],
  standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
  end: { played: 0, gameCount: 6, complete: false, tie: null, decided: false, finish: null, lastGame: null },
}
/** The first Result gives Team 2 three points and the lead. */
const afterThree: EventOverrides = {
  ...afterResult,
  results: [{ ...played, places: [{ team: 2, place: 1, points: 3, score: null }, { team: 1, place: 2, points: 0, score: null }] }],
  standings: [{ team: 2, rank: 1, points: 3 }, { team: 1, rank: 2, points: 0 }],
  end: { played: 1, gameCount: 6, complete: false, tie: null, decided: false, finish: null, lastGame: null },
}
/** The Host corrects it: Team 1 won, so the order turns again. */
const corrected: EventOverrides = {
  ...afterThree,
  results: [{ ...afterThree.results![0]!, places: [{ team: 1, place: 1, points: 3, score: null }, { team: 2, place: 2, points: 0, score: null }], corrected: true, correctedAt: '2026-10-30T20:00:00.000Z' }],
  standings: [{ team: 1, rank: 1, points: 3 }, { team: 2, rank: 2, points: 0 }],
}

type Served = ReturnType<typeof serveState>
const serveResult = (host = false, overrides: EventOverrides = beforeResult) => serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, host, overrides })
/** The Host enters a Result while the page is open: the next read of the Event has it. */
async function readsResult(served: Served, overrides: EventOverrides = afterThree, { host = false, phase = 'running', sessions = [RUNNING_ONE] }: { host?: boolean, phase?: string, sessions?: Setup['sessions'] } = {}) {
  served.set(viewWithSessions(served.slug, sessions, 0, {
    event: { phase, isHost: host }, settings: defaultSettings(), teams: [team(1), team(2)], members: members(), runningSessionId: `session-${served.slug}-0`, ...overrides,
  }))
  await refreshEvent(served.slug)
  await flushPromises()
}

const showVisibility = (state: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
const phoneTab = (index: number) => mountedPage()!.findAll('nav[aria-label="Event"] button')[index]!

beforeEach(() => {
  setUpCuePage()
  stubScreen(true)
})

afterEach(() => {
  unmountPage()
  tearDownCuePage()
})

for (const host of [true, false]) {
  const who = host ? 'the Host' : 'a Member'

  describe(`the Standings' sounds for ${who}`, () => {
    it('play one set for a Result that changes the order, with the stage and the panel\'s tab both mounted: the swap, three ticks, the winner', async () => {
      const served = serveResult(host)
      await mount(served.slug)
      await filesReady('standings')

      await readsResult(served, afterThree, { host })
      await vi.waitFor(() => expect(idsStarted()).toContain('lb-winner'))
      await quiet()

      // The stage block and the panel's tab: two Leaderboards, one set.
      expect(mountedPage()!.findAllComponents(Leaderboard).length).toBeGreaterThanOrEqual(2)
      expect(idsStarted().filter(id => id === 'lb-swap')).toHaveLength(1)
      expect(idsStarted().filter(id => id === 'lb-count')).toHaveLength(3)
      expect(idsStarted().filter(id => id === 'lb-winner')).toHaveLength(1)
      expect(idsStarted()[0]).toBe('lb-swap')
    })

    it('put the ticks where the counter changes its number, and the winner with the stamp, counted from the swap', async () => {
      const served = serveResult(host)
      await mount(served.slug)
      await filesReady('standings')

      await readsResult(served, afterThree, { host })
      await vi.waitFor(() => expect(idsStarted()).toContain('lb-winner'))
      await quiet()

      const ticks = countTicks(0, 3, COUNT_MS)
      const [, swapAt] = sounds()[0]!
      const delays = sounds().map(([id, at]) => [id, (at - swapAt) * 1000] as const)
      expect(delays.filter(([id]) => id === 'lb-count').map(([, delay]) => delay)).toHaveLength(ticks.length)
      delays.filter(([id]) => id === 'lb-count').forEach(([, delay], index) => expect(Math.abs(delay - ticks[index]!)).toBeLessThan(10))
      const winner = delays.find(([id]) => id === 'lb-winner')!
      expect(Math.abs(winner[1] - STAMP_DELAY_MS)).toBeLessThan(60)
    })

    it('play a Correction like a new Result: the set again', async () => {
      const served = serveResult(host)
      await mount(served.slug)
      await filesReady('standings')
      await readsResult(served, afterThree, { host })
      await vi.waitFor(() => expect(idsStarted()).toContain('lb-winner'))

      await readsResult(served, corrected, { host })
      await vi.waitFor(() => expect(idsStarted().filter(id => id === 'lb-winner')).toHaveLength(2))
      await quiet()

      expect(idsStarted().filter(id => id === 'lb-swap')).toHaveLength(2)
      expect(idsStarted().filter(id => id === 'lb-count')).toHaveLength(6)
    })

    it('stay silent for the first read with a Result already there (a reload), and a refetch of it', async () => {
      const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, host, overrides: afterThree })
      await mount(served.slug)
      await filesReady('standings')

      await refreshEvent(served.slug)
      await flushPromises()
      await quiet()

      expect(idsStarted()).toEqual([])
    })

    it('stay silent in a tab nobody watches, and do not play the Result when it is shown again', async () => {
      const served = serveResult(host)
      await mount(served.slug)
      await filesReady('standings')
      showVisibility('hidden')

      await readsResult(served, afterThree, { host })
      await quiet()
      showVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()
      await quiet()

      expect(idsStarted()).toEqual([])
    })

    it('stay silent in a finished Event, and request no Standings file there', async () => {
      const served = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host, overrides: beforeResult })
      await mount(served.slug)
      await quiet()

      await readsResult(served, afterThree, { host, phase: 'finished', sessions: [ENDED_ONE] })
      await quiet()

      expect(idsStarted()).toEqual([])
      expect(requestedOf('standings')).toEqual([])
    })

    it('stay silent with Ton off, request no file, and switching Ton on afterwards plays nothing', async () => {
      localStorage.setItem('compies-sound', 'off')
      const served = serveResult(host)
      await mount(served.slug)
      await flushPromises()

      await readsResult(served, afterThree, { host })
      await quiet()
      expect(idsStarted()).toEqual([])
      expect(requestedOf('standings')).toEqual([])
      expect((globalThis as { __compiesCueLog?: () => unknown[] }).__compiesCueLog?.() ?? []).toEqual([])

      useState('sound-enabled').value = true
      await filesReady('standings')
      await quiet()

      expect(idsStarted()).toEqual([])
    })

    it('play the swap and the winner and no ticks under reduced motion, the winner with the swap', async () => {
      const served = serveResult(host)
      await mount(served.slug)
      await filesReady('standings')
      motion('reduced')

      await readsResult(served, afterThree, { host })
      await vi.waitFor(() => expect(idsStarted()).toContain('lb-winner'))
      await quiet()

      expect(idsStarted()).toEqual(['lb-swap', 'lb-winner'])
      const [swap, winner] = sounds()
      expect(Math.abs(winner![1] - swap![1])).toBeLessThan(0.05)
    })

    it('request the three files once for an Event that is set up and not finished, also before its first Result', async () => {
      const served = serveResult(host)

      await mount(served.slug)
      await filesReady('standings')

      expect(requestedOf('standings')).toEqual([...STANDINGS_FILES].sort())
      for (const id of STANDINGS_FILES) expect(requests[id], id).toBe(1)
    })

    it('request no Standings file for an Event without Standings (not set up)', async () => {
      const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, host })

      await mount(served.slug)
      await quiet()

      expect(requestedOf('standings')).toEqual([])
    })

    it('request no Standings file for a finished Event', async () => {
      const served = serveState({ sessions: [ENDED_ONE], missing: 0, phase: 'finished', host, overrides: afterThree })

      await mount(served.slug)
      await quiet()

      expect(requestedOf('standings')).toEqual([])
    })
  })
}

describe('the Standings\' sounds on a phone', () => {
  beforeEach(() => stubScreen(false))

  it('play the swap and the ticks and no winner on the Standings tab, where no stamp is drawn', async () => {
    const served = serveResult()
    await mount(served.slug)
    await filesReady('standings')
    await phoneTab(1).trigger('click')

    await readsResult(served)
    await vi.waitFor(() => expect(idsStarted()).toContain('lb-swap'))
    await quiet()

    expect(idsStarted()).toEqual(['lb-swap', 'lb-count', 'lb-count', 'lb-count'])
  })

  it('play all three on the Event view, where the stage block draws the stamp', async () => {
    const served = serveResult()
    await mount(served.slug)
    await filesReady('standings')

    await readsResult(served)
    await vi.waitFor(() => expect(idsStarted()).toContain('lb-winner'))
    await quiet()

    expect(idsStarted().filter(id => id === 'lb-swap')).toHaveLength(1)
    expect(idsStarted().filter(id => id === 'lb-count')).toHaveLength(3)
    expect(idsStarted().filter(id => id === 'lb-winner')).toHaveLength(1)
  })

  it('play nothing more when the Standings tab is opened after the freshness window', async () => {
    const served = serveResult()
    await mount(served.slug)
    await filesReady('standings')
    await readsResult(served)
    await vi.waitFor(() => expect(idsStarted()).toContain('lb-winner'))
    await quiet()
    const before = sounds().length

    // A real second on purpose: the rule is "a Result older than FRESH_MS (1 s, Leaderboard.vue) is not news", so the page's own clock has to pass it.
    await new Promise(resolve => setTimeout(resolve, 1100))
    await phoneTab(1).trigger('click')
    await flushPromises()
    await quiet()

    expect(sounds()).toHaveLength(before)
  })
})

// Secrecy (CODING_STANDARDS § Secrecy): the cues read ranks, points and team positions of the viewer's own read, never the Round's game or the
// Event's settings. The same change with other games, and with a Hidden wheel, sounds and requests the same.
describe('the Standings\' sounds and Secrecy', () => {
  async function runWith(game: typeof halo, settings = defaultSettings()) {
    resetRequests()
    FakeAudioContext.instances = []
    const served = serveResult(false, { ...beforeResult, settings })
    await mount(served.slug)
    await filesReady('standings')
    await readsResult(served, { ...afterThree, settings, results: [{ ...afterThree.results![0]!, game }] })
    await vi.waitFor(() => expect(idsStarted()).toContain('lb-winner'))
    await quiet()
    const result = { beats: beats(), files: requestedOf('standings') }
    unmountPage()
    return result
  }

  it('are the same with another Round game and with a Hidden wheel setting on the Event', async () => {
    const plain = await runWith(halo)
    const other = await runWith({ ...halo, id: 'g-kart', name: 'Kart', suitabilities: [], price: null })
    const hidden = await runWith({ ...halo, id: 'g-other', name: 'Anderes' }, { ...defaultSettings(), hiddenWheel: true })

    expect(plain.beats.ids).toEqual(['lb-swap', 'lb-count', 'lb-count', 'lb-count', 'lb-winner'])
    for (const run of [other, hidden]) {
      expect(run.beats.ids).toEqual(plain.beats.ids)
      // The same delays, give or take the time the test's own calls take.
      run.beats.delays.forEach((delay, index) => expect(Math.abs(delay - plain.beats.delays[index]!)).toBeLessThan(25))
      expect(run.files).toEqual(plain.files)
    }
    expect(plain.files).toEqual([...STANDINGS_FILES].sort())
  })
})
