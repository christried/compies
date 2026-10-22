import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import InviteLinkCard from '~/components/InviteLinkCard.vue'
import { useToast } from '~/composables/useToast'

const url = 'http://localhost/s/freitags-zocken-k7q2-AbCdEfGhIjKl'

describe('InviteLinkCard', () => {
  it('shows the link and copies it to the clipboard with a confirmation', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    useState('toasts').value = []
    const page = await mountSuspended(InviteLinkCard, { props: { url } })

    expect(page.text()).toContain(url)
    await page.get('button').trigger('click')

    expect(writeText).toHaveBeenCalledWith(url)
    expect(useToast().toasts.value.at(-1)?.text).toBe('Link kopiert')
  })

  it('shows „Kopiert“ on the button once copied, until the link changes (#1 story 30)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true })
    const page = await mountSuspended(InviteLinkCard, { props: { url } })
    expect(page.get('button').text()).toBe('Link kopieren')

    await page.get('button').trigger('click')
    await vi.waitFor(() => expect(page.get('button').text()).toBe('Kopiert'))

    await page.setProps({ url: 'http://localhost/s/freitags-zocken-k7q2-ZyXwVuTsRqPo' })
    expect(page.get('button').text()).toBe('Link kopieren')
  })
})
