import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEARD_MS } from '~/composables/useBoardPlaces'
import type { Place } from '~~/shared/board'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { LARSI, memberView } from './event-page'

// useBoardPlaces (#237, review 1.4 A8): „the room says X now, the refetch confirms it or doesn't“, without the board.
// The composable needs a component to live in (i18n, the mutation); the harness only holds it.
const at = (zone: 'bench' | 'stands' | 'team', team: number | null = null) => memberView({ id: LARSI, name: 'Larsi', zone, team })

function harness(initial = at('bench')) {
  const members = ref([initial])
  const handlers: ((message: unknown) => void)[] = []
  const room = {
    on: (_type: string, handler: (message: never) => void) => {
      handlers.push(handler as (message: unknown) => void)
      return () => undefined
    },
  }
  let places!: ReturnType<typeof useBoardPlaces>
  const Harness = defineComponent({
    setup() {
      places = useBoardPlaces({ slug: ref('places'), members: () => members.value, room, refresh: async () => undefined, people: { nameOf: () => '', teamName: () => '' } })
      return () => null
    },
  })
  return {
    mount: () => mountSuspended(Harness),
    members,
    get places() { return places },
    hear(to: Place) {
      for (const handler of handlers) handler(envelope({ type: 'member.moved', userId: LARSI, from: { zone: 'bench' }, to, by: LARSI } satisfies RoomMessage, Date.now()))
    },
    where: () => places.placeOf(LARSI),
  }
}

describe('useBoardPlaces', () => {
  afterEach(() => vi.useRealTimers())

  it('draws the server\'s place, and the Bench for somebody it does not know', async () => {
    const board = harness(at('team', 2))
    await board.mount()

    expect(board.where()).toEqual({ zone: 'team', team: 2 })
    expect(board.places.placeOf('nobody')).toEqual({ zone: 'bench' })
  })

  it('draws a move the room announced at once, and keeps it when the refetch confirms it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const board = harness()
    await board.mount()

    board.hear({ zone: 'team', team: 1 })
    expect(board.where()).toEqual({ zone: 'team', team: 1 })
    board.members.value = [at('team', 1)]
    await nextTick()
    vi.advanceTimersByTime(HEARD_MS * 2)

    expect(board.where()).toEqual({ zone: 'team', team: 1 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops a move the refetch never confirms after 5 s, back to the server\'s place', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const board = harness()
    await board.mount()

    board.hear({ zone: 'stands' })
    vi.advanceTimersByTime(HEARD_MS - 1)
    expect(board.where()).toEqual({ zone: 'stands' })
    vi.advanceTimersByTime(1)

    expect(board.where()).toEqual({ zone: 'bench' })
  })

  it('counts the 5 s from the latest message about a Member', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const board = harness()
    await board.mount()

    board.hear({ zone: 'stands' })
    vi.advanceTimersByTime(HEARD_MS - 1000)
    board.hear({ zone: 'team', team: 2 })
    vi.advanceTimersByTime(HEARD_MS - 1)

    expect(board.where()).toEqual({ zone: 'team', team: 2 })
  })
})
