import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useEventTabs } from '~/composables/useEventTabs'
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
  it('lists the Event tab and the Activity tab on a phone, and the Activity tab in the side panel', async () => {
    stubScreen(false)
    const { tabs } = await setUp()

    expect(tabs().tabs.value.map(item => item.key)).toEqual(['event', 'activity'])
    expect(tabs().panelTabs.value.map(item => item.key)).toEqual(['activity'])
  })

  it('counts what the feed receives while the Event view is shown, and shows it as a badge', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added')
    room.fire('activity.added')

    expect(tabs().unread.value).toBe(2)
    expect(tabs().tabs.value[1]).toMatchObject({ key: 'activity', badge: 2, current: false })
    expect(tabs().tabs.value[1]!.ariaLabel).toMatch(/2/)
  })

  it('stops counting while the Activity view is shown, and clears the count when it is selected', async () => {
    stubScreen(false)
    const { room, tabs } = await setUp()

    room.fire('activity.added')
    tabs().selectView('activity')
    room.fire('activity.added')

    expect(tabs().activeView.value).toBe('activity')
    expect(tabs().tabs.value[1]).toMatchObject({ badge: 0, current: true, ariaLabel: undefined })

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
