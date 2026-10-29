<script setup lang="ts">
import { CalendarCheck, CalendarClock, ChevronRight, Flag, Link as LinkIcon, Lock, Play, Settings2 } from '@lucide/vue'
import type { DockAction } from '~/components/HostDock.vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { feedSessions } from '~/utils/activity'
import { hostDockState } from '~/utils/host-dock'
import { datePollOpen, sessionsEditable, type DatedSessionView } from '~~/shared/event'
import { settingsPath } from '~~/shared/links'
import { settingsEditable } from '~~/shared/settings'

// The Event link (`/e/<slug>`, ADR 0006) in the event shell (screen M3). This page loads the Event through
// useEventView (live through the Event's room, polling every 15 s while that is down, #156), shows the
// ConnectionBanner, and holds the Host's dialogs and the error states. EventSessions shows the
// Sessions with their Host actions, EventPoll the Date poll while it is open. Votes show at once and roll back with
// a toast when saving fails (useOptimisticVotes, ADR 0001). The Date is set in the confirm dialog (#13): from a Slot
// card ("Termin festlegen") or the host dock. The Host picks only the Slot; its time goes to the next Session
// without a Date (#52). Termine bearbeiten opens SlotEditSheet (#15).
const props = defineProps<{ slug: string }>()

const { t } = useI18n()
const { toast } = useToast()
const slug = toRef(() => props.slug)
const { data, error, refresh, room } = await useEventView(slug)
const connection = useConnectionBanner(room.state, room.enabled)

// Who is online (#162) goes to the Game board's dots. The server clock is kept here, on the page's one socket, for the
// timers of 1.5 (which will provide it from here); nothing reads it yet.
const presence = usePresence(room)
useServerClock(room)
const onlineState = (userId: string) => (presence.known.value ? presence.isOnline(userId) : undefined)

const notFound = computed(() => error.value?.statusCode === 404)
const deleted = computed(() => error.value?.statusCode === 410)
const failed = computed(() => error.value !== null && !notFound.value && !deleted.value)

useHead({ title: () => data.value?.event.name })

const votes = useOptimisticVotes(slug, data, refresh)

/** The open Slots with their day and time in Berlin, for the poll and the confirm dialog. */
const slots = computed(() => (data.value?.slots ?? []).map((slot) => {
  const instant = new Date(slot.startsAt)
  return { id: slot.id, day: formatSlotDay(instant), time: formatSlotTime(instant), past: slot.past }
}))

// The Host's changes go through the one send (#74); the dialogs and the sheet close only when the server took it.
const { send } = useEventMutation(slug, refresh)
const confirmOpen = ref(false)
const confirming = ref(false)
const confirmPreset = ref<string | null>(null)

/** Sets the Date of the next undated Session from the Slot the Host picked (#52). */
function confirmDate(slotId: string) {
  return send('POST', 'confirm', { body: { slotId }, busy: confirming, done: () => (confirmOpen.value = false) })
}

/** Withdraws one Session's Date and frees its Slot; removes a Session, whose Slot goes back to the poll (#55). */
const reopenSession = (sessionId: string) => send('POST', `sessions/${sessionId}/reopen`)
const removeSession = (sessionId: string) => send('DELETE', `sessions/${sessionId}`)

/** The open Slots the Host can still confirm, in time order, with their counts for the dialog (#52). */
const confirmOptions = computed(() => slots.value
  .filter(slot => !slot.past)
  .map(slot => ({ id: slot.id, day: slot.day, time: slot.time, ...votes.countsFor(slot.id), notes: votes.notesFor(slot.id, data.value?.members ?? []) })))

/** The Dates still missing after the one the Host sets now (#52): the dialog says so. */
const missingAfterSet = computed(() => Math.max((data.value?.missingDates ?? 0) - 1, 0))

/** Why "Termin festlegen" cannot set a Date right now, or null (#52): no open Slot at all, or none in the future. */
const setBlocked = computed(() => {
  if (slots.value.length === 0) return t('mvp.set.noSlots')
  if (confirmOptions.value.length === 0) return t('mvp.set.noFutureSlot')
  return null
})

