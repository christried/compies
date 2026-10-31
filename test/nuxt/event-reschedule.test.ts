import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { kitty, signInAs } from './auth'
import { clickButton, closeNotice, sanneAndLarsi, serve, view, type EventOverrides } from './event-page'

describe('rescheduling and reopening the Date', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  /** A set Date (Sat 24 Oct, 20:00 Berlin) with no Slots, as the Host or a Member sees it. */
  const setView = (event: EventOverrides['event'] = {}) => (s: string) => view(s, [], {
    event: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z', ...event },
    slots: [],
    bestSlotId: null,
  })

  it('shows every Member the notice with the withdrawn Date while the poll is open again', async () => {
    const member = serve(s => view(s, [], {
      event: { phase: 'poll', previousStartsAt: '2026-10-24T18:00:00.000Z' },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${member.slug}` })

    expect(page.text()).toContain('Der Termin Samstag, 24. Oktober, 20:00 Uhr wurde aufgehoben, bitte aus deinem Kalender löschen')
  })

  it('shows every Member the notice of a Session the Host removed with its Date (#65)', async () => {
    const member = serve(s => view(s, [], {
      event: { phase: 'date_set', startsAt: '2026-10-23T18:00:00.000Z' },
      slots: [],
      bestSlotId: null,
      removedSessions: [{ id: 'removed', previousStartsAt: '2026-10-24T18:00:00.000Z' }],
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${member.slug}` })

    expect(page.text()).toContain('Der Termin Samstag, 24. Oktober, 20:00 Uhr wurde aufgehoben, bitte aus deinem Kalender löschen')
  })

  it('shows no notice when no Date was withdrawn', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).not.toContain('wurde aufgehoben')
  })

  it('tells the Host to suggest the first Slots when a reopened Event has none, and shows no matrix', async () => {
    const { slug } = serve(s => view(s, [], {
      event: { isHost: true, phase: 'poll' },
      slots: [],
      bestSlotId: null,
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Schlag die ersten Termine über „Termine bearbeiten“ vor, dann kann abgestimmt werden.')
    expect(page.text()).not.toContain('Wer kann wann?')
  })

  it('tells a Member to wait for the Host when there are no Slots', async () => {
    const { slug } = serve(s => view(s, [], { slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Sobald der Host Termine vorschlägt, kannst du abstimmen.')
  })

  it('offers Neue Terminsuche as a secondary hold next to Verschieben to the Host only', async () => {
    const hostPage = await mountSuspended(EventPage, { route: `/e/${serve(setView({ isHost: true })).slug}` })
    expect(hostPage.text()).toContain('Neue Terminsuche')
    expect(hostPage.text()).toContain('Verschieben')

    const memberPage = await mountSuspended(EventPage, { route: `/e/${serve(setView()).slug}` })
    expect(memberPage.text()).not.toContain('Neue Terminsuche')
  })

  it('opens the reschedule dialog from Verschieben with the current Date, and sends the new time', async () => {
    let sent: unknown = null
    const store = serve(setView({ isHost: true }))
    registerEndpoint(`/api/e/${store.slug}/sessions/session-${store.slug}/reschedule`, {
      method: 'POST',
      handler: async (event) => {
        sent = await readBody(event)
        return { startsAt: '2026-10-24T18:00:00.000Z' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await clickButton(page.element, 'Verschieben')
    // Matched by title: a confirm dialog from an earlier test can still sit in the body.
    const rescheduleDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(element => element.textContent?.includes('Termin verschieben?'))
    expect(rescheduleDialog).toBeDefined()
    await clickButton(rescheduleDialog, 'Termin verschieben')

    await vi.waitFor(() => expect(sent).toEqual({ startsAt: '2026-10-24T20:00' }))
  })

  it('withdraws the Date after a one second hold on Neue Terminsuche, and every Member then sees the notice', async () => {
    let reopened = 0
    const store = serve(setView({ isHost: true }))
    registerEndpoint(`/api/e/${store.slug}/sessions/session-${store.slug}/reopen`, {
      method: 'POST',
      handler: () => {
        reopened += 1
        store.set(view(store.slug, [], {
          event: { isHost: true, phase: 'poll', startsAt: null, previousStartsAt: '2026-10-24T18:00:00.000Z' },
          slots: [],
          bestSlotId: null,
        }))
        return { phase: 'poll' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const hold = page.findAll('button').find(button => button.text().startsWith('Neue Terminsuche'))!

    await hold.trigger('pointerdown')
    await new Promise(resolve => setTimeout(resolve, 1100))

    await vi.waitFor(() => expect(reopened).toBe(1))
    await vi.waitFor(() => expect(page.text()).toContain('wurde aufgehoben, bitte aus deinem Kalender löschen'))
  })

  it('keeps a closed Reopen notice closed after a remount, and shows it again for a different withdrawn Date', async () => {
    const member = serve(s => view(s, [], {
      event: { phase: 'poll', previousStartsAt: '2026-10-24T18:00:00.000Z' },
    }))
    const first = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
    expect(first.text()).toContain('wurde aufgehoben')

    await closeNotice(first, 'wurde aufgehoben')
    expect(first.text()).not.toContain('wurde aufgehoben')

    // A reload starts with an empty Nuxt data cache, so the page fetches again.
    clearNuxtData()
    const remounted = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
    expect(remounted.text()).toContain('Freitags-Zocken')
    await vi.waitFor(() => expect(remounted.text()).not.toContain('wurde aufgehoben'))

    member.set(view(member.slug, [], {
      event: { phase: 'poll', previousStartsAt: '2026-10-25T18:00:00.000Z' },
    }))
    clearNuxtData()
    const later = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
    await vi.waitFor(() => expect(later.text()).toContain('25. Oktober, 19:00 Uhr wurde aufgehoben'))
  })
})
