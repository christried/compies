<script setup lang="ts">
defineProps<{ size?: 'sm' | 'md' }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-pill border-2 border-line bg-surface font-extrabold tracking-[.06em] uppercase"
    :class="size === 'md' ? 'h-[26px] px-2.5 text-caption' : 'h-6 px-[9px] text-[11px]'"
  >
    <NavSoonMarker />
    <slot />
  </span>
</template>
