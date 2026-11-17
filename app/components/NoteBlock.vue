<script setup lang="ts">
import { Lock } from '@lucide/vue'
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

// One note read-only with its header (#729, hand-off 18-notizen.md § NoteBlock): the disc, the title (13 / 800, a real heading), the optional sub under it, for
// a finished Event the lock chip, then the panel with the document (RichNotes, ADR 0019). An Event note is a framed `surface` panel (dashed when finished), a game
// note a `paper-2` one without a border, `bare` none (the Round card's own panel holds it). Used by EventNotes and by every place that shows a game note as a block
// (GameNotes in the dialog, the popover, the Round card). A document without a visible character shows nothing: there is no empty state in a read-only place.
// The notes' own headings sit one level below the title.
const props = withDefaults(defineProps<{
  kind: 'game' | 'event'
  doc: NotesDoc
  size: 'sm' | 'md'
  /** The line under the title: „aus deiner Bibliothek“ or the Event's name, only where both blocks show. */
  sub?: string
  /** The Event is finished (kind event): dashed frame, paper-2 disc, the chip. */
  finished?: boolean
  bare?: boolean
  /** The title's heading level; the notes' headings are the next one. */
  level?: 'h2' | 'h3'
}>(), { sub: undefined, finished: false, bare: false, level: 'h3' })

const { t } = useI18n()
const titleId = useId()
const frozen = computed(() => props.finished && props.kind === 'event')
const padding = computed(() => (props.size === 'sm' ? 'px-3 py-2.5' : 'px-3.5 py-3'))
</script>

<template>
  <section
    v-if="notesHasText(doc)"
    :aria-labelledby="titleId"
    class="flex min-w-0 flex-col gap-2"
  >
    <div class="flex min-h-7 items-center gap-2">
      <NoteDisc
        :kind="kind"
        :finished="frozen"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-px">
        <component
          :is="level"
          :id="titleId"
          class="m-0 font-sans text-[13px] leading-tight font-extrabold text-balance"
        >
          {{ kind === 'event' ? t('eventNotes.title') : t('library.notes') }}
        </component>
        <span
          v-if="sub"
          class="text-[12px] leading-tight font-semibold text-ink-2"
        >
          {{ sub }}
        </span>
      </div>
      <span
        v-if="frozen"
        class="inline-flex h-6 flex-none items-center gap-1 rounded-pill border-2 border-line bg-paper-2 px-2 text-[12px] font-bold"
      >
        <AppIcon
          :icon="Lock"
          :size="12"
        />
        {{ t('notes.finished.chip') }}
      </span>
    </div>
    <div
      class="min-w-0 rounded-[12px]"
      :class="bare ? '' : [padding, kind === 'event' ? ['bg-surface border-2', frozen ? 'border-dashed border-line' : 'border-solid border-line'] : 'bg-paper-2']"
    >
      <RichNotes
        :doc="doc"
        :size="size"
        :heading-level="level === 'h2' ? 'h3' : 'h4'"
      />
    </div>
  </section>
</template>
