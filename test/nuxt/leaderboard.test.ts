import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import Leaderboard from '~/components/Leaderboard.vue'
import type { BoardTeam } from '~~/shared/event'
import type { EndView, StandingView } from '~~/shared/stage'
import { standingsOf } from '~~/shared/results'

// The Standings (#274, GLOSSARY: Standings; 03-screens 17, the calm state): a real table with a visually hidden head, one row per Party in the
// order the Event read gives (the component sorts and ranks nothing), a shared rank printed twice, and the points read out with their noun.

const named = (names: (string | null)[]): BoardTeam[] => names.map((name, index) => ({ position: index + 1, name, frozen: name !== null }))
const three = named(['Wilde Gurken', 'Die Füchse', null])
const end = (played: number, gameCount = 6): EndView => ({ played, gameCount, complete: played >= gameCount, tie: null, finish: null })
const standing = (team: number, rank: number, points: number): StandingView => ({ team, rank, points })

type Props = { standings?: StandingView[], end?: EndView, teams?: BoardTeam[], framed?: boolean }
let page: VueWrapper | undefined

async function mount(props: Props = {}) {
  page = await mountSuspended(Leaderboard, { props: { standings: [standing(2, 1, 8), standing(1, 2, 3), standing(3, 3, 1)], end: end(3), teams: three, ...props } })
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
    expect(page!.text()).toContain('Nach Spiel 0 von 6')
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

  it('has no live region and no motion class on the rows', async () => {
    await mount()

    expect(page!.find('[aria-live]').exists()).toBe(false)
    expect(page!.find('[role="status"]').exists()).toBe(false)
    expect(page!.html()).not.toMatch(/transition|animate-/)
  })
})
