<script setup lang="ts">
import { CalendarCheck, CalendarClock, ChevronRight, Crown, Flag, History, Hourglass, LayoutGrid, Link as LinkIcon, Lock, Play, Settings2 } from '@lucide/vue'
import type { DockAction } from '~/components/HostDock.vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { feedSessions } from '~/utils/activity'
import { teamName } from '~/utils/board'
import { eventPageState, pagePill } from '~/utils/event-page'
import { hostDockState } from '~/utils/host-dock'
import { hasStarted } from '~~/shared/board'
import { datePollOpen, sessionsEditable, type DatedSessionView } from '~~/shared/event'
import { settingsPath } from '~~/shared/links'
import { settingsEditable } from '~~/shared/settings'

// The Event link (`/e/<slug>`, ADR 0006) in the event shell (screen M3). This page loads the Event through
// useEventView (live through the Event's room, polling every 15 s while that is down, #156), shows the
// ConnectionBanner under the header, and holds the Host's dialogs and the error states. The stage is the Head and the
// blocks in the order of the page's state (#166, 11-event-seite § EventPage: what has to happen now goes on top):
// EventSessions with „So wird gespielt“, EventPoll while a Session waits for a Date, the Game board and the notices.
// The Activity feed has the side panel from md up and a tab of its own on a phone. Votes show at once and roll back with
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
const firstStart = computed(() => !hasStarted(data.value?.sessions ?? []))
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

// The state of the page for everybody (#166) and the blocks of the stage in the order that state wants. „What has to happen
// now goes on top“: the poll while no Session is dated, the Game board from the first Date on, the Sessions card between two
// Sessions. The Reopen notices sit right under the Head in every state. A Session that still waits for a Date has its poll
// (compact) below the board once another Session is dated or started.
type Block = 'head' | 'reopen' | 'setup' | 'seat' | 'poll' | 'board' | 'cards' | 'stay'
const pageState = computed(() => (data.value ? eventPageState(data.value) : null))
const order = computed((): Block[] => {
  const state = pageState.value
  if (!state) return []
  const poll: Block[] = pollOpen.value ? ['poll'] : []
  switch (state.kind) {
    case 'poll': return ['head', 'reopen', ...poll, 'board', 'cards']
    case 'teams': return ['head', 'reopen', 'seat', 'board', ...poll, 'cards']
    case 'running': return ['head', 'reopen', 'board', ...poll, 'cards']
    case 'between': return ['head', 'reopen', 'cards', 'stay', 'board', ...poll]
    case 'done': return ['head', 'reopen', 'cards', 'board']
    default: return ['head', 'reopen', 'setup', ...poll, 'board', 'cards']
  }
})
/** The poll is the quiet one below the board as soon as the page is about something else than the Date. */
const pollCompact = computed(() => pageState.value !== null && !['poll', 'setup'].includes(pageState.value.kind))
/** Between two Sessions and after the last the Sessions card is the news of the page and gets a shadow. */
const cardsStandOut = computed(() => pageState.value?.kind === 'between' || pageState.value?.kind === 'done')

const hostName = computed(() => data.value?.members.find(member => member.isHost)?.name ?? '')

// The Host's seat note (teams only): where the Host sits does not change the dock, and the note says so. Closed for this visit.
const seatNoteClosed = ref(false)
const seatNote = computed(() => {
  const view = data.value
  const me = view?.members.find(member => member.id === view.viewerId)
  if (!view || !view.event.isHost || !me) return null
  if (me.zone === 'stands') return t('event.notice.seatStands')
  if (me.zone !== 'team' || me.team === null) return null
  return t('event.notice.seatTeam', { team: teamName(view.teams.find(team => team.position === me.team) ?? me.team, t) })
})

/** What the Teams-bleiben notice names: the next Session by its number, or „der nächsten“ when it has none yet or is the only one. */
const teamsStay = computed(() => {
  const number = pageState.value?.next?.number ?? null
  const host = data.value?.event.isHost ?? false
  const key = number === null ? (host ? 'teamsStayNext' : 'teamsStayMemberNext') : (host ? 'teamsStay' : 'teamsStayMember')
  return t(`event.notice.${key}`, { n: number })
})

