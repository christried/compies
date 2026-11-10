<script setup lang="ts">
import { Link as LinkIcon } from '@lucide/vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { feedSessions } from '~/utils/activity'
import { stageInstants, stageUnsettled } from '~/utils/event-stage'
import { dateBlockedKey, eventPageState, headerPill, wearsPartyhat } from '~/utils/event-page'
import { historyCorrections } from '~/utils/history-corrections'
import { datePollOpen, sessionsEditable } from '~~/shared/event'

// The Event link (`/e/<slug>`, ADR 0006) in the event shell (screen M3): useEventView loads the Event (live, #156), the stage is the
// Head and the blocks of `eventPageState(...).blocks` in its order (#166, A4), and the page holds the Host's dialogs and the error
// states. The phone's views and the side panel are useEventTabs'; the Votes roll back with a toast (useOptimisticVotes, ADR 0001).
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

useHead({ title: () => data.value?.event.name })

const votes = useOptimisticVotes(slug, data, refresh)

// No timer runs on the server (ADR 0013, amended 2026-10-31): the first read after an instant settles it, so the page reads the Event
// and the Activity feed again when an instant it knows passes (#229: the wheel's stop; #230: the end of the clip, which the
// overlay closes at by itself and the read then drops; the next tickets add their own).
const feedTick = ref(0)
// The instants the page knows (stageInstants, #256, #415). A read taken a hair before one can still miss what it decides: the page then reads again (F13, stageUnsettled).
useInstantRefresh(() => (data.value ? stageInstants(data.value) : []), serverClock.now, () => {
  void refresh()
  feedTick.value += 1
}, () => (data.value ? stageUnsettled(data.value, serverClock.now()) : false))

/** The open Slots with their day and time in Berlin, for the poll and the confirm dialog. */
const slots = computed(() => (data.value?.slots ?? []).map((slot) => {
  const instant = new Date(slot.startsAt)
  return { id: slot.id, day: formatSlotDay(instant), time: formatSlotTime(instant), past: slot.past }
}))

// The stage's changes go through the one send (#74), held by useStageActions. The dialogs are EventHostDialogs'; the page opens them through `dialogs`.
const actions = useStageActions(slug, refresh)
const dialogs = useTemplateRef('dialogs')
/** The Award ceremony's layer: „Siegerehrung ansehen“ of the finished stage asks it to play again (#314). */
const ceremonyLayer = useTemplateRef('ceremonyLayer')

const inviteOpen = ref(false)
const calendarOpen = ref(false)
const shareOpen = ref(false)

/** The Host's „Korrigieren“ in the history (#275, historyCorrections): the Standings tab and the phone's view have it, the stage's history does not (#277). */
const corrections = computed(() => (data.value ? historyCorrections(data.value, actions.enterResult) : null))

/** The Date poll is open while a Session waits for a Date, in the poll Phase and in a running Event (#164, datePollOpen). */
const pollOpen = computed(() => (data.value ? datePollOpen(data.value.event.phase, data.value.missingDates) : false))
/** Sessions can be added, moved and removed in this Phase (sessionsEditable): computed once here for the cards and the dialogs (#238). */
const canChangeSessions = computed(() => (data.value ? sessionsEditable(data.value.event.phase) : false))

/** What the Activity feed's group headers need of the Sessions (#164). */
const feed = computed(() => feedSessions(data.value?.sessions ?? []))

// The cast reaches the casting Party's Users only (a named send, no `event.changed`): their pages read again to show the seal.
room.on('veto.cast', () => void refresh())

/** Whether the Veto bar covers the bottom of the page: the stage then gets room under its last block (F4). */
const vetoBarShown = ref(false)

/** Why "Termin festlegen" cannot set a Date right now, or null (#52): the dock's action says so. */
const setBlocked = computed(() => {
  const key = dateBlockedKey(slots.value)
  return key === null ? null : t(key)
})

const hostActions = useHostActions(
  () => data.value,
  slug,
  { pollOpen, setBlocked, serverNow: serverClock.now },
  { actions, dialogs, invite: () => (inviteOpen.value = true) },
)

// The state of the page for everybody (#166): its kind, and the blocks of the stage in the order that state wants (A4).
const pageState = computed(() => (data.value ? eventPageState(data.value) : null))

// Compibert's header wears the party hat for a Player seated in a Leading Party (#38); no data (loading, error) is the plain head.
const accessory = computed(() => (data.value && wearsPartyhat(data.value) ? 'partyhat' as const : undefined))

// The header pill follows the page state, not the Event's Phase, which is running from the first start on (headerPill, #166).
const pill = computed(() => headerPill(pageState.value, data.value?.event.phase, t))

