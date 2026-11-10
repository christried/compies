<script setup lang="ts">
import type { HostGameFacts, PoolGameFace } from '~~/shared/game'

// A game as a tile with its dialog (#443, #444): the tile (#435) is a button that opens the game dialog, for every Member, and the dialog lives in its tile, so it goes
// with the tile when the tile leaves the page (a Round settled from another tab, a game that left the pool). `audience` only decides what the dialog shows: the Host's
// has the Tags, the Notes and the library link, a Member's never has them.
defineProps<{
  game: PoolGameFace
  audience: 'host' | 'member'
  /** The Tags and Notes of the game from the Host's read; null for a Member and where the read has none. */
  facts?: HostGameFacts | null
}>()

const dialogOpen = ref(false)
</script>

<template>
  <GameCard
    :game="game"
    layout="tile"
    opens
    @open="dialogOpen = true"
  />
  <GameDialog
    :open="dialogOpen"
    :game="game"
    :audience="audience"
    :facts="facts"
    @close="dialogOpen = false"
  />
</template>
