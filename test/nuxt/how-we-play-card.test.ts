import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import HowWePlayCard from '~/components/HowWePlayCard.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { EventPools } from '~~/shared/event'
import type { PoolGame, PoolGameFace } from '~~/shared/game'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, view, viewWithSessions } from './event-page'

// „So wird gespielt“ (#148): the settings of the Event for every Member, and the pools as names; under a Hidden
// wheel a Player sees nothing about them (#222).

function poolGame(name: string, overrides: Partial<PoolGame> = {}): PoolGame {
  return {
    id: `id-${name}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30,
    playersMin: null, playersMax: null, suitabilities: [], notes: null, ...overrides,
  }
}

// What the server gives a Member who may see the pools (#224): picture and name, no more.
function faceOf(game: PoolGame): PoolGameFace {
  return { id: game.id, name: game.name, imageUrl: game.imageUrl, youtubeId: game.youtubeId }
}

const wheel: EventSettings = { ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 3, gameCount: 6, teamCount: 4, teamSize: 2, pointsTable: { preset: 'linear', values: [3, 2, 1, 0] } }
const hiddenWheel: EventSettings = { ...wheel, hiddenWheel: true }

const visiblePools: EventPools = {
  main: [poolGame('Mario Kart'), poolGame('Pong')],
  tiebreaker: [poolGame('Schach')],
}

type Props = { settings: EventSettings | null, pools: EventPools | null, isHost?: boolean, editTo?: string | null, locked?: boolean, hostName?: string }
function mountCard({ isHost = false, ...props }: Props) {
  return mountSuspended(HowWePlayCard, { props: { isHost, ...props } })
}

describe('HowWePlayCard (#148)', () => {
  it('shows the settings as rows: Format, Spiele, Auswahl, Vetos with the Lucky Wheel, and Punkte', async () => {
    const card = await mountCard({ settings: wheel, pools: visiblePools })

    expect(card.get('h2').text()).toBe('So wird gespielt')
    const rows = card.findAll('dl > div').map(row => [row.get('dt').text(), row.get('dd').text()])
    expect(rows).toEqual([
      ['Format', '4 Teams à 2'],
      ['Spiele', '6 Spiele'],
      ['Auswahl', 'Glücksrad'],
      ['Vetos', '3 pro Partei'],
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

  it('gives the Host a pool game with notes one Notizen disclosure below its card, and none without notes (#224)', async () => {
    const card = await mountCard({
      settings: wheel,
      isHost: true,
      pools: { main: [poolGame('Mario Kart', { notes: 'Settings: 3 Runden' }), poolGame('Pong')], tiebreaker: [] },
    })

    const [withNotes, withoutNotes] = card.findAll('ul')[0]!.findAll('li')
    expect(withNotes!.findAll('button').map(button => button.text())).toEqual(['Notizen'])
    expect(withoutNotes!.find('button').exists()).toBe(false)
    expect(withoutNotes!.text()).not.toContain('Notizen')
  })

  it('gives the Host a game in both pools one Notizen disclosure per list, each with its own panel (#224)', async () => {
    const kart = poolGame('Mario Kart', { notes: 'Settings: 3 Runden' })
    const card = await mountCard({ settings: wheel, isHost: true, pools: { main: [kart], tiebreaker: [kart] } })

    const buttons = card.findAll('button').filter(button => button.text() === 'Notizen')
    expect(buttons).toHaveLength(2)
    // A closed disclosure controls no panel (aria-controls only while open).
    for (const button of buttons) await button.trigger('click')
    expect(buttons[0]!.attributes('aria-controls')).not.toBe(buttons[1]!.attributes('aria-controls'))
  })

  it('shows a Member of a visible pool picture and name of each game, and no player count, Suitabilities or Notizen (#224)', async () => {
    const kart = poolGame('Mario Kart', { imageUrl: '/api/images/kart.webp', playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: 'Settings: 3 Runden' })
    const pong = poolGame('Pong', { youtubeId: 'dQw4w9WgXcQ' })
    const card = await mountCard({ settings: wheel, pools: { main: [faceOf(kart), faceOf(pong)], tiebreaker: [faceOf(kart)] } })

    const [first, second] = card.findAll('ul')[0]!.findAll('li')
    expect(first!.text()).toBe('Mario Kart')
    expect(first!.get('img').attributes('src')).toBe('/api/images/kart.webp')
    expect(second!.text()).toBe('Pong')
    expect(second!.get('img').attributes('src')).toContain('dQw4w9WgXcQ')
    expect(card.findAll('ul').map(list => list.text()).join(' ')).not.toMatch(/Notizen|2–4|Teams/)
    expect(card.findAll('button')).toHaveLength(0)
  })

  it('shows the Host the player count and Suitabilities of a pool game next to its Notizen (#224)', async () => {
    const kart = poolGame('Mario Kart', { playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: 'Settings: 3 Runden' })
    const card = await mountCard({ settings: wheel, isHost: true, pools: { main: [kart], tiebreaker: [] } })

    expect(card.get('li').text()).toContain('2–4')
    expect(card.get('li').text()).toContain('Teams')
    expect(card.get('li').text()).toContain('Notizen')
  })

  it('says „Noch keine Spiele.“ for an empty pool', async () => {
    const card = await mountCard({ settings: wheel, pools: { main: [poolGame('Pong')], tiebreaker: [] } })

    expect(card.findAll('ul')).toHaveLength(1)
    expect(card.text()).toContain('Noch keine Spiele.')
  })

  it('shows a Player nothing about the pools under a Hidden wheel: no count, no game, no note', async () => {
    const card = await mountCard({ settings: hiddenWheel, pools: null })

    expect(card.text()).toContain('Glücksrad (verdeckt)')
    expect(card.find('ul').exists()).toBe(false)
    expect(card.text()).not.toContain('Spielepool')
    expect(card.text()).not.toContain('Tiebreaker-Pool')
    expect(card.text()).not.toContain('verrät')
    expect(card.text()).not.toContain('Das Rad ist verdeckt')
  })

  // The Auswahl row (#225): the four cases of the Selection mode, the Hidden wheel and the Pool preview.
  const auswahl = (card: Awaited<ReturnType<typeof mountCard>>) => card.findAll('dl > div').find(row => row.get('dt').text() === 'Auswahl')!.get('dd').text()

  it.each([
    ['a visible wheel with the Pool preview', wheel, 'Glücksrad'],
    ['a Hidden wheel', hiddenWheel, 'Glücksrad (verdeckt)'],
    ['a visible wheel with the Pool preview off', { ...wheel, poolPreview: false }, 'Glücksrad, Spiele erst am Rad'],
    ['Host pick with the Pool preview off', { ...defaultSettings(), poolPreview: false }, 'Host-Wahl, Spiele erst beim Setzen'],
    ['Host pick with the Pool preview', defaultSettings(), 'Host-Wahl'],
  ])('reads the Auswahl row for %s', async (_name, settings, expected) => {
    const card = await mountCard({ settings, pools: null })

    expect(auswahl(card)).toBe(expected)
  })

  it('shows a Member no pool list and no number with the Pool preview off', async () => {
    const card = await mountCard({ settings: { ...wheel, poolPreview: false }, pools: null })

    expect(card.find('ul').exists()).toBe(false)
    expect(card.findAll('h3')).toHaveLength(0)
    expect(card.text()).not.toMatch(/Spielepool|Tiebreaker|Noch keine Spiele/)
    expect(card.text()).not.toContain('Pool vorher zeigen')
  })

  describe('the Host notice with the Pool preview off (#225)', () => {
    it('says the others see the games only at the wheel, with the Lucky Wheel, and the Host keeps both pools', async () => {
      const card = await mountCard({ settings: { ...wheel, poolPreview: false }, pools: visiblePools, isHost: true })

      expect(card.text()).toContain('Pool vorher zeigen ist aus: Die anderen sehen die Spiele erst am Rad.')
      expect(card.text()).toContain('Nur du siehst das')
      expect(card.findAll('li').map(li => li.text())).toEqual(['Mario Kart', 'Pong', 'Schach'])
    })

    it('says the others see the games only once the Host sets them, with Host pick', async () => {
      const card = await mountCard({ settings: { ...defaultSettings(), poolPreview: false }, pools: visiblePools, isHost: true })

      expect(card.text()).toContain('Pool vorher zeigen ist aus: Die anderen sehen die Spiele erst, wenn du sie setzt.')
      expect(card.text()).not.toContain('am Rad')
    })

    it('is not shown to a Member, with the Pool preview on, or instead of the Hidden wheel notice', async () => {
      const member = await mountCard({ settings: { ...wheel, poolPreview: false }, pools: null })
      const previewOn = await mountCard({ settings: wheel, pools: visiblePools, isHost: true })
      const hidden = await mountCard({ settings: hiddenWheel, pools: visiblePools, isHost: true })

      expect(member.text()).not.toContain('Pool vorher zeigen')
      expect(previewOn.text()).not.toContain('Pool vorher zeigen')
      expect(hidden.text()).toContain('Das Rad ist verdeckt')
      expect(hidden.text()).not.toContain('Pool vorher zeigen')
    })
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
    const pools = null as EventPools | null
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
  // header says nothing. Spiele and Vetos can still change, so they have none.
  const lockedRows = (card: Awaited<ReturnType<typeof mountCard>>) => card.findAll('dl > div')
    .filter(row => row.find('[title="Fest seit dem Start"]').exists())
    .map(row => row.get('dt').text())

  it('marks Format, Auswahl and Punkte with a lock named „Fest seit dem Start“ after the first start, with none on Spiele and Vetos', async () => {
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
      pools: null,
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