/** Opens the confirm dialog: the Slot picked on its card, else the Best slot, else the earliest future Slot. */
function openConfirm(slotId?: string) {
  const first = confirmOptions.value[0]
  if (!first) {
    toast({ tone: 'info', text: setBlocked.value ?? t('mvp.set.noFutureSlot') })
    return
  }
  confirmPreset.value = slotId ?? data.value?.bestSlotId ?? first.id
  confirmOpen.value = true
}

const rescheduleOpen = ref(false)
const rescheduling = ref(false)
const rescheduleSessionId = ref<string | null>(null)

function openReschedule(sessionId: string) {
  rescheduleSessionId.value = sessionId
  rescheduleOpen.value = true
}

/** The Session the reschedule dialog moves, while it still has its Date (#55). */
const rescheduleSession = computed(() => data.value?.sessions
  .find((session): session is DatedSessionView => session.id === rescheduleSessionId.value && session.startsAt !== null) ?? null)

/** Moves that Session's Date to a new Berlin time (`YYYY-MM-DDTHH:mm`); the dialog shows only while it has one. */
function rescheduleDate(startsAt: string) {
  return send('POST', `sessions/${rescheduleSessionId.value}/reschedule`, { body: { startsAt }, busy: rescheduling, done: () => (rescheduleOpen.value = false) })
}

/** Sessions can be added in every Phase before the Event finishes (#55, sessionsEditable). */
const canChangeSessions = computed(() => (data.value ? sessionsEditable(data.value.event.phase) : false))
const addOpen = ref(false)
const adding = ref(false)

/** Adds a Session with this Berlin time, or without one (null) to leave its Date to the poll (#55). */
function addSession(startsAt: string | null) {
  return send('POST', 'sessions', { body: startsAt === null ? {} : { startsAt }, busy: adding, done: () => (addOpen.value = false) })
}

const editing = ref(false)
const editableSlots = computed(() => (data.value?.slots ?? []).map(slot => ({
  id: slot.id,
  startsAt: slot.startsAt,
  votes: (data.value?.votes ?? []).filter(vote => vote.slotId === slot.id).length,
})))
const inviteOpen = ref(false)
const calendarOpen = ref(false)

/** The Date poll is open while a Session waits for a Date, in the poll Phase and in a running Event (#164, datePollOpen). */
const pollOpen = computed(() => (data.value ? datePollOpen(data.value.event.phase, data.value.missingDates) : false))

// Starting a Session (#164): the dock's primary asks first (the first start locks the teams and freezes their names).
const startOpen = ref(false)
const starting = ref(false)
const firstStart = computed(() => data.value?.sessions.every(session => session.startedAt === null) ?? true)
/** The first Session has started: the teams and their names are locked for Players. */
const started = computed(() => !firstStart.value)
/** What the Activity feed's group headers need of the Sessions (#164). */
const feed = computed(() => feedSessions(data.value?.sessions ?? []))

const startLabel = computed(() => {
  const number = data.value?.start?.number ?? null
  return number === null ? t('dock.start') : t('dock.startN', { n: number })
})

function startSession() {
  return send('POST', 'sessions/start', { busy: starting, done: () => (startOpen.value = false) })
}

/** Ends the Running Session; the dock's hold calls this after the hold and learns whether the server took it. */
const endSession = () => send('POST', 'sessions/end')

// The settings editor (#147): the Host opens it from the dock, and from a notice while the Event is not set up.
const canEditSettings = computed(() => (data.value ? data.value.event.isHost && settingsEditable(data.value.event.phase) : false))
const needsSetup = computed(() => canEditSettings.value && data.value?.settings === null)
const setupNoticeClosed = ref(false)

