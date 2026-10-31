import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import HowWePlayCard from '~/components/HowWePlayCard.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { EventPools } from '~~/shared/event'
import type { PoolGame } from '~~/shared/game'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, view } from './event-page'

// „So wird gespielt“ (#148): the settings of the Event for every Member, and the pools as names or, under a
// Hidden wheel, as counts.

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

  it('shows only the counts under a Hidden wheel, and no game', async () => {
    const card = await mountCard({ settings: hiddenWheel, pools: { hidden: true, mainCount: 2, tiebreakerCount: 3 } })

    expect(card.text()).toContain('2 Spiele im Spielepool, 3 im Tiebreaker-Pool. Welche, verrät das Rad erst beim Drehen.')
    expect(card.text()).toContain('Glücksrad (verdeckt)')
    expect(card.find('ul').exists()).toBe(false)
    expect(card.text()).not.toContain('Das Rad ist verdeckt')
  })

  it('says „1 Spiel“ for a single game and counts an empty pool as 0', async () => {
    const card = await mountCard({ settings: hiddenWheel, pools: { hidden: true, mainCount: 1, tiebreakerCount: 0 } })

    expect(card.text()).toContain('1 Spiel im Spielepool, 0 im Tiebreaker-Pool.')
  })

  it('shows the Host the games under a Hidden wheel, with the note that only they see them', async () => {
    const card = await mountCard({ settings: hiddenWheel, pools: visiblePools, isHost: true })

    expect(card.findAll('li').map(li => li.text())).toEqual(['Mario Kart', 'Pong', 'Schach'])
    expect(card.text()).toContain('Das Rad ist verdeckt: Die anderen sehen nur, wie viele Spiele im Pool sind.')
  })

  it('does not add the note for the Host while the wheel is visible', async () => {
    const card = await mountCard({ settings: wheel, pools: visiblePools, isHost: true })

    expect(card.text()).not.toContain('Das Rad ist verdeckt')
  })

  it('says what is missing without settings, to the Host and to a Member by name, and shows no rows and no pools', async () => {
    const pools: EventPools = { hidden: true, mainCount: 0, tiebreakerCount: 0 }
    const host = await mountCard({ settings: null, pools, isHost: true })
    const member = await mountCard({ settings: null, pools, hostName: 'Sanne' })

    expect(host.get('h2').text()).toBe('So wird gespielt')
    expect(host.text()).toContain('Noch nicht festgelegt. Format, Spiele und Punkte legst du beim Einrichten fest.')
    expect(member.text()).toContain('Noch nicht festgelegt. Sanne legt gleich fest, wie gespielt wird.')
    expect(host.find('dl').exists()).toBe(false)
    expect(host.text()).not.toContain('Spielepool')
  })

  it('offers the Host Bearbeiten until the first Session starts, and a lock with „Fest seit dem Start“ afterwards', async () => {
    const editable = await mountCard({ settings: wheel, pools: visiblePools, isHost: true, editTo: '/e/x/einstellungen' })
    const locked = await mountCard({ settings: wheel, pools: visiblePools, isHost: true, locked: true })
    const member = await mountCard({ settings: wheel, pools: visiblePools })

    expect(editable.get('a').text()).toBe('Bearbeiten')
    expect(editable.get('a').attributes('href')).toBe('/e/x/einstellungen')
    // Plain underlined text: outline-memphis would draw a box around it.
    expect(editable.get('a').classes()).not.toContain('outline-memphis')
    expect(editable.text()).not.toContain('Fest seit dem Start')
    expect(locked.find('a').exists()).toBe(false)
    expect(locked.text()).toContain('Fest seit dem Start')
    expect(member.find('a').exists()).toBe(false)
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
      pools: { hidden: true, mainCount: 2, tiebreakerCount: 1 },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const text = page.text()
    expect(text).toContain('So wird gespielt')
    expect(text).toContain('2 Spiele im Spielepool, 1 im Tiebreaker-Pool.')
    expect(text.indexOf('Sessions')).toBeLessThan(text.indexOf('So wird gespielt'))
  })
})
