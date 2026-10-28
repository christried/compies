import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreatePage from '~/pages/neu.vue'
import { kitty, signInAs } from './auth'

// The stepper as the Host walks it (#144): steps 1 to 4, the Format and points rules, the info, and the
// Fertig screen. The Sessions and Dates step has its own cases in create-event.test.ts.

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
const stepItems = (page: Page) => page.get('nav[aria-label="Schritte"]').findAll('li')

async function next(page: Page, times = 1) {
  for (let i = 0; i < times; i++) await cta(page).trigger('click')
}

/** Names the Session and stands on the given step (0-based). */
async function stepTo(page: Page, step: number) {
  await page.get('input[type="text"]').setValue('Freitags-Zocken')
  await next(page, step)
}

async function click(page: Page, label: string, times: number) {
  for (let i = 0; i < times; i++) await button(page, label).trigger('click')
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

describe('the stepper', () => {
  beforeEach(() => {
    useState('toasts').value = []
  })

  it('starts on step 1 of 8 and sends nothing', async () => {
    const saved = recordPost()
    const page = await mountCreate()

    expect(page.get('h1').text()).toContain('Schritt 1 von 8')
    expect(page.get('h1').text()).toContain('Wie soll die Session heißen?')
    expect(stepItems(page).map(item => item.text())).toEqual(['1 Name', '2 Format', '3 Spiele', '4 Punkte', '5 Auswahlmodus', '6 Spielepool', '7 Tiebreaker-Pool', '8 Termin'])
    expect(saved).not.toHaveBeenCalled()
  })

  it('walks the steps one after the other, with the titles of the design, and sends nothing on the way', async () => {
    const saved = recordPost()
    const page = await mountCreate()
    await stepTo(page, 0)

    const titles: string[] = []
    for (let step = 1; step <= 7; step++) {
      await next(page)
      titles.push(page.get('h1').text())
    }

    expect(titles).toEqual([
      expect.stringContaining('Wer gegen wen?'),
      expect.stringContaining('Wie viele Spiele?'),
      expect.stringContaining('Wer kriegt wie viele Punkte?'),
      expect.stringContaining('Wie wird das nächste Spiel bestimmt?'),
      expect.stringContaining('Welche Spiele kommen in den Pool?'),
      expect.stringContaining('Und falls es knapp wird?'),
      expect.stringContaining('Wann zocken wir?'),
    ])
    expect(cta(page).text()).toContain('Session erstellen')
    expect(saved).not.toHaveBeenCalled()
  })

  it('blocks Weiter on an empty name with the reason, and goes on once there is one', async () => {
    const page = await mountCreate()

    expect(cta(page).attributes('aria-disabled')).toBe('true')
    expect(page.get(`[id="${cta(page).attributes('aria-describedby')}"]`).text()).toBe('Gib der Session einen Namen.')
    await next(page)
    expect(page.get('h1').text()).toContain('Schritt 1 von 8')

    await page.get('input[type="text"]').setValue('  ')
    expect(cta(page).attributes('aria-disabled')).toBe('true')

    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    expect(cta(page).attributes('aria-disabled')).toBeUndefined()
    await next(page)
    expect(page.get('h1').text()).toContain('Schritt 2 von 8')
  })

  it('goes back with Zurück and keeps what was entered', async () => {
    const page = await mountCreate()
    await stepTo(page, 1)
    await click(page, 'Anzahl Teams: mehr', 2)

    await page.findAll('button').find(item => item.text().includes('Zurück') && item.attributes('type') === 'button')!.trigger('click')
    expect((page.get('input[type="text"]').element as HTMLInputElement).value).toBe('Freitags-Zocken')
    await next(page)

    expect(page.get('output').text()).toBe('4')
  })

  it('makes finished steps clickable on desktop, and the current and later ones not', async () => {
    const page = await mountCreate()
    await stepTo(page, 3)

    expect(stepItems(page).map(item => item.find('button').exists())).toEqual([true, true, true, false, false, false, false, false])
    expect(stepItems(page).map(item => item.attributes('aria-current'))).toEqual([undefined, undefined, undefined, 'step', undefined, undefined, undefined, undefined])

    await stepItems(page)[1]!.get('button').trigger('click')

    expect(page.get('h1').text()).toContain('Schritt 2 von 8')
    expect(stepItems(page)[1]!.attributes('aria-current')).toBe('step')
    expect(stepItems(page)[3]!.find('button').exists()).toBe(true)
  })

  describe('Format', () => {
    it('offers Teams, with free-for-all, bracket and league locked as „Bald verfügbar“', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)

      expect(radios(page).map(radio => radio.get('b').text())).toEqual(['Jeder gegen jeden', 'Teams', 'Turnierbaum', 'Liga'])
      expect(radios(page).map(radio => radio.attributes('aria-disabled'))).toEqual(['true', undefined, 'true', 'true'])
      expect(radios(page).map(radio => radio.attributes('aria-checked'))).toEqual(['false', 'true', 'false', 'false'])
      expect(radios(page)[0]!.text()).toContain('Bald verfügbar')
    })

    it('cannot pick a locked Format by click, and the arrow keys skip them', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)

      await radios(page)[0]!.trigger('click')
      await radios(page)[2]!.trigger('click')
      expect(radios(page).map(radio => radio.attributes('aria-checked'))).toEqual(['false', 'true', 'false', 'false'])

      await radios(page)[1]!.trigger('keydown', { key: 'ArrowDown' })
      await radios(page)[1]!.trigger('keydown', { key: 'ArrowUp' })
      expect(radios(page).map(radio => radio.attributes('aria-checked'))).toEqual(['false', 'true', 'false', 'false'])
    })

    it('starts at 2 teams of 3 and counts the Players in teams', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)

      expect(page.findAll('[role="spinbutton"]').map(stepper => stepper.attributes('aria-valuenow'))).toEqual(['2', '3'])
      expect(page.text()).toContain('2 Teams à 3 = 6 Leute in Teams (max. 24)')

      await click(page, 'Anzahl Teams: mehr', 2)
      await click(page, 'Spieler pro Team: weniger', 1)

      expect(page.text()).toContain('4 Teams à 2 = 8 Leute in Teams (max. 24)')
    })

    it('stops the team plus button at 8 teams and says why', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)

      await click(page, 'Anzahl Teams: mehr', 7)

      const plus = button(page, 'Anzahl Teams: mehr')
      expect(page.findAll('[role="spinbutton"]')[0]!.attributes('aria-valuenow')).toBe('8')
      expect(plus.attributes('aria-disabled')).toBe('true')
      expect(plus.attributes('title')).toBe('Höchstens 8 Teams.')
    })

    it('stops the size plus button at 6 per team and says why', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)

      await click(page, 'Spieler pro Team: mehr', 5)

      const plus = button(page, 'Spieler pro Team: mehr')
      expect(page.findAll('[role="spinbutton"]')[1]!.attributes('aria-valuenow')).toBe('6')
      expect(plus.attributes('aria-disabled')).toBe('true')
      expect(plus.attributes('title')).toBe('Höchstens 6 pro Team.')
    })

    it('stops the team plus button at 24 Players in teams and says why', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)
      await click(page, 'Spieler pro Team: mehr', 3)

      await click(page, 'Anzahl Teams: mehr', 6)

      expect(page.findAll('[role="spinbutton"]')[0]!.attributes('aria-valuenow')).toBe('4')
      expect(button(page, 'Anzahl Teams: mehr').attributes('aria-disabled')).toBe('true')
      expect(button(page, 'Anzahl Teams: mehr').attributes('title')).toBe('Höchstens 24 Leute in Teams.')
      expect(page.text()).toContain('4 Teams à 6 = 24 Leute in Teams (max. 24)')
    })

    it('stops the size plus button at 24 Players in teams and says why', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)
      await click(page, 'Anzahl Teams: mehr', 6)

      expect(page.findAll('[role="spinbutton"]')[0]!.attributes('aria-valuenow')).toBe('8')
      expect(button(page, 'Spieler pro Team: mehr').attributes('aria-disabled')).toBe('true')
      expect(button(page, 'Spieler pro Team: mehr').attributes('title')).toBe('Höchstens 24 Leute in Teams.')
      await click(page, 'Spieler pro Team: mehr', 1)
      expect(page.findAll('[role="spinbutton"]')[1]!.attributes('aria-valuenow')).toBe('3')
    })

    it('stops the minus buttons at 2 teams and 1 per team', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)
      await click(page, 'Spieler pro Team: weniger', 2)

      expect(button(page, 'Anzahl Teams: weniger').attributes('title')).toBe('Mindestens 2 Teams.')
      expect(button(page, 'Spieler pro Team: weniger').attributes('title')).toBe('Mindestens 1 pro Team.')
      expect(button(page, 'Spieler pro Team: weniger').attributes('aria-disabled')).toBe('true')
    })
  })

  describe('info', () => {
    it('explains the chosen Format in a column beside the form on desktop', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)

      const aside = page.get('aside[aria-label="Erklärung"]')
      expect(aside.text()).toContain('Teams')
      expect(aside.text()).toContain('Du legst fest, wie viele Teams es gibt (2 bis 8).')
      expect(aside.text()).toContain('Gut für')
    })

    it('has the info only where there is something to explain', async () => {
      const page = await mountCreate()

      expect(page.find('aside').exists()).toBe(false)
      expect(page.find('button[aria-label="Info"]').exists()).toBe(false)
      await stepTo(page, 1)
      expect(page.find('button[aria-label="Info"]').exists()).toBe(true)
      await next(page)
      expect(page.find('aside').exists()).toBe(false)
    })

    it('opens the info in a sheet on a phone', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)

      await page.get('button[aria-label="Info"]').trigger('click')

      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog?.textContent).toContain('Du legst fest, wie viele Teams es gibt (2 bis 8).')
    })
  })

  describe('on phones', () => {
    it('shows a progress bar of 8 segments and a sticky footer with the kicker in the heading', async () => {
      const page = await mountCreate()
      await stepTo(page, 2)

      expect(page.get('[data-testid="progress"]').findAll('span')).toHaveLength(8)
      expect(page.get('[data-testid="progress"]').attributes('aria-hidden')).toBe('true')
      expect(page.get('[data-testid="stepper-footer"]').classes()).toContain('sticky')
      expect(page.get('h1').text()).toContain('Schritt 3 von 8')
    })
  })

  describe('Game count', () => {
    it('starts at 10 and counts between 1 and 30', async () => {
      const page = await mountCreate()
      await stepTo(page, 2)

      expect(page.get('output').text()).toBe('10')
      expect(page.text()).toContain('Nach 10 Spielen ist Schluss')

      await click(page, 'Anzahl Spiele: mehr', 20)
      expect(page.get('output').text()).toBe('30')
      expect(button(page, 'Anzahl Spiele: mehr').attributes('title')).toBe('Höchstens 30 Spiele.')

      await click(page, 'Anzahl Spiele: weniger', 29)
      expect(page.get('output').text()).toBe('1')
      expect(button(page, 'Anzahl Spiele: weniger').attributes('title')).toBe('Mindestens 1 Spiel.')
      expect(page.text()).toContain('Nach 1 Spiel ist Schluss')
    })
  })

  describe('points table', () => {
    it('shows the linear table of the team count and follows it when the teams change', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)
      await click(page, 'Anzahl Teams: mehr', 2)
      await next(page, 2)

      expect(page.get('h1').text()).toContain('Wer kriegt wie viele Punkte?')
      expect(radios(page)[0]!.text()).toContain('3 / 2 / 1 / 0')
      expect(page.findAll('[data-testid="points-row"]')).toHaveLength(4)
    })

    it('refuses a custom table that rises, with the designed message, and blocks Weiter', async () => {
      const page = await mountCreate()
      await stepTo(page, 1)
      await click(page, 'Anzahl Teams: mehr', 2)
      await next(page, 2)
      await radios(page)[2]!.trigger('click')

      await click(page, 'Punkte für Platz 3: mehr', 3)

      expect(page.get('[role="alert"]').text()).toBe('Platz 3 kann nicht mehr Punkte bekommen als Platz 2.')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
      expect(page.get(`[id="${cta(page).attributes('aria-describedby')}"]`).text()).toBe('Platz 3 kann nicht mehr Punkte bekommen als Platz 2.')
      await next(page)
      expect(page.get('h1').text()).toContain('Schritt 4 von 8')

      await click(page, 'Punkte für Platz 3: weniger', 3)
      expect(page.find('[role="alert"]').exists()).toBe(false)
      expect(cta(page).attributes('aria-disabled')).toBeUndefined()
    })

    it('resizes a custom table when the teams change', async () => {
      const page = await mountCreate()
      await stepTo(page, 3)
      await radios(page)[2]!.trigger('click')
      expect(page.findAll('[role="spinbutton"]')).toHaveLength(2)

      await stepItems(page)[1]!.get('button').trigger('click')
      await click(page, 'Anzahl Teams: mehr', 1)
      await next(page, 2)

      expect(page.findAll('[role="spinbutton"]').map(stepper => stepper.attributes('aria-valuenow'))).toEqual(['1', '0', '0'])
    })
  })

  describe('Session erstellen', () => {
    it('sends what the Host chose and shows the Fertig screen with the sentence, the list and the Invite link', async () => {
      const saved = recordPost()
      const page = await mountCreate()
      await stepTo(page, 1)
      await click(page, 'Anzahl Teams: mehr', 2)
      await click(page, 'Spieler pro Team: weniger', 1)
      await next(page)
      await click(page, 'Anzahl Spiele: weniger', 4)
      await next(page)
      await radios(page)[1]!.trigger('click')
      await next(page, 4)
      await page.get('[role="group"]').findAll('input')[0]!.setValue('30.10.2090')
      await page.get('[role="group"]').findAll('input')[1]!.setValue('2030')

      await cta(page).trigger('click')

      await vi.waitFor(() => expect(page.text()).toContain('Freitags-Zocken steht!'))
      expect(saved).toHaveBeenCalledTimes(1)
      expect(saved).toHaveBeenCalledWith({
        name: 'Freitags-Zocken',
        dateMode: 'poll',
        sessions: 1,
        slots: ['2090-10-30T20:30'],
        pools: { main: [], tiebreaker: [] },
        settings: {
          format: 'teams',
          teamCount: 4,
          teamSize: 2,
          gameCount: 6,
          pointsTable: { preset: 'winner_takes_all', values: [3, 0, 0, 0] },
          selectionMode: 'admin_pick',
          hiddenWheel: false,
          vetoAllowance: null,
        },
      })
      expect(page.text()).toContain('Geschafft')
      expect(page.text()).toContain('4 Teams à 2, Admin-Wahl, 6 Spiele.')
      const list = page.get('dl')
      expect(list.findAll('dt').map(term => term.text())).toEqual(['Format', 'Spiele', 'Punkte', 'Modus', 'Pool', 'Termin'])
      expect(list.findAll('dd').map(value => value.text())).toEqual(['4 Teams à 2', '6', 'Winner takes all 3 / 0 / 0 / 0', 'Admin-Wahl', '0 Spiele, Tiebreaker 0', 'Umfrage, 1 Vorschlag'])
      expect((page.get('input[readonly]').element as HTMLInputElement).value).toBe(created.inviteUrl)
      expect(page.find('nav[aria-label="Schritte"]').exists()).toBe(false)
    })
  })
})
