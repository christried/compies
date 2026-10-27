import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import HubNav from '~/components/HubNav.vue'
import { kitty, signInAs } from './auth'

function link(nav: VueWrapper, label: string) {
  const found = nav.findAll('a').find(a => a.text() === label)
  if (!found) throw new Error(`no nav item "${label}"`)
  return found
}

const labels = (nav: VueWrapper) => nav.findAll('a').map(a => a.text())

describe('HubNav', () => {
  beforeEach(() => signInAs(kitty))

  it('marks the item of the current area as the current page', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: true, isAdmin: false } }, route: '/bibliothek' })

    expect(link(nav, 'Bibliothek').attributes('aria-current')).toBe('page')
    expect(link(nav, 'Events').attributes('aria-current')).toBeUndefined()
  })

  it('marks Events as current on Home', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'tabs' }, route: '/' })

    expect(link(nav, 'Events').attributes('aria-current')).toBe('page')
  })

  it('flags unbuilt areas as Baustelle, with a tape marker, and leaves Events alone', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: true, isAdmin: false } }, route: '/' })

    for (const label of ['Archiv', 'Bibliothek', 'Profil']) {
      expect(link(nav, label).attributes('aria-description')).toBe('Baustelle')
      expect(link(nav, label).find('[title="Baustelle"]').exists()).toBe(true)
    }
    expect(link(nav, 'Events').attributes('aria-description')).toBeUndefined()
    expect(link(nav, 'Events').find('[title="Baustelle"]').exists()).toBe(false)
  })

  it('hides Bibliothek and Admin from a User without rights', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header' }, route: '/' })

    expect(labels(nav)).toEqual(['Events', 'Archiv', 'Profil'])
  })

  it('shows Bibliothek, and not Admin, to a User with the Host permission', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'tabs', viewer: { canHost: true, isAdmin: false } }, route: '/' })

    expect(labels(nav)).toEqual(['Events', 'Archiv', 'Bibliothek', 'Profil'])
  })

  it('shows Bibliothek and Admin to the Platform admin', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: false, isAdmin: true } }, route: '/' })

    expect(labels(nav)).toEqual(['Events', 'Archiv', 'Bibliothek', 'Profil', 'Admin'])
    expect(link(nav, 'Admin').attributes('href')).toBe('/admin')
  })

  it('shows Bibliothek to the Platform admin even when the Host flag is not set', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: false, isAdmin: true } }, route: '/' })

    expect(labels(nav)).toContain('Bibliothek')
  })
})
