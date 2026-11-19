import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Leaderboard from '~/components/Leaderboard.vue'
import { immediateCueKey } from '~/composables/useImmediateCue'
import { countTicks } from '~/utils/count-up'
import { STAMP_DELAY_MS } from '~/utils/motion'
import type { StandingsNews } from '~/utils/standings-news'
import type { BoardTeam } from '~~/shared/event'
import type { EndView, StandingView } from '~~/shared/stage'
import { motion } from './motion'

// The Standings' sounds in the Leaderboard (#741, spec #718): a played news asks the player (handed down by the Event page, here a spy) for its
// swap, its ticks and, where the stamp is drawn, its winner. Which news plays at all (fresh, not held) is the Leaderboard's old rule (#276, #442);
// what the cues are is test/unit/standings-cues.test.ts. The rows' and counter's own motion is test/nuxt/leaderboard.test.ts.

const NOW = Date.parse('2026-11-02T20:00:00.000Z')
const COUNT_MS = 600
const teams: BoardTeam[] = [{ position: 1, name: 'Wilde Gurken' }, { position: 2, name: 'Die Füchse' }, { position: 3, name: null }]
const end: EndView = { played: 3, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null }
const standing = (team: number, rank: number, points: number): StandingView => ({ team, rank, points })
/** The Standings the page saw: Team 2 leads. */
const BEFORE = [standing(2, 1, 5), standing(1, 2, 3), standing(3, 3, 0)]
/** After Spiel 4 (Team 1 won, +3): Team 1 takes the lead, Team 3 gains 1. */
const AFTER = [standing(1, 1, 6), standing(2, 2, 5), standing(3, 3, 1)]

const newsOf = (overrides: Partial<StandingsNews> = {}): StandingsNews => ({
  key: 1, kind: 'entered', roundId: 'r4', number: 4, before: BEFORE, winners: [1], at: Date.now(), announcement: 'Spiel 4 ist eingetragen.', cuesAsked: new Set(), ...overrides,
})

type Props = { standings?: StandingView[], celebrate?: boolean, framed?: boolean, news?: StandingsNews | null, hold?: boolean }
const pages: VueWrapper[] = []
let played: ReturnType<typeof vi.fn>

/** A Leaderboard under a provider of the spy, or under none. */
async function mount(props: Props = {}, provided = true) {
  const page = await mountSuspended(Leaderboard, {
    props: { standings: BEFORE, end, teams, ...props },
    global: { stubs: { TransitionGroup: false }, provide: provided ? { [immediateCueKey as symbol]: played } : {} },
  })
  pages.push(page)
  return page
}

/** What the spy was asked for: [id, delayMs] each, in order. */
const asked = () => played.mock.calls.map(call => [call[0], call[1]])
const idsAsked = () => played.mock.calls.map(call => call[0] as string)
const TICKS = countTicks(3, 6, COUNT_MS)

async function receives(page: VueWrapper, news: StandingsNews | null, standings = AFTER, extra: Props = {}) {
  await page.setProps({ standings, news, ...extra })
  await nextTick()
}

