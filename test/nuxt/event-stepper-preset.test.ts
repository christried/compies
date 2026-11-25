import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameBrowser from '~/components/GameBrowser.vue'
import StepPool from '~/components/stepper/StepPool.vue'
import { newDraft, type EventDraft } from '~/utils/event-draft'
import CreatePage from '~/pages/neu.vue'
import EditorPage from '~/pages/e/[slug]/einstellungen.vue'
import { NO_FILTERS, type GameFilters, type GameView } from '~~/shared/game'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, view } from './event-page'
import { game as libraryGame, host, settle } from './helpers/library'

// The „Spiele“ step is preset to the Event (#690, spec #894): „Spielerzahl“ and „Passt zu“ start at the Event's team count times
// Team size and its kind of play, a line says what that hides, and „Alle zeigen“ ends it. The browser's part is first, then the step's.

type Page = VueWrapper

const mounted: Page[] = []
afterEach(() => {
  mounted.splice(0).forEach(page => page.unmount())
})

let library: GameView[] = []
const requested = vi.fn()
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => {
    requested()
    return { games: library, tagsInUse: [{ key: 'retro', label: 'Retro' }], eventCounts: {} }
  },
})
registerEndpoint('/api/games/tags', { method: 'GET', handler: () => [{ key: 'retro', label: 'Retro' }] })

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const select = (page: Page, label: string) => page.find(`select[aria-label="${label}"]`)

beforeEach(async () => {
  signInAs(host)
  library = [libraryGame({ id: ID(1), name: 'Mario Kart' })]
  requested.mockClear()
  await clearNuxtData('games')
  useState('game-library').value = null
})

async function mountBrowser(props: { compact?: boolean, fitSelects?: boolean, filters?: GameFilters }): Promise<Page> {
  const page = await mountSuspended(GameBrowser, { props: { filters: { ...NO_FILTERS }, ...props } })
  mounted.push(page)
  await settle(page)
  return page
}

describe('the game browser of the step (#690)', () => {
  it('shows „Spielerzahl“ and „Passt zu“ in the compact browser with fitSelects, and still no „Archiviert“', async () => {
    const page = await mountBrowser({ compact: true, fitSelects: true })

    expect(select(page, 'Spielerzahl').exists()).toBe(true)
    expect(select(page, 'Passt zu').exists()).toBe(true)
    expect(page.findAll('button').map(button => button.text())).not.toContain('Archiviert')
  })

  it('keeps the compact browser without the two selects when fitSelects is off', async () => {
    const page = await mountBrowser({ compact: true })

    expect(select(page, 'Spielerzahl').exists()).toBe(false)
    expect(select(page, 'Passt zu').exists()).toBe(false)
  })

  it('shows a player count above the 24 offered as the select\'s value, as a Tag no game carries any more is shown', async () => {
    const page = await mountBrowser({ compact: true, fitSelects: true, filters: { ...NO_FILTERS, players: 30 } })

    const players = select(page, 'Spielerzahl')
    expect((players.element as HTMLSelectElement).value).toBe('30')
    expect(players.findAll('option').map(option => option.text())).toContain('30 Spielende')
  })

  it('offers 24 players and no 30 when nothing above 24 is active', async () => {
    const page = await mountBrowser({ compact: true, fitSelects: true })

    const values = select(page, 'Spielerzahl').findAll('option').map(option => (option.element as HTMLOptionElement).value)
    expect(values).toContain('24')
    expect(values).not.toContain('30')
  })
})

// The step itself. The library: a game that fits the default Event (2 teams of 3: Teams, 6 players), one too big by count, one
// without any count or Suitability, an Archived one that fits, and a 1v1 game (the same Event's list hides it).
const fits = libraryGame({ id: ID(1), name: 'Passt gut', playersMin: 2, playersMax: 8, suitabilities: ['teams'] })
const tooBig = libraryGame({ id: ID(2), name: 'Zu gross', playersMin: 10, playersMax: null, suitabilities: ['teams'] })
const bare = libraryGame({ id: ID(3), name: 'Ohne Angaben' })
const old = libraryGame({ id: ID(4), name: 'Alt Passt', playersMin: 2, playersMax: 8, suitabilities: ['teams'], archived: true })
const duel = libraryGame({ id: ID(5), name: 'Duell', playersMin: 2, playersMax: 2, suitabilities: ['one_v_one'] })
const retroKart = libraryGame({ id: ID(6), name: 'Retro Kart', playersMin: 2, playersMax: 8, suitabilities: ['teams'], tags: [{ key: 'retro', label: 'Retro' }] })

