<script setup lang="ts">
import { CalendarCheck, Check, Minus, Sparkles, X } from '@lucide/vue'
import type { VoteValue } from '~~/shared/poll'

// One proposed Slot in the poll (02-components § PollSlotCard, screen M3). The three vote options are
// a radiogroup labelled with the Slot. A past Slot is marked vorbei and cannot be voted on. The
// Host can pick the Slot on desktop from the card; phones use the host sheet instead.
export interface PollSlotView {
  id: string
  day: string
  time: string
  past: boolean
}

const props = defineProps<{
  timeslot: PollSlotView
  counts: { yes: number, maybe: number, no: number }
  /** Members in the Session, the base for the bars. */
  total: number
  myVote: VoteValue | null
  best: boolean
  canPick?: boolean
}>()

const emit = defineEmits<{ vote: [value: VoteValue], pick: [] }>()

const { t } = useI18n()

const label = computed(() => `${props.timeslot.day} ${props.timeslot.time}`)
const share = (count: number) => (props.total > 0 ? `${(count / props.total) * 100}%` : '0%')

const OPTIONS = [
  { value: 'yes', key: 'poll.yes', icon: Check, fill: 'bg-success text-on-success' },
  { value: 'maybe', key: 'poll.maybe', icon: Minus, fill: 'bg-warning text-on-warning' },
  { value: 'no', key: 'poll.no', icon: X, fill: 'bg-ink text-paper' },
] as const

function choose(value: VoteValue) {
  if (props.timeslot.past) return
  emit('vote', value)
}
</script>

<template>
  <article
    class="relative flex flex-col gap-2.5 rounded-[14px] border-(length:--cp-bw) bg-surface p-4 pt-4 text-ink"
    :class="[best ? 'border-focus shadow-card' : 'border-line', timeslot.past && 'opacity-60']"
    :data-best="best ? 'true' : undefined"
    :data-slot="timeslot.id"
  >
    <span
      v-if="best"
      class="absolute -top-3 left-3 inline-flex h-6 items-center gap-1 rounded-pill border-2 border-line bg-primary px-2.5 text-[11px] font-extrabold text-on-primary"
    >
      <AppIcon
        :icon="Sparkles"
        :size="11"
      />
      {{ t('poll.best') }}
    </span>
    <div class="flex items-baseline justify-between gap-2">
      <b>{{ timeslot.day }}</b>
      <span class="font-num text-[24px] leading-none">{{ timeslot.time }}</span>
    </div>
    <span
      v-if="timeslot.past"
      class="self-start rounded-pill border-2 border-line px-2 text-[11px] font-bold text-ink-2"
    >{{ t('mvp.poll.past') }}</span>
    <div
      class="flex h-2.5 overflow-hidden rounded-pill border-(length:--cp-bw) border-line bg-paper-2"
      aria-hidden="true"
    >
      <span
        class="bg-success"
        :style="{ width: share(counts.yes) }"
      />
      <span
        class="bg-warning"
        :style="{ width: share(counts.maybe) }"
      />
    </div>
    <span class="text-[12px]">
      <b><CpNum :value="counts.yes" /> {{ t('poll.yes') }}</b>,
      <CpNum :value="counts.maybe" /> {{ t('poll.maybe') }},
      <CpNum :value="counts.no" /> {{ t('poll.no') }}
    </span>
    <div
      role="radiogroup"
      :aria-label="label"
      :aria-disabled="timeslot.past ? 'true' : undefined"
      class="grid grid-cols-3 overflow-hidden rounded-pill border-2 border-line"
    >
      <button
        v-for="(option, index) in OPTIONS"
        :key="option.value"
        type="button"
        role="radio"
        :aria-checked="myVote === option.value ? 'true' : 'false'"
        :aria-disabled="timeslot.past ? 'true' : undefined"
        class="outline-memphis hit-44 flex h-11 items-center justify-center gap-1 text-[12px] font-bold transition-colors dur-instant"
        :class="myVote === option.value ? option.fill : 'bg-transparent text-ink-2'"
        :style="index > 0 ? { borderLeft: '2px solid var(--cp-line)' } : undefined"
        @click="choose(option.value)"
      >
        <AppIcon
          :icon="option.icon"
          :size="13"
        />
        {{ t(option.key) }}
      </button>
    </div>
    <button
      v-if="canPick && !timeslot.past"
      type="button"
      class="outline-memphis hit-44 flex h-11 items-center justify-center gap-1.5 rounded-pill border-(length:--cp-bw) border-line font-bold shadow-btn max-md:hidden"
      :class="best ? 'bg-primary text-on-primary' : 'bg-surface text-ink'"
      @click="emit('pick')"
    >
      <AppIcon
        :icon="CalendarCheck"
        :size="14"
      />
      {{ t('mvp.poll.pickThis') }}
    </button>
  </article>
</template>
