import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ArchivePage from '~/pages/archiv.vue'
import type { ArchiveEntry } from '~~/shared/archive'
import { kitty, signInAs } from './auth'

// The Archive page (#882): the list of finished Events, its states and the card. One endpoint for the file (a second registration on
// the same path is not replaced); each test sets what it returns, whether it fails and whether it hangs.
let entries: ArchiveEntry[] = []
let mode: 'ok' | 'fail' | 'hang' = 'ok'
const requests = vi.fn()

registerEndpoint('/api/archive', {
  method: 'GET',
  handler: () => {
    requests()
    if (mode === 'fail') throw createError({ statusCode: 500, statusMessage: 'boom' })
    if (mode === 'hang') return new Promise(() => {})
    return { events: entries }
  },
})

function entry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    slug: 'freitags-zocken-k7q2',
    name: 'Freitags-Zocken',
    finishedAt: '2026-10-25T21:00:00.000Z',
    format: { teamCount: 4, teamSize: 2 },
    gameCount: 7,
    memberCount: 9,
    isHost: false,
    seated: true,
    resultOpen: false,
    ...overrides,
  }
}

/** `n` entries with their own slug and name. */
const many = (n: number) => Array.from({ length: n }, (_, index) => entry({ slug: `event-${index}`, name: `Event ${index}` }))

async function settle(page: VueWrapper) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
}

async function mountPage(list: ArchiveEntry[]) {
  entries = list
  const page = await mountSuspended(ArchivePage)
  await settle(page)
  return page
}

/** The title row: the header that holds the h1 (the app's own header is another one). */
const titleRow = (page: VueWrapper) => page.findAll('header').find(element => element.find('h1').exists())!

/** The text of the card's date line: the element under the name. */
const metaOf = (page: VueWrapper, index = 0) => page.findAll('li a')[index]!.get('b + span').text()

