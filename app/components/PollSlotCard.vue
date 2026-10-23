<script setup lang="ts">
import { CalendarCheck, Check, Minus, Sparkles, X } from '@lucide/vue'
import { VOTE_VALUES, type VoteValue } from '~~/shared/poll'

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
  /** Members in the Event, the base for the bars. */
  total: number
  myVote: VoteValue | null
  best: boolean
  canPick?: boolean
}>()

const emit = defineEmits<{ vote: [value: VoteValue], pick: [] }>()

const { t } = useI18n()

const label = computed(() => `${props.timeslot.day} ${props.timeslot.time}`)
const share = (count: number) => (props.total > 0 ? `${(count / props.total) * 100}%` : '0%')

const options = computed(() => [
  { value: 'yes', label: t('poll.yes'), icon: Check, fill: 'bg-success text-on-success' },
  { value: 'maybe', label: t('poll.maybe'), icon: Minus, fill: 'bg-warning text-on-warning' },
  { value: 'no', label: t('poll.no'), icon: X, fill: 'bg-error text-on-error' },
])

// The control reports a string; only a known vote value is emitted, so no cast is needed.
function choose(value: string) {
  const vote = VOTE_VALUES.find(known => known === value)
  if (!vote || props.timeslot.past) return
  emit('vote', vote)
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
    <SegmentedControl
      :model-value="myVote ?? ''"
      :options="options"
      :label="label"
      :disabled="timeslot.past"
      @update:model-value="choose"
    />
    <AppButton
      v-if="canPick && !timeslot.past"
      :variant="best ? 'primary' : 'secondary'"
      class="max-md:hidden"
      @click="emit('pick')"
    >
      <template #icon>
        <AppIcon
          :icon="CalendarCheck"
          :size="14"
        />
      </template>
      {{ t('mvp.poll.pickThis') }}
    </AppButton>
  </article>
</template>
