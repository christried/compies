<script setup lang="ts">
import { ListOrdered, Swords, User, Users } from '@lucide/vue'
import { AVAILABLE_FORMATS, TEAM_COUNT_MAX, TEAM_COUNT_MIN, TEAM_PLAYERS_MAX, TEAM_SIZE_MAX, TEAM_SIZE_MIN, withTeams, type EventSettings, type Format } from '~~/shared/settings'

// Step 2: Format and team layout (#144). Free-for-all, bracket and league show as „Bald verfügbar“. With
// Teams: how many teams and how many Players per team, at most 24 Players in all; a plus button at the
// limit says which limit it is.
const settings = defineModel<EventSettings>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

// Every value this step can produce is valid, so it never blocks.
watchEffect(() => {
  blocker.value = null
})

const options = computed(() => [
  { value: 'ffa', label: t('stepper.format.ffa.name'), desc: t('stepper.format.ffa.desc'), icon: User },
  { value: 'teams', label: t('stepper.format.teams.name'), desc: t('stepper.format.teams.desc'), icon: Users },
  { value: 'bracket', label: t('stepper.format.bracket.name'), desc: t('stepper.format.bracket.desc'), icon: Swords },
  { value: 'league', label: t('stepper.format.league.name'), desc: t('stepper.format.league.desc'), icon: ListOrdered },
].map(option => ({ ...option, locked: !(AVAILABLE_FORMATS as readonly string[]).includes(option.value) })))

function chooseFormat(value: string) {
  settings.value = { ...settings.value, format: value as Format }
}

// Each stepper's top is the lower of its own limit and what is left of the 24 Players.
const teamCountMax = computed(() => Math.min(TEAM_COUNT_MAX, Math.floor(TEAM_PLAYERS_MAX / settings.value.teamSize)))
const teamSizeMax = computed(() => Math.min(TEAM_SIZE_MAX, Math.floor(TEAM_PLAYERS_MAX / settings.value.teamCount)))
const teamCountMaxReason = computed(() => (teamCountMax.value < TEAM_COUNT_MAX ? t('stepper.format.playersMax') : t('stepper.format.teamCountMax')))
const teamSizeMaxReason = computed(() => (teamSizeMax.value < TEAM_SIZE_MAX ? t('stepper.format.playersMax') : t('stepper.format.teamSizeMax')))

const players = computed(() => settings.value.teamCount * settings.value.teamSize)
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <RadioCardGroup
      :model-value="settings.format"
      :options="options"
      :label="t('stepper.format.label')"
      @update:model-value="chooseFormat"
    />

    <div
      v-if="settings.format === 'teams'"
      class="flex flex-col gap-3.5 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-4"
    >
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex min-w-[150px] flex-1 flex-col leading-[1.3]">
          <b>{{ t('stepper.format.teamCount') }}</b>
          <span class="text-[12px] text-ink-2">{{ t('stepper.format.teamCountHelp') }}</span>
        </div>
        <NumberStepper
          :model-value="settings.teamCount"
          :min="TEAM_COUNT_MIN"
          :max="teamCountMax"
          :label="t('stepper.format.teamCount')"
          :min-reason="t('stepper.format.teamCountMin')"
          :max-reason="teamCountMaxReason"
          @update:model-value="settings = withTeams(settings, $event, settings.teamSize)"
        />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex min-w-[150px] flex-1 flex-col leading-[1.3]">
          <b>{{ t('stepper.format.teamSize') }}</b>
          <span class="text-[12px] text-ink-2">{{ t('stepper.format.teamSizeHelp') }}</span>
        </div>
        <NumberStepper
          :model-value="settings.teamSize"
          :min="TEAM_SIZE_MIN"
          :max="teamSizeMax"
          :label="t('stepper.format.teamSize')"
          :min-reason="t('stepper.format.teamSizeMin')"
          :max-reason="teamSizeMaxReason"
          @update:model-value="settings = withTeams(settings, settings.teamCount, $event)"
        />
      </div>
      <p
        aria-live="polite"
        class="m-0 border-t-2 border-line-soft pt-3 text-[14px] font-bold"
      >
        {{ t('stepper.format.total', { teams: settings.teamCount, size: settings.teamSize, players }) }}
      </p>
    </div>
  </div>
</template>
