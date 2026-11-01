import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickButton, clickHostAction, dialog, openHostMenu, serve, shownToasts, viewWithSessions, type Mounted } from './event-page'

// Starting and ending Sessions on the Event page (#164): the Host dock's primary per state, the start's reason when it
// is blocked, the confirmation of the start and the hold that ends a Session.

const FIRST = '2026-10-30T19:00:00.000Z'
const SECOND = '2026-10-31T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'
const ENDED = '2026-10-30T22:00:00.000Z'

const pill = (page: Mounted) => [...page.element.querySelectorAll('[role="toolbar"] button')].map(button => button.textContent?.replace(/\s+/g, ' ').trim())

type Sessions = Parameters<typeof viewWithSessions>[1]

type Overrides = NonNullable<Parameters<typeof viewWithSessions>[3]> & { running?: number }

/** A Host's Event of these Sessions, set up, as the server reads it; `running` is the index of the Running Session, `start` the rule's answer. */
function hostView(slug: string, sessions: Sessions, { running, ...overrides }: Overrides = {}) {
  const missing = sessions.filter(session => session.startsAt === null).length
  return viewWithSessions(slug, sessions, missing, {
    event: { isHost: true, phase: 'date_set' },
    settings: defaultSettings(),
    slots: [],
    bestSlotId: null,
    runningSessionId: running === undefined ? null : `session-${slug}-${running}`,
    ...overrides,
  })
}

describe('the Host dock per state', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  it('offers Event einrichten while the Event is not set up', async () => {
    const { slug } = serve(s => hostView(s, [{ number: null, startsAt: FIRST }], { settings: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Event einrichten', 'Einladen', 'Mehr'])
  })

  it('offers Termin festlegen while no Session is dated', async () => {
    const { slug } = serve(s => hostView(s, [{ number: null, startsAt: null }], { event: { isHost: true, phase: 'poll' }, start: { sessionId: null, number: null, rejection: 'no_dated_session' }, slots: [{ id: 'fri', startsAt: '2090-10-23T18:00:00.000Z', past: false }] }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Termin festlegen', 'Einladen', 'Mehr'])
  })

  it('offers Session 1 starten and, while Session 2 polls, Termin für Session 2', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST }, { number: null, startsAt: null }], {
      event: { isHost: true, phase: 'poll' },
      start: { sessionId: 'x', number: 1, rejection: null },
      slots: [{ id: 'fri', startsAt: '2090-10-23T18:00:00.000Z', past: false }],
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Session 1 starten', 'Termin für Session 2', 'Einladen', 'Mehr'])
  })

  it('says Session starten for the only Session of an Event', async () => {
    const { slug } = serve(s => hostView(s, [{ number: null, startsAt: FIRST }], { start: { sessionId: 'x', number: null, rejection: null } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Session starten', 'Einladen', 'Mehr'])
  })

  it('offers Nächstes Spiel setzen first under Host pick while a Session runs, with Session 1 beenden as a hold beside it (#228)', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED }, { number: 2, startsAt: SECOND }], {
      event: { isHost: true, phase: 'running' },
      running: 0,
      start: { sessionId: 'x', number: 2, rejection: 'session_running' },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Nächstes Spiel setzen', 'Session 1 beenden 1 s halten', 'Einladen', 'Mehr'])
    expect(page.get('[role="toolbar"]').text()).toContain('1 Sekunde halten')
  })

  it('offers Session 1 beenden as the hold that comes first in the Lucky Wheel, with Nächstes Spiel setzen in Mehr (#228)', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED }, { number: 2, startsAt: SECOND }], {
      event: { isHost: true, phase: 'running' },
      settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 3 },
      running: 0,
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Session 1 beenden 1 s halten', 'Einladen', 'Mehr'])
    const menu = await openHostMenu(page)
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Einladen', 'Nächstes Spiel setzen', 'Einstellungen'])
  })

  it('offers Session 2 starten between Sessions', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }, { number: 2, startsAt: SECOND }], {
      event: { isHost: true, phase: 'running' },
      start: { sessionId: 'x', number: 2, rejection: null },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Session 2 starten', 'Einladen', 'Mehr'])
  })

  it('has no primary after the last Session ended, only Einladen and Mehr', async () => {
    const { slug } = serve(s => hostView(s, [
      { number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED },
      { number: 2, startsAt: SECOND, startedAt: '2026-10-31T19:30:00.000Z', endedAt: '2026-10-31T22:00:00.000Z' },
    ], { event: { isHost: true, phase: 'running' }, start: { sessionId: null, number: null, rejection: 'no_dated_session' } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Einladen', 'Mehr'])
  })

  it('keeps Einstellungen in Mehr in every state', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED }, { number: 2, startsAt: SECOND }], {
      event: { isHost: true, phase: 'running' },
      running: 0,
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const menu = await openHostMenu(page)

    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Nächstes Spiel setzen', 'Einladen', 'Einstellungen'])
  })
})

