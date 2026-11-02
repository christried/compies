<script setup lang="ts">
import type { FeedSession } from '~/utils/activity'

// A phone's second view of the Event page (11-event-seite § TabBar, #166): the Activity feed alone, under its title, with the place
// of the page's Head taken by that title. The page's tab bar switches to it (useEventTabs); the feed is the one of the side panel.
defineProps<{
  slug: string
  room: Pick<ReturnType<typeof useEventRoom>, 'state' | 'on'>
  sessions: FeedSession[]
  nextNumber: number | null
  /** The page's count of the instants that passed: the feed reads again with it (#229). */
  refreshTick: number
}>()

const { t } = useI18n()
</script>

<template>
  <section
    aria-labelledby="activity-title"
    class="flex flex-col gap-3"
  >
    <h1
      id="activity-title"
      class="m-0 font-display text-[34px] leading-none font-normal"
    >
      {{ t('activity.title') }}
    </h1>
    <div class="flex h-[calc(100dvh-17rem)] min-h-72 flex-col rounded-[16px] border-(length:--cp-bw) border-line bg-surface">
      <ActivityFeed
        :slug="slug"
        :room="room"
        :sessions="sessions"
        :next-number="nextNumber"
        :refresh-tick="refreshTick"
      />
    </div>
  </section>
</template>
