import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import HowWePlayCard from '~/components/HowWePlayCard.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { EventPools } from '~~/shared/event'
import type { PoolGame } from '~~/shared/game'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, view, viewWithSessions } from './event-page'

// „So wird gespielt“ (#148): the settings of the Event for every Member, and the pools as names; under a Hidden
// wheel a Player sees nothing about them (#222).

function poolGame(name: string, overrides: Partial<PoolGame> = {}): PoolGame {
  return {
    id: `id-${name}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30,
    playersMin: null, playersMax: null, suitabilities: [], ...overrides,
  }
}

const wheel: EventSettings = { ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 3, gameCount: 6, teamCount: 4, teamSize: 2, pointsTable: { preset: 'linear', values: [3, 2, 1, 0] } }
const hiddenWheel: EventSettings = { ...wheel, hiddenWheel: true }

const visiblePools: EventPools = {
  hidden: false,
  main: [poolGame('Mario Kart'), poolGame('Pong')],
  tiebreaker: [poolGame('Schach')],
}

type Props = { settings: EventSettings | null, pools: EventPools, isHost?: boolean, editTo?: string | null, locked?: boolean, hostName?: string }
function mountCard({ isHost = false, ...props }: Props) {
  return mountSuspended(HowWePlayCard, { props: { isHost, ...props } })
}

describe('HowWePlayCard (#148)', () => {
  it('shows the settings as four rows: Format, Spiele, Auswahl and Punkte', async () => {
    const card = await mountCard({ settings: wheel, pools: visiblePools })

    expect(card.get('h2').text()).toBe('So wird gespielt')
    const rows = card.findAll('dl > div').map(row => [row.get('dt').text(), row.get('dd').text()])
    expect(rows).toEqual([
      ['Format', '4 Teams à 2'],
      ['Spiele', '6 Spiele'],
      ['Auswahl', 'Glücksrad, 3 Vetos pro Partei'],
      ['Punkte', 'Linear 3 / 2 / 1 / 0'],
    ])
  })

  it('names no Vetos for a Selection mode without the wheel', async () => {
    const card = await mountCard({ settings: { ...wheel, selectionMode: 'admin_pick', vetoAllowance: null }, pools: visiblePools })

    expect(card.findAll('dd').map(dd => dd.text())).toContain('Host-Wahl')
    expect(card.text()).not.toContain('Veto')
  })

  it('lists the games of both pools while the wheel is not hidden', async () => {
    const card = await mountCard({ settings: wheel, pools: visiblePools })

    const lists = card.findAll('ul')
    expect(lists).toHaveLength(2)
    expect(card.text()).toContain('Spielepool')
    expect(card.text()).toContain('Tiebreaker-Pool')
    expect(lists[0]!.findAll('li').map(li => li.text())).toEqual(['Mario Kart', 'Pong'])
    expect(lists[1]!.findAll('li').map(li => li.text())).toEqual(['Schach'])
    expect(card.text()).not.toContain('Das Rad ist verdeckt')
    expect(card.text()).not.toContain('verrät das Rad')
  })

  it('says „Noch keine Spiele.“ for an empty pool', async () => {
    const card = await mountCard({ settings: wheel, pools: { hidden: false, main: [poolGame('Pong')], tiebreaker: [] } })

    expect(card.findAll('ul')).toHaveLength(1)
    expect(card.text()).toContain('Noch keine Spiele.')
  })

  it('shows a Player nothing about the pools under a Hidden wheel: no count, no game, no note', async () => {
    const card = await mountCard({ settings: hiddenWheel, pools: { hidden: true } })

    expect(card.text()).toContain('Glücksrad (verdeckt)')
    expect(card.find('ul').exists()).toBe(false)
    expect(card.text()).not.toContain('Spielepool')
    expect(card.text()).not.toContain('Tiebreaker-Pool')
    expect(card.text()).not.toContain('verrät')
    expect(card.text()).not.toContain('Das Rad ist verdeckt')
  })

  it('shows the Host the games under a Hidden wheel, with the note that only they see them', async () => {
    const card = await mountCard({ settings: hiddenWheel, pools: visiblePools, isHost: true })

    expect(card.findAll('li').map(li => li.text())).toEqual(['Mario Kart', 'Pong', 'Schach'])
    expect(card.text()).toContain('Das Rad ist verdeckt: Die anderen sehen erst am Rad, wie viele Spiele drauf sind, und nur die Spiele, die gezogen werden.')
  })

  it('does not add the note for the Host while the wheel is visible', async () => {
    const card = await mountCard({ settings: wheel, pools: visiblePools, isHost: true })

    expect(card.text()).not.toContain('Das Rad ist verdeckt')
  })

  it('says what is missing without settings, to the Host and to a Member by name, and shows no rows and no pools', async () => {
    const pools: EventPools = { hidden: true }
    const host = await mountCard({ settings: null, pools, isHost: true })
    const member = await mountCard({ settings: null, pools, hostName: 'Sanne' })

    expect(host.get('h2').text()).toBe('So wird gespielt')
    expect(host.text()).toContain('Noch nicht festgelegt. Format, Spiele und Punkte legst du beim Einrichten fest.')
    expect(member.text()).toContain('Noch nicht festgelegt. Sanne legt gleich fest, wie gespielt wird.')
    expect(host.find('dl').exists()).toBe(false)
    expect(host.text()).not.toContain('Spielepool')
  })

  it('offers the Host Bearbeiten, before and after the first start, for as long as the settings can be edited', async () => {
    const before = await mountCard({ settings: wheel, pools: visiblePools, isHost: true, editTo: '/e/x/einstellungen' })
    const after = await mountCard({ settings: wheel, pools: visiblePools, isHost: true, editTo: '/e/x/einstellungen', locked: true })
    const finished = await mountCard({ settings: wheel, pools: visiblePools, isHost: true, locked: true })
    const member = await mountCard({ settings: wheel, pools: visiblePools })

    for (const card of [before, after]) {
      expect(card.get('a').text()).toBe('Bearbeiten')
      expect(card.get('a').attributes('href')).toBe('/e/x/einstellungen')
      // Plain underlined text: outline-memphis would draw a box around it.
      expect(card.get('a').classes()).not.toContain('outline-memphis')
    }
    expect(finished.find('a').exists()).toBe(false)
    expect(member.find('a').exists()).toBe(false)
  })

  // The settings that stay fixed once the first Session has started (LOCKED_WHEN_RUNNING) carry a lock on their row; the
  // header says nothing. Spiele can still change, so it has none.
  const lockedRows = (card: Awaited<ReturnType<typeof mountCard>>) => card.findAll('dl > div')
    .filter(row => row.find('[title="Fest seit dem Start"]').exists())
    .map(row => row.get('dt').text())

  it('marks Format, Auswahl and Punkte with a lock named „Fest seit dem Start“ after the first start, and Spiele with none', async () => {
    const host = await mountCard({ settings: wheel, pools: visiblePools, isHost: true, editTo: '/e/x/einstellungen', locked: true })

    expect(lockedRows(host)).toEqual(['Format', 'Auswahl', 'Punkte'])
    expect(host.findAll('[title="Fest seit dem Start"]')).toHaveLength(3)
    // The accessible name is text, not only the title.
    expect(host.findAll('dl > div')[0]!.text()).toContain('Fest seit dem Start')
    expect(host.findAll('dl > div')[1]!.text()).not.toContain('Fest seit dem Start')
    expect(host.get('h2').element.parentElement!.textContent).not.toContain('Fest seit dem Start')
  })

  it('shows Members the same locks, without Bearbeiten', async () => {
    const member = await mountCard({ settings: wheel, pools: visiblePools, locked: true })

    expect(lockedRows(member)).toEqual(['Format', 'Auswahl', 'Punkte'])
    expect(member.find('a').exists()).toBe(false)
  })

  it('shows no lock before the first start', async () => {
    const host = await mountCard({ settings: wheel, pools: visiblePools, isHost: true, editTo: '/e/x/einstellungen' })

    expect(lockedRows(host)).toEqual([])
    expect(host.text()).not.toContain('Fest seit dem Start')
  })
})

describe('the card on the Event page (#148)', () => {
  beforeEach(() => {
    signInAs(kitty)
  })

  it('sits beside the Sessions card, for a Member', async () => {
    const { slug } = serve(s => ({
      ...view(s, []),
      settings: wheel,
      pools: { hidden: true },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const text = page.text()
    expect(text).toContain('So wird gespielt')
    expect(text).not.toContain('Spielepool')
    expect(text.indexOf('Sessions')).toBeLessThan(text.indexOf('So wird gespielt'))
  })

  it('keeps Bearbeiten for the Host after the first start, next to the locks (#166)', async () => {
    const { slug } = serve(s => viewWithSessions(
      s,
      [{ startsAt: '2026-10-23T18:00:00.000Z', number: 1, startedAt: '2026-10-23T18:05:00.000Z', endedAt: '2026-10-23T20:00:00.000Z' }, { startsAt: '2026-10-30T18:00:00.000Z', number: 2 }],
      0,
      { event: { isHost: true, phase: 'running' }, settings: wheel, pools: visiblePools },
    ))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const section = page.findAll('section').find(candidate => candidate.find('h2')?.text() === 'So wird gespielt')!
    expect(section.findAll('a').map(link => link.text())).toContain('Bearbeiten')
    expect(section.findAll('[title="Fest seit dem Start"]')).toHaveLength(3)
  })
})
