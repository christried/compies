import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreatePage from '~/pages/neu.vue'
import { kitty, signInAs } from './auth'

// Step 5 of the stepper, the Selection mode (#145): the two open modes, the locked ones, the Lucky Wheel's
// options (Rad verdecken, Vetos pro Partei) that follow the Team size until the Host sets them, and the
// Fertig summary. The other steps have their own cases in event-stepper.test.ts and create-event.test.ts.

const host = { ...kitty, canHost: true }
const created = { slug: 'freitags-zocken-k7q2', inviteUrl: 'http://localhost/e/freitags-zocken-k7q2-AbCdEfGhIjKl' }

type Page = VueWrapper

const mounted: Page[] = []
afterEach(() => {
  mounted.splice(0).forEach(page => page.unmount())
})

async function mountCreate(): Promise<Page> {
  signInAs(host)
  const page = await mountSuspended(CreatePage, { route: '/neu', attachTo: document.body })
  mounted.push(page)
  return page
}

const cta = (page: Page) => page.get('button[type="submit"]')
const button = (page: Page, label: string) => page.get(`button[aria-label="${label}"]`)
const radios = (page: Page) => page.findAll('[role="radio"]')
const checked = (page: Page) => radios(page).map(radio => radio.attributes('aria-checked'))
const stepItems = (page: Page) => page.get('nav[aria-label="Schritte"]').findAll('li')
const hideSwitch = (page: Page) => page.find('[role="switch"]')
const vetoStepper = (page: Page) => page.findAll('[role="spinbutton"]').find(stepper => stepper.attributes('aria-label') === 'Vetos pro Partei')

async function next(page: Page, times = 1) {
  for (let i = 0; i < times; i++) await cta(page).trigger('click')
}

async function click(page: Page, label: string, times: number) {
  for (let i = 0; i < times; i++) await button(page, label).trigger('click')
}

/** Names the Session and stands on the Selection mode step (step 5 of 8). */
async function toModeStep(page: Page) {
  await page.get('input[type="text"]').setValue('Freitags-Zocken')
  await next(page, 4)
}

/** Goes from the Selection mode step to the Sessions step (past the two pools) and fills the one Date, so „Session erstellen“ is ready. */
async function toLastStep(page: Page) {
  await next(page, 3)
  await page.get('[role="group"]').findAll('input')[0]!.setValue('30.10.2090')
  await page.get('[role="group"]').findAll('input')[1]!.setValue('2030')
}

function recordPost() {
  const saved = vi.fn()
  registerEndpoint('/api/e', {
    method: 'POST',
    handler: async (event) => {
      saved(await readBody(event))
      return created
    },
  })
  return saved
}

