import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, getQuery, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DetailPage from '~/pages/bibliothek/[id]/index.vue'
import EditPage from '~/pages/bibliothek/[id]/bearbeiten.vue'
import LibraryPage from '~/pages/bibliothek/index.vue'
import NewGamePage from '~/pages/bibliothek/neu.vue'
import type { GameView } from '~~/shared/game'
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
    formats: [],
    createdBy: { id: kitty.id, name: 'Sanne' },
    createdAt: '2026-01-15T10:00:00.000Z',
    canEdit: true,
    ...overrides,
  }
}

const withClip = game({ id: '00000000-0000-4000-8000-0000000000a2', name: 'Counter-Strike 2', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 30 })
const withoutClip = game({ id: '00000000-0000-4000-8000-0000000000a3', name: 'Brettspiel' })

// One endpoint per path for the file (a second registration is not replaced); each test sets what it returns.
// `total` defaults to the number of games; the query of the last list request is what the filters sent (#142).
let list: { games: GameView[], total?: number } = { games: [] }
let listMode: 'ok' | 'hang' = 'ok'
let detail: GameView | null = withClip
let lastQuery: Record<string, unknown> = {}
const patched = vi.fn()

registerEndpoint('/api/games', {
  method: 'GET',
  handler: (event) => {
    lastQuery = getQuery(event)
    if (listMode === 'hang') return new Promise(() => {})
    return { games: list.games, total: list.total ?? list.games.length }
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

const withPlayers = game({ id: '00000000-0000-4000-8000-0000000000a4', name: 'Halo', playersMin: 2, playersMax: 10, formats: ['teams', 'ffa'], canEdit: false, createdBy: { id: 'someone-else', name: 'Sanne' } })

describe('the library cards and filters (#142)', () => {
  beforeEach(async () => {
    signInAs(host)
    // The test before may have navigated away (to a game); each filter test starts on the library page.
    await useRouter().push('/bibliothek')
    list = { games: [withClip], total: 1 }
    listMode = 'ok'
    lastQuery = {}
    await clearNuxtData('games')
  })

  it('shows the player count and the Formats on the card, both Formats as „Beides“', async () => {
    list = { games: [withPlayers, withClip] }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    const [halo, cs] = page.findAll('main li')
    expect(halo!.text()).toContain('2–10')
    expect(halo!.text()).toContain('Beides')
    expect(cs!.text()).not.toContain('Beides')
  })

  it('shows the search with the number of games in the library, and the filter chips', async () => {
    list = { games: [withClip, withoutClip], total: 86 }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    expect(page.get('input[type="search"]').attributes('placeholder')).toBe('86 Spiele durchsuchen')
    const chips = page.findAll('main button, main select').map(chip => chip.text())
    expect(chips).toEqual(expect.arrayContaining(['Alle', 'Von mir']))
    expect(page.find('select[aria-label="Spielerzahl"]').exists()).toBe(true)
    expect(page.find('select[aria-label="Format"]').exists()).toBe(true)
  })

  it('sends the search after a short pause and keeps it in the address', async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('input[type="search"]').setValue('counter')

    await vi.waitFor(() => expect(lastQuery.q).toBe('counter'), { timeout: 5000 })
    expect(useRouter().currentRoute.value.query.q).toBe('counter')
  })

  it('sends „Von mir“ as mine=1 and shows it pressed', async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)
    const mine = page.findAll('main button').find(button => button.text() === 'Von mir')!

    await mine.trigger('click')

    await vi.waitFor(() => expect(lastQuery.mine).toBe('1'), { timeout: 5000 })
    expect(page.findAll('main button').find(button => button.text() === 'Von mir')!.attributes('aria-pressed')).toBe('true')
    expect(useRouter().currentRoute.value.query.mine).toBe('1')
  })

  it('sends the Format picked in its menu', async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('select[aria-label="Format"]').setValue('teams')

    await vi.waitFor(() => expect(lastQuery.format).toBe('teams'), { timeout: 5000 })
  })

  it('sends the player count picked in its menu and shows it on the chip', async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await page.get('select[aria-label="Spielerzahl"]').setValue('3')

    await vi.waitFor(() => expect(lastQuery.players).toBe('3'), { timeout: 5000 })
    expect(page.get('select[aria-label="Spielerzahl"]').text()).toContain('3 Spieler')
  })

  it('takes the filters from the address, so reload and back keep them', async () => {
    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?q=halo&players=3&format=ffa&mine=1' })
    await settle(page)

    expect(lastQuery).toMatchObject({ q: 'halo', players: '3', format: 'ffa', mine: '1' })
    expect(page.findAll('main button').find(button => button.text() === 'Von mir')!.attributes('aria-pressed')).toBe('true')
  })

  it('shows „Keine Treffer“ with the search text when nothing matches it', async () => {
    list = { games: [], total: 2 }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?q=Stardew%20Valley' })
    await settle(page)

    await vi.waitFor(() => expect(page.findAll('h2').map(heading => heading.text())).toContain('„Stardew Valley“ kennen wir noch nicht.'), { timeout: 5000 })
    expect(page.text()).toContain('Anders schreiben, oder das Spiel neu anlegen.')
    expect(page.findAll('main a').some(link => link.text().includes('Spiel anlegen'))).toBe(true)
  })

  it('shows „Nix gefunden.“ when only a filter keeps every game out', async () => {
    list = { games: [], total: 2 }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek?format=ffa' })
    await settle(page)

    await vi.waitFor(() => expect(page.findAll('h2').map(heading => heading.text())).toContain('Nix gefunden.'), { timeout: 5000 })
    expect(page.text()).not.toContain('Die Bibliothek ist leer.')
  })

  it('shows the empty library state, not „Keine Treffer“, when the library has no games', async () => {
    list = { games: [], total: 0 }

    const page = await mountSuspended(LibraryPage, { route: '/bibliothek' })
    await settle(page)

    await vi.waitFor(() => expect(page.findAll('h2').map(heading => heading.text())).toContain('Die Bibliothek ist leer.'), { timeout: 5000 })
    expect(page.text()).not.toContain('Nix gefunden.')
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

  it('shows the player count and the Formats as facts', async () => {
    detail = { ...withPlayers, id: withClip.id }

    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${withClip.id}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.text()).toContain('2 bis 10')
    expect(page.text()).toContain('Beides')
  })
})

describe('the edit page (#142)', () => {
  beforeEach(async () => {
    signInAs(host)
    detail = { ...withClip, canEdit: true }
    patched.mockClear()
    await clearNuxtData(`game-${withClip.id}`)
    await clearNuxtData('games')
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
