<script setup lang="ts">
import { Hourglass, Settings2 } from '@lucide/vue'
import { settingsPath } from '~~/shared/links'

// The stage's setup block (#144, #147, #257): the Host, while the Event has no settings, is asked to set it up (closable for this
// visit); a Member reads that the Host sets it up. The page decides whether it is needed (`canEditSettings`, the dock needs it too).
defineProps<{
  slug: string
  isHost: boolean
  needsSetup: boolean
  hostName: string
}>()

const { t } = useI18n()
const setupNoticeClosed = ref(false)
</script>

<template>
  <NoticeBanner
    v-if="needsSetup && !setupNoticeClosed"
    tone="info"
    :icon="Settings2"
    host-only
    closable
    @close="setupNoticeClosed = true"
  >
    <b>{{ t('event.notice.setupTitle') }}</b>
    {{ t('event.notice.setup') }}
    <template #action>
      <AppButton
        :to="settingsPath(slug)"
        variant="secondary"
        size="md"
      >
        {{ t('event.notice.setupAction') }}
      </AppButton>
    </template>
  </NoticeBanner>
  <NoticeBanner
    v-else-if="!isHost"
    tone="info"
    :icon="Hourglass"
  >
    {{ t('event.notice.setupMember', { host: hostName }) }}
  </NoticeBanner>
</template>