beforeEach(() => {
  played = vi.fn()
  Element.prototype.animate = vi.fn(() => ({ currentTime: 0, cancel: vi.fn(), finish: vi.fn(), onfinish: null })) as unknown as typeof Element.prototype.animate
  motion('full')
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  for (const page of pages.splice(0)) page.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Standings\' sounds in the Leaderboard (#741)', () => {
  it('asks for the swap at the start, the ticks of the count and, on the stage, the winner with the stamp', async () => {
    const page = await mount({ celebrate: true, framed: true })

    await receives(page, newsOf())

    expect(asked()).toEqual([['lb-swap', 0], ...TICKS.map(delay => ['lb-count', delay]), ['lb-winner', STAMP_DELAY_MS]])
    expect(TICKS).toHaveLength(3)
  })

  it('asks for no winner where no stamp is drawn (the panel\'s tab, the phone\'s Standings)', async () => {
    const page = await mount()

    await receives(page, newsOf())

    expect(idsAsked()).toEqual(['lb-swap', 'lb-count', 'lb-count', 'lb-count'])
  })

  it('asks for no swap when no rank changed, and for no winner when nobody won', async () => {
    const page = await mount({ celebrate: true, framed: true, standings: [standing(2, 1, 5), standing(1, 2, 3), standing(3, 3, 0)] })

    await receives(page, newsOf({ winners: [] }), [standing(2, 1, 8), standing(1, 2, 3), standing(3, 3, 0)])

    expect(idsAsked()).not.toContain('lb-swap')
    expect(idsAsked()).not.toContain('lb-winner')
    expect(idsAsked()).toContain('lb-count')
  })

  it('asks for nothing before there is a news, and nothing when the Standings change without one', async () => {
    const page = await mount({ celebrate: true, framed: true })

    await receives(page, null)

    expect(played).not.toHaveBeenCalled()
  })

  it('asks for nothing when it mounts with a news older than the freshness window (a tab opened later)', async () => {
    await mount({ standings: AFTER, celebrate: true, framed: true, news: newsOf({ at: Date.now() - 1000 }) })
    await vi.advanceTimersByTimeAsync(5000)

    expect(played).not.toHaveBeenCalled()
  })

  it('asks for the sounds when it mounts with a news that is still fresh (the first Result creates the stage block)', async () => {
    await mount({ standings: AFTER, celebrate: true, framed: true, news: newsOf({ at: Date.now() - 200 }) })

    expect(idsAsked()).toEqual(['lb-swap', 'lb-count', 'lb-count', 'lb-count', 'lb-winner'])
  })

  it('does nothing and throws nothing where no player was provided', async () => {
    const page = await mount({ celebrate: true, framed: true }, false)

    await expect(receives(page, newsOf())).resolves.toBeUndefined()

    expect(played).not.toHaveBeenCalled()
  })

  it('waits for the block under `hold`: no sound before the sequence starts, then the whole set', async () => {
    const page = await mount({ celebrate: true, framed: true })

    await receives(page, newsOf(), AFTER, { hold: true })
    expect(played).not.toHaveBeenCalled()

    await page.setProps({ hold: false })
    await nextTick()

    expect(idsAsked()).toEqual(['lb-swap', 'lb-count', 'lb-count', 'lb-count', 'lb-winner'])
  })

  it('plays one set for a news that two Leaderboards share, whichever starts first: one swap, one set of ticks, one winner', async () => {
    const news = newsOf()
    const stage = await mount({ celebrate: true, framed: true })
    const panel = await mount()

    // The stage block's sequence starts later (its `hold`), the panel's at once: the panel asks for the swap and the ticks, the stage for the winner.
    await receives(stage, news, AFTER, { hold: true })
    await receives(panel, news)
    expect(idsAsked()).toEqual(['lb-swap', 'lb-count', 'lb-count', 'lb-count'])

    await stage.setProps({ hold: false })
    await nextTick()

    expect(asked()).toEqual([['lb-swap', 0], ...TICKS.map(delay => ['lb-count', delay]), ['lb-winner', STAMP_DELAY_MS]])
  })

  it('plays one set when the stage starts first and the panel second', async () => {
    const news = newsOf()
    const stage = await mount({ celebrate: true, framed: true })
    const panel = await mount()

    await receives(stage, news)
    await receives(panel, news)

    expect(idsAsked().filter(id => id === 'lb-swap')).toHaveLength(1)
    expect(idsAsked().filter(id => id === 'lb-count')).toHaveLength(3)
    expect(idsAsked().filter(id => id === 'lb-winner')).toHaveLength(1)
  })

  it('plays a Correction like a new Result: its news has its own claims', async () => {
    const page = await mount({ celebrate: true, framed: true })
    await receives(page, newsOf())
    played.mockClear()

    await receives(page, newsOf({ key: 2, kind: 'corrected', before: AFTER }), [standing(2, 1, 9), standing(1, 2, 6), standing(3, 3, 1)])

    expect(idsAsked()).toEqual(['lb-swap', ...countTicks(5, 9, COUNT_MS).map(() => 'lb-count'), 'lb-winner'])
  })

  it('does not ask again for the same news when the Standings are read again', async () => {
    const page = await mount({ celebrate: true, framed: true })
    const news = newsOf()
    await receives(page, news)
    played.mockClear()

    await receives(page, news, AFTER.map(row => ({ ...row })))

    expect(played).not.toHaveBeenCalled()
  })

  it('asks for the swap and the winner and no ticks under reduced motion, the winner with the stamp at once', async () => {
    motion('reduced')
    const page = await mount({ celebrate: true, framed: true })

    await receives(page, newsOf())

    expect(asked()).toEqual([['lb-swap', 0], ['lb-winner', 0]])
  })
})
