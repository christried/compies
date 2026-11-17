import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import AppShell from '~/components/AppShell.vue'
import AppSheet from '~/components/AppSheet.vue'
import { kitty, signInAs } from './auth'

// The registry of open layers (#647): the open state of sheets, dialogs and menus is private to each component, so the Tour reads whether
// the page is calm from one count that every dialog and dropdown menu adds itself to while it is open.

const busy = () => useOpenLayers().busy.value

beforeEach(() => {
  useState('open-layers').value = 0
  document.body.innerHTML = ''
})

describe('useOpenLayers', () => {
  it('is busy while a sheet is open and not when it closes', async () => {
    const sheet = await mountSuspended(AppSheet, { props: { open: false, title: 'Host-Steuerung' } })
    expect(busy()).toBe(false)

    await sheet.setProps({ open: true })
    expect(busy()).toBe(true)

    await sheet.setProps({ open: false })
    expect(busy()).toBe(false)
  })

  it('counts a sheet that is mounted open', async () => {
    await mountSuspended(AppSheet, { props: { open: true, title: 'Host-Steuerung' } })

    expect(busy()).toBe(true)
  })

  it('stays busy while one of two layers is open', async () => {
    const first = await mountSuspended(AppSheet, { props: { open: true, title: 'Eins' } })
    const second = await mountSuspended(AppSheet, { props: { open: true, title: 'Zwei' } })

    await first.setProps({ open: false })
    expect(busy()).toBe(true)

    await second.setProps({ open: false })
    expect(busy()).toBe(false)
  })

  it('is not busy once a sheet that was open is removed from the page', async () => {
    const sheet = await mountSuspended(AppSheet, { props: { open: true, title: 'Host-Steuerung' } })
    expect(busy()).toBe(true)

    sheet.unmount()

    expect(busy()).toBe(false)
  })

  it('is busy while the avatar menu is open and not after Escape', async () => {
    signInAs(kitty)
    const page = await mountSuspended(AppShell, { props: { kind: 'hub' }, route: '/', attachTo: document.body })
    expect(busy()).toBe(false)

    await page.get('button[aria-label="Konto von Kitty"]').trigger('click')
    expect(busy()).toBe(true)

    await page.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(busy()).toBe(false)
  })
})
