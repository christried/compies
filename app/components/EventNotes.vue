<script setup lang="ts">
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

// The Event notes of a game (#732, GLOSSARY: Event notes) as the Host reads them: in the open Round's „Notizen“ disclosure, in the game
// dialog and in the notes popover and sheet of „Nächstes Spiel setzen“. Own build beside GameNotes: those places hold a 14 px panel, and a
// popover and a sheet whose titles are h2, so the label is an h3 everywhere and a heading in the notes an h4. A document without a visible
// character shows nothing; the document is rendered only through RichNotes (ADR 0019).
defineProps<{ notes: NotesDoc }>()

const { t } = useI18n()
</script>

<template>
  <section
    v-if="notesHasText(notes)"
    class="flex flex-col gap-1.5"
  >
    <h3 class="m-0 text-[13px] font-extrabold">
      {{ t('eventNotes.title') }}
    </h3>
    <RichNotes
      :doc="notes"
      heading-level="h4"
      class="text-[14px] leading-[1.45] text-ink"
    />
  </section>
</template>
