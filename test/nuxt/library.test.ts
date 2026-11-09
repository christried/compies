import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DetailPage from '~/pages/bibliothek/[id]/index.vue'
import EditPage from '~/pages/bibliothek/[id]/bearbeiten.vue'
import LibraryPage from '~/pages/bibliothek/index.vue'
import NewGamePage from '~/pages/bibliothek/neu.vue'
import { GAME_NAME_MAX, type GameTag, type GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'

const host = { ...kitty, canHost: true }

function game(overrides: Partial<GameView>): GameView {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    name: 'Mario Kart',
    imageUrl: null,
    youtubeId: null,
    clipStart: 0,
    clipLength: 30,
    playersMin: null,
    playersMax: null,
    suitabilities: [],
    createdBy: { id: kitty.id, name: 'Sanne' },
    createdAt: '2026-01-15T10:00:00.000Z',
    canEdit: true,
    notes: null,
    tags: [],
    price: null,
    ...overrides,
  }
}

const withClip = game({ id: '00000000-0000-4000-8000-0000000000a2', name: 'Counter-Strike 2', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 30 })
const withoutClip = game({ id: '00000000-0000-4000-8000-0000000000a3', name: 'Brettspiel' })

// One endpoint per path for the file (a second registration is not replaced); each test sets what it returns.
// The list is every game; the browser filters it (#173), so the tests look at the rendered cards.
let list: { games: GameView[], tagsInUse?: GameTag[] } = { games: [] }
let listMode: 'ok' | 'hang' = 'ok'
let detail: GameView | null = withClip
const patched = vi.fn()

registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => {
    if (listMode === 'hang') return new Promise(() => {})
    return { games: list.games, tagsInUse: list.tagsInUse ?? [] }
  },
})
registerEndpoint(`/api/games/${withClip.id}`, {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody(event)
    patched(body)
    return { ...withClip, name: body.name, canEdit: true }
  },
})
registerEndpoint(`/api/games/${withClip.id}`, {
  method: 'GET',
  handler: () => {
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    return detail
  },
})
registerEndpoint('/api/games/00000000-0000-4000-8000-0000000000ff', {
  method: 'GET',
  handler: () => {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  },
})

async function settle(page: Awaited<ReturnType<typeof mountSuspended>>) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
}

