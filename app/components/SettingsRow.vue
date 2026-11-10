<script setup lang="ts">
import type { Component } from 'vue'

// One setting on the Profil page's card „Einstellungen“ (screen 25, artboard `App Bibliothek & Profil` ?s=profile, Einstellungen, #400):
// an icon tile, a title, an optional description and the control in the slot. The slot gets the title's and the description's ids,
// so the control is named and described by them. A wide control (a SegmentedControl, #404) wraps under the text when the row is narrow.
const props = defineProps<{
  icon: Component
  title: string
  description?: string
}>()

const uid = useId()
const titleId = `${uid}-title`
const descriptionId = computed(() => (props.description ? `${uid}-description` : undefined))
</script>

<template>
  <div class="flex min-h-[72px] flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-2.5">
    <span class="grid size-10 flex-none place-items-center rounded-[12px] border-2 border-line bg-paper-2">
      <AppIcon
        :icon="icon"
        :size="18"
      />
    </span>
    <div class="flex min-w-[140px] flex-1 flex-col leading-[1.3]">
      <b
        :id="titleId"
        class="text-[15px]"
      >{{ title }}</b>
      <span
        v-if="description"
        :id="descriptionId"
        class="text-[12px] text-pretty text-ink-2"
      >{{ description }}</span>
    </div>
    <div class="ml-auto flex-none">
      <slot v-bind="{ titleId, descriptionId }" />
    </div>
  </div>
</template>
