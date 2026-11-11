import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, Fragment, h } from 'vue'
import EditorPage from '~/pages/e/[slug]/einstellungen.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { BoardTeam, MemberView } from '~~/shared/event'
import type { SetGameView, SpinView, WheelView } from '~~/shared/stage'
import type { PoolGame } from '~~/shared/game'
import { defaultSettings, type EventSettings, type SettingsFloors } from '~~/shared/settings'
import { INSTANT_MARGIN_MS } from '~/composables/useInstantRefresh'
import { kitty, signInAs } from './auth'
import { LARSI, memberView, SANNE, serve, shownToasts, view } from './event-page'

// The settings editor (#147): the stepper's steps 2 to 7 on an Event that exists, prefilled, with the settings
// that stay fixed once the Event runs shown locked with their reason.

const LOCKED = 'Gesperrt, seit die erste Session läuft: Schon gespielte Spiele behalten ihre Regeln.'

const kart = poolGame(1, 'Mario Kart')
const pong = poolGame(2, 'Pong')

const FOUR = '00000000-0000-4000-8000-000000000004'
const FIVE = '00000000-0000-4000-8000-000000000005'
const SIX = '00000000-0000-4000-8000-000000000006'
const seated = (id: string, zone: 'stands' | 'team', team: number | null = null): MemberView => memberView({ id, name: id.slice(-4), zone, team })

function poolGame(n: number, name: string): PoolGame {
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name, imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], notes: null, price: null }
}

// The library the pool steps pick from.
const listed = vi.fn()
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => {
    listed()
    return { games: [kart, pong].map(game => ({ ...game, createdBy: { id: kitty.id, name: 'Kitty' }, createdAt: '2026-01-15T10:00:00.000Z', canEdit: true })), tagsInUse: [] }
  },
})

type Page = VueWrapper
const mounted: Page[] = []
afterEach(() => {
  mounted.splice(0).forEach(page => page.unmount())
})

interface Setup {
  settings?: EventSettings | null
  phase?: string
  isHost?: boolean
  floors?: SettingsFloors | null
  pool?: PoolGame[]
  /** The Members with their seats, and the teams of the board (the Event read's `members` and `teams`, #160). */
  members?: MemberView[]
  teams?: BoardTeam[]
  /** The Host's set-game read (the live pool warning of a running Event, #234); the view's default when unset. */
  setGame?: SetGameView | null
  /** The refusal the PATCH answers with, or null to accept. */
  refuse?: { statusCode: number, statusMessage: string } | null
}

/** A fresh Event for one test with its GET and PATCH endpoints; `patched` collects the PATCH bodies. */
function setUp(setup: Setup = {}) {
  const patched = vi.fn()
  const { slug, set } = serve(s => view(s, [], {
    event: { isHost: setup.isHost ?? true, phase: setup.phase ?? 'poll' },
    settings: setup.settings === undefined ? defaultSettings() : setup.settings,
    settingsFloors: setup.floors,
    pool: setup.pool ?? [],
    members: setup.members,
    teams: setup.teams,
    setGame: setup.setGame,
  }))
  registerEndpoint(`/api/e/${slug}/settings`, {
    method: 'PATCH',
    handler: async (event) => {
      const body = await readBody(event)
      patched(body)
      if (setup.refuse) throw createError(setup.refuse)
      return { settings: body.settings }
    },
  })
  return { slug, patched, set }
}

async function mountEditor(slug: string, canHost = true): Promise<Page> {
  signInAs({ ...kitty, canHost })
  const page = await mountSuspended(EditorPage, { route: `/e/${slug}/einstellungen`, attachTo: document.body })
  mounted.push(page)
  return page
}

// The editor and the Event page in one app, so the save's refresh of the Event's read reaches the page (#174).
async function mountEditorAndEventPage(slug: string): Promise<Page> {
  signInAs({ ...kitty, canHost: true })
  const both = defineComponent({ setup: () => () => h(Fragment, [h(EditorPage), h(EventPage, { slug })]) })
  const page = await mountSuspended(both, { route: `/e/${slug}/einstellungen`, attachTo: document.body })
  mounted.push(page)
  return page
}

