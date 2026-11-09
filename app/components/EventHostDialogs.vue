<script setup lang="ts">
import { Lock, Play } from '@lucide/vue'
import { HOME_EVENTS_KEY } from '~/utils/event-data'
import { dateBlockedKey } from '~/utils/event-page'
import { isFullPoolGame } from '~~/shared/game'
import { hasStarted } from '~~/shared/session-state'
import { eventHasWheel } from '~~/shared/settings'
import type { DatedSessionView, EventView } from '~~/shared/event'

// The Host's dialogs and sheets of the Event page (#52, #55, #164): the Date confirm dialog, the reschedule dialog, the
// Slot editor, the add-Session sheet, the start dialog and the picker of the next game (#228). The page opens them (from the dock, the poll and the Sessions
// card) through the methods this component exposes. The delete sheet (#333) sends the Host's delete and leaves for Home.
// Each closes only when the server took the change (useEventMutation's `send`, #74).
const props = defineProps<{
  slug: string
  view: EventView
  /** The open Slots with their day and time in Berlin, as the page shows them. */
  slots: { id: string, day: string, time: string, past: boolean }[]
  votes: ReturnType<typeof useOptimisticVotes>
  /** Refetches the Event, after the Slot editor changed it. */
  refresh: () => unknown
  /** The Date poll is open (the page's datePollOpen, #238): the Slot editor is there. */
  pollOpen: boolean
  /** Sessions can be added in this Phase (the page's sessionsEditable, #238). */
  canChangeSessions: boolean
  /** The server's clock (the page's useServerClock): the Countdown sheet asks whether one runs (#236). */
  serverNow: () => number
}>()

const { t } = useI18n()
const { toast } = useToast()
const { send } = useEventMutation(() => props.slug, props.refresh)

// The Date (#52): the Host picks only the Slot; its time goes to the next Session without a Date.
const confirmOpen = ref(false)
const confirming = ref(false)
const confirmPreset = ref<string | null>(null)

/** Sets the Date of the next undated Session from the Slot the Host picked (#52). */
function confirmDate(slotId: string) {
  return send('POST', 'confirm', { body: { slotId }, busy: confirming, done: () => (confirmOpen.value = false) })
}

/** The open Slots the Host can still confirm, in time order, with their counts for the dialog (#52). */
const confirmOptions = computed(() => props.slots
  .filter(slot => !slot.past)
  .map(slot => ({ id: slot.id, day: slot.day, time: slot.time, ...props.votes.countsFor(slot.id), notes: props.votes.notesFor(slot.id, props.view.members) })))

/** The Dates still missing after the one the Host sets now (#52): the dialog says so. */
const missingAfterSet = computed(() => Math.max(props.view.missingDates - 1, 0))

/** Opens the confirm dialog: the Slot picked on its card, else the Best slot, else the earliest future Slot. */
function openConfirm(slotId?: string) {
  const first = confirmOptions.value[0]
  if (!first) {
    toast({ tone: 'info', text: t(dateBlockedKey(props.slots) ?? 'mvp.set.noFutureSlot') })
    return
  }
  confirmPreset.value = slotId ?? props.view.bestSlotId ?? first.id
  confirmOpen.value = true
}

// Reschedule (#55).
const rescheduleOpen = ref(false)
const rescheduling = ref(false)
const rescheduleSessionId = ref<string | null>(null)

function openReschedule(sessionId: string) {
  rescheduleSessionId.value = sessionId
  rescheduleOpen.value = true
}

/** The Session the reschedule dialog moves, while it still has its Date (#55). */
const rescheduleSession = computed(() => props.view.sessions
  .find((session): session is DatedSessionView => session.id === rescheduleSessionId.value && session.startsAt !== null) ?? null)

/** Moves that Session's Date to a new Berlin time (`YYYY-MM-DDTHH:mm`); the dialog shows only while it has one. */
function rescheduleDate(startsAt: string) {
  return send('POST', `sessions/${rescheduleSessionId.value}/reschedule`, { body: { startsAt }, busy: rescheduling, done: () => (rescheduleOpen.value = false) })
}

// Adding a Session (#55): in every Phase before the Event finishes (the page's canChangeSessions).
const addOpen = ref(false)
const adding = ref(false)

/** Adds a Session with this Berlin time, or without one (null) to leave its Date to the poll (#55). */
function addSession(startsAt: string | null) {
  return send('POST', 'sessions', { body: startsAt === null ? {} : { startsAt }, busy: adding, done: () => (addOpen.value = false) })
}

// The Slot editor (#15) is there while the Date poll is open (#164, the page's pollOpen).
const editing = ref(false)
const editableSlots = computed(() => props.view.slots.map(slot => ({
  id: slot.id,
  startsAt: slot.startsAt,
  votes: props.view.votes.filter(vote => vote.slotId === slot.id).length,
})))

// Starting a Session (#164): the dock's primary asks first (the first start locks the teams and freezes their names).
const startOpen = ref(false)
const starting = ref(false)
const firstStart = computed(() => !hasStarted(props.view.sessions))

