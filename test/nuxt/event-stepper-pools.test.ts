import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreatePage from '~/pages/neu.vue'
import type { GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'

// Steps 6 and 7 of the stepper, the Game pool and the Tiebreaker pool (#146): the picker over the library, the
// hint under the Game pool, „Neues Spiel anlegen“ in a sheet, and what is sent. The other steps have their own
// cases in event-stepper.test.ts, event-stepper-mode.test.ts and create-event.test.ts.

const host = { ...kitty, canHost: true }
const created = { slug: 'freitags-zocken-k7q2', inviteUrl: 'http://localhost/e/freitags-zocken-k7q2-AbCdEfGhIjKl' }

function game(n: number, name: string, overrides: Partial<GameView> = {}): GameView {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name,
    imageUrl: null,
    youtubeId: null,
    clipStart: 0,
    clipLength: 30,
    playersMin: null,
    playersMax: null,
    formats: [],
    createdBy: { id: kitty.id, name: 'Kitty' },
    createdAt: '2026-01-15T10:00:00.000Z',
    canEdit: true,
    ...overrides,
  }
}

const kart = game(1, 'Mario Kart')
const pong = game(2, 'Pong')
const chess = game(3, 'Schach')
const fresh = game(99, 'Frisch Angelegt')

// One endpoint per path and method for the file; each test sets the library and what the game form gets back.
let library: GameView[] = []
const postedGame = vi.fn()
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: library, total: library.length }),
})
registerEndpoint('/api/games', {
  method: 'POST',
  handler: async (event) => {
    postedGame(await readBody(event))
    library = [...library, fresh]
    return fresh
  },
})

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
const radios = (page: Page) => page.findAll('[role="radio"]')
const stepItems = (page: Page) => page.get('nav[aria-label="Schritte"]').findAll('li')
const picker = (page: Page) => page.get('ul[aria-label="Bibliothek"]')
const inPool = (page: Page) => page.find('ul[aria-label^="Spiele im"]')
const toggle = (page: Page, label: string) => picker(page).get(`button[aria-label="${label}"]`)
/** The card buttons of the picker that say a game is in the pool. */
const pressed = (page: Page) => picker(page).findAll('button[aria-pressed="true"]').map(button => button.attributes('aria-label'))

async function next(page: Page, times = 1) {
  for (let i = 0; i < times; i++) await cta(page).trigger('click')
}

async function settle(page: Page) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
  await vi.waitFor(() => expect(page.find('ul[aria-label="Bibliothek"]').exists() || page.text().includes('Die Bibliothek ist leer.')).toBe(true))
}

/** Names the Session and stands on the Game pool step (step 6 of 8). */
async function toPoolStep(page: Page) {
  await page.get('input[type="text"]').setValue('Freitags-Zocken')
  await next(page, 5)
  await settle(page)
}

async function toTiebreakerStep(page: Page) {
  await toPoolStep(page)
  await next(page)
  await settle(page)
}

async function toLastStep(page: Page) {
  await next(page)
  await page.get('[role="group"]').findAll('input')[0]!.setValue('30.10.2090')
  await page.get('[role="group"]').findAll('input')[1]!.setValue('2030')
}

// What the create request gets: the Event, or the refusal of an unknown game.
const savedEvent = vi.fn()
let refuseUnknownGame = false
registerEndpoint('/api/e', {
  method: 'POST',
  handler: async (event) => {
    savedEvent(await readBody(event))
    if (refuseUnknownGame) throw createError({ statusCode: 400, statusMessage: 'unknown_game' })
    return created
  },
})

/** The hint under the Game pool, or undefined. */
function hint(page: Page) {
  return page.findAll('[role="status"]').find(element => element.text().includes('Wird knapp.'))
}

