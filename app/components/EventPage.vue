<script setup lang="ts">
import { Link as LinkIcon } from '@lucide/vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { feedSessions } from '~/utils/activity'
import { ceremonyAwaitsSound } from '~/utils/ceremony'
import { stageInstants, stageUnsettled } from '~/utils/event-stage'
import { dateBlockedKey, eventPageState, headerPill, waitsForCeremony, wearsPartyhat } from '~/utils/event-page'
import { historyCorrections } from '~/utils/history-corrections'
import { emoteCue, type Cue } from '~/utils/sound-cues'
import type { EmoteId } from '~~/shared/emote'
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
// The wheel is heard (#531): the cue player schedules the read's plan on the audio clock, on the Event page only.
// The Award ceremony's plan comes from its layer, which knows the run the viewer sees and when they skip or close it (#743).
const ceremonyCues = shallowRef<readonly Cue[]>([])
const cues = useCuePlayer({
  view: () => data.value,
  serverNow: serverClock.now,
  ready: () => serverClock.ready.value,
  moved: () => serverClock.moves.value,
  ceremony: () => ceremonyCues.value,
})
// What this device shows is heard through the same player (#741): the Standings' sequence asks for its sounds with the function handed down here.
provideImmediateCue(cues.playNow)
// An Emote is heard through the same player (#770): its cue is the rule `emoteCue`'s, at the volume it gives, and the player's own Ton and context gates
// apply. The handler calls it first, before anything that may keep the rise from being drawn (#769): the reaction is heard with the board covered, the
// avatar scrolled away or the tab hidden.
const playEmoteCue = (message: { userId: string, emote: EmoteId, sound: boolean, serverTime: number }) => {
  const heard = emoteCue({ emote: message.emote, sound: message.sound, own: message.userId === data.value?.viewerId, serverTime: message.serverTime, now: serverClock.now() })
  if (heard) cues.playNow(heard.id, 0, heard.volume)
}
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
// The Host's Event notes reach the tiles, the dialogs and the picker through one context (#821, review 0.16 S6); a Member's page provides none, so nothing of them shows there.
// It is provided here, not by the stage: the picker is the dialogs', and the stage and the dialogs are siblings.
provideEventNotes(() => (data.value?.event.isHost
  ? { notes: data.value.eventNotes, eventName: data.value.event.name, finished: data.value.event.phase === 'finished', save: actions.saveEventNotes }
  : null))
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
// An Emote that arrives (#668) rises above its sender's avatar, wherever the room says it came from (the sender's own too: the room passes it back). It is drawn at once: no
// `serverTime`, no instant ahead (spec § C). An Emote never reaches Nuxt: it writes no Activity entry and no read changes. Compibert does not react (#673).
const { rising, rise, done: riseDone } = useRisingEmotes({ covered: () => covered.value })
room.on('emote.sent', (message) => {
  playEmoteCue(message)
  // #769: a cover, a hidden tab and an avatar scrolled away are decided inside `rise` by `emoteSeen`; an Emote that is not seen is dropped, not held.
  rise(message.userId, message.emote)
})
const sendEmote = (emote: EmoteId) => room.send({ type: 'emote.send', emote })
// A Message that is deleted: #763 turns it into its line by id. Listened for from #760 on, since room-listeners.test.ts wants a page listener per message type.
room.on('chat.deleted', () => {})

/** Whether the Veto bar covers the bottom of the page: the stage then gets room under its last block (F4), and the Clip shares the width with it held sideways (#584). */
const vetoBarShown = ref(false)

/** The Clip shows on this device (#587): the overlay says so, and it is open in its first render whenever the read carries a Clip, so the page starts from the read (the server's HTML has the backdrop, #699) and the overlay corrects it (closed on this device, ended). The backdrop is `clipShown`, which also needs the read to still carry the Clip: a skip drops it, and an overlay that left says nothing. */
const clipOpen = ref(!!data.value?.clip)
const clipShown = computed(() => clipOpen.value && !!data.value?.clip)

