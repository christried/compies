import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug].vue'
import { kitty, signInAs } from './auth'

// Each test gets its own slug: registerEndpoint keeps the first handler for a path, so tests must
// not share one.
let testNumber = 0
const SANNE = '00000000-0000-4000-8000-000000000003'
const LARSI = '00000000-0000-4000-8000-000000000002'

type Vote = { slotId: string, userId: string, value: 'yes' | 'maybe' | 'no' }
/** The Date fields of the Event's one Session (#48); the view puts them on a Session, not on the Event. */
type SessionDates = { startsAt?: string | null, previousStartsAt?: string | null }
type EventOverrides = { event?: Partial<ReturnType<typeof eventOf>> & SessionDates, slots?: unknown[], bestSlotId?: string | null, progress?: { voted: number, total: number }, inviteUrl?: string | null }

function eventOf(slug: string, phase = 'poll', isHost = false): { slug: string, name: string, phase: string, isHost: boolean } {
  return { slug, name: 'Freitags-Zocken', phase, isHost }
}

/** The `GET /api/e/:slug` body for a Member (Kitty) in a poll with Slots Fr, Sa and a past Di. */
function view(slug: string, votes: Vote[], overrides: EventOverrides = {}) {
  const { startsAt = null, previousStartsAt = null, ...event } = { ...eventOf(slug), ...overrides.event }
  return {
    event,
    sessions: [{ id: `session-${slug}`, startsAt, previousStartsAt }],
    viewerId: kitty.id,
    slots: overrides.slots ?? [
      { id: 'fri', startsAt: '2026-10-23T18:00:00.000Z', past: false },
      { id: 'sat', startsAt: '2026-10-24T18:00:00.000Z', past: false },
      { id: 'old', startsAt: '2026-10-20T18:00:00.000Z', past: true },
    ],
    votes,
    members: [
      { id: kitty.id, name: 'Kitty', image: null, isHost: false },
      { id: LARSI, name: 'Larsi', image: null, isHost: false },
      { id: SANNE, name: 'Sanne', image: null, isHost: true },
    ],
    bestSlotId: overrides.bestSlotId === undefined ? 'sat' : overrides.bestSlotId,
    progress: overrides.progress ?? { voted: 2, total: 3 },
    inviteUrl: overrides.inviteUrl ?? null,
  }
}

const sanneAndLarsi: Vote[] = [
  { slotId: 'fri', userId: SANNE, value: 'yes' },
  { slotId: 'sat', userId: SANNE, value: 'yes' },
  { slotId: 'old', userId: SANNE, value: 'yes' },
  { slotId: 'fri', userId: LARSI, value: 'maybe' },
  { slotId: 'sat', userId: LARSI, value: 'yes' },
]

/** A fresh Event link for one test, with its read endpoint registered to a mutable view. */
function serve(initial: (slug: string) => ReturnType<typeof view>) {
  testNumber += 1
  const slug = `freitags-zocken-${testNumber}`
  let current = initial(slug)
  registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => current })
  return {
    slug,
    set(next: ReturnType<typeof view>) {
      current = next
    },
  }
}

type Wrapper = { text: () => string, attributes: (name: string) => string | undefined }

function shownToasts() {
  return useState<{ text: string, tone: string }[]>('toasts').value
}

function radio(page: Awaited<ReturnType<typeof mountSuspended>>, slotLabel: string, option: string) {
  return page.get(`[role="radiogroup"][aria-label="${slotLabel}"]`).findAll('[role="radio"]').find((button: Wrapper) => button.text() === option)!
}

/** Presses the ✕ of the notice that shows `text`. */
function closeNotice(page: Awaited<ReturnType<typeof mountSuspended>>, text: string) {
  const notice = page.findAll('[role="status"]').find((element: Wrapper) => element.text().includes(text))!
  return notice.get('button[aria-label="Schließen"]').trigger('click')
}

