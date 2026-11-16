<script setup lang="ts">
import { notesPlainText, type NotesDoc } from '~~/shared/notes-doc'

// Game notes (#223, #443): the library entry's section and the game dialog's. The document as plain text with the line breaks the Host wrote (#727);
// `{{ }}` only, so no formatting and no links, until the renderer (#728). The heading level is the place's: the entry's page has an h1 above it (h2), the dialog's title is an h2 (h3).
const props = withDefaults(defineProps<{
  notes: NotesDoc
  level?: 'h2' | 'h3'
}>(), { level: 'h2' })

const { t } = useI18n()
const text = computed(() => notesPlainText(props.notes))
</script>

<template>
  <section class="flex flex-col gap-2">
    <component
      :is="level"
      class="m-0 text-[16px] font-extrabold"
    >
      {{ t('library.notes') }}
    </component>
    <p class="m-0 text-[15px] leading-[1.5] whitespace-pre-wrap [overflow-wrap:anywhere]">
      {{ text }}
    </p>
  </section>
</template>
