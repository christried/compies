import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '~/pages/profil.vue'
import type { HostedCounts } from '~~/shared/auth'
import { kitty, signInAs } from './auth'

// „Konto löschen“ on the Profil page (#918, spec #907): the section below „Abmelden“, the sheet that names what goes (and, for a Host, how many Events and games), the one
// second hold that runs DELETE /api/me and the leave for the sign-in page. Endpoints are served by hand so the test can count the calls.

type Mounted = Awaited<ReturnType<typeof mountSuspended>>

/** The answers of the three calls the page makes; `hosted` is read when the sheet opens, `del` answers the hold. */
const calls = { hosted: 0, deletes: 0, signOuts: 0 }
let hostedAnswer: () => HostedCounts | Promise<HostedCounts> = () => ({ events: 0, games: 0 })
let deleteAnswer: () => { deleted: true } = () => ({ deleted: true })
let mounted: Mounted | undefined

registerEndpoint('/api/me/hosted', () => {
  calls.hosted += 1
  return hostedAnswer()
})
registerEndpoint('/api/me', { method: 'DELETE', handler: () => {
  calls.deletes += 1
  return deleteAnswer()
} })
registerEndpoint('/api/auth/sign-out', { method: 'POST', handler: () => {
  calls.signOuts += 1
  return { success: true }
} })

const mount = async () => (mounted = await mountSuspended(ProfilePage, { route: '/profil', attachTo: document.body }))
const opener = (page: Mounted) => page.get('section[aria-labelledby="account-delete-title"] button')
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]')
const sheetText = () => sheet()?.textContent ?? ''
const holdButton = () => [...(sheet()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => button.textContent?.includes('Konto löschen'))!

/** Holds the button with the keyboard for `ms` on fake timers, then releases it, and lets the answer and the leave settle. */
async function hold(button: HTMLElement, ms = 1000) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  vi.advanceTimersByTime(ms)
  button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  vi.useRealTimers()
  await new Promise(resolve => setTimeout(resolve, 100))
  await flushPromises()
}

async function openSheet(page: Mounted) {
  await opener(page).trigger('click')
  await vi.waitFor(() => expect(sheet()).not.toBeNull())
  await flushPromises()
}

