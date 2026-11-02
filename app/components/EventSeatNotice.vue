<script setup lang="ts">
import { Crown } from '@lucide/vue'

// Where the Host sits (teams only, #160, #257): the dock does not change with the seat, and this note says so. Closable for this visit.
defineProps<{
  note: string | null
}>()

const closed = ref(false)
</script>

<template>
  <NoticeBanner
    v-if="note && !closed"
    tone="info"
    :icon="Crown"
    host-only
    closable
    @close="closed = true"
  >
    {{ note }}
  </NoticeBanner>
</template>