const cta = (page: Page) => page.get('button[type="submit"]')
const stepItems = (page: Page) => page.get('nav[aria-label="Schritte"]').findAll('li')
const spin = (page: Page, label: string) => page.findAll('[role="spinbutton"]').find(stepper => stepper.attributes('aria-label') === label)!
const button = (page: Page, label: string) => page.get(`button[aria-label="${label}"]`)
const checked = (page: Page) => page.findAll('[role="radio"]').filter(radio => radio.attributes('aria-checked') === 'true').map(radio => radio.get('b').text())

async function goTo(page: Page, label: string) {
  const link = stepItems(page).find(item => item.text().endsWith(label))!.get('button')
  await link.trigger('click')
}

async function settle(page: Page) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
  await vi.waitFor(() => expect(page.find('ul[aria-label="Bibliothek"]').exists()).toBe(true))
}

const wheel: EventSettings = { ...defaultSettings(), teamSize: 4, gameCount: 7, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 2, poolPreview: false }

describe('the settings editor', () => {
  beforeEach(() => {
    useState('toasts').value = []
  })

  it('shows the Construction page to a Member, like any page of an Event that does not exist', async () => {
    const { slug } = setUp({ isHost: false })

    const page = await mountEditor(slug)

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
    expect(page.find('form').exists()).toBe(false)
  })

  it('has the five steps of an Event, every one of them a link from the start, and calls itself Einstellungen', async () => {
    const { slug } = setUp()

    const page = await mountEditor(slug)

    expect(stepItems(page).map(item => item.text().replace(/^\d\s*|^✓\s*/, ''))).toEqual(['Format', 'Spiele', 'Punkte', 'Auswahlmodus', 'Spielepool'])
    expect(stepItems(page).slice(1).every(item => item.find('button').exists())).toBe(true)
    expect(page.get('nav[aria-label="Schritte"]').text()).toContain('Einstellungen')
    expect(page.get('h1').text()).toContain('Wer gegen wen?')
  })

  it('keeps the hub nav in its header, with Events current and the Event’s name and Phase under it (#426)', async () => {
    const { slug } = setUp()

    const page = await mountEditor(slug)

    const nav = page.get('header nav[aria-label="Hauptnavigation"]')
    expect(nav.get('[aria-current="page"]').text()).toContain('Events')
    const events = nav.get('a')
    const line = events.findAll('[aria-hidden="true"]').find(element => element.text() !== '')!
    expect(line.text()).toContain('Freitags-Zocken')
    expect(line.text()).toContain('Terminumfrage')
    expect(nav.get(`#${events.attributes('aria-describedby')}`).text()).toBe('Event: Freitags-Zocken, Phase: Terminumfrage')
  })

  it('calls itself Event einrichten while the Event has no settings, and starts from the defaults', async () => {
    const { slug } = setUp({ settings: null })

    const page = await mountEditor(slug)

    expect(page.get('nav[aria-label="Schritte"]').text()).toContain('Event einrichten')
    expect(spin(page, 'Spieler pro Team').text()).toBe('3')
  })

  it('tells a Host without the Host permission that the library is closed, keeps the pool and asks for no games (#173)', async () => {
    const { slug, patched } = setUp({ settings: wheel, pool: [kart, pong] })
    listed.mockClear()

    const page = await mountEditor(slug, false)
    await goTo(page, 'Spielepool')

    expect(page.text()).toContain('Ohne Host-Berechtigung kannst du keine Spiele aus der Bibliothek hinzufügen. Die Spiele im Pool bleiben.')
    expect(page.find('input[type="search"]').exists()).toBe(false)
    expect(page.findAll('button').some(item => item.text().includes('Neues Spiel anlegen'))).toBe(false)
    expect(page.find('ul[aria-label="Bibliothek"]').exists()).toBe(false)
    expect(page.find('ul[aria-label="Spiele im Pool"]').exists()).toBe(true)

    await button(page, 'Pong aus dem Pool nehmen').trigger('click')
    expect(page.find('input[type="search"]').exists()).toBe(false)
    await cta(page).trigger('click')
    await vi.waitFor(() => expect(patched).toHaveBeenCalledWith(expect.objectContaining({ pool: [kart.id] })))
    expect(listed).not.toHaveBeenCalled()
  })

  it('starts from the Event: Team size, Game count, Selection mode with its wheel options, and the pools', async () => {
    const { slug } = setUp({ settings: wheel, pool: [kart, pong] })

    const page = await mountEditor(slug)
    expect(spin(page, 'Spieler pro Team').text()).toBe('4')

    await goTo(page, 'Spiele')
    expect(page.get('output').text()).toBe('7')

    await goTo(page, 'Auswahlmodus')
    expect(checked(page)).toEqual(['Glücksrad'])
    expect(page.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(spin(page, 'Vetos pro Partei').text()).toBe('2')

    await goTo(page, 'Spielepool')
    await settle(page)
    expect(page.text()).toContain('Im Pool: 2 Spiele')
    expect(page.text()).not.toContain('Tiebreaker')
  })

  it('saves what the Host changed, from the last step, and goes back to the Event with a toast', async () => {
    const { slug, patched } = setUp({ settings: wheel, pool: [kart] })
    const page = await mountEditor(slug)
    await goTo(page, 'Spiele')
    await button(page, 'Anzahl Spiele: mehr').trigger('click')
    await goTo(page, 'Spielepool')
    await settle(page)
    await page.get('ul[aria-label="Bibliothek"]').get('button[aria-label="Pong in den Pool"]').trigger('click')

    expect(cta(page).text()).toBe('Speichern')
    await cta(page).trigger('click')

    await vi.waitFor(() => expect(patched).toHaveBeenCalledTimes(1))
    expect(patched).toHaveBeenCalledWith({
      settings: { ...wheel, gameCount: 8 },
      pool: [kart.id, pong.id],
    })
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe(`/e/${slug}`))
    expect(shownToasts().map(toast => toast.text)).toContain('Gespeichert.')
  })

  // The Event page shows the saved settings at once: the save refreshes the Event's read by its shared key, so the
  // page does not wait for its next 15 s poll (#174). The page's own summary is checked, not the editor's step.
  it('shows the saved settings on the Event page at once, without waiting for the poll', async () => {
    const { slug, set } = setUp({ settings: wheel, pool: [kart] })
    const page = await mountEditorAndEventPage(slug)
    const eventSettings = () => page.findAll('section').find(section => section.findAll('h2').some(heading => heading.text() === 'So wird gespielt'))!
    await vi.waitFor(() => expect(eventSettings().text()).toContain('7 Spiele'))

    set(view(slug, [], { event: { isHost: true, phase: 'poll' }, settings: { ...wheel, gameCount: 8 }, pool: [kart] }))
    await goTo(page, 'Spiele')
    await button(page, 'Anzahl Spiele: mehr').trigger('click')
    await goTo(page, 'Spielepool')
    await settle(page)
    await cta(page).trigger('click')

    await vi.waitFor(() => expect(eventSettings().text()).toContain('8 Spiele'))
    expect(eventSettings().text()).not.toContain('7 Spiele')
  })

  it('goes on with Weiter until the last step, where it saves', async () => {
    const { slug } = setUp()
    const page = await mountEditor(slug)

    expect(cta(page).text()).toContain('Weiter')
    for (let step = 0; step < 4; step++) {
      await cta(page).trigger('click')
      await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
    }

    expect(page.get('h1').text()).toContain('Welche Spiele kommen in den Pool?')
    expect(cta(page).text()).toContain('Speichern')
  })

  it('shows the reason of a refusal in the page and stays', async () => {
    const { slug } = setUp({ refuse: { statusCode: 409, statusMessage: 'setting_locked' } })
    const page = await mountEditor(slug)
    await goTo(page, 'Spielepool')
    await settle(page)

    await cta(page).trigger('click')

    await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Das lässt sich nicht mehr ändern, seit die erste Session läuft.'))
    expect(useRouter().currentRoute.value.path).toBe(`/e/${slug}/einstellungen`)
    expect(shownToasts().map(toast => toast.text)).not.toContain('Gespeichert.')
  })

  it('names a finished Event as the reason when the server refuses with wrong_phase', async () => {
    const { slug } = setUp({ refuse: { statusCode: 409, statusMessage: 'wrong_phase' } })
    const page = await mountEditor(slug)
    await goTo(page, 'Spielepool')
    await settle(page)

    await cta(page).trigger('click')

    await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Das Event ist beendet. Die Einstellungen lassen sich nicht mehr ändern.'))
  })

  describe('floors', () => {
    it('keeps the Team size from going below the fullest team, and says why', async () => {
      const { slug } = setUp({
        settings: { ...defaultSettings(), teamSize: 4 },
        floors: { teamSize: 4, vetoAllowance: 0, gameCount: 0 },
        teams: [{ position: 1, name: null }, { position: 2, name: null }],
        members: [seated(kitty.id, 'team', 1), seated(LARSI, 'team', 1), seated(SANNE, 'team', 1), seated(FOUR, 'team', 1)],
      })

      const page = await mountEditor(slug)

      const less = button(page, 'Spieler pro Team: weniger')
      expect(less.attributes('aria-disabled')).toBe('true')
      expect(less.attributes('title')).toBe('Im vollsten Team sind schon 4.')
      await less.trigger('click')
      expect(spin(page, 'Spieler pro Team').text()).toBe('4')
    })

    it('keeps the Veto allowance from going below the most Vetoes a Party has spent, and says why', async () => {
      const { slug } = setUp({ settings: wheel, floors: { teamSize: 1, vetoAllowance: 2, gameCount: 0 } })
      const page = await mountEditor(slug)
      await goTo(page, 'Auswahlmodus')

      const less = button(page, 'Vetos pro Partei: weniger')

      expect(less.attributes('aria-disabled')).toBe('true')
      expect(less.attributes('title')).toBe('Eine Partei hat schon 2 Vetos eingesetzt.')
    })

    it('says one spent Veto in the singular (#268)', async () => {
      const { slug } = setUp({ settings: { ...wheel, vetoAllowance: 1 }, floors: { teamSize: 1, vetoAllowance: 1, gameCount: 0 } })
      const page = await mountEditor(slug)
      await goTo(page, 'Auswahlmodus')

      expect(button(page, 'Vetos pro Partei: weniger').attributes('title')).toBe('Eine Partei hat schon 1 Veto eingesetzt.')
    })

    it('keeps the Game count from going below the Rounds already started, and says why (#228)', async () => {
      const { slug } = setUp({ settings: { ...defaultSettings(), gameCount: 4 }, floors: { teamSize: 1, vetoAllowance: 0, gameCount: 3 } })
      const page = await mountEditor(slug)
      await goTo(page, 'Spiele')

      const less = button(page, 'Anzahl Spiele: weniger')
      expect(less.attributes('aria-disabled')).toBeUndefined()
      await less.trigger('click')

      expect(spin(page, 'Anzahl Spiele').text()).toBe('3')
      expect(button(page, 'Anzahl Spiele: weniger').attributes('title')).toBe('Schon 3 gestartet.')
      expect(button(page, 'Anzahl Spiele: weniger').attributes('aria-disabled')).toBe('true')
    })

    it('has the usual limits when nothing is spent yet', async () => {
      const { slug } = setUp({ settings: { ...wheel, teamSize: 1 }, floors: { teamSize: 1, vetoAllowance: 0, gameCount: 0 } })
      const page = await mountEditor(slug)
      expect(button(page, 'Spieler pro Team: weniger').attributes('title')).toBe('Mindestens 1 pro Team.')
    })
  })

  describe('the teams (#163)', () => {
    const four = { ...defaultSettings(), teamCount: 4, teamSize: 3, pointsTable: { preset: 'linear' as const, values: [3, 2, 1, 0] } }
    const teamsOf4 = [{ position: 1, name: null }, { position: 2, name: null }, { position: 3, name: null }, { position: 4, name: null }]

    it('shows the Team size floor the Event read gives, the fullest team, and says why', async () => {
      const { slug } = setUp({
        settings: four,
        floors: { teamSize: 2, vetoAllowance: 0, gameCount: 0 },
        teams: teamsOf4,
        members: [seated(kitty.id, 'team', 1), seated(LARSI, 'team', 3), seated(SANNE, 'team', 3), seated(FOUR, 'stands')],
      })
      const page = await mountEditor(slug)

      const less = button(page, 'Spieler pro Team: weniger')
      expect(less.attributes('aria-disabled')).toBeUndefined()
      await less.trigger('click')

      expect(spin(page, 'Spieler pro Team').text()).toBe('2')
      expect(button(page, 'Spieler pro Team: weniger').attributes('title')).toBe('Im vollsten Team sind schon 2.')
      expect(button(page, 'Spieler pro Team: weniger').attributes('aria-disabled')).toBe('true')
    })

    it('lowers the Team size floor with the team count, and raises it again with the count (#197)', async () => {
      const { slug } = setUp({
        settings: four,
        teams: teamsOf4,
        members: [seated(kitty.id, 'team', 1), seated(LARSI, 'team', 2), seated(SANNE, 'team', 3), seated(FOUR, 'team', 4), seated(FIVE, 'team', 4), seated(SIX, 'team', 4)],
      })
      const page = await mountEditor(slug)
      expect(button(page, 'Spieler pro Team: weniger').attributes('title')).toBe('Im vollsten Team sind schon 3.')

      await button(page, 'Anzahl Teams: weniger').trigger('click')
      expect(spin(page, 'Anzahl Teams').text()).toBe('3')
      await button(page, 'Spieler pro Team: weniger').trigger('click')
      await button(page, 'Spieler pro Team: weniger').trigger('click')

      expect(spin(page, 'Spieler pro Team').text()).toBe('1')
      expect(button(page, 'Spieler pro Team: weniger').attributes('title')).toBe('Mindestens 1 pro Team.')
      expect(button(page, 'Spieler pro Team: weniger').attributes('aria-disabled')).toBe('true')

      await button(page, 'Anzahl Teams: mehr').trigger('click')
      expect(spin(page, 'Anzahl Teams').text()).toBe('4')
      expect(spin(page, 'Spieler pro Team').text()).toBe('3')
      expect(button(page, 'Spieler pro Team: weniger').attributes('title')).toBe('Im vollsten Team sind schon 3.')
    })

    it('tells the Host how many Players go to the Stands when the team count drops, singular and plural', async () => {
      const { slug } = setUp({
        settings: four,
        teams: teamsOf4,
        members: [seated(kitty.id, 'team', 1), seated(LARSI, 'team', 3), seated(SANNE, 'team', 3), seated(FOUR, 'team', 4), seated(FIVE, 'stands')],
      })
      const page = await mountEditor(slug)
      expect(page.text()).not.toContain('Beim Speichern')

      await button(page, 'Anzahl Teams: weniger').trigger('click')
      expect(spin(page, 'Anzahl Teams').text()).toBe('3')
      expect(page.text()).toContain('Beim Speichern geht 1 Person aus den entfernten Teams auf die Tribüne.')

      await button(page, 'Anzahl Teams: weniger').trigger('click')
      expect(spin(page, 'Anzahl Teams').text()).toBe('2')
      expect(page.text()).toContain('Beim Speichern gehen 3 Leute aus den entfernten Teams auf die Tribüne.')
    })

    it('shows no Stands hint when the teams that go are empty', async () => {
      const { slug } = setUp({
        settings: four,
        teams: teamsOf4,
        members: [seated(kitty.id, 'team', 1), seated(LARSI, 'team', 2), seated(SANNE, 'stands')],
      })
      const page = await mountEditor(slug)

      await button(page, 'Anzahl Teams: weniger').trigger('click')
      await button(page, 'Anzahl Teams: weniger').trigger('click')

      expect(spin(page, 'Anzahl Teams').text()).toBe('2')
      expect(page.text()).not.toContain('Beim Speichern')
    })
  })

  describe('while the Event is running', () => {
    it('shows Format and the team count locked with the reason, but lets the Team size change', async () => {
      const { slug } = setUp({ settings: wheel, phase: 'running' })

      const page = await mountEditor(slug)

      expect(page.text()).toContain(LOCKED)
      expect(checked(page)).toEqual(['Teams'])
      expect(page.findAll('[role="radio"]').every(radio => radio.attributes('aria-disabled') === 'true')).toBe(true)
      expect(button(page, 'Anzahl Teams: mehr').attributes('aria-disabled')).toBe('true')
      expect(button(page, 'Anzahl Teams: weniger').attributes('aria-disabled')).toBe('true')
      expect(button(page, 'Spieler pro Team: mehr').attributes('aria-disabled')).toBeUndefined()
      await button(page, 'Spieler pro Team: mehr').trigger('click')
      expect(spin(page, 'Spieler pro Team').text()).toBe('5')
    })

    it('does not change the Format when a locked card is clicked', async () => {
      const { slug } = setUp({ phase: 'running' })
      const page = await mountEditor(slug)

      await page.get('[role="radio"][aria-checked="false"]').trigger('click')

      expect(checked(page)).toEqual(['Teams'])
    })

    it('shows the points table locked: the preset cards and the places of a custom table', async () => {
      const custom = { ...defaultSettings(), pointsTable: { preset: 'custom' as const, values: [3, 1] } }
      const { slug } = setUp({ settings: custom, phase: 'running' })
      const page = await mountEditor(slug)

      await goTo(page, 'Punkte')

      expect(page.text()).toContain(LOCKED)
      expect(page.findAll('[role="radio"]').every(radio => radio.attributes('aria-disabled') === 'true')).toBe(true)
      expect(checked(page)).toEqual(['Eigene Tabelle'])
      expect(button(page, 'Punkte für Platz 1: mehr').attributes('aria-disabled')).toBe('true')
      await button(page, 'Punkte für Platz 1: mehr').trigger('click')
      expect(page.findAll('[data-testid="points-row"] output').map(output => output.text())).toEqual(['3', '1'])
    })

    it('shows the Selection mode locked, but lets Rad verdecken and the Veto allowance change', async () => {
      const { slug } = setUp({ settings: wheel, phase: 'running' })
      const page = await mountEditor(slug)

      await goTo(page, 'Auswahlmodus')

      expect(page.text()).toContain(LOCKED)
      expect(checked(page)).toEqual(['Glücksrad'])
      expect(page.findAll('[role="radio"]').every(radio => radio.attributes('aria-disabled') === 'true')).toBe(true)
      await page.get('[role="switch"]').trigger('click')
      expect(page.get('[role="switch"]').attributes('aria-checked')).toBe('false')
      await button(page, 'Vetos pro Partei: mehr').trigger('click')
      expect(spin(page, 'Vetos pro Partei').text()).toBe('3')
    })

    it('lets „Pool vorher zeigen“ change while the Selection mode is locked, and saves it (#225)', async () => {
      const { slug, patched } = setUp({ settings: defaultSettings(), phase: 'running' })
      const page = await mountEditor(slug)
      await goTo(page, 'Auswahlmodus')

      const preview = page.findAll('[role="switch"]').find(sw => sw.text().includes('Pool vorher zeigen'))!
      expect(preview.attributes('aria-checked')).toBe('true')
      expect(preview.attributes('aria-disabled')).toBeUndefined()
      await preview.trigger('click')
      await goTo(page, 'Spielepool')
      await settle(page)
      await cta(page).trigger('click')

      await vi.waitFor(() => expect(patched).toHaveBeenCalledTimes(1))
      expect(patched.mock.calls[0]![0].settings).toEqual({ ...defaultSettings(), poolPreview: false })
    })

    it('lets the Game count change and shows no lock on that step', async () => {
      const { slug, patched } = setUp({ settings: wheel, phase: 'running' })
      const page = await mountEditor(slug)
      await goTo(page, 'Spiele')

      expect(page.text()).not.toContain(LOCKED)
      await button(page, 'Anzahl Spiele: weniger').trigger('click')
      await goTo(page, 'Spielepool')
      await settle(page)
      await cta(page).trigger('click')

      await vi.waitFor(() => expect(patched).toHaveBeenCalledTimes(1))
      expect(patched.mock.calls[0]![0].settings).toEqual({ ...wheel, gameCount: 6 })
    })

    it('shows no lock before the first Session', async () => {
      const { slug } = setUp({ settings: wheel })
      const page = await mountEditor(slug)

      expect(page.text()).not.toContain(LOCKED)
      expect(button(page, 'Anzahl Teams: mehr').attributes('aria-disabled')).toBeUndefined()
    })
  })

  describe('the Tie hint (#279)', () => {
    const tieHint = (page: Page) => page.findAll('[role="status"]').find(element => element.text().includes('Gleichstand möglich.'))

    it('shows on the Spiele step at an even Game count, and follows a change of it', async () => {
      const { slug } = setUp({ settings: defaultSettings() })
      const page = await mountEditor(slug)
      await goTo(page, 'Spiele')
      expect(tieHint(page)!.text()).toContain('Das Event kann unentschieden enden.')

      await button(page, 'Anzahl Spiele: weniger').trigger('click')
      expect(page.get('output').text()).toBe('9')
      expect(tieHint(page)).toBeUndefined()
    })

    it('shows on a running Event too', async () => {
      const { slug } = setUp({ settings: { ...defaultSettings(), gameCount: 8 }, phase: 'running' })
      const page = await mountEditor(slug)
      await goTo(page, 'Spiele')

      expect(tieHint(page)).toBeDefined()
    })
  })

  describe('the pool warning of a running Event (#234)', () => {
    const live = (poolWarning: SetGameView['poolWarning']): SetGameView => ({ rejection: null, spinRejection: null, respin: false, left: [], poolWarning })

    it('shows the live warning under the Game pool instead of the setup hint', async () => {
      const { slug } = setUp({ settings: wheel, phase: 'running', setGame: live({ needed: 14, have: 4 }) })
      const page = await mountEditor(slug)
      await goTo(page, 'Spielepool')

      expect(page.text()).toContain('Wird knapp.')
      expect(page.text()).toContain('Im schlimmsten Fall brauchst du noch 14 Spiele, übrig sind 4.')
      expect(page.text()).not.toContain('im Pool sind 0.')
    })

    it('shows nothing under the Game pool while the games left cover the worst case, where the setup hint would warn', async () => {
      const { slug } = setUp({ settings: wheel, phase: 'running', setGame: live(null) })
      const page = await mountEditor(slug)
      await goTo(page, 'Spielepool')

      expect(page.text()).not.toContain('Wird knapp.')
      expect(page.text()).not.toContain('im Pool sind 0.')
    })

    it('keeps the Bonus Veto note under the Glücksrad next to the live warning', async () => {
      const { slug } = setUp({ settings: wheel, phase: 'running', setGame: live({ needed: 14, have: 4 }) })
      const page = await mountEditor(slug)
      await goTo(page, 'Spielepool')

      expect(page.text()).toContain('Plane ein paar Spiele mehr ein, falls du zwischendurch Bonus-Vetos vergibst.')
      expect(page.text()).toContain('Im schlimmsten Fall brauchst du noch 14 Spiele, übrig sind 4.')
    })

    it('keeps the setup hint before the first Session', async () => {
      const { slug } = setUp({ settings: wheel, phase: 'poll', setGame: live(null) })
      const page = await mountEditor(slug)
      await goTo(page, 'Spielepool')

      expect(page.text()).toContain('Wird knapp.')
      expect(page.text()).toContain('im Pool sind 0.')
    })
  })
})

