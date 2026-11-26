import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminEvents from '~/components/AdminEvents.vue'
import AdminPage from '~/pages/admin.vue'
import type { AdminEvent, AdminView } from '~~/shared/admin'
import { kitty, signInAs } from './auth'

// The section „Events“ of the Admin page (#876, spec #938): the rows in the look of the Archive card, which of them link, „Gelöscht“, the search and its empty
// state. The section is mounted with entries; the page test only places it. Events are invented.
let view: AdminView = { users: [], deletedUsers: 0, events: [] }
registerEndpoint('/api/admin', { method: 'GET', handler: () => view })

function entry(overrides: Partial<AdminEvent> & Pick<AdminEvent, 'name'>): AdminEvent {
  return {
    hostName: 'Sanne', phase: 'poll', memberCount: 4, sessionCount: 2, createdAt: '2026-03-12T10:00:00.000Z', finishedAt: null, deletedAt: null, ...overrides,
  }
}

const linked = entry({ name: 'Freitags-Zocken', hostName: 'Kitty', phase: 'running', memberCount: 9, sessionCount: 1, path: '/e/freitags-zocken-k7q2' })
const finished = entry({ name: 'Sommerturnier', phase: 'finished', memberCount: 1, sessionCount: 3, createdAt: '2026-02-01T10:00:00.000Z', finishedAt: '2026-02-20T21:00:00.000Z' })
const deleted = entry({ name: 'Altes Event', phase: 'poll', createdAt: '2026-01-05T10:00:00.000Z', deletedAt: '2026-01-20T09:00:00.000Z' })
const unnamedHost = entry({ name: 'Ohne Host-Namen', hostName: null, createdAt: '2025-12-01T10:00:00.000Z' })

const mountSection = (events: AdminEvent[] = [linked, finished, deleted, unnamedHost]) => mountSuspended(AdminEvents, { props: { events } })
const rows = (section: VueWrapper) => section.findAll('ul[aria-label="Events"] > li')
const rowOf = (section: VueWrapper, name: string) => rows(section).find(row => row.text().includes(name))!

describe('the section „Events“ of the Admin page', () => {
  it('is headed „Events“ and shows a row per Event in the server\'s order', async () => {
    const section = await mountSection()

    expect(section.get('h2').text()).toBe('Events')
    expect(rows(section).map(row => row.get('b').text())).toEqual(['Freitags-Zocken', 'Sommerturnier', 'Altes Event', 'Ohne Host-Namen'])
  })

  it('shows the Host, the Phase, the two counts and the creation day on a row', async () => {
    const section = await mountSection()
    const text = rowOf(section, 'Freitags-Zocken').text()

    expect(text).toContain('Host: Kitty')
    expect(text).toContain('Läuft')
    expect(text).toContain('9 Mitglieder')
    expect(text).toContain('1 Session')
    expect(text).not.toContain('1 Sessions')
    expect(text).toContain('angelegt Do 12.03.2026')
    expect(rowOf(section, 'Sommerturnier').text()).toContain('1 Mitglied')
    expect(rowOf(section, 'Sommerturnier').text()).not.toContain('1 Mitglieder')
    expect(rowOf(section, 'Sommerturnier').text()).toContain('3 Sessions')
  })

  it('names a Host without a Display name „Noch nicht eingerichtet“', async () => {
    const section = await mountSection()

    expect(rowOf(section, 'Ohne Host-Namen').text()).toContain('Host: Noch nicht eingerichtet')
  })

  it('shows the Finish of a finished Event, and no „Gelöscht“ on any Event that is not deleted', async () => {
    const section = await mountSection()

    expect(rowOf(section, 'Sommerturnier').text()).toContain('Beendet')
    expect(rowOf(section, 'Sommerturnier').text()).toContain('beendet Fr 20.02.2026')
    expect(rowOf(section, 'Freitags-Zocken').text()).not.toContain('beendet')
    for (const name of ['Freitags-Zocken', 'Sommerturnier', 'Ohne Host-Namen']) expect(rowOf(section, name).text(), name).not.toContain('Gelöscht')
  })

  it('marks a Deleted Event „Gelöscht“ with its date', async () => {
    const section = await mountSection()

    expect(rowOf(section, 'Altes Event').text()).toContain('Gelöscht am Di 20.01.2026')
    expect(rows(section).filter(row => row.text().includes('Gelöscht'))).toHaveLength(1)
  })

  it('links a row to its Event only where the entry has an address, and every other row is plain text', async () => {
    const section = await mountSection()

    const link = rowOf(section, 'Freitags-Zocken').get('a')
    expect(link.attributes('href')).toBe('/e/freitags-zocken-k7q2')
    expect(link.text()).toContain('Freitags-Zocken')
    expect(section.findAll('a')).toHaveLength(1)
    for (const name of ['Sommerturnier', 'Altes Event', 'Ohne Host-Namen']) expect(rowOf(section, name).find('a').exists(), name).toBe(false)
  })

  it('offers no chip, no paging and no action on a row', async () => {
    const section = await mountSection()

    expect(section.findAll('button')).toHaveLength(0)
    expect(section.findAll('[role="switch"]')).toHaveLength(0)
  })

  it('searches over the name: a part of it, case and outer spaces ignored', async () => {
    const section = await mountSection()

    await section.get('input[type="search"]').setValue('  TURNIER ')

    expect(rows(section).map(row => row.get('b').text())).toEqual(['Sommerturnier'])
    expect(section.get('input[type="search"]').attributes('aria-label')).toBe('Event suchen')
  })

  it('shows the app\'s empty state, with the term, when the search finds nothing, and the list again when it is cleared', async () => {
    const section = await mountSection()

    await section.get('input[type="search"]').setValue('Xyz')

    expect(rows(section)).toHaveLength(0)
    expect(section.text()).toContain('Kein Event gefunden zu „Xyz“.')
    expect(section.text()).toContain('Probier einen anderen Namen.')
    await section.get('input[type="search"]').setValue('')
    expect(rows(section)).toHaveLength(4)
  })

  it('shows the empty state with its own words when there is no Event at all', async () => {
    const section = await mountSection([])

    expect(rows(section)).toHaveLength(0)
    expect(section.text()).toContain('Noch kein Event angelegt.')
    expect(section.text()).not.toContain('gefunden zu')
  })
})

describe('the Admin page', () => {
  beforeEach(async () => {
    signInAs({ ...kitty, canHost: true, isAdmin: true })
    await clearNuxtData('admin')
    document.body.innerHTML = ''
  })

  it('places „Events“ below „Nutzer“', async () => {
    view = { users: [{ id: 'u-1', displayName: 'Sanne', image: null, hasOwnImage: false, providers: ['discord'], firstSignInAt: '2026-01-10T10:00:00.000Z', canHost: true, isAdmin: true, openEvents: 0 }], deletedUsers: 0, events: [linked] }

    const page = await mountSuspended(AdminPage, { route: '/admin', attachTo: document.body })
    await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))

    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Nutzer', 'Events'])
    expect(page.get('ul[aria-label="Events"]').text()).toContain('Freitags-Zocken')
  })
})
