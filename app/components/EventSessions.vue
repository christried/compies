<script setup lang="ts">
import { ArrowDown, CalendarClock, Download, Ellipsis, Plus, Search, Trash2 } from '@lucide/vue'
import type { MoveTarget } from '~/components/MoveToMenuList.vue'
import { formatSessionWhen, formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { sessionMenuKeys, shownSessionNumbers, type SessionMenuKey } from '~/utils/event-page'
import { jumpTo, pollHeadingId } from '~/utils/jump'
import { noteRows } from '~/utils/notes'
import { SESSIONS_MAX, type EventView } from '~~/shared/event'
import { isStarted, sessionState, type SessionState } from '~~/shared/session-state'

// The Sessions card of the Event page (#49, #55, #166, 11-event-seite § EventSessions): one row per Session with its
// number, when it is (or who still has to vote), its state and what the viewer can do. Sessions that wait for a Date are
// numbered after the dated ones, as the dock's „Termin für Session m“. Everybody can put a dated Session in their calendar
// (the calendar sheet, #81); the Host moves it (Verschieben), starts a new search for its Date (Neue Terminsuche) or
// removes it, both as one second holds (#74), as long as it has not started. All of that sits in one „Mehr“ menu at the end of
// the row (#349, the MoveToMenu, sessionMenuKeys says which entries); a Session that polls links to the poll instead. The Notes of
// a Slot are a collapsed disclosure under the row. „Session hinzufügen“ sits at the end. The Event page runs the actions and opens
// the dialogs and sheets.
const props = withDefaults(defineProps<{
  view: EventView
  /** Neue Terminsuche and Entfernen: each resolves to whether the server took it. */
  reopen: (sessionId: string) => Promise<boolean>
  remove: (sessionId: string) => Promise<boolean>
  /** The shown number of the Session whose poll is on the page, and whether the poll is on the page at all. */
  pollNumber?: number | null
  pollOpen?: boolean
  /** Sessions can be added, moved and removed in this Phase (the page's sessionsEditable, #238). */
  canChangeSessions?: boolean
  /** The card stands out (shadow) when it is the news of the page (between two Sessions). */
  shadow?: boolean
}>(), { pollNumber: null, pollOpen: false, canChangeSessions: false, shadow: false })

const emit = defineEmits<{
  reschedule: [sessionId: string]
  add: []
  calendar: []
}>()

const { t } = useI18n()
const headingId = useId()

const several = computed(() => props.view.sessions.length > 1)
const isHost = computed(() => props.view.event.isHost)
const full = computed(() => props.view.sessions.length >= SESSIONS_MAX)

// The look of the state pill (design `PILL`): the text carries the meaning, the dot only adds colour.
const PILL: Record<SessionState, { label: string, background: string, dot: string }> = {
  undated: { label: 'phase.poll', background: 'bg-surface text-ink', dot: 'bg-info' },
  set: { label: 'phase.dateSet', background: 'bg-surface text-ink', dot: 'bg-success' },
  running: { label: 'phase.running', background: 'bg-primary text-on-primary', dot: 'bg-hot' },
  ended: { label: 'phase.finished', background: 'bg-surface text-ink', dot: 'bg-ink' },
}

const rows = computed(() => {
  const numbers = shownSessionNumbers(props.view.sessions, props.view.missingDates)
  return props.view.sessions.map((session, index) => {
    const number = numbers[index] ?? null
    const kind = sessionState(session)
    const started = isStarted(session) ? new Date(session.startedAt) : null
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

const menuKeys = (row: (typeof rows.value)[number]) => sessionMenuKeys({ kind: row.kind, isHost: isHost.value, canChangeSessions: props.canChangeSessions, several: several.value })

// The „Mehr“ menu of the row whose trigger was pressed (as the GameBoard's, #160).
const menu = ref<{ rowId: string, anchor: HTMLElement } | null>(null)

function openMenu(event: MouseEvent, rowId: string) {
  menu.value = { rowId, anchor: event.currentTarget as HTMLElement }
}

/** Closes the menu and gives the focus back to the trigger, which is gone when its row turned into a poll. */
function closeMenu() {
  const anchor = menu.value?.anchor
  menu.value = null
  if (anchor?.isConnected) anchor.focus()
}

/** A hold entry: the menu closes once the server took the action; a refusal leaves it open and the hold goes idle by itself (#74). */
const holdThen = (run: () => Promise<boolean>) => async () => {
  const worked = await run()
  if (worked) closeMenu()
  return worked
}

const menuRow = computed(() => rows.value.find(row => row.id === menu.value?.rowId))
const menuTitle = computed(() => (menuRow.value ? t('event.sessions.more', { title: title(menuRow.value.number) }) : ''))

const targets = computed<MoveTarget[]>(() => {
  const row = menuRow.value
  if (!row) return []
  const entry = (key: SessionMenuKey): MoveTarget => {
    switch (key) {
      case 'calendar': return { key, label: row.number === null ? t('event.sessions.calendarSingle') : t('event.sessions.calendar', { n: row.number }), icon: Download, reason: null }
      case 'reschedule': return { key, label: t('poll.reschedule'), icon: CalendarClock, reason: null }
      case 'reopen': return { key, label: t('mvp.reopen.cta'), icon: Search, reason: null, hold: holdThen(() => props.reopen(row.id)) }
      case 'remove': return { key, label: t('mvp.sessions.remove'), icon: Trash2, reason: null, hold: holdThen(() => props.remove(row.id)) }
    }
  }
  return menuKeys(row).map(entry)
})

/** A plain entry: the menu closes first, so the focus is on the trigger before a dialog or sheet opens (as HostDock.runFromMenu). */
function pick(key: string) {
  const rowId = menu.value?.rowId
  if (rowId === undefined) return
  closeMenu()
  if (key === 'calendar') emit('calendar')
  else if (key === 'reschedule') emit('reschedule', rowId)
}
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
          v-if="menuKeys(row).length > 0 || (row.kind === 'undated' && pollOpen)"
          class="flex flex-none items-center gap-2"
        >
          <AppButton
            v-if="row.kind === 'undated' && pollOpen"
            variant="secondary"
            @click="jumpTo(pollHeadingId(pollNumber))"
          >
            {{ isHost ? t('event.sessions.toPoll') : t('event.sessions.vote') }}
            <AppIcon
              :icon="ArrowDown"
              :size="16"
            />
          </AppButton>
          <IconButton
            v-else
            :icon="Ellipsis"
            :label="t('event.sessions.more', { title: title(row.number) })"
            :size="40"
            aria-haspopup="menu"
            :aria-expanded="menu?.rowId === row.id"
            @click="openMenu($event, row.id)"
          />
        </div>

        <div
          v-if="row.notes.length > 0"
          class="basis-full pl-12"
        >
          <GameNotesDisclosure :label="t('mvp.notes.headingCount', { n: row.notes.length }, row.notes.length)">
            <NoteList
              :notes="row.notes"
              :heading="false"
            />
          </GameNotesDisclosure>
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

    <MoveToMenu
      :open="menu !== null"
      :title="menuTitle"
      :targets="targets"
      :anchor="menu?.anchor ?? null"
      @close="menu = null"
      @pick="pick"
    />
  </section>
</template>
