<script setup lang="ts">
import { Check } from '@lucide/vue'
import { NO_FILTERS, canSeeLibrary, type GameFilters, type PoolGame } from '~~/shared/game'

// The Host sets the next game (#228, 02-components § NextGamePicker, screen 15 „Admin-Wahl“): a sheet that lists the games
// still left in the Game pool first, then the library search the app already has (GameBrowser, the one search). The Host
// picks a game, then sets it from the bar at the bottom; the sheet closes once the server took it (the page's `pick` resolves
// to whether it did). A Host without the library permission sees the pool only. A game set from the pool leaves it, a game from the
// library never joins it (the server decides which; nothing here differs).
const props = defineProps<{
  open: boolean
  /** The games of the Game pool that are still left, whole (the Host's pool view). */
  pool: PoolGame[]
  /** True while the request runs. */
  busy: boolean
}>()

const emit = defineEmits<{ close: [], pick: [gameId: string] }>()

const { t } = useI18n()
const user = useAuthUser()
const library = computed(() => canSeeLibrary(user.value))
const filters = ref<GameFilters>({ ...NO_FILTERS })
const chosen = ref<{ id: string, name: string } | null>(null)

// A sheet that opens again starts with nothing picked.
watch(() => props.open, (open) => {
  if (open) {
    chosen.value = null
    filters.value = { ...NO_FILTERS }
  }
})

const isChosen = (id: string) => chosen.value?.id === id
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('nextGame.title')"
    @close="emit('close')"
  >
    <section class="flex flex-col gap-2">
      <h3 class="m-0 text-[15px] font-extrabold">
        {{ t('nextGame.poolCount', { n: pool.length }) }}
      </h3>
      <p
        v-if="pool.length === 0"
        class="m-0 text-[14px] text-ink-2"
      >
        {{ t('nextGame.poolEmpty') }}
      </p>
      <ul
        v-else
        :aria-label="t('nextGame.poolList')"
        class="m-0 flex list-none flex-col gap-2 p-0"
      >
        <li
          v-for="game in pool"
          :key="game.id"
          class="min-w-0"
        >
          <GameCard
            :game="game"
            layout="row"
          >
            <template #actions>
              <IconButton
                :icon="Check"
                :label="t(isChosen(game.id) ? 'nextGame.selected' : 'nextGame.select', { name: game.name })"
                :tone="isChosen(game.id) ? 'success' : undefined"
                :pressed="isChosen(game.id)"
                @click="chosen = { id: game.id, name: game.name }"
              />
            </template>
          </GameCard>
        </li>
      </ul>
    </section>

    <section
      v-if="library"
      class="flex flex-col gap-2"
    >
      <h3 class="m-0 text-[15px] font-extrabold">
        {{ t('nextGame.library') }}
      </h3>
      <GameBrowser
        v-model:filters="filters"
        compact
      >
        <template #card-actions="{ game }">
          <IconButton
            :icon="Check"
            :label="t(isChosen(game.id) ? 'nextGame.selected' : 'nextGame.select', { name: game.name })"
            :tone="isChosen(game.id) ? 'success' : undefined"
            :pressed="isChosen(game.id)"
            @click="chosen = { id: game.id, name: game.name }"
          />
        </template>
      </GameBrowser>
    </section>

    <template #footer>
      <div class="flex items-center gap-3">
        <p class="m-0 flex min-w-0 flex-1 flex-col leading-tight">
          <b class="truncate text-[15px]">{{ chosen?.name ?? t('nextGame.choose') }}</b>
          <span
            v-if="chosen"
            class="text-[12px] text-ink-2"
          >{{ t('nextGame.chosen') }}</span>
        </p>
        <AppButton
          :disabled="chosen === null || busy"
          @click="chosen && emit('pick', chosen.id)"
        >
          {{ t('nextGame.confirm') }}
        </AppButton>
      </div>
    </template>
  </AppSheet>
</template>
