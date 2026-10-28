import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug].vue'
import { kitty, signInAs } from './auth'
import { closeNotice, radio, sanneAndLarsi, serve, shownToasts, view, type Wrapper } from './event-page'

// The vote mark of the matrix cell whose screen-reader text is `text` (the cells have no title, #125).
const matrixCell = (page: Awaited<ReturnType<typeof mountSuspended>>, text: string) => page.findAll('table td').find((cell: Wrapper) => cell.text() === text)!.get('span')

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

    const titles = page.findAll('table td').map(cell => cell.get('.sr-only').text())
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

    expect(matrixCell(page, 'Meh').find('svg').exists()).toBe(true)
  })

  it('draws a selected Nein in the error red with dark text, and a Nein cell in the matrix as a red square', async () => {
    const store = serve(s => view(s, [...sanneAndLarsi, { slotId: 'fri', userId: kitty.id, value: 'no' }]))

    const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

    const selected = radio(page, 'Fr 23.10. 20:00', 'Nein')
    expect(selected.classes()).toEqual(expect.arrayContaining(['bg-error', 'text-on-error']))
    const cell = matrixCell(page, 'Nein')
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
