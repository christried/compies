<script setup lang="ts">
import type { EventDraft, StepLocks } from '~/utils/event-draft'
import { GAME_COUNT_MAX, GAME_COUNT_MIN, tiePossible } from '~~/shared/settings'

// How many Games are played (#144), 1 to 30. In a running Event never fewer than the Rounds already started (`locks.floors.gameCount`, #228).
// Under a Game count that can end in a Tie (#279, ADR 0014) a banner says so: the Host then chooses the end. The hint follows the draft
// live, the editor of a running Event shares this component.
const props = defineProps<{ locks?: StepLocks }>()
const draft = defineModel<EventDraft>({ required: true })
const settings = useDraftSettings(draft)
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

useStepBlocker(blocker)

const DOT_COLORS = ['bg-primary', 'bg-mint', 'bg-pop', 'bg-cobalt']

const min = computed(() => Math.max(GAME_COUNT_MIN, props.locks?.floors?.gameCount ?? GAME_COUNT_MIN))
const minReason = computed(() => (min.value > GAME_COUNT_MIN ? t('stepper.games.floor', { n: min.value }) : t('stepper.games.min')))
const tie = computed(() => tiePossible(settings.value.gameCount, settings.value.teamCount))
</script>

<template>
  <div class="flex max-w-[560px] flex-col gap-4">
    <div class="flex flex-col items-start gap-4 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-5">
      <NumberStepper
        :model-value="settings.gameCount"
        :min="min"
        :max="GAME_COUNT_MAX"
        size="lg"
        :label="t('stepper.games.label')"
        :min-reason="minReason"
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
    <NoticeBanner
      v-if="tie"
      tone="info"
    >
      <b>{{ t('stepper.games.tieTitle') }}</b> {{ t('stepper.games.tie') }}
    </NoticeBanner>
  </div>
</template>
