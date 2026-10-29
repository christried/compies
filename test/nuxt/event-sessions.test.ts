import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { kitty, signInAs } from './auth'
import { clickButton, clickHostAction, dialog, hostActionElement, openHostMenu, serve, shownToasts, view, viewWithSessions } from './event-page'

describe('several Sessions on the Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  it('shows a numbered card per dated Session with the Host actions on each, and one In den Kalender and one Einladen for the whole Event', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Session 1')
    expect(page.text()).toContain('Session 2')
    expect(page.findAll('button').filter(button => button.text() === 'In den Kalender')).toHaveLength(1)
    // One for the whole Event on the cards, one in the Host controls (#147).
    expect(page.findAll('button').filter(button => button.text() === 'Einladen')).toHaveLength(2)
    expect(page.get('[role="toolbar"]').findAll('button').filter(button => button.text() === 'Einladen')).toHaveLength(1)
    expect(page.findAll('button').filter(button => button.text() === 'Verschieben')).toHaveLength(2)
    expect(page.findAll('button').filter(button => button.text() === 'Neue Terminsuche')).toHaveLength(2)
    expect(page.findAll('button').filter(button => button.text() === 'Entfernen')).toHaveLength(2)
    expect(page.text()).not.toContain('Termin festlegen')
    // Every button on the cards is 48 px (h-12), the Reopen and removal holds too (#55).
    const cardButtons = page.findAll('button').filter(button => ['Verschieben', 'Neue Terminsuche', 'Entfernen'].includes(button.text()))
    expect(cardButtons).toHaveLength(6)
    expect(cardButtons.every(button => button.classes().includes('h-12'))).toBe(true)
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
    const second = page.findAll('section').filter(section => section.text().includes('Session 2'))[0]!

    await clickButton(second.element, 'Verschieben')
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
    const holds = () => page.findAll('button').filter(button => ['Neue Terminsuche', 'Entfernen'].includes(button.text())).map(button => button.element)
    const before = holds()
    const hold = page.findAll('button').filter(button => button.text() === 'Entfernen')[0]!

    await hold.trigger('pointerdown')
    await new Promise(resolve => setTimeout(resolve, 1100))

    await vi.waitFor(() => expect(removed).toBe(1))
    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Konnte nicht speichern. Nochmal versuchen?'))
    // The refused hold goes back to idle by itself: no hold button on the page is remounted (#74).
    const after = holds()
    expect(after).toHaveLength(4)
    after.forEach((element, index) => expect(element, `hold ${index}`).toBe(before[index]))
    await hold.trigger('pointerup')
    await hold.trigger('pointerdown')
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

    expect(page.text()).toContain('Verschieben')
    expect(page.text()).toContain('Neue Terminsuche')
    expect(page.text()).not.toContain('Entfernen')
  })

  it('offers no Session change once the Event is finished: no Neue Terminsuche, Entfernen or Session hinzufügen, but Verschieben stays', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'finished', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.findAll('button').filter(button => button.text() === 'Verschieben')).toHaveLength(2)
    expect(page.text()).not.toContain('Neue Terminsuche')
    expect(page.text()).not.toContain('Entfernen')
    expect(page.text()).not.toContain('Session hinzufügen')
  })

  it('shows no Session actions to a Member', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: '2026-10-30T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: false }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).not.toContain('Session hinzufügen')
    expect(page.text()).not.toContain('Entfernen')
    expect(page.text()).not.toContain('Neue Terminsuche')
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

  describe('the Running Session and the ones that ended (#164)', () => {
    const FIRST = '2026-10-30T19:00:00.000Z'
    const SECOND = '2026-10-31T19:00:00.000Z'
    const card = (page: Awaited<ReturnType<typeof mountSuspended>>, n: number) => page.findAll('section').filter((section: { text: () => string }) => section.text().includes(`Session ${n}`))[0]!

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

      const labels = (n: number) => card(page, n).findAll('button').map((button: { text: () => string }) => button.text())
      expect(labels(1)).toEqual([])
      expect(labels(2)).toEqual(['Verschieben', 'Neue Terminsuche', 'Entfernen'])
    })
  })
})
