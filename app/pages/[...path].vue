<script setup lang="ts">
import { constructionSite } from '~/utils/construction'

// MVP route guard: every path without a page of its own lands here (see utils/construction.ts).
const route = useRoute()
const site = computed(() => constructionSite(route.path))
</script>

<template>
  <AppShell :kind="site.shell">
    <ConstructionPage :area="site.area" />
  </AppShell>
</template>