describe('archive page', () => {
  beforeEach(async () => {
    signInAs(kitty)
    entries = []
    mode = 'ok'
    requests.mockClear()
    await clearNuxtData('archive')
  })

  describe('the title and the count', () => {
    it('has „Archiv“ as the one h1', async () => {
      const page = await mountPage([entry()])

      expect(page.findAll('h1').map(heading => heading.text())).toEqual(['Archiv'])
    })

    it.each([
      [1, '1 Event'],
      [7, '7 Events'],
    ])('counts %i entries as „%s“', async (n, text) => {
      const page = await mountPage(many(n))

      expect(titleRow(page).text()).toContain(text)
    })

    it('shows no count while the list is empty', async () => {
      const page = await mountPage([])

      expect(titleRow(page).text()).toBe('Archiv')
    })

    it('shows no count while loading', async () => {
      mode = 'hang'
      const page = await mountSuspended(ArchivePage)

      expect(titleRow(page).text()).toBe('Archiv')
    })

    it('shows no count when the list failed', async () => {
      mode = 'fail'
      const page = await mountSuspended(ArchivePage)
      await vi.waitFor(() => expect(page.text()).toContain('Da ist was schiefgelaufen.'))

      expect(titleRow(page).text()).toBe('Archiv')
    })
  })

  describe('the card', () => {
    it('is one link to the Event, named by the Event\'s name alone', async () => {
      const page = await mountPage([entry({ isHost: true, seated: false })])

      const links = page.findAll('li a')
      expect(links).toHaveLength(1)
      expect(links[0]!.attributes('href')).toBe('/e/freitags-zocken-k7q2')
      const id = links[0]!.attributes('aria-labelledby')!
      expect(page.element.querySelector(`#${CSS.escape(id)}`)?.textContent).toBe('Freitags-Zocken')
    })

    it('gives each card its own link and its own label', async () => {
      const page = await mountPage(many(3))

      const links = page.findAll('li a')
      expect(links.map(link => link.attributes('href'))).toEqual(['/e/event-0', '/e/event-1', '/e/event-2'])
      expect(new Set(links.map(link => link.attributes('aria-labelledby'))).size).toBe(3)
    })

    it('has no heading of its own, so the page outline stays one h1', async () => {
      const page = await mountPage(many(2))

      expect(page.findAll('li h1, li h2, li h3, li h4').length).toBe(0)
    })

    it('shows a Player who is not the Host neither „Host“ nor „Tribüne“', async () => {
      const page = await mountPage([entry({ isHost: false, seated: true })])
      const card = page.get('li a').text()

      expect(card).not.toContain('Host')
      expect(card).not.toContain('Tribüne')
    })

    it('shows a Member on the Stands „Tribüne“', async () => {
      const page = await mountPage([entry({ isHost: false, seated: false })])
      const card = page.get('li a').text()

      expect(card).toContain('Tribüne')
      expect(card).not.toContain('Host')
    })

    it('shows the Host „Host“ with the crown', async () => {
      const page = await mountPage([entry({ isHost: true, seated: true })])
      const card = page.get('li a')

      expect(card.text()).toContain('Host')
      expect(card.text()).not.toContain('Tribüne')
      expect(card.find('svg').exists()).toBe(true)
    })

    it('shows a Host on the Stands both marks', async () => {
      const page = await mountPage([entry({ isHost: true, seated: false })])

      expect(page.get('li a').text()).toContain('Host')
      expect(page.get('li a').text()).toContain('Tribüne')
    })

    it('shows the Format as „4 Teams à 2“, and none when the Event has no settings', async () => {
      const set = await mountPage([entry({ format: { teamCount: 4, teamSize: 2 } })])
      expect(set.get('li a').text()).toContain('4 Teams à 2')

      await clearNuxtData('archive')
      const unset = await mountPage([entry({ format: null })])
      expect(unset.get('li a').text()).not.toContain('Teams à')
    })

    it('never shows a phase, a Phase pill or the Host\'s name', async () => {
      const page = await mountPage([entry()])
      const card = page.get('li a').text()

      expect(card).not.toContain('Abgeschlossen')
      expect(card).not.toContain('Läuft')
      expect(card).not.toContain('Hostess')
    })

    it('lets a long name wrap instead of widening the card', async () => {
      const long = 'W'.repeat(60)
      const page = await mountPage([entry({ name: long })])

      const name = page.get('li a b')
      expect(name.text()).toBe(long)
      expect(name.classes()).toContain('[overflow-wrap:anywhere]')
      expect(page.get('li').classes()).toContain('min-w-0')
    })
  })

  describe('the date line', () => {
    it('reads the Berlin day, the games and the people', async () => {
      const page = await mountPage([entry({ finishedAt: '2026-10-25T21:00:00.000Z', gameCount: 7, memberCount: 9 })])

      expect(metaOf(page)).toBe('So 25.10.2026, 7 Spiele, 9 Leute')
    })

    it('uses the singular for one game and one person', async () => {
      const page = await mountPage([entry({ gameCount: 1, memberCount: 1 })])

      expect(metaOf(page)).toBe('So 25.10.2026, 1 Spiel, 1 Person')
    })

    it('reads 0 games as „0 Spiele“', async () => {
      const page = await mountPage([entry({ gameCount: 0 })])

      expect(metaOf(page)).toBe('So 25.10.2026, 0 Spiele, 9 Leute')
    })

    it('reads the day in Berlin time: 23:30 UTC on the 24th is the 25th', async () => {
      const page = await mountPage([entry({ finishedAt: '2026-10-24T23:30:00.000Z' })])

      expect(metaOf(page)).toBe('So 25.10.2026, 7 Spiele, 9 Leute')
    })

    it('leaves the date and its comma out without a finishedAt', async () => {
      const page = await mountPage([entry({ finishedAt: null })])

      expect(metaOf(page)).toBe('7 Spiele, 9 Leute')
    })
  })

  describe('the list', () => {
    it('is a grid of one column, two from 600 px and three from 1024 px', async () => {
      const page = await mountPage(many(3))

      const list = page.get('ul')
      expect(list.classes()).toEqual(expect.arrayContaining(['grid-cols-1', 'min-[600px]:grid-cols-2', 'min-[1024px]:grid-cols-3']))
      expect(list.findAll('li')).toHaveLength(3)
    })

    it('keeps the server\'s order', async () => {
      const page = await mountPage([entry({ slug: 'b', name: 'Zweites' }), entry({ slug: 'a', name: 'Erstes' })])

      expect(page.findAll('li a b').map(name => name.text())).toEqual(['Zweites', 'Erstes'])
    })
  })

  describe('the states', () => {
    it('shows the empty state with its two texts and no control of its own', async () => {
      const page = await mountPage([])

      expect(page.text()).toContain('Hier wird’s bald voll.')
      expect(page.text()).toContain('Events landen hier, sobald sie abgeschlossen sind.')
      const main = page.get('main')
      expect(main.findAll('input').length).toBe(0)
      expect(main.findAll('[aria-pressed]').length).toBe(0)
      expect(main.findAll('button').length).toBe(0)
      expect(main.findAll('a[href]').length).toBe(0)
      expect(page.find('ul').exists()).toBe(false)
    })

    it('shows six skeleton cards in the Archive shape on a busy list, the last three hidden below 600 px', async () => {
      mode = 'hang'
      const page = await mountSuspended(ArchivePage)

      const list = page.get('[aria-busy="true"]')
      expect(list.classes()).toEqual(expect.arrayContaining(['grid-cols-1', 'min-[600px]:grid-cols-2', 'min-[1024px]:grid-cols-3']))
      const cards = list.findAll('[aria-hidden="true"]')
      expect(cards).toHaveLength(6)
      expect(cards.map(card => card.classes().includes('max-[599px]:hidden'))).toEqual([false, false, false, true, true, true])
      expect(cards.every(card => card.classes().includes('rounded-[16px]'))).toBe(true)
      expect(page.findAll('li').length).toBe(0)
    })

    it('says „Archiv lädt …“ in a status line under the skeleton cards', async () => {
      mode = 'hang'
      const page = await mountSuspended(ArchivePage)

      const status = page.get('[role="status"]')
      expect(status.text()).toBe('Archiv lädt …')
      expect(status.element.previousElementSibling).toBe(page.get('[aria-busy="true"]').element)
    })

    it('takes the skeleton cards and the status line away once the read resolves', async () => {
      mode = 'hang'
      const page = await mountSuspended(ArchivePage)
      expect(page.get('[aria-busy="true"]').findAll('[aria-hidden="true"]')).toHaveLength(6)

      mode = 'ok'
      entries = [entry()]
      window.dispatchEvent(new Event('focus'))

      await settle(page)
      expect(page.find('[role="status"]').exists()).toBe(false)
      expect(page.findAll('li a')).toHaveLength(1)
    })

    it('shows the error state with a retry, and a click on it loads the list again', async () => {
      mode = 'fail'
      const page = await mountSuspended(ArchivePage)
      await vi.waitFor(() => expect(page.text()).toContain('Da ist was schiefgelaufen.'))

      expect(page.get('h1').text()).toBe('Archiv')

      mode = 'ok'
      entries = [entry({ name: 'Wieder da' })]
      const before = requests.mock.calls.length
      await page.findAll('button').find(button => button.text() === 'Nochmal versuchen')!.trigger('click')
      await vi.waitFor(() => expect(page.text()).toContain('Wieder da'))
      expect(requests.mock.calls.length).toBeGreaterThan(before)
    })
  })

  describe('coming back to the page', () => {
    it('refetches the list when the window regains focus', async () => {
      const page = await mountPage([entry()])
      const before = requests.mock.calls.length
      entries = [entry({ name: 'Neu dazu', slug: 'neu' }), entry()]

      window.dispatchEvent(new Event('focus'))

      await vi.waitFor(() => expect(requests.mock.calls.length).toBeGreaterThan(before))
      await vi.waitFor(() => expect(page.text()).toContain('Neu dazu'))
    })

    it('refetches the list when the tab becomes visible again, and not while it is hidden', async () => {
      await mountPage([entry()])
      const visibility = vi.spyOn(document, 'visibilityState', 'get')

      try {
        visibility.mockReturnValue('hidden')
        const before = requests.mock.calls.length
        document.dispatchEvent(new Event('visibilitychange'))
        await new Promise(resolve => setTimeout(resolve, 50))
        expect(requests.mock.calls.length).toBe(before)

        visibility.mockReturnValue('visible')
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.waitFor(() => expect(requests.mock.calls.length).toBeGreaterThan(before))
      }
      finally {
        visibility.mockRestore()
      }
    })
  })
})
