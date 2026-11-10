<script setup lang="ts">
import { GAME_GRID } from '~/utils/game-grid'
import { CARD_REFLOW_CLASS, leaveInPlace, unwatched } from '~/utils/motion'
import type { BoardTeam } from '~~/shared/event'
import type { ResultPlace } from '~~/shared/results'
import type { PointsTable } from '~~/shared/settings'
import type { EndView, RoundView } from '~~/shared/stage'

// The open Rounds on the stage (#228, 11-event-seite § EventPage, screen 15): every Round whose game is set and not put back,
// as a GameCard tile (#435: picture and name only, no „wird gespielt“ badge and no Price; the Price returns in the game dialog, #444),
// in the order they started. An open Round has no Result and so no number (the number comes with the Result, #273). Everyone sees
// the game's name and picture; the Host also gets its Game notes, open,
// „Ergebnis eintragen“, which opens the result sheet for that Round (#273), and „Zurücklegen“ as a hold, which removes the Round and returns
// a pool game to the pool. Everyone else reads under the card that the Host enters the Result. The sheet closes when its Round leaves the
// list (a Result from another tab, or a refetch after a refusal). The sheet's kicker is „Spiel {played + 1} von {gameCount}“ from `end` (#274):
// a Round gets the highest number + 1 when its Result is entered and numbers have no gaps, so the Round being scored is Spiel `played + 1`. Nothing renders without an open Round.
// Motion: a row enters as a UI element does (04-motion § UI enters, banner: opacity 0.22 s `ease-out`) and leaves faster
// (0.14 s `ease-in`); reduced motion keeps the fade, which is all there is. A card that leaves goes out of the layout in the render that starts its
// fade (`leaveInPlace`, #276), so the blocks below glide up with the page's group and the cards that stay glide to their new cell (`CARD_REFLOW_CLASS`: a card may cross the grid, so a gentler curve than the blocks').
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
  /** How far the Event is (#274); null while it is not set up: the sheet then has no kicker. */
  end: EndView | null
}>()

const { t } = useI18n()
const headingId = useId()

/** The Round whose result sheet is open. */
const resultFor = ref<string | null>(null)
const resultRound = computed(() => props.rounds.find(round => round.id === resultFor.value) ?? null)
watch(resultRound, (round) => {
  if (round === null) resultFor.value = null
})

/** Where in the list the Round of the open sheet stood: after its save the one that takes that place is the next. */
let openedAt = 0
function openResult(roundId: string, index: number) {
  resultFor.value = roundId
  openedAt = index
}

const section = useTemplateRef<HTMLElement>('section')
// The save removes the Round whose card holds the button that opened the sheet, so the sheet's own return of focus finds nothing (#274, Q3 of the
// Release review): the button is gone or leaving (`leaveInPlace` makes the leaver inert), and with the last Round the whole section goes. Once the sheet has
// closed and the page has settled, focus that has fallen to the body, or stayed on a leaver, goes to the next open Round's button, and with none left to
// the stage's heading (`tabindex="-1"`, EventPageHead). Focus that returned to its button (Escape, the overlay) stays.
watch(resultFor, async (id, was) => {
  if (id !== null || was === null) return
  await nextTick()
  const active = document.activeElement
  if (active && active !== document.body && active.isConnected && !active.closest('[inert]')) return
  const buttons = [...(section.value?.querySelectorAll<HTMLElement>('[data-result]') ?? [])].filter(button => !button.closest('[inert]'))
  const next = buttons[Math.min(openedAt, buttons.length - 1)]
  ;(next ?? document.querySelector<HTMLElement>('#stage h1'))?.focus()
})
</script>

<template>
  <section
    v-if="rounds.length > 0"
    ref="section"
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
      :move-class="unwatched() ? undefined : CARD_REFLOW_CLASS"
      class="relative m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2"
      @before-leave="leaveInPlace"
    >
      <li
        v-for="(round, index) in rounds"
        :key="round.id"
        class="flex min-w-0 flex-col gap-2"
      >
        <!-- The Round's game as a tile in the pool's grid, one column wide (#435); the „wird gespielt“ badge is gone. -->
        <div :class="GAME_GRID">
          <GameCard
            :game="round.game"
            layout="tile"
          />
        </div>
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
            data-result
            @click="openResult(round.id, index)"
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
  </section>
  <!-- Outside the section: the sheet's lifetime must not depend on the list its own save empties (#274). -->
  <ResultEntry
    v-if="isHost && pointsTable"
    :open="resultRound !== null"
    :game="resultRound?.game ?? null"
    :kicker="end ? { number: end.played + 1, total: end.gameCount } : null"
    :teams="teams"
    :points-table="pointsTable"
    :save="places => enterResult(resultFor!, places)"
    @close="resultFor = null"
  />
</template>
