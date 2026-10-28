<script setup lang="ts">
import { EyeOff } from '@lucide/vue'
import type { EventPools } from '~~/shared/event'
import type { EventSettings } from '~~/shared/settings'

// „So wird gespielt“ on the Event page (#148): the Fertig summary of the Event's settings for every Member, and
// the pools below it. `pools` is what the server decided this viewer may see (poolsVisibleTo): the games, or under
// a Hidden wheel only how many. This component shows what it is given and never asks for more. The Host gets the
// games under a Hidden wheel too, with a note that nobody else sees them.
const props = defineProps<{
  settings: EventSettings | null
  pools: EventPools
  isHost: boolean
}>()

const { t } = useI18n()

const counts = computed(() => (props.pools.hidden
  ? { main: props.pools.mainCount, tiebreaker: props.pools.tiebreakerCount }
  : { main: props.pools.main.length, tiebreaker: props.pools.tiebreaker.length }))

/** „2 Spiele im Spielepool, 1 im Tiebreaker-Pool. …“: the plural follows the Game pool; the Tiebreaker pool is a bare number. */
const hiddenText = computed(() => t('howWePlay.counts', counts.value, counts.value.main))

const lists = computed(() => (props.pools.hidden
  ? []
  : [
      { key: 'main', title: t('howWePlay.mainPool'), games: props.pools.main },
      { key: 'tiebreaker', title: t('howWePlay.tiebreakerPool'), games: props.pools.tiebreaker },
    ]))
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-[20px] border-(length:--cp-bw) border-line bg-surface p-5.5 text-ink shadow-card md:p-[22px]"
    aria-labelledby="how-we-play-title"
  >
    <h2
      id="how-we-play-title"
      class="m-0 font-display text-[26px] leading-none font-normal md:text-[32px]"
    >
      {{ t('howWePlay.title') }}
    </h2>

    <p
      v-if="settings === null"
      class="m-0 text-ink-2"
    >
      {{ t('howWePlay.notSetUp') }}
    </p>

    <template v-else>
      <EventSettingsSummary
        :settings="settings"
        :pools="counts"
        sentence
      />

      <p
        v-if="pools.hidden"
        class="m-0 text-ink-2"
      >
        {{ hiddenText }}
      </p>

      <template v-else>
        <p
          v-if="isHost && settings.hiddenWheel"
          class="m-0 inline-flex items-center gap-2 text-[14px] font-semibold text-ink-2"
        >
          <AppIcon
            :icon="EyeOff"
            :size="18"
          />
          {{ t('howWePlay.hostOnly') }}
        </p>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            v-for="list in lists"
            :key="list.key"
            class="flex min-w-0 flex-col gap-2"
          >
            <h3 class="m-0 text-[14px] font-extrabold text-ink-2">
              {{ list.title }}
            </h3>
            <ul
              v-if="list.games.length > 0"
              class="m-0 flex list-none flex-col gap-2 p-0"
            >
              <li
                v-for="game in list.games"
                :key="game.id"
              >
                <GameCard
                  :game="game"
                  layout="row"
                />
              </li>
            </ul>
            <p
              v-else
              class="m-0 text-ink-2"
            >
              {{ t('howWePlay.emptyPool') }}
            </p>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>
