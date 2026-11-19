import { History, LayoutGrid, MessageSquare, Trophy } from '@lucide/vue'
import type { Component } from 'vue'
import type { useEventRoom } from '~/composables/useEventRoom'
import { MD_QUERY } from '~/composables/useMediaQuery'
import type { TabBarItem } from '~/components/TabBar.vue'
import type { PanelTab } from '~/components/SidePanel.vue'

// The Event page's tabs (11-event-seite § TabBar and § SidePanel, #166): the Event page, the Standings („Tabelle“), the Activity feed or the Chat (#761, #765). One table says
// which tabs exist and where they show: a phone's tab bar (`phone`), the side panel from md up (`panel`). A tab added to the
// table gets its item in both lists and its view in the page's template (#274 added „Tabelle“ this way). The feed is mounted once,
// in the side panel from md up and in its own view below; the wide layout is known after mount only, so nothing of the feed
// renders before. The Chat has its own phone view (#765), and it counts, like the feed, what arrives while another view is shown.

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
  { key: 'activity', labelKey: 'nav.tabs.activity', icon: History, place: { phone: 3, panel: 1 } },
  { key: 'chat', labelKey: 'nav.tabs.chat', icon: MessageSquare, place: { phone: 2, panel: 0 } },
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

/** The tabs that count what they receive while another view is shown: the feed (#274) and the Chat (#765). „Tabelle“ counts nothing. */
type CountedTab = 'activity' | 'chat'

function isCounted(key: EventTabKey): key is CountedTab {
  return key === 'activity' || key === 'chat'
}

function isTabKey(key: string): key is EventTabKey {
  return TABS.some(tab => tab.key === key)
}

export function useEventTabs(room: Pick<ReturnType<typeof useEventRoom>, 'on'>, viewerId: () => string | undefined) {
  const { t } = useI18n()
  const wide = useMediaQuery(MD_QUERY)
  const panelTab = ref<string>(PANEL_DEFAULT)
  const activeView = ref<EventTabKey>('event')
  const unread = reactive<Record<CountedTab, number>>({ activity: 0, chat: 0 })

  // One rule for both counting tabs (#765; #778 reuses it for the panel). Only the phone counts: on a desktop the panel shows them, and a count from there would
  // be stale once the window narrows. The shown tab counts nothing, and neither does the viewer's own Message. The room sends once and replays nothing, so no de-duplication.
  function arrived(tab: CountedTab, own = false) {
    if (own || wide.value !== false || activeView.value === tab) return
    unread[tab] += 1
  }
  room.on('activity.added', () => arrived('activity'))
  room.on('chat.added', ({ message }) => arrived('chat', message.writerId === viewerId()))
  watch(wide, (isWide) => {
    if (isWide) {
      unread.activity = 0
      unread.chat = 0
    }
  })

  function selectView(key: string) {
    activeView.value = isTabKey(key) ? key : 'event'
    if (isCounted(activeView.value)) unread[activeView.value] = 0
  }

  const tabs = computed<TabBarItem[]>(() => PHONE_TABS.map((tab) => {
    const item = { key: tab.key, label: t(tab.labelKey), icon: tab.icon, current: activeView.value === tab.key }
    if (!isCounted(tab.key)) return item
    const counted = {
      ...item,
      badge: activeView.value === tab.key ? 0 : unread[tab.key],
      ariaLabel: activeView.value !== tab.key && unread[tab.key] > 0 ? t('event.tabs.unread', { label: item.label, n: unread[tab.key] }) : undefined,
    }
    // The Tour's step „Aktivität“ points at this item on a phone (#648).
    return tab.key === 'activity' ? { ...counted, tour: 'tab-activity' } : counted
  }))

  const panelTabs = computed<PanelTab[]>(() => PANEL_TABS.map(tab => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon })))

  return { wide, panelTab, activeView, unread, tabs, panelTabs, selectView }
}
