<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import EventStepper from '~/components/stepper/EventStepper.vue'
import StepFormat from '~/components/stepper/StepFormat.vue'
import StepGameCount from '~/components/stepper/StepGameCount.vue'
import StepMode from '~/components/stepper/StepMode.vue'
import StepName from '~/components/stepper/StepName.vue'
import StepPoints from '~/components/stepper/StepPoints.vue'
import StepSessions from '~/components/stepper/StepSessions.vue'
import { apiErrorKey } from '~/utils/api-error'
import { draftBody, followTeamSize, newDraft } from '~/utils/event-draft'
import { settingsSentence } from '~/utils/settings-summary'
import { SLOTS_MAX, type CreatedEvent } from '~~/shared/event'
import { eventPath } from '~~/shared/links'

// Create an Event (screen 05, `?s=create`): the guided stepper (#144) — name, Format with team layout, Game
// count, points table, the Selection mode with the Lucky Wheel's options (#145), then the Sessions and their
// Dates (the old create form, #49). Nothing is sent until „Session erstellen“; then the Fertig screen shows the
// summary and the Invite link. Only Users with the Host permission get it (ADR 0002); everyone else sees the
// Construction page. The server is the final judge. More steps (#146 Game pools) go into STEP_KEYS and the step
// list below. The stepper's components are imported, not auto-imported: Nuxt would name those in `stepper/` with
// a folder prefix.

const { t } = useI18n()
const user = useAuthUser()

const STEP_KEYS = ['name', 'format', 'games', 'points', 'mode', 'sessions'] as const
type StepKey = (typeof STEP_KEYS)[number]

const draft = ref(newDraft())
// An untouched Veto allowance follows the Team size (#145).
watch(() => draft.value.settings.teamSize, () => {
  draft.value = followTeamSize(draft.value)
})
const current = ref(0)
const reached = ref(0)
/** Why the current step cannot go on; each step reports it through `v-model:blocker`. */
const blocker = ref<string | null>(null)
const saving = ref(false)
const failure = ref<string | null>(null)
const created = ref<CreatedEvent | null>(null)
const doneHeading = useTemplateRef('doneHeading')

useHead({ title: () => (created.value ? t('stepper.done.title') : t('stepper.heading')) })

const steps = computed(() => STEP_KEYS.map(key => ({ key, label: t(`stepper.steps.${key}.label`) })))
const stepKey = computed<StepKey>(() => STEP_KEYS[current.value]!)
// The info column explains the Format or, on the Selection mode step, the chosen mode (#145).
const infoTopic = computed(() => {
  if (stepKey.value === 'format') return draft.value.settings.format
  if (stepKey.value === 'mode') return draft.value.settings.selectionMode === 'lucky_wheel' ? 'wheel' : 'admin'
  return null
})
const infoTitle = computed(() => (infoTopic.value ? t(`setup.info.${infoTopic.value}.title`) : undefined))
const isLast = computed(() => current.value === STEP_KEYS.length - 1)
const nextLabel = computed(() => {
  if (saving.value) return t('mvp.create.saving')
  return isLast.value ? t('stepper.create') : t('stepper.next')
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
    created.value = await $fetch<CreatedEvent>('/api/e', { method: 'POST', body: draftBody(draft.value) })
    await nextTick()
    doneHeading.value?.focus()
  }
  catch (error) {
    failure.value = t(apiErrorKey(error), { max: SLOTS_MAX })
  }
  finally {
    saving.value = false
  }
}

const name = computed(() => draft.value.name.trim())
const poll = computed(() => draft.value.dates.mode === 'poll')
const sessionCount = computed(() => draft.value.dates.sessionCount)
const datesLine = computed(() => (poll.value
  ? t('stepper.done.datesPoll', { n: draft.value.dates.slots.length }, draft.value.dates.slots.length)
  : t('stepper.done.datesDirect', { n: sessionCount.value }, sessionCount.value)))
</script>

<template>
  <AppShell
    v-if="!user?.canHost"
    kind="hub"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="hub"
    no-tabs
  >
    <div class="mx-auto flex w-full flex-col gap-[18px] px-1">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 self-start text-small font-bold text-ink-2 no-underline"
      >
        <AppIcon
          :icon="ChevronLeft"
          :size="14"
        />
        {{ t('mvp.create.back') }}
      </NuxtLink>

      <div
        v-if="created"
        class="mx-auto flex w-full max-w-[900px] flex-col gap-3.5"
      >
        <span class="text-small font-bold text-ink-2">{{ t('stepper.done.kicker') }}</span>
        <section class="flex flex-col gap-5 rounded-xl border-3 border-line bg-primary p-5 text-on-primary shadow-card md:flex-row md:items-center">
          <Compibert
            variant="bust"
            :size="120"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <h1
              ref="doneHeading"
              tabindex="-1"
              class="m-0 text-[34px] leading-none outline-none"
            >
              {{ t('stepper.done.heading', { name }) }}
            </h1>
            <p class="m-0 font-semibold text-pretty">
              {{ settingsSentence(draft.settings, t) }}
              {{ poll ? t('mvp.create.doneText') : sessionCount > 1 ? t('mvp.create.doneDirectTextPlural') : t('mvp.create.doneDirectText') }}
            </p>
            <InviteLinkCard :url="created.inviteUrl" />
            <NuxtLink
              :to="eventPath(created.slug)"
              class="inline-flex items-center gap-1 self-start font-extrabold text-on-primary no-underline"
            >
              {{ poll ? t('mvp.create.toPoll') : t('mvp.create.toEvent') }}
              <AppIcon
                :icon="ChevronRight"
                :size="16"
              />
            </NuxtLink>
          </div>
        </section>
        <EventSettingsSummary
          :settings="draft.settings"
          :dates="datesLine"
        />
      </div>

      <EventStepper
        v-else
        :steps="steps"
        :current="current"
        :reached="reached"
        :title="t(`stepper.steps.${stepKey}.title`)"
        :info-title="infoTitle"
        :next-label="nextLabel"
        :next-blocked="blocker"
        :busy="saving"
        @go="go"
        @next="next"
        @back="go(current - 1)"
      >
        <StepName
          v-if="stepKey === 'name'"
          v-model="draft.name"
          v-model:blocker="blocker"
        />
        <StepFormat
          v-else-if="stepKey === 'format'"
          v-model="draft.settings"
          v-model:blocker="blocker"
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
        />
        <StepMode
          v-else-if="stepKey === 'mode'"
          v-model="draft"
          v-model:blocker="blocker"
        />
        <StepSessions
          v-else
          v-model="draft.dates"
          v-model:blocker="blocker"
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
