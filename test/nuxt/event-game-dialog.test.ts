import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RichNotesEditor from '~/components/RichNotesEditor.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { EventNotesChange } from '~~/shared/event'
import type { PoolGame, RoundGame } from '~~/shared/game'
import type { RoundView, SpinView, WheelView } from '~~/shared/stage'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, shownToasts, viewWithSessions } from './event-page'
import { editorOf, ensureGeometry, type } from './helpers/notes-editor'

// The game dialog on the Event page, through the whole page (#443, #444): the Spielepool in „So wird gespielt“, „Zuletzt gezogen“ under the wheel
// and „Läuft aktuell“, with the props threaded through EventStage and StageWheel. A Member's tiles open the same dialog without Tags and Notes (#444).

const STARTED = '2026-10-30T19:30:00.000Z'
const STOP = '2026-10-30T19:45:10.000Z'
const iso = (ms: number) => new Date(ms).toISOString()

const PRICE = { cents: 1999, source: 'steam' as const, checkedAt: '2026-11-03T10:00:00.000Z' }
const base: PoolGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: notesFromLines(['Hausregel: keine Raketen']), price: null, archived: false }
const pong: PoolGame = { ...base, id: 'g-pong', name: 'Pong', notes: null }
const kart: PoolGame = { ...base, id: 'g-kart', name: 'Kart', notes: notesFromLines(['Kart-Notizen']), price: PRICE }
// A game set from the library: it is in no pool.
const schach: PoolGame = { ...base, id: 'g-schach', name: 'Schach', notes: notesFromLines(['Schach-Notizen']) }
const pool = [base, pong, kart]

const roundGame = (game: PoolGame): RoundGame => {
  const { notes: _notes, archived: _archived, ...shown } = game
  return shown
}
const round = (id: string, game: PoolGame, notes?: NotesDoc): RoundView => ({ id, startedAt: STARTED, setAt: STARTED, game: roundGame(game), ...(notes ? { notes } : {}) })

// The Tags and Notes the Host's read carries for every game its tiles show: the pool, the open Rounds and the spin.
const hostGames = {
  'g-halo': { tags: [{ key: 'koop', label: 'Koop-Halo' }], notes: base.notes },
  'g-pong': { tags: [{ key: 'retro', label: 'Retro-Pong' }], notes: null },
  'g-kart': { tags: [{ key: 'rennen', label: 'Rennen-Kart' }], notes: kart.notes },
  'g-schach': { tags: [{ key: 'denken', label: 'Denken-Schach' }], notes: schach.notes },
}

// The Host's Event notes (#732) by game id: a key only for a game that has some, none for Pong.
const eventNotes = {
  'g-halo': notesFromLines(['Event-Halo: nur Bo1'])!,
  'g-kart': notesFromLines(['Event-Kart: Mirror aus'])!,
  'g-schach': notesFromLines(['Event-Schach: mit Uhr'])!,
}

const spin: SpinView = {
  roundId: 'r-spin', drawId: 'd1', spinStartAt: iso(Date.parse(STOP) - 6000), stopAt: STOP, slices: 3, resultIndex: 0, resultOffset: 0.5,
  labels: null, game: roundGame(kart), current: true,
}
const wheel: WheelView = { count: 2, slices: null, spin, vetoes: { left: [], own: null, revealed: null, draw: null } }

// What the Host's PUT of Event notes (#731) did, for the tests of the editing in the dialogs (#464): the bodies it got, and whether it refuses.
const saves = { bodies: [] as { gameId: string, body: EventNotesChange }[], refuse: false }