// The header pill follows the page state, not the Event's Phase, which is running from the first start on (pagePill, #166):
// „Läuft · Session 1 von 2“ while a Session runs in an Event with several, „Vorbei“ after the last one.
const pill = computed(() => {
  const state = pageState.value
  const shown = state ? pagePill(state) : null
  if (!state || !shown) return { phase: data.value?.event.phase ?? 'poll', label: undefined }
  if (shown.ended) return { phase: shown.phase, label: t('phase.ended') }
  const several = state.kind === 'running' && state.total > 1
  return { phase: shown.phase, label: several ? t('event.pill.running', { n: state.running?.number, total: state.total }) : undefined }
})

// The phone's views (11-event-seite § TabBar): the Event page or the Activity feed. The feed is mounted once, in the side panel
// from md up and in its own view below; the wide layout is known after mount only, so nothing of the feed renders before.
const wide = useMediaQuery('(min-width: 61.25rem)')
const panelTab = ref('activity')
const activeView = ref<'event' | 'activity'>('event')
const unread = ref(0)
// Only the phone counts: on a desktop the panel shows the feed, and a count from there would be stale once the window narrows.
room.on('activity.added', () => {
  if (wide.value === false && activeView.value !== 'activity') unread.value += 1
})
watch(wide, (isWide) => {
  if (isWide) unread.value = 0
})
function selectView(key: string) {
  activeView.value = key === 'activity' ? 'activity' : 'event'
  if (activeView.value === 'activity') unread.value = 0
}
const tabs = computed(() => [
  { key: 'event', label: t('event.tabs.event'), icon: LayoutGrid, current: activeView.value === 'event' },
  {
    key: 'activity',
    label: t('nav.tabs.activity'),
    icon: History,
    current: activeView.value === 'activity',
    badge: activeView.value === 'activity' ? 0 : unread.value,
    ariaLabel: activeView.value !== 'activity' && unread.value > 0 ? t('event.tabs.unread', { label: t('nav.tabs.activity'), n: unread.value }) : undefined,
  },
])
const panelTabs = computed(() => [{ key: 'activity', label: t('nav.tabs.activity'), icon: History }])
</script>

