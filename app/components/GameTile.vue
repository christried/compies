<script setup lang="ts">
import type { HostGameFacts, PoolGameFace } from '~~/shared/game'
import type { NotesDoc } from '~~/shared/notes-doc'

// A game as a tile with its dialog (#443, #444): the tile (#435) is a button that opens the game dialog, for every Member, and the dialog lives in its tile, so it goes
// with the tile when the tile leaves the page (a Round settled from another tab, a game that left the pool). `audience` only decides what the dialog shows: the Host's
// has the Tags, the Notes and the library link, a Member's never has them.
defineProps<{
  game: PoolGameFace
  audience: 'host' | 'member'
  /** The Tags and Notes of the game from the Host's read; null for a Member and where the read has none. */
  facts?: HostGameFacts | null
  /** The Host's Event notes of this game (#732), from `eventNotes` of the Event read; null for a Member and where the game has none. */
  eventNotes?: NotesDoc | null
  /** The Host's pool game is Archived (#726): the tile carries the „Archiviert“ pill. */
  archived?: boolean
  /** The Event's name and whether it is finished (#729), for the dialog's Event notes block; where the page does not hold them the block keeps no sub and no chip. */
  eventName?: string
  eventFinished?: boolean
  /** Saves the Host's Event notes of this game from its dialog (#464); resolves to whether the server took it. The dialog's own guard decides who may use it. */
  saveEventNotes?: ((gameId: string, notes: NotesDoc | null) => Promise<boolean>) | null
}>()

const dialogOpen = ref(false)
</script>

<template>
  <GameCard
    :game="game"
    layout="tile"
    :archived="archived"
    opens
    @open="dialogOpen = true"
  />
  <GameDialog
    :open="dialogOpen"
    :game="game"
    :audience="audience"
    :facts="facts"
    :event-notes="eventNotes"
    :event-name="eventName"
    :event-finished="eventFinished"
    :save-event-notes="saveEventNotes"
    @close="dialogOpen = false"
  />
</template>
