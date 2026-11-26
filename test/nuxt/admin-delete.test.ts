import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPage from '~/pages/admin.vue'
import type { AdminUser, AdminUserDeletion, AdminView } from '~~/shared/admin'
import { kitty, signInAs } from './auth'

// „Konto löschen“ for another User on the Admin page (#941, spec #938): the row menu's item (absent on every Platform admin's row), the sheet that names what goes with
// the counts of the server's dry run, the one-second hold that runs the deletion, and what the list does after it: the row leaves and the count of Deleted Users goes up
// without a reload. A refusal keeps the sheet open with a notice and the hold idle. Users are invented; the endpoints are served by hand so the test can count calls.

const NONE: AdminUserDeletion = { hostedEvents: 0, games: 0, membershipsEnding: 0, membershipsStaying: 0, imageObjects: 0 }

let view: AdminView = { users: [], deletedUsers: 0, events: [] }
let countsAnswer: () => AdminUserDeletion | Promise<AdminUserDeletion> = () => NONE
let failDeletion: 'none' | 'server' | 'held' = 'none'
const reads = vi.fn()
const countReads = vi.fn()
const deletions = vi.fn()

registerEndpoint('/api/admin', { method: 'GET', handler: () => {
  reads()
  return view
} })
for (const id of ['u-kitty', 'u-larsi', 'u-neu', 'u-sanne']) {
  registerEndpoint(`/api/admin/users/${id}/deletion`, { method: 'GET', handler: () => {
    countReads(id)
    return countsAnswer()
  } })
  registerEndpoint(`/api/admin/users/${id}`, { method: 'DELETE', handler: () => {
    deletions(id)
    if (failDeletion === 'server') throw createError({ statusCode: 500, statusMessage: 'boom' })
    if (failDeletion === 'held') throw createError({ statusCode: 409, statusMessage: 'account_games_held' })
    view = { ...view, users: view.users.filter(user => user.id !== id), deletedUsers: view.deletedUsers + 1 }
    return { deleted: true }
  } })
}

function person(overrides: Partial<AdminUser> & Pick<AdminUser, 'id'>): AdminUser {
  return {
    displayName: 'Nutzer', image: null, hasOwnImage: false, providers: ['discord'], firstSignInAt: '2026-03-12T10:00:00.000Z',
    canHost: false, isAdmin: false, openEvents: 0, ...overrides,
  }
}

const sanne = person({ id: 'u-sanne', displayName: 'Sanne', providers: ['discord', 'twitch'], firstSignInAt: '2026-01-10T10:00:00.000Z', canHost: true, isAdmin: true, image: 'https://example.com/sanne.png', hasOwnImage: true })
const own = person({ id: 'u-kitty', displayName: 'Kitty', canHost: true, isAdmin: true, firstSignInAt: '2026-02-03T10:00:00.000Z' })
const larsi = person({ id: 'u-larsi', displayName: 'Larsi', providers: ['twitch'], firstSignInAt: '2026-03-12T10:00:00.000Z' })
const neu = person({ id: 'u-neu', displayName: null, firstSignInAt: '2026-04-01T10:00:00.000Z' })

async function mountPage() {
  view = { users: [neu, larsi, own, sanne], deletedUsers: 0, events: [] }
  const page = await mountSuspended(AdminPage, { route: '/admin', attachTo: document.body })
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
  return page
}

const rows = (page: VueWrapper) => page.findAll('ul[aria-label="Nutzer"] > li')
const rowOf = (page: VueWrapper, text: string) => rows(page).find(row => row.text().includes(text))
const menuButtonOf = (page: VueWrapper, text: string) => rowOf(page, text)!.find('button[aria-haspopup="menu"]')
const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]')
const sheetText = () => sheet()?.textContent ?? ''
const holdButton = () => [...(sheet()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => button.textContent?.includes('Konto löschen'))!

/** Holds the button with the keyboard for `ms` on fake timers, then releases it, and lets the answer settle. */
async function hold(button: HTMLElement, ms = 1000) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  vi.advanceTimersByTime(ms)
  button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  vi.useRealTimers()
  await new Promise(resolve => setTimeout(resolve, 100))
  await flushPromises()
}

