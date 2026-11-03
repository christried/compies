<script setup lang="ts">
import type { BoardTeam } from '~~/shared/event'
import type { ResultPlace } from '~~/shared/results'
import type { PointsTable } from '~~/shared/settings'
import type { RoundView } from '~~/shared/stage'

// The open Rounds on the stage (#228, 11-event-seite § EventPage, screen 15): every Round whose game is set and not put back,
// as a GameCard row with „wird gespielt“, in the order they started. An open Round has no Result and so no number (the number
// comes with the Result, #273). Everyone sees the game's name, picture and player count; the Host also gets its Game notes, open,
// „Ergebnis eintragen“, which opens the result sheet for that Round (#273), and „Zurücklegen“ as a hold, which removes the Round and returns
// a pool game to the pool. Everyone else reads under the card that the Host enters the Result. The sheet closes when its Round leaves the
// list (a Result from another tab, or a refetch after a refusal). Nothing renders without an open Round.
// Motion: a row enters as a UI element does (04-motion § UI enters, banner: opacity 0.22 s `ease-out`) and leaves faster
// (0.14 s `ease-in`); reduced motion keeps the fade, which is all there is.
const props = defineProps<{
  rounds: RoundView[]
  isHost: boolean
  /** Puts the Round back; resolves to whether the server took it (the hold shows done or goes idle). */
  putBack: (roundId: string) => Promise<boolean>
  /** The Parties, for the result sheet. */
  teams: BoardTeam[]
  /** The Event's Points table, for the sheet's preview; null while the Event is not set up (then there is nothing to enter). */
  pointsTable: PointsTable | null
  /** Enters the Result of a Round; resolves to whether the server took it (the sheet closes then). */
  enterResult: (roundId: string, places: ResultPlace[]) => Promise<boolean>
}>()

const { t } = useI18n()
const headingId = useId()

/** The Round whose result sheet is open. */
const resultFor = ref<string | null>(null)
const resultRound = computed(() => props.rounds.find(round => round.id === resultFor.value) ?? null)
watch(resultRound, (round) => {
  if (round === null) resultFor.value = null
})
</script>

<template>
  <section
    v-if="rounds.length > 0"
    :aria-labelledby="headingId"
    class="flex flex-col gap-3"
  >
    <h2
      :id="headingId"
      class="m-0 font-display text-[22px] leading-tight font-normal"
    >
      {{ t('rounds.title') }}
    </h2>
    <TransitionGroup
      tag="ul"
      :aria-label="t('rounds.list')"
      enter-active-class="animate-enter"
      leave-active-class="transition-opacity dur-fast ease-in"
      leave-to-class="opacity-0"
      class="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2"
    >
      <li
        v-for="round in rounds"
        :key="round.id"
        class="flex min-w-0 flex-col gap-2"
      >
        <GameCard
          :game="round.game"
          layout="row"
        >
          <template #actions>
            <span class="rounded-pill border-2 border-line bg-primary px-2.5 py-0.5 text-[12px] font-extrabold whitespace-nowrap text-on-primary">
              {{ t('rounds.playing') }}
            </span>
          </template>
        </GameCard>
        <GameNotesDisclosure
          v-if="round.notes"
          :notes="round.notes"
          start-open
        />
        <div
          v-if="isHost"
          class="flex flex-wrap items-center gap-2"
        >
          <AppButton
            v-if="pointsTable"
            size="card"
            @click="resultFor = round.id"
          >
            {{ t('result.title') }}
          </AppButton>
          <HoldToConfirmButton
            :label="t('rounds.putBack')"
            variant="secondary"
            size="dock"
            hint="badge"
            :action="() => putBack(round.id)"
          />
        </div>
        <p
          v-else
          class="m-0 text-small text-ink-2"
        >
          {{ t('rounds.hostEnters') }}
        </p>
      </li>
    </TransitionGroup>
    <ResultEntry
      v-if="isHost && pointsTable"
      :open="resultRound !== null"
      :game="resultRound?.game ?? null"
      :teams="teams"
      :points-table="pointsTable"
      :save="places => enterResult(resultFor!, places)"
      @close="resultFor = null"
    />
  </section>
</template>
