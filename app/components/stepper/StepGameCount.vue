<script setup lang="ts">
import type { EventDraft, StepLocks } from '~/utils/event-draft'
import { GAME_COUNT_MAX, GAME_COUNT_MIN } from '~~/shared/settings'

// How many Games are played (#144), 1 to 30.
defineProps<{ locks?: StepLocks }>()
const draft = defineModel<EventDraft>({ required: true })
const settings = useDraftSettings(draft)
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

useStepBlocker(blocker)

const DOT_COLORS = ['bg-primary', 'bg-mint', 'bg-pop', 'bg-cobalt']
</script>

<template>
  <div class="flex max-w-[560px] flex-col items-start gap-4 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-5">
    <NumberStepper
      :model-value="settings.gameCount"
      :min="GAME_COUNT_MIN"
      :max="GAME_COUNT_MAX"
      size="lg"
      :label="t('stepper.games.label')"
      :min-reason="t('stepper.games.min')"
      :max-reason="t('stepper.games.max')"
      @update:model-value="settings = { ...settings, gameCount: $event }"
    />
    <div
      class="flex flex-wrap gap-1.5"
      aria-hidden="true"
    >
      <span
        v-for="index in settings.gameCount"
        :key="index"
        class="size-[30px] rounded-lg border-[2.5px] border-line"
        :class="DOT_COLORS[(index - 1) % DOT_COLORS.length]"
      />
    </div>
    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t('stepper.games.help', { n: settings.gameCount }, settings.gameCount) }}
    </p>
  </div>
</template>
