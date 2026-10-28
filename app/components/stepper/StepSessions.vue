<script setup lang="ts">
import { CalendarCheck, CalendarDays, Minus, Plus, X } from '@lucide/vue'
import { errorCopyKey } from '~/utils/api-error'
import type { EventDraft, SessionsDraft, StepLocks } from '~/utils/event-draft'
import { SESSIONS_MAX, SLOTS_MAX, slotProblems as slotRuleProblems, type SlotProblem } from '~~/shared/event'
import { berlinToUtc, utcToBerlin } from '~~/shared/time'

// The last step: the Sessions and their Dates (#144; the form of the old create page, moved as it was, #49).
// The Session count (1 to 8), then a Date poll with up to 16 Slots (at least one per Session) or one direct
// Date per Session. Times are Berlin wall-clock values; the server is the final judge.
defineProps<{ locks?: StepLocks }>()
const draft = defineModel<EventDraft>({ required: true })
const dates = computed({
  get: () => draft.value.dates,
  set: (value) => {
    draft.value = { ...draft.value, dates: value }
  },
})
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

/** Berlin wall-clock now, minute precision, as the fields' lower bound (ADR 0003). Kept fresh while the form is open. */
const now = ref(utcToBerlin(new Date()))
let refresh: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refresh = setInterval(() => {
    now.value = utcToBerlin(new Date())
  }, 30_000)
})
onBeforeUnmount(() => clearInterval(refresh))

function update(patch: Partial<SessionsDraft>) {
  dates.value = { ...dates.value, ...patch }
}

/** The Session count; the direct rows follow it. */
function setSessionCount(count: number) {
  const direct = dates.value.direct.slice(0, count)
  while (direct.length < count) direct.push('')
  update({ sessionCount: count, direct })
}

function setRow(key: 'slots' | 'direct', index: number, value: string) {
  update({ [key]: dates.value[key].map((row, at) => (at === index ? value : row)) })
}

/** Each row's problem under the server's Slot rules (shared/event.ts); null for an empty row. */
function rowProblems(values: string[]) {
  const instants = values.map(value => (value === '' ? null : berlinToUtc(value)))
  const problems = slotRuleProblems(instants.filter(instant => instant !== null), [], berlinToUtc(now.value))
  let next = 0
  return instants.map(instant => (instant === null ? null : problems[next++] ?? null))
}
const slotProblems = computed(() => rowProblems(dates.value.slots))
const slotErrors = computed(() => slotProblems.value.map(problem => (problem ? t(errorCopyKey(problem)) : undefined)))
// Direct mode: two Sessions on one Date is the Date rule, not a duplicate Slot.
const DIRECT_COPY = { duplicate_slot: 'error.dateDuplicate' }
const directProblems = computed(() => rowProblems(dates.value.direct))
const directErrors = computed(() => directProblems.value.map(problem => (problem ? t(errorCopyKey(problem, DIRECT_COPY)) : undefined)))

/** A past row blocks with its own call to action; any other row error blocks with that row's text. */
function rowBlocker(problems: (SlotProblem | null)[], errors: (string | undefined)[]): string | null {
  if (problems.includes('in_past')) return t('mvp.create.blockedPast')
  return errors.find(error => error !== undefined) ?? null
}

useStepBlocker(blocker, () => {
  const { mode, direct, slots, sessionCount } = dates.value
  if (mode === 'direct') return direct.includes('') ? t('mvp.create.directEmpty') : rowBlocker(directProblems.value, directErrors.value)
  if (slots.includes('')) return t('mvp.create.slotEmpty')
  if (slots.length < sessionCount) return t('mvp.create.minSlots', { n: sessionCount })
  return rowBlocker(slotProblems.value, slotErrors.value)
})

const MODES = computed(() => [
  { value: 'poll', label: t('mvp.create.modePoll'), icon: CalendarDays },
  { value: 'direct', label: t('mvp.create.modeDirect'), icon: CalendarCheck },
])
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <div class="flex flex-col gap-2">
      <b class="text-[14px]">{{ t('mvp.create.sessionsLabel') }}</b>
      <div class="flex items-center gap-3">
        <IconButton
          :icon="Minus"
          :label="t('mvp.create.sessionsLess')"
          :disabled="dates.sessionCount <= 1"
          @click="setSessionCount(dates.sessionCount - 1)"
        />
        <output
          class="min-w-8 text-center font-num text-[22px]"
          aria-live="polite"
        >{{ dates.sessionCount }}</output>
        <IconButton
          :icon="Plus"
          :label="t('mvp.create.sessionsMore')"
          :disabled="dates.sessionCount >= SESSIONS_MAX"
          @click="setSessionCount(dates.sessionCount + 1)"
        />
      </div>
      <p class="m-0 text-small text-pretty text-ink-2">
        {{ t('mvp.create.sessionsHelp') }}
      </p>
    </div>

    <SegmentedControl
      :model-value="dates.mode"
      :label="t('mvp.create.dateLabel')"
      :options="MODES"
      @update:model-value="update({ mode: $event as SessionsDraft['mode'] })"
    />

    <div
      v-if="dates.mode === 'poll'"
      class="flex flex-col gap-2"
    >
      <b class="text-[14px]">{{ t('mvp.create.slotsTitle') }}</b>
      <div
        v-for="(_, index) in dates.slots"
        :key="index"
        class="flex items-start gap-2"
      >
        <DateTimeField
          :model-value="dates.slots[index] ?? ''"
          class="min-w-0 flex-1"
          :label="t('mvp.create.slotLabel', { n: index + 1 })"
          :error="slotErrors[index]"
          @update:model-value="value => setRow('slots', index, value)"
        />
        <IconButton
          v-if="dates.slots.length > 1"
          :icon="X"
          :label="t('mvp.create.removeSlot')"
          class="mt-1"
          @click="update({ slots: dates.slots.filter((_, at) => at !== index) })"
        />
      </div>
      <button
        v-if="dates.slots.length < SLOTS_MAX"
        type="button"
        class="hit-44 inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill border-[2.5px] border-dashed border-line px-3.5 text-small font-bold text-ink outline-memphis lift"
        @click="update({ slots: [...dates.slots, ''] })"
      >
        <AppIcon
          :icon="Plus"
          :size="16"
        />
        {{ t('mvp.create.addSlot') }}
      </button>
      <p class="m-0 text-small text-pretty text-ink-2">
        {{ t('mvp.create.slotsHelp') }}
      </p>
    </div>

    <div
      v-else
      class="flex flex-col gap-[18px]"
    >
      <div
        v-for="(_, index) in dates.direct"
        :key="index"
        class="flex flex-col gap-2"
      >
        <span
          v-if="dates.sessionCount > 1"
          aria-hidden="true"
          class="text-[13px] font-extrabold text-ink-2 uppercase"
        >{{ t('mvp.create.slotLabel', { n: index + 1 }) }}</span>
        <DateTimeField
          :model-value="dates.direct[index] ?? ''"
          :label="dates.sessionCount > 1 ? t('mvp.create.slotLabel', { n: index + 1 }) : t('mvp.create.dateLabel')"
          :error="directErrors[index]"
          @update:model-value="value => setRow('direct', index, value)"
        />
      </div>
    </div>
  </div>
</template>
