<script setup lang="ts">
import { CalendarClock } from '@lucide/vue'
import type { NoteRow } from '~/utils/notes'
import { formatDateTile, formatSetDay, formatSlotDay, formatSlotTime } from '~/utils/berlin-time'

// The card of one Session with its Date (02-components § DateSetCard, screen M3 set / sethost). It
// shows the calendar tile and the full date; with several Sessions also the Session's number. The
// Event page adds the calendar download and "Einladen" once for the whole Event. The Host row (#14
// "Verschieben") is emitted here; Neue Terminsuche and Entfernen go into the `host-actions` slot. Every
// Session card has its Host row (#55), except a Session that has started (#164): it is fixed, so it has no Host row,
// and it says „Läuft seit …“ while it runs or „Beendet“ with its start and end (in Berlin time).
const props = defineProps<{
  /** The Date as a UTC ISO instant. */
  startsAt: string
  /** The Session's number, shown when the Event has several Sessions. */
  number?: number | null
  isHost: boolean
  /** The Notes on the Slot this Date came from (#102), read-only. */
  notes?: NoteRow[]
  /** When the Session started and ended, as UTC ISO instants (#164); null while it has not. */
  startedAt?: string | null
  endedAt?: string | null
}>()

const emit = defineEmits<{ reschedule: [] }>()

const { t } = useI18n()
const instant = computed(() => new Date(props.startsAt))
const tile = computed(() => formatDateTile(instant.value))
const running = computed(() => !!props.startedAt && !props.endedAt)
/** What the started Session says about itself: since when it runs, or from when to when it ran. */
const progress = computed(() => {
  if (!props.startedAt) return null
  const started = new Date(props.startedAt)
  if (!props.endedAt) return t('mvp.set.runningSince', { time: formatSlotTime(started) })
  return t('mvp.set.endedRange', { day: formatSlotDay(started), start: formatSlotTime(started), end: formatSlotTime(new Date(props.endedAt)) })
})
const headline = computed(() => t('mvp.set.dateTime', { date: formatSetDay(instant.value), time: formatSlotTime(instant.value) }))
</script>

<template>
  <section class="flex flex-col gap-5 rounded-[20px] border-(length:--cp-bw) border-line bg-surface p-5.5 text-ink shadow-card md:flex-row md:items-center md:p-[22px]">
    <div
      class="grid size-[130px] flex-none place-items-center self-start rounded-[20px] border-(length:--cp-bw) border-line bg-primary text-center text-on-primary shadow-btn"
      aria-hidden="true"
    >
      <span class="flex flex-col items-center gap-1.5 leading-none">
        <span class="text-[14px] font-extrabold uppercase">{{ tile.weekday }}, {{ tile.month }}</span>
        <span class="font-num text-[56px]">{{ tile.day }}</span>
        <span class="font-num text-[18px]">{{ tile.time }}</span>
      </span>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-2.5">
      <span
        v-if="number"
        class="text-[13px] font-extrabold text-ink-2 uppercase"
      >{{ t('mvp.poll.sessionNumber', { n: number }) }}</span>
      <time
        :datetime="startsAt"
        class="font-display text-[30px] leading-none"
      >
        {{ headline }}
      </time>
      <p
        v-if="progress"
        class="m-0 flex flex-wrap items-center gap-2 font-bold text-ink"
      >
        <span
          class="inline-flex h-7 items-center gap-1.5 rounded-pill border-2 border-line px-2.5 text-[12px] whitespace-nowrap"
          :class="running ? 'bg-hot' : 'bg-surface'"
        >{{ t(running ? 'phase.running' : 'phase.finished') }}</span>
        {{ progress }}
      </p>
      <p
        v-else
        class="m-0 text-pretty text-ink-2"
      >
        {{ t('mvp.poll.setText') }}
      </p>
      <NoteList :notes="notes ?? []" />
      <div
        v-if="isHost && !startedAt"
        class="flex flex-wrap gap-2"
      >
        <AppButton
          variant="secondary"
          size="card"
          @click="emit('reschedule')"
        >
          <AppIcon
            :icon="CalendarClock"
            :size="18"
          />
          {{ t('poll.reschedule') }}
        </AppButton>
        <slot name="host-actions" />
      </div>
    </div>
  </section>
</template>
