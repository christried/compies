import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { CountdownView, EventPools, RoundView } from '~~/shared/event'
import type { PoolGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, clickHostAction, dialog, regionHeadings, serve, shownToasts, viewWithSessions } from './event-page'

// The Countdown on the page (#236, spec #218 § Countdown, 11-event-seite § EventPage): the block under the open Rounds while a
// Session runs, the Host's dock action „Countdown“ under „Mehr“, and the sheet „Countdown stellen“ with its minutes and seconds
// (5 s to 99:59), which is disabled while one runs. The server clock here is the real one: the page is not synced to a room.

const halo: PoolGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], notes: null }
const pools: EventPools = { main: [halo], tiebreaker: [] }
const round = (id: string, startedAt: string): RoundView => ({ id, startedAt, setAt: startedAt, game: halo })

/** The Host's or a Member's read of a running Event, with this Countdown and these open Rounds. */
function serveRunning({ host, countdown = null, rounds = [], startedAt }: { host: boolean, countdown?: CountdownView | null, rounds?: RoundView[], startedAt: string }) {
  return serve(slug => viewWithSessions(slug, [{ number: null, startsAt: startedAt, startedAt }], 0, {
    event: { isHost: host, phase: 'running' },
    settings: defaultSettings(),
    runningSessionId: `session-${slug}-0`,
    pools: host ? pools : null,
    countdown,
    rounds,
    setGame: host ? { rejection: null, left: [] } : null,
  }))
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}` })
  return page
}

/** Types into the sheet's field with this label (the TextField's label is bound to its input). */
function fill(label: string, value: string) {
  const labelElement = [...dialog()!.querySelectorAll('label')].find(element => element.textContent?.trim() === label)!
  const input = dialog()!.querySelector<HTMLInputElement>(`[id="${labelElement.getAttribute('for')}"]`)!
  input.value = value
  input.dispatchEvent(new Event('input'))
}

const sheetButton = () => [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Stellen')!

let posted: unknown[]

beforeEach(() => {
  signInAs(kitty)
  useState('toasts').value = []
  document.body.innerHTML = ''
  posted = []
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

function serveSet(slug: string) {
  registerEndpoint(`/api/e/${slug}/countdown`, { method: 'PUT', handler: async (event) => {
    posted.push(await readBody(event))
    return { durationMs: 90_000, remainingMs: 90_000, startedAt: null }
  } })
}

describe('the Countdown on the stage', () => {
  it('shows its block between the open Rounds and the Game board, while a Session runs', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: false, startedAt: now, rounds: [round('r1', now)], countdown: { durationMs: 600_000, remainingMs: 600_000, startedAt: now } })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).toEqual(['Gerade dran', 'Countdown', 'Spielbrett', 'Sessions', 'So wird gespielt'])
    expect(stage.get('[data-testid="countdown-time"]').text()).toBe('10:00')
  })

  it('has no block while the Event has no Countdown', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: true, startedAt: now })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).not.toContain('Countdown')
  })

  it('shows a Member the same Countdown, without any control', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: false, startedAt: now, countdown: { durationMs: 600_000, remainingMs: 600_000, startedAt: now } })

    const stage = await mount(slug)

    expect(regionHeadings(stage)).toContain('Countdown')
    const block = [...stage.element.querySelectorAll('section')].find(section => section.querySelector('h2')?.textContent?.trim() === 'Countdown')!
    expect(block.querySelectorAll('button')).toHaveLength(0)
  })
})

describe('„Countdown stellen“ from the dock', () => {
  it('sits in „Mehr“ and opens the sheet, with minutes and seconds', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: true, startedAt: now })
    const stage = await mount(slug)

    await clickHostAction(stage, 'Countdown')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('h2')?.textContent).toBe('Countdown stellen')
    const labels = [...dialog()!.querySelectorAll('label')].map(label => label.textContent?.trim())
    expect(labels).toEqual(expect.arrayContaining(['Minuten', 'Sekunden']))
  })

  it('sends the length the Host typed, and closes once the server took it', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: true, startedAt: now })
    serveSet(slug)
    const stage = await mount(slug)
    await clickHostAction(stage, 'Countdown')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    fill('Minuten', '1')
    fill('Sekunden', '30')
    sheetButton().click()

    await vi.waitFor(() => expect(posted).toEqual([{ seconds: 90 }]))
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('says the range and sends nothing for a length below 5 seconds or above 99:59', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: true, startedAt: now })
    serveSet(slug)
    const stage = await mount(slug)
    await clickHostAction(stage, 'Countdown')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    fill('Minuten', '0')
    fill('Sekunden', '4')
    await flushPromises()
    expect(dialog()!.textContent).toContain('Zwischen 5 Sekunden und 99:59.')
    await clickButton(dialog(), 'Stellen')
    fill('Minuten', '100')
    fill('Sekunden', '0')
    await clickButton(dialog(), 'Stellen')

    await flushPromises()
    expect(posted).toEqual([])
    expect(dialog()).not.toBeNull()
  })

  it('is disabled with „Der Countdown läuft schon.“ while one runs', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: true, startedAt: now, countdown: { durationMs: 600_000, remainingMs: 600_000, startedAt: now } })
    const stage = await mount(slug)

    await clickHostAction(stage, 'Countdown')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.textContent).toContain('Der Countdown läuft schon.')
    expect(sheetButton().disabled).toBe(true)
    expect(shownToasts()).toEqual([])
  })

  it('can set one again once the last one stands paused: no block of the old one stays in the way', async () => {
    const now = new Date().toISOString()
    const { slug } = serveRunning({ host: true, startedAt: now, countdown: { durationMs: 600_000, remainingMs: 300_000, startedAt: null } })
    serveSet(slug)
    const stage = await mount(slug)
    await clickHostAction(stage, 'Countdown')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    expect(sheetButton().disabled).toBe(false)
    fill('Minuten', '1')
    fill('Sekunden', '30')
    sheetButton().click()

    await vi.waitFor(() => expect(posted).toEqual([{ seconds: 90 }]))
  })
})
