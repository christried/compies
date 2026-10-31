<script setup lang="ts">
defineProps<{ size?: 'sm' | 'md' }>()
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1.5 rounded-pill border-2 border-line bg-surface leading-[1.2] font-extrabold tracking-[.06em] text-balance uppercase"
    :class="size === 'md' ? 'min-h-[26px] py-[3px] px-2.5 text-caption' : 'min-h-6 py-[3px] px-[9px] text-[11px]'"
  >
    <NavSoonMarker class="shrink-0" />
    <slot />
  </span>
</template>
