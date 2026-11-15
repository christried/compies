<script setup lang="ts">
import type { Component } from 'vue'

// Round icon-only button. The label is required: it becomes the aria-label and the tooltip (`tooltip` false leaves the tooltip out, #616). `tone` gives it a solid
// fill (✓ success, ✗ error); `size` is the visual diameter, the hit area stays 44 px (02-components § IconButton).
withDefaults(defineProps<{
  icon: Component
  label: string
  /** Set for toggles (aria-pressed). */
  pressed?: boolean
  tone?: 'success' | 'error'
  size?: 32 | 36 | 40
  /** The native tooltip (the label); off where a popover opens on hover instead. */
  tooltip?: boolean
}>(), { pressed: undefined, tone: undefined, size: 40, tooltip: true })
</script>

<template>
  <button
    type="button"
    class="hit-44 grid flex-none place-items-center rounded-pill border-2 border-line lift"
    :class="[
      {
        'size-8': size === 32,
        'size-9': size === 36,
        'size-10': size === 40,
        'bg-surface text-ink': !tone,
        'bg-success text-on-success shadow-sm': tone === 'success',
        'bg-error text-on-error shadow-sm': tone === 'error',
      },
    ]"
    :aria-label="label"
    :aria-pressed="pressed"
    :title="tooltip ? label : undefined"
  >
    <AppIcon
      :icon="icon"
      :size="size === 40 ? 18 : 16"
    />
  </button>
</template>
