import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import HowWePlayCard from '~/components/HowWePlayCard.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { EventView } from '~~/shared/event'
import { GAME_NAME_MAX, type PoolGame, type PoolGameFace } from '~~/shared/game'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, view, viewWithSessions } from './event-page'

// „So wird gespielt“ (#148): the settings of the Event for every Member, and the pool as names; under a Hidden
// wheel a Player sees nothing about them (#222).

function poolGame(name: string, overrides: Partial<PoolGame> = {}): PoolGame {
  return {
    id: `id-${name}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30,
    playersMin: null, playersMax: null, suitabilities: [], notes: null, price: null, ...overrides,
  }
}

// What the server gives a Member who may see the pools (#224, #338, #444): picture, name, players, Suitabilities and Price, no more.
function faceOf(game: PoolGame): PoolGameFace {
  return { id: game.id, name: game.name, imageUrl: game.imageUrl, youtubeId: game.youtubeId, price: game.price, playersMin: game.playersMin, playersMax: game.playersMax, suitabilities: game.suitabilities }
}

const wheel: EventSettings = { ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 3, gameCount: 6, teamCount: 4, teamSize: 2, pointsTable: { preset: 'linear', values: [3, 2, 1, 0] } }
const hiddenWheel: EventSettings = { ...wheel, hiddenWheel: true }

const visiblePool: EventView['pool'] = [poolGame('Mario Kart'), poolGame('Pong')]

type Props = { settings: EventSettings | null, pool: EventView['pool'], isHost?: boolean, editTo?: string | null, locked?: boolean, hostName?: string, hostGames?: EventView['hostGames'] }
function mountCard({ isHost = false, ...props }: Props) {
  return mountSuspended(HowWePlayCard, { props: { isHost, ...props } })
}

describe('HowWePlayCard (#148)', () => {
  it('shows the settings as rows: Format, Spiele, Auswahl, Vetos with the Lucky Wheel, and Punkte', async () => {
    const card = await mountCard({ settings: wheel, pool: visiblePool })

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
    const card = await mountCard({ settings: { ...wheel, selectionMode: 'admin_pick', vetoAllowance: null }, pool: visiblePool })

    expect(card.findAll('dd').map(dd => dd.text())).toContain('Host-Wahl')
    expect(card.text()).not.toContain('Veto')
  })

  it('lists the games of the Game pool it is given, and no Tiebreaker pool (#279)', async () => {
    const card = await mountCard({ settings: wheel, pool: visiblePool })

    const lists = card.findAll('ul')
    expect(lists).toHaveLength(1)
    expect(card.text()).toContain('Spielepool')
    expect(card.text()).not.toContain('Tiebreaker-Pool')
    expect(lists[0]!.findAll('li').map(li => li.text())).toEqual(['Mario Kart', 'Pong'])
    expect(card.text()).not.toContain('Das Rad ist verdeckt')
    expect(card.text()).not.toContain('verrät das Rad')
  })

  it('shows the Host the pool as tiles of picture and name, and no Notizen under a game with notes (#435)', async () => {
    const card = await mountCard({
      settings: wheel,
      isHost: true,
      pool: [poolGame('Mario Kart', { notes: 'Settings: 3 Runden' }), poolGame('Pong')],
    })

    const [withNotes, withoutNotes] = card.findAll('ul')[0]!.findAll('li')
    expect(withNotes!.text()).toBe('Mario Kart')
    expect(withoutNotes!.text()).toBe('Pong')
    // The Host's tile is the button that opens the game dialog (#443); the Notes are in the dialog, not on the page.
    expect(card.findAll('button').map(button => button.text())).toEqual(['Mario Kart', 'Pong'])
    expect(card.text()).not.toContain('Notizen')
    expect(card.text()).not.toContain('Settings: 3 Runden')
  })

  it('lays the pool out as a grid of tiles, side by side as the container allows, for the Host and a Member (#435)', async () => {
    const games = Array.from({ length: 30 }, (_, n) => poolGame(`Spiel ${n + 1}`))
    const host = await mountCard({ settings: wheel, isHost: true, pool: games })
    const hostList = host.findAll('ul')[0]!
    expect(hostList.classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-[repeat(auto-fill,minmax(142px,1fr))]', 'gap-3']))
    expect(hostList.findAll('li')).toHaveLength(30)
    host.unmount()

    const member = await mountCard({ settings: wheel, pool: games.map(faceOf) })
    expect(member.findAll('ul')[0]!.classes()).toContain('grid-cols-[repeat(auto-fill,minmax(142px,1fr))]')
    expect(member.findAll('ul')[0]!.findAll('li')).toHaveLength(30)
  })

  it('shows a Member of a visible pool picture and name of each game, and no player count, Suitabilities or Notizen (#224)', async () => {
    const kart = poolGame('Mario Kart', { imageUrl: '/api/images/kart.webp', playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: 'Settings: 3 Runden' })
    const pong = poolGame('Pong', { youtubeId: 'dQw4w9WgXcQ' })
    const card = await mountCard({ settings: wheel, pool: [faceOf(kart), faceOf(pong)] })

    const [first, second] = card.findAll('ul')[0]!.findAll('li')
    expect(first!.text()).toBe('Mario Kart')
    expect(first!.get('img').attributes('src')).toBe('/api/images/kart.webp')
    expect(second!.text()).toBe('Pong')
    expect(second!.get('img').attributes('src')).toContain('dQw4w9WgXcQ')
    expect(card.findAll('ul').map(list => list.text()).join(' ')).not.toMatch(/Notizen|2–4|Teams/)
    // The tiles are buttons that open the dialog (#444); the facts are in the dialog, not on the tile.
    expect(card.findAll('button').map(button => button.text())).toEqual(['Mario Kart', 'Pong'])
  })

  it('shows the Host a pool game as a tile: no player count and no Suitabilities, as for a Member (#435)', async () => {
    const kart = poolGame('Mario Kart', { playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: 'Settings: 3 Runden' })
    const card = await mountCard({ settings: wheel, isHost: true, pool: [kart] })

    expect(card.get('li').text()).toBe('Mario Kart')
  })

  it('says „Noch keine Spiele.“ for an empty pool', async () => {
    const card = await mountCard({ settings: wheel, pool: [] })

    expect(card.findAll('ul')).toHaveLength(0)
    expect(card.text()).toContain('Noch keine Spiele.')
  })

  it('shows a Player nothing about the pools under a Hidden wheel: no count, no game, no note', async () => {
    const card = await mountCard({ settings: hiddenWheel, pool: null })

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
    const card = await mountCard({ settings, pool: null })

    expect(auswahl(card)).toBe(expected)
  })

  it('shows a Member no pool list and no number with the Pool preview off', async () => {
    const card = await mountCard({ settings: { ...wheel, poolPreview: false }, pool: null })

    expect(card.find('ul').exists()).toBe(false)
    expect(card.findAll('h3')).toHaveLength(0)
    expect(card.text()).not.toMatch(/Spielepool|Tiebreaker|Noch keine Spiele/)
    expect(card.text()).not.toContain('Pool vorher zeigen')
  })

  describe('the Host notice with the Pool preview off (#225)', () => {
    it('says the others see the games only at the wheel, with the Lucky Wheel, and the Host keeps both pools', async () => {
      const card = await mountCard({ settings: { ...wheel, poolPreview: false }, pool: visiblePool, isHost: true })

      expect(card.text()).toContain('Pool vorher zeigen ist aus: Die anderen sehen die Spiele erst am Rad.')
      expect(card.text()).toContain('Nur du siehst das')
      expect(card.findAll('li').map(li => li.text())).toEqual(['Mario Kart', 'Pong'])
    })

    it('says the others see the games only once the Host sets them, with Host pick', async () => {
      const card = await mountCard({ settings: { ...defaultSettings(), poolPreview: false }, pool: visiblePool, isHost: true })

      expect(card.text()).toContain('Pool vorher zeigen ist aus: Die anderen sehen die Spiele erst, wenn du sie setzt.')
      expect(card.text()).not.toContain('am Rad')
    })

    it('is not shown to a Member, with the Pool preview on, or instead of the Hidden wheel notice', async () => {
      const member = await mountCard({ settings: { ...wheel, poolPreview: false }, pool: null })
      const previewOn = await mountCard({ settings: wheel, pool: visiblePool, isHost: true })
      const hidden = await mountCard({ settings: hiddenWheel, pool: visiblePool, isHost: true })

      expect(member.text()).not.toContain('Pool vorher zeigen')
      expect(previewOn.text()).not.toContain('Pool vorher zeigen')
      expect(hidden.text()).toContain('Das Rad ist verdeckt')
      expect(hidden.text()).not.toContain('Pool vorher zeigen')
    })
  })

  it('shows the Host the games under a Hidden wheel, with the note that only they see them', async () => {
    const card = await mountCard({ settings: hiddenWheel, pool: visiblePool, isHost: true })

    expect(card.findAll('li').map(li => li.text())).toEqual(['Mario Kart', 'Pong'])
    expect(card.text()).toContain('Das Rad ist verdeckt: Die anderen sehen erst am Rad, wie viele Spiele drauf sind, und nur die Spiele, die gezogen werden.')
  })

  it('does not add the note for the Host while the wheel is visible', async () => {
    const card = await mountCard({ settings: wheel, pool: visiblePool, isHost: true })

    expect(card.text()).not.toContain('Das Rad ist verdeckt')
  })

  it('says what is missing without settings, to the Host and to a Member by name, and shows no rows and no pools', async () => {
    const pool = null as EventView['pool']
    const host = await mountCard({ settings: null, pool, isHost: true })
    const member = await mountCard({ settings: null, pool, hostName: 'Sanne' })

    expect(host.get('h2').text()).toBe('So wird gespielt')
    expect(host.text()).toContain('Noch nicht festgelegt. Format, Spiele und Punkte legst du beim Einrichten fest.')
    expect(member.text()).toContain('Noch nicht festgelegt. Sanne legt gleich fest, wie gespielt wird.')
    expect(host.find('dl').exists()).toBe(false)
    expect(host.text()).not.toContain('Spielepool')
  })

  it('offers the Host Bearbeiten, before and after the first start, for as long as the settings can be edited', async () => {
    const before = await mountCard({ settings: wheel, pool: visiblePool, isHost: true, editTo: '/e/x/einstellungen' })
    const after = await mountCard({ settings: wheel, pool: visiblePool, isHost: true, editTo: '/e/x/einstellungen', locked: true })
    const finished = await mountCard({ settings: wheel, pool: visiblePool, isHost: true, locked: true })
    const member = await mountCard({ settings: wheel, pool: visiblePool })

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
    const host = await mountCard({ settings: wheel, pool: visiblePool, isHost: true, editTo: '/e/x/einstellungen', locked: true })

    expect(lockedRows(host)).toEqual(['Format', 'Auswahl', 'Punkte'])
    expect(host.findAll('[title="Fest seit dem Start"]')).toHaveLength(3)
    // The accessible name is text, not only the title.
    expect(host.findAll('dl > div')[0]!.text()).toContain('Fest seit dem Start')
    expect(host.findAll('dl > div')[1]!.text()).not.toContain('Fest seit dem Start')
    expect(host.get('h2').element.parentElement!.textContent).not.toContain('Fest seit dem Start')
  })

  it('shows Members the same locks, without Bearbeiten', async () => {
    const member = await mountCard({ settings: wheel, pool: visiblePool, locked: true })

    expect(lockedRows(member)).toEqual(['Format', 'Auswahl', 'Punkte'])
    expect(member.find('a').exists()).toBe(false)
  })

  it('shows no lock before the first start', async () => {
    const host = await mountCard({ settings: wheel, pool: visiblePool, isHost: true, editTo: '/e/x/einstellungen' })

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
      pool: null,
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
      { event: { isHost: true, phase: 'running' }, settings: wheel, pool: visiblePool },
    ))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const section = page.findAll('section').find(candidate => candidate.find('h2')?.text() === 'So wird gespielt')!
    expect(section.findAll('a').map(link => link.text())).toContain('Bearbeiten')
    expect(section.findAll('[title="Fest seit dem Start"]')).toHaveLength(3)
  })
})

describe('the pool tile carries no Price (#435)', () => {
  const steam = { cents: 1999, source: 'steam' as const, checkedAt: '2026-11-03T10:00:00.000Z' }

  it('shows the Host no Price line under a pool tile, though the game has a Price', async () => {
    const card = await mountCard({ settings: wheel, isHost: true, pool: [poolGame('Mario Kart', { price: steam }), poolGame('Pong')] })

    const [withPrice, withoutPrice] = card.findAll('ul')[0]!.findAll('li')
    expect(withPrice!.text()).toBe('Mario Kart')
    expect(withoutPrice!.text()).toBe('Pong')
    expect(card.text()).not.toContain('€')
    expect(card.text()).not.toContain('Stand')
  })

  it('shows a Member no Price line under a pool tile, and no count or Notizen with it', async () => {
    const kart = poolGame('Mario Kart', { price: steam, playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: 'Settings: 3 Runden' })
    const card = await mountCard({ settings: wheel, pool: [faceOf(kart), faceOf(poolGame('Pong'))] })

    const [first, second] = card.findAll('ul')[0]!.findAll('li')
    expect(first!.text()).toBe('Mario Kart')
    expect(second!.text()).toBe('Pong')
    expect(card.text()).not.toContain('€')
    expect(card.text()).not.toContain('Stand')
  })

  it('shows no Free-to-play or Abo line under a tile for a game with no amount', async () => {
    const free = poolGame('Tetris', { price: { cents: null, source: 'free_to_play', checkedAt: steam.checkedAt } })
    const abo = poolGame('Plattformer', { price: { cents: null, source: 'subscription', checkedAt: steam.checkedAt } })
    const card = await mountCard({ settings: wheel, pool: [faceOf(free), faceOf(abo)] })

    const [tetris, plattformer] = card.findAll('ul')[0]!.findAll('li')
    expect(tetris!.text()).toBe('Tetris')
    expect(plattformer!.text()).toBe('Plattformer')
    expect(card.text()).not.toContain('Free-to-play')
    expect(card.text()).not.toContain('Abo')
    expect(card.text()).not.toContain('Stand')
  })

  it('shows the tile of a game with the longest name and the longest Price as the name alone, the name wrapping at two lines', async () => {
    const longName = 'M'.repeat(GAME_NAME_MAX)
    const longPrice = { cents: 99999, source: 'epic' as const, checkedAt: '2025-11-03T10:00:00.000Z' }
    const card = await mountCard({ settings: wheel, pool: [faceOf(poolGame(longName, { price: longPrice }))] })

    const item = card.get('li')
    expect(item.text()).toBe(longName)
    expect(item.get('button').classes()).toContain('break-words')
    expect(item.get('button').classes()).toContain('line-clamp-2')
    expect(card.text()).not.toContain('€')
  })

  it('shows one tile for a pool of exactly one game, with no Price line; the empty pool says „Noch keine Spiele.“', async () => {
    const single = await mountCard({ settings: wheel, pool: [faceOf(poolGame('Mario Kart', { price: steam }))] })
    expect(single.findAll('li')).toHaveLength(1)
    expect(single.get('li').text()).toBe('Mario Kart')

    const empty = await mountCard({ settings: wheel, pool: [] })
    expect(empty.text()).toContain('Noch keine Spiele.')
    expect(empty.text()).not.toContain('Stand')
  })
})

// The Host's game dialog from the pool (#443): a tap on a tile opens the dialog with the Tags and Notes of that game from `hostGames`; a Member's dialog (#444) has the facts and never those.
describe('the game dialog from the pool tiles (#443)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    signInAs({ ...kitty, canHost: true })
  })

  const hostGames = {
    'id-Mario Kart': { tags: [{ key: 'retro', label: 'Retro' }, { key: 'koop', label: 'Koop' }], notes: 'Settings: 3 Runden' },
    'id-Pong': { tags: [{ key: 'klassiker', label: 'Klassiker' }], notes: null },
  }
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement

  it('opens the dialog of the tapped game with its Tags and Notes, for a pool of one game and for a pool of two', async () => {
    const one = await mountCard({ settings: wheel, isHost: true, pool: [poolGame('Mario Kart', { playersMin: 2, playersMax: 4 })], hostGames })
    expect(one.findAll('button')).toHaveLength(1)
    await one.get('button').trigger('click')
    await flushPromises()
    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
    expect(dialog().textContent).toContain('Retro')
    expect(dialog().textContent).toContain('Koop')
    expect(dialog().textContent).toContain('Settings: 3 Runden')
    one.unmount()
    document.body.innerHTML = ''

    const two = await mountCard({ settings: wheel, isHost: true, pool: [poolGame('Mario Kart'), poolGame('Pong')], hostGames })
    const [, pong] = two.findAll('button')
    await pong!.trigger('click')
    await flushPromises()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(dialog().querySelector('h2')?.textContent).toBe('Pong')
    expect(dialog().textContent).toContain('Klassiker')
    expect(dialog().textContent).not.toContain('Retro')
    expect(dialog().textContent).not.toContain('Notizen')
    expect(dialog().querySelector('a[href="/bibliothek/id-Pong"]')?.textContent?.trim()).toBe('In der Bibliothek öffnen')
  })

  it('has no tile to tap in an empty pool', async () => {
    const empty = await mountCard({ settings: wheel, isHost: true, pool: [], hostGames: {} })

    expect(empty.findAll('button')).toHaveLength(0)
    expect(empty.text()).toContain('Noch keine Spiele.')
  })

  it('opens the dialog without Tags and Notes when the Host\'s read has none for the game', async () => {
    const card = await mountCard({ settings: wheel, isHost: true, pool: [poolGame('Mario Kart')], hostGames: {} })

    await card.get('button').trigger('click')
    await flushPromises()

    expect(dialog().querySelector('h2')?.textContent).toBe('Mario Kart')
    expect(dialog().querySelector('ul[aria-label="Tags"]')).toBeNull()
    expect(dialog().textContent).not.toContain('Notizen')
  })

  it.each([
    ['no game', []],
    ['one game', ['Mario Kart']],
    ['two games', ['Mario Kart', 'Pong']],
  ])('opens a Member\'s pool tile as a dialog with the facts and without Tags and Notes, though hostGames were handed in: a pool of %s (#444)', async (_size, names) => {
    const games = names.map(name => poolGame(name, { playersMin: 2, playersMax: 4, suitabilities: ['teams'], price: { cents: 1999, source: 'steam', checkedAt: '2026-11-03T10:00:00.000Z' }, notes: 'Settings: 3 Runden' }))
    const card = await mountCard({ settings: wheel, pool: games.map(faceOf), hostGames })

    expect(card.findAll('button').map(button => button.text())).toEqual(names)
    expect(card.findAll('button').every(button => button.attributes('aria-haspopup') === 'dialog')).toBe(true)
    expect(dialog()).toBeNull()
    if (names.length === 0) return
    await card.findAll('button').at(-1)!.trigger('click')
    await flushPromises()

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(dialog().querySelector('h2')?.textContent).toBe(names.at(-1))
    expect(dialog().textContent).toContain('bis 4')
    expect(dialog().textContent).toContain('Teams')
    expect(dialog().textContent).toContain('Stand')
    expect(dialog().querySelector('ul[aria-label="Tags"]')).toBeNull()
    for (const hidden of ['Retro', 'Koop', 'Klassiker', 'Settings: 3 Runden', 'Notizen']) expect(dialog().textContent).not.toContain(hidden)
    expect(dialog().querySelector('a[href^="/bibliothek/"]')).toBeNull()
    expect(dialog().querySelector('footer')).toBeNull()
  })
})
