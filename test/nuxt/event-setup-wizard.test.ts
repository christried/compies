import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventSetupWizard from '~/components/stepper/EventSetupWizard.vue'
import CreatePage from '~/pages/neu.vue'
import EditorPage from '~/pages/e/[slug]/einstellungen.vue'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, view } from './event-page'

// The one Event setup wizard (#170): /neu creates with it, the settings editor edits with it. Both entry pages
// render the same component with their own steps; the Veto allowance and the locks behave the same in both.

const LOCKED = 'Gesperrt, seit die erste Session läuft: Schon gespielte Spiele behalten ihre Regeln.'

type Page = VueWrapper
const mounted: Page[] = []
afterEach(() => {
  mounted.splice(0).forEach(page => page.unmount())
})

async function mountCreate(): Promise<Page> {
  signInAs({ ...kitty, canHost: true })
  const page = await mountSuspended(CreatePage, { route: '/neu', attachTo: document.body })
  mounted.push(page)
  return page
}

/** An Event with its GET and PATCH endpoints; `patched` collects the PATCH bodies. */
async function mountEditor(settings: EventSettings, phase = 'poll') {
  const patched = vi.fn()
  const { slug } = serve(s => view(s, [], { event: { isHost: true, phase }, settings, pools: { hidden: false, main: [], tiebreaker: [] } }))
  registerEndpoint(`/api/e/${slug}/settings`, {
    method: 'PATCH',
    handler: async (event) => {
      const body = await readBody(event)
      patched(body)
      return { settings: body.settings }
    },
  })
  signInAs({ ...kitty, canHost: true })
  const page = await mountSuspended(EditorPage, { route: `/e/${slug}/einstellungen`, attachTo: document.body })
  mounted.push(page)
  return { page, patched }
}

const cta = (page: Page) => page.get('button[type="submit"]')
const stepItems = (page: Page) => page.get('nav[aria-label="Schritte"]').findAll('li')
const stepLabels = (page: Page) => stepItems(page).map(item => item.text().replace(/^\d\s*|^✓\s*/, ''))
const button = (page: Page, label: string) => page.get(`button[aria-label="${label}"]`)
const radios = (page: Page) => page.findAll('[role="radio"]')
const veto = (page: Page) => page.findAll('[role="spinbutton"]').find(stepper => stepper.attributes('aria-label') === 'Vetos pro Partei')!

async function goTo(page: Page, label: string) {
  await stepItems(page).find(item => item.text().endsWith(label))!.get('button').trigger('click')
}

describe('the entry pages', () => {
  it('/neu runs the wizard with the eight steps of a new Event', async () => {
    const page = await mountCreate()

    expect(page.findComponent(EventSetupWizard).exists()).toBe(true)
    expect(stepLabels(page)).toEqual(['Name', 'Format', 'Spiele', 'Punkte', 'Auswahlmodus', 'Spielepool', 'Tiebreaker-Pool', 'Termin'])
    expect(page.get('nav[aria-label="Schritte"]').text()).toContain('Neue Session')
  })

  it('the settings editor runs the same wizard with the six steps of an Event, all of them reachable', async () => {
    const { page } = await mountEditor(defaultSettings())

    expect(page.findComponent(EventSetupWizard).exists()).toBe(true)
    expect(stepLabels(page)).toEqual(['Format', 'Spiele', 'Punkte', 'Auswahlmodus', 'Spielepool', 'Tiebreaker-Pool'])
    expect(page.get('nav[aria-label="Schritte"]').text()).toContain('Einstellungen')
    expect(stepItems(page).slice(1).every(item => item.find('button').exists())).toBe(true)
  })
})