// "Termin festlegen" looks disabled with its reason when no open future Slot can become a Date (#52). Every Phase before
// the Event finishes has Einstellungen and Einladen (#147).
// The Host controls per state (11-event-seite § HostDock, #155, #164): hostDockState says which primary the Event offers
// (Event einrichten, Termin festlegen, Session starten or beenden, or none after the last Session). „Session starten“
// looks disabled with the start rule's reason when it cannot start; „Session beenden“ is a hold. „Termin für Session m“
// stays while another Session still polls, and „Termine bearbeiten“ while the Date poll is open.
const hostActions = computed((): DockAction[] => {
  const view = data.value
  if (!view) return []
  const state = hostDockState(view)
  const invite: DockAction = { key: 'invite', label: t('common.invite'), icon: LinkIcon, group: t('dock.group.people'), place: 'dock', run: () => (inviteOpen.value = true) }
  const settings: DockAction = {
    key: 'settings',
    label: t(state.kind === 'setup' ? 'dock.setup' : 'dock.settings'),
    icon: Settings2,
    group: t('dock.group.event'),
    primary: state.primary === 'setup',
    place: state.kind === 'setup' ? 'dock' : 'more',
    run: () => navigateTo(settingsPath(slug.value)),
  }
  const slots: DockAction = { key: 'slots', label: t('mvp.slots.title'), icon: CalendarClock, group: t('dock.group.dates'), place: 'more', run: () => (editing.value = true) }
  const datesOnly = pollOpen.value ? [slots] : []

  const setDate: DockAction = {
    key: 'setDate',
    // Named by its Session once another Session is dated or started; before that it is simply „Termin festlegen“.
    label: t(state.pollNumber !== null && ['teams', 'running', 'between'].includes(state.kind) ? 'dock.setDateN' : 'dock.setDate', { n: state.pollNumber }),
    icon: CalendarCheck,
    group: t('dock.group.dates'),
    primary: state.primary === 'setDate',
    disabledReason: setBlocked.value ?? undefined,
    // Next to a Session to start or end the Date is a second action; while the Event is being set up or runs it waits in „Mehr“.
    place: state.primary === 'setDate' || state.kind === 'teams' || state.kind === 'between' ? 'dock' : 'more',
    run: () => openConfirm(),
  }
  const dates = pollOpen.value ? [setDate] : []

  if (state.kind === 'setup') return [settings, invite, ...dates, ...datesOnly]
  if (state.primary === 'start') {
    const reason = state.startRejection === null ? undefined : t(`dock.startBlocked.${state.startRejection}`)
    const start: DockAction = {
      key: 'start',
      label: t(state.number === null ? 'dock.start' : 'dock.startN', { n: state.number }),
      icon: Play,
      group: t('dock.group.event'),
      primary: true,
      disabledReason: reason,
      run: () => (reason ? toast({ tone: 'info', text: reason }) : void (startOpen.value = true)),
    }
    return [start, ...dates, invite, ...datesOnly, settings]
  }
  if (state.primary === 'end') {
    const end: DockAction = {
      key: 'end',
      label: t(state.number === null ? 'dock.endSession' : 'dock.endN', { n: state.number }),
      icon: Flag,
      group: t('dock.group.event'),
      primary: true,
      hold: true,
      run: endSession,
    }
    return [end, invite, ...dates, ...datesOnly, settings]
  }
  if (state.primary === 'setDate') return [...dates, invite, ...datesOnly, settings]
  return [invite, settings]
})
</script>