/** Why "Termin fixieren" cannot set a Date right now, or null (#52): the dock's action says so. */
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

// The state of the page for everybody (#166): its kind, and the blocks of the stage in the order that state wants (A4) at the order clock's `now` (#441: a block that
// something just happened in rises half a second after its moment). The clock lives here, not in the stage, so it survives a switch of the phone's tab; the stage
// and the phone's Event tab read the same state.
// A finished page waits for the Award ceremony (#445): until the Host has started it, and for a viewer who saw it waiting, until their run of the first start is over (useCeremonyHold).
const { held, release } = useCeremonyHold(data)
const { orderAt, counted, arrivals } = useStageOrder(() => data.value, serverClock.now, () => serverClock.ready.value)
const pageState = computed(() => (data.value ? eventPageState({ ...data.value, ceremonyHeld: held.value }, orderAt.value, counted.value) : null))
/** What waits for the ceremony asks the page state, which the Stage module decides (waitsForCeremony): the Winners, the party hat, the Tabelle tab and the feed. */
// „Ton aktivieren“ (#533): the page-wide gesture listener lives here, not in the stage, which a phone's Standings or Activity view does not mount.
const { noticeShown: soundNotice, unlock: unlockSound } = useSoundUnlock({
  suspended: cues.suspended,
  resume: cues.resume,
  ready: () => serverClock.ready.value,
  moment: () => pageState.value?.kind === 'running' || (!!data.value && ceremonyAwaitsSound(data.value, serverClock.now())),
})
const waits = computed(() => (pageState.value ? waitsForCeremony(pageState.value) : false))
/** The Standings' sequence waits while their block has not arrived on top (#442): false for a null clock (server render, reload, hidden tab) and for a view without a Result moment, which have no arrival. */
const standingsHeld = computed(() => {
  const arrival = arrivals.value.standings
  return orderAt.value !== null && arrival !== undefined && arrival > orderAt.value
})

// Compibert's header wears the party hat for a Player seated in a Leading Party (#38); no data (loading, error) is the plain head.
const accessory = computed(() => (data.value && wearsPartyhat(data.value, waits.value) ? 'partyhat' as const : undefined))

// The header pill follows the page state, not the Event's Phase, which is running from the first start on (headerPill, #166).
const pill = computed(() => headerPill(pageState.value, data.value?.event.phase, t))

// The phone's views and the side panel's tabs are useEventTabs' (#257): the Event page, the Standings (#274) or the Activity feed.
const { wide, panelTab, activeView, tabs, panelTabs, selectView } = useEventTabs(room)

// What is new on the Standings (#276): a Result the page has not seen. One owner for the stage block and the panel's tab, which are mounted
// together, and for the live region below.
const { news } = useStandingsNews(data, slug)

// The Tour (#647, spec #622): a Member who has not seen it gets it once the page is calm; only this page has one. It makes the page behind inert like the Clip's backdrop does, without
// drawing one: `covered` is the one flag for both, since the Tour's layer, like the Clip, stays usable in the `layers` slot.
const tour = useTour({ view: () => data.value, clipShown: () => clipShown.value, wide: () => wide.value === true })
const covered = computed(() => clipShown.value || tour.shown.value)
</script>

