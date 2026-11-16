<script setup lang="ts">
import type { Rect } from '~/utils/tour-placement'

// The Tour's hole (#460, 17-rundgang.md § TourSpotlight): one absolutely positioned element in the Tour's layer. It IS the hole, its shadow is the dark
// (`--cp-overlay`, the sheet's and dialog's scrim), its outline is the ring. No glow. `TourLayer` places it and plays its motion on `el`, so it stays
// plain: a closed hole (`rect` null) is 2 px at the centre of the window, with no ring.
withDefaults(defineProps<{
  rect: Rect | null
  radius?: number
  /** The ring's width in px: 3 around a thing, 0 for a closed hole. */
  ring?: number
}>(), { radius: 1, ring: 0 })

const el = useTemplateRef<HTMLElement>('el')
defineExpose({ el })
</script>

<template>
  <!-- The dark is a box-shadow far wider than any window, so the hole's own size is all that moves. -->
  <div
    ref="el"
    aria-hidden="true"
    data-tour-spotlight
    class="pointer-events-none absolute"
    :style="{
      left: rect ? `${rect.x}px` : 'calc(50% - 1px)',
      top: rect ? `${rect.y}px` : 'calc(50% - 1px)',
      width: rect ? `${rect.w}px` : '2px',
      height: rect ? `${rect.h}px` : '2px',
      borderRadius: rect ? `${radius}px` : '1px',
      outlineWidth: `${rect ? ring : 0}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--cp-primary)',
      outlineOffset: '0px',
      boxShadow: '0 0 0 calc(max(100vw, 100vh) * 2) var(--cp-overlay)',
    }"
  />
</template>
