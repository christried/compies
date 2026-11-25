<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'

// The Event page's load states (#257): an Event that does not exist (404), was deleted (410) or from which the Host removed the User (#897) says so; any other failed
// read says the page failed. The page shows this instead of its stage whenever the Event could not be read. `removed` wins over the status: a removed User's reads answer 404.
const props = withDefaults(defineProps<{
  error: { statusCode?: number }
  removed?: boolean
}>(), { removed: false })

const { t } = useI18n()
const notFound = computed(() => props.error.statusCode === 404)
const deleted = computed(() => props.error.statusCode === 410)
</script>

<template>
  <!-- A branch of its own, so the state mounts afresh (and takes the focus) even when „Link ungültig“ was on screen a moment before. -->
  <FullScreenState
    v-if="removed"
    kind="removed"
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
    v-else-if="notFound || deleted"
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
