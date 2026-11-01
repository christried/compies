<script setup lang="ts">
import { ChevronRight, Crown, History, Hourglass, LayoutGrid, Link as LinkIcon, Lock, Settings2 } from '@lucide/vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { feedSessions } from '~/utils/activity'
import { teamName } from '~/utils/board'
import { dateBlockedKey, eventPageState, pagePill } from '~/utils/event-page'
import { hasStarted } from '~~/shared/session-state'
import { datePollOpen, sessionsEditable } from '~~/shared/event'
import { settingsPath } from '~~/shared/links'
import { settingsEditable } from '~~/shared/settings'

// The Event link (`/e/<slug>`, ADR 0006) in the event shell (screen M3). This page loads the Event through
// useEventView (live through the Event's room, polling every 15 s while that is down, #156), shows the
// ConnectionBanner under the header, and holds the Host's dialogs and the error states. The stage is the Head and the
// blocks the page's state lists, in its order (#166, 11-event-seite § EventPage: what has to happen now goes on top; the
// list is `eventPageState(...).blocks`, A4): EventSessions with „So wird gespielt“, EventPoll while a Session waits for a
// Date, the open Rounds of a running Session (#228), the Game board and the notices.
// The Activity feed has the side panel from md up and a tab of its own on a phone. Votes show at once and roll back with
// a toast when saving fails (useOptimisticVotes, ADR 0001). The Host's dialogs are EventHostDialogs (the Date is set in
// the confirm dialog from a Slot card or the dock, #13); the dock's actions are built by useHostActions.
const props = defineProps<{ slug: string }>()

const { t } = useI18n()
const slug = toRef(() => props.slug)
const { data, error, refresh, room } = await useEventView(slug)
const connection = useConnectionBanner(room.state, room.enabled)

// Who is online (#162) goes to the Game board's dots. The server clock is kept here, on the page's one socket, for the
// timers of Glücksrad (0.7) (which will provide it from here); nothing reads it yet.
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

// The Host's changes go through the one send (#74). The dialogs are EventHostDialogs'; the page opens them through `dialogs`.
const { send } = useEventMutation(slug, refresh)
const dialogs = useTemplateRef('dialogs')

/** Withdraws one Session's Date and frees its Slot; removes a Session, whose Slot goes back to the poll (#55). */
const reopenSession = (sessionId: string) => send('POST', `sessions/${sessionId}/reopen`)
const removeSession = (sessionId: string) => send('DELETE', `sessions/${sessionId}`)

const inviteOpen = ref(false)
const calendarOpen = ref(false)

/** The Date poll is open while a Session waits for a Date, in the poll Phase and in a running Event (#164, datePollOpen). */
const pollOpen = computed(() => (data.value ? datePollOpen(data.value.event.phase, data.value.missingDates) : false))
/** Sessions can be added, moved and removed in this Phase (sessionsEditable): computed once here for the cards and the dialogs (#238). */
const canChangeSessions = computed(() => (data.value ? sessionsEditable(data.value.event.phase) : false))

/** The first Session has started: the teams and their names are locked for Players. */
const started = computed(() => hasStarted(data.value?.sessions ?? []))
/** What the Activity feed's group headers need of the Sessions (#164). */
const feed = computed(() => feedSessions(data.value?.sessions ?? []))

/** Ends the Running Session; the dock's hold calls this after the hold and learns whether the server took it. */
const endSession = () => send('POST', 'sessions/end')

/** Puts an open Round back (#228); the hold on its card learns whether the server took it. */
const putBackRound = (roundId: string) => send('DELETE', `rounds/${roundId}`)

// The settings editor (#147): the Host opens it from the dock, and from a notice while the Event is not set up.
const canEditSettings = computed(() => (data.value ? data.value.event.isHost && settingsEditable(data.value.event.phase) : false))
const needsSetup = computed(() => canEditSettings.value && data.value?.settings === null)
const setupNoticeClosed = ref(false)

/** Why "Termin festlegen" cannot set a Date right now, or null (#52): the dock's action says so. */
const setBlocked = computed(() => {
  const key = dateBlockedKey(slots.value)
  return key === null ? null : t(key)
})

const hostActions = useHostActions(
  () => data.value,
  slug,
  { pollOpen, setBlocked },
  {
    invite: () => (inviteOpen.value = true),
    editSlots: () => dialogs.value?.openSlotEditor(),
    setDate: () => dialogs.value?.openConfirm(),
    start: () => dialogs.value?.openStart(),
    end: endSession,
    setGame: () => dialogs.value?.openSetGame(),
  },
)

// The state of the page for everybody (#166): its kind, and the blocks of the stage in the order that state wants (A4).
const pageState = computed(() => (data.value ? eventPageState(data.value) : null))

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
        v-for="block in pageState.blocks"
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
          :compact="pageState.pollCompact"
          @pick="dialogs?.openConfirm($event)"
          @remove-session="removeSession"
        />

        <EventRounds
          v-else-if="block === 'rounds'"
          :rounds="data.rounds"
          :is-host="data.event.isHost"
          :put-back="putBackRound"
        />

        <GameBoard
          v-else-if="block === 'board'"
          :slug="slug"
          :members="data.members"
          :teams="data.teams"
          :settings="data.settings"
          :team-choice-open="data.teamChoiceOpen"
          :page-kind="pageState.kind"
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
            :can-change-sessions="canChangeSessions"
            :shadow="pageState.cardsStandOut"
            @reschedule="dialogs?.openReschedule($event)"
            @add="dialogs?.openAdd()"
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

    <EventHostDialogs
      v-if="data?.event.isHost"
      ref="dialogs"
      :slug="slug"
      :view="data"
      :slots="slots"
      :votes="votes"
      :refresh="refresh"
      :poll-open="pollOpen"
      :can-change-sessions="canChangeSessions"
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
