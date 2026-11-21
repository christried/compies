import { LayoutGrid } from '@lucide/vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { TABS, useEventTabs, type EventTabRow } from '~/composables/useEventTabs'
import type { useEventRoom } from '~/composables/useEventRoom'
import { MEMBER_TOUR } from '~~/shared/tour'
import { restoreScreen, stubScreen } from './event-page'

// The Event page's phone tabs and side panel tabs (#257, B2): one table says which tabs exist, and the state of the views
// lives in useEventTabs. A phone counts what the Activity feed receives while the Event view is shown; the side panel from md
// up counts by the same rule (#778). The room is a fake that keeps its handlers, so a test fires `activity.added`.

function fakeRoom() {
  const handlers = new Map<string, (payload?: unknown) => void>()
  const on = (type: string, handler: (payload?: unknown) => void) => {
    handlers.set(type, handler)
    return () => void handlers.delete(type)
  }
  return {
    fire: (type: string, payload?: unknown) => handlers.get(type)?.(payload),
    // The real room's `on` is typed by its messages; the test fires without one, so the fake is cast to that type.
    room: { on } as unknown as Pick<ReturnType<typeof useEventRoom>, 'on'>,
  }
}

/** The payload of a room `activity.added`: only the type and the actor matter to the counts (#951). */
function added(type: string, actorId: string | null = 'other') {
  return { entry: { type, actor: actorId === null ? null : { id: actorId, name: actorId } } }
}

async function setUp(viewer: string | undefined = 'me') {
  const { fire, room } = fakeRoom()
  let tabs: ReturnType<typeof useEventTabs> | undefined
  await mountSuspended(defineComponent({
    setup() {
      tabs = useEventTabs(room, () => viewer)
      return () => null
    },
  }))
  await nextTick()
  const current = () => tabs!
  return { room: { fire }, tabs: current }
}

afterEach(() => {
  restoreScreen()
})

