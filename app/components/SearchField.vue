<script setup lang="ts">
import { Search } from '@lucide/vue'

// The search field with the magnifying glass (#885): the Game browser's and the Archive's. It says every keystroke at once (`input`), the page decides what follows;
// `label` is the accessible name, `placeholder` the hint while it is empty.
defineProps<{
  label: string
  placeholder: string
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="relative flex min-w-[220px] flex-1 items-center">
    <AppIcon
      :icon="Search"
      :size="18"
      class="pointer-events-none absolute left-3.5 text-ink-2"
    />
    <input
      :value="model"
      type="search"
      :aria-label="label"
      :placeholder="placeholder"
      class="h-control-lg w-full rounded-[12px] border-(length:--cp-bw) border-line bg-surface py-0 pr-3.5 pl-[42px] text-[17px] text-ink"
      @input="model = ($event.target as HTMLInputElement).value"
    >
  </div>
</template>
