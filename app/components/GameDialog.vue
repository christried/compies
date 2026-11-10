<script setup lang="ts">
import { canSeeLibrary, type DialogGame, type HostGameFacts } from '~~/shared/game'

// The game dialog (#443, 02-components § GameCard, deviation 0.12): a game tile's details in the sheet shell (a sheet below md, a dialog from md up), read-only,
// built from the library entry's parts (GameCover, GameFacts, GameNotes). It plays no Clip. The Host's audience has the picture, the facts (players, Suitabilities, Price
// with the day it was checked), every Tag, the Notes and „In der Bibliothek öffnen“ (for a viewer who may see the library: a Host whose permission was withdrawn would
// meet a construction page). A Member's audience (#444) has the picture, the facts and the Price, and never Tags, Notes or the link, whatever `facts` it is
// handed: the guard is this component's, not the caller's.
const props = withDefaults(defineProps<{
  open: boolean
  game: DialogGame
  audience: 'host' | 'member'
  /** The Tags and Notes of the game, from the Host's read (`hostGames`); null where the read has none. */
  facts?: HostGameFacts | null
}>(), { facts: null })

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const user = useAuthUser()
const isHost = computed(() => props.audience === 'host')
const tags = computed(() => (isHost.value ? props.facts?.tags ?? [] : []))
const notes = computed(() => (isHost.value ? props.facts?.notes ?? null : null))
const library = computed(() => isHost.value && canSeeLibrary(user.value))

// A game that came as its face only (a Member's pool game) has no player count and no Suitabilities: the facts show neither.
const facts = computed(() => ({
  playersMin: props.game.playersMin ?? null,
  playersMax: props.game.playersMax ?? null,
  suitabilities: props.game.suitabilities ?? [],
  price: props.game.price,
}))
</script>

<template>
  <AppSheet
    :open="open"
    :title="game.name"
    @close="emit('close')"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <GameCover :game="game" />
      <GameFacts
        :game="facts"
        :tags="tags"
      />
      <GameNotes
        v-if="notes"
        :notes="notes"
        level="h3"
      />
    </div>
    <template
      v-if="library"
      #footer
    >
      <AppButton
        :to="`/bibliothek/${game.id}`"
        variant="secondary"
      >
        {{ t('gameDialog.openLibrary') }}
      </AppButton>
    </template>
  </AppSheet>
</template>
