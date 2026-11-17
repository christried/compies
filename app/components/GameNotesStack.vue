<script setup lang="ts">
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

// The notes of a game as the picker's popover and sheet show them (#729, hand-off 18-notizen.md § GameCard): the Event block first, the game below it. With both, each
// block has its header and its sub (the Event's name, „aus deiner Bibliothek“); a block alone is its text (the Event's still framed with its title, the Game notes
// bare: the popover's „Notizen“ and the sheet's game name already say what they are). The notes' headings are one level below the popover's h2, so an h3 (an h4
// under the Event block's h3 title).
const props = withDefaults(defineProps<{
  notes: NotesDoc | null
  eventNotes?: NotesDoc | null
  size: 'sm' | 'md'
  /** The Event's name, the Event block's sub where both blocks show; the page that holds it gives it. */
  eventName?: string
  eventFinished?: boolean
}>(), { eventNotes: null, eventName: undefined, eventFinished: false })

const { t } = useI18n()
const doc = computed(() => notesHasText(props.notes) ? props.notes : null)
const eventDoc = computed(() => notesHasText(props.eventNotes) ? props.eventNotes : null)
const both = computed(() => doc.value !== null && eventDoc.value !== null)
</script>

<template>
  <div
    class="flex min-w-0 flex-col"
    :class="size === 'sm' ? 'gap-4' : 'gap-5'"
  >
    <EventNotes
      v-if="eventDoc"
      :notes="eventDoc"
      :size="size"
      :sub="both ? eventName : undefined"
      :finished="eventFinished"
    />
    <NoteBlock
      v-if="doc && both"
      kind="game"
      :doc="doc"
      :size="size"
      :sub="t('notes.from_library')"
    />
    <RichNotes
      v-else-if="doc"
      :doc="doc"
      :size="size"
    />
  </div>
</template>
