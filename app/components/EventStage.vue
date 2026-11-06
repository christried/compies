<script setup lang="ts">
import { Lock } from '@lucide/vue'
import { gamesToStart, seatNote, teamsStay, type EventPageState } from '~/utils/event-page'
import type { OptimisticVotes } from '~/composables/useOptimisticVotes'
import type { StandingsNews } from '~/utils/standings-news'
import { REFLOW_CLASS, unwatched } from '~/utils/motion'
import { hasStarted } from '~~/shared/session-state'
import type { EventView } from '~~/shared/event'
import { settingsPath } from '~~/shared/links'
import { leadersOf } from '~~/shared/finish'
import { settingsEditable } from '~~/shared/settings'

// The stage of the Event page (#166, A4, #283): the group of blocks `eventPageState(...).blocks` lists, in its order, and the switch that
// turns each block into its component. The page keeps the shell, the dock, the tabs and the Host's dialogs; what a block asks the dialogs for
// goes up as an event. A block is listed only when its data is there (eventPageState, #256, #274), and the Tie banner only for who reads it
// (#283), so nothing here checks the data again except `sessionNeeded`, which is the Host's notice. The group's enter, leave and move
// motion is the page's one (04-motion): keep it on this TransitionGroup.
const props = defineProps<{
  slug: string
  view: EventView
  pageState: EventPageState
  /** What is new on the Standings (#276): the stage block celebrates it. */
  news: StandingsNews | null
  actions: ReturnType<typeof useStageActions>
  votes: OptimisticVotes
  /** The open Slots with their day and time in Berlin, for the poll. */
  slots: { id: string, day: string, time: string, past: boolean }[]
  /** The page's one socket (GameBoard listens to the moves on it). */
  room: Pick<ReturnType<typeof useEventRoom>, 'on'>
  /** The server clock's `now`: the blocks that run toward an instant (the wheel #229, the Countdown #236, the coin #235). */
  serverNow: () => number
  /** Who is online (#162), for the Game board's dots; undefined while presence is not known. */
  online: (userId: string) => boolean | undefined
  /** The Date poll is open, and Sessions can be changed in this Phase: computed once by the page for the cards and the dialogs (#238). */
  pollOpen: boolean
  canChangeSessions: boolean
  /** The Veto bar covers the bottom of the page: the stage then gets room under its last block (F4). */
  vetoBarShown: boolean
}>()

const emit = defineEmits<{
  /** A Slot card's „Termin festlegen“ (the confirm dialog), the Sessions card's actions and the Session-needed notice's button. */
  pick: [slotId: string]
  reschedule: [sessionId: string]
  add: []
  calendar: []
  /** „Bild teilen“ of the finished stage's row (#313). */
  share: []
  /** „Siegerehrung ansehen“ of the same row (#314): the page's layer plays the ceremony again. */
  replay: []
}>()

const { t } = useI18n()

const hostName = computed(() => props.view.members.find(member => member.isHost)?.name ?? '')

// The settings editor (#147): the Host opens it from the dock, and from a notice while the Event is not set up.
const canEditSettings = computed(() => props.view.event.isHost && settingsEditable(props.view.event.phase))
const needsSetup = computed(() => canEditSettings.value && props.view.settings === null)
/** The first Session has started: the teams and their names are locked for Players. */
const started = computed(() => hasStarted(props.view.sessions))

// The Host's seat note (teams only): where the Host sits does not change the dock, and the note says so. Closed for this visit.
const seat = computed(() => seatNote(props.view, t))
const stay = computed(() => teamsStay(props.pageState.next, props.view.event.isHost, t))
</script>

