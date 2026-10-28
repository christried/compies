import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import BackLink from '~/components/BackLink.vue'
import { signInAs } from './auth'

// BackLink with a destination (N2): the page chrome of the setup, library and settings pages. Without `to` it goes back
// in history (the legal pages, legal-pages.test.ts).

describe('BackLink with a destination', () => {
  beforeEach(() => signInAs(null))

  it('links to the given page under the given words', async () => {
    const page = await mountSuspended(BackLink, { props: { to: '/bibliothek', label: 'Bibliothek' } })

    const link = page.get('a')
    expect(link.attributes('href')).toBe('/bibliothek')
    expect(link.text()).toBe('Bibliothek')
  })

  it('keeps its destination even when the visit came from elsewhere in the app', async () => {
    window.history.replaceState({ ...window.history.state, back: '/irgendwo' }, '')
    const page = await mountSuspended(BackLink, { props: { to: '/bibliothek', label: 'Bibliothek' } })

    expect(page.get('a').attributes('href')).toBe('/bibliothek')
  })

  it('says „Zurück“ when no label is given', async () => {
    const page = await mountSuspended(BackLink, { props: { to: '/' } })

    expect(page.get('a').text()).toBe('Zurück')
  })
})
