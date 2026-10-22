<script setup lang="ts">
import { CalendarClock } from '@lucide/vue'

const { t } = useI18n()
</script>

<template>
  <main class="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper p-6 text-ink">
    <CalendarClock
      class="size-12"
      aria-hidden="true"
    />
    <h1 class="font-display text-display">
      {{ t('app.name') }}
    </h1>
    <p class="text-h3 font-display">
      {{ t('mvp.home.title') }}
    </p>
    <p class="text-ink-2">
      {{ t('app.loading') }}
    </p>
  </main>
</template>
