<script setup lang="ts">
import { House } from '@lucide/vue'
import type { NuxtError } from '#app'

// Unknown routes never get here (the catch-all renders the Construction page); this covers
// errors thrown while rendering, plus explicit 404s from pages that look data up.
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const kind = computed(() => props.error.statusCode === 404 ? 'notFound' : props.error.statusCode === 403 ? 'noPermission' : 'generic')
</script>

<template>
  <AppShell kind="bare">
    <FullScreenState :kind="kind">
      <template #actions>
        <AppButton
          size="lg"
          @click="clearError({ redirect: '/' })"
        >
          <template #icon>
            <AppIcon :icon="House" />
          </template>
          {{ t('errorPage.home') }}
        </AppButton>
      </template>
    </FullScreenState>
    <!-- app.vue is not rendered on an error, so the staging label is mounted here too (#178). -->
    <StagingBadge />
  </AppShell>
</template>
