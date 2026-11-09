<script setup lang="ts">
import { Trash2 } from '@lucide/vue'

// The delete sheet (#333, spec #332): the Host deletes the Event with a one second hold, the pattern of „Link erneuern (halten)“ in
// InviteSheet without its first step. The page's dialogs send the delete (`remove`) and leave for Home; a refusal keeps the sheet open.
defineProps<{
  open: boolean
  /** Sends the delete; resolves to whether the server took it (the hold goes back to idle on false). */
  remove: () => Promise<boolean>
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('eventDelete.title')"
    @close="emit('close')"
  >
    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t('eventDelete.text') }}
    </p>

    <HoldToConfirmButton
      variant="hot"
      :label="t('eventDelete.hold')"
      :icon="Trash2"
      :action="remove"
    />

    <AppButton
      variant="secondary"
      class="self-start"
      @click="emit('close')"
    >
      {{ t('common.cancel') }}
    </AppButton>
  </AppSheet>
</template>