const LINE = 'Auf dein Event eingestellt'
const cards = (page: Page) => page.findAll('ul[aria-label="Bibliothek"] li').map(card => card.get('b').text())
const line = (page: Page) => page.findAll('[role="status"]').find(element => element.text().includes(LINE))
const chosen = (page: Page, label: string) => {
  const element = select(page, label).element as HTMLSelectElement
  return element.selectedOptions[0]!.textContent!.trim()
}
const allButton = (page: Page) => page.findAll('button').find(button => button.text() === 'Alle')!
const showAll = (page: Page) => line(page)!.findAll('button').find(button => button.text() === 'Alle zeigen')!

async function mountCreate(): Promise<Page> {
  signInAs(host)
  const page = await mountSuspended(CreatePage, { route: '/neu', attachTo: document.body })
  mounted.push(page)
  return page
}
const cta = (page: Page) => page.get('button[type="submit"]')
async function next(page: Page, times = 1) {
  for (let i = 0; i < times; i++) await cta(page).trigger('click')
}
async function back(page: Page, times = 1) {
  for (let i = 0; i < times; i++) await page.findAll('button').find(item => item.text().includes('Zurück') && item.attributes('type') === 'button')!.trigger('click')
}
async function toPoolStep(page: Page) {
  await page.get('input[type="text"]').setValue('Freitags-Zocken')
  await next(page, 5)
  await settle(page)
}

async function mountSettings(settings: EventSettings = defaultSettings(), options: { canHost?: boolean, pool?: GameView[] } = {}): Promise<Page> {
  const { slug } = serve(s => view(s, [], { event: { isHost: true, phase: 'poll' }, settings, pool: options.pool ?? [] }))
  signInAs({ ...kitty, canHost: options.canHost ?? true })
  const page = await mountSuspended(EditorPage, { route: `/e/${slug}/einstellungen`, attachTo: document.body })
  mounted.push(page)
  await page.get('nav[aria-label="Schritte"]').findAll('li').find(item => item.text().endsWith('Spielepool'))!.get('button').trigger('click')
  if (options.canHost !== false) await settle(page)
  return page
}

async function mountStep(settings: EventSettings = defaultSettings()): Promise<Page> {
  const draft: EventDraft = { ...newDraft(), settings }
  const page = await mountSuspended(StepPool, { props: { modelValue: draft } })
  mounted.push(page)
  await settle(page)
  return page
}
const withTeams = (teamCount: number, teamSize: number): EventSettings => ({ ...defaultSettings(), teamCount, teamSize })
async function newDraftOf(page: Page, settings: EventSettings) {
  await page.setProps({ modelValue: { ...newDraft(), settings } })
}

