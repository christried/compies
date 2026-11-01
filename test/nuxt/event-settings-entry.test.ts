import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, type Mounted, openHostMenu, sanneAndLarsi, serve, view, viewWithSessions } from './event-page'

// The ways into the settings editor from the Event page (#147): the „Event einrichten“ notice for the Host of an
// Event that was never set up, and „Einstellungen“ in the Host controls.

const NOTICE_TEXT = 'Für dieses Event fehlt noch, wie gespielt wird. Leg Format, Spiele und Punkte fest, dann öffnet die Teamwahl.'

const notice = (page: Awaited<ReturnType<typeof mountSuspended>>) => page.findAll('[role="status"]').find((element: { text: () => string }) => element.text().includes(NOTICE_TEXT))

describe('the „Event einrichten“ notice', () => {
  beforeEach(() => {
    signInAs(kitty)
  })

  it('shows the Host of an Event without settings what is missing, with a link to the editor', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, settings: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const banner = notice(page)!
    expect(banner.text()).toContain('Event einrichten')
    expect(banner.text()).toContain('Nur du siehst das')
    expect(banner.get('a').attributes('href')).toBe(`/e/${slug}/einstellungen`)
    expect(banner.get('a').text()).toBe('Jetzt einrichten')
  })

  it('stays away for a Member, who cannot set the Event up', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { settings: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(notice(page)).toBeUndefined()
  })

  it('stays away once the Event is set up', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, settings: defaultSettings() }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(notice(page)).toBeUndefined()
  })

  it('stays away after the Event is finished, when nothing can change any more', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true, phase: 'finished' }, settings: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(notice(page)).toBeUndefined()
  })

  it('can be closed with its ✕', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, settings: null }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await notice(page)!.get('button[aria-label="Schließen"]').trigger('click')

    expect(notice(page)).toBeUndefined()
  })
})

describe('Einstellungen in the Host controls', () => {
  beforeEach(() => {
    signInAs(kitty)
  })

  const toolbarLabels = (page: Awaited<ReturnType<typeof mountSuspended>>) => page.get('[role="toolbar"]').findAll('button').map((button: { text: () => string }) => button.text())

  // Opens „Mehr“ and returns what it lists, the pill's actions included.
  async function menuLabels(page: Mounted) {
    return [...(await openHostMenu(page)).querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())
  }

  it('is listed in Mehr of the poll Phase, after Termine bearbeiten', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, settings: defaultSettings() }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(toolbarLabels(page)).toEqual(['Termin festlegen', 'Einladen', 'Mehr'])
    expect(await menuLabels(page)).toEqual(['Termin festlegen', 'Termine bearbeiten', 'Einladen', 'Einstellungen'])
  })

  it('is listed in Mehr once the Date is set, next to Session starten and Einladen', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, {
      event: { isHost: true, phase: 'date_set', startsAt: '2090-10-24T18:00:00.000Z' },
      settings: defaultSettings(),
      start: { sessionId: 'x', number: null, rejection: null },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(toolbarLabels(page)).toEqual(['Session starten', 'Einladen', 'Mehr'])
    expect(await menuLabels(page)).toEqual(['Session starten', 'Einstellungen', 'Einladen'])
  })

  it('is listed in Mehr while the Event is running, and gone when it is finished', async () => {
    const running = serve(s => viewWithSessions(s, [{ number: null, startsAt: '2090-10-24T18:00:00.000Z', startedAt: '2090-10-24T18:30:00.000Z' }], 0, {
      event: { isHost: true, phase: 'running' },
      settings: defaultSettings(),
      runningSessionId: `session-${s}-0`,
    }))
    const runningPage = await mountSuspended(EventPage, { route: `/e/${running.slug}` })
    // Host pick (the default): Nächstes Spiel setzen is the primary (#228), Session beenden the hold beside it.
    expect(toolbarLabels(runningPage)).toEqual(['Nächstes Spiel setzen', 'Session beenden 1 s halten', 'Einladen', 'Mehr'])
    expect(await menuLabels(runningPage)).toEqual(['Nächstes Spiel setzen', 'Münzwurf', 'Countdown', 'Einladen', 'Einstellungen'])

    const finished = serve(s => view(s, sanneAndLarsi, { event: { isHost: true, phase: 'finished' }, settings: defaultSettings() }))
    const finishedPage = await mountSuspended(EventPage, { route: `/e/${finished.slug}` })
    expect(finishedPage.find('[role="toolbar"]').exists()).toBe(false)
  })

  it('is called „Event einrichten“ while the Event has no settings', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true, phase: 'date_set', startsAt: '2090-10-24T18:00:00.000Z' }, settings: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(toolbarLabels(page)).toEqual(['Event einrichten', 'Einladen', 'Mehr'])
  })

  it('opens the editor', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, settings: defaultSettings() }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(await openHostMenu(page), 'Einstellungen')

    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe(`/e/${slug}/einstellungen`))
  })

  it('is not offered to a Member', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { settings: defaultSettings() }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.find('[role="toolbar"]').exists()).toBe(false)
  })
})