<template>
  <AppShell kind="event">
    <template
      v-if="data"
      #title
    >
      <p class="m-0 min-w-0 truncate text-[22px] leading-none">
        {{ data.event.name }}
      </p>
      <PhasePill
        :phase="pill.phase"
        :label="pill.label"
      />
    </template>

    <template
      v-if="data?.inviteUrl"
      #actions
    >
      <AppButton
        variant="secondary"
        class="max-md:hidden"
        aria-haspopup="dialog"
        @click="inviteOpen = true"
      >
        <AppIcon
          :icon="LinkIcon"
          :size="16"
        />
        {{ t('common.invite') }}
      </AppButton>
    </template>

    <template
      v-if="data"
      #banner
    >
      <div class="px-3.5 pt-3 empty:hidden md:px-6">
        <ConnectionBanner
          :state="connection"
          @retry="room.retry"
        />
      </div>
    </template>

    <template
      v-if="data"
      #panel
    >
      <SidePanel
        v-model="panelTab"
        :label="t('app.sidePanel')"
        :tabs="panelTabs"
      >
        <template #activity>
          <ActivityFeed
            v-if="wide"
            :slug="slug"
            :room="room"
            :sessions="feed.started"
            :next-number="feed.nextNumber"
          />
        </template>
      </SidePanel>
    </template>

    <template
      v-if="data"
      #tabs
    >
      <TabBar
        :label="t('event.tabs.label')"
        :items="tabs"
        @select="selectView"
      />
    </template>

    <TransitionGroup
      v-if="data && pageState && (wide !== false || activeView === 'event')"
      tag="div"
      move-class="transition-transform dur-slow ease-out motion-reduce:transition-none reduced:transition-none"
      class="mx-auto flex w-full max-w-[1100px] flex-col gap-[18px] px-3.5 pt-4 md:gap-[22px] md:px-6 md:pt-6 md:pb-10"
      :class="data.event.isHost ? 'pb-[92px]' : 'pb-7'"
    >
      <div
        v-for="block in order"
        :key="block"
        class="min-w-0 empty:hidden"
      >
        <EventPageHead
          v-if="block === 'head'"
          :state="pageState"
          :is-host="data.event.isHost"
        />

        <ReopenNotices
          v-else-if="block === 'reopen'"
          :view="data"
        />

        <template v-else-if="block === 'setup'">
          <NoticeBanner
            v-if="needsSetup && !setupNoticeClosed"
            tone="info"
            :icon="Settings2"
            host-only
            closable
            @close="setupNoticeClosed = true"
          >
            <b>{{ t('event.notice.setupTitle') }}</b>
            {{ t('event.notice.setup') }}
            <template #action>
              <AppButton
                :to="settingsPath(slug)"
                variant="secondary"
                size="md"
              >
                {{ t('event.notice.setupAction') }}
              </AppButton>
            </template>
          </NoticeBanner>
          <NoticeBanner
            v-else-if="!data.event.isHost"
            tone="info"
            :icon="Hourglass"
          >
            {{ t('event.notice.setupMember', { host: hostName }) }}
          </NoticeBanner>
        </template>

        <NoticeBanner
          v-else-if="block === 'seat' && seatNote && !seatNoteClosed"
          tone="info"
          :icon="Crown"
          host-only
          closable
          @close="seatNoteClosed = true"
        >
          {{ seatNote }}
        </NoticeBanner>

        <EventPoll
          v-else-if="block === 'poll'"
          :view="data"
          :slots="slots"
          :votes="votes"
          :number="pageState.pollNumber"
          :compact="pollCompact"
          @pick="openConfirm"
          @remove-session="removeSession"
        />

        <GameBoard
          v-else-if="block === 'board'"
          :slug="slug"
          :members="data.members"
          :teams="data.teams"
          :settings="data.settings"
          :team-choice-open="data.teamChoiceOpen"
          :started="started"
          :locked-notice="pageState.kind === 'running'"
          :uneven-notice="pageState.kind !== 'running' && pageState.kind !== 'done'"
          :viewer-id="data.viewerId"
          :is-host="data.event.isHost"
          :room="room"
          :online="onlineState"
        />

        <NoticeBanner
          v-else-if="block === 'stay'"
          tone="info"
          :icon="Lock"
        >
          {{ teamsStay }}
        </NoticeBanner>

        <div
          v-else-if="block === 'cards'"
          class="grid items-start gap-4 md:grid-cols-2"
        >
          <EventSessions
            :view="data"
            :reopen="reopenSession"
            :remove="removeSession"
            :poll-number="pageState.pollNumber"
            :poll-open="pollOpen"
            :shadow="cardsStandOut"
            @reschedule="openReschedule"
            @add="addOpen = true"
            @calendar="calendarOpen = true"
          />
          <HowWePlayCard
            :settings="data.settings"
            :pools="data.pools"
            :is-host="data.event.isHost"
            :edit-to="canEditSettings && data.settings !== null ? settingsPath(slug) : null"
            :locked="started"
            :host-name="hostName"
          />
        </div>
      </div>
    </TransitionGroup>

    <!-- A phone's second view (11-event-seite § TabBar): the feed alone, with the Head's place taken by its title. -->
    <div
      v-else-if="data && wide === false"
      class="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-3.5 pt-4 pb-7"
    >
      <section
        aria-labelledby="activity-title"
        class="flex flex-col gap-3"
      >
        <h1
          id="activity-title"
          class="m-0 font-display text-[34px] leading-none font-normal"
        >
          {{ t('activity.title') }}
        </h1>
        <div class="flex h-[calc(100dvh-17rem)] min-h-72 flex-col rounded-[16px] border-(length:--cp-bw) border-line bg-surface">
          <ActivityFeed
            :slug="slug"
            :room="room"
            :sessions="feed.started"
            :next-number="feed.nextNumber"
          />
        </div>
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
      panel
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
        class="mt-3 mb-0 flex items-center gap-2 text-[14px] text-ink"
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
