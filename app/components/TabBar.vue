<script setup lang="ts">
import type { Component } from 'vue'

// The tab bar of a phone (02-components § TabBar, 11-event-seite § TabBar): one column per item, the current one marked by a
// bar above it and the icon's offset copy. The Hub's tabs (HubNav) are links; the Event page's two views are buttons that
// switch the view in place (`to` decides). The current item has `aria-current="page"`; a badge counts what is new and is
// in the accessible name (`ariaLabel`), because the number itself is decoration.
export interface TabBarItem {
  key: string
  label: string
  icon: Component
  /** A link target; without one the item is a button and the bar emits `select`. */
  to?: string
  current: boolean
  /** A number of new things; nothing is drawn for 0. */
  badge?: number
  /** The accessible name when the visible label is not all of it. */
  ariaLabel?: string
  description?: string
}

defineProps<{
  label: string
  items: TabBarItem[]
}>()

const emit = defineEmits<{ select: [key: string] }>()
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <nav
    :aria-label="label"
    class="grid border-t-(length:--cp-bw) border-line bg-surface px-1 pb-[max(18px,env(safe-area-inset-bottom))]"
    :style="{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }"
  >
    <component
      :is="item.to ? NuxtLink : 'button'"
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      :type="item.to ? undefined : 'button'"
      :aria-current="item.current ? 'page' : undefined"
      :aria-label="item.ariaLabel"
      :aria-description="item.description"
      class="relative -mt-0.5 flex h-[58px] cursor-pointer flex-col items-center justify-center gap-[3px] border-t-3 bg-transparent text-[11px] text-inherit no-underline hover:tint"
      :class="item.current ? 'border-ink font-extrabold text-ink' : 'border-transparent font-semibold text-ink-2'"
      @click="emit('select', item.key)"
    >
      <AppIcon
        :icon="item.icon"
        :size="22"
        :offset="item.current ? 'var(--cp-hot)' : undefined"
      />
      {{ item.label }}
      <span
        v-if="item.badge"
        class="absolute top-1.5 left-1/2 ml-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-pill border-[1.5px] border-surface bg-ink px-[5px] text-[10px] font-extrabold text-paper"
        aria-hidden="true"
      >{{ item.badge }}</span>
      <slot
        name="marker"
        :item="item"
      />
    </component>
  </nav>
</template>
