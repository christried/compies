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

describe('HubNav', () => {
  beforeEach(() => signInAs(kitty))

  it('marks the item of the current area as the current page', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header' }, route: '/bibliothek' })

    expect(link(nav, 'Bibliothek').attributes('aria-current')).toBe('page')
    expect(link(nav, 'Sessions').attributes('aria-current')).toBeUndefined()
  })

  it('marks Sessions as current on Home', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'tabs' }, route: '/' })

    expect(link(nav, 'Sessions').attributes('aria-current')).toBe('page')
  })

  it('flags unbuilt areas as Baustelle, with a tape marker, and leaves Sessions alone', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header' }, route: '/' })

    for (const label of ['Archiv', 'Bibliothek', 'Profil']) {
      expect(link(nav, label).attributes('aria-description')).toBe('Baustelle')
      expect(link(nav, label).find('[title="Baustelle"]').exists()).toBe(true)
    }
    expect(link(nav, 'Sessions').attributes('aria-description')).toBeUndefined()
    expect(link(nav, 'Sessions').find('[title="Baustelle"]').exists()).toBe(false)
  })

  it('shows Admin to platform admins only', async () => {
    const user = await mountSuspended(HubNav, { props: { layout: 'header' }, route: '/' })
    const admin = await mountSuspended(HubNav, { props: { layout: 'header', isAdmin: true }, route: '/' })

    expect(user.findAll('a').map(a => a.text())).toEqual(['Sessions', 'Archiv', 'Bibliothek', 'Profil'])
    expect(link(admin, 'Admin').attributes('href')).toBe('/admin')
  })
})
