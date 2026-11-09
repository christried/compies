<script setup lang="ts">
import { CalendarCheck, ChevronRight, CircleAlert, CircleCheck, Sparkles } from '@lucide/vue'
import { formatSlotWhen } from '~/utils/berlin-time'
import { pagePill } from '~/utils/event-page'
import { datePollOpen, type HomeEvent } from '~~/shared/event'
import { eventPath } from '~~/shared/links'

// One Event on Home (screen M1, 02-components). Shows the name and the Host, the phase, the Best
// slot so far while Dates are missing (or the Date of an open poll) or the next Session once all
// Dates are set, how many Sessions wait for a Date, how many Members voted and the User's own status.
// The call to action asks the User to vote while they still have to (primary), lets them view the
// Event once they have voted or a Date is set, and opens it for the Host.

const props = defineProps<{ event: HomeEvent }>()

const { t } = useI18n()

// The Date poll is open while a Session waits for a Date, also in a running Event (#164, datePollOpen).
const isPoll = computed(() => datePollOpen(props.event.phase, props.event.missingDates))
// The pill says what the Event page's header says: a started Event with no Session left reads „Kein Termin“ with the grey dot, not „Läuft“, until
// the Host finishes it (pagePill, #277; the rule is noSessionLeft, review 0.8 N5).
const pill = computed(() => {
  const shown = props.event.noDate ? pagePill({ kind: 'done', next: null }) : null
  return shown ? { phase: shown.phase, label: t('phase.noDate') } : { phase: props.event.phase, label: undefined }
})
const hasSeveralSessions = computed(() => props.event.sessionCount > 1)
const datesMissing = computed(() => props.event.missingDates > 0)

const hostLine = computed(() => props.event.isHost
  ? t('mvp.home.hostYou')
  : t('mvp.home.hostLabel', { name: props.event.host.name }))

// While Dates are missing the card shows the Best slot, as it does for a poll.
const showsBestSlot = computed(() => isPoll.value || datesMissing.value)
const whenLabel = computed(() => showsBestSlot.value ? t('mvp.home.bestSoFar') : t('mvp.home.date'))
const whenValue = computed(() => {
  if (showsBestSlot.value) {
    return props.event.bestSlot ? formatSlotWhen(new Date(props.event.bestSlot.startsAt)) : t('mvp.home.noBest')
  }
  const next = props.event.nextSession
  if (!next) return ''
  const when = formatSlotWhen(new Date(next.startsAt))
  // The server sends the number the Session is shown with: none while the Event has one Session (#70).
  return next.number !== null
    ? `${t('mvp.home.sessionOf', { n: next.number, total: props.event.sessionCount })} · ${when}`
    : when
})

const datesText = computed(() => t('mvp.home.datesStanding', {
  n: props.event.sessionCount - props.event.missingDates,
  total: props.event.sessionCount,
}))
const votedText = computed(() => t('mvp.home.votedCount', {
  n: props.event.progress.voted,
  total: props.event.progress.total,
}))
const ownStatus = computed(() => {
  if (!isPoll.value) return t('mvp.home.setReady')
  return props.event.viewerVoted ? t('mvp.home.voted') : t('mvp.home.notVoted')
})

const CTA_LABEL = { open: 'mvp.home.open', vote: 'mvp.home.vote', view: 'mvp.home.view' } as const
const ctaLabel = computed(() => t(CTA_LABEL[props.event.action]))

const WhenIcon = computed(() => showsBestSlot.value ? Sparkles : CalendarCheck)
// Not voted yet: the own status warns (icon + words), otherwise it is plain good news.
const warnsVote = computed(() => isPoll.value && !props.event.viewerVoted)
const showsDates = computed(() => hasSeveralSessions.value && datesMissing.value)
</script>

<template>
  <article
    class="flex h-full min-w-0 flex-col gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-[18px] text-ink"
    :class="event.action === 'vote' && 'shadow-card'"
  >
    <div class="flex min-w-0 items-start gap-2.5">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 class="m-0 font-display text-[26px] leading-[1.05] font-normal text-pretty [overflow-wrap:anywhere]">
          {{ event.name }}
        </h3>
        <span class="text-[13px] text-ink-2">{{ hostLine }}</span>
      </div>
      <PhasePill
        :phase="pill.phase"
        :label="pill.label"
      />
    </div>

    <div
      v-if="whenValue"
      class="flex items-center gap-3 rounded-[12px] bg-paper-2 px-3 py-2.5"
    >
      <AppIcon
        :icon="WhenIcon"
        :size="18"
      />
      <div class="flex min-w-0 flex-1 flex-col leading-[1.3]">
        <span class="text-[12px] font-bold text-ink-2">{{ whenLabel }}</span>
        <b>{{ whenValue }}</b>
      </div>
    </div>

    <div class="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <div class="flex min-w-[150px] flex-1 flex-col gap-0.5 text-[13px]">
        <span
          v-if="showsDates"
          class="font-semibold text-ink-2"
        >{{ datesText }}</span>
        <span
          v-if="isPoll"
          class="font-semibold text-ink-2"
        >{{ votedText }}</span>
        <span
          class="inline-flex items-center gap-1.5 font-bold"
          :class="warnsVote ? 'text-warning-fg' : 'text-success-fg'"
        >
          <AppIcon
            :icon="warnsVote ? CircleAlert : CircleCheck"
            :size="15"
          />
          {{ ownStatus }}
        </span>
      </div>
      <AppButton
        :to="eventPath(event.slug)"
        :variant="event.action === 'vote' ? 'primary' : 'secondary'"
      >
        {{ ctaLabel }}
        <AppIcon
          :icon="ChevronRight"
          :size="16"
        />
      </AppButton>
    </div>
  </article>
</template>
