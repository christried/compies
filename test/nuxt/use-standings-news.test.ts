import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStandingsNews } from '~/composables/useStandingsNews'
import type { BoardTeam, EventView } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import type { ResultView, StandingView } from '~~/shared/stage'
import { standingsOf } from '~~/shared/results'
import { view } from './event-page'

// What the page knows of a Result it has not seen (#276, spec #272, 0.8-04): the first read of an Event is a baseline and no news; a later read with
// a new or corrected Result makes one news, which expires after 4 s. A hidden tab, a finished Event and an Event without Standings stay calm and
// still move the baseline. The announcement is built here, for the page's one polite live region.

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const teams: BoardTeam[] = [{ position: 1, name: 'Wilde Gurken', frozen: true }, { position: 2, name: 'Die Füchse', frozen: true }, { position: 3, name: null, frozen: false }]
const T0 = Date.parse('2026-11-02T20:00:00.000Z')
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString()

/** A Result of Round `number`; `order` lists the teams from Place 1 down, and the points are the descending ones of a linear table. */
function resultOf(number: number, order: number[], resultAt = at(number), correctedAt: string | null = null): ResultView {
  return {
    roundId: `r${number}`,
    number,
    game: { ...halo, id: `g-${number}`, name: `Spiel ${number}` },
    places: order.map((team, index) => ({ team, place: index + 1, points: order.length - 1 - index, score: null })),
    corrected: correctedAt !== null,
    correctedAt,
    resultAt,
  }
}

/** The Standings after `results` the way the server ranks them (`standingsOf`), every Party counted. */
function standingsAfter(results: ResultView[], parties = 3): StandingView[] {
  const points = Array.from({ length: parties }, () => 0)
  for (const result of results) for (const line of result.places) points[line.team - 1]! += line.points
  return standingsOf(points)
}

function read(results: ResultView[], overrides: { phase?: string, standings?: StandingView[] | null, slug?: string } = {}): EventView {
  return view(overrides.slug ?? 'freitags-zocken', [], {
    event: { phase: overrides.phase ?? 'running' },
    teams,
    results,
    standings: overrides.standings === undefined ? standingsAfter(results) : overrides.standings,
  }) as unknown as EventView
}

let page: VueWrapper | undefined
let data: Ref<EventView | null>
let slug: Ref<string>
let news: ReturnType<typeof useStandingsNews>['news']

async function setUp(first: EventView | null = read([])) {
  data = ref(first)
  slug = ref(first?.event.slug ?? 'freitags-zocken')
  page = await mountSuspended(defineComponent({
    setup() {
      news = useStandingsNews(data, slug).news
      return () => null
    },
  }))
  await nextTick()
}

/** The page reads the Event again. */
async function reads(next: EventView) {
  data.value = next
  await nextTick()
}

