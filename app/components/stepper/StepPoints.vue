<script setup lang="ts">
import { Lock } from '@lucide/vue'
import type { EventDraft, StepLocks } from '~/utils/event-draft'
import { isFlat, risingPlace } from '~~/shared/settings'

// The points table (#144). A custom table in which a place earns more than the place above blocks
// Weiter with the same message the table shows on that row, and so does one in which every place earns the
// same (#175). `locks.reason` (settings editor, #147) shows the table locked.
defineProps<{ locks?: StepLocks }>()
const draft = defineModel<EventDraft>({ required: true })
const settings = useDraftSettings(draft)
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

useStepBlocker(blocker, () => {
  const { preset, values } = settings.value.pointsTable
  const rising = preset === 'custom' ? risingPlace(values) : null
  if (rising) return t('stepper.points.rising', { n: rising, above: rising - 1 })
  return preset === 'custom' && isFlat(values) ? t('stepper.points.flat') : null
})
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <NoticeBanner
      v-if="locks?.reason"
      tone="info"
      :icon="Lock"
    >
      {{ locks.reason }}
    </NoticeBanner>
    <PointsTableEditor
      :model-value="settings.pointsTable"
      :team-count="settings.teamCount"
      :locked-reason="locks?.reason"
      @update:model-value="settings = { ...settings, pointsTable: $event }"
    />
  </div>
</template>
