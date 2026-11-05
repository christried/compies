<script setup lang="ts">
import type { HistoryCorrections } from '~/utils/result-draft'
import type { StandingsNews } from '~/utils/standings-news'
import type { EventView } from '~~/shared/event'

// The content of the „Tabelle“ tab (#274): the Standings and the history in one column. The side panel's `standings` slot and the phone's own
// view both mount it, so there is one place for what the tab holds. The Standings are left out for an Event that is not set up (no
// `standings`, no `end`); the history then says that no game was played. `corrections` (#275, the Host's while the Event has not finished) goes
// on to the history, which gives its rows the pencil. `news` (#276, the page's useStandingsNews) goes to the Standings: this tab never
// celebrates, the stamp and the confetti belong to the stage block.
defineProps<{
  view: Pick<EventView, 'standings' | 'end' | 'results' | 'rounds' | 'teams'>
  corrections?: HistoryCorrections | null
  news?: StandingsNews | null
  /** The id of a heading outside the Standings that names them (#274): the phone's „Tabelle“ view; the side panel keeps the Leaderboard's own h2. */
  labelledBy?: string
}>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-6">
    <Leaderboard
      v-if="view.standings && view.end"
      :standings="view.standings"
      :end="view.end"
      :teams="view.teams"
      :news="news"
      :labelled-by="labelledBy"
    />
    <GameHistory
      :results="view.results"
      :open="view.rounds"
      :teams="view.teams"
      :corrections="corrections"
    />
  </div>
</template>
