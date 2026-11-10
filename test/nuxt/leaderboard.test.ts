import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Leaderboard from '~/components/Leaderboard.vue'
import type { StandingsNews } from '~/utils/standings-news'
import type { BoardTeam } from '~~/shared/event'
import type { EndView, StandingView } from '~~/shared/stage'
import { standingsOf } from '~~/shared/results'

// The Standings (#274, GLOSSARY: Standings; 03-screens 17, the calm state): a real table with a visually hidden head, one row per Party in the
// order the Event read gives (the component sorts and ranks nothing), a shared rank printed twice, and the points read out with their noun.

const named = (names: (string | null)[]): BoardTeam[] => names.map((name, index) => ({ position: index + 1, name, frozen: name !== null }))
const three = named(['Wilde Gurken', 'Die Füchse', null])
const end = (played: number, gameCount = 6): EndView => ({ played, gameCount, complete: played >= gameCount, tie: null, finish: null, lastGame: null })
const standing = (team: number, rank: number, points: number): StandingView => ({ team, rank, points })

type Props = { standings?: StandingView[], end?: EndView, teams?: BoardTeam[], framed?: boolean, celebrate?: boolean, news?: StandingsNews | null, hold?: boolean, labelledBy?: string }
let page: VueWrapper | undefined

async function mount(props: Props = {}) {
  // Vue Test Utils stubs TransitionGroup with an element of its own, which would take the place of the `tbody`: the real one renders it.
  page = await mountSuspended(Leaderboard, { props: { standings: [standing(2, 1, 8), standing(1, 2, 3), standing(3, 3, 1)], end: end(3), teams: three, ...props }, global: { stubs: { TransitionGroup: false } } })
  return page
}

