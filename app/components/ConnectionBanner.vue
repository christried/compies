<script setup lang="ts">
import { CircleCheck, RefreshCw, WifiOff } from '@lucide/vue'
import type { BannerState } from '~/utils/connection-banner'

// The state of the live connection (02-components § ConnectionBanner, App Systemzustände 27, #156). Nothing for a
// drop under 2 s (the `ok` state renders nothing); „wird wiederhergestellt“ in a warning (role status) from 2 s;
// „verloren“ in a critical notice (role alert) with a retry button from 15 s; „Wieder da“ in success for 2 s. The
// timing is useConnectionBanner's. The page stays usable; what the banner promises is only what the page does: it
// shows the last state and polls while the connection is down.
defineProps<{ state: BannerState }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <NoticeBanner
    v-if="state === 'reconnecting'"
    tone="warning"
    :icon="WifiOff"
  >
    <b>{{ t('connection.reconnecting') }}</b>
    {{ t('connection.reconnectingText') }}
  </NoticeBanner>

  <NoticeBanner
    v-else-if="state === 'lost'"
    tone="critical"
    :icon="WifiOff"
  >
    <b>{{ t('connection.lost') }}</b>
    {{ t('connection.lostText') }}
    <template #action>
      <AppButton
        size="md"
        @click="emit('retry')"
      >
        <template #icon>
          <AppIcon :icon="RefreshCw" />
        </template>
        {{ t('connection.retry') }}
      </AppButton>
    </template>
  </NoticeBanner>

  <NoticeBanner
    v-else-if="state === 'back'"
    tone="success"
    :icon="CircleCheck"
  >
    <b>{{ t('connection.back') }}</b>
  </NoticeBanner>
</template>
