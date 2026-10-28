<script setup lang="ts">
import type { Component } from 'vue'
import EventStepper from '~/components/stepper/EventStepper.vue'
import StepFormat from '~/components/stepper/StepFormat.vue'
import StepGameCount from '~/components/stepper/StepGameCount.vue'
import StepMode from '~/components/stepper/StepMode.vue'
import StepName from '~/components/stepper/StepName.vue'
import StepPool from '~/components/stepper/StepPool.vue'
import StepPoints from '~/components/stepper/StepPoints.vue'
import StepSessions from '~/components/stepper/StepSessions.vue'
import { apiErrorKey } from '~/utils/api-error'
import type { EventDraft, StepKey, StepLocks } from '~/utils/event-draft'
import type { ApiErrorCode } from '~~/shared/errors'
import { SLOTS_MAX } from '~~/shared/event'

// The Event setup wizard (#170): the one step chain that /neu (create, #144) and the settings editor (#147) run.
// An entry page says which steps (`steps`, copy in `stepper.steps.<key>`), keeps the draft (`v-model`), what is locked
// (`locks`) and what the last step does (`submit`); the wizard owns the rest: current and reached step, Weiter, the
// blocker the steps report, the failure line and the info column, and lays it out with EventStepper. A step edits the
// whole draft through `v-model`, reports its blocker through `v-model:blocker` and takes `locks`, which it may ignore.
// `submit` receives the draft; when it throws, the wizard shows the error's copy (`errorCopy` has the page's own) and
// stays on the last step. What follows a success is the page's. A new step goes into STEPS below. The steps are
// imported, not auto-imported: Nuxt would name those in `stepper/` with a folder prefix.
const props = defineProps<{
  steps: readonly StepKey[]
  locks?: StepLocks
  /** The step list's heading; „Neues Event“ by default. */
  navTitle?: string
  /** Replaces „Schritt n von m“ above the step's title. */
  kicker?: string
  /** Weiter on the last step („Session erstellen“, „Speichern“) and while `submit` is running. */
  lastLabel: string
  savingLabel: string
  /** Every step is a link from the start (the editor), instead of those the Host has been to. */
  reachAll?: boolean
  /** Copy for error codes the page words itself, before the shared copy (`apiErrorKey`). */
  errorCopy?: Partial<Record<ApiErrorCode, string>>
  submit: (draft: EventDraft) => Promise<void>
}>()
const draft = defineModel<EventDraft>({ required: true })

const { t } = useI18n()

// Holds the library across the two pool steps, whose pickers mount and unmount (useGameLibrary).
useGameLibrary()

const STEPS: Record<StepKey, { component: Component, props?: Record<string, unknown> }> = {
  name: { component: StepName },
  format: { component: StepFormat },
  games: { component: StepGameCount },
  points: { component: StepPoints },
  mode: { component: StepMode },
  pool: { component: StepPool, props: { kind: 'main' } },
  tiebreaker: { component: StepPool, props: { kind: 'tiebreaker' } },
  sessions: { component: StepSessions },
}

const current = ref(0)
/** The furthest step the Host has been on; the steps up to it are links. */
const reached = ref(0)
/** Why the current step cannot go on; each step reports it through `v-model:blocker`. */
const blocker = ref<string | null>(null)
/** What the last submit answered; a step change clears it. */
const failure = ref<string | null>(null)
const saving = ref(false)

const stepList = computed(() => props.steps.map(key => ({ key, label: t(`stepper.steps.${key}.label`) })))
const stepKey = computed(() => props.steps[current.value]!)
const isLast = computed(() => current.value === props.steps.length - 1)
// The info column explains the Format or, on the Selection mode step, the chosen mode (#145), and the Tiebreaker pool (#146).
const infoTopic = computed(() => {
  if (stepKey.value === 'format') return draft.value.settings.format
  if (stepKey.value === 'mode') return draft.value.settings.selectionMode === 'lucky_wheel' ? 'wheel' : 'admin'
  if (stepKey.value === 'tiebreaker') return 'tiebreaker'
  return null
})
const infoTitle = computed(() => (infoTopic.value ? t(`setup.info.${infoTopic.value}.title`) : undefined))
const nextLabel = computed(() => {
  if (saving.value) return props.savingLabel
  return isLast.value ? props.lastLabel : t('stepper.next')
})

function go(index: number) {
  current.value = index
  failure.value = null
}

async function next() {
  if (blocker.value || saving.value) return
  if (!isLast.value) {
    go(current.value + 1)
    reached.value = Math.max(reached.value, current.value)
    return
  }
  saving.value = true
  failure.value = null
  try {
    await props.submit(draft.value)
  }
  catch (error) {
    failure.value = t(apiErrorKey(error, 'error.saveFailed', props.errorCopy), { max: SLOTS_MAX })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <EventStepper
    :steps="stepList"
    :current="current"
    :reached="reachAll ? steps.length - 1 : reached"
    :nav-title="navTitle"
    :kicker="kicker"
    :title="t(`stepper.steps.${stepKey}.title`)"
    :info-title="infoTitle"
    :next-label="nextLabel"
    :next-blocked="blocker"
    :busy="saving"
    @go="go"
    @next="next"
    @back="go(current - 1)"
  >
    <component
      :is="STEPS[stepKey].component"
      v-bind="STEPS[stepKey].props"
      :key="stepKey"
      v-model="draft"
      v-model:blocker="blocker"
      :locks="locks"
    />
    <NoticeBanner
      v-if="failure"
      tone="critical"
    >
      {{ failure }}
    </NoticeBanner>

    <template
      v-if="infoTopic"
      #info
    >
      <InfoSheet :topic="infoTopic" />
    </template>
  </EventStepper>
</template>
