<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { canSeeLibrary, type GameList } from '~~/shared/game'

// The Game library (screen 23, `?s=lib`, #141): every game, as cards from md up and as rows below. Only Users with
// the Host permission and the Platform admin see it; for everyone else the page looks like any missing one.
// Loading shows skeleton cards on a busy grid; an empty library offers the first game.
const { t } = useI18n()
useHead({ title: () => t('nav.library') })
const user = useAuthUser()
const viewer = computed(() => canSeeLibrary(user.value))

const { data, status, error, refresh } = useFetch<GameList>('/api/games', { key: 'games', immediate: viewer.value })
const pending = computed(() => status.value === 'pending')
const games = computed(() => data.value?.games ?? [])

// Cards need room; below md the list is rows. Starts wide, so the server and the first client render agree.
const wide = ref(true)
onMounted(() => {
  const query = window.matchMedia?.('(min-width: 48rem)')
  if (!query) return
  wide.value = query.matches
  const update = (change: MediaQueryListEvent) => (wide.value = change.matches)
  query.addEventListener('change', update)
  onBeforeUnmount(() => query.removeEventListener('change', update))
})

const GRID = 'grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))'
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
        v-else-if="data && games.length === 0"
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
