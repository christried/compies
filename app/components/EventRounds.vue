<script setup lang="ts">
import type { RoundView } from '~~/shared/event'

// The open Rounds on the stage (#228, 11-event-seite § EventPage, screen 15): every Round whose game is set and not put back,
// as a GameCard row with „wird gespielt“, in the order they started. The Round has no number (0.8 numbers it when its result
// is entered). Everyone sees the game's name, picture and player count; the Host also gets its Game notes, open, and
// „Zurücklegen“ as a hold, which removes the Round and returns a pool game to the pool. Nothing renders without an open Round.
// Motion: a row enters as a UI element does (04-motion § UI enters, banner: opacity 0.22 s `ease-out`) and leaves faster
// (0.14 s `ease-in`); reduced motion keeps the fade, which is all there is.
defineProps<{
  rounds: RoundView[]
  isHost: boolean
  /** Puts the Round back; resolves to whether the server took it (the hold shows done or goes idle). */
  putBack: (roundId: string) => Promise<boolean>
}>()

const { t } = useI18n()
const headingId = useId()
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
        <HoldToConfirmButton
          v-if="isHost"
          class="self-start"
          :label="t('rounds.putBack')"
          variant="secondary"
          size="dock"
          hint="badge"
          :action="() => putBack(round.id)"
        />
      </li>
    </TransitionGroup>
  </section>
</template>