describe('the Event poll', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
  })

  it('shows the Event name, the poll kicker with the vote count, and one vote card per Slot in time order', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.get('h1').text()).toBe('Freitags-Zocken')
    expect(page.text()).toContain('Terminumfrage läuft, 2 von 3 haben abgestimmt')
    const cards = page.findAll('[role="radiogroup"]').map(group => group.attributes('aria-label'))
    expect(cards).toEqual(['Fr 23.10. 20:00', 'Sa 24.10. 20:00', 'Di 20.10. 20:00'])
  })

  it('shows no refresh hint, and keeps the section headings at their levels', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).not.toContain('Aktualisiert sich von selbst')
    expect(page.findAll('h2').map(heading => heading.text())).toEqual(['Wann zocken wir?', 'Wer kann wann?'])
  })

  it('writes each matrix column header as the day and the time on separate lines', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const [friday] = page.findAll('thead th').slice(1)
    expect(friday!.findAll('span').map(line => line.text())).toEqual(['Fr 23.10.', '20:00'])
  })

  it('marks the Best slot and keeps it out of the past', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.findAll('[data-best="true"]')).toHaveLength(1)
    expect(page.get('[data-best="true"]').text()).toContain('Bester Termin')
    expect(page.get('[data-best="true"]').text()).toContain('Sa 24.10.')
  })

  it('marks a past Slot as vorbei and does not let it be voted on', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const past = page.get('[role="radiogroup"][aria-label="Di 20.10. 20:00"]')
    expect(past.attributes('aria-disabled')).toBe('true')
    expect(page.text()).toContain('vorbei')
    expect(past.findAll('[role="radio"]').every((option: Wrapper) => option.attributes('aria-disabled') === 'true')).toBe(true)
  })

  it('shows a Member who has not voted as noch nicht abgestimmt, which is not the same as Nein', async () => {
    const { slug } = serve(s => view(s, [...sanneAndLarsi, { slotId: 'fri', userId: kitty.id, value: 'no' }]))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const titles = page.findAll('table td[title]').map(cell => cell.attributes('title'))
    expect(titles).toContain('noch nicht abgestimmt')
    expect(titles).toContain('Nein')
    expect(page.get('table').text()).toContain('Kitty')
  })

  it('shows a vote at once, then the saved notice once the server has it', async () => {
    let saved: unknown = null
    const store = serve(s => view(s, sanneAndLarsi))
    registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
      method: 'PUT',
      handler: async (event) => {
        saved = await readBody(event)
        store.set(view(store.slug, [...sanneAndLarsi, { slotId: 'sat', userId: kitty.id, value: 'yes' }], { progress: { voted: 3, total: 3 } }))
        return { slotId: 'sat', value: 'yes' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await radio(page, 'Sa 24.10. 20:00', 'Ja').trigger('click')

    await vi.waitFor(() => expect(saved).toEqual({ value: 'yes' }))
    await vi.waitFor(() => expect(page.text()).toContain('Gespeichert.'))
    expect(radio(page, 'Sa 24.10. 20:00', 'Ja').attributes('aria-checked')).toBe('true')
  })

  it('closes the saved notice for this view, and it comes back with the next Vote', async () => {
    const store = serve(s => view(s, sanneAndLarsi))
    for (const slot of ['fri', 'sat']) {
      registerEndpoint(`/api/e/${store.slug}/slots/${slot}/vote`, {
        method: 'PUT',
        handler: () => ({ slotId: slot, value: 'yes' }),
      })
    }
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await radio(page, 'Sa 24.10. 20:00', 'Ja').trigger('click')
    await vi.waitFor(() => expect(page.text()).toContain('Gespeichert.'))
    await closeNotice(page, 'Gespeichert.')
    expect(page.text()).not.toContain('Gespeichert.')

    await radio(page, 'Fr 23.10. 20:00', 'Ja').trigger('click')
    await vi.waitFor(() => expect(page.text()).toContain('Gespeichert.'))
  })

  it('votes with the arrow keys, one Vote per step, and keeps the selected option as the only tab stop', async () => {
    let saved: unknown = null
    const store = serve(s => view(s, sanneAndLarsi))
    registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
      method: 'PUT',
      handler: async (event) => {
        saved = await readBody(event)
        store.set(view(store.slug, [...sanneAndLarsi, { slotId: 'sat', userId: kitty.id, value: 'maybe' }], { progress: { voted: 3, total: 3 } }))
        return { slotId: 'sat', value: 'maybe' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await radio(page, 'Sa 24.10. 20:00', 'Ja').trigger('keydown', { key: 'ArrowRight' })

    await vi.waitFor(() => expect(saved).toEqual({ value: 'maybe' }))
    await vi.waitFor(() => expect(radio(page, 'Sa 24.10. 20:00', 'Meh').attributes('aria-checked')).toBe('true'))
    const group = page.get('[role="radiogroup"][aria-label="Sa 24.10. 20:00"]')
    expect(group.findAll('[role="radio"]').map((option: Wrapper) => option.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('explains the three options in a legend above the Slot cards', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const legend = page.get('[data-testid="vote-legend"]')
    expect(legend.text()).toContain('Ja')
    expect(legend.text()).toContain('Ich kann da!')
    expect(legend.text()).toContain('Meh')
    expect(legend.text()).toContain('Krieg ich hin.')
    expect(legend.text()).toContain('Nein')
    expect(legend.text()).toContain('Wird nichts bei mir.')
  })

  it('draws no icon on Meh, neither on its option nor on its legend chip, while Ja and Nein keep theirs', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(radio(page, 'Sa 24.10. 20:00', 'Meh').find('svg').exists()).toBe(false)
    expect(radio(page, 'Sa 24.10. 20:00', 'Ja').find('svg').exists()).toBe(true)
    expect(radio(page, 'Sa 24.10. 20:00', 'Nein').find('svg').exists()).toBe(true)
    const chips = page.findAll('[data-testid="vote-legend"] li > span:first-child')
    expect(chips.map(chip => chip.find('svg').exists())).toEqual([true, false, true])
  })

  it('keeps the minus in the matrix cell of a Meh Vote', async () => {
    const store = serve(s => view(s, [...sanneAndLarsi, { slotId: 'fri', userId: kitty.id, value: 'maybe' }]))

    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    expect(page.get('table td[title="Meh"] span').find('svg').exists()).toBe(true)
  })

  it('draws a selected Nein in the error red with dark text, and a Nein cell in the matrix as a red square', async () => {
    const store = serve(s => view(s, [...sanneAndLarsi, { slotId: 'fri', userId: kitty.id, value: 'no' }]))

    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    const selected = radio(page, 'Fr 23.10. 20:00', 'Nein')
    expect(selected.classes()).toEqual(expect.arrayContaining(['bg-error', 'text-on-error']))
    const cell = page.get('table td[title="Nein"] span')
    expect(cell.classes()).toEqual(expect.arrayContaining(['bg-error', 'text-on-error']))
  })

  it('saves only the last of several quick arrow presses, and the selection follows each press', async () => {
    const saved: { value: string }[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const store = serve(s => view(s, sanneAndLarsi))
    registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
      method: 'PUT',
      handler: async (event) => {
        const body = await readBody(event) as { value: 'yes' | 'maybe' | 'no' }
        saved.push(body)
        if (saved.length === 1) await gate
        store.set(view(store.slug, [...sanneAndLarsi, { slotId: 'sat', userId: kitty.id, value: body.value }], { progress: { voted: 3, total: 3 } }))
        return { slotId: 'sat', value: body.value }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    const group = page.get('[role="radiogroup"][aria-label="Sa 24.10. 20:00"]')
    const press = async () => {
      await group.get('[aria-checked="true"], [role="radio"][tabindex="0"]').trigger('keydown', { key: 'ArrowRight' })
    }

    await press()
    expect(radio(page, 'Sa 24.10. 20:00', 'Meh').attributes('aria-checked')).toBe('true')
    await press()
    expect(radio(page, 'Sa 24.10. 20:00', 'Nein').attributes('aria-checked')).toBe('true')
    await press()
    expect(radio(page, 'Sa 24.10. 20:00', 'Ja').attributes('aria-checked')).toBe('true')

    release()

    await vi.waitFor(() => expect(saved).toEqual([{ value: 'maybe' }, { value: 'yes' }]))
    await vi.waitFor(() => expect(radio(page, 'Sa 24.10. 20:00', 'Ja').attributes('aria-checked')).toBe('true'))
  })

  it('does not take a vote with the arrow keys on a past Slot', async () => {
    const store = serve(s => view(s, sanneAndLarsi))
    const saved: unknown[] = []
    registerEndpoint(`/api/e/${store.slug}/slots/old/vote`, {
      method: 'PUT',
      handler: async (event) => {
        saved.push(await readBody(event))
        return { slotId: 'old', value: 'yes' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    await radio(page, 'Di 20.10. 20:00', 'Ja').trigger('keydown', { key: 'ArrowRight' })

    expect(saved).toEqual([])
  })

  it('rolls the vote back and raises the error toast when saving fails', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))
    registerEndpoint(`/api/e/${slug}/slots/fri/vote`, {
      method: 'PUT',
      handler: () => {
        throw createError({ statusCode: 500, statusMessage: 'boom' })
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await radio(page, 'Fr 23.10. 20:00', 'Nein').trigger('click')

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Deine Stimme ist nicht angekommen'))
    expect(shownToasts().find(toast => toast.text === 'Deine Stimme ist nicht angekommen')?.tone).toBe('error')
    await vi.waitFor(() => expect(radio(page, 'Fr 23.10. 20:00', 'Nein').attributes('aria-checked')).toBe('false'))
    expect(page.text()).not.toContain('Gespeichert.')
  })

  it('shows the Host dock to the Host only', async () => {
    const member = serve(s => view(s, sanneAndLarsi))
    const memberPage = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
    expect(memberPage.find('[role="toolbar"]').exists()).toBe(false)

    const hostView = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    const hostPage = await mountSuspended(EventPage, { route: `/e/${hostView.slug}` })
    expect(hostPage.get('[role="toolbar"]').attributes('aria-label')).toBe('Host-Steuerung')
    expect(hostPage.get('[role="toolbar"]').text()).toContain('Termin festlegen')
    expect(hostPage.get('[role="toolbar"]').text()).toContain('Einladen')
  })

  it('renders no stray markup as text for the Host', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).not.toMatch(/\/>|<\//)
  })

  it('opens the Slot editor from the Host dock', async () => {
    document.body.innerHTML = ''
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const edit = page.get('[role="toolbar"]').findAll('button').find(button => button.text() === 'Termine bearbeiten')
    expect(edit).toBeDefined()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await edit!.trigger('click')

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Termine bearbeiten')
    expect(dialog?.textContent).toContain('Vorgeschlagene Termine')
    page.unmount()
    document.body.innerHTML = ''
  })

  it('opens the Invite sheet from the Host dock with the Invite link, and only the Host has that action', async () => {
    const inviteUrl = 'http://localhost/e/freitags-zocken-invite-AbCdEfGhIjKl'
    const hostView = serve(s => view(s, sanneAndLarsi, { event: { isHost: true }, inviteUrl }))
    const page = await mountSuspended(EventPage, { route: `/e/${hostView.slug}` })
    const einladen = page.get('[role="toolbar"]').findAll('button').find((node: Wrapper) => node.text() === 'Einladen')!

    await einladen.trigger('click')

    await vi.waitFor(() => expect([...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[readonly]')].some(node => node.value === inviteUrl)).toBe(true))
    page.unmount()
  })

  it('shows the set Date for a direct Event and no vote cards', async () => {
    const { slug } = serve(s => view(s, [], {
      event: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z', isHost: true },
      slots: [],
      bestSlotId: null,
      progress: { voted: 0, total: 3 },
    }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Samstag, 24. Oktober, 20:00 Uhr')
    expect(page.findAll('[role="radiogroup"]')).toHaveLength(0)
  })

  it('shows the generic invalid-link page for an Event the User is not a Member of', async () => {
    registerEndpoint(`/api/e/geheim-k7q2`, {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Event not found' })
      },
    })

    const page = await mountSuspended(EventPage, { route: '/e/geheim-k7q2' })

    expect(page.get('h1').text()).toBe('Link ungültig')
  })

  it('shows the deleted-Event page to a former Member', async () => {
    registerEndpoint(`/api/e/geloescht-k7q2`, {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 410, statusMessage: 'Event deleted' })
      },
    })

    const page = await mountSuspended(EventPage, { route: '/e/geloescht-k7q2' })

    expect(page.get('h1').text()).toBe('Event gelöscht')
  })
})

describe('setting the Date', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  /** The open confirm dialog, which is teleported to the body. */
  function dialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[role="dialog"]')
  }

  /** The label of the chosen option in the dialog, without its vote counts. */
  function selectedOption(): string | undefined {
    return dialog()?.querySelector('[role="radio"][aria-checked="true"] b')?.textContent?.trim()
  }

  /** Clicks the button with this label inside `root` and lets Vue run the handler. */
  async function clickButton(root: ParentNode | null | undefined, label: string) {
    const button = [...(root?.querySelectorAll('button') ?? [])].find(element => element.textContent?.trim() === label)
    expect(button, label).toBeDefined()
    button!.click()
    await new Promise(resolve => setTimeout(resolve))
  }

  it('lets the Host pick a Slot card and opens the confirm dialog with that Slot preselected', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi, { event: { isHost: true } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.get('[data-slot="fri"]').element, 'Diesen festlegen')

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

  it('shows the calendar link to every Member, and Verschieben only to the Host', async () => {
    const member = serve(s => view(s, [], {
      event: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z' },
      slots: [],
      bestSlotId: null,
    }))
    const memberPage = await mountSuspended(EventPage, { route: `/e/${member.slug}` })
    const calendarLink = memberPage.get(`a[href="/api/e/${member.slug}/ics"]`)
    expect(calendarLink.attributes('download')).toBeDefined()
    // The control is about the Date, so it is labelled as a calendar entry, not as a file download.
    expect(calendarLink.text()).toBe('In den Kalender')
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

describe('rescheduling and reopening the Date', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  async function clickButton(root: ParentNode | null | undefined, label: string) {
    const button = [...(root?.querySelectorAll('button') ?? [])].find(element => element.textContent?.trim() === label)
    expect(button, label).toBeDefined()
    button!.click()
    await new Promise(resolve => setTimeout(resolve))
  }

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
    const hold = page.findAll('button').find(button => button.text() === 'Neue Terminsuche')!

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

/** The `GET /api/e/:slug` body of an Event with several Sessions (#49): the Sessions come as the server numbers them. */
function viewWithSessions(slug: string, sessions: { startsAt: string | null, number: number | null }[], missingDates: number, overrides: EventOverrides = {}) {
  return {
    ...view(slug, [], overrides),
    sessions: sessions.map((session, index) => ({ id: `session-${slug}-${index}`, previousStartsAt: null, ...session })),
    missingDates,
  } as ReturnType<typeof view>
}

describe('several Sessions on the Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  /** The open confirm dialog, which is teleported to the body. */
  function dialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[role="dialog"]')
  }

  /** Clicks the button with this label inside `root` and lets Vue run the handler. */
  async function clickButton(root: ParentNode | null | undefined, label: string) {
    const button = [...(root?.querySelectorAll('button') ?? [])].find(element => element.textContent?.trim() === label)
    expect(button, label).toBeDefined()
    button!.click()
    await new Promise(resolve => setTimeout(resolve))
  }

  it('shows a numbered card per dated Session with the Host actions on each, and one calendar link and one Einladen for the whole Event', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Session 1')
    expect(page.text()).toContain('Session 2')
    expect(page.findAll(`a[href="/api/e/${slug}/ics"]`)).toHaveLength(1)
    expect(page.findAll('button').filter(button => button.text() === 'Einladen')).toHaveLength(1)
    expect(page.findAll('button').filter(button => button.text() === 'Verschieben')).toHaveLength(2)
    expect(page.findAll('button').filter(button => button.text() === 'Neue Terminsuche')).toHaveLength(2)
    expect(page.findAll('button').filter(button => button.text() === 'Entfernen')).toHaveLength(2)
    expect(page.text()).not.toContain('Termin festlegen')
    // Every button on the cards is 48 px (h-12), the Reopen and removal holds too (#55).
    const cardButtons = page.findAll('button').filter(button => ['Verschieben', 'Neue Terminsuche', 'Entfernen'].includes(button.text()))
    expect(cardButtons).toHaveLength(6)
    expect(cardButtons.every(button => button.classes().includes('h-12'))).toBe(true)
  })

  it('reschedules the Session whose card was used, sending its own id', async () => {
    let sentTo = ''
    let sent: unknown = null
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
    registerEndpoint(`/api/e/${slug}/sessions/session-${slug}-1/reschedule`, {
      method: 'POST',
      handler: async (event) => {
        sentTo = 'second'
        sent = await readBody(event)
        return { startsAt: '2026-11-01T19:00:00.000Z' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    const second = page.findAll('section').filter(section => section.text().includes('Session 2'))[0]!

    await clickButton(second.element, 'Verschieben')
    const rescheduleDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(element => element.textContent?.includes('Termin verschieben?'))
    await clickButton(rescheduleDialog, 'Termin verschieben')

    await vi.waitFor(() => expect(sentTo).toBe('second'))
    expect(sent).toEqual({ startsAt: '2026-10-31T20:00' })
  })

  it('removes a dated Session after a one second hold on Entfernen, and does not hold a removal that is refused', async () => {
    let removed = 0
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
    registerEndpoint(`/api/e/${slug}/sessions/session-${slug}-0`, {
      method: 'DELETE',
      handler: () => {
        removed += 1
        throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    const hold = page.findAll('button').filter(button => button.text() === 'Entfernen')[0]!

    await hold.trigger('pointerdown')
    await new Promise(resolve => setTimeout(resolve, 1100))

    await vi.waitFor(() => expect(removed).toBe(1))
    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Konnte nicht speichern. Nochmal versuchen?'))
    // The refused hold starts again from zero, so a second hold sends the removal once more.
    const again = page.findAll('button').filter(button => button.text() === 'Entfernen')[0]!
    await again.trigger('pointerdown')
    await new Promise(resolve => setTimeout(resolve, 1100))
    await vi.waitFor(() => expect(removed).toBe(2))
  })

  it('opens the Session sheet after the cards, with a Date field or the choice to leave the Date to the poll', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.element, 'Session hinzufügen')
    const sheet = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(element => element.textContent?.includes('Termin eintragen'))
    expect(sheet).toBeDefined()
    expect(sheet!.querySelector('[role="radiogroup"]')).not.toBeNull()
    expect(sheet!.textContent).toContain('Aus der Umfrage')

    // Closed again, so the teleported sheet does not outlive the test.
    sheet!.querySelector<HTMLElement>('button[aria-label="Schließen"]')!.click()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
  })

  it('offers no Entfernen on the card of the last Session', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Verschieben')
    expect(page.text()).toContain('Neue Terminsuche')
    expect(page.text()).not.toContain('Entfernen')
  })

  it('offers no Session change once the Event is finished: no Neue Terminsuche, Entfernen or Session hinzufügen, but Verschieben stays', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
    ], 0, { event: { phase: 'finished', isHost: true }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.findAll('button').filter(button => button.text() === 'Verschieben')).toHaveLength(2)
    expect(page.text()).not.toContain('Neue Terminsuche')
    expect(page.text()).not.toContain('Entfernen')
    expect(page.text()).not.toContain('Session hinzufügen')
  })

  it('shows no Session actions to a Member', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
    ], 0, { event: { phase: 'date_set', isHost: false }, slots: [], bestSlotId: null }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).not.toContain('Session hinzufügen')
    expect(page.text()).not.toContain('Entfernen')
    expect(page.text()).not.toContain('Neue Terminsuche')
  })

  it('removes one undated Session with the − next to the missing Dates, and keeps the last Session', async () => {
    let removed = 0
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 2, { event: { phase: 'poll', isHost: true } }))
    registerEndpoint(`/api/e/${slug}/sessions/session-${slug}-2`, {
      method: 'DELETE',
      handler: () => {
        removed += 1
        return { phase: 'poll' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await page.get('button[aria-label="Session ohne Termin entfernen"]').trigger('click')

    await vi.waitFor(() => expect(removed).toBe(1))
  })

  it('shows no − when the Event has one Session, the last one', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
    ], 1, { event: { phase: 'poll', isHost: true } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.find('button[aria-label="Session ohne Termin entfernen"]').exists()).toBe(false)
  })

  it('says how many Dates are still missing above the poll, and the dock offers Termin festlegen next to Termine bearbeiten', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 3, { event: { phase: 'poll', isHost: true } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('3 Termine gesucht')
    expect(page.text()).not.toContain('1 Termin gesucht')
    expect(page.get('[role="toolbar"]').text()).toContain('Termin festlegen')
    expect(page.get('[role="toolbar"]').text()).toContain('Termine bearbeiten')
    expect(page.get('[role="toolbar"]').text()).toContain('Einladen')
  })

  it('sets the Date of the next undated Session from the Slot the Host picks, and says what is still missing afterwards', async () => {
    let sent: unknown = null
    const store = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 2, { event: { phase: 'poll', isHost: true }, bestSlotId: null }))
    registerEndpoint(`/api/e/${store.slug}/confirm`, {
      method: 'POST',
      handler: async (event) => {
        sent = await readBody(event)
        return { startsAt: '2026-10-24T18:00:00.000Z' }
      },
    })
    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    expect(dialog()?.textContent).toContain('Danach fehlt noch 1 Termin.')
    expect(dialog()?.textContent).toContain('Alle sehen den Termin sofort hier.')
    await clickButton(dialog(), 'Festlegen')

    await vi.waitFor(() => expect(sent).toEqual({ slotId: 'fri' }))
  })

  it('names the Dates still missing afterwards in the plural, and says nothing once the last Date is set', async () => {
    const plural = serve(s => viewWithSessions(s, [
      { number: null, startsAt: null },
      { number: null, startsAt: null },
      { number: null, startsAt: null },
    ], 3, { event: { phase: 'poll', isHost: true } }))
    const pluralPage = await mountSuspended(EventPage, { route: `/e/${plural.slug}` })
    await clickButton(pluralPage.get('[role="toolbar"]').element, 'Termin festlegen')
    expect(dialog()?.textContent).toContain('Danach fehlen noch 2 Termine.')
    await clickButton(dialog(), 'Abbrechen')
    pluralPage.unmount()

    const last = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: null, startsAt: null },
    ], 1, { event: { phase: 'poll', isHost: true } }))
    const lastPage = await mountSuspended(EventPage, { route: `/e/${last.slug}` })
    await clickButton(lastPage.get('[role="toolbar"]').element, 'Termin festlegen')
    expect(dialog()?.textContent).not.toContain('Danach')
  })

  it('shows "Termin festlegen" disabled with the reason when no Slot is open, and answers a click with a neutral toast', async () => {
    const { slug } = serve(s => view(s, [], { event: { isHost: true }, slots: [], bestSlotId: null }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    const set = [...page.get('[role="toolbar"]').element.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Termin festlegen')!

    expect(set.getAttribute('aria-disabled')).toBe('true')
    expect(set.disabled).toBe(false)
    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    expect(dialog()).toBeNull()
    expect(shownToasts()).toEqual([expect.objectContaining({ text: 'Schlag erst einen Termin vor.', tone: 'info' })])
  })

  it('shows "Termin festlegen" disabled with the future reason when only past Slots are left', async () => {
    const { slug } = serve(s => view(s, [], {
      event: { isHost: true },
      slots: [{ id: 'old', startsAt: '2026-10-20T18:00:00.000Z', past: true }],
      bestSlotId: null,
    }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const set = [...page.get('[role="toolbar"]').element.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Termin festlegen')!
    expect(set.getAttribute('aria-disabled')).toBe('true')
    await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

    expect(shownToasts()).toEqual([expect.objectContaining({ text: 'Kein Termin liegt mehr in der Zukunft.', tone: 'info' })])
  })

  it('leaves "Termin festlegen" enabled while a future Slot is open', async () => {
    const { slug } = serve(s => view(s, [], { event: { isHost: true } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const set = [...page.get('[role="toolbar"]').element.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Termin festlegen')!
    expect(set.getAttribute('aria-disabled')).toBeNull()
  })

  it('numbers the dated card and asks for the one missing Date in the singular', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: null, startsAt: null },
    ], 1, { event: { phase: 'poll' } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).toContain('Session 1')
    expect(page.text()).toContain('1 Termin gesucht')
    expect(page.text()).not.toContain('Termine gesucht')
  })

  it('shows no number on the card of an Event with one Session', async () => {
    const { slug } = serve(s => viewWithSessions(s, [{ number: 1, startsAt: '2026-10-30T19:00:00.000Z' }], 0, { event: { phase: 'date_set' } }))

    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.text()).not.toContain('Session 1')
    expect(page.text()).toContain('Freitags-Zocken')
  })
})
