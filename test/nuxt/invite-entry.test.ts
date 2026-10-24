import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug].vue'
import SignInPage from '~/pages/anmelden.vue'
import { kitty, signInAs } from './auth'

// The Invite link `/e/<slug>-<token>` (ADR 0006): a signed-out visitor sees the Event name and the
// Host, a signed-in User joins and moves on to the Event link. Every test uses its own token so
// the registered endpoints do not collide.
const link = (token: string) => `freitags-zocken-k7q2-${token}`
const preview = { eventName: 'Freitags-Zocken', host: { name: 'Sanne', image: null } }

describe('the Invite link, signed out', () => {
  beforeEach(() => signInAs(null))

  it('shows the Host and the Event name, and offers to sign in to join', async () => {
    const path = link('Ab3dE6gH9jK1')
    registerEndpoint(`/api/invite/${path}`, { method: 'GET', handler: () => preview })

    const page = await mountSuspended(EventPage, { route: `/e/${path}` })

    expect(page.get('h1').text()).toBe('Sanne lädt dich zu Freitags-Zocken ein')
    expect(page.get(`a[href="/anmelden?redirect=${encodeURIComponent(`/e/${path}`)}"]`).text()).toBe('Anmelden und beitreten')
    await vi.waitFor(() => expect(document.title).toBe('Erst kurz anmelden | Compies'))
  })

  it('shows nothing of the Event but its name and the Host, no Slots or counts', async () => {
    const path = link('Zz9Zz9Zz9Zz9')
    registerEndpoint(`/api/invite/${path}`, { method: 'GET', handler: () => preview })

    const page = await mountSuspended(EventPage, { route: `/e/${path}` })

    expect(page.findAll('time')).toHaveLength(0)
    expect(page.findAll('input, [role="radio"]')).toHaveLength(0)
    expect(page.text()).not.toMatch(/Leute|abgestimmt|Stimme/)
  })

  it('shows the generic invalid page for an invalid, rotated or deleted link', async () => {
    const path = link('Yy8Yy8Yy8Yy8')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Event not found' })
      },
    })

    const page = await mountSuspended(EventPage, { route: `/e/${path}` })

    expect(page.get('h1').text()).toBe('Link ungültig')
  })

  it('names the invalid page in the tab title', async () => {
    const path = link('Tt3Tt3Tt3Tt3')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Event not found' })
      },
    })

    await mountSuspended(EventPage, { route: `/e/${path}` })

    await vi.waitFor(() => expect(document.title).toBe('Link ungültig | Compies'))
  })
})

describe('the Invite link, signed in', () => {
  beforeEach(() => signInAs(kitty))

  it('joins the Event and moves on to the Event link, with a toast', async () => {
    const path = link('Xx7Xx7Xx7Xx7')
    const joined = vi.fn()
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => {
        joined()
        return { slug: 'freitags-zocken-k7q2', joined: true }
      },
    })

    await mountSuspended(EventPage, { route: `/e/${path}` })

    await vi.waitFor(() => expect(joined).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe('/e/freitags-zocken-k7q2'))
    expect(useToast().toasts.value.map(toast => toast.text)).toContain('Du bist drin! Du sitzt erstmal auf der Bench.')
  })

  it('titles the tab Einladung while joining, not sign-in', async () => {
    const path = link('Ss2Ss2Ss2Ss2')
    let answer = (_: { slug: string, joined: boolean }) => {}
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => new Promise<{ slug: string, joined: boolean }>((resolve) => {
        answer = resolve
      }),
    })

    await mountSuspended(EventPage, { route: `/e/${path}` })

    await vi.waitFor(() => expect(document.title).toBe('Einladung | Compies'))
    answer({ slug: 'freitags-zocken-k7q2', joined: false })
  })

  it('says the Event is deleted to a former Member', async () => {
    const path = link('Ww6Ww6Ww6Ww6')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 410, statusMessage: 'Event deleted' })
      },
    })

    const page = await mountSuspended(EventPage, { route: `/e/${path}` })

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Event gelöscht'))
  })

  it('names the deleted page in the tab title once the join fails', async () => {
    const path = link('Rr1Rr1Rr1Rr1')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 410, statusMessage: 'Event deleted' })
      },
    })

    await mountSuspended(EventPage, { route: `/e/${path}` })

    await vi.waitFor(() => expect(document.title).toBe('Event gelöscht | Compies'))
  })

  it('shows the generic invalid page when the link no longer leads anywhere', async () => {
    const path = link('Vv5Vv5Vv5Vv5')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Event not found' })
      },
    })

    const page = await mountSuspended(EventPage, { route: `/e/${path}` })

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Link ungültig'))
    await vi.waitFor(() => expect(document.title).toBe('Link ungültig | Compies'))
  })
})

describe('the Event link of a deleted Event', () => {
  beforeEach(() => signInAs(kitty))

  it('says the Event is deleted to a former Member', async () => {
    registerEndpoint('/api/e/geloescht-k7q2', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 410, statusMessage: 'Event deleted' })
      },
    })

    const page = await mountSuspended(EventPage, { route: '/e/geloescht-k7q2' })

    expect(page.get('h1').text()).toBe('Event gelöscht')
    await vi.waitFor(() => expect(document.title).toBe('Event gelöscht | Compies'))
  })
})

describe('sign-in for an Invite link', () => {
  beforeEach(() => signInAs(null))

  it('names the Host and the Event in the notice', async () => {
    const path = link('Uu4Uu4Uu4Uu4')
    registerEndpoint(`/api/invite/${path}`, { method: 'GET', handler: () => preview })

    const page = await mountSuspended(SignInPage, { route: `/anmelden?redirect=${encodeURIComponent(`/e/${path}`)}` })

    await vi.waitFor(() => expect(page.text()).toContain('Sanne hat dich zu Freitags-Zocken eingeladen.'))
  })
})
