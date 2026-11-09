<script setup lang="ts">
import { Search } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { NO_FILTERS, SUITABILITIES, filterGames, parsePlayerCount, type GameFilters, type GameView } from '~~/shared/game'
import { CHIP_OFF, CHIP_ON, CHIP_SHAPE } from '~/utils/chip-look'

// The one game browser (#173, review B4): the library page and both pool pickers show the Game library through it.
// It owns the single fetch (`useGameLibrary`), the search field with the magnifying glass, the filters, the five
// states, loading, error, empty library, no match and results, as one state machine, and the paging of the results
// (#369: 40 cards a page over the filtered list, more by a sentinel or „Mehr laden“). What differs is handed in: the
// filter state (`v-model:filters`, the library binds it to the address, the picker keeps it local), `compact` (only the
// search, „Alle“, the Tag and „Von mir“), `to` (the card links to the game), `#card-actions` (the picker's ＋ and ✕) and `#toolbar`
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
const { games, tagsInUse, error, refresh } = useGameLibrary()

const PLAYER_CHOICES = Array.from({ length: 24 }, (_, index) => index + 1)

// The Tags offered: the ones some game carries, by label (German collation); `tagsInUse` comes by key (#336).
const tagOptions = computed(() => [...tagsInUse.value].sort((a, b) => a.label.localeCompare(b.label, 'de')))
// An active Tag that no game carries (an old address, or its last game lost it): shown as the chip's value so the filter says what it does, but not offered.
const strayTag = computed(() => {
  const key = filters.value.tag
  return key !== null && !tagsInUse.value.some(tag => tag.key === key) ? key : null
})

// The options of the three filter selects (FilterSelect, #362): the empty option is the „nothing chosen“ value ''.
const playerOptions = computed(() => PLAYER_CHOICES.map(n => ({ value: String(n), label: t('library.players', { n }) })))
const suitabilityOptions = computed(() => SUITABILITIES.map(suitability => ({ value: suitability, label: t(`library.suitability.${suitability}`) })))
const tagChoices = computed(() => [
  ...tagOptions.value.map(tag => ({ value: tag.key, label: tag.label })),
  ...(strayTag.value ? [{ value: strayTag.value, label: strayTag.value }] : []),
])

const shown = computed(() => filterGames(games.value ?? [], filters.value, viewerId))
// Loading means no list yet: a revalidation of a list we already hold shows no skeleton.
const state = computed(() => {
  if (!games.value) return error.value ? 'error' : 'loading'
  if (games.value.length === 0) return 'empty'
  return shown.value.length === 0 ? 'noMatch' : 'results'
})
const anyFilter = computed(() => {
  const { q, players, suitability, tag, mine } = filters.value
  return Boolean(q.trim() || players !== null || suitability || tag !== null || mine)
})

// The paging (#369): the search and the filters run over the whole library, only the cards drawn are cut. The dev
// library's ~1500 cards cost 1.1-1.5 s at the open of the picker sheet.
const PAGE_SIZE = 40
const limit = ref(PAGE_SIZE)
const visible = computed(() => shown.value.slice(0, limit.value))
const remaining = computed(() => shown.value.length - visible.value.length)
// Any change of the filters starts at the first page again (#369): after a search narrowed the list and „Alle“ widened it, 40 cards, not the 120 loaded before.
watch(() => JSON.stringify(filters.value), () => {
  limit.value = PAGE_SIZE
})

const sentinel = useTemplateRef<HTMLElement>('sentinel')
const status = useTemplateRef<HTMLElement>('status')
let observer: IntersectionObserver | undefined
function more() {
  limit.value += PAGE_SIZE
}
async function onMore() {
  more()
  // The click that drew the last page removes the button it was on: focus goes to the status line, not to the page.
  if (remaining.value === 0) {
    await nextTick()
    status.value?.focus()
  }
}
// A fresh observer per page and per sentinel: one that still sees the sentinel after a page (a tall screen) fires again at once, which a long-lived observer would not.
watch([sentinel, () => visible.value.length], () => {
  observer?.disconnect()
  observer = undefined
  const element = sentinel.value
  if (!element || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) more()
  }, { rootMargin: '0px 0px 400px 0px' })
  observer.observe(element)
}, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())

function set(changes: Partial<GameFilters>) {
  filters.value = { ...filters.value, ...changes }
}

// The grid wraps as many cards as fit from md up; below it the cards are rows.
const GRID = 'md:grid md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] md:items-stretch md:gap-3'
const CHIP = `inline-flex ${CHIP_SHAPE} items-center gap-1.5 px-4 text-small`
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
          <FilterSelect
            :model-value="filters.players === null ? '' : String(filters.players)"
            :options="playerOptions"
            :empty-label="t('library.filterPlayers')"
            :aria-label="t('library.filterPlayers')"
            @update:model-value="set({ players: parsePlayerCount($event) })"
          />
          <FilterSelect
            :model-value="filters.suitability ?? ''"
            :options="suitabilityOptions"
            :empty-label="t('library.filterSuitability')"
            :aria-label="t('library.filterSuitability')"
            @update:model-value="set({ suitability: SUITABILITIES.find(suitability => suitability === $event) ?? null })"
          />
        </template>
        <FilterSelect
          capped
          :model-value="filters.tag ?? ''"
          :options="tagChoices"
          :empty-label="t('library.filterTag')"
          :aria-label="t('library.filterTag')"
          @update:model-value="set({ tag: $event || null })"
        />
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
        v-for="game in visible"
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

    <template v-if="state === 'results' && shown.length > PAGE_SIZE">
      <div
        v-if="remaining > 0"
        ref="sentinel"
        aria-hidden="true"
        class="h-px"
      />
      <p
        ref="status"
        role="status"
        tabindex="-1"
        class="m-0 text-center text-small text-ink-2"
      >
        {{ t('library.shownOf', { shown: visible.length, total: shown.length }) }}
      </p>
      <AppButton
        v-if="remaining > 0"
        variant="secondary"
        class="self-center"
        @click="onMore"
      >
        {{ t('library.loadMore') }}
      </AppButton>
    </template>
  </div>
</template>