// `leaked`: a Member's read that carries the Host's Event notes anyway (the server never sends them): the Member's page provides no context, so nothing of them shows (#821).
function serveHost(host: boolean, phase: 'running' | 'finished' = 'running', leaked = false) {
  saves.bodies = []
  saves.refuse = false
  // The Event's notes as the server holds them: a save changes them, and the next read of the Event shows the change.
  const stored: Record<string, NotesDoc> = { ...eventNotes }
  // The games' own notes as the server holds them (#835): a save of `gameNotes` changes them in every place the read shows them.
  const storedGame: Record<string, NotesDoc | null> = {}
  const gameNotesOf = (game: PoolGame): NotesDoc | null => (game.id in storedGame ? storedGame[game.id]! : game.notes)
  const viewOf = (slug: string) => viewWithSessions(slug, [{ number: null, startsAt: '2026-10-30T19:00:00.000Z', startedAt: STARTED }], 0, {
    event: { isHost: host, phase },
    settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 0 },
    runningSessionId: `session-${slug}-0`,
    // A Member sees the pool tiles only with the preview on: the faces here.
    pool: host ? pool.map(game => ({ ...game, notes: gameNotesOf(game) })) : pool.map(({ id, name, imageUrl, youtubeId, price, playersMin, playersMax, suitabilities }) => ({ id, name, imageUrl, youtubeId, price, playersMin, playersMax, suitabilities })),
    // The Round's own Notes are the Host's: the server leaves them out of a Member's read.
    rounds: host ? [round('r1', base, gameNotesOf(base) ?? undefined), round('r2', schach, gameNotesOf(schach) ?? undefined)] : [round('r1', base), round('r2', schach)],
    wheel,
    hostGames: host ? Object.fromEntries(Object.entries(hostGames).map(([id, facts]) => [id, { ...facts, notes: id in storedGame ? storedGame[id]! : facts.notes }])) : null,
    eventNotes: host || leaked ? stored : null,
  })
  const served = serve(viewOf)
  for (const game of [base, pong, kart, schach]) {
    registerEndpoint(`/api/e/${served.slug}/games/${game.id}/notes`, {
      method: 'PUT',
      handler: async (event) => {
        const body = await readBody(event) as EventNotesChange
        saves.bodies.push({ gameId: game.id, body })
        if (saves.refuse) throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
        if (body.notes) stored[game.id] = body.notes
        else if (Object.hasOwn(body, 'notes')) Reflect.deleteProperty(stored, game.id)
        if (Object.hasOwn(body, 'gameNotes')) storedGame[game.id] = body.gameNotes ?? null
        served.set(viewOf(served.slug))
        return { gameId: game.id, ...body }
      },
    })
  }
  return served
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string, ready = 'Zuletzt gezogen') {
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await vi.waitFor(() => expect(sectionOf(ready)).not.toBeNull())
  return page
}

