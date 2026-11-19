<script setup lang="ts">
import type { Component } from 'vue'

// The tabs of the side panel on a desktop (02-components § SidePanel, 11-event-seite § SidePanel): the tabs pattern
// (tablist, tab, tabpanel) with the tabs the page has, which are „Chat“, „Aktivität“ and „Tabelle“ (#274, #761); a tab added later is one more row
// and nothing else changes. The panel of the current tab is the slot named after its key. The AppShell's `panel`
// slot holds this; the arrow keys, Home and End move between the tabs.
// A counting tab carries `badge` and `ariaLabel` (#778): the chip after its label, and the name „{label}, {n} neu“ while there is a count.
export interface PanelTab { key: string, label: string, icon: Component, badge?: number, ariaLabel?: string }

const props = defineProps<{
  label: string
  tabs: PanelTab[]
}>()

const current = defineModel<string>({ required: true })
const id = useId()
const tabId = (key: string) => `${id}-tab-${key}`
const panelId = (key: string) => `${id}-panel-${key}`

function move(event: KeyboardEvent) {
  const index = props.tabs.findIndex(tab => tab.key === current.value)
  const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: props.tabs.length - 1 }
  if (!(event.key in keys)) return
  event.preventDefault()
  const next = props.tabs[(keys[event.key]! + props.tabs.length) % props.tabs.length]
  if (!next) return
  current.value = next.key
  void nextTick(() => document.getElementById(tabId(next.key))?.focus())
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      role="tablist"
      :aria-label="label"
      class="flex flex-none gap-1 border-b-2 border-line-soft px-2.5 pt-1.5"
    >
      <button
        v-for="tab in tabs"
        :id="tabId(tab.key)"
        :key="tab.key"
        type="button"
        role="tab"
        :data-tour-anchor="`tab-${tab.key}`"
        :aria-selected="tab.key === current"
        :aria-controls="panelId(tab.key)"
        :aria-label="tab.ariaLabel"
        :tabindex="tab.key === current ? 0 : -1"
        class="-mb-0.5 flex h-[46px] cursor-pointer items-center gap-2 border-0 bg-transparent px-3 font-extrabold text-ink"
        :class="tab.key === current && 'shadow-[inset_0_-3px_0_var(--cp-hot)]'"
        @click="current = tab.key"
        @keydown="move"
      >
        <AppIcon
          :icon="tab.icon"
          :size="18"
          offset="var(--cp-hot)"
        />
        {{ tab.label }}
        <span
          v-if="tab.badge"
          data-tab-count
          class="ml-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-pill border-[1.5px] border-surface bg-ink px-[5px] text-[10px] font-extrabold text-paper"
          aria-hidden="true"
        >{{ tab.badge }}</span>
      </button>
    </div>
    <div
      v-for="tab in tabs"
      v-show="tab.key === current"
      :id="panelId(tab.key)"
      :key="tab.key"
      role="tabpanel"
      :aria-labelledby="tabId(tab.key)"
      class="flex min-h-0 flex-1 flex-col"
    >
      <slot :name="tab.key" />
    </div>
  </div>
</template>