describe('useEventTabs', () => {
  it('lists Event, Tabelle, Chat and Aktivität on a phone, and Chat, Aktivität and Tabelle in the side panel (#274, #761, #765)', async () => {
    stubScreen(false)
    const { tabs } = await setUp()

    expect(tabs().tabs.value.map(item => item.key)).toEqual(['event', 'standings', 'chat', 'activity'])
    expect(tabs().tabs.value.map(item => item.label)).toEqual(['Event', 'Tabelle', 'Chat', 'Aktivität'])
    expect(tabs().panelTabs.value.map(item => item.key)).toEqual(['chat', 'activity', 'standings'])
  })

  it('has a side panel tab for every panelTab the Tour names, so a renamed tab breaks the Tour\'s hook (#766)', async () => {
    stubScreen(true)
    const { tabs } = await setUp()
    const named = MEMBER_TOUR.flatMap(step => step.panelTab ?? [])

    expect(named.length).toBeGreaterThan(0)
    for (const key of named) expect(tabs().panelTabs.value.map(item => item.key)).toContain(key)
  })

  it('opens the side panel on the Chat (#761)', async () => {
    stubScreen(true)
    const { tabs } = await setUp()

    expect(tabs().panelTab.value).toBe('chat')
  })

  it('selects the Tabelle view without clearing the unread count of the feed, and shows the Tabelle no count of its own (#274, #951)', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('member_joined'))
    room.fire('activity.added', added('member_joined'))
    tabs().selectView('standings')
    room.fire('activity.added', added('member_joined'))

    expect(tabs().activeView.value).toBe('standings')
    expect(tabs().unread.activity).toBe(3)
    expect(tabs().tabs.value[1]).toMatchObject({ key: 'standings', current: true, badge: 0, ariaLabel: undefined })
    expect(tabs().tabs.value[3]).toMatchObject({ key: 'activity', badge: 3, current: false })
  })

  it('counts what the feed receives while the Event view is shown, and shows it as a badge', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('member_joined'))
    room.fire('activity.added', added('member_joined'))

    expect(tabs().unread.activity).toBe(2)
    expect(tabs().tabs.value[3]).toMatchObject({ key: 'activity', badge: 2, current: false })
    expect(tabs().tabs.value[3]!.ariaLabel).toMatch(/2/)
  })

  it('stops counting while the Activity view is shown, and clears the count when it is selected', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('member_joined'))
    tabs().selectView('activity')
    room.fire('activity.added', added('member_joined'))

    expect(tabs().activeView.value).toBe('activity')
    expect(tabs().tabs.value[3]).toMatchObject({ badge: 0, current: true, ariaLabel: undefined })

    tabs().selectView('event')
    room.fire('activity.added', added('member_joined'))
    expect(tabs().unread.activity).toBe(1)
  })

  it('selects the Event view for a key it does not know', async () => {
    stubScreen(false)
    const { tabs } = await setUp()

    tabs().selectView('activity')
    tabs().selectView('nonsense')

    expect(tabs().activeView.value).toBe('event')
  })

  it('counts the feed in the side panel, which opens on the Chat, and keeps that count when the screen narrows (#778)', async () => {
    const setWide = stubScreen(true)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('member_joined'))
    expect(tabs().unread.activity).toBe(1)

    setWide(false)
    await nextTick()
    expect(tabs().unread.activity).toBe(1)
    room.fire('activity.added', added('member_joined'))
    expect(tabs().unread.activity).toBe(2)
  })

  it('clears the count of the tab the screen shows when it becomes wide, and keeps the other (#778)', async () => {
    const setWide = stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('member_joined'))
    room.fire('chat.added', { message: { writerId: 'other' } })
    setWide(true)
    await nextTick()

    expect(tabs().unread.activity).toBe(1)
    expect(tabs().unread.chat).toBe(0)
    expect(tabs().wide.value).toBe(true)
  })

  // The phone's Chat counts by the rule of the feed (#765): one function decides, and the two tabs count apart.
  describe('the Chat on a phone (#765)', () => {
    it('counts what the Chat receives while another view is shown, as a badge and an accessible name', async () => {
      stubScreen(false)
      const { room, tabs } = await setUp()

      room.fire('chat.added', { message: { writerId: 'other' } })
      room.fire('chat.added', { message: { writerId: 'other' } })

      expect(tabs().unread.chat).toBe(2)
      expect(tabs().tabs.value[2]).toMatchObject({ key: 'chat', badge: 2, ariaLabel: 'Chat, 2 neu' })
      expect(tabs().tabs.value[2]).not.toHaveProperty('tour')
    })

    it('does not count the viewer\'s own Message, and counts the next one of another writer', async () => {
      stubScreen(false)
      const { room, tabs } = await setUp()

      room.fire('chat.added', { message: { writerId: 'me' } })
      expect(tabs().unread.chat).toBe(0)

      room.fire('chat.added', { message: { writerId: 'other' } })
      expect(tabs().unread.chat).toBe(1)
    })

    it('counts the two tabs apart, and opening the Chat clears only its own count', async () => {
      stubScreen(false)
      const { room, tabs } = await setUp()

      room.fire('activity.added', added('member_joined'))
      room.fire('chat.added', { message: { writerId: 'other' } })
      room.fire('chat.added', { message: { writerId: 'other' } })
      expect(tabs().unread).toMatchObject({ activity: 1, chat: 2 })

      tabs().selectView('chat')
      expect(tabs().unread).toMatchObject({ activity: 1, chat: 0 })
      expect(tabs().tabs.value[2]).toMatchObject({ badge: 0, current: true, ariaLabel: undefined })

      room.fire('chat.added', { message: { writerId: 'other' } })
      expect(tabs().unread.chat).toBe(0)
      tabs().selectView('event')
      room.fire('chat.added', { message: { writerId: 'other' } })
      expect(tabs().unread.chat).toBe(1)
    })

    it('counts no Message while the panel shows the Chat', async () => {
      stubScreen(true)
      const { room, tabs } = await setUp()

      room.fire('chat.added', { message: { writerId: 'other' } })

      expect(tabs().unread.chat).toBe(0)
    })

    it('does not change a count for a deleted Message', async () => {
      stubScreen(false)
      const { room, tabs } = await setUp()

      room.fire('chat.added', { message: { writerId: 'other' } })
      room.fire('chat.deleted', { id: 'x', deletedBy: 'other' })

      expect(tabs().unread.chat).toBe(1)
    })
  })
})

// The side panel counts by the rule of the phone's bar (#778): one function decides which tab is shown, on either layout.
describe('the side panel counts (#778)', () => {
  it('gives the feed a badge and an accessible name, and Tabelle none for an entry that is no Result (#951)', async () => {
    stubScreen(true)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('member_joined'))

    expect(tabs().panelTabs.value[1]).toMatchObject({ key: 'activity', badge: 1, ariaLabel: 'Aktivität, 1 neu' })
    expect(tabs().panelTabs.value[0]).toMatchObject({ key: 'chat', badge: 0, ariaLabel: undefined })
    expect(tabs().panelTabs.value[2]).toMatchObject({ key: 'standings', badge: 0, ariaLabel: undefined })
  })

  it('clears the count of a tab the panel switches to, at once, and counts the Chat meanwhile', async () => {
    stubScreen(true)
    const { room, tabs } = await setUp()
    room.fire('activity.added', added('member_joined'))

    tabs().panelTab.value = 'activity'

    expect(tabs().unread.activity).toBe(0)
    room.fire('activity.added', added('member_joined'))
    expect(tabs().unread.activity).toBe(0)
    room.fire('chat.added', { message: { writerId: 'other' } })
    expect(tabs().unread.chat).toBe(1)
  })

  it('clears the Chat\'s count when the panel shows it again, as the Tour\'s restore does', async () => {
    stubScreen(true)
    const { room, tabs } = await setUp()
    tabs().panelTab.value = 'activity'
    room.fire('chat.added', { message: { writerId: 'other' } })
    expect(tabs().unread.chat).toBe(1)

    tabs().panelTab.value = 'chat'

    expect(tabs().unread.chat).toBe(0)
  })

  it('does not count the viewer\'s own Message', async () => {
    stubScreen(true)
    const { room, tabs } = await setUp('me')
    tabs().panelTab.value = 'activity'

    room.fire('chat.added', { message: { writerId: 'me' } })

    expect(tabs().unread.chat).toBe(0)
  })
})

