<script setup lang="ts">
import type { Component } from 'vue'

import { Check, CircleAlert, Info, TriangleAlert, X } from '@lucide/vue'
import { noticeChipClasses, noticeClasses, type NoticeTone } from '~/utils/notice'

// An inline notice inside a page (02-components § NoticeBanner). Four tones (#172): info, warning (Hinweis),
// critical (Kritisch) and success. Each tone has its tint and a default icon, and the icon can be overridden.
// `critical` is announced as an alert, the others as a status; the text carries the meaning. `hostOnly` adds the
// "Nur du siehst das" label as a bold line over a divider, above the text, at every width (#611). The ✕ is there
// only with `closable`: the page decides what closing means (it emits `close`, the banner does not hide itself),
// and a notice with nothing to close has no dead button.
const props = withDefaults(defineProps<{
  tone?: NoticeTone
  icon?: Component
  hostOnly?: boolean
  closable?: boolean
}>(), { tone: 'info', icon: undefined, hostOnly: false, closable: false })

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const DEFAULT_ICON: Record<NoticeTone, Component> = { info: Info, warning: TriangleAlert, critical: CircleAlert, success: Check }
const icon = computed(() => props.icon ?? DEFAULT_ICON[props.tone])
</script>

<template>
  <div
    :role="tone === 'critical' ? 'alert' : 'status'"
    class="animate-enter flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-[14px] text-ink"
    :class="noticeClasses(tone)"
  >
    <span
      :class="noticeChipClasses(tone)"
      aria-hidden="true"
    >
      <AppIcon
        :icon="icon"
        :size="14"
      />
    </span>
    <!-- Host-only (#611): the label is a bold line, a divider under it, then the text, and the action sits below the text at every width. -->
    <div
      v-if="hostOnly"
      class="flex min-w-0 flex-1 flex-col gap-2"
    >
      <span class="text-[12px] font-bold">{{ t('common.hostOnly') }}</span>
      <hr class="border-t-2 border-line-soft">
      <span class="min-w-0 text-pretty">
        <slot />
      </span>
      <div
        v-if="$slots.action"
        class="flex-none self-start"
      >
        <slot name="action" />
      </div>
    </div>
    <!-- Below sm the action sits under the text, aligned with it, so the text keeps the whole line (#166). -->
    <div
      v-else
      class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span class="min-w-0 flex-1 text-pretty">
          <slot />
        </span>
      </div>
      <div
        v-if="$slots.action"
        class="flex-none max-sm:self-start"
      >
        <slot name="action" />
      </div>
    </div>
    <button
      v-if="closable"
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