describe('the library page', () => {
  beforeEach(async () => {
    signInAs(host)
    list = { games: [] }
    listMode = 'ok'
    detail = withClip
    await clearNuxtData('games')
    useState('game-library').value = null
    await clearNuxtData(`game-${withClip.id}`)
  })

  it('shows a Member without the Host permission the generic Construction page and asks for nothing', async () => {
    signInAs(kitty)
    list = { games: [withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
    expect(page.text()).not.toContain('Counter-Strike 2')
  })

  it('shows the Platform admin the library', async () => {
    signInAs({ ...kitty, isAdmin: true })

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('h1').text()).toBe('Bibliothek')
  })

  it('shows the Host the cards, linked to the game, with the YouTube thumbnail or the placeholder', async () => {
    list = { games: [withoutClip, withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('h1').text()).toBe('Bibliothek')
    expect(page.text()).toContain('Global, für alle Hosts')
    const cards = page.findAll('main li')
    expect(cards.map(card => card.text())).toEqual(['Brettspiel', 'Counter-Strike 2'])
    expect(cards[1]!.get('a').attributes('href')).toBe(`/bibliothek/${withClip.id}`)
    expect(cards[1]!.get('img').attributes('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(cards[0]!.find('img').exists()).toBe(false)
    expect(cards[0]!.find('[data-cover="placeholder"]').exists()).toBe(true)
  })

  it('shows the uploaded image on the card, over the YouTube thumbnail (#143)', async () => {
    list = { games: [{ ...withClip, imageUrl: '/api/images/a2-abc.webp' }] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('main li img').attributes('src')).toBe('/api/images/a2-abc.webp')
  })

  it('leads to the form with „Spiel anlegen“', async () => {
    list = { games: [withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const cta = page.findAll('main a').find(link => link.text().includes('Spiel anlegen'))
    expect(cta?.attributes('href')).toBe('/bibliothek/neu')
  })

  it('shows skeleton cards on a busy grid while the list loads', async () => {
    listMode = 'hang'

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })

    const busy = page.get('[aria-busy="true"]')
    expect(busy.attributes('aria-label')).toBe('Bibliothek lädt')
    expect(busy.findAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(6)
  })

  it('shows the empty state with the way to the first game', async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.text()).toContain('Die Bibliothek ist leer.')
    const cta = page.findAll('main a').filter(link => link.text().includes('Spiel anlegen'))
    expect(cta.length).toBeGreaterThan(0)
    expect(cta.every(link => link.attributes('href') === '/bibliothek/neu')).toBe(true)
  })
})

describe('the game page', () => {
  beforeEach(async () => {
    signInAs(host)
    detail = withClip
    await clearNuxtData(`game-${withClip.id}`)
  })

  it('shows the name, the creator and month, the clip length and the excerpt of the clip', async () => {
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.get('h1').text()).toBe('Counter-Strike 2')
    expect(page.text()).toContain('Clip 30 s')
    expect(page.text()).toContain('Angelegt von Sanne im Januar 2026')
    expect(page.text()).toContain('Ausschnitt 1:12 – 1:42')
    expect(page.get('a[href="/bibliothek"]').text()).toContain('Bibliothek')
  })

  // The longest name allowed, without a space, made the heading wider than the page at 390 px (b337, #332): the heading breaks inside the word.
  it('lets the heading break a longest-allowed name without spaces', async () => {
    detail = { ...withClip, name: 'W'.repeat(GAME_NAME_MAX) }
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.get('h1').text()).toBe('W'.repeat(GAME_NAME_MAX))
    expect(page.get('h1').classes()).toContain('break-words')
  })

  it('shows a game without a clip with the placeholder and no preview', async () => {
    detail = { ...withClip, youtubeId: null, clipStart: 0 }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.text()).not.toContain('Ausschnitt')
    expect(page.text()).not.toContain('Clip 30 s')
    expect(page.find('[data-cover="placeholder"]').exists()).toBe(true)
  })

  it('shows the uploaded image next to the clip (#143)', async () => {
    detail = { ...withClip, imageUrl: '/api/images/a2-abc.webp' }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.find('img[src="/api/images/a2-abc.webp"]').exists()).toBe(true)
    expect(page.text()).toContain('Ausschnitt 1:12 – 1:42')
  })

  it('shows the uploaded image of a game without a clip instead of the placeholder (#143)', async () => {
    detail = { ...withClip, youtubeId: null, clipStart: 0, imageUrl: '/api/images/a2-abc.webp' }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.find('img[src="/api/images/a2-abc.webp"]').exists()).toBe(true)
    expect(page.find('[data-cover="placeholder"]').exists()).toBe(false)
  })

  it('shows the notes under „Notizen“ with their line breaks, as the Host wrote them (#223)', async () => {
    detail = { ...withClip, notes: 'Settings: 3 Runden\nWarmup: Lobby\n\nWin: meiste Punkte' }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    const heading = page.findAll('h2').find(el => el.text() === 'Notizen')
    expect(heading).toBeDefined()
    const notesEl = page.findAll('p').find(el => el.text().includes('Settings'))
    expect(notesEl!.element.textContent).toBe('Settings: 3 Runden\nWarmup: Lobby\n\nWin: meiste Punkte')
  })

  it('shows notes as plain text: no formatting and no links', async () => {
    detail = { ...withClip, notes: 'Hausregel: <b>nur Teams</b> und https://example.com' }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.text()).toContain('Hausregel: <b>nur Teams</b> und https://example.com')
    expect(page.find('b').exists()).toBe(false)
    expect(page.find('a[href="https://example.com"]').exists()).toBe(false)
  })

  it('shows no „Notizen“ section for a game without notes', async () => {
    detail = { ...withClip, notes: null }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.findAll('h2').some(el => el.text() === 'Notizen')).toBe(false)
  })

  it('looks like any missing page when the game does not exist', async () => {
    const page = await mountSuspended(DetailPage, { route: '/bibliothek/00000000-0000-4000-8000-0000000000ff' })

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Hier wird noch gebaut.'))
  })

  it('shows a Member without the Host permission the generic Construction page', async () => {
    signInAs(kitty)

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
  })
})

