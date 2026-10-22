<script setup lang="ts">
import { CalendarClock } from '@lucide/vue'
import { berlinLocalNow } from '~/utils/berlin-time'

// Reschedule the set Date (02-components § DateConfirmDialog, screen M3 move; #14). The Host picks a
// new future Berlin time. The Session stays set, and every Member gets the same .ics updated. The
// field starts at the current Date, so a small shift is one edit.
const props = defineProps<{
  open: boolean
  /** The current Date as a UTC ISO instant. */
  startsAt: string
  loading?: boolean
}>()

const emit = defineEmits<{ confirm: [startsAt: string], cancel: [] }>()

const { t } = useI18n()
const value = ref('')

watch(() => props.open, (open) => {
  if (open) value.value = berlinLocalNow(new Date(props.startsAt))
}, { immediate: true })

function confirm() {
  if (value.value) emit('confirm', value.value)
}
</script>

<template>
  <ConfirmModal
    :open="open"
    :title="t('mvp.reschedule.title')"
    :icon="CalendarClock"
    :confirm-label="t('mvp.reschedule.cta')"
    :cancel-label="t('mvp.poll.cancel')"
    :loading="loading"
    @confirm="confirm"
    @cancel="emit('cancel')"
  >
    <div class="flex flex-col gap-4">
      <p class="m-0">
        {{ t('mvp.reschedule.text') }}
      </p>
      <DateTimeField
        v-model="value"
        :label="t('mvp.reschedule.label')"
      />
    </div>
  </ConfirmModal>
</template>
