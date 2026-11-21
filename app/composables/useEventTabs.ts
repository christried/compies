import { History, LayoutGrid, MessageSquare, Trophy } from '@lucide/vue'
import type { Component } from 'vue'
import type { useEventRoom } from '~/composables/useEventRoom'
import type { ActivityType } from '~~/shared/activity'
import { MD_QUERY } from '~/composables/useMediaQuery'
import type { TabBarItem } from '~/components/TabBar.vue'
import type { PanelTab } from '~/components/SidePanel.vue'

// The Event page's tabs (11-event-seite § TabBar and § SidePanel, #166): the Event page, the Standings („Tabelle“), the Activity feed or the Chat (#761, #765). One table says
// which tabs exist and where they show: a phone's tab bar (`phone`), the side panel from md up (`panel`). A tab added to the
// table gets its item in both lists and its view in the page's template (#274 added „Tabelle“ this way). The feed and the Chat are each mounted once:
// in the side panel from md up (the panel's tab) and in a view of its own below md (#765 gave the Chat its phone view); the wide layout is known after mount only,
// so nothing of either renders before. Both count what arrives while another view is shown, and the side panel's tabs count by the same rule (#778);
// „Tabelle“ counts the Results that arrive by that rule too (#951).

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

/** The tabs that count what they receive while another view is shown: the feed (#274), the Chat (#765) and „Tabelle“, which counts Results (#951). */
type CountedTab = 'activity' | 'chat' | 'standings'

function isCounted(key: string): key is CountedTab {
  return key === 'activity' || key === 'chat' || key === 'standings'
}

/** The entry types that change the Standings: a Result entered and a Correction (#951). */
const RESULT_TYPES: readonly ActivityType[] = ['result_entered', 'result_corrected']

function isTabKey(key: string): key is EventTabKey {
  return TABS.some(tab => tab.key === key)
}

export function useEventTabs(room: Pick<ReturnType<typeof useEventRoom>, 'on'>, viewerId: () => string | undefined) {
  const { t } = useI18n()
  const wide = useMediaQuery(MD_QUERY)
  const panelTab = ref<string>(PANEL_DEFAULT)
  const activeView = ref<EventTabKey>('event')
  const unread = reactive<Record<CountedTab, number>>({ activity: 0, chat: 0, standings: 0 })

  // The tab the screen shows: the phone's view below md, the panel's tab from md up (and before the answer, when nothing is on the phone yet) (#778).
  const shown = computed<string>(() => (wide.value === false ? activeView.value : panelTab.value))

  // One rule for the counting tabs and both layouts (#765, #778, #951). The shown tab counts nothing, and neither does the viewer's own Message
  // or a Result the viewer entered (the Host). The room sends once and replays nothing, so no de-duplication.
  function arrived(tab: CountedTab, own = false) {
    if (own || shown.value === tab) return
    unread[tab] += 1
  }
  room.on('activity.added', ({ entry }) => {
    arrived('activity')
    // The room's messages are not checked on arrival (ActivityFeed's readEntry), so a malformed one counts on no Tabelle.
    if (RESULT_TYPES.includes(entry?.type)) arrived('standings', entry.actor?.id === viewerId())
  })
  room.on('chat.added', ({ message }) => arrived('chat', message.writerId === viewerId()))
  // Any change of the shown tab clears the count of the tab now shown: a phone's tap, a click or arrow key in the panel, the Tour's switch and its restore, a resize.
  // Synchronous, so a count is gone the moment the tab is selected, before the next render.
  watch(shown, (tab) => {
    if (isCounted(tab)) unread[tab] = 0
  }, { flush: 'sync' })

  function selectView(key: string) {
    activeView.value = isTabKey(key) ? key : 'event'
  }

  /** The badge and the accessible name of a counting tab, `{}` for a tab that does not count. The same for a phone's item and a panel's tab (#778). */
  function countFields(key: EventTabKey, label: string): { badge?: number, ariaLabel?: string } {
    if (!isCounted(key)) return {}
    const open = shown.value === key
    return {
      badge: open ? 0 : unread[key],
      ariaLabel: !open && unread[key] > 0 ? t('event.tabs.unread', { label, n: unread[key] }) : undefined,
    }
  }

  const tabs = computed<TabBarItem[]>(() => PHONE_TABS.map((tab) => {
    const label = t(tab.labelKey)
    const item = { key: tab.key, label, icon: tab.icon, current: activeView.value === tab.key, ...countFields(tab.key, label) }
    // The Tour's step „Aktivität“ points at this item on a phone (#648).
    return tab.key === 'activity' ? { ...item, tour: 'tab-activity' } : item
  }))

  const panelTabs = computed<PanelTab[]>(() => PANEL_TABS.map((tab) => {
    const label = t(tab.labelKey)
    return { key: tab.key, label, icon: tab.icon, ...countFields(tab.key, label) }
  }))

  return { wide, panelTab, activeView, unread, tabs, panelTabs, selectView }
}
