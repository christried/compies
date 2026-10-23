<script setup lang="ts">
import type { Component } from 'vue'

import { X } from '@lucide/vue'

// An inline notice inside a page (02-components § NoticeBanner). It is announced as a status when it
// appears; the text carries the meaning. `hostOnly` adds the "Nur du siehst das" chip. Every notice
// has an ✕; the page decides what closing means (it emits `close`, the banner does not hide itself).
withDefaults(defineProps<{
  tone?: 'success' | 'info' | 'warning'
  icon?: Component
  hostOnly?: boolean
}>(), { tone: 'info', icon: undefined, hostOnly: false })

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <div
    role="status"
    class="animate-enter flex flex-wrap items-center gap-3 rounded-[12px] border-2 border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink"
  >
    <span
      v-if="icon"
      class="grid size-7 flex-none place-items-center rounded-pill border-2 border-line"
      :class="{ 'bg-success text-on-success': tone === 'success', 'bg-warning text-on-warning': tone === 'warning', 'bg-info text-ink': tone === 'info' }"
      aria-hidden="true"
    >
      <AppIcon
        :icon="icon"
        :size="14"
      />
    </span>
    <span class="min-w-0 flex-1 text-pretty">
      <slot />
    </span>
    <span
      v-if="hostOnly"
      class="rounded-pill border-2 border-line bg-paper-2 px-2 text-[11px] font-bold"
    >{{ t('common.hostOnly') }}</span>
    <slot name="action" />
    <button
      type="button"
      class="hit-44 grid flex-none place-items-center"
      :aria-label="t('common.close')"
      @click="emit('close')"
    >
      <AppIcon
        :icon="X"
        :size="16"
      />
    </button>
  </div>
</template>