<template>
  <TransitionGroup
    tag="div"
    :move-class="unwatched() ? undefined : REFLOW_CLASS"
    class="mx-auto flex w-full max-w-[1100px] flex-col gap-[18px] px-3.5 pt-4 md:gap-[22px] md:px-6 md:pt-6"
    :class="vetoBarShown ? 'pb-[230px] md:pb-[190px]' : [view.event.isHost ? 'pb-[92px]' : 'pb-7', 'md:pb-10']"
  >
    <div
      v-for="block in pageState.blocks"
      :key="block"
      class="min-w-0 empty:hidden"
    >
      <EventPageHead
        v-if="block === 'head'"
        :state="pageState"
        :is-host="view.event.isHost"
        :winners="leadersOf(view.standings ?? [])"
        :teams="view.teams"
      />

      <ReopenNotices
        v-else-if="block === 'reopen'"
        :view="view"
      />

      <EventFinishedActions
        v-else-if="block === 'actions'"
        :ceremony-started="view.ceremony !== null"
        @share="emit('share')"
        @replay="emit('replay')"
      />

      <!-- A block is listed only when its data is there (eventPageState, #256, #274): the data props of the five below are not optional. -->
      <PoolWarning
        v-else-if="block === 'pool'"
        :warning="view.setGame!.poolWarning!"
      />

      <EventSetupNotice
        v-else-if="block === 'setup'"
        :slug="slug"
        :is-host="view.event.isHost"
        :needs-setup="needsSetup"
        :host-name="hostName"
      />

      <EventSeatNotice
        v-else-if="block === 'seat'"
        :note="seat"
      />

      <EventPoll
        v-else-if="block === 'poll'"
        :view="view"
        :slots="slots"
        :votes="votes"
        :number="pageState.pollNumber"
        :compact="pageState.pollCompact"
        :can-change-sessions="canChangeSessions"
        @pick="emit('pick', $event)"
        @remove-session="actions.removeSession"
      />

      <StageWheel
        v-else-if="block === 'wheel'"
        :view="view"
        :server-now="serverNow"
      />

      <EventRounds
        v-else-if="block === 'rounds'"
        :rounds="view.rounds"
        :is-host="view.event.isHost"
        :put-back="actions.putBackRound"
        :teams="view.teams"
        :points-table="view.settings?.pointsTable ?? null"
        :enter-result="actions.enterResult"
        :end="view.end"
      />

      <Leaderboard
        v-else-if="block === 'standings'"
        framed
        celebrate
        :standings="view.standings!"
        :end="view.end!"
        :teams="view.teams"
        :news="news"
      />

      <!-- The history of the finished stage is read-only for everyone: no `corrections` (#275), not even for the Host (#277). -->
      <div
        v-else-if="block === 'history'"
        class="rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 shadow-card"
      >
        <GameHistory
          :results="view.results"
          :open="[]"
          :teams="view.teams"
        />
      </div>

      <EventCountdown
        v-else-if="block === 'countdown'"
        :countdown="view.countdown!"
        :server-now="serverNow"
        :is-host="view.event.isHost"
        :command="actions.countdown"
      />

      <CoinFlip
        v-else-if="block === 'coin'"
        :toss="view.coin!"
        :server-now="serverNow"
      />

      <GameBoard
        v-else-if="block === 'board'"
        :slug="slug"
        :members="view.members"
        :teams="view.teams"
        :settings="view.settings"
        :team-choice-open="view.teamChoiceOpen"
        :page-kind="pageState.kind"
        :viewer-id="view.viewerId"
        :is-host="view.event.isHost"
        :room="room"
        :online="online"
      />

      <!-- A Tie (#278): listed for everybody but the Host, who decides (pageBlocks, #283). -->
      <NoticeBanner
        v-else-if="block === 'tie'"
        tone="info"
      >
        {{ t('event.notice.tie') }}
      </NoticeBanner>

      <!-- The last game needs a Session (#278): the Host only, for a Member the wrapper hides itself. The sheet is the Sessions card's (`openAdd`). `end` is there whenever the block is. -->
      <EventSessionNotice
        v-else-if="block === 'sessionNeeded' && view.event.isHost"
        :left="gamesToStart(view.end!, view.rounds.length)"
        @add="emit('add')"
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
        class="grid grid-cols-1 items-start gap-4 md:grid-cols-2"
      >
        <EventSessions
          :view="view"
          :reopen="actions.reopenSession"
          :remove="actions.removeSession"
          :poll-number="pageState.pollNumber"
          :poll-open="pollOpen"
          :can-change-sessions="canChangeSessions"
          :shadow="pageState.cardsStandOut"
          @reschedule="emit('reschedule', $event)"
          @add="emit('add')"
          @calendar="emit('calendar')"
        />
        <HowWePlayCard
          :settings="view.settings"
          :pool="view.pool"
          :is-host="view.event.isHost"
          :edit-to="canEditSettings && view.settings !== null ? settingsPath(slug) : null"
          :locked="started"
          :host-name="hostName"
        />
      </div>
    </div>
  </TransitionGroup>
</template>