/** The block (a `section`) a heading names, or for „Zuletzt gezogen“ the result card inside the wheel's. */
function sectionOf(heading: string): HTMLElement | null {
  if (heading === 'Zuletzt gezogen') return [...document.querySelectorAll<HTMLElement>('p')].find(p => p.textContent?.trim() === heading)?.parentElement ?? null
  const h2 = [...document.querySelectorAll('h2')].find(item => item.textContent?.trim() === heading)
  return h2?.closest('section') ?? null
}
const tileButton = (heading: string, name: string) => [...sectionOf(heading)!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')].find(button => button.textContent?.trim() === name)
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const EVENT_LABEL = 'Notizen für dieses Event'
/** The Event notes in the open dialog: their label once, then their text, then the Game notes (#732). */
function expectEventNotesAboveGameNotes(eventText: string, gameText: string) {
  const text = dialog()!.textContent!
  expect(text.split(EVENT_LABEL)).toHaveLength(2)
  expect(text.indexOf(EVENT_LABEL)).toBeLessThan(text.indexOf(eventText))
  expect(text.indexOf(eventText)).toBeLessThan(text.indexOf(gameText))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the Host\'s game dialog on the Event page (#443)', () => {
  beforeEach(() => signInAs({ ...kitty, canHost: true }))

  it('opens from the Spielepool with the game\'s Tags and Notes and the link to its library entry', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    tileButton('So wird gespielt', 'Pong')!.click()
    await flushPromises()

    expect(dialog()!.querySelector('h2')?.textContent).toBe('Pong')
    expect(dialog()!.textContent).toContain('Retro-Pong')
    // Pong has no Game notes, and the Host's add button for Event notes is no block of notes (#464).
    expect([...dialog()!.querySelectorAll('h3')].map(h => h.textContent)).toEqual([])
    expect(dialog()!.querySelector('a')?.getAttribute('href')).toBe('/bibliothek/g-pong')
  })

  it('shows the Event notes above the Game notes in the dialog of a Spielepool tile, and none on a tile without a key (#732)', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    tileButton('So wird gespielt', 'Kart')!.click()
    await flushPromises()
    expectEventNotesAboveGameNotes('Event-Kart: Mirror aus', 'Kart-Notizen')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    tileButton('So wird gespielt', 'Pong')!.click()
    await flushPromises()
    expect([...dialog()!.querySelectorAll('h3')].map(h => h.textContent)).not.toContain(EVENT_LABEL)
  })

  it('shows the Event notes above the Game notes in the dialog of „Zuletzt gezogen“ (#732)', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    const button = [...sectionOf('Zuletzt gezogen')!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')][0]!
    button.click()
    await flushPromises()

    expectEventNotesAboveGameNotes('Event-Kart: Mirror aus', 'Kart-Notizen')
  })

  it('shows the Event notes above the Game notes in the dialog of „Läuft aktuell“, for a pool game and one set from the library (#732)', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    tileButton('Läuft aktuell', 'Halo')!.click()
    await flushPromises()
    expectEventNotesAboveGameNotes('Event-Halo: nur Bo1', 'Hausregel: keine Raketen')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    tileButton('Läuft aktuell', 'Schach')!.click()
    await flushPromises()
    expectEventNotesAboveGameNotes('Event-Schach: mit Uhr', 'Schach-Notizen')
  })

  it('opens from „Zuletzt gezogen“ with the drawn game\'s Tags and Notes', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    const button = [...sectionOf('Zuletzt gezogen')!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')][0]!
    expect(button.textContent?.trim()).toBe('Kart')
    button.click()
    await flushPromises()

    expect(dialog()!.querySelector('h2')?.textContent).toBe('Kart')
    expect(dialog()!.textContent).toContain('Rennen-Kart')
    expect(dialog()!.textContent).toContain('Kart-Notizen')
  })

  it('opens from „Läuft aktuell“ for a pool game and for a game set from the library outside the pool, and keeps the Round\'s Notes open under the tile', async () => {
    const { slug } = serveHost(true)
    await mount(slug)
    const rounds = sectionOf('Läuft aktuell')!

    tileButton('Läuft aktuell', 'Halo')!.click()
    await flushPromises()
    expect(dialog()!.querySelector('h2')?.textContent).toBe('Halo')
    expect(dialog()!.textContent).toContain('Koop-Halo')
    expect(dialog()!.textContent).toContain('Hausregel: keine Raketen')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    tileButton('Läuft aktuell', 'Schach')!.click()
    await flushPromises()
    expect(dialog()!.querySelector('h2')?.textContent).toBe('Schach')
    expect(dialog()!.textContent).toContain('Denken-Schach')
    expect(dialog()!.textContent).toContain('Schach-Notizen')
    expect(dialog()!.querySelector('a')?.getAttribute('href')).toBe('/bibliothek/g-schach')
    // The Round's own Notes stay open under its tile, and its buttons stay.
    expect(rounds.textContent).toContain('Hausregel: keine Raketen')
    expect(rounds.textContent).toContain('Ergebnis eintragen')
  })
})

