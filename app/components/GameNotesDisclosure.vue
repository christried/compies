<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

// The Game notes of a game (#224, GLOSSARY: Game notes) as a disclosure: collapsed by default, announced as open or
// closed, and the document formatted by RichNotes (#728). A document without a visible character shows no button; `notes` left at null (the slot's use) shows it. The panel is rendered only while it is open.
// Only the Host gets the notes of a pool game (#224); 0.7 reuses it for the Host on the Round card (#217), where it starts
// open (`startOpen`, #228): the notes are what the Host needs while the game is played. The Session rows reuse it for the Notes
// on a Slot's Votes (#349): the `label` names it with the count, and its default slot is the panel's content instead of the text.
// The Host's Event notes of the game (#732) come above the Game notes in the same panel: a game with only Event notes shows the disclosure too.
const props = withDefaults(defineProps<{ notes?: NotesDoc | null, eventNotes?: NotesDoc | null, label?: string, startOpen?: boolean }>(), { notes: null, eventNotes: null, label: undefined, startOpen: false })

const { t } = useI18n()
const panelId = useId()
const open = ref(props.startOpen)
const shown = computed(() => (props.notes === null && props.eventNotes === null) || notesHasText(props.notes) || notesHasText(props.eventNotes))
</script>

<template>
  <div
    v-if="shown"
    class="flex flex-col gap-2"
  >
    <button
      type="button"
      class="inline-flex h-11 items-center gap-1.5 self-start px-1 text-[13px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @click="open = !open"
    >
      {{ label ?? t('howWePlay.notes') }}
      <AppIcon
        :icon="ChevronDown"
        :size="14"
        :class="open && 'rotate-180'"
      />
    </button>
    <div
      v-if="open"
      :id="panelId"
      class="rounded-[12px] bg-paper-2 px-3.5 py-3"
    >
      <slot>
        <div class="flex flex-col gap-3">
          <EventNotes
            v-if="eventNotes"
            :notes="eventNotes"
          />
          <RichNotes
            v-if="notes && notesHasText(notes)"
            :doc="notes"
            class="text-[14px] leading-[1.45] text-ink"
          />
        </div>
      </slot>
    </div>
  </div>
</template>
