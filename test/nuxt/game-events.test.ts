import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DetailPage from '~/pages/bibliothek/[id]/index.vue'
import { EVENT_NAME_MAX } from '~~/shared/event'
import type { GameEventRow } from '~~/shared/game-events'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { signInAs } from './auth'
import { game, host } from './helpers/library'
import { FORMATTED_NOTES, readFormatted } from './helpers/formatted-notes'

// The Events of a game on its page (#656, spec #717 § F): the list below the Game notes, its empty line, the failure notice and the Event notes
// disclosure of a row. Both reads are mocked: the game and `/api/games/:id/events`.

const ID = '00000000-0000-4000-8000-0000000000e1'
const LONG_NAME = 'W'.repeat(EVENT_NAME_MAX)

let gameStatus = 200
let eventsStatus = 200
let rows: GameEventRow[] = []

registerEndpoint(`/api/games/${ID}`, {
  method: 'GET',
  handler: () => {
    if (gameStatus !== 200) throw createError({ statusCode: gameStatus, statusMessage: 'not_found' })
    return game({ id: ID, name: 'Mario Kart', notes: notesFromLines(['Die Spielregeln']) })
  },
})
registerEndpoint(`/api/games/${ID}/events`, {
  method: 'GET',
  handler: () => {
    if (eventsStatus !== 200) throw createError({ statusCode: eventsStatus, statusMessage: 'failed' })
    return { events: rows }
  },
})

const row = (slug: string, name: string, played: number, notes: NotesDoc | null = null): GameEventRow => ({ slug, name, played, notes })

beforeEach(async () => {
  signInAs(host)
  gameStatus = 200
  eventsStatus = 200
  rows = []
  await clearNuxtData(`game-${ID}`)
  await clearNuxtData(`game-events-${ID}`)
})

async function mountPage() {
  const page = await mountSuspended(DetailPage, { route: `/bibliothek/${ID}` })
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
  return page
}

const section = (page: VueWrapper) => page.findAll('section').find(candidate => candidate.find('h2').exists() && candidate.find('h2').text() === 'Deine Events mit diesem Spiel')
const items = (page: VueWrapper) => section(page)!.findAll('li')

describe('the Events list on the game\'s page (#656)', () => {
  it('shows the heading and the empty line for a game in no Event, and no row', async () => {
    const page = await mountPage()
    await vi.waitFor(() => expect(section(page)).toBeDefined())

    expect(section(page)!.get('h2').text()).toBe('Deine Events mit diesem Spiel')
    expect(section(page)!.text()).toContain('Dieses Spiel ist noch in keinem deiner Events.')
    expect(items(page)).toHaveLength(0)
  })

  it('shows one Event whose pool holds the game: a link to the Event, „im Pool“, no disclosure', async () => {
    rows = [row('freitag-ab1', 'Freitags-Zocken', 0)]
    const page = await mountPage()
    await vi.waitFor(() => expect(items(page)).toHaveLength(1))

    const [item] = items(page)
    const link = item!.get('a')
    expect(link.text()).toBe('Freitags-Zocken')
    expect(link.attributes('href')).toBe('/e/freitag-ab1')
    expect(item!.text()).toContain('im Pool')
    expect(item!.text()).not.toContain('gespielt')
    expect(item!.find('button').exists()).toBe(false)
  })

  it('shows two Events in the order sent, each with its count and none saying „im Pool“', async () => {
    rows = [row('neu-1', 'Neu', 1), row('alt-3', 'Alt', 3)]
    const page = await mountPage()
    await vi.waitFor(() => expect(items(page)).toHaveLength(2))

    expect(items(page).map(item => item.get('a').text())).toEqual(['Neu', 'Alt'])
    expect(items(page).map(item => item.get('a').attributes('href'))).toEqual(['/e/neu-1', '/e/alt-3'])
    expect(items(page)[0]!.text()).toContain('1× gespielt')
    expect(items(page)[1]!.text()).toContain('3× gespielt')
    expect(section(page)!.text()).not.toContain('im Pool')
  })

  it('keeps the longest Event name whole, wrapping anywhere', async () => {
    rows = [row('lang-1', LONG_NAME, 0)]
    const page = await mountPage()
    await vi.waitFor(() => expect(items(page)).toHaveLength(1))

    const link = items(page)[0]!.get('a')
    expect(link.text()).toBe(LONG_NAME)
    expect(link.classes()).toContain('[overflow-wrap:anywhere]')
  })

  it('shows the Event notes read-only in a collapsed disclosure, only for the row that has them', async () => {
    rows = [row('mit-1', 'Mit Notizen', 1, FORMATTED_NOTES), row('ohne-1', 'Ohne Notizen', 0)]
    const page = await mountPage()
    await vi.waitFor(() => expect(items(page)).toHaveLength(2))

    const buttons = section(page)!.findAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.text()).toBe('Notizen für dieses Event')
    expect(items(page)[0]!.find('button').exists()).toBe(true)
    expect(items(page)[1]!.find('button').exists()).toBe(false)
    expect(buttons[0]!.attributes('aria-expanded')).toBe('false')
    expect(section(page)!.text()).not.toContain('Erstens')

    await buttons[0]!.trigger('click')

    expect(buttons[0]!.attributes('aria-expanded')).toBe('true')
    const shown = readFormatted(items(page)[0]!.element)
    expect(shown.items).toEqual(['Erstens', 'Zweitens'])
    expect(shown.bold).toBe('Wichtig')
    // The page's h1 and this section's h2 come first, so the notes' own heading is an h3.
    expect(shown.heading).toBe('h3')
  })

  it('keeps the game on screen with a warning and no list when the Events read fails', async () => {
    eventsStatus = 500
    const page = await mountPage()
    await vi.waitFor(() => expect(page.text()).toContain('Die Events dieses Spiels lassen sich gerade nicht laden.'))

    expect(page.get('h1').text()).toBe('Mario Kart')
    expect(section(page)).toBeUndefined()
    expect(page.findAll('li').filter(item => item.find('a[href^="/e/"]').exists())).toHaveLength(0)
  })

  it('shows the Construction page for an unknown game and no Events', async () => {
    gameStatus = 404
    const page = await mountSuspended(DetailPage, { route: `/bibliothek/${ID}` })
    await vi.waitFor(() => expect(page.find('h1').exists()).toBe(true))

    expect(page.text()).not.toContain('Mario Kart')
    expect(section(page)).toBeUndefined()
    expect(page.text()).not.toContain('Deine Events mit diesem Spiel')
  })
})
