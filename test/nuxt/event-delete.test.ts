import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickHostAction, hostActionElement, openHostMenu, shownToasts, stubScreen, viewWithSessions, type Mounted } from './event-page'
import { ENDED, FIRST, mount, SECOND, SESSION, STARTED, unmountPage } from './event-page-states'

// „Event löschen“ on the Event page (#333, spec #332): the Host's Mehr item in every Phase, the sheet with its one second hold, the
// redirect to Home with its toast, and the reason while a Session runs. The Event is served by hand so the test can count the reads.

let testNumber = 0

/** An Event the Host sees, served with a counter for its reads and a DELETE that answers `deleteAnswer` (a thrown error or nothing). */
function serveEvent(build: (slug: string) => ReturnType<typeof viewWithSessions>, deleteAnswer?: () => void) {
  testNumber += 1
  const slug = `freitags-delete-${testNumber}`
  const current = build(slug)
  const counts = { reads: 0, deletes: 0 }
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => {
      counts.reads += 1
      return current
    },
  })
  registerEndpoint(`/api/e/${slug}`, {
    method: 'DELETE',
    handler: () => {
      counts.deletes += 1
      deleteAnswer?.()
      return { slug }
    },
  })
  return { slug, counts }
}

/** The Host's Event in a Phase: set up, with the Sessions as the server sends them. */
function hostView(slug: string, sessions: Parameters<typeof viewWithSessions>[1], phase: string, overrides: Parameters<typeof viewWithSessions>[3] = {}) {
  const missing = sessions.filter(session => session.startsAt === null).length
  return viewWithSessions(slug, sessions, missing, {
    event: { isHost: true, phase },
    settings: defaultSettings(),
    slots: [],
    bestSlotId: null,
    runningSessionId: null,
    ...overrides,
  })
}

const POLL = [SESSION(1, null)]
const BETWEEN = [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, SECOND)]
const RUNNING = [SESSION(1, FIRST, { startedAt: STARTED }), SESSION(2, SECOND)]

const sheet = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.textContent?.includes('Event löschen?'))
const holdButton = () => [...(sheet()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => button.textContent?.includes('Event löschen'))
const menuLabels = (menu: HTMLElement) => [...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())

/** Holds the sheet's button with the keyboard for `ms` on fake timers, then releases it. */
async function hold(button: HTMLElement, ms = 1000) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  vi.advanceTimersByTime(ms)
  button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  vi.useRealTimers()
  // The send refetches the Event after the answer; the hold is ready again once that is done (HoldToConfirmButton waits for the action).
  await new Promise(resolve => setTimeout(resolve, 100))
  await flushPromises()
}

describe('Event löschen in Mehr', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    unmountPage()
    vi.useRealTimers()
  })

  it.each([
    ['a poll Event', POLL, 'poll', {}],
    ['a running Event between Sessions', BETWEEN, 'running', { start: { sessionId: 'b', number: 2, rejection: null } }],
    ['a finished Event', BETWEEN, 'finished', {}],
  ] as const)('lists Event löschen in Mehr of %s', async (_name, sessions, phase, overrides) => {
    const { slug } = serveEvent(s => hostView(s, [...sessions], phase, overrides))

    const page = await mount(slug)

    expect(menuLabels(await openHostMenu(page))).toContain('Event löschen')
  })

  it('opens the sheet „Event löschen?“ with its text and a one second hold', async () => {
    const { slug, counts } = serveEvent(s => hostView(s, [...POLL], 'poll'))
    const page = await mount(slug)

    await clickHostAction(page, 'Event löschen')

    expect(sheet()?.textContent).toContain('Das Event verschwindet sofort für alle')
    expect(sheet()?.textContent).toContain('Das lässt sich nicht rückgängig machen.')
    expect(sheet()?.textContent).toContain('1 Sekunde halten')
    expect(counts.deletes).toBe(0)
  })

  it('closes the sheet with Abbrechen and sends nothing, and a hold released after half a second sends nothing', async () => {
    const { slug, counts } = serveEvent(s => hostView(s, [...POLL], 'poll'))
    const page = await mount(slug)
    await clickHostAction(page, 'Event löschen')

    await hold(holdButton()!, 500)
    expect(counts.deletes).toBe(0)
    expect(sheet()).toBeDefined()

    const cancel = [...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Abbrechen')
    cancel!.click()
    await flushPromises()
    expect(sheet()).toBeUndefined()
    expect(counts.deletes).toBe(0)
  })

  it('deletes with one full hold, once, then lands on Home with the toast „Event gelöscht“ and without reading the Event again', async () => {
    const { slug, counts } = serveEvent(s => hostView(s, [...POLL], 'poll'))
    const page = await mount(slug)
    await clickHostAction(page, 'Event löschen')
    const readsBefore = counts.reads

    await hold(holdButton()!)

    expect(counts.deletes).toBe(1)
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe('/'))
    expect(shownToasts()).toContainEqual(expect.objectContaining({ text: 'Event gelöscht', tone: 'success' }))
    expect(counts.reads).toBe(readsBefore)
  })

  it('disables the Mehr item with the reason while a Session runs, and a click toasts the reason and opens no sheet', async () => {
    const { slug, counts } = serveEvent(s => hostView(s, [...RUNNING], 'running', { runningSessionId: `session-${s}-0` }))
    const page = await mount(slug)

    const item = await hostActionElement(page, 'Event löschen')
    expect(item.getAttribute('aria-disabled')).toBe('true')
    expect(item.textContent).toContain('Geht erst, wenn keine Session läuft.')

    await clickHostAction(page, 'Event löschen')

    expect(shownToasts()).toContainEqual(expect.objectContaining({ text: 'Geht erst, wenn keine Session läuft.', tone: 'info' }))
    expect(sheet()).toBeUndefined()
    expect(counts.deletes).toBe(0)
  })

  it('keeps the sheet open when the server refuses with session_running, toasts the reason, and sends again on a second hold', async () => {
    const { slug, counts } = serveEvent(s => hostView(s, [...BETWEEN], 'running'), () => {
      throw createError({ statusCode: 409, statusMessage: 'session_running' })
    })
    const page = await mount(slug)
    await clickHostAction(page, 'Event löschen')

    await hold(holdButton()!)

    expect(shownToasts()).toContainEqual(expect.objectContaining({ text: 'Geht erst, wenn keine Session läuft.', tone: 'error' }))
    expect(sheet()).toBeDefined()
    expect(useRouter().currentRoute.value.path).toBe(`/e/${slug}`)

    await hold(holdButton()!)
    expect(counts.deletes).toBe(2)
  })

  it('lists Event löschen in the phone\'s Mehr and opens the sheet from there', async () => {
    stubScreen(false)
    const { slug, counts } = serveEvent(s => hostView(s, [...POLL], 'poll'))
    const page: Mounted = await mount(slug)

    const menu = await openHostMenu(page)
    expect(menuLabels(menu)).toContain('Event löschen')
    ;[...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent?.trim() === 'Event löschen')!.click()
    await flushPromises()

    expect(sheet()).toBeDefined()
    expect(counts.deletes).toBe(0)
  })
})
