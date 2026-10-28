<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'
import EventSetupWizard from '~/components/stepper/EventSetupWizard.vue'
import { eventDataKey } from '~/utils/event-data'
import { draftFromEvent, settingsBody, type EventDraft, type StepKey } from '~/utils/event-draft'
import type { EventView } from '~~/shared/event'
import { eventPath } from '~~/shared/links'
import { settingsEditable, settingsLocked } from '~~/shared/settings'

// The settings editor (`/e/<slug>/einstellungen`, #147): the setup wizard's steps 2 to 7 (#170) on an Event that exists,
// prefilled from it. Only the Host gets it; everyone else (and a link that leads nowhere) sees the generic
// Construction page, like any other address below an Event. Every step is a link from the start, because this
// is an editor, and the last step saves. Once the Event is running, Format, team count, points table and
// Selection mode show locked with their reason; the server refuses a change to them too (setting_locked).

const { t } = useI18n()
const { toast } = useToast()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data } = await useFetch<EventView>(() => `/api/e/${slug.value}`, { key: () => eventDataKey(slug.value) })

const STEP_KEYS: StepKey[] = ['format', 'games', 'points', 'mode', 'pool', 'tiebreaker']

const view = computed(() => (data.value?.event.isHost ? data.value : null))
const editable = computed(() => (view.value ? settingsEditable(view.value.event.phase) : false))
const notSetUp = computed(() => view.value?.settings === null)
// Nothing is locked on an Event that was never set up: it has no rules yet that played games could rely on.
const lockedReason = computed(() => (view.value && !notSetUp.value && settingsLocked(view.value.event.phase) ? t('eventSettings.locked') : undefined))
const locks = computed(() => ({ reason: lockedReason.value, floors: view.value?.settingsFloors ?? undefined }))

const draft = ref(draftFromEvent(data.value ?? { settings: null, pools: { hidden: false, main: [], tiebreaker: [] } }))

const heading = computed(() => t(notSetUp.value ? 'eventSettings.setupHeading' : 'eventSettings.heading'))
useHead({ title: () => `${heading.value} · ${data.value?.event.name ?? ''}` })

async function save(sent: EventDraft) {
  await $fetch(`/api/e/${slug.value}/settings`, { method: 'PATCH', body: settingsBody(sent) })
  // The Event page reads the same key: refresh it now, so it shows the saved settings at once, not after the next poll (#174).
  await refreshNuxtData(eventDataKey(slug.value))
  toast({ tone: 'success', text: t('eventSettings.saved') })
  await navigateTo(eventPath(slug.value))
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

      <NoticeBanner
        v-if="!editable"
        tone="warning"
      >
        {{ t('eventSettings.wrongPhase') }}
      </NoticeBanner>

      <EventSetupWizard
        v-else
        v-model="draft"
        :steps="STEP_KEYS"
        :locks="locks"
        reach-all
        :nav-title="heading"
        :kicker="t('eventSettings.kicker')"
        :last-label="t('eventSettings.save')"
        :saving-label="t('eventSettings.saving')"
        :error-copy="{ wrong_phase: 'eventSettings.wrongPhase' }"
        :submit="save"
      />
    </div>
  </AppShell>
</template>
