<script setup lang="ts">
// Phase chip in the Event header and on cards (02-components § PhasePill). The text carries the
// meaning; the dot only adds colour. Phases beyond the MVP (running, finished, archived) are styled
// too, so 1.0 needs no change here.
type Phase = 'draft' | 'poll' | 'date_set' | 'running' | 'finished' | 'archived'

defineProps<{ phase: Phase }>()

const { t } = useI18n()

const LABEL: Record<Phase, string> = {
  draft: 'draft',
  poll: 'poll',
  date_set: 'dateSet',
  running: 'running',
  finished: 'finished',
  archived: 'archived',
}
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
  <span class="inline-flex h-7 flex-none items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-2.5 text-[12px] font-bold whitespace-nowrap text-ink">
    <span
      class="size-2.5 rounded-full border border-line"
      :class="DOT[phase]"
      aria-hidden="true"
    />
    {{ t(`phase.${LABEL[phase]}`) }}
  </span>
</template>
