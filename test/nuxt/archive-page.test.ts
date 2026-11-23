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

async function mountPage(list: ArchiveEntry[], route = '/archiv', options: { attachTo?: HTMLElement } = {}) {
  entries = list
  const page = await mountSuspended(ArchivePage, { route, ...options })
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
    // The filters live in the address (#885): each test starts on a plain Archive, and the history of the one before stays behind.
    await useRouter().push('/archiv')
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

    it('shows the list it had on the way back, with its filters and no skeleton, and refreshes it behind (#984)', async () => {
      const page = await mountPage([entry({ slug: 'win', name: 'Sieg-Abend', resultOpen: true, rank: 1 }), entry({ slug: 'zwei', name: 'Zweiter-Abend', resultOpen: true, rank: 2 })], '/archiv?filter=won')
      page.unmount()
      mode = 'hang'
      const before = requests.mock.calls.length

      const back = await mountSuspended(ArchivePage, { route: '/archiv?filter=won' })

      expect(back.find('[aria-busy="true"]').exists()).toBe(false)
      expect(back.findAll('li a b').map(name => name.text())).toEqual(['Sieg-Abend'])
      expect(back.findAll('main button[aria-pressed="true"]').map(button => button.text())).toEqual(['Gewonnen'])
      await vi.waitFor(() => expect(requests.mock.calls.length).toBeGreaterThan(before))
      expect(back.find('[aria-busy="true"]').exists()).toBe(false)
    })

    it('shows no kept list after the Archive\'s data was cleared (a deleted Event, a sign-out)', async () => {
      const page = await mountPage([entry()])
      page.unmount()
      await clearNuxtData('archive')
      mode = 'hang'

      const back = await mountSuspended(ArchivePage)

      expect(back.find('[aria-busy="true"]').exists()).toBe(true)
      expect(back.findAll('li').length).toBe(0)
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
  describe('the chips, the search and the address (#885)', () => {
    const chip = (page: VueWrapper, text: string) => page.findAll('main button').find(button => button.text() === text)
    const pressed = (page: VueWrapper) => page.findAll('main button[aria-pressed="true"]').map(button => button.text())
    const query = () => useRouter().currentRoute.value.query
    const cards = (page: VueWrapper) => page.findAll('li a b').map(name => name.text())
    const field = (page: VueWrapper) => page.get('input[type="search"]')
    const typeInto = (page: VueWrapper, text: string) => field(page).setValue(text)

    const win = entry({ slug: 'win', name: 'Sieg-Abend', resultOpen: true, rank: 1 })
    const tie = entry({ slug: 'tie', name: 'Unentschieden-Abend', resultOpen: true, rank: 1, winners: [{ position: 1, name: null }, { position: 2, name: null }] })
    const second = entry({ slug: 'second', name: 'Zweiter-Abend', resultOpen: true, rank: 2 })
    const closed = entry({ slug: 'closed', name: 'Offener-Abend', resultOpen: false })
    const stands = entry({ slug: 'stands', name: 'Tribünen-Abend', resultOpen: true, rank: null, seated: false })
    const hosted = entry({ slug: 'hosted', name: 'Halo-Abend', isHost: true })
    const mixed = [win, tie, second, closed, stands, hosted]

    describe('the chips', () => {
      it('presses „Alle“ on arrival and exactly the clicked chip after a click', async () => {
        const page = await mountPage(mixed)

        expect(page.findAll('main button').map(button => [button.text(), button.attributes('aria-pressed')])).toEqual([
          ['Alle', 'true'],
          ['Gewonnen', 'false'],
          ['Als Host', 'false'],
        ])

        await chip(page, 'Gewonnen')!.trigger('click')
        expect(pressed(page)).toEqual(['Gewonnen'])

        await chip(page, 'Als Host')!.trigger('click')
        expect(pressed(page)).toEqual(['Als Host'])
      })

      it('leaves on „Gewonnen“ a win and an „Unentschieden“, and not a rank 2, a closed entry or a Member on the Stands', async () => {
        const page = await mountPage(mixed)

        await chip(page, 'Gewonnen')!.trigger('click')

        expect(cards(page)).toEqual(['Sieg-Abend', 'Unentschieden-Abend'])
      })

      it('leaves on „Als Host“ the Events the viewer hosts', async () => {
        const page = await mountPage(mixed)

        await chip(page, 'Als Host')!.trigger('click')

        expect(cards(page)).toEqual(['Halo-Abend'])
      })

      it('has „Als Host“ only when the viewer hosts an Event', async () => {
        const page = await mountPage([win, second])
        expect(chip(page, 'Als Host')).toBeUndefined()
        expect(chip(page, 'Gewonnen')).toBeDefined()

        await clearNuxtData('archive')
        const hosting = await mountPage([win, hosted])
        expect(chip(hosting, 'Als Host')).toBeDefined()
      })

      it('reads ?filter=host without a hosted Event as „Alle“ and leaves the address alone', async () => {
        const page = await mountPage([win, second], '/archiv?filter=host')

        expect(pressed(page)).toEqual(['Alle'])
        expect(cards(page)).toEqual(['Sieg-Abend', 'Zweiter-Abend'])
        expect(query().filter).toBe('host')
      })

      it('reads an unknown ?filter as „Alle“', async () => {
        const page = await mountPage(mixed, '/archiv?filter=banane')

        expect(pressed(page)).toEqual(['Alle'])
        expect(cards(page)).toHaveLength(mixed.length)
      })
    })

    describe('the search', () => {
      it('finds a part of the name whatever the case, spaces around the term ignored, and follows each input before the address does', async () => {
        const page = await mountPage(mixed)

        await typeInto(page, 'halo')
        expect(cards(page)).toEqual(['Halo-Abend'])
        expect(query().q).toBeUndefined()

        await typeInto(page, '  HALO  ')
        expect(cards(page)).toEqual(['Halo-Abend'])

        await typeInto(page, 'halo')
        await vi.waitFor(() => expect(query().q).toBe('halo'), { timeout: 5000 })
      })

      it('reads a term of spaces only as no search, and keeps no q in the address', async () => {
        const page = await mountPage(mixed)

        await typeInto(page, '   ')

        expect(cards(page)).toHaveLength(mixed.length)
        await new Promise(resolve => setTimeout(resolve, 400))
        expect(query().q).toBeUndefined()
      })

      it('works with a chip: „Gewonnen“ and a name', async () => {
        const page = await mountPage([entry({ slug: 'a', name: 'Kart A', resultOpen: true, rank: 1 }), entry({ slug: 'b', name: 'Kart B', resultOpen: true, rank: 2 }), win])

        await chip(page, 'Gewonnen')!.trigger('click')
        await typeInto(page, 'kart')

        expect(cards(page)).toEqual(['Kart A'])
      })
    })

    describe('the count', () => {
      it('follows the chip and the search, and reads 0 when a filter leaves nothing', async () => {
        const page = await mountPage([...many(6), win])
        expect(titleRow(page).text()).toContain('7 Events')

        await chip(page, 'Gewonnen')!.trigger('click')
        expect(titleRow(page).text()).toContain('1 Event')
        expect(titleRow(page).text()).not.toContain('1 Events')

        await typeInto(page, 'zzz')
        expect(titleRow(page).text()).toContain('0 Events')
      })

      it('shows no count in the empty Archive', async () => {
        const page = await mountPage([])

        expect(titleRow(page).text()).toBe('Archiv')
      })
    })

    describe('the address', () => {
      it('adds one history entry and sets ?filter for a chip, and takes it out again for „Alle“', async () => {
        const page = await mountPage(mixed)
        const before = window.history.length

        await chip(page, 'Gewonnen')!.trigger('click')
        await vi.waitFor(() => expect(query().filter).toBe('won'))
        expect(window.history.length).toBe(before + 1)

        await chip(page, 'Alle')!.trigger('click')
        await vi.waitFor(() => expect(query().filter).toBeUndefined())
      })

      it('adds no history entry for typing', async () => {
        const page = await mountPage(mixed)
        const before = window.history.length

        await typeInto(page, 'h')
        await typeInto(page, 'ha')
        await typeInto(page, 'halo')
        await vi.waitFor(() => expect(query().q).toBe('halo'), { timeout: 5000 })

        expect(window.history.length).toBe(before)
      })

      it('shows both from ?filter=won&q=kart in the controls', async () => {
        const page = await mountPage([entry({ slug: 'a', name: 'Kart A', resultOpen: true, rank: 1 }), win], '/archiv?filter=won&q=kart')

        expect(pressed(page)).toEqual(['Gewonnen'])
        expect((field(page).element as HTMLInputElement).value).toBe('kart')
        expect(cards(page)).toEqual(['Kart A'])
      })

      it('follows the address when it changes under the page', async () => {
        const page = await mountPage(mixed)

        await useRouter().push('/archiv?filter=host')

        await vi.waitFor(() => expect(pressed(page)).toEqual(['Als Host']))
        expect(cards(page)).toEqual(['Halo-Abend'])
      })

      it('returns to „Alle“ on back after a chip', async () => {
        const page = await mountPage(mixed)
        await chip(page, 'Gewonnen')!.trigger('click')
        await vi.waitFor(() => expect(query().filter).toBe('won'))

        useRouter().back()

        await vi.waitFor(() => expect(pressed(page)).toEqual(['Alle']))
        expect(cards(page)).toHaveLength(mixed.length)
      })

      it('keeps a foreign parameter of the address through a chip', async () => {
        const page = await mountPage(mixed, '/archiv?utm=x')

        await chip(page, 'Gewonnen')!.trigger('click')

        await vi.waitFor(() => expect(query()).toEqual({ utm: 'x', filter: 'won' }))
      })
    })

    describe('no results', () => {
      it('says „Nix gefunden zu „Zzz“.“ with its text and no „Alle zeigen“ for a search under „Alle“', async () => {
        const page = await mountPage(mixed)

        await typeInto(page, 'Zzz')

        expect(page.get('h2').text()).toBe('Nix gefunden zu „Zzz“.')
        expect(page.text()).toContain('Probier einen anderen Namen oder nimm den Filter raus.')
        expect(chip(page, 'Alle zeigen')).toBeUndefined()
        expect(page.find('ul').exists()).toBe(false)
      })

      it('lets a long term without spaces wrap in the title instead of widening the page', async () => {
        const page = await mountPage(mixed)
        const long = 'W'.repeat(60)

        await typeInto(page, long)

        expect(page.get('h2').text()).toBe(`Nix gefunden zu „${long}“.`)
        expect(page.get('h2').classes()).toContain('[overflow-wrap:anywhere]')
      })

      it('offers „Alle zeigen“ with „Gewonnen“ and a search', async () => {
        const page = await mountPage(mixed)
        await chip(page, 'Gewonnen')!.trigger('click')

        await typeInto(page, 'Zzz')

        expect(page.get('h2').text()).toBe('Nix gefunden zu „Zzz“.')
        expect(page.text()).toContain('Probier einen anderen Namen oder nimm den Filter raus.')
        expect(chip(page, 'Alle zeigen')).toBeDefined()
      })

      it('says „Noch kein Sieg dabei.“ without a text for „Gewonnen“ alone with no win, and offers „Alle zeigen“', async () => {
        const page = await mountPage([second, closed, stands])

        await chip(page, 'Gewonnen')!.trigger('click')

        expect(page.get('h2').text()).toBe('Noch kein Sieg dabei.')
        expect(page.find('h2 + p').exists()).toBe(false)
        expect(chip(page, 'Alle zeigen')).toBeDefined()
      })

      it('goes back to „Alle“ with „Alle zeigen“, keeps the search in the field and in the address, takes ?filter out and focuses „Alle“', async () => {
        const host = document.createElement('div')
        document.body.append(host)
        try {
          const page = await mountPage(mixed, '/archiv', { attachTo: host })
          await chip(page, 'Gewonnen')!.trigger('click')
          await typeInto(page, 'Zzz')
          await vi.waitFor(() => expect(query()).toEqual({ filter: 'won', q: 'Zzz' }), { timeout: 5000 })

          await chip(page, 'Alle zeigen')!.trigger('click')

          expect(pressed(page)).toEqual(['Alle'])
          expect((field(page).element as HTMLInputElement).value).toBe('Zzz')
          await vi.waitFor(() => expect(query()).toEqual({ q: 'Zzz' }))
          await vi.waitFor(() => expect(document.activeElement).toBe(chip(page, 'Alle')!.element))
        }
        finally {
          host.remove()
        }
      })
    })

    describe('the states without controls', () => {
      it('shows no field and no chip for a User without an Event', async () => {
        const page = await mountPage([])

        const main = page.get('main')
        expect(main.findAll('input').length).toBe(0)
        expect(main.findAll('[aria-pressed]').length).toBe(0)
      })

      it('holds the places of the field and of „Alle“ and „Gewonnen“ while loading, inert, with „Alle“ pressed and no „Als Host“ (#984)', async () => {
        mode = 'hang'
        const page = await mountSuspended(ArchivePage, { route: '/archiv?filter=won&q=sieg' })

        const main = page.get('main')
        const input = main.get('input[type="search"]')
        expect(input.attributes('disabled')).toBeDefined()
        expect((input.element as HTMLInputElement).value).toBe('')
        const buttons = main.findAll('button')
        expect(buttons.map(button => button.text())).toEqual(['Alle', 'Gewonnen'])
        expect(buttons.every(button => button.attributes('disabled') !== undefined)).toBe(true)
        expect(pressed(page)).toEqual(['Alle'])
      })

      it('enables the controls when the list arrives and adds „Als Host“ for a hosting User (#984)', async () => {
        mode = 'hang'
        const page = await mountSuspended(ArchivePage, { route: '/archiv' })

        mode = 'ok'
        entries = [win, hosted]
        window.dispatchEvent(new Event('focus'))
        await settle(page)

        expect(page.get('main input[type="search"]').attributes('disabled')).toBeUndefined()
        expect(page.findAll('main button').map(button => button.text())).toEqual(['Alle', 'Gewonnen', 'Als Host'])
        expect(page.findAll('main button').every(button => button.attributes('disabled') === undefined)).toBe(true)
        expect(cards(page)).toEqual(['Sieg-Abend', 'Halo-Abend'])
      })

      it('shows no field and no chip once an empty Archive arrives after loading (#984)', async () => {
        mode = 'hang'
        const page = await mountSuspended(ArchivePage, { route: '/archiv' })
        expect(page.findAll('main input').length).toBe(1)

        mode = 'ok'
        entries = []
        window.dispatchEvent(new Event('focus'))
        await settle(page)

        expect(page.findAll('main input').length).toBe(0)
        expect(page.findAll('main [aria-pressed]').length).toBe(0)
      })

      it('shows no field and no chip when the list failed', async () => {
        mode = 'fail'
        const page = await mountSuspended(ArchivePage, { route: '/archiv' })
        await vi.waitFor(() => expect(page.text()).toContain('Da ist was schiefgelaufen.'))

        const main = page.get('main')
        expect(main.findAll('input').length).toBe(0)
        expect(main.findAll('[aria-pressed]').length).toBe(0)
      })

      it('keeps chip and search through a refetch', async () => {
        const page = await mountPage(mixed)
        await chip(page, 'Gewonnen')!.trigger('click')
        await typeInto(page, 'sieg')
        const before = requests.mock.calls.length

        window.dispatchEvent(new Event('focus'))
        await vi.waitFor(() => expect(requests.mock.calls.length).toBeGreaterThan(before))

        expect(pressed(page)).toEqual(['Gewonnen'])
        expect((field(page).element as HTMLInputElement).value).toBe('sieg')
        expect(cards(page)).toEqual(['Sieg-Abend'])
      })
    })

    it('names the field „Event suchen“ for the eye and for a screen reader', async () => {
      const page = await mountPage(mixed)

      expect(field(page).attributes('aria-label')).toBe('Event suchen')
      expect(field(page).attributes('placeholder')).toBe('Event suchen')
    })
  })
})