describe('a start that the rule blocks', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  it('shows the primary disabled with its reason in a bubble linked by aria-describedby', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST }, { number: 2, startsAt: SECOND }], { start: { sessionId: 'x', number: 1, rejection: 'teams_uneven' } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const start = page.findAll('[role="toolbar"] button')[0]!
    expect(start.text()).toBe('Session 1 starten')
    expect(start.attributes('aria-disabled')).toBe('true')
    expect(page.get(`#${start.attributes('aria-describedby')}`).text()).toBe('Geht erst, wenn alle Teams gleich groß sind.')
  })

  it.each([
    ['teams_empty', 'Geht erst, wenn in jedem Team jemand ist.'],
    ['no_dated_session', 'Geht erst, wenn eine Session einen Termin hat.'],
    ['session_running', 'Es läuft schon eine Session.'],
    ['not_set_up', 'Geht erst, wenn das Event eingerichtet ist.'],
  ] as const)('says %s in words', async (rejection, text) => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST }, { number: 2, startsAt: SECOND }], { start: { sessionId: 'x', number: 1, rejection } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const start = page.findAll('[role="toolbar"] button')[0]!
    expect(page.get(`#${start.attributes('aria-describedby')}`).text()).toBe(text)
  })

  it('answers a click with the reason as a toast and opens no dialog', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST }, { number: 2, startsAt: SECOND }], { start: { sessionId: 'x', number: 1, rejection: 'teams_empty' } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickHostAction(page, 'Session 1 starten')

    expect(shownToasts().map(toast => toast.text)).toEqual(['Geht erst, wenn in jedem Team jemand ist.'])
    expect(dialog()).toBeNull()
  })

  it('shows the reason under the button on the phone sheet', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST }, { number: 2, startsAt: SECOND }], { start: { sessionId: 'x', number: 1, rejection: 'teams_uneven' } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await page.get('button[aria-label="Host-Steuerung"][aria-haspopup="dialog"]').trigger('click')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    const start = [...dialog()!.querySelectorAll('button')].find(button => button.textContent?.includes('Session 1 starten'))!
    expect(start.getAttribute('aria-disabled')).toBe('true')
    expect(start.textContent).toContain('Geht erst, wenn alle Teams gleich groß sind.')
  })
})

describe('starting a Session', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  it('asks first, says the teams lock, and posts the start only when confirmed', async () => {
    let started = 0
    const store = serve(s => hostView(s, [{ number: 1, startsAt: FIRST }, { number: 2, startsAt: SECOND }], { start: { sessionId: 'x', number: 1, rejection: null } }))
    registerEndpoint(`/api/e/${store.slug}/sessions/start`, { method: 'POST', handler: () => {
      started += 1
      return { sessionId: 'x', phase: 'running' }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await clickHostAction(page, 'Session 1 starten')

    expect(started).toBe(0)
    expect(dialog()?.textContent).toContain('Los geht’s?')
    expect(dialog()?.textContent).toContain('Mit dem Start werden Teams und Teamnamen gesperrt. Bench und Tribüne bleiben offen, nachziehen kannst du weiterhin.')
    expect(dialog()?.textContent).toContain('2 Teams à 3, Namen werden eingefroren')

    await clickButton(dialog(), 'Session 1 starten')

    await vi.waitFor(() => expect(started).toBe(1))
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('does not post when the dialog is cancelled', async () => {
    let started = 0
    const store = serve(s => hostView(s, [{ number: 1, startsAt: FIRST }], { start: { sessionId: 'x', number: null, rejection: null } }))
    registerEndpoint(`/api/e/${store.slug}/sessions/start`, { method: 'POST', handler: () => {
      started += 1
      return { sessionId: 'x', phase: 'running' }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    await clickHostAction(page, 'Session starten')

    await clickButton(dialog(), 'Abbrechen')

    expect(dialog()).toBeNull()
    expect(started).toBe(0)
  })

  it('keeps the teams as they are for a later start: another text, no lock row', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }, { number: 2, startsAt: SECOND }], {
      event: { isHost: true, phase: 'running' },
      start: { sessionId: 'x', number: 2, rejection: null },
    }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickHostAction(page, 'Session 2 starten')

    expect(dialog()?.textContent).toContain('Die Teams bleiben, wie sie sind.')
    expect(dialog()?.textContent).not.toContain('Namen werden eingefroren')
    expect(dialog()?.textContent).not.toContain('Mit dem Start werden Teams')
  })
})

describe('ending a Session', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('posts the end only after the one second hold', async () => {
    let ended = 0
    const store = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED }, { number: 2, startsAt: SECOND }], {
      event: { isHost: true, phase: 'running' },
      running: 0,
    }))
    registerEndpoint(`/api/e/${store.slug}/sessions/end`, { method: 'POST', handler: () => {
      ended += 1
      return { sessionId: 'session-running', phase: 'running' }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const hold = page.findAll('[role="toolbar"] button').find(button => button.text().startsWith('Session 1 beenden'))!

    await hold.trigger('click')
    expect(ended).toBe(0)

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await hold.trigger('pointerdown')
    vi.advanceTimersByTime(900)
    await flushPromises()
    expect(ended).toBe(0)

    vi.advanceTimersByTime(100)
    vi.useRealTimers()
    await vi.waitFor(() => expect(ended).toBe(1))
  })
})
