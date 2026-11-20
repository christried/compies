<script setup lang="ts">
import { Pencil } from '@lucide/vue'
import type { GameEvents } from '~~/shared/game-events'
import { formatMonthYear } from '~/utils/berlin-time'

// One game of the library (screen 23, `?s=detail`, #141, #142): the clip preview from the start second for the
// set length, the facts (player count, Suitabilities, clip length, the Price (#337)) and the Tags (#335, each in its colour, #427). The cover, the facts with the Tags and the Notes
// are components of their own (#443), which the Host's game dialog on the Event page uses too. „Bearbeiten“ is always there: the library
// holds only the viewer's own games (#724). A game that does not exist
// looks like any missing page; so does the page for Users who may not see the library. The switch „Archiviert“ (#467) is the owner's: the route answers
// only own games, and an Archived game keeps its page and stays editable. Below the Game notes the page lists the game's Events (#656) from a read of
// its own: a failing read shows a notice and never hides the game. A line under the switch says when the game last changed (#805).
const { t } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { viewer, game, status, error, refresh, missing } = useLibraryGame(id)
const { data: gameEvents, error: eventsError } = useFetch<GameEvents>(() => `/api/games/${id.value}/events`, {
  key: `game-events-${id.value}`,
  immediate: viewer.value,
})
useHead({ title: () => game.value?.name ?? t('nav.library') })

const { setArchived } = useGameArchive()
const updatedMonth = computed(() => (game.value ? formatMonthYear(new Date(game.value.updatedAt)) : ''))
</script>

<template>
  <AppShell
    v-if="!viewer || missing"
    kind="hub"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="hub"
  >
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-[14px]">
      <BackLink
        to="/bibliothek"
        :label="t('nav.library')"
      />

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
        v-else-if="game"
        class="grid grid-cols-1 items-start gap-[18px] md:grid-cols-2"
      >
        <ClipPreview
          v-if="game.youtubeId"
          :video-id="game.youtubeId"
          :start="game.clipStart"
          :length="game.clipLength"
        />
        <GameCover
          v-else
          :game="game"
        />

        <div class="flex min-w-0 flex-col gap-3">
          <!-- With a clip the player takes the big slot; the uploaded image (#143) is the game's cover beside it. -->
          <img
            v-if="game.imageUrl && game.youtubeId"
            :src="game.imageUrl"
            alt=""
            class="aspect-[16/10] w-40 rounded-[12px] border-(length:--cp-bw) border-line object-cover shadow-card"
          >
          <h1 class="m-0 font-display text-[32px] leading-none text-balance [overflow-wrap:anywhere] md:text-[44px]">
            {{ game.name }}
          </h1>
          <GameFacts
            :game="game"
            :tags="game.tags"
            :clip-length="game.youtubeId ? game.clipLength : null"
          />
          <ToggleSwitch
            :model-value="game.archived"
            :label="t('library.archiveSwitch')"
            :help="t('library.archiveHelp')"
            @update:model-value="setArchived(game.id, $event)"
          />
          <p class="m-0 text-[13px] text-ink-2">
            {{ t('library.updatedAt', { month: updatedMonth }) }}
          </p>
          <AppButton
            :to="`/bibliothek/${game.id}/bearbeiten`"
            variant="secondary"
            class="self-start"
          >
            <template #icon>
              <AppIcon
                :icon="Pencil"
                :size="16"
              />
            </template>
            {{ t('library.edit') }}
          </AppButton>
        </div>
      </div>

      <div
        v-else-if="status === 'pending'"
        aria-busy="true"
        :aria-label="t('library.loading')"
        class="grid grid-cols-1 gap-[18px] md:grid-cols-2"
      >
        <SkeletonCard />
      </div>

      <!-- Game notes (#223): the formatted document (#728), in the designed look (#729). -->
      <GameNotes
        v-if="game?.notes"
        :notes="game.notes"
      />

      <!-- The Events of this game (#656): shown once the game is, nothing while they load, a notice when their read fails (the game stays). -->
      <template v-if="game && !error">
        <NoticeBanner
          v-if="eventsError"
          tone="warning"
        >
          {{ t('gameEvents.failed') }}
        </NoticeBanner>
        <GameEventList
          v-else-if="gameEvents"
          :events="gameEvents.events"
        />
      </template>
    </div>
  </AppShell>
</template>