describe('a Member\'s tiles on the Event page open the dialog (#444)', () => {
  beforeEach(() => signInAs(kitty))

  /** What a Member's dialog shows of a game and never shows: the facts, and none of the Tags and Notes the Host's read carries. */
  function expectMemberDialog(name: string) {
    expect(dialog()!.querySelector('h2')?.textContent).toBe(name)
    expect(dialog()!.textContent).toContain('bis 4')
    expect(dialog()!.textContent).not.toContain('2 bis')
    expect(dialog()!.textContent).toContain('Teams')
    for (const hidden of ['Koop-Halo', 'Retro-Pong', 'Rennen-Kart', 'Denken-Schach', 'Hausregel: keine Raketen', 'Kart-Notizen', 'Schach-Notizen', 'Notizen', 'Notizen für dieses Event', 'Event-Halo', 'Event-Kart', 'Event-Schach']) expect(dialog()!.textContent).not.toContain(hidden)
    expect(dialog()!.querySelector('a')).toBeNull()
    expect(dialog()!.querySelector('footer')).toBeNull()
    // The page hands a Member's dialog the same props as the Host's: its own guard shows no entry (#464).
    expect(dialog()!.querySelector('button[aria-label="Notizen für dieses Event bearbeiten"]')).toBeNull()
    expect([...dialog()!.querySelectorAll('button')].map(button => button.textContent?.trim())).not.toContain('Notizen für dieses Event hinzufügen')
    expect(dialog()!.querySelector('[role="textbox"]')).toBeNull()
  }
  async function close() {
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(dialog()).toBeNull())
  }

  it('shows no Event notes anywhere on the page, in no tile dialog and no Round disclosure, even when the read carries them (#821)', async () => {
    const { slug } = serveHost(false, 'running', true)
    await mount(slug)
    const gone = () => {
      for (const text of ['Notizen für dieses Event', 'Event-Halo', 'Event-Kart', 'Event-Schach']) expect(document.body.textContent).not.toContain(text)
    }
    gone()

    for (const [heading, name] of [['So wird gespielt', 'Kart'], ['Läuft aktuell', 'Schach']] as const) {
      tileButton(heading, name)!.click()
      await flushPromises()
      gone()
      await close()
    }
    expect(sectionOf('Läuft aktuell')!.querySelector('button[aria-expanded]')).toBeNull()
  })

  it('opens from the Spielepool with the game\'s players, Suitabilities and Price, and a tap on another tile opens that one', async () => {
    const { slug } = serveHost(false)
    await mount(slug)
    expect(dialog()).toBeNull()

    tileButton('So wird gespielt', 'Kart')!.click()
    await flushPromises()
    expectMemberDialog('Kart')
    expect(dialog()!.textContent).toContain('19,99 €')
    expect(dialog()!.textContent).toContain('Stand')
    await close()

    tileButton('So wird gespielt', 'Pong')!.click()
    await flushPromises()
    expectMemberDialog('Pong')
  })

  it('opens from „Zuletzt gezogen“ with the drawn game\'s facts', async () => {
    const { slug } = serveHost(false)
    await mount(slug)

    const button = [...sectionOf('Zuletzt gezogen')!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')][0]!
    expect(button.textContent?.trim()).toBe('Kart')
    button.click()
    await flushPromises()

    expectMemberDialog('Kart')
    expect(dialog()!.textContent).toContain('19,99 €')
  })

  it('opens from „Läuft aktuell“ for a pool game and for a game set from the library outside the pool, with no Host parts on the Round', async () => {
    const { slug } = serveHost(false)
    await mount(slug)
    const rounds = sectionOf('Läuft aktuell')!

    tileButton('Läuft aktuell', 'Halo')!.click()
    await flushPromises()
    expectMemberDialog('Halo')
    await close()

    tileButton('Läuft aktuell', 'Schach')!.click()
    await flushPromises()
    expectMemberDialog('Schach')
    // The Round's Notes and buttons are the Host's: a Member's read has none of them.
    expect(rounds.textContent).not.toContain('Hausregel: keine Raketen')
    expect(rounds.textContent).not.toContain('Ergebnis eintragen')
    expect(rounds.textContent).not.toContain('Zurücklegen')
  })

  it('has no pool tile for a Member who sees no pool, and the Rounds and the drawn game still open', async () => {
    const { slug } = serve(s => viewWithSessions(s, [{ number: null, startsAt: '2026-10-30T19:00:00.000Z', startedAt: STARTED }], 0, {
      event: { isHost: false, phase: 'running' },
      settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', hiddenWheel: true, poolPreview: false, vetoAllowance: 0 },
      runningSessionId: `session-${s}-0`,
      pool: null,
      rounds: [round('r1', base)],
      wheel,
      hostGames: null,
    }))
    await mount(slug)

    expect(sectionOf('So wird gespielt')!.querySelector('[aria-haspopup]')).toBeNull()
    tileButton('Läuft aktuell', 'Halo')!.click()
    await flushPromises()
    expectMemberDialog('Halo')
  })
})