describe('the new game page', () => {
  it('shows a Member without the Host permission the generic Construction page', async () => {
    signInAs(kitty)

    const page = await mountSuspended(NewGamePage, { route: '/bibliothek/neu' })

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
    expect(page.find('input').exists()).toBe(false)
  })

  it('says the game is in the library and opens it after saving', async () => {
    signInAs(host)
    registerEndpoint('/api/games', { method: 'POST', handler: () => withClip })
    useState('toasts').value = []
    const page = await mountSuspended(NewGamePage, { route: '/bibliothek/neu' })
    const name = page.findAll('label').find(label => label.text() === 'Name')!
    await page.get(`[id="${name.attributes('for')}"]`).setValue('Counter-Strike 2')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe(`/bibliothek/${withClip.id}`))
    expect(useState<{ text: string }[]>('toasts').value.map(toast => toast.text)).toEqual(['Counter-Strike 2 ist in der Bibliothek.'])
  })

  it('shows the Host the form under „Spiel anlegen“', async () => {
    signInAs(host)

    const page = await mountSuspended(NewGamePage, { route: '/bibliothek/neu' })

    expect(page.get('h1').text()).toBe('Spiel anlegen')
    expect(page.text()).toContain('Bibliothek')
    expect(page.find('input').exists()).toBe(true)
  })
})

const tagged = (n: number) => Array.from({ length: n }, (_, index) => ({ key: `tag ${index + 1}`, label: `Tag ${index + 1}` }))

const withPlayers = game({ id: '00000000-0000-4000-8000-0000000000a4', name: 'Halo', playersMin: 2, playersMax: 10, suitabilities: ['teams', 'ffa'], canEdit: false, createdBy: { id: 'someone-else', name: 'Sanne' } })