const startLabel = computed(() => {
  const number = props.view.start?.number ?? null
  return number === null ? t('dock.start') : t('dock.startN', { n: number })
})

function startSession() {
  return send('POST', 'sessions/start', { busy: starting, done: () => (startOpen.value = false) })
}

// Setting the next game (#228): the picker lists the games left in the Game pool, whole, as the Host reads them.
const pickerOpen = ref(false)
const setting = ref(false)
const poolLeft = computed(() => {
  const left = new Set(props.view.setGame?.left ?? [])
  return (props.view.pool ?? []).filter(isFullPoolGame).filter(game => left.has(game.id))
})

// Only a Selection mode with a wheel has Vetoes (#232): there the Host can allow one on the game they set.
const vetoSwitch = computed(() => eventHasWheel(props.view.settings))

/** Sets the game as the next Round, with a Veto window when the Host allowed one; the picker closes once the server took it. */
function setNextGame(gameId: string, vetoAllowed: boolean) {
  return send('POST', 'rounds', { body: { gameId, vetoAllowed }, busy: setting, done: () => (pickerOpen.value = false) })
}

// The Bonus Veto sheet (#233) is opened from the dock; its grants go through grantBonusVeto below.
const bonusVetoOpen = ref(false)

// The Countdown (#236): the sheet sends the length in seconds; it closes once the server took it.
const countdownOpen = ref(false)
const countdownSetting = ref(false)

function setCountdown(seconds: number) {
  return send('PUT', 'countdown', { body: { seconds }, busy: countdownSetting, done: () => (countdownOpen.value = false) })
}

// The Bonus Veto (#233): the sheet grants one per hold and stays open; the refetch shows the new count. The hold learns whether it was taken.
function grantBonusVeto(team: number) {
  return send('POST', 'bonus-vetoes', { body: { team } })
}

// „Event löschen“ (#333): the sheet's hold deletes. Once the server took it the page reads nothing more (its read answers 410 from now on):
// Home's list is dropped so the Event is gone on arrival, the toast says so and the Host lands on Home.
const deleteOpen = ref(false)
let deleted = false
const { send: sendDelete } = useEventMutation(() => props.slug, () => (deleted ? undefined : props.refresh()))

function deleteEvent() {
  return sendDelete('DELETE', '', {
    errorKeys: { session_running: 'dock.deleteBlocked' },
    done: () => {
      deleted = true
      clearNuxtData(HOME_EVENTS_KEY)
      toast({ tone: 'success', text: t('eventDelete.done') })
      void navigateTo('/')
    },
  })
}

defineExpose({
  openDelete: () => (deleteOpen.value = true),
  openConfirm,
  openSetGame: () => (pickerOpen.value = true),
  openCountdown: () => (countdownOpen.value = true),
  openBonusVeto: () => (bonusVetoOpen.value = true),
  openReschedule,
  openAdd: () => (addOpen.value = true),
  openSlotEditor: () => (editing.value = true),
  openStart: () => (startOpen.value = true),
})
</script>

<template>
  <DateConfirmDialog
    :open="confirmOpen"
    :options="confirmOptions"
    :preselected="confirmPreset"
    :missing-after="missingAfterSet"
    :loading="confirming"
    @confirm="confirmDate"
    @cancel="confirmOpen = false"
  />
  <SlotEditSheet
    v-if="pollOpen"
    :open="editing"
    :slug="slug"
    :slots="editableSlots"
    @close="editing = false"
    @changed="refresh"
  />

  <ConfirmModal
    v-if="view.settings"
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
      class="mt-3 mb-0 flex items-center gap-2 text-[14px] text-ink"
    >
      <AppIcon
        :icon="Lock"
        :size="16"
      />
      {{ t('dock.startDialog.lock', { teams: view.settings.teamCount, size: view.settings.teamSize }) }}
    </p>
  </ConfirmModal>

  <DateRescheduleDialog
    v-if="rescheduleSession"
    :open="rescheduleOpen"
    :starts-at="rescheduleSession.startsAt"
    :loading="rescheduling"
    @confirm="rescheduleDate"
    @cancel="rescheduleOpen = false"
  />

  <NextGamePicker
    v-if="view.setGame"
    :open="pickerOpen"
    :pool="poolLeft"
    :busy="setting"
    :veto-switch="vetoSwitch"
    @close="pickerOpen = false"
    @pick="setNextGame"
  />

  <BonusVetoSheet
    v-if="view.bonusVetoes"
    :open="bonusVetoOpen"
    :teams="view.teams"
    :granted="view.bonusVetoes.granted"
    :grant="grantBonusVeto"
    @close="bonusVetoOpen = false"
  />

  <CountdownSheet
    :open="countdownOpen"
    :busy="countdownSetting"
    :countdown="view.countdown"
    :server-now="serverNow"
    @close="countdownOpen = false"
    @set="setCountdown"
  />

  <SessionAddSheet
    v-if="canChangeSessions"
    :open="addOpen"
    :busy="adding"
    @close="addOpen = false"
    @submit="addSession"
  />

  <EventDeleteSheet
    :open="deleteOpen"
    :remove="deleteEvent"
    @close="deleteOpen = false"
  />
</template>
