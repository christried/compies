import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionPage from '~/pages/s/[slug].vue'
import SignInPage from '~/pages/anmelden.vue'
import { kitty, signInAs } from './auth'

// The Invite link `/s/<slug>-<token>` (ADR 0006): a signed-out visitor sees the Session name and the
// Host, a signed-in User joins and moves on to the Session link. Every test uses its own token so
// the registered endpoints do not collide.
const link = (token: string) => `freitags-zocken-k7q2-${token}`
const preview = { sessionName: 'Freitags-Zocken', host: { name: 'Sanne', image: null } }

describe('the Invite link, signed out', () => {
  beforeEach(() => signInAs(null))

  it('shows the Host and the Session name, and offers to sign in to join', async () => {
    const path = link('Ab3dE6gH9jK1')
    registerEndpoint(`/api/invite/${path}`, { method: 'GET', handler: () => preview })

    const page = await mountSuspended(SessionPage, { route: `/s/${path}` })

    expect(page.get('h1').text()).toBe('Sanne lädt dich zu Freitags-Zocken ein')
    expect(page.get(`a[href="/anmelden?redirect=${encodeURIComponent(`/s/${path}`)}"]`).text()).toBe('Anmelden und beitreten')
  })

  it('shows nothing of the Session but its name and the Host, no Slots or counts', async () => {
    const path = link('Zz9Zz9Zz9Zz9')
    registerEndpoint(`/api/invite/${path}`, { method: 'GET', handler: () => preview })

    const page = await mountSuspended(SessionPage, { route: `/s/${path}` })

    expect(page.findAll('time')).toHaveLength(0)
    expect(page.findAll('input, [role="radio"]')).toHaveLength(0)
    expect(page.text()).not.toMatch(/Leute|abgestimmt|Stimme/)
  })

  it('shows the generic invalid page for an invalid, rotated or deleted link', async () => {
    const path = link('Yy8Yy8Yy8Yy8')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      },
    })

    const page = await mountSuspended(SessionPage, { route: `/s/${path}` })

    expect(page.get('h1').text()).toBe('Link ungültig')
  })
})

describe('the Invite link, signed in', () => {
  beforeEach(() => signInAs(kitty))

  it('joins the Session and moves on to the Session link, with a toast', async () => {
    const path = link('Xx7Xx7Xx7Xx7')
    const joined = vi.fn()
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => {
        joined()
        return { slug: 'freitags-zocken-k7q2', joined: true }
      },
    })

    await mountSuspended(SessionPage, { route: `/s/${path}` })

    await vi.waitFor(() => expect(joined).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe('/s/freitags-zocken-k7q2'))
    expect(useToast().toasts.value.map(toast => toast.text)).toContain('Du bist drin! Du sitzt erstmal auf der Bench.')
  })

  it('says the Session is deleted to a former Member', async () => {
    const path = link('Ww6Ww6Ww6Ww6')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
      },
    })

    const page = await mountSuspended(SessionPage, { route: `/s/${path}` })

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Session gelöscht'))
  })

  it('shows the generic invalid page when the link no longer leads anywhere', async () => {
    const path = link('Vv5Vv5Vv5Vv5')
    registerEndpoint(`/api/invite/${path}`, {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      },
    })

    const page = await mountSuspended(SessionPage, { route: `/s/${path}` })

    await vi.waitFor(() => expect(page.get('h1').text()).toBe('Link ungültig'))
  })
})

describe('the Session link of a deleted Session', () => {
  beforeEach(() => signInAs(kitty))

  it('says the Session is deleted to a former Member', async () => {
    registerEndpoint('/api/s/geloescht-k7q2', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
      },
    })

    const page = await mountSuspended(SessionPage, { route: '/s/geloescht-k7q2' })

    expect(page.get('h1').text()).toBe('Session gelöscht')
  })
})

describe('sign-in for an Invite link', () => {
  beforeEach(() => signInAs(null))

  it('names the Host and the Session in the notice', async () => {
    const path = link('Uu4Uu4Uu4Uu4')
    registerEndpoint(`/api/invite/${path}`, { method: 'GET', handler: () => preview })

    const page = await mountSuspended(SignInPage, { route: `/anmelden?redirect=${encodeURIComponent(`/s/${path}`)}` })

    await vi.waitFor(() => expect(page.text()).toContain('Sanne hat dich zu Freitags-Zocken eingeladen.'))
  })
})
