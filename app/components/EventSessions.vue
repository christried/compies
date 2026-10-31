<script setup lang="ts">
import { ArrowDown, CalendarClock, Download, Plus, Search, Trash2 } from '@lucide/vue'
import { formatSessionWhen, formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { pollingNumber } from '~/utils/event-page'
import { jumpTo, pollHeadingId } from '~/utils/jump'
import { noteRows } from '~/utils/notes'
import { SESSIONS_MAX, sessionsEditable, type EventView } from '~~/shared/event'

// The Sessions card of the Event page (#49, #55, #166, 11-event-seite § EventSessions): one row per Session with its
// number, when it is (or who still has to vote), its state and what the viewer can do. Sessions that wait for a Date are
// numbered after the dated ones, as the dock's „Termin für Session m“. Everybody can put a dated Session in their calendar
// (the calendar sheet, #81); the Host moves it (Verschieben), starts a new search for its Date (Neue Terminsuche) or
// removes it, both as one second holds (#74), as long as it has not started. A Session that polls links to the poll. „Session
// hinzufügen“ sits at the end. The Event page runs the actions and opens the dialogs and sheets.
const props = withDefaults(defineProps<{
  view: EventView
  /** Neue Terminsuche and Entfernen: each resolves to whether the server took it. */
  reopen: (sessionId: string) => Promise<boolean>
  remove: (sessionId: string) => Promise<boolean>
  /** The shown number of the Session whose poll is on the page, and whether the poll is on the page at all. */
  pollNumber?: number | null
  pollOpen?: boolean
  /** The card stands out (shadow) when it is the news of the page (between two Sessions). */
  shadow?: boolean
}>(), { pollNumber: null, pollOpen: false, shadow: false })

const emit = defineEmits<{
  reschedule: [sessionId: string]
  add: []
  calendar: []
}>()

const { t } = useI18n()
const headingId = useId()

const several = computed(() => props.view.sessions.length > 1)
const isHost = computed(() => props.view.event.isHost)
const canChangeSessions = computed(() => sessionsEditable(props.view.event.phase))
const full = computed(() => props.view.sessions.length >= SESSIONS_MAX)

type RowKind = 'poll' | 'set' | 'running' | 'ended'
// The look of the state pill (design `PILL`): the text carries the meaning, the dot only adds colour.
const PILL: Record<RowKind, { label: string, background: string, dot: string }> = {
  poll: { label: 'phase.poll', background: 'bg-surface text-ink', dot: 'bg-info' },
  set: { label: 'phase.dateSet', background: 'bg-surface text-ink', dot: 'bg-success' },
  running: { label: 'phase.running', background: 'bg-primary text-on-primary', dot: 'bg-hot' },
  ended: { label: 'phase.finished', background: 'bg-surface text-ink', dot: 'bg-ink' },
}

const rows = computed(() => {
  let nth = 0
  return props.view.sessions.map((session) => {
    const number = session.startsAt === null ? pollingNumber(props.view.sessions, props.view.missingDates, ++nth) : session.number
    const kind: RowKind = session.startsAt === null ? 'poll' : session.endedAt ? 'ended' : session.startedAt ? 'running' : 'set'
    const started = session.startedAt ? new Date(session.startedAt) : null
    return {
      id: session.id,
      number,
      kind,
      startsAt: session.startsAt,
      when: session.startsAt === null ? null : formatSessionWhen(new Date(session.startsAt)),
      progress: kind === 'running' && started
        ? t('mvp.set.runningSince', { time: formatSlotTime(started) })
        : kind === 'ended' && started && session.endedAt
          ? t('mvp.set.endedRange', { day: formatSlotDay(started), start: formatSlotTime(started), end: formatSlotTime(new Date(session.endedAt)) })
          : null,
      notes: session.startsAt === null ? [] : noteRows(session.notes, props.view.members, props.view.viewerId),
    }
  })
})

const title = (number: number | null) => (number === null ? t('event.sessions.session') : t('event.sessions.sessionN', { n: number }))
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex flex-col gap-1 rounded-[16px] border-(length:--cp-bw) border-line bg-surface px-4 pt-4 pb-2 text-ink"
    :class="shadow && 'shadow-card'"
  >
    <div class="flex items-baseline gap-2.5">
      <h2
        :id="headingId"
        class="m-0 text-[18px] font-extrabold"
      >
        {{ t('event.sessions.title') }}
      </h2>
      <span class="text-[13px] font-semibold text-ink-2">{{ t('event.sessions.count', { n: view.sessions.length }, view.sessions.length) }}</span>
    </div>

    <ol class="m-0 flex list-none flex-col p-0">
      <li
        v-for="(row, index) in rows"
        :key="row.id"
        class="flex min-h-15 flex-wrap items-center gap-x-3 gap-y-2 py-2"
        :class="index > 0 && 'border-t-2 border-line-soft'"
      >
        <span
          class="grid size-9 flex-none place-items-center rounded-full border-2 border-line font-num text-[15px]"
          :class="row.kind === 'running' ? 'bg-primary text-on-primary' : 'bg-surface'"
          aria-hidden="true"
        >{{ row.number ?? index + 1 }}</span>

        <div class="flex min-w-30 flex-1 flex-col leading-[1.3]">
          <b class="text-[15px]">{{ title(row.number) }}</b>
          <span class="text-[13px] font-semibold text-ink-2">
            <time
              v-if="row.startsAt && !row.progress"
              :datetime="row.startsAt"
            >{{ row.when }}</time>
            <template v-else-if="row.progress">{{ row.progress }}</template>
            <template v-else>{{ t('event.sessions.voted', view.progress) }}</template>
          </span>
        </div>

        <span
          class="inline-flex h-6 flex-none items-center gap-1.5 rounded-pill border-2 border-line px-[9px] text-[12px] font-extrabold whitespace-nowrap"
          :class="PILL[row.kind].background"
        >
          <span
            class="size-[7px] rounded-full border-[1.5px] border-line"
            :class="PILL[row.kind].dot"
            aria-hidden="true"
          />
          {{ t(PILL[row.kind].label) }}
        </span>

        <div
          v-if="row.kind === 'set' || (row.kind === 'poll' && pollOpen)"
          class="flex flex-wrap items-center gap-2"
        >
          <template v-if="row.kind === 'set'">
            <AppButton
              v-if="isHost"
              variant="secondary"
              @click="emit('reschedule', row.id)"
            >
              <AppIcon
                :icon="CalendarClock"
                :size="16"
              />
              {{ t('poll.reschedule') }}
            </AppButton>
            <template v-if="isHost && canChangeSessions">
              <HoldToConfirmButton
                variant="secondary"
                size="dock"
                hint="badge"
                :label="t('mvp.reopen.cta')"
                :icon="Search"
                :action="() => reopen(row.id)"
              />
              <HoldToConfirmButton
                v-if="several"
                variant="secondary"
                size="dock"
                hint="badge"
                :label="t('mvp.sessions.remove')"
                :icon="Trash2"
                :action="() => remove(row.id)"
              />
            </template>
            <IconButton
              :icon="Download"
              :label="row.number === null ? t('event.sessions.calendarSingle') : t('event.sessions.calendar', { n: row.number })"
              :size="36"
              aria-haspopup="dialog"
              @click="emit('calendar')"
            />
          </template>
          <AppButton
            v-else
            variant="secondary"
            @click="jumpTo(pollHeadingId(pollNumber))"
          >
            {{ isHost ? t('event.sessions.toPoll') : t('event.sessions.vote') }}
            <AppIcon
              :icon="ArrowDown"
              :size="16"
            />
          </AppButton>
        </div>

        <div
          v-if="row.notes.length > 0"
          class="basis-full pl-12"
        >
          <NoteList :notes="row.notes" />
        </div>
      </li>
    </ol>

    <template v-if="isHost && canChangeSessions">
      <button
        v-if="!full"
        type="button"
        class="inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-[13px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
        @click="emit('add')"
      >
        <AppIcon
          :icon="Plus"
          :size="14"
        />
        {{ t('mvp.sessions.add') }}
      </button>
      <p
        v-else
        class="m-0 py-2 text-small font-bold text-ink-2"
      >
        {{ t('mvp.sessions.max', { max: SESSIONS_MAX }) }}
      </p>
    </template>
  </section>
</template>
