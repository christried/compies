<script setup lang="ts">
import type { DialogGame, HostGameFacts } from '~~/shared/game'

// A game as a tile with its dialog (#443): the tile (#435) is a button that opens the game dialog, and the dialog lives in its tile, so it goes with the
// tile when the tile leaves the page (a Round settled from another tab, a game that left the pool). A Member's tile stays plain until #444: its one edit is
// that `opens` becomes true for them too.
const props = defineProps<{
  game: DialogGame
  audience: 'host' | 'member'
  /** The Tags and Notes of the game from the Host's read; null for a Member and where the read has none. */
  facts?: HostGameFacts | null
}>()

const opens = computed(() => props.audience === 'host')
const dialogOpen = ref(false)
</script>

<template>
  <GameCard
    :game="game"
    layout="tile"
    :opens="opens"
    @open="dialogOpen = true"
  />
  <GameDialog
    v-if="opens"
    :open="dialogOpen"
    :game="game"
    :audience="audience"
    :facts="facts"
    @close="dialogOpen = false"
  />
</template>
