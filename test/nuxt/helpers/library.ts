import type { mountSuspended } from '@nuxt/test-utils/runtime'
import { expect, vi } from 'vitest'
import type { GameView } from '~~/shared/game'
import { kitty } from '../auth'

// The fixtures and the wait of the library tests (#142, #173, #369): shared by library.test.ts and library-paging.test.ts.

export const host = { ...kitty, canHost: true }

export function game(overrides: Partial<GameView>): GameView {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    name: 'Mario Kart',
    imageUrl: null,
    youtubeId: null,
    clipStart: 0,
    clipLength: 30,
    playersMin: null,
    playersMax: null,
    suitabilities: [],
    createdBy: { id: kitty.id, name: 'Sanne' },
    createdAt: '2026-01-15T10:00:00.000Z',
    canEdit: true,
    notes: null,
    tags: [],
    price: null,
    ...overrides,
  }
}

export async function settle(page: Awaited<ReturnType<typeof mountSuspended>>) {
  await vi.waitFor(() => expect(page.find('[aria-busy="true"]').exists()).toBe(false))
}
