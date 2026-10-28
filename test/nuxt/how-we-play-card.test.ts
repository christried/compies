import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import HowWePlayCard from '~/components/HowWePlayCard.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { EventPools, PoolGame } from '~~/shared/event'
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

type Props = { settings: EventSettings | null, pools: EventPools, isHost?: boolean }
function mountCard({ isHost = false, ...props }: Props) {
  return mountSuspended(HowWePlayCard, { props: { isHost, ...props } })
}

describe('HowWePlayCard (#148)', () => {
  it('shows the settings as the Fertig summary: sentence, Format, Spiele, Punkte, Modus, Vetos and the Pool row', async () => {
    const card = await mountCard({ settings: wheel, pools: visiblePools })

    expect(card.get('h2').text()).toBe('So wird gespielt')
    const text = card.text()
    expect(text).toContain('4 Teams à 2, Glücksrad, 6 Spiele.')
    for (const row of ['Format', 'Spiele', 'Punkte', 'Modus', 'Vetos', 'Pool']) expect(card.findAll('dt').map(dt => dt.text())).toContain(row)
    expect(text).toContain('Linear 3 / 2 / 1 / 0')
    expect(text).toContain('3 pro Partei')
    expect(text).toContain('2 Spiele, Tiebreaker 1')
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
    expect(card.text()).toContain('Das Rad ist verdeckt. Nur du siehst diese Spiele.')
  })

  it('does not add the note for the Host while the wheel is visible', async () => {
    const card = await mountCard({ settings: wheel, pools: visiblePools, isHost: true })

    expect(card.text()).not.toContain('Das Rad ist verdeckt')
  })

  it('says the Host has not set the Event up yet, without settings and without pools', async () => {
    const card = await mountCard({ settings: null, pools: { hidden: true, mainCount: 0, tiebreakerCount: 0 } })

    expect(card.get('h2').text()).toBe('So wird gespielt')
    expect(card.text()).toContain('Der Host hat das Event noch nicht eingerichtet.')
    expect(card.find('dl').exists()).toBe(false)
    expect(card.text()).not.toContain('Spielepool')
  })
})

describe('the card on the Event page (#148)', () => {
  beforeEach(() => {
    signInAs(kitty)
  })

  it('sits under the Sessions and above the Date poll, for a Member', async () => {
    const { slug } = serve(s => ({
      ...view(s, []),
      settings: wheel,
      pools: { hidden: true, mainCount: 2, tiebreakerCount: 1 },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const text = page.text()
    expect(text).toContain('So wird gespielt')
    expect(text).toContain('2 Spiele im Spielepool, 1 im Tiebreaker-Pool.')
    expect(text.indexOf('So wird gespielt')).toBeLessThan(text.indexOf('Wann zocken wir?'))
  })
})
