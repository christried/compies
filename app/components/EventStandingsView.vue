<script setup lang="ts">
import type { HistoryCorrections } from '~/utils/result-draft'
import type { StandingsNews } from '~/utils/standings-news'
import type { EventView } from '~~/shared/event'

// A phone's „Tabelle“ view of the Event page (#274, 11-event-seite § TabBar): the Standings and the history alone, under the title that takes the
// place of the page's Head, built like the Activity view. The page's tab bar switches to it (useEventTabs); the content is the side panel's, and so is the Host's `corrections` (#275)
// and the page's `news` (#276).
defineProps<{
  view: Pick<EventView, 'standings' | 'end' | 'results' | 'rounds' | 'teams'>
  corrections?: HistoryCorrections | null
  news?: StandingsNews | null
}>()

const { t } = useI18n()
</script>

<template>
  <section
    aria-labelledby="standings-title"
    class="flex flex-col gap-3"
  >
    <h1
      id="standings-title"
      class="m-0 font-display text-[34px] leading-none font-normal"
    >
      {{ t('table.title') }}
    </h1>
    <StandingsTab
      :view="view"
      :corrections="corrections"
      :news="news"
      labelled-by="standings-title"
    />
  </section>
</template>
