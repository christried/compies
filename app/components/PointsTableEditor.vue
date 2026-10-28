<script setup lang="ts">
import { CircleAlert, ListOrdered, Pencil, Trophy } from '@lucide/vue'
import type { Component } from 'vue'
import { POINTS_MAX, isFlat, pointsFor, risingPlace, type PointsPreset, type PointsTable } from '~~/shared/settings'

// Points per place (02-components § PointsTableEditor): the three presets as cards with the values they
// really have at this team count, one row per team, and for a custom table a NumberStepper per row. A place
// that would earn more than the place above gets the error on its own row (aria-describedby) — the step
// that holds this editor blocks Weiter for it, the server refuses it (points_rising). A table where every
// place earns the same (#175) gets its error on the last row, the one that has to fall below first place.
const props = withDefaults(defineProps<{
  modelValue: PointsTable
  /** One row per team. */
  teamCount: number
  /** Why the table cannot change now (#147): the preset cards and the places are locked, the chosen preset stays. */
  lockedReason?: string
}>(), { lockedReason: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: PointsTable] }>()

const { t } = useI18n()
const errorId = useId()

const join = (values: number[]) => values.join(' / ')
const options = computed<{ value: PointsPreset, label: string, desc: string, icon: Component }[]>(() => [
  { value: 'linear', label: t('setup.points.linear.name'), desc: t('setup.points.linear.desc', { example: join(pointsFor('linear', props.teamCount)) }), icon: ListOrdered },
  { value: 'winner_takes_all', label: t('setup.points.wta.name'), desc: t('setup.points.wta.desc', { values: join(pointsFor('winner_takes_all', props.teamCount)) }), icon: Trophy },
  { value: 'custom', label: t('setup.points.custom.name'), desc: t('setup.points.custom.desc'), icon: Pencil },
])

function choose(preset: PointsPreset) {
  // A custom table starts from what is on screen, so the Host edits a table instead of typing a new one.
  emit('update:modelValue', { preset, values: pointsFor(preset, props.teamCount, props.modelValue.values) })
}

function setPlace(index: number, value: number) {
  const values = [...props.modelValue.values]
  values[index] = value
  emit('update:modelValue', { preset: 'custom', values })
}

const custom = computed(() => props.modelValue.preset === 'custom')
const rising = computed(() => (custom.value ? risingPlace(props.modelValue.values) : null))
const flat = computed(() => custom.value && isFlat(props.modelValue.values))
// Rising and flat cannot both hold (a flat table never rises), so one message and one row describe the problem.
const errorPlace = computed(() => rising.value ?? (flat.value ? props.modelValue.values.length : null))
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <RadioCardGroup
      :model-value="modelValue.preset"
      :options="options"
      :label="t('stepper.points.label')"
      :columns="3"
      :locked-reason="lockedReason"
      @update:model-value="choose"
    />

    <div class="flex max-w-[560px] flex-col gap-2 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-4">
      <b>{{ custom ? t('setup.points.custom.name') : t('stepper.points.head', { n: teamCount }) }}</b>
      <div
        v-for="(points, index) in modelValue.values"
        :key="index"
        data-testid="points-row"
        class="flex min-h-12 items-center gap-3"
      >
        <span
          class="grid size-9 flex-none place-items-center rounded-[10px] border-[2.5px] border-line bg-paper-2 font-display text-[18px]"
          aria-hidden="true"
        >{{ index + 1 }}</span>
        <span class="flex-1 font-bold">{{ t('stepper.points.place', { n: index + 1 }) }}</span>
        <NumberStepper
          v-if="custom"
          :model-value="points"
          :min="0"
          :max="POINTS_MAX"
          :label="t('stepper.points.stepper', { n: index + 1 })"
          :locked-reason="lockedReason"
          :described-by="errorPlace === index + 1 ? errorId : undefined"
          @update:model-value="setPlace(index, $event)"
        />
        <span
          v-else
          class="grid h-11 min-w-16 place-items-center rounded-[10px] border-(length:--cp-bw) border-line bg-paper-2 px-2.5 font-num text-[20px]"
        >{{ points }}</span>
      </div>
      <span
        v-if="errorPlace !== null"
        :id="errorId"
        role="alert"
        class="flex items-center gap-1.5 text-[13px] font-bold text-error-fg"
      >
        <AppIcon
          :icon="CircleAlert"
          :size="15"
        />
        {{ rising ? t('stepper.points.rising', { n: rising, above: rising - 1 }) : t('stepper.points.flat') }}
      </span>
      <span class="text-[12px] text-ink-2">{{ t('stepper.points.tie') }}</span>
    </div>
  </div>
</template>