<template>
  <AppShell
    kind="event"
    :accessory="accessory"
    :event="data ? { name: data.event.name, ...pill } : undefined"
    :covered="covered"
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
      <!-- Einladen is the button from 1024 px and an icon from md (980) to 1023, where the header holds the nav (#426); a phone has it elsewhere. -->
      <AppButton
        variant="secondary"
        class="max-[63.99rem]:hidden"
        aria-haspopup="dialog"
        @click="inviteOpen = true"
      >
        <AppIcon
          :icon="LinkIcon"
          :size="16"
        />
        {{ t('common.invite') }}
      </AppButton>
      <IconButton
        :icon="LinkIcon"
        :label="t('common.invite')"
        aria-haspopup="dialog"
        class="max-md:hidden min-[64rem]:hidden"
        @click="inviteOpen = true"
      />
    </template>

    <template
      v-if="data"
      #banner
    >
      <!-- Under the Clip's backdrop and the Tour too (#587, #647): AppShell cannot wrap a slot, so the wrapper takes the `inert` itself. -->
      <div
        class="px-3.5 pt-3 empty:hidden md:px-6"
        :inert="covered || undefined"
      >
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
        <!-- The Chat listens for `chat.added` itself (#761); the panel hides its tabs with `v-show`, so both logs stay mounted. -->
        <template #chat>
          <ChatPanel
            v-if="wide"
            :slug="slug"
            :room="room"
            :members="data.members"
            :teams="data.teams"
            :viewer-id="data.viewerId"
            :active="panelTab === 'chat'"
            :finished="pageState?.kind === 'finished'"
          />
        </template>
        <template #activity>
          <ActivityFeed
            v-if="wide"
            :active="panelTab === 'activity'"
            :slug="slug"
            :room="room"
            :sessions="feed.started"
            :next-number="feed.nextNumber"
            :refresh-tick="feedTick"
            :teams="data.teams"
            :winners-hidden="waits"
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
              :waiting="waits"
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
      :counted="counted"
      :news="news"
      :standings-held="standingsHeld"
      :actions="actions"
      :votes="votes"
      :slots="slots"
      :room="room"
      :server-now="serverClock.now"
      :online="onlineState"
      :poll-open="pollOpen"
      :can-change-sessions="canChangeSessions"
      :veto-bar-shown="vetoBarShown"
      :sound-notice="soundNotice"
      @unlock="unlockSound"
      @pick="dialogs?.openConfirm($event)"
      @reschedule="dialogs?.openReschedule($event)"
      @add="dialogs?.openAdd()"
      @calendar="calendarOpen = true"
      @share="shareOpen = true"
      @replay="ceremonyLayer?.replay()"
      @emote="sendEmote"
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
        :waiting="waits"
      />
      <EventActivityView
        v-else
        :slug="slug"
        :room="room"
        :sessions="feed.started"
        :next-number="feed.nextNumber"
        :refresh-tick="feedTick"
        :teams="data.teams"
        :winners-hidden="waits"
      />
    </div>

    <EventLoadState
      v-else-if="error"
      :error="error"
    />

    <!-- The Award ceremony (#309): mounted always, it opens itself at the start instant of the read's ceremony, for every Member. -->
    <CeremonyLayer
      v-if="data"
      ref="ceremonyLayer"
      :view="data"
      :server-now="serverClock.now"
      @share="shareOpen = true"
      @over="release"
      @cues="ceremonyCues = $event"
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

    <!-- Fixed layers (#587): outside <main>, so they stay usable while the backdrop makes the rest of the page inert. The backdrop comes first,
         it lies under the Clip and the Veto bar by its layer. -->
    <template #layers>
      <!-- The Emotes that are rising (#668): over the board, under the header, the backdrop, the dock, the sheets, the Clip and the Veto bar by `layer-sticky`. -->
      <FloatingEmote
        v-for="entry in rising"
        :key="entry.key"
        :emote="entry.emote"
        :user-id="entry.userId"
        :anchor-el="entry.anchor"
        @done="riseDone(entry.key)"
      />

      <ClipBackdrop :shown="clipShown" />

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
          :veto-bar-shown="vetoBarShown"
          :skip="actions.skipClip"
          @shown="clipOpen = $event"
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

      <!-- The Tour (#647, #460): its own layer (the scrim, the spotlight, the bubble) on the modal step; the page behind is inert through `covered`. Mounted always (it watches `open`). -->
      <TourLayer
        v-if="data"
        :open="tour.shown.value"
        :steps="tour.run.value"
        @over="tour.over"
      />

      <!-- The Host has the dock in every Phase; in a finished Event it holds Siegerehrung starten and Einladen (#277, #309). -->
      <HostDock
        v-if="data?.event.isHost"
        :actions="hostActions"
        panel
      />
    </template>
  </AppShell>
</template>
