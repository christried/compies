import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import SessionPage from '~/pages/s/[slug].vue'
import { kitty, signInAs } from './auth'

// Saturday 24 Oct 2026, 20:00 and 21:30 in Berlin (CEST).
const slots = [
  { id: 'b', startsAt: '2026-10-24T19:30:00.000Z' },
  { id: 'a', startsAt: '2026-10-24T18:00:00.000Z' },
]

describe('the Session link', () => {
  beforeEach(() => signInAs(kitty))

  it('shows the name, the Phase and the Slots in time order, read-only', async () => {
    registerEndpoint('/api/s/freitags-zocken-k7q2', {
      method: 'GET',
      handler: () => ({
        session: { slug: 'freitags-zocken-k7q2', name: 'Freitags-Zocken', phase: 'poll', dateMode: 'poll', startsAt: null, isHost: false },
        slots: [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      }),
    })

    const page = await mountSuspended(SessionPage, { route: '/s/freitags-zocken-k7q2' })

    expect(page.get('h1').text()).toBe('Freitags-Zocken')
    expect(page.text()).toContain('Terminumfrage')
    const times = page.findAll('time').map(time => time.text())
    expect(times).toEqual(['Sa 24.10.', '20:00', 'Sa 24.10.', '21:30'])
    expect(page.findAll('input, [role="radio"]')).toHaveLength(0)
  })

  it('shows the set Date for a direct Session', async () => {
    registerEndpoint('/api/s/abend-k7q2', {
      method: 'GET',
      handler: () => ({
        session: { slug: 'abend-k7q2', name: 'Abend', phase: 'date_set', dateMode: 'direct', startsAt: '2026-10-24T18:00:00.000Z', isHost: true },
        slots: [],
      }),
    })

    const page = await mountSuspended(SessionPage, { route: '/s/abend-k7q2' })

    expect(page.text()).toContain('Termin steht: Sa 24.10. 20:00 Uhr')
    expect(page.text()).toContain('Termin steht')
  })

  it('shows the generic not-found page for a Session the User is not a Member of', async () => {
    registerEndpoint('/api/s/geheim-k7q2', {
      method: 'GET',
      handler: () => {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      },
    })

    const page = await mountSuspended(SessionPage, { route: '/s/geheim-k7q2' })

    expect(page.get('h1').text()).toBe('Hier ist nix. Nicht mal ein Dino.')
  })
})
