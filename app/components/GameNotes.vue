<script setup lang="ts">
import { Lock } from '@lucide/vue'
import { MD_QUERY } from '~/composables/useMediaQuery'
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

// Game notes (#223, #443): the library entry's section and the game dialog's, the document formatted by RichNotes (#728), the look the hand-off's (#729). Notes
// without a visible character show nothing. The heading level is the place's: the entry's page has an h1 above it (h2, a section of its own: the title in Lilita
// 26, the „Nur du siehst das“ line, a paper-2 panel, the notes at lg from 980 and at md below, so a heading in them is an h3); the dialog's title is an h2 (h3, the
// game block of the dialog at md, a heading in the notes an h4). `sub` is the dialog's „aus deiner Bibliothek“, given only where the Event block shows above.
const props = withDefaults(defineProps<{
  notes: NotesDoc
  level?: 'h2' | 'h3'
  sub?: string
}>(), { level: 'h2', sub: undefined })

const { t } = useI18n()
const wide = useMediaQuery(MD_QUERY)
const headingId = useId()
const shown = computed(() => notesHasText(props.notes))
</script>

<template>
  <section
    v-if="shown && level === 'h2'"
    :aria-labelledby="headingId"
    class="flex flex-col gap-2"
  >
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2
        :id="headingId"
        class="m-0 font-display text-[26px] leading-tight font-normal"
      >
        {{ t('library.notes') }}
      </h2>
      <span class="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2">
        <AppIcon
          :icon="Lock"
          :size="12"
        />
        {{ t('common.hostOnly') }}
      </span>
    </div>
    <div class="rounded-[12px] bg-paper-2 px-[18px] py-4">
      <RichNotes
        :doc="notes"
        :size="wide ? 'lg' : 'md'"
        heading-level="h3"
      />
    </div>
  </section>
  <NoteBlock
    v-else-if="shown"
    kind="game"
    :doc="notes"
    size="md"
    :sub="sub"
    :level="level"
  />
</template>
