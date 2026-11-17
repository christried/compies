<script setup lang="ts">
// The field's chrome that holds the notes editor's place until its lazy chunk has mounted (#454, #464): label, an empty field box and the help line. The
// editor is client only (`ClientOnly`), so this is what the server renders and what shows while the chunk loads. It must not import the editor: the chunk
// stays lazy (nuxt.config.ts matches only the editor's own files). The Event variant's box is the toolbar's 52 px, the content's 96 px minimum and the
// two borders (18-notizen § NoteToolbar, § NoteEditor); the game's is the form's 190 px, 226 px from sm.
defineProps<{
  variant: 'game' | 'event'
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="flex flex-col gap-1.5"
    aria-hidden="true"
  >
    <span class="min-h-[26px] text-[14px] leading-[26px] font-bold">{{ t(variant === 'event' ? 'notesEditor.eventLabel' : 'notesEditor.label') }}</span>
    <div
      class="rounded-md border-(length:--cp-bw) border-line bg-surface"
      :class="variant === 'event' ? 'min-h-[150px]' : 'min-h-[190px] sm:min-h-[226px]'"
    />
    <span class="text-[13px] leading-[1.35] font-medium text-ink-2">{{ t(variant === 'event' ? 'notesEditor.eventHelp' : 'notesEditor.help') }}</span>
  </div>
</template>
