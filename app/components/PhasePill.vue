<script setup lang="ts">
import type { Phase } from '~~/shared/event'
import { phaseWord } from '~/utils/event-page'

// Phase chip in the Event header and on cards (02-components § PhasePill). The text carries the
// meaning; the dot only adds colour. Phases beyond the MVP (running, finished, archived) are styled
// too, so 1.0 needs no change here.
// `label` replaces the Phase's word where the page knows more (the running Event: „Läuft · Session 1 von 2“, #166).
// `sm` is the chip under „Events“ in the header of the Event page (#426, 15-header-eventseite): the same fills and dots, smaller.
withDefaults(defineProps<{ phase: Phase, label?: string, size?: 'md' | 'sm' }>(), { label: undefined, size: 'md' })

const { t } = useI18n()

const DOT: Record<Phase, string> = {
  draft: 'bg-surface-2',
  poll: 'bg-info',
  date_set: 'bg-success',
  running: 'bg-hot',
  finished: 'bg-surface-2',
  archived: 'bg-surface-2',
}
</script>

<template>
  <span
    class="inline-flex flex-none items-center rounded-pill border-2 border-line bg-surface whitespace-nowrap text-ink"
    :class="size === 'sm' ? 'h-[18px] gap-[5px] px-[7px] text-[11px] font-extrabold' : 'h-7 gap-1.5 px-2.5 text-[12px] font-bold'"
  >
    <span
      class="rounded-full"
      :class="[DOT[phase], size === 'sm' ? 'size-1.5 border-[1.5px] border-line' : 'size-2.5 border border-line']"
      aria-hidden="true"
    />
    {{ phaseWord(phase, label, t) }}
  </span>
</template>
