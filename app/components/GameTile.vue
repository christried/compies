<script setup lang="ts">
import type { HostGameFacts, PoolGameFace } from '~~/shared/game'

// A game as a tile with its dialog (#443, #444): the tile (#435) is a button that opens the game dialog, for every Member, and the dialog lives in its tile, so it goes
// with the tile when the tile leaves the page (a Round settled from another tab, a game that left the pool). `audience` only decides what the dialog shows: the Host's
// has the Tags, the Notes and the library link, a Member's never has them.
// With `notesButton` (#858: the Spielepool's tiles and the wheel's result card, not the Round card's) the Host's tile carries the Notes button, and its footer „Bearbeiten“ asks this tile for its dialog in
// the edit mode (the Event field, with the dialog's own fallback). The Game notes are the dialog's own source (`facts`) and the Event notes the page's context's. A Member's tile is handed neither here, whatever it gets: the guard is the tile's own, as the dialog's is.
const props = withDefaults(defineProps<{
  game: PoolGameFace
  audience: 'host' | 'member'
  /** The Tags and Notes of the game from the Host's read; null for a Member and where the read has none. */
  facts?: HostGameFacts | null
  /** The Host's pool game is Archived (#726): the tile carries the „Archiviert“ pill. */
  archived?: boolean
  /** The tile carries the Notes button for the Host (#858). Off by default, so a new call site never gains it by accident; the Round card's tile stays without (its „Notizen“ sit under it). */
  notesButton?: boolean
}>(), { facts: null, archived: false, notesButton: false })

const { notesOf, save } = useEventNotes()
const isHost = computed(() => props.audience === 'host')
const notes = computed(() => (props.notesButton && isHost.value ? props.facts?.notes ?? null : null))
const eventNotes = computed(() => (props.notesButton && isHost.value ? notesOf(props.game.id) : null))
// The entry stays in a finished Event (#858, story 35): it is the save's presence that decides, not the Event's phase. What the dialog then lets the Host edit is its own guard (#857).
const notesEditable = computed(() => props.notesButton && isHost.value && save.value != null)

const dialogOpen = ref(false)
// The field the dialog opens into (#835): the Notes button's „Bearbeiten“ asks for the Event field, a tap on the name for the view mode. Set before `dialogOpen`, which the dialog reads.
const editField = ref<'event' | 'game' | null>(null)

function openDialog() {
  editField.value = null
  dialogOpen.value = true
}

function openEditor() {
  editField.value = 'event'
  dialogOpen.value = true
}

// The Round card's „Bearbeiten“ (#836) opens this tile's dialog in the edit mode from outside: the Round card holds the tile's notes, not the tile.
defineExpose({ openEditor })
</script>

<template>
  <GameCard
    :game="game"
    layout="tile"
    :archived="archived"
    :notes="notes"
    :event-notes="eventNotes"
    :notes-editable="notesEditable"
    opens
    @open="openDialog"
    @edit-notes="openEditor"
  />
  <GameDialog
    :open="dialogOpen"
    :game="game"
    :audience="audience"
    :facts="facts"
    :edit="editField"
    @close="dialogOpen = false"
  />
</template>
