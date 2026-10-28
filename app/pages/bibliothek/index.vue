<script setup lang="ts">
import { Plus, Search } from '@lucide/vue'
import { canSeeLibrary, SUITABILITIES, type GameList } from '~~/shared/game'

// The Game library (screen 23, `?s=lib`, #141, #142): every game, as cards from md up and as rows below. Only Users
// with the Host permission and the Platform admin see it; for everyone else the page looks like any missing one.
// Loading shows skeleton cards on a busy grid; an empty library offers the first game. The search and the three
// filters (player count, Passt zu, „Von mir“) live in the address, so reload and back keep them; a search that
// matches nothing says so with „Keine Treffer“.
const { t } = useI18n()
useHead({ title: () => t('nav.library') })
const user = useAuthUser()
const viewer = computed(() => canSeeLibrary(user.value))
const route = useRoute()
const router = useRouter()

const PLAYER_CHOICES = Array.from({ length: 24 }, (_, index) => index + 1)

function param(name: string): string {
  const value = route.query[name]
  return typeof value === 'string' ? value : ''
}

const filters = computed(() => ({
  q: param('q').trim(),
  players: param('players'),
  suitability: param('suitability'),
  mine: param('mine') === '1',
}))
const anyFilter = computed(() => Boolean(filters.value.q || filters.value.players || filters.value.suitability || filters.value.mine))

const query = computed(() => {
  const { q, players, suitability, mine } = filters.value
  return {
    ...(q ? { q } : {}),
    ...(players ? { players } : {}),
    ...(suitability ? { suitability } : {}),
    ...(mine ? { mine: '1' } : {}),
  }
})

const { data, status, error, refresh } = useFetch<GameList>('/api/games', {
  key: 'games',
  query,
  immediate: viewer.value,
})
const pending = computed(() => status.value === 'pending')
const games = computed(() => data.value?.games ?? [])

// The filters write the address; the search waits for a short pause in typing before it does.
function setFilters(changes: Record<string, string | undefined>, mode: 'push' | 'replace' = 'push') {
  const next = { query: { ...route.query, ...changes } }
  if (mode === 'replace') router.replace(next)
  else router.push(next)
}

const searchText = ref(filters.value.q)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchText, (text) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setFilters({ q: text.trim() || undefined }, 'replace'), 250)
})
onBeforeUnmount(() => clearTimeout(searchTimer))
// Back and forward change the address, so the field follows it.
watch(() => filters.value.q, (q) => {
  if (q !== searchText.value.trim()) searchText.value = q
})

function onPlayers(event: Event) {
  setFilters({ players: (event.target as HTMLSelectElement).value || undefined })
}
function onSuitability(event: Event) {
  setFilters({ suitability: (event.target as HTMLSelectElement).value || undefined })
}
function showAll() {
  searchText.value = ''
  setFilters({ q: undefined, players: undefined, suitability: undefined, mine: undefined })
}

// Cards need room; below md the list is rows. Starts wide, so the server and the first client render agree.
const wide = ref(true)
onMounted(() => {
  const media = window.matchMedia?.('(min-width: 48rem)')
  if (!media) return
  wide.value = media.matches
  const update = (change: MediaQueryListEvent) => (wide.value = change.matches)
  media.addEventListener('change', update)
  onBeforeUnmount(() => media.removeEventListener('change', update))
})

const GRID = 'grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))'
const CHIP = 'inline-flex h-11 items-center gap-1.5 rounded-pill border-(length:--cp-bw) px-4 text-small font-bold transition-colors'
const CHIP_OFF = 'border-line bg-surface text-ink hover:bg-paper-2'
const CHIP_ON = 'border-line bg-ink text-paper'
</script>

<template>
  <AppShell
    v-if="!viewer"
    kind="hub"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="hub"
  >
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-4">
      <header class="flex flex-wrap items-end gap-3">
        <div class="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span class="text-small font-bold text-ink-2">{{ t('library.kicker') }}</span>
          <h1 class="m-0 font-display text-[32px] leading-none md:text-[44px]">
            {{ t('library.title') }}
          </h1>
        </div>
        <AppButton
          to="/bibliothek/neu"
          size="lg"
        >
          <template #icon>
            <AppIcon :icon="Plus" />
          </template>
          {{ t('library.create') }}
        </AppButton>
      </header>

      <div class="flex flex-wrap items-center gap-2.5">
        <div class="relative flex min-w-[240px] flex-1 items-center">
          <AppIcon
            :icon="Search"
            :size="18"
            class="pointer-events-none absolute left-3.5 text-ink-2"
          />
          <input
            v-model="searchText"
            type="search"
            :aria-label="t('library.search')"
            :placeholder="data ? t('library.searchPlaceholder', { n: data.total }) : t('library.search')"
            class="h-[46px] w-full rounded-[12px] border-(length:--cp-bw) border-line bg-surface py-0 pr-3.5 pl-[42px] text-[17px] text-ink"
          >
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :aria-pressed="anyFilter ? 'false' : 'true'"
            :class="[CHIP, anyFilter ? CHIP_OFF : CHIP_ON]"
            @click="showAll"
          >
            {{ t('library.all') }}
          </button>
          <select
            :value="filters.players"
            :aria-label="t('library.filterPlayers')"
            :class="[CHIP, filters.players ? CHIP_ON : CHIP_OFF]"
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
            :value="filters.suitability"
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
          <button
            type="button"
            :aria-pressed="filters.mine ? 'true' : 'false'"
            :class="[CHIP, filters.mine ? CHIP_ON : CHIP_OFF]"
            @click="setFilters({ mine: filters.mine ? undefined : '1' })"
          >
            {{ t('library.filterMine') }}
          </button>
        </div>
      </div>

      <FullScreenState
        v-if="error"
        kind="generic"
      >
        <template #actions>
          <AppButton
            size="lg"
            @click="refresh()"
          >
            {{ t('errorPage.generic.retry') }}
          </AppButton>
        </template>
      </FullScreenState>

      <div
        v-else-if="pending && !data"
        aria-busy="true"
        :aria-label="t('library.loading')"
        class="grid gap-3"
        :style="GRID"
      >
        <SkeletonCard
          v-for="n in 8"
          :key="n"
        />
      </div>

      <EmptyState
        v-else-if="data && data.total === 0"
        :title="t('empty.library.title')"
        :text="t('empty.library.text')"
      >
        <template #action>
          <AppButton
            to="/bibliothek/neu"
            size="lg"
          >
            <template #icon>
              <AppIcon :icon="Plus" />
            </template>
            {{ t('library.create') }}
          </AppButton>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="data && games.length === 0"
        :title="filters.q ? t('library.noMatch', { q: filters.q }) : t('empty.search.title')"
        :text="t('empty.search.text')"
      >
        <template #action>
          <AppButton
            to="/bibliothek/neu"
            size="lg"
          >
            <template #icon>
              <AppIcon :icon="Plus" />
            </template>
            {{ t('library.create') }}
          </AppButton>
        </template>
      </EmptyState>

      <ul
        v-else-if="data"
        class="m-0 list-none p-0"
        :class="wide ? 'grid gap-3' : 'flex flex-col gap-2'"
        :style="wide ? GRID : undefined"
      >
        <li
          v-for="game in games"
          :key="game.id"
          class="min-w-0"
        >
          <GameCard
            :game="game"
            :layout="wide ? 'card' : 'row'"
            :to="`/bibliothek/${game.id}`"
            class="h-full"
          />
        </li>
      </ul>
    </div>
  </AppShell>
</template>
