<script setup lang="ts">
import type { EventView } from '~~/shared/event'

// A phone's „Tabelle“ view of the Event page (#274, 11-event-seite § TabBar): the Standings and the history alone, under the title that takes the
// place of the page's Head, built like the Activity view. The page's tab bar switches to it (useEventTabs); the content is the side panel's.
defineProps<{
  view: Pick<EventView, 'standings' | 'end' | 'results' | 'rounds' | 'teams'>
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
    <StandingsTab :view="view" />
  </section>
</template>
