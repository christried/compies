<script setup lang="ts">
import type { Component } from 'vue'

// Round icon-only button. The label is required: it becomes the aria-label and the tooltip.
withDefaults(defineProps<{
  icon: Component
  label: string
  /** Set for toggles (aria-pressed). */
  pressed?: boolean
}>(), { pressed: undefined })
</script>

<template>
  <button
    type="button"
    class="hit-44 grid size-10 flex-none place-items-center rounded-pill border-2 border-line bg-surface text-ink lift"
    :aria-label="label"
    :aria-pressed="pressed"
    :title="label"
  >
    <AppIcon
      :icon="icon"
      :size="18"
    />
  </button>
</template>
