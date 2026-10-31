<script setup lang="ts">
import type { Component } from 'vue'

// The tabs of the side panel on a desktop (02-components § SidePanel, 11-event-seite § SidePanel): the tabs pattern
// (tablist, tab, tabpanel) with the tabs 1.4 has, which is „Aktivität“; Chat, Tabelle and Leute are appended later as more
// tabs and nothing else changes. The panel of the current tab is the slot named after its key. The AppShell's `panel`
// slot holds this; the arrow keys, Home and End move between the tabs.
export interface PanelTab { key: string, label: string, icon: Component }

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
        :aria-selected="tab.key === current"
        :aria-controls="panelId(tab.key)"
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
