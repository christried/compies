import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, sanneAndLarsi, serve, view } from './event-page'

// The ways into the settings editor from the Event page (#147): the „Event einrichten“ notice for the Host of an
// Event that was never set up, and „Einstellungen“ in the Host controls.

const NOTICE_TEXT = 'Lege Format, Punkte, Auswahlmodus und Spiele fest. Ohne Einstellungen kann keine Session starten.'

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
    expect(banner.get('a').text()).toBe('Event einrichten')
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

  it('is the fourth action of the poll Phase, after Einladen', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, settings: defaultSettings() }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(toolbarLabels(page)).toEqual(['Termin festlegen', 'Termine bearbeiten', 'Einladen', 'Einstellungen'])
  })

  it('is there once the Date is set, next to Einladen', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true, phase: 'date_set', startsAt: '2090-10-24T18:00:00.000Z' }, settings: defaultSettings() }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(toolbarLabels(page)).toEqual(['Einstellungen', 'Einladen'])
  })

  it('is there while the Event is running, and gone when it is finished', async () => {
    const running = serve(s => view(s, sanneAndLarsi, { event: { isHost: true, phase: 'running' }, settings: defaultSettings() }))
    const runningPage = await mountSuspended(EventPage, { route: `/e/${running.slug}` })
    expect(toolbarLabels(runningPage)).toEqual(['Einstellungen', 'Einladen'])

    const finished = serve(s => view(s, sanneAndLarsi, { event: { isHost: true, phase: 'finished' }, settings: defaultSettings() }))
    const finishedPage = await mountSuspended(EventPage, { route: `/e/${finished.slug}` })
    expect(finishedPage.find('[role="toolbar"]').exists()).toBe(false)
  })

  it('is called „Event einrichten“ while the Event has no settings', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true, phase: 'date_set', startsAt: '2090-10-24T18:00:00.000Z' }, settings: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(toolbarLabels(page)).toEqual(['Event einrichten', 'Einladen'])
  })

  it('opens the editor', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, settings: defaultSettings() }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.get('[role="toolbar"]').element, 'Einstellungen')

    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe(`/e/${slug}/einstellungen`))
  })

  it('is not offered to a Member', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { settings: defaultSettings() }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.find('[role="toolbar"]').exists()).toBe(false)
  })
})
