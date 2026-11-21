import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '~~/shared/settings'
import type { EndView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { clickHostAction, hostActionElement, openHostMenu, stubScreen, viewWithSessions } from './event-page'
import { ENDED, FIRST, mount, SECOND, SESSION, STARTED, team, unmountPage } from './event-page-states'

// The early Finish on the Event page (#953, spec #961 § Host dock): „Vorzeitig abschließen“ waits in the Host's Mehr while the finish rule
// passes before the Game count; the dock's primary stays the next game. It opens a sheet like „Event löschen“'s that names the Rounds not
// played, and its one second hold sends the regular finish with the sole leader. The Event is served by hand so the test sees what is posted.

let testNumber = 0

/** Party 1 („Die Füchse“) leads alone and can no longer be caught: 4 of 6 played unless the test says otherwise. */
const decided = (fields: Partial<EndView> = {}): EndView => ({ played: 4, gameCount: 6, complete: false, tie: null, decided: true, finish: { rejection: null }, lastGame: { rejection: 'results_missing' }, ...fields })

const RUNNING = [SESSION(1, FIRST, { startedAt: STARTED }), SESSION(2, SECOND)]
const BETWEEN = [SESSION(1, FIRST, { startedAt: STARTED, endedAt: ENDED }), SESSION(2, SECOND)]

/** The Host's running Event with this end, served with what the finish route was sent; the finish answers and then the read is finished. */
function serveEvent(end: EndView, sessions = RUNNING) {
  testNumber += 1
  const slug = `freitags-early-${testNumber}`
  const build = (phase: string, current: EndView) => viewWithSessions(slug, sessions, 0, {
    event: { isHost: true, phase },
    settings: defaultSettings(),
    teams: [team(1, 'Die Füchse'), team(2)],
    standings: [{ team: 1, rank: 1, points: 8 }, { team: 2, rank: 2, points: 0 }],
    end: current,
    slots: [],
    bestSlotId: null,
    ...(sessions === RUNNING ? { runningSessionId: `session-${slug}-0` } : { runningSessionId: null, start: { sessionId: `session-${slug}-1`, number: 2, rejection: null } }),
  })
  let current = build('running', end)
  const posted: unknown[] = []
  registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => current })
  registerEndpoint(`/api/e/${slug}/finish`, {
    method: 'POST',
    handler: async (event) => {
      posted.push(await readBody(event))
      current = build('finished', { ...end, finish: { rejection: 'wrong_phase' } })
      return { phase: 'finished', winners: [1] }
    },
  })
  return { slug, posted }
}

const sheet = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.textContent?.includes('Vorzeitig abschließen?'))
const holdButton = () => [...(sheet()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => button.textContent?.includes('Event abschließen'))
const menuLabels = (menu: HTMLElement) => [...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())
const pill = (page: Awaited<ReturnType<typeof mount>>) => [...page.element.querySelectorAll('[role="toolbar"][aria-label="Host-Steuerung"] button')].map(button => button.textContent?.trim())

/** Holds the sheet's button with the keyboard for `ms` on fake timers, then releases it (as event-delete.test.ts). */
async function hold(button: HTMLElement, ms = 1000) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  vi.advanceTimersByTime(ms)
  button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  vi.useRealTimers()
  await new Promise(resolve => setTimeout(resolve, 100))
  await flushPromises()
}

describe('Vorzeitig abschließen in Mehr (#953)', () => {
  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
    useState('toasts').value = []
  })

  afterEach(() => {
    unmountPage()
    vi.useRealTimers()
  })

  it.each([
    ['while a Session runs', RUNNING],
    ['between Sessions', BETWEEN],
  ] as const)('lists Vorzeitig abschließen in Mehr %s, right before Event löschen, and keeps the primary', async (_name, sessions) => {
    const { slug } = serveEvent(decided(), sessions)

    const page = await mount(slug)

    expect(pill(page)[0]).not.toContain('Event abschließen')
    // Mehr groups its items (HostDock); „Event löschen“ carries its reason while a Session runs.
    const labels = menuLabels(await openHostMenu(page))
    const early = labels.indexOf('Vorzeitig abschließen')
    expect(early).toBeGreaterThanOrEqual(0)
    expect(labels[early + 1]).toMatch(/^Event löschen/)
  })

  it('lists no Vorzeitig abschließen while a Round waits for its Result, nor once the Game count is reached', async () => {
    const waiting = serveEvent(decided({ finish: { rejection: 'round_waiting' } }))
    expect(menuLabels(await openHostMenu(await mount(waiting.slug)))).not.toContain('Vorzeitig abschließen')

    const complete = serveEvent(decided({ played: 6, complete: true, finish: { rejection: null } }))
    const page = await mount(complete.slug)
    expect(pill(page)[0]).toBe('Event abschließen 1 s halten')
    expect(menuLabels(await openHostMenu(page))).not.toContain('Vorzeitig abschließen')
  })

  it('opens the sheet that names the leader and the games not played, with a one second hold', async () => {
    const { slug, posted } = serveEvent(decided())
    const page = await mount(slug)

    await clickHostAction(page, 'Vorzeitig abschließen')

    expect(sheet()?.textContent).toContain('Die Füchse kann nicht mehr eingeholt werden.')
    expect(sheet()?.textContent).toContain('Die Spiele 5 bis 6 werden nicht mehr gespielt.')
    expect(sheet()?.textContent).toContain('1 Sekunde halten')
    expect(posted).toEqual([])
  })

  it('names the one game not played when one is left', async () => {
    const { slug } = serveEvent(decided({ played: 5 }))
    const page = await mount(slug)

    await clickHostAction(page, 'Vorzeitig abschließen')

    expect(sheet()?.textContent).toContain('Spiel 6 wird nicht mehr gespielt.')
  })

  it('sends nothing on a hold released after half a second, and the finish with the sole leader on a full hold; the page then reads finished', async () => {
    const { slug, posted } = serveEvent(decided())
    const page = await mount(slug)
    await clickHostAction(page, 'Vorzeitig abschließen')

    await hold(holdButton()!, 500)
    expect(posted).toEqual([])

    await hold(holdButton()!)

    expect(posted).toEqual([{ outcome: 'winner', winners: [1] }])
    await vi.waitFor(() => expect(page.get('header').text()).toContain('Beendet'))
    await vi.waitFor(() => expect(sheet()).toBeUndefined())
  })

  it('is a plain Mehr item, not a hold', async () => {
    const { slug } = serveEvent(decided())
    const page = await mount(slug)

    const item = await hostActionElement(page, 'Vorzeitig abschließen')

    expect(item.textContent?.trim()).toBe('Vorzeitig abschließen')
  })
})