/** Whether the tab is visible: `document.visibilityState`, which the news checks. */
function tab(state: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(T0))
  tab('visible')
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useStandingsNews', () => {
  describe('when there is news', () => {
    it('makes none for the first read, with Results or without', async () => {
      await setUp(read([resultOf(1, [2, 1, 3])]))

      expect(news.value).toBeNull()
    })

    it('makes none while no read has come yet, and none for the read that is the first non-null one', async () => {
      await setUp(null)
      expect(news.value).toBeNull()

      await reads(read([resultOf(1, [2, 1, 3])]))

      expect(news.value).toBeNull()
    })

    it('makes news for a read with a new Result: entered, its number, the Standings before, the winners', async () => {
      await setUp()
      const first = resultOf(1, [2, 1, 3])

      await reads(read([first]))

      expect(news.value).toMatchObject({
        kind: 'entered',
        roundId: 'r1',
        number: 1,
        winners: [2],
        at: T0,
        // Every Party at 0 and rank 1: what the page saw before the first Result.
        before: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }, { team: 3, rank: 1, points: 0 }],
      })
    })

    it('has the previous Standings as `before`, and several winners when Parties share Place 1', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([first]))
      const second: ResultView = { ...resultOf(2, [1, 2, 3]), places: [{ team: 1, place: 1, points: 2, score: null }, { team: 3, place: 1, points: 2, score: null }, { team: 2, place: 3, points: 0, score: null }] }

      await reads(read([first, second]))

      expect(news.value?.before).toEqual(standingsAfter([first]))
      expect(news.value?.winners).toEqual([1, 3])
      expect(news.value?.number).toBe(2)
    })

    it('makes none when the same read comes again, or a read with nothing new', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([first]))

      await reads(read([first]))
      expect(news.value).toBeNull()
      await reads(read([first], { standings: standingsAfter([first]) }))
      expect(news.value).toBeNull()
    })

    it('makes `corrected` news for a Correction, and again for a second Correction of the same Round', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([first]))

      const once = resultOf(1, [1, 2, 3], first.resultAt, at(10))
      await reads(read([once]))
      expect(news.value).toMatchObject({ kind: 'corrected', number: 1, winners: [1], key: 1 })
      expect(news.value?.before).toEqual(standingsAfter([first]))

      const twice = resultOf(1, [3, 2, 1], first.resultAt, at(20))
      await reads(read([twice]))
      expect(news.value).toMatchObject({ kind: 'corrected', number: 1, winners: [3], key: 2 })
      expect(news.value?.before).toEqual(standingsAfter([once]))
    })

    it('counts a Correction that changes only the Scores as news (delta +0): it carries a new `correctedAt`', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([first]))

      await reads(read([{ ...first, correctedAt: at(5), corrected: true }]))

      expect(news.value?.kind).toBe('corrected')
    })

    it('makes one news for a read with several new Results, for the newest, with the sum of them as the change', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([]))
      const second = resultOf(2, [1, 2, 3])

      await reads(read([first, second]))

      expect(news.value).toMatchObject({ kind: 'entered', number: 2, winners: [1] })
      expect(news.value?.before.every(standing => standing.points === 0)).toBe(true)
    })

    it('hands every news a new key, also one that replaces a news that is still showing', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([]))
      await reads(read([first]))
      const key = news.value!.key

      vi.advanceTimersByTime(1500)
      await reads(read([first, resultOf(2, [1, 2, 3])]))

      expect(news.value!.key).toBe(key + 1)
      expect(news.value!.number).toBe(2)
    })

    it('copes with 30 Results and eight Parties', async () => {
      const eight = (number: number) => resultOf(number, Array.from({ length: 8 }, (_, index) => ((index + number) % 8) + 1))
      const before = Array.from({ length: 29 }, (_, index) => eight(index + 1))
      await setUp(read(before, { standings: standingsAfter(before, 8) }))

      const all = [...before, eight(30)]
      await reads(read(all, { standings: standingsAfter(all, 8) }))

      expect(news.value).toMatchObject({ number: 30, kind: 'entered' })
      expect(news.value?.before).toHaveLength(8)
    })
  })

  describe('when it stays calm', () => {
    it('makes none while the tab is hidden, and the baseline moves on: the next Result compares with what the page last read', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([]))
      tab('hidden')

      await reads(read([first]))
      expect(news.value).toBeNull()

      tab('visible')
      await reads(read([first]))
      expect(news.value).toBeNull()
      const second = resultOf(2, [1, 2, 3])
      await reads(read([first, second]))
      expect(news.value).toMatchObject({ number: 2, before: standingsAfter([first]) })
    })

    it('makes none for a finished Event, and the baseline moves on', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([]))

      await reads(read([first], { phase: 'finished' }))
      expect(news.value).toBeNull()

      await reads(read([first], { phase: 'finished' }))
      expect(news.value).toBeNull()
    })

    it('makes none for an Event without Standings, and the baseline moves on', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([]))

      await reads(read([first], { standings: null }))
      expect(news.value).toBeNull()

      await reads(read([first]))
      expect(news.value).toBeNull()
    })

    it('starts over for another Event: its first read is a baseline again', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([]))

      slug.value = 'anderes-event'
      await nextTick()
      await reads(read([first], { slug: 'anderes-event' }))

      expect(news.value).toBeNull()
    })
  })

  describe('how long it lasts', () => {
    it('clears itself 4 s after it was made', async () => {
      await setUp(read([]))
      await reads(read([resultOf(1, [2, 1, 3])]))
      expect(news.value).not.toBeNull()

      vi.advanceTimersByTime(3999)
      expect(news.value).not.toBeNull()
      vi.advanceTimersByTime(1)
      expect(news.value).toBeNull()
    })

    it('restarts the timer when a news replaces a running one', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([]))
      await reads(read([first]))
      vi.advanceTimersByTime(3000)

      await reads(read([first, resultOf(2, [1, 2, 3])]))
      vi.advanceTimersByTime(2000)
      expect(news.value?.number).toBe(2)
      vi.advanceTimersByTime(2000)
      expect(news.value).toBeNull()
    })

    it('stops its timer when the page goes away', async () => {
      await setUp(read([]))
      await reads(read([resultOf(1, [2, 1, 3])]))

      page!.unmount()
      page = undefined

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('the announcement', () => {
    it('says a Correction was made and the table is recalculated', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([first]))

      await reads(read([resultOf(1, [1, 2, 3], first.resultAt, at(5))]))

      expect(news.value!.announcement.startsWith('Spiel 1 wurde korrigiert. Die Tabelle ist neu berechnet.')).toBe(true)
    })

    it('opens with the Result that was saved, then reads takesFirst before rankNow, each Party once, and leaves a Party whose rank did not change out', async () => {
      // Before: Die Füchse 1st (3), Wilde Gurken 2nd (1), Team Gelb 3rd (0).
      const first: ResultView = { ...resultOf(1, [2, 1, 3]), places: [{ team: 2, place: 1, points: 3, score: null }, { team: 1, place: 2, points: 1, score: null }, { team: 3, place: 3, points: 0, score: null }] }
      await setUp(read([first]))
      const second: ResultView = { ...resultOf(2, [1, 3, 2]), places: [{ team: 1, place: 1, points: 3, score: null }, { team: 3, place: 2, points: 1, score: null }, { team: 2, place: 3, points: 0, score: null }] }

      await reads(read([first, second]))

      // After: Wilde Gurken 4 (1st), Die Füchse 3 (2nd), Team Gelb 1 (3rd). Team Gelb stays 3rd and is not named.
      expect(news.value!.announcement).toBe('Spiel 2 ist eingetragen. Wilde Gurken übernimmt Platz 1. Die Füchse ist jetzt auf Rang 2.')
      expect(news.value!.announcement).not.toContain('Team Gelb')
    })

    it('names a Party without a frozen name by its colour', async () => {
      const first: ResultView = { ...resultOf(1, [1, 2, 3]), places: [{ team: 1, place: 1, points: 3, score: null }, { team: 2, place: 2, points: 1, score: null }, { team: 3, place: 3, points: 0, score: null }] }
      await setUp(read([first]))
      const second: ResultView = { ...resultOf(2, [3, 2, 1]), places: [{ team: 3, place: 1, points: 9, score: null }, { team: 2, place: 2, points: 1, score: null }, { team: 1, place: 3, points: 0, score: null }] }

      await reads(read([first, second]))

      expect(news.value!.announcement).toContain('Team Gelb übernimmt Platz 1.')
      expect(news.value!.announcement).toContain('Wilde Gurken ist jetzt auf Rang 2')
    })

    it('reads only the lead sentence when no rank changed', async () => {
      const first = resultOf(1, [2, 1, 3])
      await setUp(read([first]))
      const second = resultOf(2, [2, 1, 3])

      await reads(read([first, second]))

      expect(news.value!.announcement).toBe('Spiel 2 ist eingetragen.')
    })
  })
})
