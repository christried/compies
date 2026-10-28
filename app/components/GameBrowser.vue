<script setup lang="ts">
import { Search } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { NO_FILTERS, SUITABILITIES, filterGames, parsePlayerCount, type GameFilters, type GameView } from '~~/shared/game'

// The one game browser (#173, review B4): the library page and both pool pickers show the Game library through it.
// It owns the single fetch (`useGameLibrary`), the search field with the magnifying glass, the filters and the five
// states, loading, error, empty library, no match and results, as one state machine. What differs is handed in: the
// filter state (`v-model:filters`, the library binds it to the address, the picker keeps it local), `compact` (only the
// search and „Alle / Von mir“), `to` (the card links to the game), `#card-actions` (the picker's ＋ and ✕) and `#toolbar`
// („Neues Spiel anlegen“, on the search row). The filtering is client side (`filterGames`), so it follows every
// keystroke. The grid from md up and the rows below are CSS (GameCard `responsive`), not `matchMedia`.
defineProps<{
  compact?: boolean
  /** Where a card leads; without it the cards are plain. */
  to?: (game: GameView) => RouteLocationRaw
}>()
const filters = defineModel<GameFilters>('filters', { required: true })

defineSlots<{
  'card-actions'?: (props: { game: GameView }) => unknown
  'toolbar'?: () => unknown
  /** Beside the empty library and the no-match notice: the way to a new game. */
  'empty-action'?: () => unknown
}>()

const { t } = useI18n()
const viewerId = useAuthUser().value?.id ?? ''
const { games, error, refresh } = useGameLibrary()

const PLAYER_CHOICES = Array.from({ length: 24 }, (_, index) => index + 1)

const shown = computed(() => filterGames(games.value ?? [], filters.value, viewerId))
// Loading means no list yet: a revalidation of a list we already hold shows no skeleton.
const state = computed(() => {
  if (!games.value) return error.value ? 'error' : 'loading'
  if (games.value.length === 0) return 'empty'
  return shown.value.length === 0 ? 'noMatch' : 'results'
})
const anyFilter = computed(() => {
  const { q, players, suitability, mine } = filters.value
  return Boolean(q.trim() || players !== null || suitability || mine)
})

function set(changes: Partial<GameFilters>) {
  filters.value = { ...filters.value, ...changes }
}
function onPlayers(event: Event) {
  set({ players: parsePlayerCount((event.target as HTMLSelectElement).value) })
}
function onSuitability(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  set({ suitability: SUITABILITIES.find(suitability => suitability === value) ?? null })
}

// The grid wraps as many cards as fit from md up; below it the cards are rows.
const GRID = 'md:grid md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] md:gap-3'
const CHIP = 'inline-flex h-11 items-center gap-1.5 rounded-pill border-(length:--cp-bw) px-4 text-small font-bold transition-colors'
const CHIP_OFF = 'border-line bg-surface text-ink hover:bg-paper-2'
const CHIP_ON = 'border-line bg-ink text-paper'
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2.5">
      <div
        v-if="state !== 'empty'"
        class="relative flex min-w-[220px] flex-1 items-center"
      >
        <AppIcon
          :icon="Search"
          :size="18"
          class="pointer-events-none absolute left-3.5 text-ink-2"
        />
        <input
          :value="filters.q"
          type="search"
          :aria-label="t('library.search')"
          :placeholder="games ? t('library.searchPlaceholder', { n: games.length }) : t('library.search')"
          class="h-control-lg w-full rounded-[12px] border-(length:--cp-bw) border-line bg-surface py-0 pr-3.5 pl-[42px] text-[17px] text-ink"
          @input="set({ q: ($event.target as HTMLInputElement).value })"
        >
      </div>

      <slot name="toolbar" />

      <div
        v-if="state !== 'empty'"
        class="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          :aria-pressed="anyFilter ? 'false' : 'true'"
          :class="[CHIP, anyFilter ? CHIP_OFF : CHIP_ON]"
          @click="filters = { ...NO_FILTERS }"
        >
          {{ t('library.all') }}
        </button>
        <template v-if="!compact">
          <select
            :value="filters.players === null ? '' : String(filters.players)"
            :aria-label="t('library.filterPlayers')"
            :class="[CHIP, filters.players !== null ? CHIP_ON : CHIP_OFF]"
            @change="onPlayers"
          >
            <option value="">
              {{ t('library.filterPlayers') }}
            </option>
            <option
              v-for="n in PLAYER_CHOICES"
              :key="n"
              :value="String(n)"
            >
              {{ t('library.players', { n }) }}
            </option>
          </select>
          <select
            :value="filters.suitability ?? ''"
            :aria-label="t('library.filterSuitability')"
            :class="[CHIP, filters.suitability ? CHIP_ON : CHIP_OFF]"
            @change="onSuitability"
          >
            <option value="">
              {{ t('library.filterSuitability') }}
            </option>
            <option
              v-for="suitability in SUITABILITIES"
              :key="suitability"
              :value="suitability"
            >
              {{ t(`library.suitability.${suitability}`) }}
            </option>
          </select>
        </template>
        <button
          type="button"
          :aria-pressed="filters.mine ? 'true' : 'false'"
          :class="[CHIP, filters.mine ? CHIP_ON : CHIP_OFF]"
          @click="set({ mine: !filters.mine })"
        >
          {{ t('library.filterMine') }}
        </button>
      </div>
    </div>

    <NoticeBanner
      v-if="state === 'error'"
      tone="critical"
    >
      {{ t('library.listFailed') }}
      <template #action>
        <AppButton
          variant="secondary"
          @click="refresh()"
        >
          {{ t('errorPage.generic.retry') }}
        </AppButton>
      </template>
    </NoticeBanner>

    <div
      v-else-if="state === 'loading'"
      aria-busy="true"
      :aria-label="t('library.loading')"
      class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3"
    >
      <SkeletonCard
        v-for="n in 8"
        :key="n"
      />
    </div>

    <EmptyState
      v-else-if="state === 'empty'"
      :title="t('empty.library.title')"
      :text="t('empty.library.text')"
    >
      <template
        v-if="$slots['empty-action']"
        #action
      >
        <slot name="empty-action" />
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="state === 'noMatch'"
      :title="filters.q.trim() ? t('library.noMatch', { q: filters.q.trim() }) : t('empty.search.title')"
      :text="t('empty.search.text')"
    >
      <template
        v-if="$slots['empty-action']"
        #action
      >
        <slot name="empty-action" />
      </template>
    </EmptyState>

    <ul
      v-else-if="state === 'results'"
      :aria-label="t('library.title')"
      class="m-0 flex list-none flex-col gap-2 p-0"
      :class="GRID"
    >
      <li
        v-for="game in shown"
        :key="game.id"
        class="min-w-0"
      >
        <GameCard
          :game="game"
          layout="responsive"
          :to="to?.(game)"
          class="h-full"
        >
          <template
            v-if="$slots['card-actions']"
            #actions
          >
            <slot
              name="card-actions"
              :game="game"
            />
          </template>
        </GameCard>
      </li>
    </ul>
  </div>
</template>
