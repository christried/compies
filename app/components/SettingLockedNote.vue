<script setup lang="ts">
import { Lock } from '@lucide/vue'

// The reason a setting cannot change, shown once at the top of a step in the settings editor (#147).
defineProps<{ reason: string }>()
</script>

<template>
  <p class="m-0 flex items-start gap-2 rounded-xl border-2 border-dashed border-ink-3 bg-paper-2 px-3.5 py-2.5 text-[14px] font-bold text-pretty text-ink-2">
    <AppIcon
      :icon="Lock"
      :size="16"
      class="mt-0.5 flex-none"
    />
    {{ reason }}
  </p>
</template>
