<script setup lang="ts">
import { CalendarCheck, CalendarClock, ChevronRight, Link as LinkIcon, Settings2 } from '@lucide/vue'
import type { DockAction } from '~/components/HostDock.vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { sessionsEditable, type DatedSessionView } from '~~/shared/event'
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

// The settings editor (#147): the Host opens it from the dock, and from a notice while the Event is not set up.
const canEditSettings = computed(() => (data.value ? data.value.event.isHost && settingsEditable(data.value.event.phase) : false))
const needsSetup = computed(() => canEditSettings.value && data.value?.settings === null)
const setupNoticeClosed = ref(false)

// "Termin festlegen" looks disabled with its reason when no open future Slot can become a Date (#52). The poll
// Phase has the Date actions; every Phase before the Event finishes has Einstellungen and Einladen (#147).
// The Host controls per state (11-event-seite § HostDock, #155). Setup is the primary while the Event has no settings.
const hostActions = computed((): DockAction[] => {
  const setup = needsSetup.value
  const invite: DockAction = { key: 'invite', label: t('common.invite'), icon: LinkIcon, group: t('dock.group.people'), place: 'dock', run: () => (inviteOpen.value = true) }
  const settings: DockAction = {
    key: 'settings',
    label: t(setup ? 'dock.setup' : 'dock.settings'),
    icon: Settings2,
    group: t('dock.group.event'),
    primary: setup,
    place: setup ? 'dock' : 'more',
    run: () => navigateTo(settingsPath(slug.value)),
  }
  // A set-up Event outside the poll has no primary yet: #164 adds „Session starten“ as this state's primary.
  if (data.value?.event.phase !== 'poll') return setup ? [settings, invite] : [invite, settings]
  const setDate: DockAction = {
    key: 'setDate',
    label: t('dock.setDate'),
    icon: CalendarCheck,
    group: t('dock.group.dates'),
    primary: !setup,
    disabledReason: setBlocked.value ?? undefined,
    place: setup ? 'more' : 'dock',
    run: () => openConfirm(),
  }
  const slots: DockAction = { key: 'slots', label: t('mvp.slots.title'), icon: CalendarClock, group: t('dock.group.dates'), place: 'more', run: () => (editing.value = true) }
  return setup ? [settings, invite, setDate, slots] : [setDate, invite, slots, settings]
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
        v-if="data.event.phase === 'poll'"
        :view="data"
        :slots="slots"
        :votes="votes"
        @pick="openConfirm"
        @remove-session="removeSession"
      />

      <BaustelleZone
        compact
        :title="t('mvp.poll.zoneOpenTitle')"
        :text="t('mvp.poll.zoneOpenText')"
      />
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
      v-if="data?.event.isHost && data.event.phase === 'poll'"
      :open="editing"
      :slug="slug"
      :slots="editableSlots"
      @close="editing = false"
      @changed="refresh"
    />

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
