<script setup lang="ts">
import { CalendarPlus, CircleAlert, Link as LinkIcon, Plus, Search, Trash2 } from '@lucide/vue'
import { formatSetDay, formatSlotTime } from '~/utils/berlin-time'
import { SESSIONS_MAX, sessionsEditable, type DatedSessionView, type EventView } from '~~/shared/event'

// The Sessions part of the Event page (#49, #55). On top, the notice of every Date that was withdrawn, by a
// Reopen or with a removed Session (#14, #65). Each Session with a Date gets a DateSetCard, with the number the
// server sends for it (#70), then one "In den Kalender" (the calendar sheet, #81) and one "Einladen" for the
// whole Event. The Host acts on each card: Verschieben, Neue Terminsuche and Entfernen. "Session hinzufügen"
// sits after the cards. The Event page runs the actions and opens the dialogs and sheets.
const props = defineProps<{
  view: EventView
  slug: string
  /** Bumped by the page when a Reopen or a removal is refused, so its hold button starts again from zero. */
  holdEpoch: number
}>()

const emit = defineEmits<{
  reschedule: [sessionId: string]
  reopen: [sessionId: string]
  remove: [sessionId: string]
  add: []
  invite: []
  calendar: []
}>()

const { t } = useI18n()

/** The dated Sessions, in Date order with their numbers. */
const datedSessions = computed(() => props.view.sessions.filter((session): session is DatedSessionView => session.startsAt !== null))

/** Sessions can be added, removed and reopened in every Phase before the Event finishes (#55, sessionsEditable). */
const canChangeSessions = computed(() => sessionsEditable(props.view.event.phase))
const full = computed(() => props.view.sessions.length >= SESSIONS_MAX)

/** The withdrawn Date as the notice shows it, in Berlin time. */
function whenOf(iso: string) {
  const instant = new Date(iso)
  return t('mvp.set.dateTime', { date: formatSetDay(instant), time: formatSlotTime(instant) })
}

/** The Reopen notices of the Sessions and of the removed ones (#65), and how a Member closes one (#14, useReopenNotices). */
const noticeSessions = computed(() => [...props.view.sessions, ...props.view.removedSessions])
const { notices: reopenNotices, close: closeReopenNotice } = useReopenNotices(noticeSessions)
</script>

<template>
  <NoticeBanner
    v-for="session in reopenNotices"
    :key="session.id"
    tone="warning"
    :icon="CircleAlert"
    @close="closeReopenNotice(session)"
  >
    {{ t('mvp.reopen.notice', { when: whenOf(session.previousStartsAt) }) }}
  </NoticeBanner>

  <template v-if="datedSessions.length > 0">
    <DateSetCard
      v-for="session in datedSessions"
      :key="session.id"
      :starts-at="session.startsAt"
      :number="session.number"
      :is-host="view.event.isHost"
      @reschedule="emit('reschedule', session.id)"
    >
      <template #host-actions>
        <HoldToConfirmButton
          v-if="canChangeSessions"
          :key="`reopen-${session.id}-${holdEpoch}`"
          variant="secondary"
          size="card"
          :label="t('mvp.reopen.cta')"
          :icon="Search"
          @confirm="emit('reopen', session.id)"
        />
        <HoldToConfirmButton
          v-if="canChangeSessions && view.sessions.length > 1"
          :key="`remove-${session.id}-${holdEpoch}`"
          variant="secondary"
          size="card"
          :label="t('mvp.sessions.remove')"
          :icon="Trash2"
          @confirm="emit('remove', session.id)"
        />
      </template>
    </DateSetCard>

    <div class="flex flex-wrap gap-2">
      <AppButton
        size="card"
        aria-haspopup="dialog"
        @click="emit('calendar')"
      >
        <AppIcon
          :icon="CalendarPlus"
          :size="18"
        />
        {{ t('mvp.set.ics') }}
      </AppButton>
      <AppButton
        v-if="view.event.isHost"
        variant="secondary"
        size="card"
        @click="emit('invite')"
      >
        <AppIcon
          :icon="LinkIcon"
          :size="18"
        />
        {{ t('common.invite') }}
      </AppButton>
    </div>
  </template>

  <div
    v-if="view.event.isHost && canChangeSessions"
    class="flex flex-wrap items-center gap-2"
  >
    <AppButton
      v-if="!full"
      variant="secondary"
      size="card"
      @click="emit('add')"
    >
      <AppIcon
        :icon="Plus"
        :size="18"
      />
      {{ t('mvp.sessions.add') }}
    </AppButton>
    <p
      v-else
      class="m-0 text-small font-bold text-ink-2"
    >
      {{ t('mvp.sessions.max', { max: SESSIONS_MAX }) }}
    </p>
  </div>
</template>
