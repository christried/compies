<script setup lang="ts">
import { formatSlotWhen } from '~/utils/berlin-time'
import type { HomeEvent } from '~~/shared/event'

// One Event on Home (screen M1, 02-components). Shows the name and the Host, the phase, the Best
// slot so far while Dates are missing (or the Date of an open poll) or the next Session once all
// Dates are set, how many Sessions wait for a Date, how many Members voted and the User's own status.
// The call to action asks the User to vote while they still have to (primary), lets them view the
// Event once they have voted or a Date is set, and opens it for the Host.

const props = defineProps<{ event: HomeEvent }>()

const { t } = useI18n()

const isPoll = computed(() => props.event.phase === 'poll')
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
  return hasSeveralSessions.value && next.number !== null
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
</script>

<template>
  <article class="flex h-full min-w-0 flex-col gap-3.5 rounded-[20px] border-2 border-line bg-surface p-5 shadow-card">
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <h3 class="m-0 truncate font-display text-[24px] leading-tight font-normal">
          {{ event.name }}
        </h3>
        <span class="text-[13px] text-ink-2">{{ hostLine }}</span>
      </div>
      <PhasePill :phase="event.phase" />
    </div>

    <div class="flex flex-col gap-0.5">
      <span class="text-[12px] font-bold text-ink-2">{{ whenLabel }}</span>
      <span class="font-num text-[20px] leading-tight tabular-nums">{{ whenValue }}</span>
    </div>

    <div class="flex flex-col gap-1 text-[13px] text-ink-2">
      <span v-if="hasSeveralSessions && datesMissing">{{ datesText }}</span>
      <span v-if="isPoll">{{ votedText }}</span>
      <span>{{ ownStatus }}</span>
    </div>

    <div class="mt-auto pt-1">
      <AppButton
        :to="`/e/${event.slug}`"
        :variant="event.action === 'vote' ? 'primary' : 'secondary'"
      >
        {{ ctaLabel }}
      </AppButton>
    </div>
  </article>
</template>