describe('the pool steps', () => {
  beforeEach(async () => {
    useState('toasts').value = []
    library = [kart, pong, chess]
    postedGame.mockClear()
    savedEvent.mockClear()
    refuseUnknownGame = false
    await clearNuxtData('games')
  })

  it('are steps 6 and 7 of 8, between the Selection mode and the Sessions', async () => {
    const page = await mountCreate()
    await toPoolStep(page)

    expect(page.get('h1').text()).toContain('Schritt 6 von 8')
    expect(page.get('h1').text()).toContain('Welche Spiele kommen in den Pool?')
    expect(stepItems(page).map(item => item.text())).toEqual([
      '✓ Name', '✓ Format', '✓ Spiele', '✓ Punkte', '✓ Auswahlmodus', '6 Spielepool', '7 Tiebreaker-Pool', '8 Termin',
    ])

    await next(page)

    expect(page.get('h1').text()).toContain('Schritt 7 von 8')
    expect(page.get('h1').text()).toContain('Und falls es knapp wird?')
  })

  describe('the Game pool', () => {
    it('lists the library as cards, none of them in the pool, and says the pool is empty', async () => {
      const page = await mountCreate()
      await toPoolStep(page)

      expect(picker(page).findAll('li').map(card => card.get('b').text())).toEqual(['Mario Kart', 'Pong', 'Schach'])
      expect(pressed(page)).toEqual([])
      expect(page.text()).toContain('Im Pool: 0 Spiele')
      expect(page.text()).toContain('Noch leer. Du kannst auch ohne Spiele weitermachen.')
      expect(inPool(page).exists()).toBe(false)
    })

    it('puts a game in the pool with its button and takes it out again', async () => {
      const page = await mountCreate()
      await toPoolStep(page)

      await toggle(page, 'Pong in den Pool').trigger('click')

      expect(toggle(page, 'Pong aus dem Pool nehmen').attributes('aria-pressed')).toBe('true')
      expect(toggle(page, 'Mario Kart in den Pool').attributes('aria-pressed')).toBe('false')
      expect(page.text()).toContain('Im Pool: 1 Spiel')
      expect(page.text()).not.toContain('Noch leer.')
      expect(inPool(page)!.findAll('li').map(row => row.get('b').text())).toEqual(['Pong'])

      await toggle(page, 'Pong aus dem Pool nehmen').trigger('click')

      expect(pressed(page)).toEqual([])
      expect(page.text()).toContain('Im Pool: 0 Spiele')
      expect(inPool(page).exists()).toBe(false)
    })

    it('lists the games of the pool in the order they were added, each with a button to take it out', async () => {
      const page = await mountCreate()
      await toPoolStep(page)
      await toggle(page, 'Schach in den Pool').trigger('click')
      await toggle(page, 'Mario Kart in den Pool').trigger('click')

      const rows = inPool(page)!.findAll('li')
      expect(rows.map(row => row.get('b').text())).toEqual(['Schach', 'Mario Kart'])
      expect(page.text()).toContain('Im Pool: 2 Spiele')

      await rows[0]!.get('button[aria-label="Schach aus dem Pool nehmen"]').trigger('click')

      expect(inPool(page)!.findAll('li').map(row => row.get('b').text())).toEqual(['Mario Kart'])
      expect(pressed(page)).toEqual(['Mario Kart aus dem Pool nehmen'])
    })

    it('searches the library by name, ignoring case', async () => {
      const page = await mountCreate()
      await toPoolStep(page)

      const search = page.findAll('label').find(label => label.text() === 'Spiel aus der Bibliothek suchen')!
      const input = page.get(`[id="${search.attributes('for')}"]`)

      await input.setValue('MARIO')
      expect(picker(page).findAll('li').map(card => card.get('b').text())).toEqual(['Mario Kart'])

      await input.setValue('ch')
      expect(picker(page).findAll('li').map(card => card.get('b').text())).toEqual(['Schach'])

      await input.setValue('zzz')
      expect(page.find('ul[aria-label="Bibliothek"]').exists()).toBe(false)
      expect(page.text()).toContain('Keine Treffer für „zzz“.')

      await input.setValue('')
      expect(picker(page).findAll('li')).toHaveLength(3)
    })

    it('keeps a game in the pool while the search hides its card', async () => {
      const page = await mountCreate()
      await toPoolStep(page)
      await toggle(page, 'Pong in den Pool').trigger('click')
      const search = page.findAll('label').find(label => label.text() === 'Spiel aus der Bibliothek suchen')!

      await page.get(`[id="${search.attributes('for')}"]`).setValue('mario')

      expect(inPool(page)!.findAll('li').map(row => row.get('b').text())).toEqual(['Pong'])
    })

    it('says so when the library is empty, and still offers „Neues Spiel anlegen“', async () => {
      library = []
      const page = await mountCreate()
      await toPoolStep(page)

      expect(page.text()).toContain('Die Bibliothek ist leer.')
      expect(page.findAll('button').some(button => button.text().includes('Neues Spiel anlegen'))).toBe(true)
    })

    describe('the hint', () => {
      const sixteen = Array.from({ length: 16 }, (_, index) => game(100 + index, `Spiel ${String(index + 1).padStart(2, '0')}`))

      async function chooseLuckyWheel(page: Page) {
        await page.get('input[type="text"]').setValue('Freitags-Zocken')
        await next(page, 4)
        await radios(page)[1]!.trigger('click')
        await next(page)
        await settle(page)
      }

      it('shows the numbers of the worst case with the Lucky Wheel, and goes away at the recommended size', async () => {
        library = sixteen
        const page = await mountCreate()
        await chooseLuckyWheel(page)

        // 10 Games, plus 3 vetoes for each of the 2 Parties: 16 games to be safe.
        expect(hint(page)!.text()).toBe('Wird knapp. 10 Spiele plus bis zu 6 Vetos: Im schlimmsten Fall brauchst du 16 Spiele, im Pool sind 0. Blockiert nichts, nur damit du’s weißt.')

        for (let n = 1; n <= 12; n++) await toggle(page, `Spiel ${String(n).padStart(2, '0')} in den Pool`).trigger('click')
        expect(hint(page)!.text()).toBe('Wird knapp. 10 Spiele plus bis zu 6 Vetos: Im schlimmsten Fall brauchst du 16 Spiele, im Pool sind 12. Blockiert nichts, nur damit du’s weißt.')

        for (let n = 13; n <= 15; n++) await toggle(page, `Spiel ${n} in den Pool`).trigger('click')
        expect(hint(page)!.text()).toContain('im Pool sind 15.')

        await toggle(page, 'Spiel 16 in den Pool').trigger('click')
        expect(hint(page)).toBeUndefined()

        await toggle(page, 'Spiel 16 aus dem Pool nehmen').trigger('click')
        expect(hint(page)!.text()).toContain('im Pool sind 15.')
      })

      it('asks only for the Game count with Admin-Wahl', async () => {
        library = sixteen
        const page = await mountCreate()
        await toPoolStep(page)

        expect(hint(page)!.text()).toBe('Wird knapp. Für 10 Spiele brauchst du 10 Spiele im Pool, im Pool sind 0. Blockiert nichts, nur damit du’s weißt.')

        for (let n = 1; n <= 9; n++) await toggle(page, `Spiel ${String(n).padStart(2, '0')} in den Pool`).trigger('click')
        expect(hint(page)!.text()).toContain('im Pool sind 9.')

        await toggle(page, 'Spiel 10 in den Pool').trigger('click')
        expect(hint(page)).toBeUndefined()
      })

      /** Names the Session, sets the Game count and walks on to the Selection mode step. */
      async function toModeStepWith(page: Page, gameCount: number) {
        await page.get('input[type="text"]').setValue('Freitags-Zocken')
        await next(page, 2)
        for (let n = 10; n > gameCount; n--) await page.get('button[aria-label="Anzahl Spiele: weniger"]').trigger('click')
        await next(page, 2)
      }

      it('reads right for one Game and one game in the pool with Admin-Wahl', async () => {
        library = sixteen
        const page = await mountCreate()
        await toModeStepWith(page, 1)
        await next(page, 1)
        await settle(page)

        expect(hint(page)!.text()).toBe('Wird knapp. Für 1 Spiel brauchst du 1 Spiel im Pool, im Pool sind 0. Blockiert nichts, nur damit du’s weißt.')
      })

      it('says „ist 1“ for a single game in the pool', async () => {
        library = sixteen
        const page = await mountCreate()
        await toModeStepWith(page, 2)
        await next(page, 1)
        await settle(page)
        await toggle(page, 'Spiel 01 in den Pool').trigger('click')

        expect(hint(page)!.text()).toBe('Wird knapp. Für 2 Spiele brauchst du 2 Spiele im Pool, im Pool ist 1. Blockiert nichts, nur damit du’s weißt.')
      })

      it('reads right for one Game with the Lucky Wheel', async () => {
        library = sixteen
        const page = await mountCreate()
        await toModeStepWith(page, 1)
        await radios(page)[1]!.trigger('click')
        await next(page)
        await settle(page)

        expect(hint(page)!.text()).toBe('Wird knapp. 1 Spiel plus bis zu 6 Vetos: Im schlimmsten Fall brauchst du 7 Spiele, im Pool sind 0. Blockiert nichts, nur damit du’s weißt.')

        await toggle(page, 'Spiel 01 in den Pool').trigger('click')
        expect(hint(page)!.text()).toContain('im Pool ist 1.')
      })

      it('is a status, not an error, and never blocks Weiter', async () => {
        const page = await mountCreate()
        await toPoolStep(page)

        expect(hint(page)!.attributes('role')).toBe('status')
        expect(page.find('[role="alert"]').exists()).toBe(false)
        expect(cta(page).attributes('aria-disabled')).toBeUndefined()

        await next(page)

        expect(page.get('h1').text()).toContain('Schritt 7 von 8')
      })
    })
  })

  describe('the Tiebreaker pool', () => {
    it('has its own games, apart from the Game pool, and a game may be in both', async () => {
      const page = await mountCreate()
      await toPoolStep(page)
      await toggle(page, 'Pong in den Pool').trigger('click')
      await toggle(page, 'Schach in den Pool').trigger('click')

      await next(page)
      await settle(page)

      expect(page.text()).toContain('Tiebreaker-Pool: 0 Spiele')
      expect(pressed(page)).toEqual([])

      await toggle(page, 'Pong in den Pool').trigger('click')

      expect(page.text()).toContain('Tiebreaker-Pool: 1 Spiel')
      expect(inPool(page)!.findAll('li').map(row => row.get('b').text())).toEqual(['Pong'])
    })

    it('has no hint, even with an empty pool', async () => {
      const page = await mountCreate()
      await toTiebreakerStep(page)

      expect(page.text()).toContain('Noch leer. Du kannst auch ohne Spiele weitermachen.')
      expect(hint(page)).toBeUndefined()
      expect(page.text()).not.toContain('Wird knapp.')
    })

    it('explains the Tiebreaker in the info column', async () => {
      const page = await mountCreate()
      await toTiebreakerStep(page)

      const aside = page.get('aside[aria-label="Erklärung"]')
      expect(aside.text()).toContain('Tiebreaker')
      expect(aside.text()).toContain('Liegen am Ende mehrere Parteien punktgleich auf Platz 1')
    })
  })

  describe('Neues Spiel anlegen', () => {
    const newGameButton = (page: Page) => page.findAll('button').find(button => button.text().includes('Neues Spiel anlegen'))!
    const dialog = () => document.body.querySelector('[role="dialog"]')

    async function createInSheet(page: Page) {
      await newGameButton(page).trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())
      const label = [...dialog()!.querySelectorAll('label')].find(element => element.textContent === 'Name')!
      const input = dialog()!.querySelector<HTMLInputElement>(`[id="${label.getAttribute('for')}"]`)!
      input.value = 'Frisch Angelegt'
      input.dispatchEvent(new Event('input'))
      dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    }

    it('opens the game form in a sheet', async () => {
      const page = await mountCreate()
      await toPoolStep(page)

      await newGameButton(page).trigger('click')

      await vi.waitFor(() => expect(dialog()).not.toBeNull())
      expect(dialog()!.querySelector('h2')!.textContent).toBe('Neues Spiel anlegen')
      expect(dialog()!.querySelector('form')).not.toBeNull()
    })

    it('puts the new game in the pool, closes the sheet and keeps what the Host typed in the other steps', async () => {
      const page = await mountCreate()
      await toPoolStep(page)

      await createInSheet(page)

      await vi.waitFor(() => expect(dialog()).toBeNull())
      expect(postedGame).toHaveBeenCalledWith(expect.objectContaining({ name: 'Frisch Angelegt' }))
      expect(inPool(page)!.findAll('li').map(row => row.get('b').text())).toEqual(['Frisch Angelegt'])
      expect(page.text()).toContain('Im Pool: 1 Spiel')
      await vi.waitFor(() => expect(toggle(page, 'Frisch Angelegt aus dem Pool nehmen').attributes('aria-pressed')).toBe('true'))

      await stepItems(page)[0]!.get('button').trigger('click')
      expect((page.get('input[type="text"]').element as HTMLInputElement).value).toBe('Freitags-Zocken')
    })

    it('puts the new game in the Tiebreaker pool when it is made on that step', async () => {
      const page = await mountCreate()
      await toTiebreakerStep(page)

      await createInSheet(page)

      await vi.waitFor(() => expect(dialog()).toBeNull())
      expect(page.text()).toContain('Tiebreaker-Pool: 1 Spiel')
      expect(inPool(page)!.findAll('li').map(row => row.get('b').text())).toEqual(['Frisch Angelegt'])

      await stepItems(page)[5]!.get('button').trigger('click')
      expect(page.text()).toContain('Im Pool: 0 Spiele')
    })
  })

  describe('Session erstellen', () => {
    it('sends the ids of both pools and shows their counts on the Fertig screen', async () => {
      const page = await mountCreate()
      await toPoolStep(page)
      await toggle(page, 'Pong in den Pool').trigger('click')
      await toggle(page, 'Mario Kart in den Pool').trigger('click')
      await next(page)
      await settle(page)
      await toggle(page, 'Pong in den Pool').trigger('click')
      await toLastStep(page)

      await cta(page).trigger('click')

      await vi.waitFor(() => expect(page.text()).toContain('Freitags-Zocken steht!'))
      expect(savedEvent).toHaveBeenCalledWith(expect.objectContaining({ pools: { main: [pong.id, kart.id], tiebreaker: [pong.id] } }))
      const rows = new Map(page.get('dl').findAll('dt').map((term, index) => [term.text(), page.get('dl').findAll('dd')[index]!.text()]))
      expect(rows.get('Pool')).toBe('2 Spiele, Tiebreaker 1')
    })

    it('creates the Event with empty pools', async () => {
      const page = await mountCreate()
      await toPoolStep(page)
      await next(page)
      await toLastStep(page)

      await cta(page).trigger('click')

      await vi.waitFor(() => expect(page.text()).toContain('Freitags-Zocken steht!'))
      expect(savedEvent).toHaveBeenCalledWith(expect.objectContaining({ pools: { main: [], tiebreaker: [] } }))
    })

    it('says so when a game of the pool is gone from the library, and keeps the draft', async () => {
      refuseUnknownGame = true
      const page = await mountCreate()
      await toPoolStep(page)
      await toggle(page, 'Pong in den Pool').trigger('click')
      await next(page)
      await toLastStep(page)

      await cta(page).trigger('click')

      await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Ein Spiel aus dem Pool gibt es nicht mehr.'))
    })
  })
})
