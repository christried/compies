<script setup lang="ts">
import { Check, Plus } from '@lucide/vue'
import type { GameView } from '~~/shared/game'

// The library as a picker for a pool (#146, 02-components § GameCard): search by name, a card per game with a
// toggle button named after the game. It only reports the click (`toggle`); the pool is the parent's. The
// library comes from `useGameLibrary` (the same list the library page shows); the page that hosts the
// picker holds it too, so it stays across steps. The `actions`
// slot sits next to the search, for „Neues Spiel anlegen“. #147 reuses it for the Event editor.
defineProps<{
  /** Ids of the games that are in the pool. */
  selected: string[]
}>()

const emit = defineEmits<{ toggle: [game: GameView] }>()

const { t } = useI18n()
const { data, status, error, refresh } = useGameLibrary()

const search = ref('')
const games = computed(() => {
  const text = search.value.trim().toLocaleLowerCase('de')
  const all = data.value?.games ?? []
  return text ? all.filter(game => game.name.toLocaleLowerCase('de').includes(text)) : all
})
const pending = computed(() => status.value === 'pending' && !data.value)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-end gap-2.5">
      <TextField
        v-if="data && data.games.length > 0"
        v-model="search"
        type="search"
        :label="t('stepper.pool.search')"
        class="min-w-[220px] flex-1"
      />
      <slot name="actions" />
    </div>

    <NoticeBanner
      v-if="error"
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
      v-else-if="pending"
      aria-busy="true"
      :aria-label="t('library.loading')"
      class="grid grid-cols-2 gap-2.5 md:grid-cols-4"
    >
      <SkeletonCard
        v-for="n in 4"
        :key="n"
      />
    </div>

    <p
      v-else-if="data && data.games.length === 0"
      class="m-0 text-[15px] text-ink-2"
    >
      {{ t('stepper.pool.libraryEmpty') }}
    </p>

    <p
      v-else-if="games.length === 0"
      class="m-0 text-[15px] text-ink-2"
    >
      {{ t('stepper.pool.noMatch', { q: search.trim() }) }}
    </p>

    <ul
      v-else
      :aria-label="t('stepper.pool.library')"
      class="m-0 grid list-none grid-cols-2 gap-2.5 p-0 md:grid-cols-4"
    >
      <li
        v-for="game in games"
        :key="game.id"
        class="min-w-0"
      >
        <GameCard
          :game="game"
          class="h-full"
        >
          <template #actions>
            <IconButton
              :icon="selected.includes(game.id) ? Check : Plus"
              :label="t(selected.includes(game.id) ? 'stepper.pool.remove' : 'stepper.pool.add', { name: game.name })"
              :pressed="selected.includes(game.id)"
              :tone="selected.includes(game.id) ? 'success' : undefined"
              @click="emit('toggle', game)"
            />
          </template>
        </GameCard>
      </li>
    </ul>
  </div>
</template>
