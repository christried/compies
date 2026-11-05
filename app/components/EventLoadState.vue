<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'

// The Event page's load states (#257): an Event that does not exist (404) or was deleted (410) says so; any other failed read says
// the page failed. The page shows this instead of its stage whenever the Event could not be read.
const props = defineProps<{
  error: { statusCode?: number }
}>()

const { t } = useI18n()
const notFound = computed(() => props.error.statusCode === 404)
const deleted = computed(() => props.error.statusCode === 410)
</script>

<template>
  <FullScreenState
    v-if="notFound || deleted"
    :kind="deleted ? 'deleted' : 'invalid'"
  >
    <template #actions>
      <AppButton
        to="/"
        size="lg"
      >
        {{ t('errorPage.home') }}
        <AppIcon :icon="ChevronRight" />
      </AppButton>
    </template>
  </FullScreenState>

  <FullScreenState
    v-else
    kind="generic"
  />
</template>