describe('the library cards and filters (#142, #173)', () => {
  beforeEach(async () => {
    signInAs(host)
    // The test before may have navigated away (to a game); each filter test starts on the library page.
    await useRouter().push('/bibliothek')
    list = { games: [withClip] }
    listMode = 'ok'
    await clearNuxtData('games')
    useState('game-library').value = null
  })

  const names = (page: VueWrapper) => page.findAll('main ul li').map(card => card.get('b, a').text())
  const chip = (page: VueWrapper, text: string) => page.findAll('main button').find(button => button.text() === text)!
  const query = () => useRouter().currentRoute.value.query

  it('shows the card name as plain text: a link without the pill border, with a visible focus ring', async () => {
    list = { games: [withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const name = page.get('main li a')
    expect(name.text()).toBe('Counter-Strike 2')
    expect(name.attributes('href')).toBe(`/bibliothek/${withClip.id}`)
    expect(name.classes()).not.toContain('outline-memphis')
    expect(name.classes()).toContain('focus-visible:focus-ring')
  })

  it('gives every select of the filter bar room between the chevron and the border', async () => {
    list = { games: [withClip, withPlayers] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    for (const label of ['Spielerzahl', 'Passt zu', 'Tag']) {
      expect(page.get(`select[aria-label="${label}"]`).classes()).toContain('pr-9')
    }
  })

  it('shows the player count and the Suitabilities on the card, as a list in order', async () => {
    list = { games: [withPlayers, withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const [halo, cs] = page.findAll('main li')
    expect(halo!.text()).toContain('2–10')
    expect(halo!.text()).toContain('Teams, Jeder gegen jeden')
    expect(cs!.text()).not.toContain('Teams')
  })

  it('counts a library of one game in the singular in the search (#268)', async () => {
    list = { games: [withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('input[type="search"]').attributes('placeholder')).toBe('1 Spiel durchsuchen')
  })

  it('shows the search with the number of games in the library, and the filter chips', async () => {
    list = { games: [withClip, withoutClip, withPlayers] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('input[type="search"]').attributes('placeholder')).toBe('3 Spiele durchsuchen')
    const chips = page.findAll('main button, main select').map(item => item.text())
    expect(chips).toEqual(expect.arrayContaining(['Alle', 'Von mir']))
    expect(page.find('select[aria-label="Spielerzahl"]').exists()).toBe(true)
    expect(page.find('select[aria-label="Passt zu"]').exists()).toBe(true)
    expect(page.find('select[aria-label="Tag"]').exists()).toBe(true)
  })

  it('filters the cards on every keystroke and writes the search to the address after a short pause', async () => {
    list = { games: [withClip, withoutClip, withPlayers] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('input[type="search"]').setValue('counter')

    expect(names(page)).toEqual(['Counter-Strike 2'])
    expect(query().q).toBeUndefined()
    await vi.waitFor(() => expect(query().q).toBe('counter'), { timeout: 5000 })
  })

  it('keeps only the games of the viewer with „Von mir“, shows it pressed and puts it in the address', async () => {
    list = { games: [withClip, withPlayers] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await chip(page, 'Von mir').trigger('click')

    expect(names(page)).toEqual(['Counter-Strike 2'])
    expect(chip(page, 'Von mir').attributes('aria-pressed')).toBe('true')
    await vi.waitFor(() => expect(query().mine).toBe('1'))
  })

  it('keeps the games of the Passt zu picked in its menu', async () => {
    list = { games: [withClip, withPlayers] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('select[aria-label="Passt zu"]').setValue('ffa')

    expect(names(page)).toEqual(['Halo'])
    await vi.waitFor(() => expect(query().suitability).toBe('ffa'))
  })

  it('keeps the games whose range covers the player count picked in its menu, and shows it on the chip', async () => {
    list = { games: [withClip, withPlayers, withoutClip] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('select[aria-label="Spielerzahl"]').setValue('3')

    expect(names(page)).toEqual(['Halo'])
    expect(page.get('select[aria-label="Spielerzahl"]').text()).toContain('3 Spieler')
    await vi.waitFor(() => expect(query().players).toBe('3'))
  })

  it('takes the filters from the address, so reload and back keep them', async () => {
    list = { games: [withClip, withPlayers, withoutClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?q=halo&players=3&suitability=ffa&mine=1' })
    await settle(page)

    expect(names(page)).toEqual([])
    expect((page.get('input[type="search"]').element as HTMLInputElement).value).toBe('halo')
    expect(chip(page, 'Von mir').attributes('aria-pressed')).toBe('true')
    expect((page.get('select[aria-label="Passt zu"]').element as HTMLSelectElement).value).toBe('ffa')
  })

  it('follows the address when back changes the search', async () => {
    list = { games: [withClip, withPlayers] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?q=halo' })
    await settle(page)
    expect(names(page)).toEqual(['Halo'])

    await useRouter().push('/bibliothek?q=counter')

    await vi.waitFor(() => expect(names(page)).toEqual(['Counter-Strike 2']))
    expect((page.get('input[type="search"]').element as HTMLInputElement).value).toBe('counter')
  })

  it('„Alle“ clears the search and every filter', async () => {
    list = { games: [withClip, withPlayers] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?q=halo&suitability=ffa' })
    await settle(page)

    await chip(page, 'Alle').trigger('click')

    expect(names(page)).toEqual(['Counter-Strike 2', 'Halo'])
    await vi.waitFor(() => expect(query()).toEqual({}))
  })

  it('shows „Keine Treffer“ with the search text when nothing matches it', async () => {
    list = { games: [withClip, withoutClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?q=Stardew%20Valley' })
    await settle(page)

    expect(page.findAll('h2').map(heading => heading.text())).toContain('„Stardew Valley“ kennen wir noch nicht.')
    expect(page.text()).toContain('Anders schreiben, oder das Spiel neu anlegen.')
    expect(page.findAll('main a').some(link => link.text().includes('Spiel anlegen'))).toBe(true)
  })

  it('shows „Nix gefunden.“ when only a filter keeps every game out', async () => {
    list = { games: [withClip, withoutClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?suitability=ffa' })
    await settle(page)

    expect(page.findAll('h2').map(heading => heading.text())).toContain('Nix gefunden.')
    expect(page.text()).not.toContain('Die Bibliothek ist leer.')
  })

  it('shows the empty library state, not „Keine Treffer“, when the library has no games', async () => {
    list = { games: [] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.findAll('h2').map(heading => heading.text())).toContain('Die Bibliothek ist leer.')
    expect(page.text()).not.toContain('Nix gefunden.')
  })
})

describe('the Tag filter (#336)', () => {
  beforeEach(async () => {
    signInAs(host)
    await useRouter().push('/bibliothek')
    listMode = 'ok'
    list = { games: [] }
    await clearNuxtData('games')
    useState('game-library').value = null
  })

  const names = (page: VueWrapper) => page.findAll('main ul li').map(card => card.get('b, a').text())
  const chip = (page: VueWrapper, text: string) => page.findAll('main button').find(button => button.text() === text)!
  const query = () => useRouter().currentRoute.value.query
  const tagSelect = (page: VueWrapper) => page.get('select[aria-label="Tag"]')
  const options = (page: VueWrapper) => page.findAll('select[aria-label="Tag"] option')

  const tag = (key: string, label: string): GameTag => ({ key, label })
  const retro = tag('retro', 'Retro')
  const coopTag = tag('co-op', 'Co-op')
  const angerTag = tag('ärger', 'Ärger')
  const pandemie = game({ id: '00000000-0000-4000-8000-0000000000b1', name: 'Pandemie', tags: [coopTag] })
  const kart = game({ id: '00000000-0000-4000-8000-0000000000b2', name: 'Retro Kart', tags: [retro] })
  const brettspiel = game({ id: '00000000-0000-4000-8000-0000000000b3', name: 'Brettspiel', tags: [tag('kurz', 'Zeitsparend')] })

  it('offers the Tags in use by label in German order, the keys as values, behind a placeholder', async () => {
    list = { games: [pandemie, kart], tagsInUse: [retro, coopTag, angerTag] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(options(page).map(option => option.text())).toEqual(['Tag', 'Ärger', 'Co-op', 'Retro'])
    expect(options(page).map(option => (option.element as HTMLOptionElement).value)).toEqual(['', 'ärger', 'co-op', 'retro'])
  })

  it('keeps the select with only the placeholder when no Tag is in use', async () => {
    list = { games: [withClip], tagsInUse: [] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(options(page).map(option => option.text())).toEqual(['Tag'])
  })

  it('keeps the games carrying the Tag picked in the select, shows the chip on, and puts the key in the address', async () => {
    list = { games: [pandemie, kart, withClip], tagsInUse: [coopTag, retro] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await tagSelect(page).setValue('co-op')

    expect(names(page)).toEqual(['Pandemie'])
    expect(tagSelect(page).classes()).toContain('bg-ink')
    await vi.waitFor(() => expect(query().tag).toBe('co-op'))
  })

  it('finds a game by a Tag label typed in the search, and not by the Tag key', async () => {
    list = { games: [brettspiel, kart], tagsInUse: [tag('kurz', 'Zeitsparend'), retro] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('input[type="search"]').setValue('zeitspar')

    expect(names(page)).toEqual(['Brettspiel'])
  })

  it('does not find a game by a Tag key that no label spells', async () => {
    list = { games: [brettspiel, kart], tagsInUse: [tag('kurz', 'Zeitsparend'), retro] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('input[type="search"]').setValue('kurz')

    expect(names(page)).toEqual([])
  })

  it('takes the Tag from the address on reload, normalised to its key, and ignores an empty one', async () => {
    list = { games: [pandemie, kart], tagsInUse: [coopTag, retro] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?tag=co-op' })
    await settle(page)
    expect(names(page)).toEqual(['Pandemie'])
    expect((tagSelect(page).element as HTMLSelectElement).value).toBe('co-op')

    const typed = await mountSuspended(LibraryPage, { route: '/bibliothek?tag=Co-op' })
    await settle(typed)
    expect(names(typed)).toEqual(['Pandemie'])
    expect((tagSelect(typed).element as HTMLSelectElement).value).toBe('co-op')

    for (const route of ['/bibliothek?tag=%20', '/bibliothek?tag=']) {
      const blank = await mountSuspended(LibraryPage, { route })
      await settle(blank)
      expect(names(blank)).toEqual(['Pandemie', 'Retro Kart'])
    }
  })

  it('follows back and forward through the address without a reload', async () => {
    list = { games: [pandemie, kart], tagsInUse: [coopTag, retro] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?tag=co-op' })
    await settle(page)

    await useRouter().push('/bibliothek?tag=retro')

    await vi.waitFor(() => expect(names(page)).toEqual(['Retro Kart']))
    expect((tagSelect(page).element as HTMLSelectElement).value).toBe('retro')
  })

  it('„Alle“ clears the Tag with the other filters and takes it out of the address', async () => {
    list = { games: [pandemie, kart, withPlayers], tagsInUse: [coopTag, retro] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?tag=co-op&q=halo' })
    await settle(page)
    expect(names(page)).toEqual([])

    await chip(page, 'Alle').trigger('click')

    expect(names(page)).toEqual(['Pandemie', 'Retro Kart', 'Halo'])
    await vi.waitFor(() => expect(query()).toEqual({}))
  })

  it('combines the Tag with „Von mir“ in the address', async () => {
    const fremd = game({ id: '00000000-0000-4000-8000-0000000000b4', name: 'Fremd', tags: [coopTag], createdBy: { id: 'someone-else', name: 'Anna' } })
    list = { games: [pandemie, fremd], tagsInUse: [coopTag] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?tag=co-op&mine=1' })
    await settle(page)

    expect(names(page)).toEqual(['Pandemie'])
  })

  it('keeps a Tag no game carries as the select value, shows „Nix gefunden.“, offers it last, and „Alle“ clears it', async () => {
    list = { games: [pandemie, kart], tagsInUse: [coopTag, retro] }
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?tag=weg' })
    await settle(page)

    expect(page.findAll('h2').map(heading => heading.text())).toContain('Nix gefunden.')
    expect((tagSelect(page).element as HTMLSelectElement).value).toBe('weg')
    expect(tagSelect(page).classes()).toContain('bg-ink')
    expect(options(page).map(option => option.text())).toEqual(['Tag', 'Co-op', 'Retro', 'weg'])

    await chip(page, 'Alle').trigger('click')

    expect(names(page)).toEqual(['Pandemie', 'Retro Kart'])
    await vi.waitFor(() => expect(query()).toEqual({}))
  })

  it('no longer offers a Tag once its last game lost it', async () => {
    list = { games: [pandemie, kart], tagsInUse: [coopTag, retro] }
    const first = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(first)
    expect(options(first).map(option => option.text())).toContain('Co-op')

    await clearNuxtData('games')
    useState('game-library').value = null
    list = { games: [kart], tagsInUse: [retro] }
    const second = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(second)

    expect(options(second).map(option => option.text())).toEqual(['Tag', 'Retro'])
  })

  it('shows the longest Tag in full to the assistive technology and keeps the select inside the row', async () => {
    const longest = 'a'.repeat(20)
    list = { games: [kart], tagsInUse: [tag(longest, longest)] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(options(page).map(option => option.text())).toEqual(['Tag', longest])
    expect(tagSelect(page).classes()).toContain('max-w-full')
  })
})

describe('Tags on the card and the game page (#335)', () => {
  beforeEach(async () => {
    signInAs(host)
    await useRouter().push('/bibliothek')
    listMode = 'ok'
    await clearNuxtData('games')
    useState('game-library').value = null
    await clearNuxtData(`game-${withClip.id}`)
  })

  const group = (card: { find: (selector: string) => DOMWrapper<Element> }) => card.find('[role="group"][aria-label="Tags"]')

  it('shows the first three Tags and „+2“ for five, with the number spelled out for assistive technology', async () => {
    list = { games: [game({ id: withClip.id, name: 'Fünf', tags: tagged(5) })] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const card = page.get('main li')
    expect(group(card).element.children.length).toBe(4)
    expect([...group(card).element.children].map(child => child.textContent?.trim())).toEqual(['Tag 1', 'Tag 2', 'Tag 3', '+2'])
    expect(group(card).get('[aria-label="2 weitere Tags"]').text()).toBe('+2')
    expect(page.findAll('main li')).toHaveLength(1)
  })

  it('shows three Tags without „+N“, one with the singular label, and none for a game without Tags', async () => {
    list = {
      games: [
        game({ id: withClip.id, name: 'Drei', tags: tagged(3) }),
        game({ id: withoutClip.id, name: 'Vier', tags: tagged(4) }),
        game({ id: withPlayers.id, name: 'Keins' }),
      ],
    }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const [three, four, none] = page.findAll('main li')
    expect(group(three!).text()).toBe('Tag 1Tag 2Tag 3')
    expect(group(four!).get('[aria-label="1 weiterer Tag"]').text()).toBe('+1')
    expect(group(none!).exists()).toBe(false)
  })

  it('lists every Tag on the game page under the list named „Tags“, and nothing for a game without Tags', async () => {
    detail = { ...withClip, tags: tagged(5) }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.get('ul[aria-label="Tags"]').findAll('li').map(item => item.text())).toEqual(['Tag 1', 'Tag 2', 'Tag 3', 'Tag 4', 'Tag 5'])

    await clearNuxtData(`game-${withClip.id}`)
    detail = withClip
    const plain = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(plain.find('h1').exists()).toBe(true))
    expect(plain.find('ul[aria-label="Tags"]').exists()).toBe(false)
  })
})

describe('Price (#337)', () => {
  beforeEach(async () => {
    // The day is pinned: „Stand 3. Nov.“ carries the year only when the checked day is not this year (#337).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-09T12:00:00.000Z'))
    signInAs(host)
    await useRouter().push('/bibliothek')
    listMode = 'ok'
    list = { games: [] }
    detail = withClip
    await clearNuxtData('games')
    useState('game-library').value = null
    await clearNuxtData(`game-${withClip.id}`)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const checked = '2026-11-03T10:00:00.000Z'
  const steam = { cents: 1999, source: 'steam' as const, checkedAt: checked }

  it('shows the Price line under the name of a card, in the German line', async () => {
    list = { games: [game({ id: withClip.id, name: 'Counter-Strike 2', price: steam })] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const card = page.get('main li')
    expect(card.text()).toContain('19,99 € bei Steam · Stand 3. Nov.')
    expect(card.text().indexOf('19,99 € bei Steam')).toBeGreaterThan(card.text().indexOf('Counter-Strike 2'))
    expect(page.findAll('main li')).toHaveLength(1)
  })

  it('shows no Price line on a card of a game without a Price', async () => {
    list = { games: [game({ id: withoutClip.id, name: 'Brettspiel' })] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('main li').text()).not.toContain('· Stand')
  })

  it('shows „Free-to-play“ and „Abo“ without an amount, with their day', async () => {
    list = {
      games: [
        game({ id: withClip.id, name: 'Kostenlos', price: { cents: null, source: 'free_to_play', checkedAt: checked } }),
        game({ id: withoutClip.id, name: 'Abo', price: { cents: null, source: 'subscription', checkedAt: checked } }),
      ],
    }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const [free, subscription] = page.findAll('main li')
    expect(free!.text()).toContain('Free-to-play · Stand 3. Nov.')
    expect(subscription!.text()).toContain('Abo · Stand 3. Nov.')
  })

  it('shows the year of a day checked in an earlier year', async () => {
    list = { games: [game({ id: withClip.id, name: 'Alt', price: { ...steam, checkedAt: '2025-11-03T10:00:00.000Z' } })] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('main li').text()).toContain('19,99 € bei Steam · Stand 3. Nov. 2025')
  })

  it('shows the Price as a fact on the game page, and none for a game without a Price', async () => {
    detail = { ...withClip, price: { cents: 1999, source: 'epic', checkedAt: checked } }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.get('h1').text()).toBe('Counter-Strike 2')
    expect(page.text()).toContain('19,99 € bei Epic Games Store · Stand 3. Nov.')

    await clearNuxtData(`game-${withClip.id}`)
    detail = withClip
    const plain = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(plain.find('h1').exists()).toBe(true))
    expect(plain.text()).not.toContain('· Stand')
  })
})

describe('the game page for its editors (#142)', () => {
  beforeEach(async () => {
    signInAs(host)
    detail = withClip
    await clearNuxtData(`game-${withClip.id}`)
  })

  it('shows the Host who created the game the „Bearbeiten“ button to the edit page', async () => {
    detail = { ...withClip, canEdit: true }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    await vi.waitFor(() => expect(page.find(`a[href="/bibliothek/${withClip.id}/bearbeiten"]`).exists()).toBe(true))
    expect(page.get(`a[href="/bibliothek/${withClip.id}/bearbeiten"]`).text()).toContain('Bearbeiten')
  })

  it('shows another Host the reason instead of a button', async () => {
    detail = { ...withClip, canEdit: false, createdBy: { id: 'someone-else', name: 'Sanne' } }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.text()).toContain('Bearbeiten dürfen nur Sanne und die Plattform-Admin.')
    expect(page.find(`a[href="/bibliothek/${withClip.id}/bearbeiten"]`).exists()).toBe(false)
  })

  it('shows the player count and the Suitabilities as facts', async () => {
    detail = { ...withPlayers, id: withClip.id }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.text()).toContain('2 bis 10')
    expect(page.text()).toContain('Teams, Jeder gegen jeden')
  })
})

describe('the edit page (#142)', () => {
  beforeEach(async () => {
    signInAs(host)
    detail = { ...withClip, canEdit: true }
    patched.mockClear()
    await clearNuxtData(`game-${withClip.id}`)
    await clearNuxtData('games')
    useState('game-library').value = null
  })

  function field(page: VueWrapper, label: string) {
    const labelEl = page.findAll('label').find(el => el.text() === label)
    if (!labelEl) throw new Error(`no field "${label}"`)
    return page.get(`[id="${labelEl.attributes('for')}"]`)
  }

  it('opens the form for the creator under „Bearbeiten“, prefilled with the game', async () => {
    const page = await mountSuspended(EditPage, { route: `/bibliothek/${withClip.id}/bearbeiten` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.get('h1').text()).toBe('Counter-Strike 2')
    expect(page.text()).toContain('Bearbeiten')
    expect((field(page, 'Name').element as HTMLInputElement).value).toBe('Counter-Strike 2')
    expect(page.get('button[type="submit"]').text()).toContain('Änderungen speichern')
  })

  it('shows another Host the reason and no form', async () => {
    detail = { ...withClip, canEdit: false, createdBy: { id: 'someone-else', name: 'Sanne' } }

    const page = await mountSuspended(EditPage, { route: `/bibliothek/${withClip.id}/bearbeiten` })
    await vi.waitFor(() => expect(page.text()).toContain('Bearbeiten dürfen nur Sanne und die Plattform-Admin.'), { timeout: 5000 })

    expect(page.find('form').exists()).toBe(false)
  })

  it('saves the changes, says so and goes back to the game', async () => {
    useState('toasts').value = []
    const page = await mountSuspended(EditPage, { route: `/bibliothek/${withClip.id}/bearbeiten` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))
    await field(page, 'Name').setValue('Counter-Strike 2 HD')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe(`/bibliothek/${withClip.id}`))
    expect(patched).toHaveBeenCalledWith(expect.objectContaining({ name: 'Counter-Strike 2 HD' }))
    expect(useState<{ text: string }[]>('toasts').value.map(toast => toast.text)).toEqual(['Gespeichert.'])
  })
})
