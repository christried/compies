<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import EventSetupWizard from '~/components/stepper/EventSetupWizard.vue'
import { draftBody, newDraft, settingsOf, type EventDraft, type StepKey } from '~/utils/event-draft'
import { settingsSentence } from '~/utils/settings-summary'
import type { CreatedEvent } from '~~/shared/event'
import { eventPath } from '~~/shared/links'

// Create an Event (screen 05, `?s=create`): the guided wizard (#144, #170) — name, Format with team layout, Game
// count, points table, the Selection mode with the Lucky Wheel's options (#145), the Game pool and the Tiebreaker
// pool (#146), then the Sessions and their Dates (the old create form, #49). Nothing is sent until „Event erstellen“; then the Fertig screen shows the
// summary and the Invite link. Only Users with the Host permission get it (ADR 0002); everyone else sees the
// Construction page. The server is the final judge. A step goes into STEP_KEYS here and into the wizard's step map.

const { t } = useI18n()
const user = useAuthUser()

const STEP_KEYS: StepKey[] = ['name', 'format', 'games', 'points', 'mode', 'pool', 'tiebreaker', 'sessions']

const draft = ref(newDraft())
const created = ref<CreatedEvent | null>(null)
const doneHeading = useTemplateRef('doneHeading')

useHead({ title: () => (created.value ? t('stepper.done.title') : t('stepper.heading')) })

async function create(sent: EventDraft) {
  created.value = await $fetch<CreatedEvent>('/api/e', { method: 'POST', body: draftBody(sent) })
  await nextTick()
  doneHeading.value?.focus()
}

const name = computed(() => draft.value.name.trim())
const settings = computed(() => settingsOf(draft.value))
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
      <BackLink
        to="/"
        :label="t('mvp.create.back')"
      />

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
              {{ settingsSentence(settings, t) }}
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
          :settings="settings"
          :pools="{ main: draft.pools.main.length, tiebreaker: draft.pools.tiebreaker.length }"
          :dates="datesLine"
        />
      </div>

      <EventSetupWizard
        v-else
        v-model="draft"
        :steps="STEP_KEYS"
        :last-label="t('stepper.create')"
        :saving-label="t('common.saving')"
        :submit="create"
      />
    </div>
  </AppShell>
</template>
