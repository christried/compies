<script setup lang="ts">
import { ChevronRight, Crown, Hourglass, Link as LinkIcon, Lock, Settings2 } from '@lucide/vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { feedSessions } from '~/utils/activity'
import { viewInstants, waitsForSettle } from '~/utils/event-instants'
import { dateBlockedKey, eventPageState, headerPill, seatNote, teamsStay } from '~/utils/event-page'
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

// Who is online (#162) goes to the Game board's dots. The server clock is kept here, on the page's one socket: the blocks that
// run toward an instant (the wheel #229, the Countdown #236, and the other timers of 0.7) get its `now` as `server-now`.
const presence = usePresence(room)
const serverClock = useServerClock(room)
const onlineState = (userId: string) => (presence.known.value ? presence.isOnline(userId) : undefined)

const notFound = computed(() => error.value?.statusCode === 404)
const deleted = computed(() => error.value?.statusCode === 410)
const failed = computed(() => error.value !== null && !notFound.value && !deleted.value)

useHead({ title: () => data.value?.event.name })

const votes = useOptimisticVotes(slug, data, refresh)

// No timer runs on the server (ADR 0013, amended 2026-10-31): the first read after an instant settles it, so the page reads the Event
// and the Activity feed again when an instant it knows passes (#229: the wheel's stop; #230: the end of the clip, which the
// overlay closes at by itself and the read then drops; the next tickets add their own).
const feedTick = ref(0)
// The instants the page knows (viewInstants, #256). A read taken a hair before one can still miss what it decides: the page then reads again (F13, waitsForSettle).
useInstantRefresh(() => (data.value ? viewInstants(data.value) : []), serverClock.now, () => {
  void refresh()
  feedTick.value += 1
}, () => (data.value ? waitsForSettle(data.value, serverClock.now()) : false))

/** The open Slots with their day and time in Berlin, for the poll and the confirm dialog. */
const slots = computed(() => (data.value?.slots ?? []).map((slot) => {
  const instant = new Date(slot.startsAt)
  return { id: slot.id, day: formatSlotDay(instant), time: formatSlotTime(instant), past: slot.past }
}))

// The stage's changes go through the one send (#74), held by useStageActions. The dialogs are EventHostDialogs'; the page opens them through `dialogs`.
const actions = useStageActions(slug, refresh)
const dialogs = useTemplateRef('dialogs')

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

// The cast reaches the casting Party's Users only (a named send, no `event.changed`): their pages read again to show the seal.
room.on('veto.cast', () => void refresh())

/** Whether the Veto bar covers the bottom of the page: the stage then gets room under its last block (F4). */
const vetoBarShown = ref(false)

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
  { pollOpen, setBlocked, serverNow: serverClock.now },
  {
    invite: () => (inviteOpen.value = true),
    editSlots: () => dialogs.value?.openSlotEditor(),
    setDate: () => dialogs.value?.openConfirm(),
    start: () => dialogs.value?.openStart(),
    end: actions.endSession,
    setGame: () => dialogs.value?.openSetGame(),
    spin: () => void actions.spin(),
    countdown: () => dialogs.value?.openCountdown(),
    coin: () => void actions.toss(),
    bonusVeto: () => dialogs.value?.openBonusVeto(),
  },
)

// The state of the page for everybody (#166): its kind, and the blocks of the stage in the order that state wants (A4).
const pageState = computed(() => (data.value ? eventPageState(data.value) : null))

const hostName = computed(() => data.value?.members.find(member => member.isHost)?.name ?? '')

// The Host's seat note (teams only): where the Host sits does not change the dock, and the note says so. Closed for this visit.
const seatNoteClosed = ref(false)
const seat = computed(() => (data.value ? seatNote(data.value, t) : null))
const stay = computed(() => teamsStay(pageState.value?.next ?? null, data.value?.event.isHost ?? false, t))

// The header pill follows the page state, not the Event's Phase, which is running from the first start on (headerPill, #166).
const pill = computed(() => headerPill(pageState.value, data.value?.event.phase, t))

// The phone's views and the side panel's tabs are useEventTabs' (#257): the Event page or the Activity feed.
const { wide, panelTab, activeView, tabs, panelTabs, selectView } = useEventTabs(room)
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
            :refresh-tick="feedTick"
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
      class="mx-auto flex w-full max-w-[1100px] flex-col gap-[18px] px-3.5 pt-4 md:gap-[22px] md:px-6 md:pt-6"
      :class="vetoBarShown ? 'pb-[230px] md:pb-[190px]' : [data.event.isHost ? 'pb-[92px]' : 'pb-7', 'md:pb-10']"
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

        <!-- A block is listed only when its data is there (eventPageState, #256): the data props of the four below are not optional. -->
        <PoolWarning
          v-else-if="block === 'pool'"
          :warning="data.setGame!.poolWarning!"
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
          v-else-if="block === 'seat' && seat && !seatNoteClosed"
          tone="info"
          :icon="Crown"
          host-only
          closable
          @close="seatNoteClosed = true"
        >
          {{ seat }}
        </NoticeBanner>

        <EventPoll
          v-else-if="block === 'poll'"
          :view="data"
          :slots="slots"
          :votes="votes"
          :number="pageState.pollNumber"
          :compact="pageState.pollCompact"
          @pick="dialogs?.openConfirm($event)"
          @remove-session="actions.removeSession"
        />

        <div
          v-else-if="block === 'wheel'"
          class="flex flex-col gap-[18px] md:gap-[22px]"
        >
          <LuckyWheel
            :wheel="data.wheel!"
            :hidden="data.settings?.hiddenWheel ?? false"
            :is-host="data.event.isHost"
            :server-now="serverClock.now"
          />
          <VetoWindow
            v-if="data.wheel!.vetoes.draw"
            :wheel="data.wheel!"
            :teams="data.teams"
            :members="data.members"
            :server-now="serverClock.now"
          />
        </div>

        <EventRounds
          v-else-if="block === 'rounds'"
          :rounds="data.rounds"
          :is-host="data.event.isHost"
          :put-back="actions.putBackRound"
        />

        <EventCountdown
          v-else-if="block === 'countdown'"
          :countdown="data.countdown!"
          :server-now="serverClock.now"
          :is-host="data.event.isHost"
          :command="actions.countdown"
        />

        <CoinFlip
          v-else-if="block === 'coin'"
          :toss="data.coin!"
          :server-now="serverClock.now"
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
          {{ stay }}
        </NoticeBanner>

        <div
          v-else-if="block === 'cards'"
          class="grid items-start gap-4 md:grid-cols-2"
        >
          <EventSessions
            :view="data"
            :reopen="actions.reopenSession"
            :remove="actions.removeSession"
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
            :refresh-tick="feedTick"
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

    <!-- The synced clip (#230) over the stage; keyed by the draw, so a clip closed on this device shows again with the next draw. -->
    <ClipOverlay
      v-if="data?.clip"
      :key="data.clip.drawId"
      :clip="data.clip"
      :server-now="serverClock.now"
      :is-host="data.event.isHost"
      :skip="actions.skipClip"
    />

    <!-- The Veto bar (F4): the window's hold button in a fixed layer above the clip, for a Player of a Party while the window is open. -->
    <VetoBar
      v-if="data?.wheel"
      :wheel="data.wheel"
      :members="data.members"
      :viewer-id="data.viewerId"
      :solo="data.settings?.teamSize === 1"
      :server-now="serverClock.now"
      :cast="actions.castVeto"
      @shown="vetoBarShown = $event"
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
      :server-now="serverClock.now"
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