describe('„Konto löschen“ on the Profil page', () => {
  beforeEach(async () => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
    calls.hosted = 0
    calls.deletes = 0
    calls.signOuts = 0
    hostedAnswer = () => ({ events: 0, games: 0 })
    deleteAnswer = () => ({ deleted: true })
    await navigateTo('/profil')
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    vi.useRealTimers()
  })

  it('shows the section below „Abmelden“ with its heading, its text and its button, and reads nothing on load', async () => {
    const page = await mount()

    const section = page.get('section[aria-labelledby="account-delete-title"]')
    expect(section.get('h2').text()).toBe('Konto löschen')
    expect(section.text()).toContain('Löscht dein Konto sofort und endgültig. Was dabei verschwindet, siehst du vorher.')
    expect(opener(page).text()).toBe('Konto löschen')
    const signOut = page.findAll('button').find(button => button.text() === 'Abmelden')!
    expect(signOut.element.compareDocumentPosition(section.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calls.hosted).toBe(0)
  })

  it('reads the numbers once when the button is clicked and opens the sheet „Konto löschen?“', async () => {
    const page = await mount()

    await openSheet(page)

    expect(calls.hosted).toBe(1)
    expect(sheet()!.querySelector('h2')!.textContent).toBe('Konto löschen?')
  })

  it('names the five things that go and what stays, and says nothing of Events or a library for a User who hosts and owns nothing', async () => {
    const page = await mount()

    await openSheet(page)

    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())
    const text = sheetText()
    for (const line of [
      'Dein Name, deine E-Mail-Adresse, dein Anzeigename und dein Profilbild',
      'Die Verknüpfung mit Discord oder Twitch',
      'Der Text deiner Nachrichten im Chat',
      'Deine Stimmen und Anmerkungen',
      'Dein Teamwort',
      'Was bleibt: ein leerer Eintrag „Gelöschtes Konto“ in den Events anderer Hosts.',
      'Das gilt sofort und lässt sich nicht rückgängig machen.',
    ]) expect(text).toContain(line)
    expect(text).not.toContain('Du hostest')
    expect(text).not.toContain('Bibliothek')
    expect(sheet()!.querySelectorAll('ul li')).toHaveLength(5)
  })

  it.each([
    [1, 'Du hostest ein Event. Es verschwindet für alle Mitglieder, auch wenn es schon abgeschlossen ist.'],
    [2, 'Du hostest 2 Events. Sie verschwinden für alle Mitglieder, auch die abgeschlossenen.'],
    [12, 'Du hostest 12 Events. Sie verschwinden für alle Mitglieder, auch die abgeschlossenen.'],
  ])('says how many Events a Host with %i Event(s) loses', async (events, line) => {
    hostedAnswer = () => ({ events, games: 0 })
    const page = await mount()

    await openSheet(page)

    await vi.waitFor(() => expect(sheetText()).toContain(line))
    expect(sheetText()).not.toContain('Bibliothek')
  })

  it('names the library on its own line for a User with games and no Events', async () => {
    hostedAnswer = () => ({ events: 0, games: 2 })
    const page = await mount()

    await openSheet(page)

    await vi.waitFor(() => expect(sheetText()).toContain('Deine Bibliothek mit allen Spielen verschwindet mit.'))
    expect(sheetText()).not.toContain('Du hostest')
  })

  it('names both the Events and the library for a Host with games', async () => {
    hostedAnswer = () => ({ events: 2, games: 5 })
    const page = await mount()

    await openSheet(page)

    await vi.waitFor(() => expect(sheetText()).toContain('Deine Bibliothek mit allen Spielen verschwindet mit.'))
    expect(sheetText()).toContain('Du hostest 2 Events.')
  })

  it('does nothing on a full hold until the numbers are known, and shows why', async () => {
    let answer!: (counts: HostedCounts) => void
    hostedAnswer = () => new Promise<HostedCounts>((resolve) => {
      answer = resolve
    })
    const page = await mount()
    await openSheet(page)

    expect(holdButton().getAttribute('aria-disabled')).toBe('true')
    expect(sheetText()).toContain('Einen Moment …')
    await hold(holdButton())
    expect(calls.deletes).toBe(0)

    answer({ events: 0, games: 0 })
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())
    expect(sheetText()).not.toContain('Einen Moment …')
  })

  it('does nothing on a full hold after a failed read, shows why, and reads again when the sheet opens again', async () => {
    hostedAnswer = () => {
      throw createError({ statusCode: 500 })
    }
    const page = await mount()
    await openSheet(page)

    await vi.waitFor(() => expect(sheetText()).toContain('Das Nachsehen hat nicht geklappt. Schließ das Fenster und versuch’s nochmal.'))
    await hold(holdButton())
    expect(calls.deletes).toBe(0)

    ;[...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Abbrechen')!.click()
    await vi.waitFor(() => expect(sheet()).toBeNull())
    hostedAnswer = () => ({ events: 3, games: 0 })
    await openSheet(page)

    await vi.waitFor(() => expect(sheetText()).toContain('Du hostest 3 Events.'))
    expect(sheetText()).not.toContain('Das Nachsehen hat nicht geklappt')
  })

  it('never shows the number of the earlier opening while the next read is open', async () => {
    hostedAnswer = () => ({ events: 4, games: 0 })
    const page = await mount()
    await openSheet(page)
    await vi.waitFor(() => expect(sheetText()).toContain('Du hostest 4 Events.'))
    ;[...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Abbrechen')!.click()
    await vi.waitFor(() => expect(sheet()).toBeNull())

    hostedAnswer = () => new Promise<HostedCounts>(() => {})
    await openSheet(page)

    expect(sheetText()).not.toContain('Du hostest')
    expect(holdButton().getAttribute('aria-disabled')).toBe('true')
  })

  it('sends nothing for a hold released after half a second', async () => {
    const page = await mount()
    await openSheet(page)
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())

    await hold(holdButton(), 500)

    expect(calls.deletes).toBe(0)
    expect(sheet()).not.toBeNull()
  })

  it('deletes once with a full hold and leaves for the sign-in page signed out, without a second sign-out and with Home\'s and the Archive\'s lists dropped', async () => {
    const homeEvents = useNuxtData('home-events')
    const archive = useNuxtData('archive')
    homeEvents.data.value = { events: [{ slug: 'eins' }] }
    archive.data.value = { events: [{ slug: 'zwei' }] }
    const page = await mount()
    await openSheet(page)
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())

    await hold(holdButton())

    expect(calls.deletes).toBe(1)
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe('/anmelden'))
    expect(useAuthUser().value).toBeNull()
    expect(homeEvents.data.value).toBeFalsy()
    expect(archive.data.value).toBeFalsy()
    expect(calls.signOuts).toBe(0)
  })

  it.each([
    ['a 409 account_games_held', () => {
      throw createError({ statusCode: 409, statusMessage: 'account_games_held' })
    }],
    ['a 500', () => {
      throw createError({ statusCode: 500 })
    }],
  ])('keeps the sheet open with its notice after %s, with the route and the User unchanged and the hold idle again', async (_name, refuse) => {
    deleteAnswer = refuse
    const page = await mount()
    await openSheet(page)
    await vi.waitFor(() => expect(holdButton().getAttribute('aria-disabled')).toBeNull())

    await hold(holdButton())

    expect(sheet()!.querySelector('[role="alert"]')!.textContent).toContain('Das Löschen hat nicht geklappt. Versuch’s nochmal.')
    expect(useRouter().currentRoute.value.path).toBe('/profil')
    expect(useAuthUser().value).not.toBeNull()
    await hold(holdButton())
    expect(calls.deletes).toBe(2)

    // Opening the sheet again starts clean.
    ;[...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Abbrechen')!.click()
    await vi.waitFor(() => expect(sheet()).toBeNull())
    await openSheet(page)
    expect(sheet()!.querySelector('[role="alert"]')).toBeNull()
  })

  it('closes with Esc and with „Abbrechen“, the focus back on the button, and never starts the deletion', async () => {
    const page = await mount()
    const button = opener(page).element as HTMLButtonElement
    button.focus()
    await openSheet(page)

    sheet()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(document.activeElement).toBe(button)

    await openSheet(page)
    ;[...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === 'Abbrechen')!.click()
    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(document.activeElement).toBe(button)
    expect(calls.deletes).toBe(0)
  })
})