describe('the Veto allowance in the editor', () => {
  it('follows the Team size of an Admin pick Event until the Host sets it, and is sent as it stands', async () => {
    const { page, patched } = await mountEditor({ ...defaultSettings(), teamSize: 2 })
    await button(page, 'Spieler pro Team: mehr').trigger('click')
    await button(page, 'Spieler pro Team: mehr').trigger('click')
    await button(page, 'Spieler pro Team: mehr').trigger('click')

    await goTo(page, 'Auswahlmodus')
    await radios(page)[1]!.trigger('click')
    expect(veto(page).attributes('aria-valuenow')).toBe('5')

    await goTo(page, 'Tiebreaker-Pool')
    await cta(page).trigger('click')
    await vi.waitFor(() => expect(patched).toHaveBeenCalledTimes(1))
    expect(patched.mock.calls[0]![0].settings).toMatchObject({ selectionMode: 'lucky_wheel', teamSize: 5, vetoAllowance: 5 })
  })

  it('keeps the Host’s value when the Team size changes afterwards', async () => {
    const { page, patched } = await mountEditor({ ...defaultSettings(), selectionMode: 'lucky_wheel' })
    await goTo(page, 'Auswahlmodus')
    await button(page, 'Vetos pro Partei: weniger').trigger('click')
    expect(veto(page).attributes('aria-valuenow')).toBe('2')

    await goTo(page, 'Format')
    await button(page, 'Spieler pro Team: mehr').trigger('click')
    await button(page, 'Spieler pro Team: mehr').trigger('click')
    await goTo(page, 'Auswahlmodus')
    expect(veto(page).attributes('aria-valuenow')).toBe('2')

    await goTo(page, 'Tiebreaker-Pool')
    await cta(page).trigger('click')
    await vi.waitFor(() => expect(patched).toHaveBeenCalledTimes(1))
    expect(patched.mock.calls[0]![0].settings).toMatchObject({ teamSize: 5, vetoAllowance: 2 })
  })

  it('counts a stored Veto allowance as the Host’s choice', async () => {
    const { page } = await mountEditor({ ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 2 })
    await button(page, 'Spieler pro Team: mehr').trigger('click')
    await button(page, 'Spieler pro Team: mehr').trigger('click')

    await goTo(page, 'Auswahlmodus')

    expect(veto(page).attributes('aria-valuenow')).toBe('2')
  })
})

describe('the Veto allowance in /neu', () => {
  it('follows the Team size until touched, and the Host’s value survives a trip through Admin-Wahl', async () => {
    const page = await mountCreate()
    await page.get('input[type="text"]').setValue('Abend')
    await cta(page).trigger('click')
    await button(page, 'Spieler pro Team: mehr').trigger('click')
    await cta(page).trigger('click')
    await cta(page).trigger('click')
    await cta(page).trigger('click')
    await radios(page)[1]!.trigger('click')
    expect(veto(page).attributes('aria-valuenow')).toBe('4')

    await button(page, 'Vetos pro Partei: mehr').trigger('click')
    await radios(page)[0]!.trigger('click')
    await radios(page)[1]!.trigger('click')

    expect(veto(page).attributes('aria-valuenow')).toBe('5')
  })
})

describe('after the first Session started', () => {
  const wheel: EventSettings = { ...defaultSettings(), selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 2 }

  it('keeps Format, team count, points table and Selection mode locked in the editor', async () => {
    const { page } = await mountEditor(wheel, 'running')

    expect(page.text()).toContain(LOCKED)
    expect(radios(page).every(radio => radio.attributes('aria-disabled') === 'true')).toBe(true)
    expect(button(page, 'Anzahl Teams: mehr').attributes('aria-disabled')).toBe('true')

    await goTo(page, 'Punkte')
    expect(page.text()).toContain(LOCKED)
    expect(radios(page).every(radio => radio.attributes('aria-disabled') === 'true')).toBe(true)

    await goTo(page, 'Auswahlmodus')
    expect(page.text()).toContain(LOCKED)
    expect(radios(page).every(radio => radio.attributes('aria-disabled') === 'true')).toBe(true)
  })
})
