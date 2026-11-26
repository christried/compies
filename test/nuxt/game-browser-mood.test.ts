import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import GameBrowser from '~/components/GameBrowser.vue'
import { NO_FILTERS, type GameView } from '~~/shared/game'
import { signInAs } from './auth'
import { game, host, settle } from './helpers/library'

// The head on the library search's empty states (#819): a search without a hit shows the confused head, the other states keep the plain one.

let list: GameView[] = []
registerEndpoint('/api/games', { method: 'GET', handler: () => ({ games: list, tagsInUse: [] }) })

const mounted: VueWrapper[] = []
afterEach(() => {
  mounted.splice(0).forEach(page => page.unmount())
})

beforeEach(async () => {
  signInAs(host)
  list = [game({ id: '00000000-0000-4000-8000-0000000000a1', name: 'Mario Kart' })]
  await clearNuxtData('games')
  useState('game-library').value = null
})

async function mountBrowser(q: string) {
  const page = await mountSuspended(GameBrowser, { props: { compact: true, filters: { ...NO_FILTERS, q } } })
  mounted.push(page)
  await settle(page)
  return page
}

describe('GameBrowser moods (#819)', () => {
  it('shows the confused head on a search without a hit', async () => {
    const page = await mountBrowser('Zelda')

    expect(page.find('li').exists()).toBe(false)
    expect(page.get('[data-mood]').attributes('data-mood')).toBe('confused')
  })

  it('shows the head without a mood on an empty library', async () => {
    list = []
    const page = await mountBrowser('')

    expect(page.find('.compibert').exists()).toBe(true)
    expect(page.find('[data-mood]').exists()).toBe(false)
  })

  it('shows no head on the results', async () => {
    const page = await mountBrowser('Mario')

    expect(page.findAll('li')).toHaveLength(1)
    expect(page.find('[data-mood]').exists()).toBe(false)
  })
})
