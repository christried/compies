import { Volume2 } from '@lucide/vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import SettingsRow from '~/components/SettingsRow.vue'

// SettingsRow (02-components § SettingsRow, #400): one setting on the Profil page's card „Einstellungen“. A plain button
// stands in for the control, so the row's contract is tested on its own.

type Ids = { titleId: string, descriptionId: string | undefined }
const control = (ids: Ids) => h('button', { 'type': 'button', 'role': 'switch', 'aria-labelledby': ids.titleId, 'aria-describedby': ids.descriptionId })
const description = 'Clips starten mit Ton. Wird auf diesem Gerät gemerkt.'
const mount = (props: { title: string, description?: string } = { title: 'Ton', description }) =>
  mountSuspended(SettingsRow, { props: { icon: Volume2, ...props }, slots: { default: control } })

describe('SettingsRow', () => {
  it('shows the title and the description, with the icon as decoration', async () => {
    const page = await mount()

    expect(page.text()).toContain('Ton')
    expect(page.text()).toContain(description)
    expect(page.get('[aria-hidden="true"]').find('svg').exists()).toBe(true)
  })

  it('renders the control in its slot', async () => {
    const page = await mount()

    expect(page.find('[role="switch"]').exists()).toBe(true)
  })

  it('ties the title and the description to the control for a screen reader', async () => {
    const page = await mount()

    const sw = page.get('[role="switch"]')
    expect(page.get(`[id="${sw.attributes('aria-labelledby')}"]`).text()).toBe('Ton')
    expect(page.get(`[id="${sw.attributes('aria-describedby')}"]`).text()).toBe(description)
  })

  it('describes nothing without a description', async () => {
    const page = await mount({ title: 'Ton' })

    expect(page.get('[role="switch"]').attributes('aria-describedby')).toBeUndefined()
    expect(page.text()).toBe('Ton')
  })

  it('gives each row its own ids', async () => {
    const TwoRows = defineComponent({
      setup: () => () => h('div', [
        h(SettingsRow, { icon: Volume2, title: 'Ton' }, { default: control }),
        h(SettingsRow, { icon: Volume2, title: 'Darstellung' }, { default: control }),
      ]),
    })
    const page = await mountSuspended(TwoRows)

    const [first, second] = page.findAll('[role="switch"]').map(sw => sw.attributes('aria-labelledby'))
    expect(first).not.toBe(second)
    expect(page.get(`[id="${first}"]`).text()).toBe('Ton')
    expect(page.get(`[id="${second}"]`).text()).toBe('Darstellung')
  })
})
