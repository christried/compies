<script setup lang="ts">
// A live number with tabular figures so it does not jump when it changes (02-components § CpNum).
// With `say`, the digits are hidden from screen readers and `say` is read instead ("noch 42 Sekunden").
// Without it, the digits are read as they are. Counting animation (1.0) is not built yet.
withDefaults(defineProps<{
  value: number | string
  say?: string
}>(), { say: undefined })
</script>

<template>
  <span class="font-num tabular-nums">
    <span :aria-hidden="say ? 'true' : undefined">{{ value }}</span>
    <span
      v-if="say"
      class="sr-only"
    >{{ say }}</span>
  </span>
</template>
