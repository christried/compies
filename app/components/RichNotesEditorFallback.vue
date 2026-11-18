<script setup lang="ts">
// The field's chrome that holds the notes editor's place until its lazy chunk has mounted (#454, #464): label, an empty field box and the help line. It is what the
// server renders and what shows while the chunk loads, so it is busy and named for a screen reader (#822), not hidden. When the chunk fails to load it says so in
// the library's way (`GameBrowser`'s `listFailed`: a critical NoticeBanner with a secondary button) in place of the box, and `retry` asks the loader for the chunk again.
// It must not import the editor: the chunk stays lazy (nuxt.config.ts matches only the editor's own files). The Event variant's box is the toolbar's 52 px, the
// content's 96 px minimum and the two borders (18-notizen § NoteToolbar, § NoteEditor); the game's is the form's 190 px, 226 px from sm.
defineProps<{
  variant: 'game' | 'event'
  /** The chunk did not load: an error line and a retry instead of the empty box. */
  failed?: boolean
}>()

defineEmits<{ retry: [] }>()

const { t } = useI18n()
</script>

<template>
  <div
    class="flex flex-col gap-1.5"
    :aria-busy="failed ? undefined : 'true'"
  >
    <span class="min-h-[26px] text-[14px] leading-[26px] font-bold">{{ t(variant === 'event' ? 'notesEditor.eventLabel' : 'notesEditor.label') }}</span>
    <NoticeBanner
      v-if="failed"
      tone="critical"
    >
      {{ t('notesEditor.loadFailed') }}
      <template #action>
        <AppButton
          variant="secondary"
          @click="$emit('retry')"
        >
          {{ t('errorPage.generic.retry') }}
        </AppButton>
      </template>
    </NoticeBanner>
    <div
      v-else
      class="rounded-md border-(length:--cp-bw) border-line bg-surface"
      :class="variant === 'event' ? 'min-h-[150px]' : 'min-h-[190px] sm:min-h-[226px]'"
    >
      <span class="sr-only">{{ t('notesEditor.loading') }}</span>
    </div>
    <span class="text-[13px] leading-[1.35] font-medium text-ink-2">{{ t(variant === 'event' ? 'notesEditor.eventHelp' : 'notesEditor.help') }}</span>
  </div>
</template>
