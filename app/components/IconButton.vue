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
    class="hit-44 grid size-10 flex-none place-items-center rounded-pill border-2 border-line bg-surface text-ink transition-[translate,box-shadow] dur-instant ease-snap hover:-translate-y-0.5 hover:shadow-card active:translate-1 active:shadow-none reduced:hover:translate-y-0 reduced:hover:tint motion-reduce:hover:translate-y-0 motion-reduce:hover:tint"
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