describe('the „Spiele“ step starts from the Event (#690)', () => {
  beforeEach(async () => {
    signInAs(host)
    library = [fits, tooBig, bare, old, duel]
    await clearNuxtData('games')
    useState('game-library').value = null
  })

  it('reads 6 players and Teams at the start of the default Event, lists the fitting game and says what is hidden', async () => {
    const page = await mountCreate()
    await toPoolStep(page)

    expect(chosen(page, 'Spielerzahl')).toBe('6 Spielende')
    expect(chosen(page, 'Passt zu')).toBe('Teams')
    expect(cards(page)).toEqual(['Passt gut'])
    expect(line(page)!.text()).toContain('Auf dein Event eingestellt: passt zu Teams, 6 Spielende.')
    expect(line(page)!.text()).toContain('3 Spiele ausgeblendet.')
    expect(showAll(page).exists()).toBe(true)
  })

  it('reads 2 players and 1v1 for two teams of one in the settings editor', async () => {
    const page = await mountSettings(withTeams(2, 1))

    expect(chosen(page, 'Spielerzahl')).toBe('2 Spielende')
    expect(chosen(page, 'Passt zu')).toBe('1v1')
    expect(cards(page)).toEqual(['Duell'])
    expect(line(page)!.text()).toContain('Auf dein Event eingestellt: passt zu 1v1, 2 Spielende.')
    expect(line(page)!.text()).toContain('3 Spiele ausgeblendet.')
  })

  it('follows a changed team size: back to „Format“, one more per team, forward to the step', async () => {
    const page = await mountCreate()
    await toPoolStep(page)
    await back(page, 4)

    await page.get('button[aria-label="Spielende pro Team: mehr"]').trigger('click')
    await next(page, 4)
    await settle(page)

    expect(chosen(page, 'Spielerzahl')).toBe('8 Spielende')
    expect(chosen(page, 'Passt zu')).toBe('Teams')
  })

  it('keeps the filters equal to the Event while the Host has not touched them', async () => {
    const page = await mountStep()
    expect(chosen(page, 'Spielerzahl')).toBe('6 Spielende')

    await newDraftOf(page, withTeams(2, 4))
    expect(chosen(page, 'Spielerzahl')).toBe('8 Spielende')

    await newDraftOf(page, withTeams(2, 1))
    expect(chosen(page, 'Spielerzahl')).toBe('2 Spielende')
    expect(chosen(page, 'Passt zu')).toBe('1v1')
  })

  it('stops following when the Host picks another Spielerzahl, and the line goes', async () => {
    const page = await mountStep()

    await select(page, 'Spielerzahl').setValue('3')
    expect(line(page)).toBeUndefined()

    await newDraftOf(page, withTeams(2, 4))
    expect(chosen(page, 'Spielerzahl')).toBe('3 Spielende')
  })

  it('stops following when the Host picks another „Passt zu“', async () => {
    const page = await mountStep()

    await select(page, 'Passt zu').setValue('ffa')
    expect(line(page)).toBeUndefined()

    await newDraftOf(page, withTeams(2, 1))
    expect(chosen(page, 'Passt zu')).toBe('FFA')
    expect(chosen(page, 'Spielerzahl')).toBe('6 Spielende')
  })

  it('stops following when the Host picks a Tag, and keeps what the preset was', async () => {
    library = [fits, retroKart]
    const page = await mountStep()

    await select(page, 'Tag').setValue('retro')
    expect(cards(page)).toEqual(['Retro Kart'])
    expect(line(page)).toBeUndefined()

    await newDraftOf(page, withTeams(2, 4))
    expect(chosen(page, 'Spielerzahl')).toBe('6 Spielende')
    expect(chosen(page, 'Passt zu')).toBe('Teams')
  })

  it('stops following at „Alle“: every normal game is listed, the line goes and a new draft changes nothing', async () => {
    const page = await mountStep()

    await allButton(page).trigger('click')
    expect(cards(page)).toEqual(['Passt gut', 'Zu gross', 'Ohne Angaben', 'Duell'])
    expect(line(page)).toBeUndefined()

    await newDraftOf(page, withTeams(2, 4))
    expect(chosen(page, 'Spielerzahl')).toBe('Spielerzahl')
    expect(chosen(page, 'Passt zu')).toBe('Passt zu')
  })

  it('keeps the preset while the Host searches, and the line with its count and „Alle zeigen“', async () => {
    const page = await mountStep()

    await page.get('input[type="search"]').setValue('passt')

    expect(chosen(page, 'Spielerzahl')).toBe('6 Spielende')
    expect(chosen(page, 'Passt zu')).toBe('Teams')
    expect(cards(page)).toEqual(['Passt gut'])
    expect(line(page)!.text()).toContain('3 Spiele ausgeblendet.')

    await newDraftOf(page, withTeams(2, 4))
    expect(chosen(page, 'Spielerzahl')).toBe('8 Spielende')
  })

  it('finds a game the preset hides through the search and the line: „Alle zeigen“ lists it', async () => {
    const page = await mountStep()

    await page.get('input[type="search"]').setValue('Zu gross')
    expect(page.find('ul[aria-label="Bibliothek"]').exists()).toBe(false)
    expect(line(page)).toBeDefined()

    await showAll(page).trigger('click')

    expect(cards(page)).toContain('Zu gross')
  })

  it('says no count when every normal game fits, and counts one hidden game in the singular', async () => {
    library = [fits, old]
    const page = await mountStep()
    expect(line(page)!.text()).toContain('passt zu Teams, 6 Spielende.')
    expect(line(page)!.text()).not.toContain('ausgeblendet')
    mounted.pop()!.unmount()

    library = [fits, bare]
    await clearNuxtData('games')
    useState('game-library').value = null
    const again = await mountStep()
    expect(line(again)!.text()).toContain('1 Spiel ausgeblendet.')
  })

  it('„Alle zeigen“ does what „Alle“ does: both selects empty, every normal game listed, the „Alle“ chip pressed', async () => {
    const page = await mountStep()

    await showAll(page).trigger('click')

    expect(chosen(page, 'Spielerzahl')).toBe('Spielerzahl')
    expect(chosen(page, 'Passt zu')).toBe('Passt zu')
    expect(cards(page)).toEqual(['Passt gut', 'Zu gross', 'Ohne Angaben', 'Duell'])
    expect(line(page)).toBeUndefined()
    expect(allButton(page).attributes('aria-pressed')).toBe('true')
  })

  it('leaves the chosen games alone: one the preset hides stays in „Im Pool“ with its ✕ after „Alle zeigen“', async () => {
    const page = await mountSettings(defaultSettings(), { pool: [bare] })

    expect(page.get('ul[aria-label="Spiele im Pool"]').findAll('li').map(row => row.get('b').text())).toEqual(['Ohne Angaben'])
    expect(cards(page)).toEqual(['Passt gut'])

    await showAll(page).trigger('click')

    expect(page.get('ul[aria-label="Spiele im Pool"]').findAll('li').map(row => row.get('b').text())).toEqual(['Ohne Angaben'])
    expect(page.get('ul[aria-label="Bibliothek"]').find('button[aria-label="Ohne Angaben aus dem Pool nehmen"]').exists()).toBe(true)
    expect(page.get('ul[aria-label="Bibliothek"]').find('button[aria-label="Passt gut in den Pool"]').exists()).toBe(true)
  })

  it('shows neither the browser nor the line to a Host without the Host permission, and asks for no library', async () => {
    const page = await mountSettings(defaultSettings(), { canHost: false })

    expect(page.text()).toContain('Ohne Host-Berechtigung kannst du keine Spiele aus der Bibliothek hinzufügen.')
    expect(select(page, 'Spielerzahl').exists()).toBe(false)
    expect(line(page)).toBeUndefined()
    expect(page.findAll('button').some(button => button.text() === 'Alle zeigen')).toBe(false)
    expect(requested).not.toHaveBeenCalled()
  })

  describe('edge cases', () => {
    it('has no filter row and no line for an empty library', async () => {
      library = []
      const page = await mountStep()

      expect(select(page, 'Spielerzahl').exists()).toBe(false)
      expect(line(page)).toBeUndefined()
    })

    it('has the line without a count for a library of only Archived games', async () => {
      library = [old]
      const page = await mountStep()

      expect(line(page)!.text()).toContain('passt zu Teams, 6 Spielende.')
      expect(line(page)!.text()).not.toContain('ausgeblendet')
    })

    it('shows the empty list and the line with its count when the preset hides everything, and one click lists the games', async () => {
      library = [bare, tooBig]
      const page = await mountStep()

      expect(page.find('ul[aria-label="Bibliothek"]').exists()).toBe(false)
      expect(page.text()).toContain('Nix gefunden.')
      expect(line(page)!.text()).toContain('2 Spiele ausgeblendet.')

      await showAll(page).trigger('click')

      expect([...cards(page)].sort()).toEqual(['Ohne Angaben', 'Zu gross'])
    })

    it('pages as before: 40 cards and „Mehr laden“ for more than 40 fitting games', async () => {
      library = Array.from({ length: 45 }, (_, index) => libraryGame({ id: ID(100 + index), name: `Spiel ${String(index).padStart(2, '0')}`, playersMin: 2, playersMax: 8, suitabilities: ['teams'] }))
      const page = await mountStep()

      expect(cards(page)).toHaveLength(40)
      expect(page.findAll('button').some(button => button.text() === 'Mehr laden')).toBe(true)
      expect(line(page)!.text()).not.toContain('ausgeblendet')
    })

    it('hides a game with only a minimum of 4 at 3 players and shows it at 6', async () => {
      library = [libraryGame({ id: ID(1), name: 'Ab vier', playersMin: 4, playersMax: null, suitabilities: ['teams'] })]

      const three = await mountStep(withTeams(3, 1))
      expect(cards(three)).toEqual([])
      expect(line(three)!.text()).toContain('1 Spiel ausgeblendet.')

      const six = await mountStep()
      expect(cards(six)).toEqual(['Ab vier'])
    })
  })
})
