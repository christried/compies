import { History, LayoutGrid, Trophy } from '@lucide/vue'
import type { Component } from 'vue'
import type { useEventRoom } from '~/composables/useEventRoom'
import type { TabBarItem } from '~/components/TabBar.vue'
import type { PanelTab } from '~/components/SidePanel.vue'

// The Event page's tabs (11-event-seite § TabBar and § SidePanel, #166): the Event page, the Standings („Tabelle“) or the Activity feed. One table says
// which tabs exist and where they show: a phone's tab bar (`phone`), the side panel from md up (`panel`). A tab added to the
// table gets its item in both lists and its view in the page's template (#274 added „Tabelle“ this way). The feed is mounted once,
// in the side panel from md up and in its own view below; the wide layout is known after mount only, so nothing of the feed
// renders before.

export type EventTabKey = 'event' | 'standings' | 'activity'

const TABS = [
  { key: 'event', labelKey: 'event.tabs.event', icon: LayoutGrid, phone: true, panel: false },
  { key: 'standings', labelKey: 'nav.tabs.table', icon: Trophy, phone: true, panel: true },
  { key: 'activity', labelKey: 'nav.tabs.activity', icon: History, phone: true, panel: true },
] as const satisfies readonly { key: EventTabKey, labelKey: string, icon: Component, phone: boolean, panel: boolean }[]

/** The tab that counts what the Activity feed receives while another view is shown. „Tabelle“ counts nothing (#274), and the panel still opens on the feed. */
const COUNTING_TAB: EventTabKey = 'activity'

function isTabKey(key: string): key is EventTabKey {
  return TABS.some(tab => tab.key === key)
}

export function useEventTabs(room: Pick<ReturnType<typeof useEventRoom>, 'on'>) {
  const { t } = useI18n()
  const wide = useMediaQuery('(min-width: 61.25rem)')
  const panelTab = ref('activity')
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

  const tabs = computed<TabBarItem[]>(() => TABS.filter(tab => tab.phone).map((tab) => {
    const item = { key: tab.key, label: t(tab.labelKey), icon: tab.icon, current: activeView.value === tab.key }
    if (tab.key !== COUNTING_TAB) return item
    return {
      ...item,
      badge: activeView.value === COUNTING_TAB ? 0 : unread.value,
      ariaLabel: activeView.value !== COUNTING_TAB && unread.value > 0 ? t('event.tabs.unread', { label: item.label, n: unread.value }) : undefined,
    }
  }))

  const panelTabs = computed<PanelTab[]>(() => TABS.filter(tab => tab.panel).map(tab => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon })))

  return { wide, panelTab, activeView, unread, tabs, panelTabs, selectView }
}
