<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { addPoolGame, settingsOf, togglePoolGame, type EventDraft, type StepLocks } from '~/utils/event-draft'
import { NO_FILTERS, type GameFilters, type GameView, type PoolGame } from '~~/shared/game'
import { hasWheel, poolHint } from '~~/shared/settings'

// The Game pool (#146; the Tiebreaker pool is gone, #279). The Host picks games in the game browser (#173, its filters are
// local, never the address) and can make a missing one in a sheet; it lands in the pool, and the wizard's other input stays
// where it is (the draft lives in the entry page). Empty pools are fine, so the step never blocks. Under the Lucky Wheel a
// note says that Bonus Vetoes need a few more games (#279). A Host who lost the Host permission (`locks.library` false) may
// not browse the library: the step says so instead of the browser, and the pool's games stay and can be removed.
const props = defineProps<{
  locks?: StepLocks
}>()
const draft = defineModel<EventDraft>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()
const { toast } = useToast()

useStepBlocker(blocker)

const games = computed(() => draft.value.pool)
const wheel = computed(() => hasWheel(draft.value.settings.selectionMode))
const library = computed(() => props.locks?.library !== false)
const filters = ref<GameFilters>({ ...NO_FILTERS })
const pooled = computed(() => new Set(games.value.map(game => game.id)))

// The setup hint of the Game pool (#146), and on a running Event the Host's live warning (#234) instead: its lock is present there.
const hint = computed(() => (props.locks?.poolWarning === undefined ? poolHint(settingsOf(draft.value), games.value.length) : null))
const liveWarning = computed(() => props.locks?.poolWarning ?? null)
// The sentence's keys (#146, #279): the Lucky Wheel's or Host pick's, for one game or more; `Last` when a Tie adds the possible last game.
const HINT_KEYS = {
  wheel: { one: 'stepper.pool.hintWheelOne', many: 'stepper.pool.hintWheel', oneLast: 'stepper.pool.hintWheelOneLast', manyLast: 'stepper.pool.hintWheelLast' },
  admin: { one: 'stepper.pool.hintAdminOne', many: 'stepper.pool.hintAdmin', oneLast: 'stepper.pool.hintAdminOneLast', manyLast: 'stepper.pool.hintAdminLast' },
} as const
const hintText = computed(() => {
  const numbers = hint.value
  if (!numbers) return ''
  // One key per whole sentence; the plural forms follow the count in the Pool („ist 1“ / „sind 12“), and a Game
  // count of 1 has its own key. With the Lucky Wheel the vetoes (Veto allowance × at least 2 teams) and the needed
  // games are always plural.
  const one = numbers.games === 1
  const keys = HINT_KEYS[numbers.vetoes > 0 ? 'wheel' : 'admin']
  const key = numbers.extra > 0 ? (one ? keys.oneLast : keys.manyLast) : (one ? keys.one : keys.many)
  return t(key, { games: numbers.games, vetoes: numbers.vetoes, needed: numbers.needed, have: numbers.have }, numbers.have)
})

const creating = ref(false)

function toggle(game: PoolGame) {
  draft.value = togglePoolGame(draft.value, game)
}

async function onSaved(game: GameView) {
  draft.value = addPoolGame(draft.value, game)
  creating.value = false
  toast({ tone: 'success', text: t('library.saved', { name: game.name }) })
  await refreshGameLibrary()
}
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <PoolWarning
      v-if="liveWarning"
      :warning="liveWarning"
    />
    <NoticeBanner
      v-if="hint"
      tone="warning"
    >
      <b>{{ t('stepper.pool.hintTitle') }}</b> {{ hintText }}
    </NoticeBanner>

    <section class="flex flex-col gap-2">
      <h2 class="m-0 font-display text-[22px] leading-tight font-normal">
        {{ t('stepper.pool.mainCount', { n: games.length }, games.length) }}
      </h2>
      <p
        v-if="games.length === 0"
        class="m-0 text-[15px] text-ink-2"
      >
        {{ t('stepper.pool.empty') }}
      </p>
      <ul
        v-else
        :aria-label="t('stepper.pool.listMain')"
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
                tone="error"
                :size="36"
                @click="toggle(game)"
              />
            </template>
          </GameCard>
        </li>
      </ul>
    </section>

    <NoticeBanner
      v-if="wheel"
      tone="info"
    >
      {{ t('stepper.pool.bonusNote') }}
    </NoticeBanner>

    <GameBrowser
      v-if="library"
      v-model:filters="filters"
      compact
    >
      <template #toolbar>
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
      <template #card-actions="{ game }">
        <IconButton
          v-if="pooled.has(game.id)"
          :icon="X"
          :label="t('stepper.pool.remove', { name: game.name })"
          tone="error"
          @click="toggle(game)"
        />
        <IconButton
          v-else
          :icon="Plus"
          :label="t('stepper.pool.add', { name: game.name })"
          @click="toggle(game)"
        />
      </template>
    </GameBrowser>
    <NoticeBanner
      v-else
      tone="warning"
    >
      {{ t('stepper.pool.noLibrary') }}
    </NoticeBanner>

    <AppSheet
      v-if="library"
      :open="creating"
      :title="t('stepper.pool.create')"
      @close="creating = false"
    >
      <GameForm @saved="onSaved" />
    </AppSheet>
  </div>
</template>
