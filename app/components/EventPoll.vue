<script setup lang="ts">
import { Check, ChevronDown, Minus, Users } from '@lucide/vue'
import type { PollSlotView } from '~/components/PollSlotCard.vue'
import type { OptimisticVotes } from '~/composables/useOptimisticVotes'
import { pollHeadingId } from '~/utils/jump'
import { sessionsEditable, type EventView } from '~~/shared/event'

// The Date poll on the Event page (screen M3, #166, 11-event-seite § EventPoll), while it is open: its title with the vote
// count, the Dates still missing, the legend, a card per Slot and "Wer kann wann?". The Votes are drawn as the page's
// useOptimisticVotes holds them, so a press shows at once. The Host picks a Slot on its card ("Termin festlegen"), and the
// "−" next to "N Termine gesucht" removes an undated Session (#55); the Event page runs both. `compact` is the poll of a
// later Session below the Game board: "Wer kann wann?" is folded behind a button, and the pick is no primary (the dock
// owns it). Its heading is where the Head's link and the Sessions card jump to; the Head carries "Wann zocken wir?".
const props = withDefaults(defineProps<{
  view: EventView
  /** The open Slots in time order, with their day and time in Berlin. */
  slots: PollSlotView[]
  votes: OptimisticVotes
  /** The shown number of the Session whose Date this poll sets; null for the only Session of an Event. */
  number?: number | null
  /** Another Session already has a Date: a quieter poll. */
  compact?: boolean
}>(), { number: null, compact: false })

const emit = defineEmits<{
  pick: [slotId: string]
  removeSession: [sessionId: string]
}>()

const { t } = useI18n()
// The page keeps the same votes for its whole life, so its parts are taken once.
const { shown, savedNote, countsFor, myVoteFor, myNoteFor, notesFor, vote, saveNote } = props.votes

const headingId = computed(() => pollHeadingId(props.number))
const matrixId = useId()
const matrixOpen = ref(false)
const showMatrix = computed(() => !props.compact || matrixOpen.value)

const missing = computed(() => props.view.missingDates)

/** The "−" removes one undated Session with one tap, as long as one Session stays (#55). */
const canRemoveMissing = computed(() => props.view.event.isHost && sessionsEditable(props.view.event.phase) && props.view.sessions.length > 1)

/** The last Session still waiting for a Date: the one the "−" removes. */
const lastUndated = computed(() => [...props.view.sessions].reverse().find(session => session.startsAt === null) ?? null)

function removeMissing() {
  if (lastUndated.value) emit('removeSession', lastUndated.value.id)
}
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex flex-col gap-3.5"
  >
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2
        :id="headingId"
        tabindex="-1"
        class="m-0 scroll-mt-20 font-display text-[24px] leading-none font-normal outline-none md:text-[30px]"
      >
        {{ number === null ? t('phase.poll') : t('event.poll.title', { n: number }) }}
      </h2>
      <span class="text-[13px] font-bold text-ink-2">{{ t('event.sessions.voted', view.progress) }}</span>
    </div>

    <NoticeBanner
      v-if="savedNote"
      tone="success"
      :icon="Check"
      closable
      @close="savedNote = false"
    >
      {{ t('mvp.poll.savedNote') }}
    </NoticeBanner>

    <div
      v-if="missing > 0"
      class="flex flex-wrap items-center gap-3"
    >
      <p class="m-0 font-display text-[26px] leading-[1.05] max-sm:text-[22px]">
        {{ t('mvp.poll.missingDates', { n: missing }, missing) }}
      </p>
      <IconButton
        v-if="canRemoveMissing"
        :icon="Minus"
        :label="t('mvp.sessions.removeMissing')"
        @click="removeMissing"
      />
    </div>

    <VoteLegend v-if="slots.length > 0" />

    <div
      v-if="slots.length === 0"
      class="flex flex-col gap-1 rounded-[20px] border-2 border-dashed border-line bg-surface p-5 text-ink-2"
    >
      <h3 class="m-0 text-[18px] text-ink">
        {{ t('mvp.reopen.noSlotsTitle') }}
      </h3>
      <p class="m-0 text-pretty">
        {{ view.event.isHost ? t('mvp.reopen.noSlotsHost') : t('mvp.reopen.noSlotsMember') }}
      </p>
    </div>

    <ol
      v-else
      class="m-0 grid list-none gap-3.5 p-0 pt-2 md:grid-cols-4"
    >
      <li
        v-for="slot in slots"
        :key="slot.id"
      >
        <PollSlotCard
          :timeslot="slot"
          :counts="countsFor(slot.id)"
          :total="view.members.length"
          :my-vote="myVoteFor(slot.id)"
          :best="view.bestSlotId === slot.id"
          :can-pick="view.event.isHost"
          :compact="compact"
          :notes="notesFor(slot.id, view.members)"
          :my-note="myNoteFor(slot.id)"
          @vote="value => vote(slot.id, value)"
          @pick="emit('pick', slot.id)"
          @note="text => saveNote(slot.id, text)"
        />
      </li>
    </ol>

    <button
      v-if="slots.length > 0 && compact"
      type="button"
      class="outline-memphis inline-flex h-11 items-center gap-2 self-start rounded-pill border-(length:--cp-bw) border-line bg-surface px-4 text-[14px] font-extrabold text-ink"
      :aria-expanded="matrixOpen"
      :aria-controls="matrixId"
      @click="matrixOpen = !matrixOpen"
    >
      <AppIcon
        :icon="Users"
        :size="16"
      />
      {{ t('event.poll.matrixToggle', view.progress) }}
      <AppIcon
        :icon="ChevronDown"
        :size="16"
        :class="matrixOpen && 'rotate-180'"
      />
    </button>

    <div
      v-if="slots.length > 0"
      :id="matrixId"
      class="flex flex-col gap-2"
    >
      <template v-if="showMatrix">
        <h3 class="m-0 text-[17px] font-extrabold">
          {{ t('mvp.poll.whoWhen') }}
        </h3>
        <PollMatrix
          :people="view.members"
          :slots="slots"
          :votes="shown"
          :me-id="view.viewerId"
        />
      </template>
    </div>
  </section>
</template>
