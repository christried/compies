<script setup lang="ts">
import type { EventDraft, StepLocks } from '~/utils/event-draft'
import { isFlat, risingPlace } from '~~/shared/settings'

// Step 4: the points table (#144). A custom table in which a place earns more than the place above blocks
// Weiter with the same message the table shows on that row, and so does one in which every place earns the
// same (#175). `locks.reason` (settings editor, #147) shows the table locked.
defineProps<{ locks?: StepLocks }>()
const draft = defineModel<EventDraft>({ required: true })
const settings = useDraftSettings(draft)
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

watchEffect(() => {
  const { preset, values } = settings.value.pointsTable
  const rising = preset === 'custom' ? risingPlace(values) : null
  if (rising) blocker.value = t('stepper.points.rising', { n: rising, above: rising - 1 })
  else blocker.value = preset === 'custom' && isFlat(values) ? t('stepper.points.flat') : null
})
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <SettingLockedNote
      v-if="locks?.reason"
      :reason="locks.reason"
    />
    <PointsTableEditor
      :model-value="settings.pointsTable"
      :team-count="settings.teamCount"
      :locked-reason="locks?.reason"
      @update:model-value="settings = { ...settings, pointsTable: $event }"
    />
  </div>
</template>
