<script setup lang="ts">
import { CalendarCheck, Clock, Download, Eye } from '@lucide/vue'

// The Host sets the Date (02-components § DateConfirmDialog, screen M3 confirm). A ConfirmModal with
// the future Slots as a radio group. The preselected one is the Best slot, or the earliest future Slot
// when nobody has voted; the Host can pick another future Slot. Confirming needs a chosen Slot.
export interface ConfirmOption {
  id: string
  day: string
  time: string
  yes: number
  maybe: number
}

const props = defineProps<{
  open: boolean
  options: ConfirmOption[]
  /** The Slot that starts selected. */
  preselected: string | null
  /** Members in the Session, for the line that says how many will see the Date. */
  total: number
  loading?: boolean
}>()

const emit = defineEmits<{ confirm: [slotId: string], cancel: [] }>()

const { t } = useI18n()
const chosen = ref<string | null>(null)
const selected = computed(() => (props.options.some(option => option.id === chosen.value) ? chosen.value : props.preselected))

function close() {
  chosen.value = null
  emit('cancel')
}

function confirm() {
  if (selected.value) emit('confirm', selected.value)
}
</script>

<template>
  <ConfirmModal
    :open="open"
    :title="t('mvp.set.confirmTitle')"
    :icon="CalendarCheck"
    :confirm-label="t('mvp.poll.confirmCta')"
    :cancel-label="t('mvp.poll.cancel')"
    :loading="loading"
    @confirm="confirm"
    @cancel="close"
  >
    <div class="flex flex-col gap-4">
      <div
        role="radiogroup"
        :aria-label="t('mvp.set.pickLabel')"
        class="flex flex-col gap-2"
      >
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          role="radio"
          :aria-checked="selected === option.id ? 'true' : 'false'"
          :data-slot="option.id"
          class="outline-memphis hit-44 flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-left text-ink"
          :class="selected === option.id ? 'border-[3px] border-focus bg-surface' : 'border-(length:--cp-bw) border-line bg-surface'"
          @click="chosen = option.id"
        >
          <b class="flex-1">{{ t('mvp.set.slotLabel', { day: option.day, time: option.time }) }}</b>
          <span class="text-[13px] text-ink-2">{{ option.yes }} {{ t('poll.yes') }}, {{ option.maybe }} {{ t('poll.maybe') }}</span>
        </button>
      </div>
      <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
        <li class="flex gap-2">
          <AppIcon
            :icon="Eye"
            :size="16"
          />
          {{ t('mvp.poll.confirmSeeAll', { n: total }) }}
        </li>
        <li class="flex gap-2">
          <AppIcon
            :icon="Download"
            :size="16"
          />
          {{ t('mvp.poll.confirmIcs') }}
        </li>
        <li class="flex gap-2">
          <AppIcon
            :icon="Clock"
            :size="16"
          />
          {{ t('mvp.poll.confirmReminder') }}
        </li>
      </ul>
    </div>
  </ConfirmModal>
</template>
