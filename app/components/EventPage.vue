<script setup lang="ts">
import { CalendarCheck, CalendarClock, ChevronRight, Link as LinkIcon } from '@lucide/vue'
import type { DockAction } from '~/components/HostDock.vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { sessionsEditable, type DatedSessionView, type EventView } from '~~/shared/event'

// The Event link (`/e/<slug>`, ADR 0006) in the event shell (screen M3). This page loads the Event, refetches it
// every 15 s while the tab is visible, and holds the Host's dialogs and the error states. EventSessions shows the
// Sessions with their Host actions, EventPoll the Date poll while it is open. Votes show at once and roll back with
// a toast when saving fails (useOptimisticVotes, ADR 0001). The Date is set in the confirm dialog (#13): from a Slot
// card ("Diesen festlegen") or the host dock. The Host picks only the Slot; its time goes to the next Session
// without a Date (#52). Termine bearbeiten opens SlotEditSheet (#15).
const props = defineProps<{ slug: string }>()

const { t } = useI18n()
const { toast } = useToast()
const slug = toRef(() => props.slug)
const { data, error, refresh } = await useFetch<EventView>(() => `/api/e/${slug.value}`)

const notFound = computed(() => error.value?.statusCode === 404)
const deleted = computed(() => error.value?.statusCode === 410)
const failed = computed(() => error.value !== null && !notFound.value && !deleted.value)

useHead({ title: () => `${data.value?.event.name ?? t('app.name')} | ${t('app.name')}` })

const votes = useOptimisticVotes(slug, data, refresh)

/** The open Slots with their day and time in Berlin, for the poll and the confirm dialog. */
const slots = computed(() => (data.value?.slots ?? []).map((slot) => {
  const instant = new Date(slot.startsAt)
  return { id: slot.id, day: formatSlotDay(instant), time: formatSlotTime(instant), past: slot.past }
}))

const {
  confirmOpen,
  confirming,
  rescheduleOpen,
  rescheduling,
  rescheduleSessionId,
  addOpen,
  adding,
  confirmDate,
  openReschedule,
  rescheduleDate,
  reopenSession,
  removeSession,
  addSession,
} = useHostActions(slug, refresh)
const confirmPreset = ref<string | null>(null)

/** Bumped when a Reopen or a removal is refused, so its hold button starts again from zero (#55). */
const holdEpoch = ref(0)

async function reopenOne(sessionId: string) {
  if (!(await reopenSession(sessionId))) holdEpoch.value += 1
}

async function removeOne(sessionId: string) {
  if (!(await removeSession(sessionId))) holdEpoch.value += 1
}

/** The open Slots the Host can still confirm, in time order, with their counts for the dialog (#52). */
const confirmOptions = computed(() => slots.value
  .filter(slot => !slot.past)
  .map(slot => ({ id: slot.id, day: slot.day, time: slot.time, ...votes.countsFor(slot.id) })))

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

/** The Session the reschedule dialog moves, while it still has its Date (#55). */
const rescheduleSession = computed(() => data.value?.sessions
  .find((session): session is DatedSessionView => session.id === rescheduleSessionId.value && session.startsAt !== null) ?? null)

/** Sessions can be added in every Phase before the Event finishes (#55, sessionsEditable). */
const canChangeSessions = computed(() => (data.value ? sessionsEditable(data.value.event.phase) : false))

const editing = ref(false)
const editableSlots = computed(() => (data.value?.slots ?? []).map(slot => ({
  id: slot.id,
  startsAt: slot.startsAt,
  votes: (data.value?.votes ?? []).filter(vote => vote.slotId === slot.id).length,
})))
const inviteOpen = ref(false)
const calendarOpen = ref(false)

// "Termin festlegen" looks disabled with its reason when no open future Slot can become a Date (#52).
const hostActions = computed((): DockAction[] => [
  { label: t('dock.setDate'), icon: CalendarCheck, primary: true, disabledReason: setBlocked.value ?? undefined, run: () => openConfirm() },
  { label: t('mvp.slots.title'), icon: CalendarClock, run: () => (editing.value = true) },
  { label: t('common.invite'), icon: LinkIcon, run: () => (inviteOpen.value = true) },
])

// Only a loaded Event is refetched: a link that failed keeps its error page.
usePollRefresh(() => {
  if (data.value) refresh()
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
      <EventSessions
        :view="data"
        :slug="slug"
        :hold-epoch="holdEpoch"
        @reschedule="openReschedule"
        @reopen="reopenOne"
        @remove="removeOne"
        @add="addOpen = true"
        @invite="inviteOpen = true"
        @calendar="calendarOpen = true"
      />

      <EventPoll
        v-if="data.event.phase === 'poll'"
        :view="data"
        :slots="slots"
        :votes="votes"
        @pick="openConfirm"
        @remove-session="removeOne"
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
      v-if="data?.event.isHost && data.event.phase === 'poll'"
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
      @rotated="refresh()"
    />

    <CalendarSheet
      v-if="data"
      :open="calendarOpen"
      :view="data"
      @close="calendarOpen = false"
    />
  </AppShell>
</template>
