<script setup lang="ts">
import { Calendar, StickyNote } from '@lucide/vue'

// The disc before a note's label (#729, hand-off 18-notizen.md § NoteEditor, § NoteBlock): 26 px, 2 px `line` border. The game's note is a `surface` disc with a
// sticky note, the Event's a `primary` one with a calendar; a finished Event's note is `paper-2` in the muted ink (it reads, no more). Decorative: the
// label next to it carries the meaning. The read-only blocks (EventNotes, GameNotes) and #454's editor label row use it.
withDefaults(defineProps<{
  kind: 'game' | 'event'
  finished?: boolean
}>(), { finished: false })
</script>

<template>
  <span
    class="grid size-[26px] flex-none place-items-center rounded-pill border-2 border-line"
    :class="finished ? 'bg-paper-2 text-ink-2' : kind === 'event' ? 'bg-primary text-on-primary' : 'bg-surface text-ink'"
    aria-hidden="true"
  >
    <AppIcon
      :icon="kind === 'event' ? Calendar : StickyNote"
      :size="14"
    />
  </span>
</template>
