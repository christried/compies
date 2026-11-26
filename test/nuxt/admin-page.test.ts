import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPage from '~/pages/admin.vue'
import type { AdminUser, AdminView } from '~~/shared/admin'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// The Admin page (#682, spec #938): the section „Nutzer“ with the Host switch. One endpoint per path for the file (a second registration on the same path is
// not replaced); each test sets what the read returns and whether a write fails. Users are invented.
let view: AdminView = { users: [], deletedUsers: 0 }
let failWrites = false
const reads = vi.fn()
const writes = vi.fn()

registerEndpoint('/api/admin', { method: 'GET', handler: () => {
  reads()
  return view
} })
for (const id of ['u-kitty', 'u-larsi', 'u-neu', 'u-sanne']) {
  registerEndpoint(`/api/admin/users/${id}/host`, { method: 'PUT', handler: async (event) => {
    writes(id, await readBody(event))
    if (failWrites) throw createError({ statusCode: 500, statusMessage: 'boom' })
    return { canHost: true }
  } })
}

function person(overrides: Partial<AdminUser> & Pick<AdminUser, 'id'>): AdminUser {
  return {
    displayName: 'Nutzer', image: null, hasOwnImage: false, providers: ['discord'], firstSignInAt: '2026-03-12T10:00:00.000Z',
    canHost: false, isAdmin: false, openEvents: 0, ...overrides,
  }
}

const sanne = person({ id: 'u-sanne', displayName: 'Sanne', providers: ['discord', 'twitch'], firstSignInAt: '2026-01-10T10:00:00.000Z', canHost: true, isAdmin: true })
const kittyUser = person({ id: 'u-kitty', displayName: 'Kitty', canHost: true, openEvents: 2, firstSignInAt: '2026-02-03T10:00:00.000Z' })
const larsi = person({ id: 'u-larsi', displayName: 'Larsi', providers: ['twitch'], firstSignInAt: '2026-03-12T10:00:00.000Z' })
const neu = person({ id: 'u-neu', displayName: null, image: 'https://example.com/neu.png', firstSignInAt: '2026-04-01T10:00:00.000Z' })

async function mountPage(next: Partial<AdminView> = {}) {
  view = { users: [neu, larsi, kittyUser, sanne], deletedUsers: 0, ...next }
  const page = await mountSuspended(AdminPage, { route: '/admin', attachTo: document.body })
  await settle(page)
  return page
}

async function settle(page: VueWrapper) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
}

const rows = (page: VueWrapper) => page.findAll('ul[aria-label="Nutzer"] > li')
const rowOf = (page: VueWrapper, text: string) => rows(page).find(row => row.text().includes(text))!
const switchOf = (page: VueWrapper, text: string) => rowOf(page, text).get('[role="switch"]')
const dialog = () => document.querySelector('[role="dialog"]')
const buttonOf = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent?.trim() === label)!