/** Opens the row's menu and presses „Konto löschen“; the sheet is open when this returns. */
async function pickDeletion(page: VueWrapper, text: string) {
  await menuButtonOf(page, text).trigger('click')
  await vi.waitFor(() => expect(menuItems().length).toBeGreaterThan(0))
  menuItems().find(item => item.textContent?.trim() === 'Konto löschen')!.click()
  await vi.waitFor(() => expect(sheet()).not.toBeNull())
  await flushPromises()
}

describe('the Admin page\'s „Konto löschen“', () => {
  beforeEach(async () => {
    signInAs({ ...kitty, id: 'u-kitty', canHost: true, isAdmin: true })
    useState('toasts').value = []
    await clearNuxtData('admin')
    document.body.innerHTML = ''
    countsAnswer = () => NONE
    failDeletion = 'none'
    reads.mockClear()
    countReads.mockClear()
    deletions.mockClear()
  })

  it('offers „Konto löschen“ on the row of a User who is no Platform admin, as the only entry when there is no uploaded picture', async () => {
    const page = await mountPage()

    await menuButtonOf(page, 'Larsi').trigger('click')

    await vi.waitFor(() => expect(menuItems()).toHaveLength(1))
    expect(menuItems()[0]!.textContent?.trim()).toBe('Konto löschen')
  })

  it('offers no „Konto löschen“ on a Platform admin\'s row, the signed-in admin\'s own included: no menu without a picture, only „Profilbild entfernen“ with one', async () => {
    const page = await mountPage()

    expect(menuButtonOf(page, 'Kitty').exists()).toBe(false)
    await menuButtonOf(page, 'Sanne').trigger('click')
    await vi.waitFor(() => expect(menuItems()).toHaveLength(1))
    expect(menuItems()[0]!.textContent?.trim()).toBe('Profilbild entfernen')
  })

  it('labels the menu button of a User without a Display name „Aktionen für dieses Konto“, and a named one with the name', async () => {
    const page = await mountPage()

    expect(menuButtonOf(page, 'Noch nicht eingerichtet').attributes('aria-label')).toBe('Aktionen für dieses Konto')
    expect(menuButtonOf(page, 'Larsi').attributes('aria-label')).toBe('Aktionen für Larsi')
  })

  it('opens the sheet with the User named in its title and reads the counts once, when it opens', async () => {
    const page = await mountPage()
    expect(countReads).not.toHaveBeenCalled()

    await pickDeletion(page, 'Larsi')

    expect(countReads).toHaveBeenCalledTimes(1)
    expect(countReads).toHaveBeenCalledWith('u-larsi')
    expect(sheet()!.querySelector('h2')!.textContent).toBe('Konto von Larsi löschen?')
    expect(deletions).not.toHaveBeenCalled()
  })

  it('speaks of a User without a Display name as „Dieses Konto“', async () => {
    const page = await mountPage()

    await pickDeletion(page, 'Noch nicht eingerichtet')

    expect(sheet()!.querySelector('h2')!.textContent).toBe('Dieses Konto löschen?')
  })

  it('names what goes in the third person and what stays, with no count line for a User who hosts and belongs to nothing', async () => {
    const page = await mountPage()

    await pickDeletion(page, 'Larsi')

    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())
    const text = sheetText()
    for (const line of [
      'Name, E-Mail-Adresse, Anzeigename und Profilbild des Kontos',
      'Die Verknüpfung mit Discord oder Twitch',
      'Der Text der Nachrichten im Chat',
      'Die Stimmen und Anmerkungen',
      'Das Teamwort',
      'Was bleibt: ein leerer Eintrag „Gelöschtes Konto“ in den Events anderer Hosts.',
      'Das gilt sofort und lässt sich nicht rückgängig machen. Das Konto erfährt davon nichts.',
    ]) expect(text).toContain(line)
    for (const word of ['hostet', 'Spiel', 'Mitgliedschaft', 'Bild wird', 'Bilder werden']) expect(text).not.toContain(word)
    expect(text).not.toContain('Dein')
    expect(sheet()!.querySelectorAll('ul li')).toHaveLength(5)
  })

  it('shows every count the server answered', async () => {
    countsAnswer = () => ({ hostedEvents: 2, games: 5, membershipsEnding: 3, membershipsStaying: 1, imageObjects: 4 })
    const page = await mountPage()

    await pickDeletion(page, 'Larsi')

    await vi.waitFor(() => expect(sheetText()).toContain('Das Konto hostet 2 Events. Sie verschwinden für alle Mitglieder, auch die abgeschlossenen.'))
    for (const line of [
      '5 Spiele der Bibliothek verschwinden mit.',
      '3 Mitgliedschaften in Events anderer Hosts enden.',
      '1 Mitgliedschaft in einem abgeschlossenen Event bleibt als leerer Eintrag.',
      '4 Bilder werden aus dem Speicher gelöscht.',
    ]) expect(sheetText()).toContain(line)
  })

  it('does nothing on a full hold until the counts are known, and says why', async () => {
    let answer!: (counts: AdminUserDeletion) => void
    countsAnswer = () => new Promise<AdminUserDeletion>((resolve) => {
      answer = resolve
    })
    const page = await mountPage()
    await pickDeletion(page, 'Larsi')

    expect(holdButton().getAttribute('aria-disabled')).toBe('true')
    expect(sheetText()).toContain('Einen Moment …')
    await hold(holdButton())
    expect(deletions).not.toHaveBeenCalled()

    answer(NONE)
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())
  })

  it('sends nothing for a hold released after half a second, and nothing for „Abbrechen“', async () => {
    const page = await mountPage()
    await pickDeletion(page, 'Larsi')
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())

    await hold(holdButton(), 500)
    expect(deletions).not.toHaveBeenCalled()
    expect(sheet()).not.toBeNull()

    ;[...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Abbrechen')!.click()
    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(deletions).not.toHaveBeenCalled()
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it('deletes with a full hold: the row leaves the list and the count of Deleted Users goes up, the sheet closes, the admin stays on the page, no reload', async () => {
    const page = await mountPage()
    expect(page.text()).not.toContain('gelöschtes Konto')
    await pickDeletion(page, 'Larsi')
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())

    await hold(holdButton())

    expect(deletions).toHaveBeenCalledTimes(1)
    expect(deletions).toHaveBeenCalledWith('u-larsi')
    await vi.waitFor(() => expect(rowOf(page, 'Larsi')).toBeUndefined())
    await vi.waitFor(() => expect(page.text()).toContain('Dazu kommt 1 gelöschtes Konto.'))
    expect(reads).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(useAuthUser().value).not.toBeNull()
    expect(useRouter().currentRoute.value.path).toBe('/admin')
  })

  it.each([
    ['a failure of the server', 'server' as const],
    ['the refusal account_games_held', 'held' as const],
  ])('keeps the sheet open with its notice after %s, the row in the list, and the hold usable only after a plain failure', async (_name, mode) => {
    failDeletion = mode
    const page = await mountPage()
    await pickDeletion(page, 'Larsi')
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())

    await hold(holdButton())

    expect(sheet()).not.toBeNull()
    expect(sheet()!.querySelector('[role="alert"]')!.textContent).toContain(mode === 'held'
      ? 'Dieses Konto lässt sich nicht löschen: Ein Spiel davon wird in einem Event eines anderen Hosts gebraucht.'
      : 'Das Löschen hat nicht geklappt. Versuch’s nochmal.')
    expect(rowOf(page, 'Larsi')).toBeDefined()
    expect(page.text()).not.toContain('gelöschtes Konto')
    expect(reads).toHaveBeenCalledTimes(1)
    await hold(holdButton())
    expect(deletions).toHaveBeenCalledTimes(mode === 'held' ? 1 : 2)
    expect(holdButton().getAttribute('aria-disabled')).toBe(mode === 'held' ? 'true' : null)
  })

  it('shows the refusal from the read already, with the hold idle: a full hold sends nothing', async () => {
    countsAnswer = () => {
      throw createError({ statusCode: 409, statusMessage: 'account_games_held' })
    }
    const page = await mountPage()

    await pickDeletion(page, 'Larsi')

    await vi.waitFor(() => expect(sheet()!.querySelector('[role="alert"]')?.textContent).toContain('Dieses Konto lässt sich nicht löschen'))
    expect(holdButton().getAttribute('aria-disabled')).toBe('true')
    await hold(holdButton())
    expect(deletions).not.toHaveBeenCalled()
  })

  it('keeps the hold idle after a failed read and shows why', async () => {
    countsAnswer = () => {
      throw createError({ statusCode: 500 })
    }
    const page = await mountPage()

    await pickDeletion(page, 'Larsi')

    await vi.waitFor(() => expect(sheetText()).toContain('Das Nachsehen hat nicht geklappt'))
    await hold(holdButton())
    expect(deletions).not.toHaveBeenCalled()
  })
})
