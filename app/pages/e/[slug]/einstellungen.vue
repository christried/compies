<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'
import EventStepper from '~/components/stepper/EventStepper.vue'
import StepFormat from '~/components/stepper/StepFormat.vue'
import StepGameCount from '~/components/stepper/StepGameCount.vue'
import StepMode from '~/components/stepper/StepMode.vue'
import StepPool from '~/components/stepper/StepPool.vue'
import StepPoints from '~/components/stepper/StepPoints.vue'
import { apiErrorKey } from '~/utils/api-error'
import { draftFromEvent, followTeamSize, settingsBody } from '~/utils/event-draft'
import type { EventView } from '~~/shared/event'
import { eventPath } from '~~/shared/links'
import { settingsEditable, settingsLocked } from '~~/shared/settings'

// The settings editor (`/e/<slug>/einstellungen`, #147): the stepper's steps 2 to 7 on an Event that exists,
// prefilled from it. Only the Host gets it; everyone else (and a link that leads nowhere) sees the generic
// Construction page, like any other address below an Event. Every step is a link from the start, because this
// is an editor, and the last step saves. Once the Event is running, Format, team count, points table and
// Selection mode show locked with their reason; the server refuses a change to them too (setting_locked).
// The step components are imported, not auto-imported (see neu.vue).

const { t } = useI18n()
const { toast } = useToast()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data } = await useFetch<EventView>(() => `/api/e/${slug.value}`)

const STEP_KEYS = ['format', 'games', 'points', 'mode', 'pool', 'tiebreaker'] as const
type StepKey = (typeof STEP_KEYS)[number]

const view = computed(() => (data.value?.event.isHost ? data.value : null))
const editable = computed(() => (view.value ? settingsEditable(view.value.event.phase) : false))
const notSetUp = computed(() => view.value?.settings === null)
// Nothing is locked on an Event that was never set up: it has no rules yet that played games could rely on.
const lockedReason = computed(() => (view.value && !notSetUp.value && settingsLocked(view.value.event.phase) ? t('eventSettings.locked') : undefined))
const floors = computed(() => view.value?.settingsFloors ?? undefined)

const draft = ref(draftFromEvent(data.value ?? { settings: null, pools: { hidden: false, main: [], tiebreaker: [] } }))
// An untouched Veto allowance follows the Team size (#145); a stored one counts as chosen (draftFromEvent).
watch(() => draft.value.settings.teamSize, () => {
  draft.value = followTeamSize(draft.value)
})

const current = ref(0)
/** Why the current step cannot go on; each step reports it through `v-model:blocker`. */
const blocker = ref<string | null>(null)
const saving = ref(false)
const failure = ref<string | null>(null)

const heading = computed(() => t(notSetUp.value ? 'eventSettings.setupHeading' : 'eventSettings.heading'))
useHead({ title: () => `${heading.value} · ${data.value?.event.name ?? ''}` })

const steps = computed(() => STEP_KEYS.map(key => ({ key, label: t(`stepper.steps.${key}.label`) })))
const stepKey = computed<StepKey>(() => STEP_KEYS[current.value]!)
// As on /neu: the info column explains the Format or, on the Selection mode step, the chosen mode.
const infoTopic = computed(() => {
  if (stepKey.value === 'format') return draft.value.settings.format
  if (stepKey.value === 'mode') return draft.value.settings.selectionMode === 'lucky_wheel' ? 'wheel' : 'admin'
  if (stepKey.value === 'tiebreaker') return 'tiebreaker'
  return null
})
const infoTitle = computed(() => (infoTopic.value ? t(`setup.info.${infoTopic.value}.title`) : undefined))
const isLast = computed(() => current.value === STEP_KEYS.length - 1)
const nextLabel = computed(() => {
  if (saving.value) return t('eventSettings.saving')
  return isLast.value ? t('eventSettings.save') : t('stepper.next')
})

function go(index: number) {
  current.value = index
  failure.value = null
}

async function next() {
  if (blocker.value || saving.value) return
  if (!isLast.value) {
    go(current.value + 1)
    return
  }
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/e/${slug.value}/settings`, { method: 'PATCH', body: settingsBody(draft.value) })
    toast({ tone: 'success', text: t('eventSettings.saved') })
    await navigateTo(eventPath(slug.value))
  }
  catch (error) {
    failure.value = t(apiErrorKey(error, 'error.saveFailed', { wrong_phase: 'eventSettings.wrongPhase' }))
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <AppShell
    v-if="!view"
    kind="event"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="event"
  >
    <template #title>
      <span class="min-w-0 truncate text-[22px] leading-none font-bold">{{ view.event.name }}</span>
    </template>

    <div class="mx-auto flex w-full flex-col gap-[18px] px-1">
      <NuxtLink
        :to="eventPath(slug)"
        class="inline-flex items-center gap-1 self-start text-small font-bold text-ink-2 no-underline"
      >
        <AppIcon
          :icon="ChevronLeft"
          :size="14"
        />
        {{ t('eventSettings.back') }}
      </NuxtLink>

      <p
        v-if="!editable"
        role="status"
        class="m-0 font-bold"
      >
        {{ t('eventSettings.wrongPhase') }}
      </p>

      <EventStepper
        v-else
        :steps="steps"
        :current="current"
        :reached="STEP_KEYS.length - 1"
        :nav-title="heading"
        :kicker="t('eventSettings.kicker')"
        :title="t(`stepper.steps.${stepKey}.title`)"
        :info-title="infoTitle"
        :next-label="nextLabel"
        :next-blocked="blocker"
        :busy="saving"
        @go="go"
        @next="next"
        @back="go(current - 1)"
      >
        <StepFormat
          v-if="stepKey === 'format'"
          v-model="draft.settings"
          v-model:blocker="blocker"
          :locked-reason="lockedReason"
          :floors="floors"
        />
        <StepGameCount
          v-else-if="stepKey === 'games'"
          v-model="draft.settings"
          v-model:blocker="blocker"
        />
        <StepPoints
          v-else-if="stepKey === 'points'"
          v-model="draft.settings"
          v-model:blocker="blocker"
          :locked-reason="lockedReason"
        />
        <StepMode
          v-else-if="stepKey === 'mode'"
          v-model="draft"
          v-model:blocker="blocker"
          :locked-reason="lockedReason"
          :floors="floors"
        />
        <StepPool
          v-else-if="stepKey === 'pool'"
          v-model="draft"
          v-model:blocker="blocker"
          kind="main"
        />
        <StepPool
          v-else
          v-model="draft"
          v-model:blocker="blocker"
          kind="tiebreaker"
        />
        <p
          v-if="failure"
          role="alert"
          class="m-0 font-bold text-error-fg"
        >
          {{ failure }}
        </p>

        <template
          v-if="infoTopic"
          #info
        >
          <InfoSheet :topic="infoTopic" />
        </template>
      </EventStepper>
    </div>
  </AppShell>
</template>
