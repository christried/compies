<script setup lang="ts">
import { constructionSite } from '~/utils/construction'
import { datePollOpen, type HomeEvent, type HomeView } from '~~/shared/event'
import { HOME_EVENTS_KEY } from '~/utils/event-data'

// MVP route guard: every path without a page of its own lands here (see utils/construction.ts).
const route = useRoute()
const user = useAuthUser()
const site = computed(() => constructionSite(route.path, user.value))

// Shares the Home list (same key), so the CTA can point at the User's latest open poll (#12): the
// most recently created one, whatever its place in Home order. ISO strings sort as their times.
const { data: home } = useFetch<HomeView>('/api/e', { key: HOME_EVENTS_KEY })
const latestPollSlug = computed(() => (home.value?.events ?? [])
  .filter(event => datePollOpen(event.phase, event.missingDates))
  .reduce<HomeEvent | null>((latest, event) => (!latest || event.createdAt > latest.createdAt ? event : latest), null)
  ?.slug ?? null)
</script>

<template>
  <AppShell :kind="site.shell">
    <ConstructionPage
      :area="site.area"
      :latest-poll-slug="latestPollSlug"
    />
  </AppShell>
</template>
