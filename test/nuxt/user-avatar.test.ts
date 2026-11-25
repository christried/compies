import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UserAvatar from '~/components/UserAvatar.vue'

// The avatar of a person (DS People): the picture, or the initial. A Deleted User (#915, ADR 0020) has the neutral picture, an icon, in the same disc:
// no `<img>` and no letter, and the Team ring and the presence dot stay.

const mountAvatar = (props: Record<string, unknown>) => mountSuspended(UserAvatar, { props: { name: 'Anna', ...props } })

/** The disc of the avatar: the round element that carries the Team ring. */
const disc = (page: Awaited<ReturnType<typeof mountAvatar>>) => page.get('.bg-paper-2')

describe('UserAvatar', () => {
  it('draws the picture of a person who is not deleted, and the initial without one', async () => {
    const withPicture = await mountAvatar({ image: 'https://example.com/anna.png' })
    const without = await mountAvatar({ image: null })

    expect(withPicture.find('img').attributes('src')).toBe('https://example.com/anna.png')
    expect(without.find('img').exists()).toBe(false)
    expect(disc(without).text()).toBe('A')
    expect(disc(without).find('svg').exists()).toBe(false)
  })

  it('draws the neutral picture for a Deleted User: the icon, no `<img>` and no letter, whatever the name and the picture say', async () => {
    const page = await mountAvatar({ deleted: true, name: 'Gelöschtes Konto', image: 'https://example.com/anna.png' })

    expect(page.find('img').exists()).toBe(false)
    expect(disc(page).text()).toBe('')
    expect(disc(page).find('svg').exists()).toBe(true)
  })

  it('keeps the Team ring and the presence dot on the neutral picture', async () => {
    const page = await mountAvatar({ deleted: true, name: '', team: 3, online: true, size: 44 })

    expect(disc(page).attributes('style')).toContain('var(--cp-team-3)')
    expect(page.find('[data-presence="online"]').exists()).toBe(true)
  })

  it('sizes the icon to about half of the avatar', async () => {
    for (const size of [24, 80] as const) {
      const page = await mountAvatar({ deleted: true, name: '', size })

      expect(Number(disc(page).get('svg').attributes('width'))).toBe(Math.round(size / 2))
    }
  })
})
