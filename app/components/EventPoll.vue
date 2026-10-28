<script setup lang="ts">
import { Check, Minus } from '@lucide/vue'
import type { PollSlotView } from '~/components/PollSlotCard.vue'
import type { OptimisticVotes } from '~/composables/useOptimisticVotes'
import { sessionsEditable, type EventView } from '~~/shared/event'

// The Date poll on the Event page (screen M3), while it is open: the kicker with the vote count, the Dates still
// missing, the legend, a card per Slot and "Wer kann wann?". The Votes are drawn as the page's useOptimisticVotes
// holds them, so a press shows at once. The Host picks a Slot on its card ("Termin festlegen"), and the "−" next
// to "N Termine gesucht" removes an undated Session (#55); the Event page runs both.
const props = defineProps<{
  view: EventView
  /** The open Slots in time order, with their day and time in Berlin. */
  slots: PollSlotView[]
  votes: OptimisticVotes
}>()

const emit = defineEmits<{
  pick: [slotId: string]
  removeSession: [sessionId: string]
}>()

const { t } = useI18n()
// The page keeps the same votes for its whole life, so its parts are taken once.
const { shown, savedNote, countsFor, myVoteFor, myNoteFor, notesFor, vote, saveNote } = props.votes

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
  <header class="flex flex-wrap items-end gap-3">
    <div class="flex min-w-[200px] flex-1 flex-col gap-0.5">
      <span class="text-[13px] font-bold text-ink-2">
        {{ t('mvp.poll.kicker', { voted: view.progress.voted, total: view.progress.total }) }}
      </span>
      <h2 class="m-0 font-display text-[32px] leading-none font-normal md:text-[44px]">
        {{ t('poll.title') }}
      </h2>
    </div>
  </header>

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

  <section
    v-if="slots.length === 0"
    class="flex flex-col gap-1 rounded-[20px] border-2 border-dashed border-line bg-surface p-5 text-ink-2"
  >
    <h2 class="m-0 text-[18px] text-ink">
      {{ t('mvp.reopen.noSlotsTitle') }}
    </h2>
    <p class="m-0 text-pretty">
      {{ view.event.isHost ? t('mvp.reopen.noSlotsHost') : t('mvp.reopen.noSlotsMember') }}
    </p>
  </section>

  <ol
    v-else
    class="m-0 grid list-none gap-3 p-0 md:grid-cols-4"
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
        :notes="notesFor(slot.id, view.members)"
        :my-note="myNoteFor(slot.id)"
        @vote="value => vote(slot.id, value)"
        @pick="emit('pick', slot.id)"
        @note="text => saveNote(slot.id, text)"
      />
    </li>
  </ol>

  <section
    v-if="slots.length > 0"
    class="flex flex-col gap-2"
  >
    <h2 class="m-0 font-display text-[26px] leading-[1.05] font-normal max-sm:text-[22px]">
      {{ t('mvp.poll.whoWhen') }}
    </h2>
    <PollMatrix
      :people="view.members"
      :slots="slots"
      :votes="shown"
      :me-id="view.viewerId"
    />
  </section>
</template>
