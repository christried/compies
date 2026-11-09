import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import BackLink from '~/components/BackLink.vue'
import { kitty, signInAs } from './auth'

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

describe('BackLink look (#353)', () => {
  beforeEach(() => signInAs(null))

  it('is a 44 px hit area', async () => {
    const page = await mountSuspended(BackLink, { props: { to: '/', label: 'Zurück' } })

    expect(page.get('a').classes()).toContain('min-h-11')
  })

  it('reads as the jump link: 14 / 800, full ink, underlined, not the muted small style', async () => {
    const page = await mountSuspended(BackLink, { props: { to: '/', label: 'Zurück' } })
    const classes = page.get('a').classes()

    expect(classes).toEqual(expect.arrayContaining(['text-[14px]', 'font-extrabold', 'text-ink', 'underline']))
    expect(classes).not.toContain('text-ink-2')
  })

  it('names the destination and the word, signed out and signed in', async () => {
    const named = await mountSuspended(BackLink, { props: { to: '/bibliothek', label: 'Bibliothek' } })
    expect(named.get('a').text()).toBe('Bibliothek')
    expect(named.get('a').attributes('href')).toBe('/bibliothek')

    const signedOut = await mountSuspended(BackLink)
    expect(signedOut.get('a').text()).toBe('Zurück')
    expect(signedOut.get('a').attributes('href')).toBe('/anmelden')

    signInAs(kitty)
    const signedIn = await mountSuspended(BackLink)
    expect(signedIn.get('a').attributes('href')).toBe('/')
  })

  it('draws its arrow as decoration', async () => {
    const page = await mountSuspended(BackLink, { props: { to: '/', label: 'Zurück' } })

    expect(page.find('span[aria-hidden="true"] svg').exists()).toBe(true)
  })
})
