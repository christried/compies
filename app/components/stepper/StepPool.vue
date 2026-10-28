<script setup lang="ts">
import { Plus, TriangleAlert, X } from '@lucide/vue'
import { addPoolGame, togglePoolGame, type EventDraft } from '~/utils/event-draft'
import type { PoolGame } from '~~/shared/event'
import type { GameView } from '~~/shared/game'
import { poolHint, type Pool } from '~~/shared/settings'

// Steps 6 and 7: the Game pool and the Tiebreaker pool (#146), one component for both (`kind`). The Host picks
// games from the library and can make a missing one in a sheet; it lands in the pool being filled, and the
// stepper's other input stays where it is (the draft lives in neu.vue). Empty pools are fine, so the step never
// blocks. Only the Game pool has the „Wird knapp“ hint, and it never blocks either.
const props = defineProps<{
  kind: Pool
}>()
const draft = defineModel<EventDraft>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()
const { toast } = useToast()

watchEffect(() => {
  blocker.value = null
})

const games = computed(() => draft.value.pools[props.kind])
const countKey = computed(() => (props.kind === 'main' ? 'stepper.pool.mainCount' : 'stepper.pool.tiebreakerCount'))
const listKey = computed(() => (props.kind === 'main' ? 'stepper.pool.listMain' : 'stepper.pool.listTiebreaker'))

const hint = computed(() => (props.kind === 'main' ? poolHint(draft.value.settings, games.value.length) : null))
const hintText = computed(() => {
  const numbers = hint.value
  if (!numbers) return ''
  // One key per whole sentence; the plural forms follow the count in the Pool („ist 1“ / „sind 12“), and a Game
  // count of 1 has its own key. With the Lucky Wheel the vetoes (Veto allowance × at least 2 teams) and the needed
  // games are always plural.
  const one = numbers.games === 1
  const key = numbers.vetoes > 0
    ? (one ? 'stepper.pool.hintWheelOne' : 'stepper.pool.hintWheel')
    : (one ? 'stepper.pool.hintAdminOne' : 'stepper.pool.hintAdmin')
  return t(key, { games: numbers.games, vetoes: numbers.vetoes, needed: numbers.needed, have: numbers.have }, numbers.have)
})

const creating = ref(false)

function toggle(game: PoolGame) {
  draft.value = togglePoolGame(draft.value, props.kind, game)
}

async function onSaved(game: GameView) {
  draft.value = addPoolGame(draft.value, props.kind, game)
  creating.value = false
  toast({ tone: 'success', text: t('library.saved', { name: game.name }) })
  await refreshNuxtData('games')
}
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <div
      v-if="hint"
      role="status"
      class="flex items-start gap-2.5 rounded-[12px] border-2 border-line bg-surface px-3.5 py-3"
    >
      <span
        class="grid size-7 flex-none place-items-center rounded-pill border-2 border-line bg-warning text-on-warning"
        aria-hidden="true"
      >
        <AppIcon
          :icon="TriangleAlert"
          :size="14"
        />
      </span>
      <p class="m-0 text-[14px] text-pretty">
        <b>{{ t('stepper.pool.hintTitle') }}</b> {{ hintText }}
      </p>
    </div>

    <section class="flex flex-col gap-2">
      <h2 class="m-0 font-display text-[22px] leading-tight font-normal">
        {{ t(countKey, { n: games.length }, games.length) }}
      </h2>
      <p
        v-if="games.length === 0"
        class="m-0 text-[15px] text-ink-2"
      >
        {{ t('stepper.pool.empty') }}
      </p>
      <ul
        v-else
        :aria-label="t(listKey)"
        class="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2"
      >
        <li
          v-for="game in games"
          :key="game.id"
          class="min-w-0"
        >
          <GameCard
            :game="game"
            layout="row"
          >
            <template #actions>
              <IconButton
                :icon="X"
                :label="t('stepper.pool.remove', { name: game.name })"
                :size="36"
                @click="toggle(game)"
              />
            </template>
          </GameCard>
        </li>
      </ul>
    </section>

    <GamePoolPicker
      :selected="games.map(game => game.id)"
      @toggle="toggle"
    >
      <template #actions>
        <AppButton
          variant="secondary"
          size="lg"
          @click="creating = true"
        >
          <template #icon>
            <AppIcon :icon="Plus" />
          </template>
          {{ t('stepper.pool.create') }}
        </AppButton>
      </template>
    </GamePoolPicker>

    <AppSheet
      :open="creating"
      :title="t('stepper.pool.create')"
      @close="creating = false"
    >
      <GameForm @saved="onSaved" />
    </AppSheet>
  </div>
</template>
