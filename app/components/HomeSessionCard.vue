<script setup lang="ts">
import { formatSlotWhen } from '~/utils/berlin-time'
import type { HomeSession } from '~~/shared/session'

// One Session on Home (screen M1, 02-components). Shows the name and the Host, the phase, the Best
// slot so far (an open poll) or the Date (a set Session), how many Members voted and the User's own
// status. The call to action is „Abstimmen“ while the User still has to vote (primary), „Ansehen“
// once they have voted or a Date is set, and „Öffnen“ for the Host.

const props = defineProps<{ session: HomeSession }>()

const { t } = useI18n()

const isPoll = computed(() => props.session.phase === 'poll')

const hostLine = computed(() => props.session.isHost
  ? t('mvp.home.hostYou')
  : t('mvp.home.hostLabel', { name: props.session.host.name }))

const whenLabel = computed(() => isPoll.value ? t('mvp.home.bestSoFar') : t('mvp.home.date'))
const whenValue = computed(() => {
  if (!isPoll.value) return props.session.startsAt ? formatSlotWhen(new Date(props.session.startsAt)) : ''
  return props.session.bestSlot ? formatSlotWhen(new Date(props.session.bestSlot.startsAt)) : t('mvp.home.noBest')
})

const votedText = computed(() => t('mvp.home.votedCount', {
  n: props.session.progress.voted,
  total: props.session.progress.total,
}))
const ownStatus = computed(() => {
  if (!isPoll.value) return t('mvp.home.setReady')
  return props.session.viewerVoted ? t('mvp.home.voted') : t('mvp.home.notVoted')
})

const CTA_LABEL = { open: 'mvp.home.open', vote: 'mvp.home.vote', view: 'mvp.home.view' } as const
const ctaLabel = computed(() => t(CTA_LABEL[props.session.action]))
</script>

<template>
  <article class="flex h-full min-w-0 flex-col gap-3.5 rounded-[18px] border-2 border-line bg-surface p-5 shadow-card">
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <h3 class="m-0 truncate font-display text-[24px] leading-tight font-normal">
          {{ session.name }}
        </h3>
        <span class="text-[13px] text-ink-2">{{ hostLine }}</span>
      </div>
      <PhasePill :phase="session.phase" />
    </div>

    <div class="flex flex-col gap-0.5">
      <span class="text-[12px] font-bold text-ink-2">{{ whenLabel }}</span>
      <span class="font-num text-[20px] leading-tight tabular-nums">{{ whenValue }}</span>
    </div>

    <div class="flex flex-col gap-1 text-[13px] text-ink-2">
      <span v-if="isPoll">{{ votedText }}</span>
      <span>{{ ownStatus }}</span>
    </div>

    <div class="mt-auto pt-1">
      <AppButton
        :to="`/s/${session.slug}`"
        :variant="session.action === 'vote' ? 'primary' : 'secondary'"
      >
        {{ ctaLabel }}
      </AppButton>
    </div>
  </article>
</template>
