import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug].vue'
import { kitty, signInAs } from './auth'
import { clickButton, dialog, sanneAndLarsi, serve, shownToasts, view } from './event-page'

describe('setting the Date', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  /** The label of the chosen option in the dialog, without its vote counts. */
  function selectedOption(): string | undefined {
    return dialog()?.querySelector('[role="radio"][aria-checked="true"] b')?.textContent?.trim()
  }

  it('lets the Host pick a Slot card and opens the confirm dialog with that Slot preselected', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.get('[data-slot="fri"]').element, 'Termin festlegen')

    expect(dialog()?.textContent).toContain('Termin festlegen?')
    expect(selectedOption()).toBe('Fr 23.10., 20:00 Uhr')
  })

  it('preselects the Best slot when the Host opens the dialog from the dock', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    expect(selectedOption()).toBe('Sa 24.10., 20:00 Uhr')
  })

  it('preselects the earliest future Slot when nobody has voted yet', async () => {
    const { slug } = serve(s => view(s, [], { event: { isHost: true }, bestSlotId: null }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    expect(selectedOption()).toBe('Fr 23.10., 20:00 Uhr')
  })

  it('confirms the chosen Slot, then shows the Date set card to everyone', async () => {
    let sent: unknown = null
    const store = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    registerEndpoint(`/api/e/${store.slug}/confirm`, {
      method: 'POST',
      handler: async (event) => {
        sent = await readBody(event)
        store.set(view(store.slug, sanneAndLarsi, {
          event: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z', isHost: true },
          bestSlotId: null,
        }))
        return { startsAt: '2026-10-24T18:00:00.000Z' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    await clickButton(dialog(), 'Festlegen')

    await vi.waitFor(() => expect(sent).toEqual({ slotId: 'sat' }))
    await vi.waitFor(() => expect(page.text()).toContain('Samstag, 24. Oktober, 20:00 Uhr'))
    expect(page.findAll('[role="radiogroup"]')).toHaveLength(0)
    expect(dialog()).toBeNull()
  })

  it('shows In den Kalender to every Member, and Verschieben only to the Host', async () => {
    const member = serve(s => view(s, [], {
      event: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z' },
      slots: [],
      bestSlotId: null,
    }))
    const memberPage = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
    // The control is about the Date, so it is labelled as a calendar entry, not as a file download. It opens the
    // calendar sheet (#81, event-calendar.test.ts).
    const calendarButton = memberPage.findAll('button').filter(button => button.text() === 'In den Kalender')
    expect(calendarButton).toHaveLength(1)
    expect(calendarButton[0]!.attributes('aria-haspopup')).toBe('dialog')
    expect(memberPage.text()).not.toContain('Verschieben')

    const hostStore = serve(s => view(s, [], {
      event: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z', isHost: true },
      slots: [],
      bestSlotId: null,
    }))
    const hostPage = await mountSuspended(EventPage, { route: `/e/${hostStore.slug}` })
    expect(hostPage.text()).toContain('Verschieben')
    expect(hostPage.text()).toContain('Einladen')
  })

  it('tells the Host when no Slot lies in the future, and opens no dialog', async () => {
    const { slug } = serve(s => view(s, [], {
      event: { isHost: true },
      slots: [{ id: 'old', startsAt: '2026-10-20T18:00:00.000Z', past: true }],
      bestSlotId: null,
    }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    expect(dialog()).toBeNull()
    expect(shownToasts().map(toast => toast.text)).toContain('Kein Termin liegt mehr in der Zukunft.')
  })

  it('shows the server refusal as a toast and keeps the dialog closed on success only', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    registerEndpoint(`/api/e/${slug}/confirm`, {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 400, statusMessage: 'in_past' })
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    await clickButton(dialog(), 'Festlegen')

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Der Termin liegt in der Vergangenheit.'))
    expect(dialog()).not.toBeNull()
  })

  it('does not call every 400 a past Slot: a time the server cannot read is a failed save', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    registerEndpoint(`/api/e/${slug}/confirm`, {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 400, statusMessage: 'invalid_time' })
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    await clickButton(dialog(), 'Festlegen')

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Konnte nicht speichern. Nochmal versuchen?'))
    expect(shownToasts().map(toast => toast.text)).not.toContain('Der Termin liegt in der Vergangenheit.')
  })
})
