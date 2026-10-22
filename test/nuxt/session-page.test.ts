import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionPage from '~/pages/s/[slug].vue'
import { kitty, signInAs } from './auth'

// Each test gets its own slug: registerEndpoint keeps the first handler for a path, so tests must
// not share one.
let testNumber = 0
const SANNE = '00000000-0000-4000-8000-000000000003'
const LARSI = '00000000-0000-4000-8000-000000000002'

type Vote = { slotId: string, userId: string, value: 'yes' | 'maybe' | 'no' }
type SessionOverrides = { session?: Partial<ReturnType<typeof sessionOf>>, slots?: unknown[], bestSlotId?: string | null, progress?: { voted: number, total: number }, inviteUrl?: string | null }

function sessionOf(slug: string, phase = 'poll', isHost = false): { slug: string, name: string, phase: string, dateMode: string, startsAt: string | null, isHost: boolean } {
  return { slug, name: 'Freitags-Zocken', phase, dateMode: 'poll', startsAt: null, isHost }
}

/** The `GET /api/s/:slug` body for a Member (Kitty) in a poll with Slots Fr, Sa and a past Di. */
function view(slug: string, votes: Vote[], overrides: SessionOverrides = {}) {
  return {
    session: { ...sessionOf(slug), ...overrides.session },
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

/** A fresh Session link for one test, with its read endpoint registered to a mutable view. */
function serve(initial: (slug: string) => ReturnType<typeof view>) {
  testNumber += 1
  const slug = `freitags-zocken-${testNumber}`
  let current = initial(slug)
  registerEndpoint(`/api/s/${slug}`, { method: 'GET', handler: () => current })
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

describe('the Session poll', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
  })

  it('shows the Session name, the poll kicker with the vote count, and one vote card per Slot in time order', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(SessionPage, { route: `/s/${slug}` })

    expect(page.get('h1').text()).toBe('Freitags-Zocken')
    expect(page.text()).toContain('Terminumfrage läuft, 2 von 3 haben abgestimmt')
    const cards = page.findAll('[role="radiogroup"]').map(group => group.attributes('aria-label'))
    expect(cards).toEqual(['Fr 23.10. 20:00', 'Sa 24.10. 20:00', 'Di 20.10. 20:00'])
  })

  it('marks the Best slot and keeps it out of the past', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(SessionPage, { route: `/s/${slug}` })

    expect(page.findAll('[data-best="true"]')).toHaveLength(1)
    expect(page.get('[data-best="true"]').text()).toContain('Bester Termin')
    expect(page.get('[data-best="true"]').text()).toContain('Sa 24.10.')
  })

  it('marks a past Slot as vorbei and does not let it be voted on', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))

    const page = await mountSuspended(SessionPage, { route: `/s/${slug}` })

    const past = page.get('[role="radiogroup"][aria-label="Di 20.10. 20:00"]')
    expect(past.attributes('aria-disabled')).toBe('true')
    expect(page.text()).toContain('vorbei')
    expect(past.findAll('[role="radio"]').every((option: Wrapper) => option.attributes('aria-disabled') === 'true')).toBe(true)
  })

  it('shows a Member who has not voted as noch nicht abgestimmt, which is not the same as Nein', async () => {
    const { slug } = serve(s => view(s, [...sanneAndLarsi, { slotId: 'fri', userId: kitty.id, value: 'no' }]))

    const page = await mountSuspended(SessionPage, { route: `/s/${slug}` })

    const titles = page.findAll('table td[title]').map(cell => cell.attributes('title'))
    expect(titles).toContain('noch nicht abgestimmt')
    expect(titles).toContain('Nein')
    expect(page.get('table').text()).toContain('Kitty')
  })

  it('shows a vote at once, then the saved notice once the server has it', async () => {
    let saved: unknown = null
    const store = serve(s => view(s, sanneAndLarsi))
    registerEndpoint(`/api/s/${store.slug}/slots/sat/vote`, {
      method: 'PUT',
      handler: async (event) => {
        saved = await readBody(event)
        store.set(view(store.slug, [...sanneAndLarsi, { slotId: 'sat', userId: kitty.id, value: 'yes' }], { progress: { voted: 3, total: 3 } }))
        return { slotId: 'sat', value: 'yes' }
      },
    })
    const page = await mountSuspended(SessionPage, { route: `/s/${store.slug}` })

    await radio(page, 'Sa 24.10. 20:00', 'Ja').trigger('click')

    await vi.waitFor(() => expect(saved).toEqual({ value: 'yes' }))
    await vi.waitFor(() => expect(page.text()).toContain('Gespeichert.'))
    expect(radio(page, 'Sa 24.10. 20:00', 'Ja').attributes('aria-checked')).toBe('true')
  })

  it('rolls the vote back and raises the error toast when saving fails', async () => {
    const { slug } = serve(s => view(s, sanneAndLarsi))
    registerEndpoint(`/api/s/${slug}/slots/fri/vote`, {
      method: 'PUT',
      handler: () => {
        throw createError({ statusCode: 500, statusMessage: 'boom' })
      },
    })
    const page = await mountSuspended(SessionPage, { route: `/s/${slug}` })

    await radio(page, 'Fr 23.10. 20:00', 'Nein').trigger('click')

    await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Deine Stimme ist nicht angekommen'))
    expect(shownToasts().find(toast => toast.text === 'Deine Stimme ist nicht angekommen')?.tone).toBe('error')
    await vi.waitFor(() => expect(radio(page, 'Fr 23.10. 20:00', 'Nein').attributes('aria-checked')).toBe('false'))
    expect(page.text()).not.toContain('Gespeichert.')
  })

  it('shows the Host dock to the Host only', async () => {
    const member = serve(s => view(s, sanneAndLarsi))
    const memberPage = await mountSuspended(SessionPage, { route: `/s/${member.slug}` })
    expect(memberPage.find('[role="toolbar"]').exists()).toBe(false)

    const hostView = serve(s => view(s, sanneAndLarsi, { session: { isHost: true } }))
    const hostPage = await mountSuspended(SessionPage, { route: `/s/${hostView.slug}` })
    expect(hostPage.get('[role="toolbar"]').attributes('aria-label')).toBe('Host-Steuerung')
    expect(hostPage.get('[role="toolbar"]').text()).toContain('Termin festlegen')
    expect(hostPage.get('[role="toolbar"]').text()).toContain('Einladen')
  })

  it('opens the Slot editor from the Host dock', async () => {
    document.body.innerHTML = ''
    const { slug } = serve(s => view(s, sanneAndLarsi, { session: { isHost: true } }))
    const page = await mountSuspended(SessionPage, { route: `/s/${slug}` })

    const edit = page.get('[role="toolbar"]').findAll('button').find(button => button.text() === 'Termine bearbeiten')
    expect(edit).toBeDefined()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await edit!.trigger('click')

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Termine bearbeiten')
    expect(dialog?.textContent).toContain('Vorgeschlagene Termine')
    document.body.innerHTML = ''
  })

  it('opens the Invite sheet from the Host dock with the Invite link, and only the Host has that action', async () => {
    const inviteUrl = 'http://localhost/s/freitags-zocken-invite-AbCdEfGhIjKl'
    const hostView = serve(s => view(s, sanneAndLarsi, { session: { isHost: true }, inviteUrl }))
    const page = await mountSuspended(SessionPage, { route: `/s/${hostView.slug}` })
    const einladen = page.get('[role="toolbar"]').findAll('button').find((node: Wrapper) => node.text() === 'Einladen')!

    await einladen.trigger('click')

    await vi.waitFor(() => expect([...document.querySelectorAll('[role="dialog"]')].some(node => node.textContent?.includes(inviteUrl))).toBe(true))
  })

  it('shows the set Date for a direct Session and no vote cards', async () => {
    const { slug } = serve(s => view(s, [], {
      session: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z', isHost: true },
      slots: [],
      bestSlotId: null,
      progress: { voted: 0, total: 3 },
    }))

    const page = await mountSuspended(SessionPage, { route: `/s/${slug}` })

    expect(page.text()).toContain('Termin steht: Sa 24.10. 20:00 Uhr')
    expect(page.findAll('[role="radiogroup"]')).toHaveLength(0)
  })

  it('shows the generic invalid-link page for a Session the User is not a Member of', async () => {
    registerEndpoint(`/api/s/geheim-k7q2`, {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      },
    })

    const page = await mountSuspended(SessionPage, { route: '/s/geheim-k7q2' })

    expect(page.get('h1').text()).toBe('Link ungültig')
  })

  it('shows the deleted-Session page to a former Member', async () => {
    registerEndpoint(`/api/s/geloescht-k7q2`, {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
      },
    })

    const page = await mountSuspended(SessionPage, { route: '/s/geloescht-k7q2' })

    expect(page.get('h1').text()).toBe('Session gelöscht')
  })
})
