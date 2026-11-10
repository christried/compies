import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
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

  it('offers Rad drehen first in the Lucky Wheel, then Session 1 beenden, with Nächstes Spiel setzen in Mehr (#228, #229)', async () => {
    const { slug } = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED }, { number: 2, startsAt: SECOND }], {
      event: { isHost: true, phase: 'running' },
      settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 3 },
      bonusVetoes: { granted: [0, 0], rejection: null },
      running: 0,
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Rad drehen', 'Session 1 beenden 1 s halten', 'Einladen', 'Mehr'])
    const menu = await openHostMenu(page)
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Rad drehen', 'Nächstes Spiel setzen', 'Bonus-Veto geben', 'Münzwurf', 'Countdown', 'Einladen', 'Einstellungen', 'Event löschen Geht erst, wenn keine Session läuft.'])
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

    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toEqual(['Nächstes Spiel setzen', 'Münzwurf', 'Countdown', 'Einladen', 'Einstellungen', 'Event löschen Geht erst, wenn keine Session läuft.'])
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
    expect(dialog()?.textContent).toContain('Mit dem Start werden Teams und Teamnamen gesperrt. Die Tribüne bleibt offen, nachziehen kannst du weiterhin.')
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

// Finishing the Event (#277): once the Rounds with a Result reach the Game count and first place is not shared, „Event abschließen“ is the
// dock's primary, a hold like „Session beenden“; a Tie has its own dock (#278, below).
describe('finishing the Event', () => {
  const complete = { played: 3, gameCount: 3, complete: true, tie: null, finish: { rejection: null }, lastGame: null }
  const sole = [{ team: 1, rank: 1, points: 3 }, { team: 2, rank: 2, points: 1 }]
  const level = [{ team: 1, rank: 1, points: 2 }, { team: 2, rank: 1, points: 2 }]
  const RUNNING_ONE = [{ number: null, startsAt: FIRST, startedAt: STARTED }]
  const ENDED_ONE = [{ number: null, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }]
  const NO_DATED = { sessionId: null, number: null, rejection: 'no_dated_session' as const }

  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Holds the button for the full second and lets the request go out. */
  async function hold(button: { trigger: (event: string) => Promise<unknown> }) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await button.trigger('pointerdown')
    vi.advanceTimersByTime(1000)
    vi.useRealTimers()
    await flushPromises()
  }

  it('makes Event abschließen the primary with Session beenden next to it while a Session runs, and Einladen', async () => {
    const { slug } = serve(s => hostView(s, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, end: complete }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Event abschließen 1 s halten', 'Session beenden 1 s halten', 'Einladen', 'Mehr'])
  })

  it('makes it the primary after the last Session ended, where the dock had none', async () => {
    const { slug } = serve(s => hostView(s, ENDED_ONE, { event: { isHost: true, phase: 'running' }, start: NO_DATED, end: complete }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)[0]).toBe('Event abschließen 1 s halten')
  })

  it('keeps the old primary while Results are missing, and offers no Event abschließen in a Tie', async () => {
    const missing = serve(s => hostView(s, ENDED_ONE, { event: { isHost: true, phase: 'running' }, start: NO_DATED, end: { ...complete, played: 2, complete: false, finish: { rejection: 'results_missing' } } }))
    expect(pill(await mountSuspended(EventPage, { route: `/e/${missing.slug}` }))).not.toContain('Event abschließen')

    const tie = serve(s => hostView(s, ENDED_ONE, { event: { isHost: true, phase: 'running' }, start: NO_DATED, end: { ...complete, tie: [1, 2] } }))
    expect(pill(await mountSuspended(EventPage, { route: `/e/${tie.slug}` }))).not.toContain('Event abschließen 1 s halten')
  })

  it('sends the outcome the Host held, not what the Standings call for when the hold ends: a Tie that came in meanwhile is refused', async () => {
    const posted: unknown[] = []
    const store = serve(s => hostView(s, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, standings: sole, end: complete }))
    registerEndpoint(`/api/e/${store.slug}/finish`, { method: 'POST', handler: async (event) => {
      posted.push(await readBody(event))
      throw createError({ statusCode: 409, statusMessage: 'standings_changed' })
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const button = page.findAll('[role="toolbar"] button').find(item => item.text().startsWith('Event abschließen'))!

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await button.trigger('pointerdown')
    // A Correction in the second of the hold makes the Standings a Tie; the page reads it.
    store.set(hostView(store.slug, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, standings: level, end: { ...complete, tie: [1, 2] } }))
    await refreshNuxtData()
    vi.advanceTimersByTime(1000)
    vi.useRealTimers()
    await flushPromises()

    await vi.waitFor(() => expect(posted).toEqual([{ outcome: 'winner', winners: [1] }]))
    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toEqual(['Die Tabelle hat sich geändert. Schau sie dir nochmal an.']))
  })

  it('posts the outcome „winner“ with the Party on Place 1 after the hold and reads the Event again: the page then reads finished', async () => {
    const posted: unknown[] = []
    const store = serve(s => hostView(s, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, standings: sole, end: complete }))
    registerEndpoint(`/api/e/${store.slug}/finish`, { method: 'POST', handler: async (event) => {
      posted.push(await readBody(event))
      store.set(hostView(store.slug, ENDED_ONE, { event: { isHost: true, phase: 'finished' }, end: complete }))
      return { phase: 'finished' }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const button = page.findAll('[role="toolbar"] button').find(item => item.text().startsWith('Event abschließen'))!

    await button.trigger('click')
    expect(posted).toEqual([])

    await hold(button)

    await vi.waitFor(() => expect(posted).toEqual([{ outcome: 'winner', winners: [1] }]))
    await vi.waitFor(() => expect(page.get('header').text()).toContain('Beendet'))
    expect(pill(page)).toEqual(['Siegerehrung starten', 'Einladen', 'Mehr'])
  })

  it('shows the toast of a refusal and reads the Event again: the Tie that came in meanwhile takes the primary away', async () => {
    const store = serve(s => hostView(s, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, end: complete }))
    registerEndpoint(`/api/e/${store.slug}/finish`, { method: 'POST', handler: () => {
      store.set(hostView(store.slug, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, end: { ...complete, tie: [1, 2] } }))
      throw createError({ statusCode: 409, statusMessage: 'standings_changed' })
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const button = page.findAll('[role="toolbar"] button').find(item => item.text().startsWith('Event abschließen'))!

    await hold(button)

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toEqual(['Die Tabelle hat sich geändert. Schau sie dir nochmal an.']))
    await vi.waitFor(() => expect(pill(page)).not.toContain('Event abschließen 1 s halten'))
  })

  it('takes a finish whose first answer was lost as done: the retry answers wrong_phase, shows no toast, and the page reads finished', async () => {
    // The first press finished the Event; its answer never reached the page, so the hold is sent again.
    const store = serve(s => hostView(s, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, end: complete }))
    registerEndpoint(`/api/e/${store.slug}/finish`, { method: 'POST', handler: () => {
      store.set(hostView(store.slug, ENDED_ONE, { event: { isHost: true, phase: 'finished' }, end: complete }))
      throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const button = page.findAll('[role="toolbar"] button').find(item => item.text().startsWith('Event abschließen'))!

    await hold(button)

    await vi.waitFor(() => expect(page.get('header').text()).toContain('Beendet'))
    expect(pill(page)).toEqual(['Siegerehrung starten', 'Einladen', 'Mehr'])
    expect(shownToasts()).toEqual([])
  })
})

// A Tie (#278): with the Rounds that have a Result at the Game count and more than one Party on rank 1, the Host holds „Unentschieden beenden“ or adds a last game.
describe('a Tie at the end', () => {
  const tied = { played: 2, gameCount: 2, complete: true, tie: [1, 2], finish: { rejection: null }, lastGame: { rejection: null } }
  const RUNNING_ONE = [{ number: null, startsAt: FIRST, startedAt: STARTED }]
  const ENDED_ONE = [{ number: null, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }]
  const NO_DATED = { sessionId: null, number: null, rejection: 'no_dated_session' as const }
  const running = (slug: string, end: NonNullable<Overrides['end']> = tied) => hostView(slug, RUNNING_ONE, { event: { isHost: true, phase: 'running' }, running: 0, standings: [{ team: 1, rank: 1, points: 2 }, { team: 2, rank: 1, points: 2 }], end })
  const teams = [{ position: 1, name: 'Wilde Gurken', frozen: true }, { position: 2, name: null, frozen: false }]
  const button = (page: Awaited<ReturnType<typeof mountSuspended>>, label: string) => page.findAll('[role="toolbar"] button').find((item: { text: () => string }) => item.text().startsWith(label))!

  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function hold(target: { trigger: (event: string) => Promise<unknown> }) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await target.trigger('pointerdown')
    vi.advanceTimersByTime(1000)
    vi.useRealTimers()
    await flushPromises()
  }

  it('holds both holds in the pill while a Session runs, with Einladen behind Mehr', async () => {
    const { slug } = serve(s => running(s))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(pill(page)).toEqual(['Unentschieden beenden 1 s halten', 'Letztes Spiel hinzufügen', 'Session beenden 1 s halten', 'Mehr'])
    const items = [...(await openHostMenu(page)).querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())
    expect(items).toContain('Einladen')
    expect(items).toContain('Einstellungen')
    expect(items).not.toContain('Unentschieden beenden')
    expect(items).not.toContain('Session beenden')
    expect(items).not.toContain('Letztes Spiel hinzufügen')
  })

  it('has the pill Unentschieden beenden, Letztes Spiel hinzufügen and Einladen between Sessions and after the last one', async () => {
    const between = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }, { number: 2, startsAt: SECOND }], { event: { isHost: true, phase: 'running' }, start: { sessionId: 'x', number: 2, rejection: null }, end: tied }))
    const done = serve(s => hostView(s, ENDED_ONE, { event: { isHost: true, phase: 'running' }, start: NO_DATED, end: tied }))
    const expected = ['Unentschieden beenden 1 s halten', 'Letztes Spiel hinzufügen', 'Einladen', 'Mehr']

    expect(pill(await mountSuspended(EventPage, { route: `/e/${between.slug}` }))).toEqual(expected)
    expect(pill(await mountSuspended(EventPage, { route: `/e/${done.slug}` }))).toEqual(expected)
  })

  it('does not repeat Letztes Spiel hinzufügen in Mehr, between Sessions and after the last one, and lists Einladen and Einstellungen there (#278)', async () => {
    const between = serve(s => hostView(s, [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }, { number: 2, startsAt: SECOND }], { event: { isHost: true, phase: 'running' }, start: { sessionId: 'x', number: 2, rejection: null }, end: tied }))
    const done = serve(s => hostView(s, ENDED_ONE, { event: { isHost: true, phase: 'running' }, start: NO_DATED, end: tied }))

    for (const slug of [between.slug, done.slug]) {
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
      const items = [...(await openHostMenu(page)).querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())
      expect(items).toContain('Einladen')
      expect(items).toContain('Einstellungen')
      expect(items).not.toContain('Letztes Spiel hinzufügen')
      page.unmount()
    }
  })

  it('posts the outcome „tie“ with every Party of the Tie after the hold and reads the Event again: the page then reads finished, Unentschieden', async () => {
    const posted: unknown[] = []
    const store = serve(s => running(s))
    registerEndpoint(`/api/e/${store.slug}/finish`, { method: 'POST', handler: async (event) => {
      posted.push(await readBody(event))
      store.set(hostView(store.slug, ENDED_ONE, {
        event: { isHost: true, phase: 'finished' },
        teams,
        standings: [{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 1, points: 1 }],
        end: { ...tied, finish: { rejection: 'wrong_phase' }, lastGame: { rejection: 'wrong_phase' } },
      }))
      return { phase: 'finished', winners: [1, 2] }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await button(page, 'Unentschieden beenden').trigger('click')
    expect(posted).toEqual([])
    await hold(button(page, 'Unentschieden beenden'))

    await vi.waitFor(() => expect(posted).toEqual([{ outcome: 'tie', winners: [1, 2] }]))
    await vi.waitFor(() => expect(page.get('header').text()).toContain('Beendet'))
    expect(page.get('h1').text()).toBe('Unentschieden')
    expect(pill(page)).toEqual(['Siegerehrung starten', 'Einladen', 'Mehr'])
  })

  it('posts the last game without a body and reads the Event again: the dock then offers the next game', async () => {
    const posts: unknown[] = []
    const store = serve(s => running(s))
    registerEndpoint(`/api/e/${store.slug}/last-game`, { method: 'POST', handler: async (event) => {
      posts.push(await readBody(event))
      store.set(running(store.slug, { played: 2, gameCount: 3, complete: false, tie: null, finish: { rejection: 'results_missing' }, lastGame: { rejection: 'results_missing' } }))
      return { gameCount: 3 }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await button(page, 'Letztes Spiel hinzufügen').trigger('click')

    await vi.waitFor(() => expect(posts).toEqual([undefined]))
    await vi.waitFor(() => expect(pill(page)).toEqual(['Nächstes Spiel setzen', 'Session beenden 1 s halten', 'Einladen', 'Mehr']))
    expect(shownToasts()).toEqual([])
  })

  it('takes a double press as done: the second answers results_missing and shows no toast', async () => {
    let calls = 0
    const store = serve(s => running(s))
    registerEndpoint(`/api/e/${store.slug}/last-game`, { method: 'POST', handler: () => {
      calls += 1
      if (calls > 1) throw createError({ statusCode: 409, statusMessage: 'results_missing' })
      store.set(running(store.slug, { played: 2, gameCount: 3, complete: false, tie: null, finish: { rejection: 'results_missing' }, lastGame: { rejection: 'results_missing' } }))
      return { gameCount: 3 }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const last = button(page, 'Letztes Spiel hinzufügen')

    await last.trigger('click')
    await last.trigger('click')

    await vi.waitFor(() => expect(calls).toBe(2))
    await flushPromises()
    expect(shownToasts()).toEqual([])
  })

  it('shows the copy of no_tie when the Tie was gone already, and reads the Event again', async () => {
    const store = serve(s => running(s))
    registerEndpoint(`/api/e/${store.slug}/last-game`, { method: 'POST', handler: () => {
      store.set(running(store.slug, { ...tied, tie: null, finish: { rejection: null }, lastGame: { rejection: 'no_tie' } }))
      throw createError({ statusCode: 409, statusMessage: 'no_tie' })
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await button(page, 'Letztes Spiel hinzufügen').trigger('click')

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toEqual(['Gerade steht kein Gleichstand an. Die Seite zeigt den neuen Stand.']))
    await vi.waitFor(() => expect(pill(page)[0]).toBe('Event abschließen 1 s halten'))
  })

  it('shows the last game dashed at the maximum, says why on a click and posts nothing; Unentschieden beenden stays', async () => {
    let calls = 0
    const store = serve(s => running(s, { ...tied, lastGame: { rejection: 'game_count_range' } }))
    registerEndpoint(`/api/e/${store.slug}/last-game`, { method: 'POST', handler: () => {
      calls += 1
      return { gameCount: 31 }
    } })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const last = button(page, 'Letztes Spiel hinzufügen')

    expect(last.attributes('aria-disabled')).toBe('true')
    expect(pill(page)[0]).toBe('Unentschieden beenden 1 s halten')
    await last.trigger('click')
    await flushPromises()

    expect(shownToasts().map(toast => toast.text)).toEqual(['Mehr Spiele gehen nicht. Du kannst das Event noch als Unentschieden beenden.'])
    expect(calls).toBe(0)
  })
})