describe('the Admin page', () => {
  beforeEach(async () => {
    signInAs({ ...kitty, canHost: true, isAdmin: true })
    useState('toasts').value = []
    await clearNuxtData('admin')
    document.body.innerHTML = ''
    failWrites = false
    reads.mockClear()
    writes.mockClear()
  })

  it('is titled „Admin“, in the hub shell, with the section „Nutzer“', async () => {
    const page = await mountPage()

    expect(page.get('h1').text()).toBe('Admin')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(true)
    expect(page.get('h2').text()).toBe('Nutzer')
  })

  it('shows anyone but the Platform admin the generic Construction page, and asks the server for nothing (#682, story 2)', async () => {
    for (const viewer of [null, kitty, { ...kitty, canHost: true }]) {
      signInAs(viewer)
      reads.mockClear()

      const page = await mountPage()

      expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
      expect(page.text()).not.toContain('Nutzer')
      expect(reads).not.toHaveBeenCalled()
    }
  })

  it('shows a row per User in the server\'s order, with the Display name, the providers and the month of the first sign-in', async () => {
    const page = await mountPage()

    expect(rows(page).map(row => row.get('b').text())).toEqual(['Noch nicht eingerichtet', 'Larsi', 'Kitty', 'Sanne'])
    expect(rowOf(page, 'Sanne').text()).toContain('Discord, Twitch')
    expect(rowOf(page, 'Sanne').text()).toContain('seit Januar 2026')
    expect(rowOf(page, 'Larsi').text()).toContain('Twitch')
    expect(rowOf(page, 'Larsi').text()).toContain('seit März 2026')
  })

  it('shows a User who has no Display name yet as „Noch nicht eingerichtet“, with their picture, and the switch', async () => {
    const page = await mountPage()
    const row = rowOf(page, 'Noch nicht eingerichtet')

    expect(row.find('img').attributes('src')).toBe('https://example.com/neu.png')
    expect(row.get('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('marks a Platform admin\'s row, and only that', async () => {
    const page = await mountPage()

    expect(rowOf(page, 'Sanne').text()).toContain('Plattform-Admin')
    expect(rows(page).filter(row => row.text().includes('Plattform-Admin'))).toHaveLength(1)
  })

  it('shows the switch „Darf hosten“ on for a Host and off for a User', async () => {
    const page = await mountPage()

    expect(rowOf(page, 'Kitty').text()).toContain('Darf hosten')
    expect(switchOf(page, 'Kitty').attributes('aria-checked')).toBe('true')
    expect(switchOf(page, 'Larsi').attributes('aria-checked')).toBe('false')
  })

  it('names each switch with the User\'s row, so a screen reader hears whose it is', async () => {
    const page = await mountPage()
    const toggle = switchOf(page, 'Larsi')
    const name = toggle.attributes('aria-labelledby')!.split(' ').map(id => document.getElementById(id)?.textContent?.trim()).join(' ')

    expect(name).toBe('Larsi Darf hosten')
  })

  it('locks a Platform admin\'s switch on, with the hint, and sends nothing when it is pressed', async () => {
    const page = await mountPage()
    const toggle = switchOf(page, 'Sanne')

    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(toggle.attributes('aria-disabled')).toBe('true')
    expect(rowOf(page, 'Sanne').text()).toContain('Plattform-Admins hosten immer. Das lässt sich nicht ändern.')
    expect(document.getElementById(toggle.attributes('aria-describedby')!)?.textContent).toContain('hosten immer')
    await toggle.trigger('click')
    await flushAll()
    expect(writes).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('grants the permission with one click, and reads the list again', async () => {
    const page = await mountPage()

    await switchOf(page, 'Larsi').trigger('click')

    await vi.waitFor(() => expect(writes).toHaveBeenCalledWith('u-larsi', { canHost: true }))
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
    expect(dialog()).toBeNull()
  })

  it('asks before taking the permission: the title names the User, the text says what stays, with the number', async () => {
    const page = await mountPage()

    await switchOf(page, 'Kitty').trigger('click')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Kitty das Host-Recht entziehen?')
    expect(dialog()!.textContent).toContain('keine neuen Events mehr erstellen')
    expect(dialog()!.textContent).toContain('sieht die Bibliothek nicht mehr')
    expect(dialog()!.textContent).toContain('2 Events, die noch nicht abgeschlossen sind, bleiben bestehen')
    expect(writes).not.toHaveBeenCalled()
  })

  it('says „1 Event“ in the singular, and names no Events when the User hosts none', async () => {
    const page = await mountPage({ users: [person({ id: 'u-kitty', displayName: 'Kitty', canHost: true, openEvents: 1 }), person({ id: 'u-larsi', displayName: 'Larsi', canHost: true })] })

    await switchOf(page, 'Kitty').trigger('click')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.textContent).toContain('1 Event, das noch nicht abgeschlossen ist, bleibt bestehen')
    buttonOf('Abbrechen').click()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    await switchOf(page, 'Larsi').trigger('click')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.textContent).not.toContain('bleiben bestehen')
    expect(dialog()!.textContent).not.toContain('bleibt bestehen')
  })

  it('names a User without a Display name in the dative in the title', async () => {
    const page = await mountPage({ users: [person({ id: 'u-neu', displayName: null, canHost: true })] })

    await switchOf(page, 'Noch nicht eingerichtet').trigger('click')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Diesem Konto das Host-Recht entziehen?')
  })

  it('changes nothing when „Abbrechen“ is pressed', async () => {
    const page = await mountPage()
    await switchOf(page, 'Kitty').trigger('click')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    buttonOf('Abbrechen').click()

    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(writes).not.toHaveBeenCalled()
    expect(reads).toHaveBeenCalledTimes(1)
    expect(switchOf(page, 'Kitty').attributes('aria-checked')).toBe('true')
  })

  it('takes the permission when „Entziehen“ is pressed, and reads the list again', async () => {
    const page = await mountPage()
    await switchOf(page, 'Kitty').trigger('click')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    buttonOf('Entziehen').click()

    await vi.waitFor(() => expect(writes).toHaveBeenCalledWith('u-kitty', { canHost: false }))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
  })

  it('says so in a toast when a write fails, and closes the dialog', async () => {
    failWrites = true
    const page = await mountPage()

    await switchOf(page, 'Larsi').trigger('click')

    await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
    expect(shownToasts()[0]).toMatchObject({ tone: 'error', text: 'Konnte nicht speichern. Nochmal versuchen?' })
  })

  it('searches over the Display name, ignoring case and outer spaces', async () => {
    const page = await mountPage()

    await page.get('input[type="search"]').setValue('  KIT ')

    expect(rows(page).map(row => row.get('b').text())).toEqual(['Kitty'])
  })

  it('says so in the empty state when the search has no hit, and the list is back when it is cleared', async () => {
    const page = await mountPage()

    await page.get('input[type="search"]').setValue('xyz')

    expect(rows(page)).toHaveLength(0)
    expect(page.text()).toContain('Niemand gefunden zu „xyz“.')
    expect(page.text()).toContain('Probier einen anderen Namen.')
    await page.get('input[type="search"]').setValue('')
    expect(rows(page)).toHaveLength(4)
  })

  it('counts the Deleted Users below the list, when there are some', async () => {
    const none = await mountPage()
    expect(none.text()).not.toContain('gelöscht')
    document.body.innerHTML = ''
    await clearNuxtData('admin')

    const one = await mountPage({ deletedUsers: 1 })
    expect(one.text()).toContain('Dazu kommt 1 gelöschtes Konto.')
    document.body.innerHTML = ''
    await clearNuxtData('admin')

    const two = await mountPage({ deletedUsers: 2 })
    expect(two.text()).toContain('Dazu kommen 2 gelöschte Konten.')
  })

  it('reads again when the Platform admin returns to the tab', async () => {
    await mountPage()
    expect(reads).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
  })
})

async function flushAll() {
  await new Promise(resolve => setTimeout(resolve, 30))
}