// The phone's views and the side panel's tabs are useEventTabs' (#257): the Event page, the Standings (#274) or the Activity feed.
const { wide, panelTab, activeView, tabs, panelTabs, selectView } = useEventTabs(room)

// What is new on the Standings (#276): a Result the page has not seen. One owner for the stage block and the panel's tab, which are mounted
// together, and for the live region below.
const { news } = useStandingsNews(data, slug)
</script>

<template>
  <AppShell
    kind="event"
    :accessory="accessory"
  >
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
            :teams="data.teams"
          />
        </template>
        <!-- The tab scrolls inside the panel (#274): the panel is as tall as the window, a long history is not. -->
        <template #standings>
          <div
            v-if="wide"
            class="min-h-0 flex-1 overflow-y-auto p-3.5"
          >
            <StandingsTab
              :view="data"
              :corrections="corrections"
              :news="news"
            />
          </div>
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

    <!-- The Standings' one polite announcement (#276): outside the branches of the stage and the phone views, so it exists before its text changes and
         survives a switch of tab; the Leaderboards have none, because the stage block and the panel's tab are mounted together and would read it twice. -->
    <p
      v-if="data"
      role="status"
      aria-live="polite"
      class="sr-only"
    >
      {{ news?.announcement }}
    </p>

    <EventStage
      v-if="data && pageState && (wide !== false || activeView === 'event')"
      :slug="slug"
      :view="data"
      :page-state="pageState"
      :news="news"
      :actions="actions"
      :votes="votes"
      :slots="slots"
      :room="room"
      :server-now="serverClock.now"
      :online="onlineState"
      :poll-open="pollOpen"
      :can-change-sessions="canChangeSessions"
      :veto-bar-shown="vetoBarShown"
      @pick="dialogs?.openConfirm($event)"
      @reschedule="dialogs?.openReschedule($event)"
      @add="dialogs?.openAdd()"
      @calendar="calendarOpen = true"
      @share="shareOpen = true"
      @replay="ceremonyLayer?.replay()"
    />

    <!-- A phone's other views (11-event-seite § TabBar): the Standings or the feed alone, with the Head's place taken by their title. -->
    <div
      v-else-if="data && wide === false"
      class="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-3.5 pt-4 pb-7"
    >
      <EventStandingsView
        v-if="activeView === 'standings'"
        :view="data"
        :corrections="corrections"
        :news="news"
      />
      <EventActivityView
        v-else
        :slug="slug"
        :room="room"
        :sessions="feed.started"
        :next-number="feed.nextNumber"
        :refresh-tick="feedTick"
        :teams="data.teams"
      />
    </div>

    <EventLoadState
      v-else-if="error"
      :error="error"
    />

    <!-- The synced clip (#230) over the stage; keyed by the draw, so a clip closed on this device shows again with the next draw. The Transition
         is the fade of a skip (#261): the Host's skip removes the whole overlay, and its own leave would not run then. The overlay's inner
         Transition keeps the fade of a clip that ends or is closed on this device. -->
    <Transition
      leave-active-class="transition-opacity dur-base ease-in"
      leave-to-class="opacity-0"
    >
      <ClipOverlay
        v-if="data?.clip"
        :key="data.clip.drawId"
        :clip="data.clip"
        :server-now="serverClock.now"
        :is-host="data.event.isHost"
        :skip="actions.skipClip"
      />
    </Transition>

    <!-- The Veto bar (F4): the window's hold button in a fixed layer above the clip, for a Player of a Party while the window is open. -->
    <VetoBar
      v-if="data?.wheel"
      :wheel="data.wheel"
      :teams="data.teams"
      :solo="data.settings?.teamSize === 1"
      :server-now="serverClock.now"
      :cast="actions.castVeto"
      @shown="vetoBarShown = $event"
    />

    <!-- The Host has the dock in every Phase; in a finished Event it holds Siegerehrung starten and Einladen (#277, #309). -->
    <HostDock
      v-if="data?.event.isHost"
      :actions="hostActions"
      panel
    />

    <!-- The Award ceremony (#309): mounted always, it opens itself at the start instant of the read's ceremony, for every Member. -->
    <CeremonyLayer
      v-if="data"
      ref="ceremonyLayer"
      :view="data"
      :server-now="serverClock.now"
      @share="shareOpen = true"
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

    <!-- „Bild teilen“ (#313): from the finished stage's row and from the ceremony's end frame; mounted once, the sheet asks nothing while closed. -->
    <ShareDialog
      v-if="data"
      :open="shareOpen"
      :view="data"
      @close="shareOpen = false"
    />
  </AppShell>
</template>
