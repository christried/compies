<script setup lang="ts">
import type { NotesDoc } from '~~/shared/notes-doc'

// The notes of a game as one pair (#729, hand-off 18-notizen.md § GameCard; #821, review 0.16 S5): the Event block first, the game below it. With both, each
// block has its header and its sub (the Event's name, „aus deiner Bibliothek“, from useNotePair); a block alone is its text (the Event's still framed with its title, the
// Game notes bare: the popover's „Notizen“ and the sheet's game name already say what they are). The notes' headings are one level below the popover's h2, so an h3 (an h4
// under the Event block's h3 title). `bare` is the Round card's look instead (a paper-2 panel of its own holds the pair): the Game notes keep their header
// without a panel of their own, a rule between the blocks, and the pair is the panel's content.
const props = withDefaults(defineProps<{
  notes: NotesDoc | null
  eventNotes?: NotesDoc | null
  size: 'sm' | 'md'
  bare?: boolean
}>(), { eventNotes: null, bare: false })

const { doc, eventDoc, both, eventSub, gameSub, finished } = useNotePair(() => props.notes, () => props.eventNotes)
</script>

<template>
  <div
    class="flex min-w-0 flex-col"
    :class="bare ? 'gap-3.5' : size === 'sm' ? 'gap-4' : 'gap-5'"
  >
    <EventNotes
      v-if="eventDoc"
      :notes="eventDoc"
      :size="size"
      :sub="eventSub"
      :finished="finished"
    />
    <div
      v-if="bare && both"
      data-notes-rule
      class="h-0.5 flex-none rounded-[1px] bg-line-soft"
      aria-hidden="true"
    />
    <NoteBlock
      v-if="doc && (both || bare)"
      kind="game"
      :doc="doc"
      :size="size"
      :sub="gameSub"
      :bare="bare"
    />
    <RichNotes
      v-else-if="doc"
      :doc="doc"
      :size="size"
    />
  </div>
</template>
