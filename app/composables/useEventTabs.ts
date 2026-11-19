import { History, LayoutGrid, MessageSquare, Trophy } from '@lucide/vue'
import type { Component } from 'vue'
import type { useEventRoom } from '~/composables/useEventRoom'
import { MD_QUERY } from '~/composables/useMediaQuery'
import type { TabBarItem } from '~/components/TabBar.vue'
import type { PanelTab } from '~/components/SidePanel.vue'

// The Event page's tabs (11-event-seite § TabBar and § SidePanel, #166): the Event page, the Standings („Tabelle“), the Activity feed or the Chat (#761). One table says
// which tabs exist and where they show: a phone's tab bar (`phone`), the side panel from md up (`panel`). A tab added to the
// table gets its item in both lists and its view in the page's template (#274 added „Tabelle“ this way). The feed is mounted once,
// in the side panel from md up and in its own view below; the wide layout is known after mount only, so nothing of the feed
// renders before. The Chat is in the side panel only until the phone gets its view (#765), so its place on the phone is `null`.

export type EventTabKey = 'event' | 'standings' | 'activity' | 'chat'

type Surface = 'phone' | 'panel'

/** One row of the table: its place on each surface, a position or `null` when the tab is not on that surface (#756). */
export interface EventTabRow {
  key: EventTabKey
  labelKey: string
  icon: Component
  place: Record<Surface, number | null>
}

export const TABS = [
  { key: 'event', labelKey: 'event.tabs.event', icon: LayoutGrid, place: { phone: 0, panel: null } },
  { key: 'standings', labelKey: 'nav.tabs.table', icon: Trophy, place: { phone: 1, panel: 2 } },
  { key: 'activity', labelKey: 'nav.tabs.activity', icon: History, place: { phone: 2, panel: 1 } },
  { key: 'chat', labelKey: 'nav.tabs.chat', icon: MessageSquare, place: { phone: null, panel: 0 } },
] as const satisfies readonly EventTabRow[]

/** The tabs of one surface, in the order of their places there (#756). */
function onSurface(surface: Surface) {
  return TABS.flatMap((tab) => {
    const at = tab.place[surface]
    return at === null ? [] : [{ at, tab }]
  }).sort((a, b) => a.at - b.at).map(({ tab }) => tab)
}

const PHONE_TABS = onSurface('phone')
const PANEL_TABS = onSurface('panel')

/** The tab the side panel opens on: the Chat (#761; the feed before 0.18, #274). Chosen at mount, not remembered. */
const PANEL_DEFAULT: EventTabKey = 'chat'

/** The tab that counts what the Activity feed receives while another view is shown. „Tabelle“ counts nothing (#274), and the panel opens on the Chat. */
const COUNTING_TAB: EventTabKey = 'activity'

function isTabKey(key: string): key is EventTabKey {
  return TABS.some(tab => tab.key === key)
}

export function useEventTabs(room: Pick<ReturnType<typeof useEventRoom>, 'on'>) {
  const { t } = useI18n()
  const wide = useMediaQuery(MD_QUERY)
  const panelTab = ref<string>(PANEL_DEFAULT)
  const activeView = ref<EventTabKey>('event')
  const unread = ref(0)

  // Only the phone counts: on a desktop the panel shows the feed, and a count from there would be stale once the window narrows.
  room.on('activity.added', () => {
    if (wide.value === false && activeView.value !== COUNTING_TAB) unread.value += 1
  })
  watch(wide, (isWide) => {
    if (isWide) unread.value = 0
  })

  function selectView(key: string) {
    activeView.value = isTabKey(key) ? key : 'event'
    if (activeView.value === COUNTING_TAB) unread.value = 0
  }

  const tabs = computed<TabBarItem[]>(() => PHONE_TABS.map((tab) => {
    const item = { key: tab.key, label: t(tab.labelKey), icon: tab.icon, current: activeView.value === tab.key }
    if (tab.key !== COUNTING_TAB) return item
    return {
      ...item,
      // The Tour's step „Aktivität“ points at this item on a phone (#648).
      tour: 'tab-activity',
      badge: activeView.value === COUNTING_TAB ? 0 : unread.value,
      ariaLabel: activeView.value !== COUNTING_TAB && unread.value > 0 ? t('event.tabs.unread', { label: item.label, n: unread.value }) : undefined,
    }
  }))

  const panelTabs = computed<PanelTab[]>(() => PANEL_TABS.map(tab => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon })))

  return { wide, panelTab, activeView, unread, tabs, panelTabs, selectView }
}