describe('the Selection mode step', () => {
  beforeEach(() => {
    useState('toasts').value = []
  })

  it('is step 5 of 8, between the points and the pools', async () => {
    const page = await mountCreate()
    await toModeStep(page)

    expect(page.get('h1').text()).toContain('Schritt 5 von 8')
    expect(page.get('h1').text()).toContain('Wie wird das nächste Spiel bestimmt?')
    expect(stepItems(page).map(item => item.text())).toEqual(['✓ Name', '✓ Format', '✓ Spiele', '✓ Punkte', '5 Auswahlmodus', '6 Spielepool', '7 Tiebreaker-Pool', '8 Termin'])
  })

  it('offers all five modes in the design’s order, with Admin-Wahl chosen', async () => {
    const page = await mountCreate()
    await toModeStep(page)

    expect(radios(page).map(radio => radio.get('b').text())).toEqual([
      'Admin-Wahl',
      'Lucky Wheel',
      'Pick & Ban',
      'Loser’s Pick',
      'Lucky Wheel – Loser’s Advantage',
    ])
    expect(checked(page)).toEqual(['true', 'false', 'false', 'false', 'false'])
  })

  it('locks Pick & Ban, Loser’s Pick and Loser’s Advantage as „Bald verfügbar“', async () => {
    const page = await mountCreate()
    await toModeStep(page)

    expect(radios(page).map(radio => radio.attributes('aria-disabled'))).toEqual([undefined, undefined, 'true', 'true', 'true'])
    expect(radios(page).slice(2).every(radio => radio.text().includes('Bald verfügbar'))).toBe(true)

    await radios(page)[2]!.trigger('click')
    await radios(page)[4]!.trigger('click')
    expect(checked(page)).toEqual(['true', 'false', 'false', 'false', 'false'])
  })

  it('skips the locked modes with the arrow keys', async () => {
    const page = await mountCreate()
    await toModeStep(page)

    await radios(page)[0]!.trigger('keydown', { key: 'ArrowDown' })
    expect(checked(page)).toEqual(['false', 'true', 'false', 'false', 'false'])

    await radios(page)[1]!.trigger('keydown', { key: 'ArrowDown' })
    expect(checked(page)).toEqual(['true', 'false', 'false', 'false', 'false'])
  })

  it('says which modes are coming, in one note under the group', async () => {
    const page = await mountCreate()
    await toModeStep(page)

    expect(page.text()).toContain('Pick & Ban, Loser’s Pick und Loser’s Advantage kommen bald.')
  })

  it('shows the hidden wheel switch and the Veto allowance only with the Lucky Wheel', async () => {
    const page = await mountCreate()
    await toModeStep(page)

    expect(hideSwitch(page).exists()).toBe(false)
    expect(vetoStepper(page)).toBeUndefined()

    await radios(page)[1]!.trigger('click')

    expect(hideSwitch(page).attributes('aria-checked')).toBe('false')
    expect(hideSwitch(page).text()).toContain('Rad verdecken')
    expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('3')

    await radios(page)[0]!.trigger('click')

    expect(hideSwitch(page).exists()).toBe(false)
    expect(vetoStepper(page)).toBeUndefined()
  })

  it('shows the explanation of the chosen mode in the info column', async () => {
    const page = await mountCreate()
    await toModeStep(page)

    expect(page.get('aside[aria-label="Erklärung"]').text()).toContain('Du als Host bestimmst jedes Spiel selbst.')

    await radios(page)[1]!.trigger('click')

    const aside = page.get('aside[aria-label="Erklärung"]')
    expect(aside.text()).toContain('Lucky Wheel')
    expect(aside.text()).toContain('Du legst Spiele auf das Glücksrad und drehst es.')
    expect(aside.text()).toContain('Option „Rad verdecken“')
    expect(aside.text()).toContain('Du als Host siehst die Spiele auf dem verdeckten Rad trotzdem, auch wenn du mitspielst.')
  })

  it('keeps the Lucky Wheel options while Admin-Wahl is chosen, and restores them when the Lucky Wheel comes back', async () => {
    const page = await mountCreate()
    await toModeStep(page)
    await radios(page)[1]!.trigger('click')
    await hideSwitch(page).trigger('click')
    await vetoStepper(page)!.findAll('button')[0]!.trigger('click')
    await vetoStepper(page)!.findAll('button')[0]!.trigger('click')

    await radios(page)[0]!.trigger('click')
    await radios(page)[1]!.trigger('click')

    expect(hideSwitch(page).attributes('aria-checked')).toBe('true')
    expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('1')
  })

  describe('the Veto allowance follows the Team size until the Host sets it', () => {
    it('moves an untouched allowance from 3 to 5 with the Team size, and keeps it at 2 after the Host sets it', async () => {
      const page = await mountCreate()
      await page.get('input[type="text"]').setValue('Freitags-Zocken')
      await next(page)
      await click(page, 'Spieler pro Team: mehr', 2)
      expect(page.findAll('[role="spinbutton"]')[1]!.attributes('aria-valuenow')).toBe('5')

      await next(page, 3)
      await radios(page)[1]!.trigger('click')
      expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('5')

      await click(page, 'Vetos pro Partei: weniger', 3)
      expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('2')

      await stepItems(page)[1]!.get('button').trigger('click')
      await click(page, 'Spieler pro Team: weniger', 1)
      await next(page, 3)

      expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('2')
    })

    it('still follows the Team size while the Host has not touched it', async () => {
      const page = await mountCreate()
      await page.get('input[type="text"]').setValue('Freitags-Zocken')
      await next(page)
      await click(page, 'Spieler pro Team: mehr', 3)
      await next(page, 3)

      await radios(page)[1]!.trigger('click')

      expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('6')
    })

    it('stops the Veto allowance at 0 and 9 and says why', async () => {
      const page = await mountCreate()
      await toModeStep(page)
      await radios(page)[1]!.trigger('click')

      await click(page, 'Vetos pro Partei: weniger', 5)
      expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('0')
      expect(button(page, 'Vetos pro Partei: weniger').attributes('title')).toBe('Mindestens 0 Vetos.')

      await click(page, 'Vetos pro Partei: mehr', 12)
      expect(vetoStepper(page)!.attributes('aria-valuenow')).toBe('9')
      expect(button(page, 'Vetos pro Partei: mehr').attributes('title')).toBe('Höchstens 9 Vetos pro Partei.')
    })
  })

  describe('Session erstellen', () => {
    it('sends the Lucky Wheel with the hidden wheel and the Veto allowance the Host set', async () => {
      const saved = recordPost()
      const page = await mountCreate()
      await toModeStep(page)
      await radios(page)[1]!.trigger('click')
      await hideSwitch(page).trigger('click')
      await click(page, 'Vetos pro Partei: weniger', 1)
      await toLastStep(page)

      await cta(page).trigger('click')

      await vi.waitFor(() => expect(page.text()).toContain('Freitags-Zocken steht!'))
      expect(saved).toHaveBeenCalledWith(expect.objectContaining({
        settings: expect.objectContaining({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 2 }),
      }))
      expect(page.text()).toContain('2 Teams à 3, Lucky Wheel (verdeckt), 10 Spiele.')
      const list = page.get('dl')
      expect(list.findAll('dt').map(term => term.text())).toEqual(['Format', 'Spiele', 'Punkte', 'Modus', 'Vetos', 'Pool', 'Termin'])
      expect(list.findAll('dd').map(value => value.text())).toEqual([
        '2 Teams à 3',
        '10',
        'Linear 1 / 0',
        'Lucky Wheel (verdeckt)',
        '2 pro Partei',
        '0 Spiele, Tiebreaker 0',
        'Umfrage, 1 Vorschlag',
      ])
    })

    it('sends Admin-Wahl without the wheel options', async () => {
      const saved = recordPost()
      const page = await mountCreate()
      await toModeStep(page)
      await radios(page)[1]!.trigger('click')
      await hideSwitch(page).trigger('click')
      await radios(page)[0]!.trigger('click')
      await toLastStep(page)

      await cta(page).trigger('click')

      await vi.waitFor(() => expect(page.text()).toContain('Freitags-Zocken steht!'))
      expect(saved).toHaveBeenCalledWith(expect.objectContaining({
        settings: expect.objectContaining({ selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null }),
      }))
      expect(page.get('dl').findAll('dt').map(term => term.text())).not.toContain('Vetos')
    })
  })
})