describe('the Host writes Event notes in the game dialogs of the Event page (#464)', () => {
  const EDIT = 'button[aria-label="Notizen für dieses Event bearbeiten"]'
  const entry = () => dialog()!.querySelector<HTMLButtonElement>(EDIT) ?? [...dialog()!.querySelectorAll('button')].find(button => ['Notizen für dieses Event hinzufügen', 'Notizen hinzufügen'].includes(button.textContent?.trim() ?? '')) ?? null
  const textbox = () => dialog()!.querySelector<HTMLElement>('[role="textbox"]')
  const footerButton = (label: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>('footer button')].find(button => button.textContent?.trim() === label)!
  const zuletzt = () => [...sectionOf('Zuletzt gezogen')!.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')][0]!

  // The three places a tile opens the dialog from: the Spielepool (Pong has no Event notes), „Zuletzt gezogen“ (Kart has) and „Läuft aktuell“ (Schach has).
  const places = [
    { place: 'the Spielepool', game: 'g-pong', open: () => tileButton('So wird gespielt', 'Pong')!, stored: null, typed: 'Heute nur Bo1', saved: ['Heute nur Bo1'], gameText: null },
    { place: '„Zuletzt gezogen“', game: 'g-kart', open: zuletzt, stored: 'Event-Kart: Mirror aus', typed: ' und Uhr', saved: ['Event-Kart: Mirror aus und Uhr'], gameText: 'Kart-Notizen' },
    { place: '„Läuft aktuell“', game: 'g-schach', open: () => tileButton('Läuft aktuell', 'Schach')!, stored: 'Event-Schach: mit Uhr', typed: ' und Pause', saved: ['Event-Schach: mit Uhr und Pause'], gameText: 'Schach-Notizen' },
  ]

  beforeEach(() => {
    ensureGeometry()
    signInAs({ ...kitty, canHost: true })
    useState('toasts').value = []
  })

  it.each(places)('saves an Event note from the dialog of $place through the route, and shows it above the Game notes with the focus on the pencil', async ({ game, open, stored, typed, saved, gameText }) => {
    const { slug } = serveHost(true)
    const mounted = await mount(slug)
    open().click()
    await flushPromises()
    expect(entry()).not.toBeNull()
    // A game with Game notes and no Event notes has the Event add button (#835); one with neither has „Notizen hinzufügen“.
    expect(stored === null ? entry()!.textContent?.trim() : entry()!.getAttribute('aria-label')).toBe(stored === null ? (gameText ? 'Notizen für dieses Event hinzufügen' : 'Notizen hinzufügen') : 'Notizen für dieses Event bearbeiten')
    entry()!.click()
    await vi.waitFor(() => expect(textbox()).not.toBeNull())
    type(mounted.findComponent(RichNotesEditor), typed)

    footerButton('Speichern').click()

    await vi.waitFor(() => expect(textbox()).toBeNull())
    expect(saves.bodies).toEqual([{ gameId: game, body: { notes: notesFromLines(saved) } }])
    expect(dialog()!.textContent).toContain(saved[0])
    if (gameText) expectEventNotesAboveGameNotes(saved[0]!, gameText)
    expect(document.activeElement).toBe(dialog()!.querySelector(EDIT))
    expect(shownToasts()).toEqual([])
  })

  // The Game notes in the same dialog (#835): one request with only the Game field, and the refetch brings the new text to the dialog and the Round card alike.
  it('saves the Game notes from the dialog of „Läuft aktuell“ through the route, alone, shows them in the dialog and puts the focus on the Game pencil', async () => {
    const { slug } = serveHost(true)
    const mounted = await mount(slug)
    tileButton('Läuft aktuell', 'Halo')!.click()
    await flushPromises()
    dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Notizen bearbeiten"]')!.click()
    await vi.waitFor(() => expect(dialog()!.querySelectorAll('[role="textbox"]')).toHaveLength(2))
    const [, gameEditor] = mounted.findAllComponents(RichNotesEditor)
    editorOf(gameEditor!).commands.setContent(notesFromLines(['Hausregel: Raketen erlaubt'])! as never, { emitUpdate: true })

    footerButton('Speichern').click()

    await vi.waitFor(() => expect(textbox()).toBeNull())
    expect(saves.bodies).toEqual([{ gameId: 'g-halo', body: { gameNotes: notesFromLines(['Hausregel: Raketen erlaubt']) } }])
    expect(dialog()!.textContent).toContain('Hausregel: Raketen erlaubt')
    expect(dialog()!.textContent).toContain('Event-Halo: nur Bo1')
    expect(document.body.textContent).not.toContain('Hausregel: keine Raketen')
    expect(document.activeElement).toBe(dialog()!.querySelector('button[aria-label="Notizen bearbeiten"]'))
    expect(shownToasts()).toEqual([])
  })

  it('clears the note of a game from „Läuft aktuell“ by saving an empty editor, and the add button takes the focus', async () => {
    const { slug } = serveHost(true)
    const mounted = await mount(slug)
    tileButton('Läuft aktuell', 'Halo')!.click()
    await flushPromises()
    entry()!.click()
    await vi.waitFor(() => expect(textbox()).not.toBeNull())
    editorOf(mounted.findComponent(RichNotesEditor)).commands.clearContent(true)

    footerButton('Speichern').click()

    await vi.waitFor(() => expect(textbox()).toBeNull())
    expect(saves.bodies).toEqual([{ gameId: 'g-halo', body: { notes: null } }])
    expect(dialog()!.textContent).not.toContain('Event-Halo')
    expect(document.activeElement).toBe(entry())
    expect(entry()!.textContent?.trim()).toBe('Notizen für dieses Event hinzufügen')
  })

  it('keeps the editor and the typed text when the server refuses, and the toast says so', async () => {
    const { slug } = serveHost(true)
    const mounted = await mount(slug)
    zuletzt().click()
    await flushPromises()
    entry()!.click()
    await vi.waitFor(() => expect(textbox()).not.toBeNull())
    type(mounted.findComponent(RichNotesEditor), ' und Uhr')
    saves.refuse = true

    footerButton('Speichern').click()

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toEqual(['Das geht nicht mehr. Die Seite zeigt den neuen Stand.']))
    expect(saves.bodies).toHaveLength(1)
    expect(textbox()).not.toBeNull()
    expect(editorOf(mounted.findComponent(RichNotesEditor)).getJSON()).toEqual(notesFromLines(['Event-Kart: Mirror aus und Uhr']))
    expect(footerButton('Speichern')).toBeDefined()
  })

  // A finished Event's page lists no wheel and no Rounds (the Standings and the history take their place): the Spielepool is the one place left, and it now knows the Event is over.
  it('shows a finished Event\'s notes frozen in the Spielepool\'s dialog, with no entry and the chip', async () => {
    const { slug } = serveHost(true, 'finished')
    await mount(slug, 'So wird gespielt')

    tileButton('So wird gespielt', 'Kart')!.click()
    await flushPromises()

    expect(dialog()!.textContent).toContain('Event-Kart: Mirror aus')
    expect(dialog()!.textContent).toContain('Event beendet')
    expect(entry()).toBeNull()
    expect(textbox()).toBeNull()
  })

  it('offers no Event entry for a game without Event notes once the Event is finished, but „Notizen hinzufügen“ where it has no Game notes either (#857)', async () => {
    const { slug } = serveHost(true, 'finished')
    await mount(slug, 'So wird gespielt')

    tileButton('So wird gespielt', 'Pong')!.click()
    await flushPromises()

    expect(entry()?.textContent?.trim()).toBe('Notizen hinzufügen')
    expect(dialog()!.querySelector(EDIT)).toBeNull()
    expect(textbox()).toBeNull()
  })

  it('saves a finished Event\'s Game notes from the Spielepool\'s dialog: one request with the Game notes alone, the Event notes stay frozen (#857)', async () => {
    const { slug } = serveHost(true, 'finished')
    const mounted = await mount(slug, 'So wird gespielt')
    tileButton('So wird gespielt', 'Kart')!.click()
    await flushPromises()

    dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Notizen bearbeiten"]')!.click()
    await vi.waitFor(() => expect(textbox()).not.toBeNull())
    type(mounted.findComponent(RichNotesEditor), ' und Uhr')
    footerButton('Speichern').click()

    await vi.waitFor(() => expect(saves.bodies).toHaveLength(1))
    expect(saves.bodies[0]).toEqual({ gameId: 'g-kart', body: { gameNotes: notesFromLines(['Kart-Notizen und Uhr']) } })
    await vi.waitFor(() => expect(textbox()).toBeNull())
    expect(dialog()!.textContent).toContain('Kart-Notizen und Uhr')
    expect(dialog()!.textContent).toContain('Event-Kart: Mirror aus')
    expect(dialog()!.textContent).toContain('Event beendet')
  })

  it('names the Event as the sub of the Event block in the dialog of a Spielepool tile and of the wheel\'s card, where both blocks show', async () => {
    const { slug } = serveHost(true)
    await mount(slug)

    tileButton('So wird gespielt', 'Kart')!.click()
    await flushPromises()
    expect(dialog()!.textContent).toContain('Freitags-Zocken')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await vi.waitFor(() => expect(dialog()).toBeNull())

    zuletzt().click()
    await flushPromises()
    expect(dialog()!.textContent).toContain('Freitags-Zocken')
  })
})
