<script setup lang="ts">
import { CalendarPlus } from '@lucide/vue'

// The dead end after the last Session (#278, the s5 decision 5 revisited): the Game count is not reached and no open Round fills it,
// so the last game needs a new Session. Host only, closable for this visit. „Session hinzufügen“ emits `add`: the page opens the same
// sheet as the Sessions card does.
defineProps<{
  /** The games still to start (gamesToStart). */
  left: number
}>()

const emit = defineEmits<{ add: [] }>()
const { t } = useI18n()
const closed = ref(false)
</script>

<template>
  <NoticeBanner
    v-if="!closed"
    tone="info"
    :icon="CalendarPlus"
    host-only
    closable
    @close="closed = true"
  >
    <b>{{ t('event.notice.sessionNeededTitle', { n: left }, left) }}</b>
    {{ t('event.notice.sessionNeeded') }}
    <template #action>
      <AppButton
        variant="secondary"
        size="md"
        @click="emit('add')"
      >
        {{ t('mvp.sessions.add') }}
      </AppButton>
    </template>
  </NoticeBanner>
</template>
