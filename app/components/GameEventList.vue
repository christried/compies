<script setup lang="ts">
import type { GameEventRow } from '~~/shared/game-events'
import { eventPath } from '~~/shared/links'
import { notesHasText } from '~~/shared/notes-doc'

// The Events of a game on its library page (#656, spec #717 § F): every Event of the game's User that holds the game in its pool or played it,
// newest first, as the server sends them. A row links to the Event, says „im Pool“ or „n× gespielt“ and shows the Host's Event notes for the game
// read-only in a disclosure (RichNotes only, ADR 0019): its headings are h3, below this section's h2.
defineProps<{ events: GameEventRow[] }>()

const { t } = useI18n()
const headingId = useId()
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex flex-col gap-2"
  >
    <h2
      :id="headingId"
      class="m-0 text-[16px] font-extrabold"
    >
      {{ t('gameEvents.title') }}
    </h2>

    <p
      v-if="events.length === 0"
      class="m-0 rounded-[12px] border-2 border-dashed border-line-soft px-3.5 py-3 text-[14px] font-semibold text-pretty text-ink-2"
    >
      {{ t('gameEvents.none') }}
    </p>
    <ul
      v-else
      class="m-0 flex list-none flex-col gap-2 p-0"
    >
      <li
        v-for="row in events"
        :key="row.slug"
        class="rounded-[12px] border-(length:--cp-bw) border-line bg-surface px-3.5 py-2 text-ink"
      >
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <NuxtLink
            :to="eventPath(row.slug)"
            class="inline-flex min-h-11 min-w-0 items-center text-[15px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line [overflow-wrap:anywhere]"
          >
            {{ row.name }}
          </NuxtLink>
          <span class="text-[13px] font-semibold text-ink-2">
            {{ row.played > 0 ? t('library.played', { n: row.played }) : t('gameEvents.inPool') }}
          </span>
        </div>
        <GameNotesDisclosure
          v-if="notesHasText(row.notes)"
          :label="t('eventNotes.title')"
        >
          <RichNotes
            :doc="row.notes!"
            heading-level="h3"
            class="text-[14px] leading-[1.45] text-ink"
          />
        </GameNotesDisclosure>
      </li>
    </ul>
  </section>
</template>