// A draw's lock on the settings page lifts at its stop, not at the next poll (#261, spec N5): the page reads again when the instant passes.
describe('the settings editor during a draw', () => {
  const DRAWING = 'Gesperrt, solange ein Spiel gezogen wird'
  let drawSlugs = 0

  /** A running Event whose spin stops at `stopAt` (epoch ms, the real clock: fake timers stall the page's mount); `reads` counts the Event read, `set` serves the next one. */
  function serveDraw({ stopAt, host = true, drawing = true }: { stopAt: number, host?: boolean, drawing?: boolean }) {
    const slug = `einstellungen-draw-${++drawSlugs}`
    const spin: SpinView = { roundId: 'r1', drawId: 'd1', spinStartAt: new Date(stopAt - 6000).toISOString(), stopAt: new Date(stopAt).toISOString(), slices: 3, resultIndex: 0, resultOffset: 0.5, labels: null, game: null, current: true }
    const wheelView: WheelView = { count: 3, slices: null, spin, vetoes: { left: [0, 0, 0], own: null, revealed: null, draw: null } }
    let current = { ...view(slug, [], { event: { isHost: host, phase: 'running' }, settings: wheel, wheel: wheelView }), roundBeingDrawn: drawing }
    const reads = vi.fn()
    registerEndpoint(`/api/e/${slug}`, {
      method: 'GET',
      handler: () => {
        reads()
        return current
      },
    })
    const set = (next: boolean) => {
      current = { ...current, roundBeingDrawn: next }
    }
    return { slug, reads, set }
  }

  beforeEach(() => {
    useState('toasts').value = []
  })

  it('lifts the lock on „Rad verdecken“ and the Veto allowance at the stop, without waiting for the poll', async () => {
    const { slug, set } = serveDraw({ stopAt: Date.now() + 1000 })
    const page = await mountEditor(slug)
    await goTo(page, 'Auswahlmodus')
    expect(page.text()).toContain(DRAWING)

    set(false)
    // The read before the stop still says so: only the page's read at the stop (+ INSTANT_MARGIN_MS) can lift it.
    expect(page.text()).toContain(DRAWING)
    await vi.waitFor(() => expect(page.text()).not.toContain(DRAWING), { timeout: 4000 })
  })

  it('reads nothing again for a Member, who gets the Construction page', async () => {
    const { slug, reads } = serveDraw({ stopAt: Date.now() + 500, host: false, drawing: false })
    await mountEditor(slug)
    await flushPromises()
    const before = reads.mock.calls.length

    await new Promise(resolve => setTimeout(resolve, 500 + INSTANT_MARGIN_MS + 300))

    expect(reads.mock.calls.length).toBe(before)
  })

  it('reads nothing again for a stop that had passed when the page loaded', async () => {
    const { slug, reads } = serveDraw({ stopAt: Date.now() - 1000, drawing: false })
    await mountEditor(slug)
    await flushPromises()
    const before = reads.mock.calls.length

    await new Promise(resolve => setTimeout(resolve, INSTANT_MARGIN_MS + 300))

    expect(reads.mock.calls.length).toBe(before)
  })
})
