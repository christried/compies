<script setup lang="ts">
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

// Game notes (#223, #443): the library entry's section and the game dialog's, the document formatted by RichNotes (#728). Notes without a visible
// character show no section. The heading level is the place's: the entry's page has an h1 above it (h2, so a heading in the notes is an h3), the
// dialog's title is an h2 (h3, a heading in the notes an h4).
withDefaults(defineProps<{
  notes: NotesDoc
  level?: 'h2' | 'h3'
}>(), { level: 'h2' })

const { t } = useI18n()
</script>

<template>
  <section
    v-if="notesHasText(notes)"
    class="flex flex-col gap-2"
  >
    <component
      :is="level"
      class="m-0 text-[16px] font-extrabold"
    >
      {{ t('library.notes') }}
    </component>
    <RichNotes
      :doc="notes"
      :heading-level="level === 'h2' ? 'h3' : 'h4'"
      class="text-[15px] leading-[1.5]"
    />
  </section>
</template>
