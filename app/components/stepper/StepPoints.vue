<script setup lang="ts">
import { risingPlace, type EventSettings } from '~~/shared/settings'

// Step 4: the points table (#144). A custom table in which a place earns more than the place above blocks
// Weiter with the same message the table shows on that row.
const settings = defineModel<EventSettings>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

watchEffect(() => {
  const rising = settings.value.pointsTable.preset === 'custom' ? risingPlace(settings.value.pointsTable.values) : null
  blocker.value = rising ? t('stepper.points.rising', { n: rising, above: rising - 1 }) : null
})
</script>

<template>
  <PointsTableEditor
    :model-value="settings.pointsTable"
    :team-count="settings.teamCount"
    @update:model-value="settings = { ...settings, pointsTable: $event }"
  />
</template>