// The Tabelle counts by the rule of the feed and the Chat (#951): a Result entered or corrected that arrives while another tab is
// shown counts one, unless the viewer entered it (the Host). A Result's entry has its actor; the other entries change no Standings.
describe('the Tabelle counts Results (#951)', () => {
  it('counts a Result entered and a Correction on a phone, as a badge and an accessible name', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('result_entered', 'host'))
    room.fire('activity.added', added('result_corrected', 'host'))

    expect(tabs().unread.standings).toBe(2)
    expect(tabs().tabs.value[1]).toMatchObject({ key: 'standings', badge: 2, ariaLabel: 'Tabelle, 2 neu' })
  })

  it('does not count an entry that is no Result, nor a Result the viewer entered', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp('host')

    room.fire('activity.added', added('member_joined', 'other'))
    room.fire('activity.added', added('game_set', null))
    room.fire('activity.added', added('result_entered', 'host'))
    room.fire('activity.added', added('result_corrected', 'host'))

    expect(tabs().unread.standings).toBe(0)
    expect(tabs().tabs.value[1]).toMatchObject({ key: 'standings', badge: 0, ariaLabel: undefined })
  })

  it('counts nothing while the phone shows the Tabelle, and clears its count when it is selected', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('result_entered', 'host'))
    tabs().selectView('standings')
    expect(tabs().unread.standings).toBe(0)
    room.fire('activity.added', added('result_entered', 'host'))
    expect(tabs().tabs.value[1]).toMatchObject({ badge: 0, current: true, ariaLabel: undefined })

    tabs().selectView('event')
    room.fire('activity.added', added('result_corrected', 'host'))
    expect(tabs().unread.standings).toBe(1)
  })

  it('counts in the side panel while another tab is shown, and clears when the panel switches to the Tabelle', async () => {
    stubScreen(true)
    const { room, tabs } = await setUp()

    room.fire('activity.added', added('result_entered', 'host'))
    expect(tabs().panelTabs.value[2]).toMatchObject({ key: 'standings', badge: 1, ariaLabel: 'Tabelle, 1 neu' })

    tabs().panelTab.value = 'standings'
    expect(tabs().unread.standings).toBe(0)
    room.fire('activity.added', added('result_entered', 'host'))
    expect(tabs().unread.standings).toBe(0)
  })

  it('clears the Tabelle\'s count when a resize makes the shown tab the Tabelle', async () => {
    const setWide = stubScreen(true)
    const { room, tabs } = await setUp()
    tabs().selectView('standings')
    room.fire('activity.added', added('result_entered', 'host'))
    expect(tabs().unread.standings).toBe(1)

    setWide(false)
    await nextTick()

    expect(tabs().unread.standings).toBe(0)
  })

  it('counts nothing at page load', async () => {
    stubScreen(false)
    const { tabs } = await setUp()

    expect(tabs().unread.standings).toBe(0)
    expect(tabs().tabs.value[1]).toMatchObject({ key: 'standings', badge: 0, ariaLabel: undefined })
  })
})

// The tabs table gives each tab a place on each surface (#756): a position, or null when the tab is not on that surface. The
// order of a surface comes from its places, so a row without a place or two rows at one place would leave the order to chance.
describe('the tabs table (#756)', () => {
  it('gives every row a place for both surfaces, each a position or null', () => {
    for (const row of TABS) {
      expect(Object.keys(row.place).sort()).toEqual(['panel', 'phone'])
      for (const at of [row.place.phone, row.place.panel]) {
        expect(at === null || typeof at === 'number').toBe(true)
      }
    }
  })

  it('gives no two rows the same position on one surface', () => {
    for (const surface of ['phone', 'panel'] as const) {
      const places = TABS.map(row => row.place[surface]).filter(at => at !== null)
      expect(new Set(places).size).toBe(places.length)
    }
  })

  it('pins where each tab sits on each surface', () => {
    expect(TABS.map(row => [row.key, row.place])).toEqual([
      ['event', { phone: 0, panel: null }],
      ['standings', { phone: 1, panel: 2 }],
      ['activity', { phone: 3, panel: 1 }],
      ['chat', { phone: 2, panel: 0 }],
    ])
  })

  it('does not compile a row that has no place for a surface', () => {
    // @ts-expect-error a row needs a place for the phone and for the panel
    const row: EventTabRow = { key: 'event', labelKey: 'event.tabs.event', icon: LayoutGrid, place: { phone: 0 } }
    expect(row.key).toBe('event')
  })
})
