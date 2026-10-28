<script setup lang="ts">
import { CalendarCheck, Eye } from '@lucide/vue'
import type { NoteRow } from '~/utils/notes'

// The Host sets a Date (02-components § DateConfirmDialog, screen M3 confirm, #52). A ConfirmModal with
// the open future Slots as a radio group. The preselected one is the Best slot, or the earliest future
// Slot when nobody has voted; the Host can pick another. Confirming needs a chosen Slot. The dialog says
// how many Dates still wait after this one, and no line when this one fills the last.
export interface ConfirmOption {
  id: string
  day: string
  time: string
  yes: number
  maybe: number
  /** The Notes on the Slot (#102), listed under its counts. */
  notes: NoteRow[]
}

const props = defineProps<{
  open: boolean
  options: ConfirmOption[]
  /** The Slot that starts selected. */
  preselected: string | null
  /** The Sessions still without a Date after this one is set. */
  missingAfter: number
  loading?: boolean
}>()

const emit = defineEmits<{ confirm: [slotId: string], cancel: [] }>()

const { t } = useI18n()
const chosen = ref<string | null>(null)
const selected = computed(() => (props.options.some(option => option.id === chosen.value) ? chosen.value : props.preselected))
const list = useTemplateRef<HTMLElement>('list')

// The option list scrolls inside the dialog (16 Slots), so the selected one is brought into view on open.
function scrollSelectedIntoView() {
  list.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView?.({ block: 'nearest' })
}

onMounted(scrollSelectedIntoView)
watch(() => props.open, open => open && nextTick(scrollSelectedIntoView))

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
        ref="list"
        role="radiogroup"
        :aria-label="t('mvp.set.pickLabel')"
        class="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto p-1"
      >
        <div
          v-for="option in options"
          :key="option.id"
          class="flex flex-none flex-col gap-1.5"
        >
          <button
            type="button"
            role="radio"
            :aria-checked="selected === option.id ? 'true' : 'false'"
            :data-slot="option.id"
            class="hit-44 flex flex-none items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-left text-ink hover:tint"
            :class="selected === option.id ? 'border-[3px] border-focus bg-[color-mix(in_srgb,var(--cp-focus)_14%,var(--cp-surface))]' : 'border-(length:--cp-bw) border-line bg-surface'"
            @click="chosen = option.id"
          >
            <span
              class="grid size-5 flex-none place-items-center rounded-full border-(length:--cp-bw) border-line bg-surface"
              aria-hidden="true"
            >
              <span
                v-if="selected === option.id"
                class="size-2.5 rounded-full bg-focus"
              />
            </span>
            <b class="flex-1">{{ t('mvp.set.slotLabel', { day: option.day, time: option.time }) }}</b>
            <span class="text-[13px] text-ink-2">{{ option.yes }} {{ t('poll.yes') }}, {{ option.maybe }} {{ t('poll.maybe') }}</span>
          </button>
          <NoteList
            :notes="option.notes"
            class="px-3.5 pb-1"
          />
        </div>
      </div>
      <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
        <li v-if="missingAfter > 0">
          {{ t('mvp.set.missingAfter', { n: missingAfter }, missingAfter) }}
        </li>
        <li class="flex items-center gap-2">
          <AppIcon
            :icon="Eye"
            :size="16"
          />
          {{ t('mvp.poll.confirmSeeAll') }}
        </li>
      </ul>
    </div>
  </ConfirmModal>
</template>
