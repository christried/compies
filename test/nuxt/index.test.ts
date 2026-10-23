import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IndexPage from '~/pages/index.vue'
import type { HomeSession } from '~~/shared/session'
import { kitty, signInAs } from './auth'

// One endpoint for the file (a second registration on the same path is not replaced). Each test sets
// what it returns, whether it fails and whether it hangs.
const host = { name: 'Hostess' }
let homeSessions: HomeSession[] = []
let mode: 'ok' | 'fail' | 'hang' = 'ok'
const requests = vi.fn()

registerEndpoint('/api/s', {
  method: 'GET',
  handler: () => {
    requests()
    if (mode === 'fail') throw createError({ statusCode: 500, statusMessage: 'boom' })
    if (mode === 'hang') return new Promise(() => {})
    return { sessions: homeSessions }
  },
})

function card(overrides: Partial<HomeSession>): HomeSession {
  return {
    slug: 'freitags-zocken-k7q2',
    name: 'Freitags-Zocken',
    host,
    phase: 'poll',
    dateMode: 'poll',
    startsAt: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    bestSlot: null,
    progress: { voted: 1, total: 3 },
    viewerVoted: false,
    isHost: false,
    action: 'vote',
    ...overrides,
  }
}

async function settle(page: Awaited<ReturnType<typeof mountSuspended>>) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
}

describe('home page', () => {
  beforeEach(async () => {
    signInAs(kitty)
    homeSessions = []
    mode = 'ok'
    requests.mockClear()
    await clearNuxtData('home-sessions')
  })

  it('renders the German copy and the cards from the Home endpoint', async () => {
    homeSessions = [card({ name: 'Freitags-Zocken' })]
    const page = await mountSuspended(IndexPage)
    await settle(page)

    expect(page.text()).toContain('Compies')
    expect(page.get('h1').text()).toBe('Wann zocken wir?')
    expect(page.get('h3').text()).toBe('Freitags-Zocken')
  })

  it('shows two skeleton cards marked busy while the list loads', async () => {
    mode = 'hang'
    const page = await mountSuspended(IndexPage)

    const busy = page.get('[aria-busy="true"]')
    expect(busy.findAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2)
    expect(page.findAll('h3').length).toBe(0)
  })

  it('shows the player empty state when the User has no Sessions', async () => {
    const page = await mountSuspended(IndexPage)
    await settle(page)

    expect(page.get('h1').text()).toBe('Noch nix los.')
    expect(page.text()).toContain('Noch keine Einladung.')
  })

  it('shows a Host with no Sessions the same friendly empty state, with no notice about hosting', async () => {
    signInAs({ ...kitty, canHost: true })
    const page = await mountSuspended(IndexPage)
    await settle(page)

    expect(page.text()).toContain('Noch keine Einladung.')
    expect(page.text()).not.toContain('Noch keine Session.')
  })

  it('shows „Neue Terminumfrage“ only to Users with the Host permission', async () => {
    const player = await mountSuspended(IndexPage)
    await settle(player)
    expect(player.text()).not.toContain('Neue Terminumfrage')

    signInAs({ ...kitty, canHost: true })
    await clearNuxtData('home-sessions')
    const hostPage = await mountSuspended(IndexPage)
    await settle(hostPage)
    const cta = hostPage.findAll('a').find(link => link.text().includes('Neue Terminumfrage'))
    expect(cta?.attributes('href')).toBe('/neu')
  })

  it('labels each card’s call to action: Abstimmen while not voted, Ansehen once voted, Öffnen for the Host', async () => {
    homeSessions = [
      card({ slug: 'a-aaaa', name: 'Offen', action: 'vote' }),
      card({ slug: 'b-bbbb', name: 'Gesehen', action: 'view', viewerVoted: true, progress: { voted: 3, total: 3 } }),
      card({ slug: 'c-cccc', name: 'Meins', action: 'open', isHost: true, host: { name: 'Kitty' } }),
    ]
    const page = await mountSuspended(IndexPage)
    await settle(page)

    const links = page.findAll('a[href^="/s/"]')
    expect(links.map(link => link.text())).toEqual(['Abstimmen', 'Ansehen', 'Öffnen'])
    expect(links[0]!.attributes('href')).toBe('/s/a-aaaa')
    expect(page.text()).toContain('Host: du')
  })

  it('shows the Best slot so far for an open poll and the Date for a set Session', async () => {
    homeSessions = [
      card({ slug: 'a-aaaa', name: 'Umfrage', bestSlot: { id: 'x', startsAt: '2090-10-31T18:00:00.000Z' } }),
      card({ slug: 'b-bbbb', name: 'Fest', phase: 'date_set', dateMode: 'direct', startsAt: '2090-11-01T19:00:00.000Z', action: 'view', progress: { voted: 0, total: 0 } }),
    ]
    const page = await mountSuspended(IndexPage)
    await settle(page)

    expect(page.text()).toContain('Bester Termin bisher')
    expect(page.text()).toContain('Termin steht')
  })

  it('shows the error state with a retry when the list fails to load', async () => {
    mode = 'fail'
    const page = await mountSuspended(IndexPage)
    await vi.waitFor(() => expect(page.text()).toContain('Da ist was schiefgelaufen.'))

    expect(page.get('h1').text()).toBe('Wann zocken wir?')

    mode = 'ok'
    homeSessions = [card({ name: 'Wieder da' })]
    await page.findAll('button').find(button => button.text() === 'Nochmal versuchen')!.trigger('click')
    await vi.waitFor(() => expect(page.text()).toContain('Wieder da'))
  })

  it('refetches the list when the window regains focus', async () => {
    homeSessions = [card({})]
    const page = await mountSuspended(IndexPage)
    await settle(page)
    const before = requests.mock.calls.length

    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(requests.mock.calls.length).toBeGreaterThan(before))
  })

  it('refetches the list when the tab becomes visible again, and not while it is hidden', async () => {
    homeSessions = [card({})]
    const page = await mountSuspended(IndexPage)
    await settle(page)
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
