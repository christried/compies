<script setup lang="ts">
import type { Component } from 'vue'

// Lucide wrapper. Decorative: the label next to it carries the meaning.
const props = withDefaults(defineProps<{
  icon: Component
  size?: number
  /** Colour of the offset copy behind the icon (active nav items). */
  offset?: string
}>(), { size: 18, offset: undefined })

// Icon.dc.html draws the offset copy 1.8 units right and down of the 24-unit grid.
const shift = computed(() => `${props.size * 1.8 / 24}px`)
</script>

<template>
  <span
    class="inline-grid flex-none"
    aria-hidden="true"
  >
    <component
      :is="icon"
      v-if="offset"
      :size="size"
      class="col-start-1 row-start-1"
      :style="{ color: offset, translate: `${shift} ${shift}` }"
    />
    <component
      :is="icon"
      :size="size"
      class="relative col-start-1 row-start-1"
    />
  </span>
</template>
