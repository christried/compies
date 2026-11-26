import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPage from '~/pages/admin.vue'
import type { AdminUser, AdminView } from '~~/shared/admin'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// The row menu of the Admin page and the removal of a Profile picture (#940, spec #938): „Profilbild entfernen“ shows only for a User with an uploaded
// picture, asks first, and after the removal the row shows the provider's picture with no item, without a reload. Users are invented.
let view: AdminView = { users: [], deletedUsers: 0, events: [] }
let failRemovals = false
const reads = vi.fn()
const removals = vi.fn()

registerEndpoint('/api/admin', { method: 'GET', handler: () => {
  reads()
  return view
} })
for (const id of ['u-kitty', 'u-larsi', 'u-neu', 'u-sanne']) {
  registerEndpoint(`/api/admin/users/${id}/image`, { method: 'DELETE', handler: () => {
    removals(id)
    if (failRemovals) throw createError({ statusCode: 500, statusMessage: 'boom' })
    const after = view.users.find(user => user.id === id)!
    view = { ...view, users: view.users.map(user => user.id === id ? { ...after, image: 'https://example.com/provider.png', hasOwnImage: false } : user) }
    return { image: 'https://example.com/provider.png' }
  } })
}

function person(overrides: Partial<AdminUser> & Pick<AdminUser, 'id'>): AdminUser {
  return {
    displayName: 'Nutzer', image: null, hasOwnImage: false, providers: ['discord'], firstSignInAt: '2026-03-12T10:00:00.000Z',
    canHost: false, isAdmin: false, openEvents: 0, ...overrides,
  }
}

const sanne = person({ id: 'u-sanne', displayName: 'Sanne', providers: ['discord', 'twitch'], firstSignInAt: '2026-01-10T10:00:00.000Z', canHost: true, isAdmin: true, image: 'https://example.com/sanne.png' })
const kittyUser = person({ id: 'u-kitty', displayName: 'Kitty', canHost: true, firstSignInAt: '2026-02-03T10:00:00.000Z' })
const larsi = person({ id: 'u-larsi', displayName: 'Larsi', providers: ['twitch'], firstSignInAt: '2026-03-12T10:00:00.000Z', image: 'https://example.com/larsi.png', hasOwnImage: true })
const neu = person({ id: 'u-neu', displayName: null, image: 'https://example.com/neu.png', firstSignInAt: '2026-04-01T10:00:00.000Z' })

async function mountPage(next: Partial<AdminView> = {}) {
  view = { users: [neu, larsi, kittyUser, sanne], deletedUsers: 0, events: [], ...next }
  const page = await mountSuspended(AdminPage, { route: '/admin', attachTo: document.body })
  await settle(page)
  return page
}

async function settle(page: VueWrapper) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
}

const rows = (page: VueWrapper) => page.findAll('ul[aria-label="Nutzer"] > li')
const rowOf = (page: VueWrapper, text: string) => rows(page).find(row => row.text().includes(text))!
const menuButtonOf = (page: VueWrapper, text: string) => rowOf(page, text).find('button[aria-haspopup="menu"]')
const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const dialog = () => document.querySelector('[role="dialog"]')
const buttonOf = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent?.trim() === label)!

/** Opens the row's menu and presses its „Profilbild entfernen“ entry. */
async function pickRemoval(page: VueWrapper, text: string) {
  await menuButtonOf(page, text).trigger('click')
  await vi.waitFor(() => expect(menuItems().length).toBeGreaterThan(0))
  const item = menuItems().find(entry => entry.textContent?.trim() === 'Profilbild entfernen')!
  item.click()
}

describe('the Admin page\'s Profile picture removal', () => {
  beforeEach(async () => {
    signInAs({ ...kitty, canHost: true, isAdmin: true })
    useState('toasts').value = []
    await clearNuxtData('admin')
    document.body.innerHTML = ''
    failRemovals = false
    reads.mockClear()
    removals.mockClear()
  })

  it('shows the row menu only on a row whose User has an uploaded picture', async () => {
    const page = await mountPage()

    expect(menuButtonOf(page, 'Larsi').exists()).toBe(true)
    expect(menuButtonOf(page, 'Kitty').exists()).toBe(false)
    expect(menuButtonOf(page, 'Noch nicht eingerichtet').exists()).toBe(false)
    expect(menuButtonOf(page, 'Sanne').exists()).toBe(false)
  })

  it('offers „Profilbild entfernen“ as the first entry of that menu, and nothing else', async () => {
    const page = await mountPage()

    await menuButtonOf(page, 'Larsi').trigger('click')

    await vi.waitFor(() => expect(menuItems()).toHaveLength(1))
    expect(menuItems()[0]!.textContent?.trim()).toBe('Profilbild entfernen')
  })

  it('asks before the picture goes: the title names the User, and „Abbrechen“ sends nothing and changes nothing', async () => {
    const page = await mountPage()

    await pickRemoval(page, 'Larsi')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Profilbild von Larsi entfernen?')
    expect(removals).not.toHaveBeenCalled()
    buttonOf('Abbrechen').click()
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(removals).not.toHaveBeenCalled()
    expect(reads).toHaveBeenCalledTimes(1)
    expect(menuButtonOf(page, 'Larsi').exists()).toBe(true)
  })

  it('names a User without a Display name with „diesem Konto“ in the title', async () => {
    const page = await mountPage({ users: [person({ id: 'u-neu', displayName: null, image: 'https://example.com/neu.png', hasOwnImage: true })] })

    await pickRemoval(page, 'Noch nicht eingerichtet')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Profilbild von diesem Konto entfernen?')
  })

  it('removes the picture when „Entfernen“ is pressed, and the row then shows the provider\'s picture and no item, without a reload', async () => {
    const page = await mountPage()
    await pickRemoval(page, 'Larsi')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    buttonOf('Entfernen').click()

    await vi.waitFor(() => expect(removals).toHaveBeenCalledWith('u-larsi'))
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(rowOf(page, 'Larsi').find('img').attributes('src')).toBe('https://example.com/provider.png'))
    expect(menuButtonOf(page, 'Larsi').exists()).toBe(false)
    expect(dialog()).toBeNull()
  })

  it('says so in a toast when the removal fails, keeps the picture on the page and closes the dialog', async () => {
    failRemovals = true
    const page = await mountPage()
    await pickRemoval(page, 'Larsi')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    buttonOf('Entfernen').click()

    await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
    expect(shownToasts()[0]).toMatchObject({ tone: 'error', text: 'Konnte nicht speichern. Nochmal versuchen?' })
    expect(dialog()).toBeNull()
    expect(menuButtonOf(page, 'Larsi').exists()).toBe(true)
  })
})