const rows = () => page!.findAll('tbody tr')
const cells = (row: ReturnType<typeof rows>[number]) => row.findAll('td')

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the Standings', () => {
  it('names the game it stands after, under a heading that names the table', async () => {
    await mount({ end: end(7, 10) })

    expect(page!.text()).toContain('Nach Spiel 7 von 10')
    const heading = page!.get('h2')
    expect(heading.text()).toBe('Tabelle')
    expect(page!.get('table').attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })

  it('has no heading of its own when a heading outside it names it: `labelledBy` (#274)', async () => {
    await mount({ labelledBy: 'standings-title', end: end(7, 10) })

    expect(page!.findAll('h2')).toHaveLength(0)
    expect(page!.get('table').attributes('aria-labelledby')).toBe('standings-title')
    expect(page!.get('section').attributes('aria-labelledby')).toBe('standings-title')
    expect(page!.text()).toContain('Nach Spiel 7 von 10')
  })

  it('is a table: a head for screen readers only, then one row per Party with its rank, Party and points', async () => {
    await mount()

    expect(page!.findAll('table')).toHaveLength(1)
    const head = page!.findAll('thead th')
    expect(head.map(cell => cell.text())).toEqual(['Rang', 'Partei', 'Punkte'])
    expect(head.map(cell => cell.attributes('scope'))).toEqual(['col', 'col', 'col'])
    expect(page!.get('thead').classes()).toContain('sr-only')
    expect(rows()).toHaveLength(3)
    for (const row of rows()) expect(cells(row)).toHaveLength(3)
    // Nothing overrides the native roles (a role or a `display` on a table element would drop its semantics in some browsers).
    expect(page!.findAll('table [role]')).toHaveLength(0)
  })

  it('lists the Parties in the order it is given, with their team on the row', async () => {
    await mount()

    expect(rows().map(row => row.attributes('data-team'))).toEqual(['2', '1', '3'])
    expect(rows().map(row => cells(row)[0]!.text())).toEqual(['1.', '2.', '3.'])
  })

  it('prints a shared rank twice and then skips one: 1., 1., 3.', async () => {
    await mount({ standings: standingsOf([4, 4, 1]) })

    expect(rows().map(row => cells(row)[0]!.text())).toEqual(['1.', '1.', '3.'])
    expect(rows().map(row => row.attributes('data-team'))).toEqual(['1', '2', '3'])
  })

  it('fills the pill of rank 1 only, for every Party that holds it', async () => {
    await mount({ standings: standingsOf([4, 4, 1]) })

    const pills = rows().map(row => cells(row)[0]!.get('[data-rank]'))
    expect(pills.map(pill => pill.classes().includes('bg-primary'))).toEqual([true, true, false])
    expect(pills[2]!.classes()).toContain('bg-surface')
  })

  it('shows the Team name a Party froze, and the colour\'s name for one without', async () => {
    await mount({ standings: [standing(1, 1, 3), standing(2, 2, 2), standing(3, 3, 1)] })

    expect(rows().map(row => cells(row)[1]!.text())).toEqual(['Wilde Gurken', 'Die Füchse', 'Team Gelb'])
  })

  it('draws the Team mark of each Party, hidden from screen readers next to its name', async () => {
    await mount()

    for (const row of rows()) expect(cells(row)[1]!.find('[aria-hidden="true"] svg').exists()).toBe(true)
  })

  it('reads the points with their noun to a screen reader, and singular for one', async () => {
    await mount()

    const points = rows().map(row => cells(row)[2]!)
    expect(points.map(cell => cell.get('.sr-only').text())).toEqual(['8 Punkte', '3 Punkte', '1 Punkt'])
    expect(points.map(cell => cell.get('[aria-hidden="true"]').text())).toEqual(['8', '3', '1'])
  })

  it('reads 0 points as „0 Punkte“', async () => {
    await mount({ standings: [standing(1, 1, 0), standing(2, 1, 0)], teams: named(['A', 'B']) })

    expect(rows().map(row => cells(row)[2]!.get('.sr-only').text())).toEqual(['0 Punkte', '0 Punkte'])
  })

  it('shows no table before the first Result, only the line that says so', async () => {
    await mount({ end: end(0), standings: [standing(1, 1, 0), standing(2, 1, 0), standing(3, 1, 0)] })

    expect(page!.find('table').exists()).toBe(false)
    expect(page!.findAll('p').map(line => line.text())).toContain('Noch kein Ergebnis. Sobald der Host eins einträgt, steht hier die Tabelle.')
  })

  it('has no kicker before the first Result: no „Nach Spiel 0 von 6“ (#274)', async () => {
    await mount({ end: end(0), standings: [standing(1, 1, 0), standing(2, 1, 0), standing(3, 1, 0)] })

    expect(page!.text()).not.toContain('Nach Spiel')
    expect(page!.text()).toContain('Tabelle')
  })

  it('names the game it stands after from the first Result on: „Nach Spiel 1 von 6“ (#274)', async () => {
    await mount({ end: end(1, 6) })

    expect(page!.text()).toContain('Nach Spiel 1 von 6')
  })

  it('has two rows for two Parties and eight for eight', async () => {
    await mount({ standings: [standing(2, 1, 5), standing(1, 2, 0)], teams: named(['A', 'B']) })
    expect(rows()).toHaveLength(2)
    page!.unmount()

    const eight = standingsOf([8, 7, 6, 5, 4, 3, 2, 1])
    await mount({ standings: eight, teams: named(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) })
    expect(rows()).toHaveLength(8)
    expect(rows().map(row => row.attributes('data-team'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  it('cuts the longest Team name and keeps its full text in the title', async () => {
    // Eight Team words of the longest allowed length, joined by spaces: the longest a composed Team name gets.
    const longest = Array.from({ length: 8 }, () => 'W'.repeat(12)).join(' ')
    await mount({ standings: [standing(1, 1, 3)], teams: named([longest]) })

    const name = cells(rows()[0]!)[1]!.get('[title]')
    expect(name.classes()).toContain('truncate')
    expect(name.attributes('title')).toBe(longest)
    expect(name.text()).toBe(longest)
  })

  it('gives the card chrome to the stage block and none to the tab', async () => {
    await mount({ framed: true })
    const framed = page!.get('section').classes()
    expect(framed).toContain('bg-surface')
    expect(framed).toContain('shadow-card')
    page!.unmount()

    await mount()
    const plain = page!.get('section').classes()
    expect(plain).not.toContain('bg-surface')
    expect(plain).not.toContain('shadow-card')
  })

  it('has no live region: the page has one for both Leaderboards (#276)', async () => {
    await mount()

    expect(page!.find('[aria-live]').exists()).toBe(false)
    expect(page!.find('[role="status"]').exists()).toBe(false)
  })
})

// The Standings in motion (#276, 04-motion § Leaderboard). jsdom runs no transition, so these tests prove what the code asks for (the move
// class, the delays, the keyframes, the counted numbers); that the rows glide is proven by scripts/browser/standings.mjs. rAF, timers and
// Date are fakes, `Element.prototype.animate` is a spy, and the page's motion setting is faked like coin-flip.test.ts does.

const POP = 'cubic-bezier(.34,1.56,.64,1)'
const SNAP = 'cubic-bezier(.2,0,0,1)'
const NOW = Date.parse('2026-11-02T20:00:00.000Z')
/** The Standings the page saw: Team 2 leads. */
const BEFORE = [standing(2, 1, 5), standing(1, 2, 3), standing(3, 3, 0)]
/** After Spiel 2 (Team 1 won): Team 1 moves up (+3), Team 2 down (+0), Team 3 keeps rank 3 (+1). */
const AFTER = [standing(1, 1, 6), standing(2, 2, 5), standing(3, 3, 1)]

const newsOf = (overrides: Partial<StandingsNews> = {}): StandingsNews => ({
  key: 1,
  kind: 'entered',
  roundId: 'r2',
  number: 2,
  before: BEFORE,
  winners: [1],
  at: Date.now(),
  announcement: 'Spiel 2 ist eingetragen.',
  ...overrides,
})

let animate: ReturnType<typeof vi.fn>
const originalAnimate = Element.prototype.animate

/** The page's motion setting, as the tokens put it in `--cp-motion`. */
function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
}

/** The animations started on elements that match `selector`: [keyframes, options] each. */
function animationsOn(selector: string) {
  return animate.mock.calls.flatMap((call, index) => ((animate.mock.contexts[index] as Element).matches(selector) ? [call as [Keyframe[], KeywordOptions]] : []))
}
type KeywordOptions = { duration: number, delay?: number, easing: string, fill?: string }

const digitsOf = (row: ReturnType<typeof rows>[number]) => cells(row)[2]!.get('.font-num [aria-hidden="true"]').text()
const column = () => rows().map(digitsOf)
const pills = () => page!.findAll('[data-delta]')
const stamps = () => page!.findAll('[data-stamp]')
const confettiPieces = () => page!.element.querySelectorAll('.layer-confetti span')

/** Lets `ms` of fake time pass in frames of 16 ms and returns the lists of numbers the points column showed on the way. */
async function run(ms: number): Promise<string[][]> {
  const seen: string[][] = []
  for (let spent = 0; spent < ms; spent += 16) {
    vi.advanceTimersByTime(16)
    await nextTick()
    seen.push(column())
  }
  return seen
}

/** The page reads a Result: new Standings and the news of it in one update, as the Event page hands them down. */
async function receives(news: StandingsNews | null, standings = AFTER) {
  await page!.setProps({ standings, news })
  await nextTick()
}

beforeEach(() => {
  animate = vi.fn(() => ({ currentTime: 0, cancel: vi.fn(), finish: vi.fn(), onfinish: null }))
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate
  motion('full')
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  Element.prototype.animate = originalAnimate
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Standings in motion (#276)', () => {
  const eightTeams = named(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])

  describe('without news', () => {
    it('shows no pill, no stamp and starts no count, also when the Standings change', async () => {
      await mount({ standings: BEFORE, celebrate: true, framed: true })

      await receives(null)

      expect(column()).toEqual(['6', '5', '1'])
      expect(pills()).toHaveLength(0)
      expect(stamps()).toHaveLength(0)
      expect(animate).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('the rows', () => {
    it('move by Vue\'s move transition: spring, the slower duration, staggered, and still on reduced motion', async () => {
      await mount({ standings: AFTER })

      // This proves what the group asks for, not that it glides: the browser check (scripts/browser/standings.mjs) does.
      const group = page!.findComponent({ name: 'TransitionGroup' })
      expect(group.props('tag')).toBe('tbody')
      const moveClass = String(group.props('moveClass')).split(' ')
      expect(moveClass).toEqual(expect.arrayContaining(['transition-transform', 'dur-slower', 'ease-spring', 'motion-reduce:transition-none', 'reduced:transition-none', '[transition-delay:var(--lb-delay,0ms)]']))
    })

    it('asks for no glide while the tab is hidden: the rows move at once and the glide does not start when the Member returns', async () => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      await mount({ standings: AFTER })

      expect(String(page!.findComponent({ name: 'TransitionGroup' }).props('moveClass') ?? '')).not.toContain('transition-transform')
    })

    it('carries the stagger of 0.04 s a row, by position in the new order', async () => {
      await mount({ standings: standingsOf([8, 7, 6, 5, 4, 3, 2, 1]), teams: eightTeams })

      expect(rows().map(row => (row.element as HTMLElement).style.getPropertyValue('--lb-delay'))).toEqual(['0ms', '40ms', '80ms', '120ms', '160ms', '200ms', '240ms', '280ms'])
    })

    it('keeps the table\'s roles with the group in the place of the tbody', async () => {
      await mount()

      expect(page!.find('table > tbody').exists()).toBe(true)
      expect(page!.findAll('table [role]')).toHaveLength(0)
      expect(rows().map(row => row.attributes('data-team'))).toEqual(['2', '1', '3'])
    })
  })

  describe('with news', () => {
    it('shows each Party\'s points gained in a pill left of the number, hidden from screen readers: +3, +0, +1', async () => {
      await mount({ standings: BEFORE })

      await receives(newsOf())

      expect(rows().map(row => row.attributes('data-team'))).toEqual(['1', '2', '3'])
      expect(rows().map(row => cells(row)[2]!.get('[data-delta]').text())).toEqual(['+3', '+0', '+1'])
      for (const pill of pills()) expect(pill.attributes('aria-hidden')).toBe('true')
      // Left of the number: the pill comes before it in the cell.
      const cell = cells(rows()[0]!)[2]!
      expect(cell.get('[data-delta]').element.compareDocumentPosition(cell.get('.font-num').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows a lowered score with a real minus after a Correction', async () => {
      await mount({ standings: [standing(1, 1, 6), standing(2, 2, 5)], teams: named(['A', 'B']) })

      await receives(newsOf({ kind: 'corrected', before: [standing(1, 1, 9), standing(2, 2, 5)] }), [standing(1, 1, 6), standing(2, 2, 5)])

      expect(pills().map(pill => pill.text())).toEqual(['−3', '+0'])
    })

    it('draws the rank move as an arrow: up in green, down on the surface, a dash when the rank is kept', async () => {
      await mount({ standings: BEFORE })

      await receives(newsOf())

      const [up, down, same] = pills()
      expect(up!.get('svg').classes()).toContain('lucide-arrow-up')
      expect(up!.classes()).toEqual(expect.arrayContaining(['bg-success', 'text-on-success']))
      expect(down!.get('svg').classes()).toContain('lucide-arrow-down')
      expect(down!.classes()).toEqual(expect.arrayContaining(['bg-surface', 'text-ink']))
      expect(same!.get('svg').classes()).toContain('lucide-minus')
      expect(same!.classes()).toEqual(expect.arrayContaining(['bg-paper-2', 'text-ink']))
    })

    it('pops each pill: scale .3, 1.15, 1 over 420 ms on the pop curve, after 300 ms', async () => {
      await mount({ standings: BEFORE })

      await receives(newsOf())

      const runs = animationsOn('[data-delta]')
      expect(runs).toHaveLength(3)
      for (const [keyframes, options] of runs) {
        expect(keyframes.map(frame => frame.transform)).toEqual(['scale(.3)', 'scale(1.15)', 'scale(1)'])
        expect(keyframes.map(frame => frame.offset)).toEqual([0, 0.6, 1])
        expect(options).toMatchObject({ duration: 420, delay: 300, easing: POP, fill: 'backwards' })
      }
    })

    it('counts every number from where the page saw it to the new points, and lands on them', async () => {
      await mount({ standings: BEFORE })

      await receives(newsOf())

      // Rows are Team 1, 2, 3: from 3, 5, 0 to 6, 5, 1.
      expect(column()).toEqual(['3', '5', '0'])
      const frames = await run(300)
      expect(Number(frames.at(-1)![0])).toBeGreaterThanOrEqual(5)
      expect(Number(frames.at(-1)![0])).toBeLessThan(6)
      expect(frames.at(-1)![1]).toBe('5')
      await run(500)
      expect(column()).toEqual(['6', '5', '1'])
    })

    it('writes a counting number at most 15 times in a second, and keeps the final value for screen readers from the start', async () => {
      const big = [standing(1, 1, 100), standing(2, 2, 5)]
      await mount({ standings: [standing(2, 1, 5), standing(1, 2, 0)], teams: named(['A', 'B']) })

      await receives(newsOf({ before: [standing(2, 1, 5), standing(1, 2, 0)] }), big)

      expect(rows()[0]!.get('.sr-only').text()).toBe('100 Punkte')
      const frames = await run(1000)
      const seen = frames.map(frame => frame[0]!).filter((value, index, all) => value !== all[index - 1])
      expect(seen.length).toBeLessThanOrEqual(15)
      expect(seen.at(-1)).toBe('100')
      expect(rows()[0]!.get('.sr-only').text()).toBe('100 Punkte')
    })

    it('restarts from the new `before` when a second news comes mid-count, and lands on the new value', async () => {
      await mount({ standings: BEFORE })
      await receives(newsOf())
      await run(300)

      const third = [standing(1, 1, 10), standing(2, 2, 5), standing(3, 3, 1)]
      await receives(newsOf({ key: 2, number: 3, before: AFTER, at: Date.now() }), third)

      expect(digitsOf(rows()[0]!)).toBe('6')
      await run(800)
      expect(column()).toEqual(['10', '5', '1'])
      expect(pills().map(pill => pill.text())).toEqual(['+4', '+0', '+0'])
    })

    it('counts a Party that was not in `before` from 0', async () => {
      await mount({ standings: BEFORE })

      await receives(newsOf({ before: [standing(2, 1, 5), standing(1, 2, 3)] }))

      expect(digitsOf(rows().find(row => row.attributes('data-team') === '3')!)).toBe('0')
      expect(pills().map(pill => pill.text())).toEqual(['+3', '+0', '+1'])
    })

    it('takes the pills away when the news is gone, and keeps the numbers on their final value', async () => {
      await mount({ standings: BEFORE })
      await receives(newsOf())
      await run(900)

      await receives(null)

      expect(pills()).toHaveLength(0)
      expect(column()).toEqual(['6', '5', '1'])
      await run(300)
      expect(column()).toEqual(['6', '5', '1'])
    })

    it('lets the pills leave with a short fade (the Transition of the end of the celebration)', async () => {
      await mount({ standings: BEFORE })
      await receives(newsOf())

      const leave = page!.findAllComponents({ name: 'Transition' }).filter(transition => transition.props('leaveActiveClass'))
      expect(leave.length).toBeGreaterThan(0)
      for (const transition of leave) {
        expect(String(transition.props('leaveActiveClass')).split(' ')).toEqual(expect.arrayContaining(['transition-opacity', 'dur-fast']))
        expect(transition.props('leaveToClass')).toBe('opacity-0')
      }
    })

    it('stays calm for a news the page made long ago (a tab opened later), and plays one it just made (the first Result)', async () => {
      await mount({ standings: AFTER, news: newsOf({ at: Date.now() - 1500 }) })

      expect(pills()).toHaveLength(0)
      expect(column()).toEqual(['6', '5', '1'])
      expect(animate).not.toHaveBeenCalled()
      page!.unmount()

      await mount({ standings: AFTER, news: newsOf({ at: Date.now() - 200 }) })

      expect(pills()).toHaveLength(3)
      expect(column()).toEqual(['3', '5', '0'])
    })

    it('plays a news once, however often it is handed down again', async () => {
      await mount({ standings: BEFORE })
      await receives(newsOf())
      const runs = animate.mock.calls.length

      await page!.setProps({ news: newsOf() })
      await nextTick()

      expect(animate.mock.calls.length).toBe(runs)
    })
  })

  describe('on the stage (celebrate)', () => {
    it('stamps the winner in the points cell: „Sieg in Spiel 2!“, rotated, snapping in after 520 ms over 480', async () => {
      await mount({ standings: BEFORE, celebrate: true, framed: true })

      await receives(newsOf())

      expect(stamps()).toHaveLength(1)
      expect(rows()[0]!.element.contains(stamps()[0]!.element)).toBe(true)
      expect(stamps()[0]!.text()).toBe('Sieg in Spiel 2!')
      expect(stamps()[0]!.attributes('aria-hidden')).toBe('true')
      expect((stamps()[0]!.element as HTMLElement).style.transform).toBe('rotate(8deg)')
      const [keyframes, options] = animationsOn('[data-stamp]')[0]!
      expect(keyframes.map(frame => frame.transform)).toEqual(['rotate(8deg) scale(2)', 'rotate(8deg) scale(.9)', 'rotate(8deg) scale(1)'])
      expect(keyframes.map(frame => frame.opacity)).toEqual([0, 1, 1])
      expect(keyframes[1]!.offset).toBe(0.7)
      expect(options).toMatchObject({ duration: 480, delay: 520, easing: SNAP, fill: 'backwards' })
    })

    it('draws the stamp with tokens: the yellow sticker, a border and ink that follow the Appearance (#406)', async () => {
      await mount({ standings: BEFORE, celebrate: true, framed: true })

      await receives(newsOf())

      expect(stamps()).toHaveLength(1)
      expect(stamps()[0]!.classes()).toEqual(expect.arrayContaining(['bg-primary', 'border-line', 'text-on-primary']))
    })

    it('says „Spiel 2 gewonnen“ for a Correction', async () => {
      await mount({ standings: BEFORE, celebrate: true, framed: true })

      await receives(newsOf({ kind: 'corrected' }))

      expect(stamps()[0]!.text()).toBe('Spiel 2 gewonnen')
    })

    it('bursts 18 pieces once, 560 ms after the news, from the right of the first winner\'s row', async () => {
      // jsdom has no layout: the card sits at (100, 50), Team 1's row spans 100…400 × 120…160.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.matches('tr[data-team="1"]')) return { left: 100, right: 400, top: 120, bottom: 160, width: 300, height: 40, x: 100, y: 120 } as DOMRect
        if (this.matches('section')) return { left: 100, right: 450, top: 50, bottom: 400, width: 350, height: 350, x: 100, y: 50 } as DOMRect
        return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect
      })
      await mount({ standings: BEFORE, celebrate: true, framed: true })
      await receives(newsOf())

      vi.advanceTimersByTime(559)
      expect(confettiPieces()).toHaveLength(0)
      vi.advanceTimersByTime(1)
      await nextTick()

      expect(confettiPieces()).toHaveLength(18)
      // x = row right (400) − 60 − card left (100) = 240; y = row centre (140) − card top (50) = 90. The first piece is a 12 px circle.
      const first = confettiPieces()[0] as HTMLElement
      expect(first.style.left).toBe('234px')
      expect(first.style.top).toBe('84px')
      vi.advanceTimersByTime(5000)
      expect(confettiPieces()).toHaveLength(18)
    })

    it('stamps both winners and still bursts once', async () => {
      await mount({ standings: BEFORE, celebrate: true, framed: true })

      await receives(newsOf({ winners: [1, 3] }))
      vi.advanceTimersByTime(600)
      await nextTick()

      expect(stamps()).toHaveLength(2)
      expect(rows().map(row => row.findAll('[data-stamp]').length)).toEqual([1, 0, 1])
      expect(confettiPieces()).toHaveLength(18)
    })

    it('has eight stamps and one burst when eight Parties are level', async () => {
      const level = Array.from({ length: 8 }, (_, index) => standing(index + 1, 1, 2))
      await mount({ standings: level.map(item => ({ ...item, points: 0 })), teams: eightTeams, celebrate: true, framed: true })

      await receives(newsOf({ before: level.map(item => ({ ...item, points: 0 })), winners: [1, 2, 3, 4, 5, 6, 7, 8] }), level)
      vi.advanceTimersByTime(600)
      await nextTick()

      expect(stamps()).toHaveLength(8)
      expect(confettiPieces()).toHaveLength(18)
    })

    it('has no stamp and no burst without `celebrate`: the panel and the phone view', async () => {
      await mount({ standings: BEFORE })

      await receives(newsOf())
      vi.advanceTimersByTime(600)
      await nextTick()

      expect(stamps()).toHaveLength(0)
      expect(page!.find('.layer-confetti').exists()).toBe(false)
      expect(pills()).toHaveLength(3)
    })

    it('takes the stamp away with the news', async () => {
      await mount({ standings: BEFORE, celebrate: true, framed: true })
      await receives(newsOf())

      await receives(null)

      expect(stamps()).toHaveLength(0)
    })

    it('gives the framed card room for the confetti layer to cover it', async () => {
      await mount({ framed: true, celebrate: true })

      expect(page!.get('section').classes()).toContain('relative')
    })

    it('stamps on the first Result: it mounts with the news it just made', async () => {
      await mount({ standings: AFTER, celebrate: true, framed: true, news: newsOf({ at: Date.now() }) })

      expect(stamps()).toHaveLength(1)
      vi.advanceTimersByTime(600)
      await nextTick()
      expect(confettiPieces()).toHaveLength(18)
    })
  })

  describe('under reduced motion', () => {
    beforeEach(() => {
      motion('reduced')
    })

    it('shows the final numbers at once, with no scale and no confetti, and fades the stamp in over 200 ms', async () => {
      await mount({ standings: BEFORE, celebrate: true, framed: true })

      await receives(newsOf())
      vi.advanceTimersByTime(600)
      await nextTick()

      expect(column()).toEqual(['6', '5', '1'])
      expect(confettiPieces()).toHaveLength(0)
      const everything = animate.mock.calls.flatMap(call => call[0] as Keyframe[])
      expect(everything.some(frame => String(frame.transform ?? '').includes('scale'))).toBe(false)
      const [stampFrames, stampOptions] = animationsOn('[data-stamp]')[0]!
      expect(stampFrames.map(frame => frame.opacity)).toEqual([0, 1])
      expect(stampOptions).toMatchObject({ duration: 200 })
      expect(stampOptions.delay ?? 0).toBe(0)
      expect((stamps()[0]!.element as HTMLElement).style.transform).toBe('rotate(8deg)')
      const [pillFrames, pillOptions] = animationsOn('[data-delta]')[0]!
      expect(pillFrames.map(frame => frame.opacity)).toEqual([0, 1])
      expect(pillOptions).toMatchObject({ duration: 200 })
    })

    it('highlights the rows that changed rank for 0.2 s, and no other', async () => {
      await mount({ standings: BEFORE })

      await receives(newsOf())

      const highlighted = (team: string) => animationsOn(`tr[data-team="${team}"] td`)
      expect(highlighted('1')).toHaveLength(3)
      expect(highlighted('2')).toHaveLength(3)
      expect(highlighted('3')).toHaveLength(0)
      for (const [keyframes, options] of highlighted('1')) {
        expect(options).toMatchObject({ duration: 200, easing: 'linear' })
        expect(keyframes.map(frame => frame.backgroundColor)).toEqual(['color-mix(in srgb, var(--cp-primary) 35%, var(--cp-surface))', 'var(--cp-surface)'])
      }
    })

    // `data-motion="reduced"` and the OS setting both reach the code through `--cp-motion` (compies-tokens.css), which `motion()` fakes.
  })

  it('does not highlight rows with full motion', async () => {
    await mount({ standings: BEFORE })

    await receives(newsOf())

    expect(animationsOn('td')).toHaveLength(0)
  })
})

// The stage block's table waits for its block (#442, `hold`): until the block has arrived on top it shows the Standings the page saw before the Result, and the sequence starts in the
// render that turns `hold` off. The panel's and the phone's tab never get `hold`, so they play at once (the cases above).
describe('a table that is held until its block has arrived (#442)', () => {
  /** After Spiel 3 (Team 1 won again): +3 for Team 1 on top of AFTER. */
  const AFTER_TWO = [standing(1, 1, 9), standing(2, 2, 5), standing(3, 3, 1)]
  const second = (overrides: Partial<StandingsNews> = {}) => newsOf({ key: 2, number: 3, before: AFTER, ...overrides })
  const ranks = () => rows().map(row => cells(row)[0]!.text())
  const teamsOf = () => rows().map(row => row.attributes('data-team'))

  /** A Result read while the block is still on its way: the news and the new Standings with `hold` on. */
  async function heldReceives(news: StandingsNews | null, standings = AFTER) {
    await page!.setProps({ standings, news, hold: true })
    await nextTick()
  }
  async function release() {
    await page!.setProps({ hold: false })
    await nextTick()
  }

  it('shows the Standings before the Result: their order, points and ranks, and nothing of the sequence', async () => {
    await mount({ standings: BEFORE, celebrate: true, framed: true })

    await heldReceives(newsOf())

    expect(teamsOf()).toEqual(['2', '1', '3'])
    expect(ranks()).toEqual(['1.', '2.', '3.'])
    expect(column()).toEqual(['5', '3', '0'])
    expect(pills()).toHaveLength(0)
    expect(stamps()).toHaveLength(0)
    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(confettiPieces()).toHaveLength(0)
    expect(animate).not.toHaveBeenCalled()
  })

  it('plays the sequence in the render that releases it: the pills, the new order, the count from before, the stamp and the confetti', async () => {
    await mount({ standings: BEFORE, celebrate: true, framed: true })
    await heldReceives(newsOf())

    await release()

    expect(teamsOf()).toEqual(['1', '2', '3'])
    expect(ranks()).toEqual(['1.', '2.', '3.'])
    expect(pills().map(pill => pill.text())).toEqual(['+3', '+0', '+1'])
    expect(animationsOn('[data-delta]')).toHaveLength(3)
    expect(animationsOn('[data-stamp]')).toHaveLength(1)
    expect(stamps()[0]!.text()).toBe('Sieg in Spiel 2!')
    // Rows are Team 1, 2, 3: the count starts from 3, 5, 0 and lands on 6, 5, 1.
    expect(column()).toEqual(['3', '5', '0'])
    await run(900)
    expect(column()).toEqual(['6', '5', '1'])
    vi.advanceTimersByTime(600)
    await nextTick()
    expect(confettiPieces()).toHaveLength(18)
  })

  it('plays at once without `hold`: the panel\'s tab and the phone\'s view do not wait', async () => {
    await mount({ standings: BEFORE, celebrate: true, framed: true })

    await receives(newsOf())

    expect(pills()).toHaveLength(3)
    expect(teamsOf()).toEqual(['1', '2', '3'])
  })

  it('stays calm for a news made long ago also with `hold`, and when the hold ends', async () => {
    await mount({ standings: AFTER, news: newsOf({ at: Date.now() - 1500 }), hold: true, celebrate: true })

    expect(column()).toEqual(['6', '5', '1'])
    expect(pills()).toHaveLength(0)

    await release()

    expect(pills()).toHaveLength(0)
    expect(column()).toEqual(['6', '5', '1'])
    expect(animate).not.toHaveBeenCalled()
  })

  it('holds the first Result too: every Party at 0 until the block has arrived, then it counts', async () => {
    const zero = [standing(2, 1, 0), standing(1, 1, 0), standing(3, 1, 0)]
    await mount({ standings: zero, end: end(0), celebrate: true, framed: true })

    await page!.setProps({ standings: AFTER, end: end(1), news: newsOf({ before: zero, number: 1, winners: [1] }), hold: true })
    await nextTick()

    expect(column()).toEqual(['0', '0', '0'])
    expect(page!.text()).toContain('Nach Spiel 1 von 6')
    await release()
    expect(column()).toEqual(['0', '0', '0'])
    await run(900)
    expect(column()).toEqual(['6', '5', '1'])
  })

  it('plays two Results read inside one wait as one sequence: from the table the viewer saw to the latest Result', async () => {
    await mount({ standings: BEFORE, celebrate: true, framed: true })
    await heldReceives(newsOf())

    await heldReceives(second(), AFTER_TWO)

    expect(column()).toEqual(['5', '3', '0'])
    await release()

    // One set of pills with both Results' gain, one stamp (the second's winner), counted from the first table.
    expect(pills().map(pill => pill.text())).toEqual(['+6', '+0', '+1'])
    expect(stamps()).toHaveLength(1)
    expect(stamps()[0]!.text()).toBe('Sieg in Spiel 3!')
    expect(column()).toEqual(['3', '5', '0'])
    await run(900)
    expect(column()).toEqual(['9', '5', '1'])
  })

  it('plays two Results in a row as two sequences: the second counts from the first\'s result', async () => {
    await mount({ standings: BEFORE, celebrate: true, framed: true })
    await receives(newsOf())
    await run(900)
    expect(pills()).toHaveLength(3)

    // The second Result is read while the block is on its way again: the pills of the first leave, the table on screen stays.
    await heldReceives(second(), AFTER_TWO)

    expect(pills()).toHaveLength(0)
    expect(column()).toEqual(['6', '5', '1'])
    expect(teamsOf()).toEqual(['1', '2', '3'])
    await release()

    expect(pills().map(pill => pill.text())).toEqual(['+3', '+0', '+0'])
    expect(column()).toEqual(['6', '5', '1'])
    await run(900)
    expect(column()).toEqual(['9', '5', '1'])
  })

  it('shows the new table when the news is gone while it is held, and `hold` with no news does nothing', async () => {
    await mount({ standings: BEFORE, celebrate: true, framed: true })
    await heldReceives(newsOf())
    expect(column()).toEqual(['5', '3', '0'])

    await heldReceives(null)

    expect(teamsOf()).toEqual(['1', '2', '3'])
    expect(column()).toEqual(['6', '5', '1'])
    await release()
    expect(pills()).toHaveLength(0)
    expect(animate).not.toHaveBeenCalled()

    await page!.setProps({ standings: AFTER_TWO, hold: true })
    await nextTick()
    expect(column()).toEqual(['9', '5', '1'])
  })

  it('draws a Party the news did not know last, at 0 and on its current rank, and leaves out one the Standings lack', async () => {
    await mount({ standings: [standing(2, 1, 5), standing(1, 2, 3)], end: end(2), celebrate: true })

    // Team 3 is new to the table; Team 2 is not in the Standings any more.
    await heldReceives(newsOf({ before: [standing(2, 1, 5), standing(1, 2, 3)] }), [standing(1, 1, 6), standing(3, 2, 1)])
    // The row that left is gone once its leave frame has run (the group's own transition, jsdom runs on the fake frames).
    await run(100)

    expect(teamsOf()).toEqual(['1', '3'])
    expect(ranks()).toEqual(['2.', '2.'])
    expect(column()).toEqual(['3', '0'])
    await release()
    expect(teamsOf()).toEqual(['1', '3'])
    expect(ranks()).toEqual(['1.', '2.'])
  })

  it('holds a table of two Parties and one of eight', async () => {
    await mount({ standings: [standing(2, 1, 4), standing(1, 2, 1)], teams: named(['A', 'B']), end: end(1) })
    await heldReceives(newsOf({ before: [standing(2, 1, 4), standing(1, 2, 1)], winners: [1] }), [standing(1, 1, 5), standing(2, 2, 4)])
    expect(teamsOf()).toEqual(['2', '1'])
    expect(column()).toEqual(['4', '1'])
    await release()
    expect(teamsOf()).toEqual(['1', '2'])
    page!.unmount()

    const eight = Array.from({ length: 8 }, (_, index) => standing(8 - index, index + 1, 8 - index))
    const later = Array.from({ length: 8 }, (_, index) => standing(index + 1, index + 1, 20 - index))
    await mount({ standings: eight, teams: named(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']), end: end(1) })
    await heldReceives(newsOf({ before: eight, winners: [1] }), later)
    expect(teamsOf()).toEqual(['8', '7', '6', '5', '4', '3', '2', '1'])
    expect(column()).toEqual(['8', '7', '6', '5', '4', '3', '2', '1'])
    await release()
    expect(teamsOf()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    expect(pills()).toHaveLength(8)
  })

  it('plays the reduced sequence after the hold: the final numbers at once, the 0.2 s fades, no confetti', async () => {
    motion('reduced')
    await mount({ standings: BEFORE, celebrate: true, framed: true })
    await heldReceives(newsOf())
    expect(column()).toEqual(['5', '3', '0'])
    expect(animate).not.toHaveBeenCalled()

    await release()
    vi.advanceTimersByTime(600)
    await nextTick()

    expect(column()).toEqual(['6', '5', '1'])
    expect(confettiPieces()).toHaveLength(0)
    expect(animationsOn('[data-stamp]')[0]![1]).toMatchObject({ duration: 200 })
    expect(animationsOn('[data-delta]')[0]![1]).toMatchObject({ duration: 200 })
  })
})
