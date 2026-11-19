import { LayoutGrid } from '@lucide/vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { TABS, useEventTabs, type EventTabRow } from '~/composables/useEventTabs'
import type { useEventRoom } from '~/composables/useEventRoom'
import { restoreScreen, stubScreen } from './event-page'

// The Event page's phone tabs and side panel tabs (#257, B2): one table says which tabs exist, and the state of the views
// lives in useEventTabs. A phone counts what the Activity feed receives while the Event view is shown; the side panel from md
// up shows the feed and counts nothing. The room is a fake that keeps its handlers, so a test fires `activity.added`.

function fakeRoom() {
  const handlers = new Map<string, () => void>()
  const on = (type: string, handler: () => void) => {
    handlers.set(type, handler)
    return () => void handlers.delete(type)
  }
  return {
    fire: (type: string) => handlers.get(type)?.(),
    // The real room's `on` is typed by its messages; the test fires without one, so the fake is cast to that type.
    room: { on } as unknown as Pick<ReturnType<typeof useEventRoom>, 'on'>,
  }
}

async function setUp() {
  const { fire, room } = fakeRoom()
  let tabs: ReturnType<typeof useEventTabs> | undefined
  await mountSuspended(defineComponent({
    setup() {
      tabs = useEventTabs(room)
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
  it('lists Event, Tabelle and Aktivität on a phone, and Chat, Aktivität and Tabelle in the side panel (#274, #761)', async () => {
    stubScreen(false)
    const { tabs } = await setUp()

    expect(tabs().tabs.value.map(item => item.key)).toEqual(['event', 'standings', 'activity'])
    expect(tabs().tabs.value.map(item => item.label)).toEqual(['Event', 'Tabelle', 'Aktivität'])
    expect(tabs().panelTabs.value.map(item => item.key)).toEqual(['chat', 'activity', 'standings'])
  })

  it('opens the side panel on the Chat (#761)', async () => {
    stubScreen(true)
    const { tabs } = await setUp()

    expect(tabs().panelTab.value).toBe('chat')
  })

  it('selects the Tabelle view without clearing the unread count of the feed, and gives it no badge (#274)', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added')
    room.fire('activity.added')
    tabs().selectView('standings')
    room.fire('activity.added')

    expect(tabs().activeView.value).toBe('standings')
    expect(tabs().unread.value).toBe(3)
    expect(tabs().tabs.value[1]).toMatchObject({ key: 'standings', current: true })
    expect(tabs().tabs.value[1]).not.toHaveProperty('badge')
    expect(tabs().tabs.value[2]).toMatchObject({ key: 'activity', badge: 3, current: false })
  })

  it('counts what the feed receives while the Event view is shown, and shows it as a badge', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added')
    room.fire('activity.added')

    expect(tabs().unread.value).toBe(2)
    expect(tabs().tabs.value[2]).toMatchObject({ key: 'activity', badge: 2, current: false })
    expect(tabs().tabs.value[2]!.ariaLabel).toMatch(/2/)
  })

  it('stops counting while the Activity view is shown, and clears the count when it is selected', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added')
    tabs().selectView('activity')
    room.fire('activity.added')

    expect(tabs().activeView.value).toBe('activity')
    expect(tabs().tabs.value[2]).toMatchObject({ badge: 0, current: true, ariaLabel: undefined })

    tabs().selectView('event')
    room.fire('activity.added')
    expect(tabs().unread.value).toBe(1)
  })

  it('selects the Event view for a key it does not know', async () => {
    stubScreen(false)
    const { tabs } = await setUp()

    tabs().selectView('activity')
    tabs().selectView('nonsense')

    expect(tabs().activeView.value).toBe('event')
  })

  it('counts nothing in the side panel layout, and starts a narrow screen at zero', async () => {
    const setWide = stubScreen(true)
    const { room, tabs } = await setUp()

    room.fire('activity.added')
    expect(tabs().unread.value).toBe(0)

    setWide(false)
    await nextTick()
    expect(tabs().unread.value).toBe(0)
    room.fire('activity.added')
    expect(tabs().unread.value).toBe(1)
  })

  it('clears the count when the screen becomes wide', async () => {
    const setWide = stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added')
    setWide(true)
    await nextTick()

    expect(tabs().unread.value).toBe(0)
    expect(tabs().wide.value).toBe(true)
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
      ['activity', { phone: 2, panel: 1 }],
      ['chat', { phone: null, panel: 0 }],
    ])
  })

  it('does not compile a row that has no place for a surface', () => {
    // @ts-expect-error a row needs a place for the phone and for the panel
    const row: EventTabRow = { key: 'event', labelKey: 'event.tabs.event', icon: LayoutGrid, place: { phone: 0 } }
    expect(row.key).toBe('event')
  })
})