<template>
  <AppShell kind="event">
    <template
      v-if="data"
      #title
    >
      <h1 class="m-0 min-w-0 truncate text-[22px] leading-none">
        {{ data.event.name }}
      </h1>
      <PhasePill :phase="data.event.phase" />
    </template>

    <div
      v-if="data"
      class="mx-auto flex w-full max-w-[1100px] flex-col gap-4"
    >
      <ConnectionBanner
        :state="connection"
        @retry="room.retry"
      />

      <NoticeBanner
        v-if="needsSetup && !setupNoticeClosed"
        tone="info"
        :icon="Settings2"
        host-only
        closable
        @close="setupNoticeClosed = true"
      >
        <b>{{ t('eventSettings.notice.title') }}</b>
        {{ t('eventSettings.notice.text') }}
        <template #action>
          <AppButton
            :to="settingsPath(slug)"
            size="md"
          >
            {{ t('eventSettings.notice.action') }}
          </AppButton>
        </template>
      </NoticeBanner>

      <EventSessions
        :view="data"
        :slug="slug"
        :reopen="reopenSession"
        :remove="removeSession"
        @reschedule="openReschedule"
        @add="addOpen = true"
        @invite="inviteOpen = true"
        @calendar="calendarOpen = true"
      />

      <HowWePlayCard
        :settings="data.settings"
        :pools="data.pools"
        :is-host="data.event.isHost"
      />

      <EventPoll
        v-if="pollOpen"
        :view="data"
        :slots="slots"
        :votes="votes"
        @pick="openConfirm"
        @remove-session="removeSession"
      />

      <!-- Provisional spot: the final order of the page comes with #166. -->
      <GameBoard
        :slug="slug"
        :members="data.members"
        :teams="data.teams"
        :settings="data.settings"
        :team-choice-open="data.teamChoiceOpen"
        :started="started"
        :viewer-id="data.viewerId"
        :is-host="data.event.isHost"
        :room="room"
        :online="onlineState"
      />

      <!-- Provisional: the SidePanel (#166) takes the feed over. -->
      <section
        class="flex flex-col gap-4 rounded-[20px] border-(length:--cp-bw) border-line bg-surface p-5.5 text-ink shadow-card md:p-[22px]"
        aria-labelledby="activity-title"
      >
        <h2
          id="activity-title"
          class="m-0 font-display text-[26px] leading-none font-normal md:text-[32px]"
        >
          {{ t('activity.title') }}
        </h2>
        <ActivityFeed
          :slug="slug"
          :room="room"
          :sessions="feed.started"
          :next-number="feed.nextNumber"
        />
      </section>
    </div>

    <FullScreenState
      v-else-if="notFound || deleted"
      :kind="deleted ? 'deleted' : 'invalid'"
    >
      <template #actions>
        <AppButton
          to="/"
          size="lg"
        >
          {{ t('errorPage.home') }}
          <AppIcon :icon="ChevronRight" />
        </AppButton>
      </template>
    </FullScreenState>

    <FullScreenState
      v-else-if="failed"
      kind="generic"
    />

    <HostDock
      v-if="canEditSettings"
      :actions="hostActions"
    />

    <DateConfirmDialog
      v-if="data?.event.isHost"
      :open="confirmOpen"
      :options="confirmOptions"
      :preselected="confirmPreset"
      :missing-after="missingAfterSet"
      :loading="confirming"
      @confirm="confirmDate"
      @cancel="confirmOpen = false"
    />
    <SlotEditSheet
      v-if="data?.event.isHost && pollOpen"
      :open="editing"
      :slug="slug"
      :slots="editableSlots"
      @close="editing = false"
      @changed="refresh"
    />

    <ConfirmModal
      v-if="data?.event.isHost && data.settings"
      :open="startOpen"
      :title="t('dock.startDialog.title')"
      :icon="Play"
      :confirm-label="startLabel"
      :loading="starting"
      @confirm="startSession"
      @cancel="startOpen = false"
    >
      <p class="m-0">
        {{ t(firstStart ? 'dock.startDialog.textFirst' : 'dock.startDialog.textLater') }}
      </p>
      <p
        v-if="firstStart"
        class="mt-3 mb-0 flex items-center gap-2 font-bold text-ink"
      >
        <AppIcon
          :icon="Lock"
          :size="16"
        />
        {{ t('dock.startDialog.lock', { teams: data.settings.teamCount, size: data.settings.teamSize }) }}
      </p>
    </ConfirmModal>

    <DateRescheduleDialog
      v-if="data?.event.isHost && rescheduleSession"
      :open="rescheduleOpen"
      :starts-at="rescheduleSession.startsAt"
      :loading="rescheduling"
      @confirm="rescheduleDate"
      @cancel="rescheduleOpen = false"
    />

    <SessionAddSheet
      v-if="data?.event.isHost && canChangeSessions"
      :open="addOpen"
      :busy="adding"
      @close="addOpen = false"
      @submit="addSession"
    />

    <InviteSheet
      v-if="data?.inviteUrl"
      :open="inviteOpen"
      :slug="slug"
      :url="data.inviteUrl"
      @close="inviteOpen = false"
      @changed="refresh"
    />

    <CalendarSheet
      v-if="data"
      :open="calendarOpen"
      :view="data"
      @close="calendarOpen = false"
    />
  </AppShell>
</template>
