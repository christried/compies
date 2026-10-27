<script setup lang="ts">
import type { NoteRow } from '~/utils/notes'
import { VOTE_LOOK } from '~/utils/vote-look'

// The Notes on the Votes of one Slot (#102), in the order of „Wer kann wann?“: name (your own as „Name (du)“), a
// dot in the Vote's colour and the text. The Vote's label is there for screen readers, so the colour is not the
// only signal. Renders nothing without Notes.
defineProps<{ notes: NoteRow[] }>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="notes.length > 0"
    class="flex flex-col gap-1"
  >
    <b class="text-[12px]">{{ t('mvp.notes.heading') }}</b>
    <ul class="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
      <li
        v-for="row in notes"
        :key="row.userId"
        class="flex items-baseline gap-1.5"
      >
        <span
          class="size-2.5 flex-none translate-y-px rounded-full border-2 border-line"
          :class="VOTE_LOOK[row.value].fill"
          aria-hidden="true"
        />
        <span class="min-w-0 text-pretty break-words">
          <b>{{ row.isMe ? t('mvp.poll.you', { name: row.name }) : row.name }}</b>
          <span class="sr-only"> ({{ t(VOTE_LOOK[row.value].labelKey) }})</span>:
          {{ row.note }}
        </span>
      </li>
    </ul>
  </div>
</template>
