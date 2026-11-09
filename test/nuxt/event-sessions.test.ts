import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { kitty, signInAs } from './auth'
import { LARSI, SANNE, clickButton, clickHostAction, clickMenuItem, dialog, hostActionElement, menuItem, openHostMenu, openSessionMenu, restoreScreen, serve, shownToasts, stubScreen, view, viewWithSessions } from './event-page'

type Page = VueWrapper
/** The buttons of the page that start with this label (a hold button's text goes on with its „1 s halten“ badge). */
const labelled = (page: Page, label: string) => page.findAll('button').filter(button => button.text().startsWith(label))
/** The row of Session n in the Sessions card. */
const rowOf = (page: Page, n: number) => page.findAll('li').filter(row => row.findAll('b')[0]?.text() === `Session ${n}`)[0]!

describe('several Sessions on the Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  it('shows a numbered row per dated Session with one Mehr menu on each instead of the Host actions, and Einladen only in the Host controls', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Session 1')
    expect(page.text()).toContain('Session 2')
    // The actions of a row sit in its Mehr menu (#349), not on the row.
    expect(page.findAll('button[aria-label^="Mehr:"]').map(button => button.attributes('aria-label'))).toEqual(['Mehr: Session 1', 'Mehr: Session 2'])
    expect(page.findAll('button[aria-label$="in den Kalender"]')).toHaveLength(0)
    // Einladen is in the Host controls only; the Sessions card has none (#147, #166).
    expect(page.findAll('button').filter(button => button.text() === 'Einladen')).toHaveLength(1)
    expect(page.get('[role="toolbar"]').findAll('button').filter(button => button.text() === 'Einladen')).toHaveLength(1)
    for (const label of ['Verschieben', 'Neue Terminsuche', 'Entfernen']) expect(labelled(page, label), label).toHaveLength(0)
    expect(page.text()).not.toContain('Termin festlegen')
  })

  it('reschedules the Session whose card was used, sending its own id', async () => {
    let sentTo = ''
    let sent: unknown = null
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
    registerEndpoint(`/api/e/${slug}/sessions/session-${slug}-1/reschedule`, {
      method: 'POST',
      handler: async (event) => {
        sentTo = 'second'
        sent = await readBody(event)
        return { startsAt: '2026-11-01T19:00:00.000Z' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await clickMenuItem(await openSessionMenu(rowOf(page, 2).element, 2), 'Verschieben')
    const rescheduleDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(element => element.textContent?.includes('Termin verschieben?'))
    await clickButton(rescheduleDialog, 'Termin verschieben')

    await vi.waitFor(() => expect(sentTo).toBe('second'))
    expect(sent).toEqual({ startsAt: '2026-10-31T20:00' })
  })

  it('removes a dated Session after a one second hold on Entfernen, and does not hold a removal that is refused', async () => {
    let removed = 0
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
    registerEndpoint(`/api/e/${slug}/sessions/session-${slug}-0`, {
      method: 'DELETE',
      handler: () => {
        removed += 1
        throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    const menu = await openSessionMenu(rowOf(page, 1).element, 1)
    const holds = () => [menuItem(menu, 'Neue Terminsuche'), menuItem(menu, 'Entfernen')]
    const before = holds()
    const hold = menuItem(menu, 'Entfernen')

    hold.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 1100))

    await vi.waitFor(() => expect(removed).toBe(1))
    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Das geht nicht mehr. Die Seite zeigt den neuen Stand.'))
    // The refused hold goes back to idle by itself and its menu stays open: no hold item is remounted (#74, #349).
    expect(document.body.contains(menu)).toBe(true)
    holds().forEach((element, index) => expect(element, `hold ${index}`).toBe(before[index]))
    hold.dispatchEvent(new Event('pointerup', { bubbles: true }))
    hold.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 1100))
    await vi.waitFor(() => expect(removed).toBe(2))
  })

  it('opens the Session sheet after the cards, with a Date field or the choice to leave the Date to the poll', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: '2026-10-30T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.element, 'Session hinzufügen')
    const sheet = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(element => element.textContent?.includes('Termin eintragen'))
    expect(sheet).toBeDefined()
    expect(sheet!.querySelector('[role="radiogroup"]')).not.toBeNull()
    expect(sheet!.textContent).toContain('Aus der Umfrage')

    // Closed again, so the teleported sheet does not outlive the test.
    sheet!.querySelector<HTMLElement>('button[aria-label="Schließen"]')!.click()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
  })

  it('offers no Entfernen on the card of the last Session', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: '2026-10-30T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    const menu = await openSessionMenu(page.element)

    expect(menu.textContent).toContain('Verschieben')
    expect(menu.textContent).toContain('Neue Terminsuche')
    expect(menu.textContent).not.toContain('Entfernen')
  })

  it('offers no Session change once the Event is finished: no Neue Terminsuche, Entfernen or Session hinzufügen, but Verschieben stays', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'finished', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const menu = await openSessionMenu(page.element, 1)
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Session 1 in den Kalender', 'Verschieben'])
    expect(page.text()).not.toContain('Neue Terminsuche')
    expect(page.text()).not.toContain('Entfernen')
    expect(page.text()).not.toContain('Session hinzufügen')
  })

  it('shows no Session actions to a Member', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: '2026-10-30T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: false }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const menu = await openSessionMenu(page.element)

    // A Member's menu holds the calendar only (#349): nothing they did not have before.
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Session in den Kalender'])
    expect(page.text()).not.toContain('Session hinzufügen')
    expect(page.text()).not.toContain('Entfernen')
    expect(page.text()).not.toContain('Neue Terminsuche')
    expect(page.text()).not.toContain('Verschieben')
  })

  it('removes one undated Session with the − next to the missing Dates, and keeps the last Session', async () => {
    let removed = 0
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 2, { event: { phase: 'poll', isHost: true } }))
    registerEndpoint(`/api/e/${slug}/sessions/session-${slug}-2`, {
      method: 'DELETE',
      handler: () => {
        removed += 1
        return { phase: 'poll' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await page.get('button[aria-label="Session ohne Termin entfernen"]').trigger('click')

    await vi.waitFor(() => expect(removed).toBe(1))
  })

  it('shows no − when the Event has one Session, the last one', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
    ], 1, { event: { phase: 'poll', isHost: true } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.find('button[aria-label="Session ohne Termin entfernen"]').exists()).toBe(false)
  })

  it('says how many Dates are still missing above the poll, and the dock offers Termin festlegen next to Termine bearbeiten', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 3, { event: { phase: 'poll', isHost: true } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('3 Termine gesucht')
    expect(page.text()).not.toContain('1 Termin gesucht')
    expect(page.get('[role="toolbar"]').text()).toContain('Einladen')
    const menu = await openHostMenu(page)
    expect(menu.textContent).toContain('Termin festlegen')
    expect(menu.textContent).toContain('Termine bearbeiten')
  })

  it('sets the Date of the next undated Session from the Slot the Host picks, and says what is still missing afterwards', async () => {
    let sent: unknown = null
    const store = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 2, { event: { phase: 'poll', isHost: true }, bestSlotId: null }))
    registerEndpoint(`/api/e/${store.slug}/confirm`, {
      method: 'POST',
      handler: async (event) => {
        sent = await readBody(event)
        return { startsAt: '2026-10-24T18:00:00.000Z' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    await clickHostAction(page, 'Termin festlegen')

    expect(dialog()?.textContent).toContain('Danach fehlt noch 1 Termin.')
    expect(dialog()?.textContent).toContain('Alle sehen den Termin sofort hier.')
    await clickButton(dialog(), 'Festlegen')

    await vi.waitFor(() => expect(sent).toEqual({ slotId: 'fri' }))
  })

  it('names the Dates still missing afterwards in the plural, and says nothing once the last Date is set', async () => {
    const plural = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 3, { event: { phase: 'poll', isHost: true } }))
    const pluralPage = await mountSuspended(EventPage, { route: `/e/${plural.slug}` })
    await clickHostAction(pluralPage, 'Termin festlegen')
    expect(dialog()?.textContent).toContain('Danach fehlen noch 2 Termine.')
    await clickButton(dialog(), 'Abbrechen')
    pluralPage.unmount()

    const last = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: null, startsAt: null },
    ], 1, { event: { phase: 'poll', isHost: true } }))
    const lastPage = await mountSuspended(EventPage, { route: `/e/${last.slug}` })
    await clickHostAction(lastPage, 'Termin festlegen')
    expect(dialog()?.textContent).not.toContain('Danach')
  })

  it('shows "Termin festlegen" disabled with the reason when no Slot is open, and answers a click with a neutral toast', async () => {
    const { slug } = serve(s => view(s, [], { event: { isHost: true }, slots: [], bestSlotId: null }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    const set = await hostActionElement(page, 'Termin festlegen')

    expect(set.getAttribute('aria-disabled')).toBe('true')
    expect(set.disabled).toBe(false)
    await clickHostAction(page, 'Termin festlegen')

    expect(dialog()).toBeNull()
    expect(shownToasts()).toEqual([expect.objectContaining({ text: 'Schlag erst einen Termin vor.', tone: 'info' })])
  })

  it('shows "Termin festlegen" disabled with the future reason when only past Slots are left', async () => {
    const { slug } = serve(s => view(s, [], {
      event: { isHost: true },
      slots: [{ id: 'old', startsAt: '2026-10-20T18:00:00.000Z', past: true }],
      bestSlotId: null,
    }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const set = await hostActionElement(page, 'Termin festlegen')
    expect(set.getAttribute('aria-disabled')).toBe('true')
    await clickHostAction(page, 'Termin festlegen')

    expect(shownToasts()).toEqual([expect.objectContaining({ text: 'Kein Termin liegt mehr in der Zukunft.', tone: 'info' })])
  })

  it('leaves "Termin festlegen" enabled while a future Slot is open', async () => {
    const { slug } = serve(s => view(s, [], { event: { isHost: true } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const set = await hostActionElement(page, 'Termin festlegen')
    expect(set.getAttribute('aria-disabled')).toBeNull()
  })

  it('numbers the dated card and asks for the one missing Date in the singular', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: null, startsAt: null },
    ], 1, { event: { phase: 'poll' } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Session 1')
    expect(page.text()).toContain('1 Termin gesucht')
    expect(page.text()).not.toContain('Termine gesucht')
  })

  it('shows no number on the card of an Event with one Session, which the server sends without one (#70)', async () => {
    const { slug } = serve(s => viewWithSessions(s, [{ number: null, startsAt: '2026-10-30T19:00:00.000Z' }], 0, { event: { phase: 'date_set' } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).not.toContain('Session 1')
    expect(page.text()).toContain('Freitags-Zocken')
  })

  describe('the rows of the Sessions card (#166)', () => {
    const FIRST = '2026-10-30T19:00:00.000Z'
    const card = (page: Page) => page.findAll('section').find(section => section.findAll('h2').some(heading => heading.text() === 'Sessions'))!
    const rowText = (page: Page, n: number) => rowOf(page, n).text()

    it('counts the Sessions in the title and names each row by its number, with the undated ones numbered after the dated ones', async () => {
      const { slug } = serve(s => viewWithSessions(s, [
        { number: 1, startsAt: FIRST },
        { number: null, startsAt: null },
        { number: null, startsAt: null },
      ], 2, { event: { phase: 'poll' } }))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      expect(card(page).get('h2 + span').text()).toBe('3 Sessions')
      expect(card(page).findAll('ol > li').map(row => row.findAll('b')[0]!.text())).toEqual(['Session 1', 'Session 2', 'Session 3'])
      expect(rowText(page, 1)).toContain('Termin steht')
      expect(rowText(page, 1)).toContain('Fr 30.10., 20:00')
      expect(card(page).get('time').attributes('datetime')).toBe(FIRST)
    })

    it('shows a Session that polls with how many voted and sends the Host to the poll, and a Member too', async () => {
      const host = serve(s => viewWithSessions(s, [{ number: 1, startsAt: FIRST }, { number: null, startsAt: null }], 1, { event: { phase: 'poll', isHost: true } }))
      const hostPage = await mountSuspended(EventPage, { route: `/e/${host.slug}`, attachTo: document.body })

      expect(rowText(hostPage, 2)).toContain('Terminumfrage')
      expect(rowText(hostPage, 2)).toContain('2 von 3 haben abgestimmt')
      await clickButton(rowOf(hostPage, 2).element, 'Zur Umfrage')
      expect(document.activeElement?.id).toBe('poll-session-2')
      hostPage.unmount()

      const member = serve(s => viewWithSessions(s, [{ number: 1, startsAt: FIRST }, { number: null, startsAt: null }], 1, { event: { phase: 'poll' } }))
      const memberPage = await mountSuspended(EventPage, { route: `/e/${member.slug}`, attachTo: document.body })

      expect(rowOf(memberPage, 2).findAll('button').map(button => button.text())).toEqual(['Abstimmen'])
      memberPage.unmount()
    })

    it('gives a Session that runs and one that ended no actions, but its time', async () => {
      const { slug } = serve(s => viewWithSessions(s, [
        { number: 1, startsAt: FIRST, startedAt: '2026-10-30T19:34:00.000Z', endedAt: '2026-10-30T22:12:00.000Z' },
        { number: 2, startsAt: '2026-10-31T19:00:00.000Z', startedAt: '2026-10-31T19:30:00.000Z' },
      ], 0, { event: { phase: 'running', isHost: true }, slots: [], bestSlotId: null, runningSessionId: `session-${s}-1` }))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      expect(rowText(page, 1)).toContain('Beendet')
      expect(rowText(page, 1)).toContain('Fr 30.10., 20:34 bis 23:12')
      expect(rowText(page, 2)).toContain('Läuft seit 20:30')
      expect(rowOf(page, 1).findAll('button')).toHaveLength(0)
      expect(rowOf(page, 2).findAll('button')).toHaveLength(0)
      expect(page.findAll('button[aria-label^="Mehr:"]')).toHaveLength(0)
    })

    it('names the only Session just „Session“ and keeps „Session hinzufügen“ as the underlined text button at the end, for the Host only', async () => {
      const host = serve(s => viewWithSessions(s, [{ number: null, startsAt: FIRST }], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
      const hostPage = await mountSuspended(EventPage, { route: `/e/${host.slug}` })

      expect(card(hostPage).get('h2 + span').text()).toBe('1 Session')
      expect(card(hostPage).get('ol li b').text()).toBe('Session')
      const add = card(hostPage).findAll('button').at(-1)!
      expect(add.text()).toBe('Session hinzufügen')
      expect(add.classes()).toContain('underline')
      // Plain underlined text: outline-memphis would draw a box around it.
      expect(add.classes()).not.toContain('outline-memphis')
      hostPage.unmount()

      const member = serve(s => viewWithSessions(s, [{ number: null, startsAt: FIRST }], 0, { event: { phase: 'date_set' }, slots: [], bestSlotId: null }))
      const memberPage = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
      expect(memberPage.text()).not.toContain('Session hinzufügen')
    })
  })

  describe('the Running Session and the ones that ended (#164)', () => {
    const FIRST = '2026-10-30T19:00:00.000Z'
    const SECOND = '2026-10-31T19:00:00.000Z'
    const card = rowOf

    it('shows „Läuft“ and „Läuft seit“ on the Running Session, in Berlin time, and the other card as it was', async () => {
      const { slug } = serve(s => viewWithSessions(s, [
        { number: 1, startsAt: FIRST, startedAt: '2026-10-30T19:34:00.000Z' },
        { number: 2, startsAt: SECOND },
      ], 0, { event: { phase: 'running', isHost: true }, slots: [], bestSlotId: null }))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      expect(card(page, 1).text()).toContain('Läuft seit 20:34')
      expect(card(page, 1).text()).toContain('Läuft')
      expect(card(page, 2).text()).not.toContain('Läuft')
    })

    it('shows „Beendet“ with the start and the end of a Session that ended', async () => {
      const { slug } = serve(s => viewWithSessions(s, [
        { number: 1, startsAt: FIRST, startedAt: '2026-10-30T19:34:00.000Z', endedAt: '2026-10-30T22:12:00.000Z' },
        { number: 2, startsAt: SECOND },
      ], 0, { event: { phase: 'running', isHost: true }, slots: [], bestSlotId: null }))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      expect(card(page, 1).text()).toContain('Beendet')
      expect(card(page, 1).text()).toContain('Fr 30.10., 20:34 bis 23:12')
      expect(card(page, 1).text()).not.toContain('Läuft')
    })

    it('offers the Host no Verschieben, Neue Terminsuche or Entfernen on a started Session, but still on the others', async () => {
      const { slug } = serve(s => viewWithSessions(s, [
        { number: 1, startsAt: FIRST, startedAt: '2026-10-30T19:34:00.000Z' },
        { number: 2, startsAt: SECOND },
      ], 0, { event: { phase: 'running', isHost: true }, slots: [], bestSlotId: null }))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      // The holds go on with their „1 s halten“ badge.
      expect(card(page, 1).findAll('button')).toHaveLength(0)
      const menu = await openSessionMenu(card(page, 2).element, 2)
      expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.replace(/ 1 s halten.*$/, '').trim()))
        .toEqual(['Session 2 in den Kalender', 'Verschieben', 'Neue Terminsuche', 'Entfernen'])
    })
  })
  describe('the Mehr menu of a Session row (#349)', () => {
    const FIRST = '2026-10-30T19:00:00.000Z'
    const SECOND = '2026-10-31T19:00:00.000Z'
    const hostDated = (extra: { event?: object } = {}) => serve(s => viewWithSessions(s, [
      { number: 1, startsAt: FIRST },
      { number: 2, startsAt: SECOND },
    ], 0, { event: { phase: 'date_set', isHost: true, ...extra.event }, slots: [], bestSlotId: null }))
    const triggers = (page: Page) => page.findAll('button[aria-label^="Mehr:"]')
    const items = (menu: HTMLElement) => [...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.replace(/ 1 s halten.*$/, '').trim())
    const openMenus = () => [...document.querySelectorAll('[role="menu"]')].filter(menu => menu.getAttribute('aria-label')?.startsWith('Mehr:'))

    afterEach(() => restoreScreen())

    it('puts the Host actions of a dated Session in one menu per row, with the calendar first and Entfernen last', async () => {
      const { slug } = hostDated()
      const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })

      for (const n of [1, 2]) {
        const row = rowOf(page, n)
        expect(row.findAll('button')).toHaveLength(1)
        expect(row.get('button').attributes('aria-haspopup')).toBe('menu')
        expect(row.get('button').attributes('aria-expanded')).toBe('false')
      }
      const menu = await openSessionMenu(rowOf(page, 2).element, 2)

      expect(rowOf(page, 2).get('button').attributes('aria-expanded')).toBe('true')
      expect(menu.getAttribute('role')).toBe('menu')
      expect(items(menu)).toEqual(['Session 2 in den Kalender', 'Verschieben', 'Neue Terminsuche', 'Entfernen'])
      page.unmount()
    })

    it('gives a Session that polls, runs or ended no menu, to the Host and a Member alike', async () => {
      const host = serve(s => viewWithSessions(s, [{ number: 1, startsAt: FIRST }, { number: null, startsAt: null }], 1, { event: { phase: 'poll', isHost: true } }))
      const hostPage = await mountSuspended(EventPage, { route: `/e/${host.slug}` })
      expect(rowOf(hostPage, 2).findAll('button').map(button => button.text())).toEqual(['Zur Umfrage'])
      expect(triggers(hostPage).map(button => button.attributes('aria-label'))).toEqual(['Mehr: Session 1'])
      hostPage.unmount()

      const member = serve(s => viewWithSessions(s, [{ number: 1, startsAt: FIRST }, { number: null, startsAt: null }], 1, { event: { phase: 'poll' } }))
      const memberPage = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
      expect(rowOf(memberPage, 2).findAll('button').map(button => button.text())).toEqual(['Abstimmen'])
      expect(triggers(memberPage).map(button => button.attributes('aria-label'))).toEqual(['Mehr: Session 1'])
      memberPage.unmount()

      const running = serve(s => viewWithSessions(s, [
        { number: 1, startsAt: FIRST, startedAt: '2026-10-30T19:34:00.000Z', endedAt: '2026-10-30T22:12:00.000Z' },
        { number: 2, startsAt: SECOND, startedAt: '2026-10-31T19:30:00.000Z' },
      ], 0, { event: { phase: 'running', isHost: true }, slots: [], bestSlotId: null }))
      const runningPage = await mountSuspended(EventPage, { route: `/e/${running.slug}` })
      expect(triggers(runningPage)).toHaveLength(0)
    })

    it('takes a dated Session to the calendar sheet from its menu entry', async () => {
      const { slug } = hostDated()
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      await clickMenuItem(await openSessionMenu(rowOf(page, 1).element, 1), 'Session 1 in den Kalender')

      expect(openMenus()).toHaveLength(0)
      expect(dialog()?.textContent).toContain('In welchen Kalender?')
    })

    it('opens the reschedule dialog only after the menu closed, and sends the Session of the row', async () => {
      let sentTo = ''
      const { slug } = hostDated()
      registerEndpoint(`/api/e/${slug}/sessions/session-${slug}-0/reschedule`, {
        method: 'POST',
        handler: () => {
          sentTo = 'first'
          return { startsAt: '2026-10-30T20:00:00.000Z' }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      await clickMenuItem(await openSessionMenu(rowOf(page, 1).element, 1), 'Verschieben')

      expect(openMenus()).toHaveLength(0)
      const rescheduleDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(element => element.textContent?.includes('Termin verschieben?'))
      await clickButton(rescheduleDialog, 'Termin verschieben')
      await vi.waitFor(() => expect(sentTo).toBe('first'))
    })

    it('starts a new Date search after a one second hold on Neue Terminsuche, and closes the menu when the row turns into a poll', async () => {
      let reopened = 0
      const store = hostDated()
      registerEndpoint(`/api/e/${store.slug}/sessions/session-${store.slug}-1/reopen`, {
        method: 'POST',
        handler: () => {
          reopened += 1
          store.set(viewWithSessions(store.slug, [{ number: 1, startsAt: FIRST }, { number: null, startsAt: null }], 1, { event: { phase: 'poll', isHost: true } }))
          return { phase: 'poll' }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })
      const menu = await openSessionMenu(rowOf(page, 2).element, 2)

      menuItem(menu, 'Neue Terminsuche').dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 1100))

      await vi.waitFor(() => expect(reopened).toBe(1))
      // The trigger unmounts with the row: closing must not need it.
      await vi.waitFor(() => expect(openMenus()).toHaveLength(0))
      expect(rowOf(page, 2).text()).toContain('Terminumfrage')
      page.unmount()
    })

    it('removes the Session of the row after a one second hold on Entfernen and closes the menu', async () => {
      let removed = 0
      const store = hostDated()
      registerEndpoint(`/api/e/${store.slug}/sessions/session-${store.slug}-1`, {
        method: 'DELETE',
        handler: () => {
          removed += 1
          return { phase: 'date_set' }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
      const menu = await openSessionMenu(rowOf(page, 2).element, 2)

      menuItem(menu, 'Entfernen').dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 1100))

      await vi.waitFor(() => expect(removed).toBe(1))
      await vi.waitFor(() => expect(openMenus()).toHaveLength(0))
    })

    it('puts the focus on the first entry, moves it with the arrow keys around the ends, and gives it back to the trigger on Escape', async () => {
      const { slug } = hostDated()
      const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
      const trigger = rowOf(page, 1).get('button')
      const menu = await openSessionMenu(rowOf(page, 1).element, 1)
      await vi.waitFor(() => expect(document.activeElement?.textContent).toContain('Session 1 in den Kalender'))
      const key = (name: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

      key('ArrowUp')
      expect(document.activeElement?.textContent).toContain('Entfernen')
      key('ArrowDown')
      expect(document.activeElement?.textContent).toContain('Session 1 in den Kalender')
      key('ArrowDown')
      expect(document.activeElement?.textContent).toContain('Verschieben')

      key('Escape')
      await vi.waitFor(() => expect(openMenus()).toHaveLength(0))
      expect(document.body.contains(menu)).toBe(false)
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger.element)
      page.unmount()
    })

    it('opens as a popover from 980 px and as a bottom sheet below', async () => {
      stubScreen(true)
      const wide = hostDated()
      const widePage = await mountSuspended(EventPage, { route: `/e/${wide.slug}` })
      const popover = await openSessionMenu(rowOf(widePage, 2).element, 2)
      expect(popover.closest('[role="dialog"]')).toBeNull()
      expect(popover.parentElement?.textContent).toContain('Mehr: Session 2')
      widePage.unmount()
      document.body.innerHTML = ''

      stubScreen(false)
      const narrow = hostDated()
      const narrowPage = await mountSuspended(EventPage, { route: `/e/${narrow.slug}` })
      const sheet = await openSessionMenu(rowOf(narrowPage, 2).element, 2)
      expect(sheet.closest('[role="dialog"]')).not.toBeNull()
      expect(sheet.closest('[role="dialog"]')?.querySelector('h2')?.textContent).toBe('Mehr: Session 2')
    })

    it('titles the menu of the only Session just „Mehr: Session“', async () => {
      const { slug } = serve(s => viewWithSessions(s, [{ number: null, startsAt: FIRST }], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      const menu = await openSessionMenu(page.element)

      expect(menu.getAttribute('aria-label')).toBe('Mehr: Session')
    })

    it('keeps the menu open for the same row when the Event is read again', async () => {
      const store = hostDated()
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })
      const menu = await openSessionMenu(rowOf(page, 2).element, 2)

      store.set(viewWithSessions(store.slug, [{ number: 1, startsAt: FIRST }, { number: 2, startsAt: SECOND }], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null, progress: { voted: 3, total: 3 } }))
      await refreshNuxtData()

      expect(document.body.contains(menu)).toBe(true)
      expect(rowOf(page, 2).get('button').attributes('aria-expanded')).toBe('true')
      page.unmount()
    })
  })

  describe('the Anmerkungen of a dated Session (#349)', () => {
    const FIRST = '2026-10-30T19:00:00.000Z'
    const withNotes = (notes: { userId: string, value: 'yes' | 'maybe' | 'no', note: string }[]) => serve(s => viewWithSessions(s, [
      { number: 1, startsAt: FIRST, notes },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set' }, slots: [], bestSlotId: null }))

    it('is collapsed by default with the count in its heading, and opens and closes with the button', async () => {
      const { slug } = withNotes([{ userId: LARSI, value: 'maybe', note: 'komme später' }, { userId: SANNE, value: 'yes', note: 'bringe Chips mit' }])
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
      const toggle = () => rowOf(page, 1).findAll('button').find(button => button.text().startsWith('Anmerkungen (2)'))!

      expect(toggle().attributes('aria-expanded')).toBe('false')
      expect(toggle().attributes('aria-controls')).toBeUndefined()
      expect(rowOf(page, 1).text()).not.toContain('komme später')
      expect(rowOf(page, 1).text()).not.toContain('bringe Chips mit')

      await toggle().trigger('click')

      expect(toggle().attributes('aria-expanded')).toBe('true')
      expect(page.find(`[id="${toggle().attributes('aria-controls')}"]`).exists()).toBe(true)
      expect(rowOf(page, 1).text()).toContain('komme später')
      expect(rowOf(page, 1).text()).toContain('bringe Chips mit')
      // The button is the heading: the list does not repeat it.
      expect(rowOf(page, 1).findAll('b').map(heading => heading.text()).filter(text => text.startsWith('Anmerkungen'))).toEqual([])

      await toggle().trigger('click')

      expect(toggle().attributes('aria-expanded')).toBe('false')
      expect(rowOf(page, 1).text()).not.toContain('komme später')
    })

    it('says Anmerkung (1) for one Note, and shows no disclosure for a row without a Note', async () => {
      const { slug } = withNotes([{ userId: LARSI, value: 'maybe', note: 'komme später' }])
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      expect(rowOf(page, 1).findAll('button').some(button => button.text().startsWith('Anmerkung (1)'))).toBe(true)
      expect(rowOf(page, 2).findAll('button').some(button => button.text().startsWith('Anmerkung'))).toBe(false)
    })
  })
})
