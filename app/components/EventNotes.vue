<script setup lang="ts">
import type { NotesDoc } from '~~/shared/notes-doc'

// The Event notes of a game (#732, GLOSSARY: Event notes) as the Host reads them: in the open Round's „Notizen“ disclosure, in the game
// dialog and in the notes popover and sheet of „Nächstes Spiel setzen“. The block is NoteBlock's (#729): the Event disc, the title „Notizen für dieses
// Event“ an h3 everywhere (the popover, the sheet and the dialog have an h2), a heading in the notes an h4. `sub` is the Event's name and
// is given only where the game block shows beside it; `finished` marks the Event as over (dashed frame, chip). A document without a visible character shows nothing.
withDefaults(defineProps<{
  notes: NotesDoc
  size?: 'sm' | 'md'
  sub?: string
  finished?: boolean
}>(), { size: 'md', sub: undefined, finished: false })
</script>

<template>
  <NoteBlock
    kind="event"
    :doc="notes"
    :size="size"
    :sub="sub"
    :finished="finished"
  />
</template>
