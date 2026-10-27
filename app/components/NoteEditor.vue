<script setup lang="ts">
import { MessageSquare, Pencil } from '@lucide/vue'
import { NOTE_MAX } from '~~/shared/poll'

// The Note on this User's Vote, inside a Slot card (#102). Once voted and not past: an „Anmerkung“ button, or the
// Note as text with a pencil. Opening shows a TextField inline; Enter saves, Escape cancels, and saving an empty
// field removes the Note. `open(focus)` lets the card open it for Meh without taking the focus.
const props = defineProps<{
  /** This User's saved Note on the Slot. */
  note: string | null
  /** Whether this User has a Vote on the Slot: no Vote, no Note. */
  voted: boolean
  past: boolean
}>()

const emit = defineEmits<{ save: [text: string] }>()

const { t } = useI18n()
const editing = ref(false)
const draft = ref('')
const openedByMeh = ref(false)
const field = useTemplateRef<{ focus: () => void }>('field')

async function open(focus = true) {
  draft.value = props.note ?? ''
  editing.value = true
  openedByMeh.value = !focus
  if (focus) {
    await nextTick()
    field.value?.focus()
  }
}

function cancel() {
  editing.value = false
}

function save() {
  editing.value = false
  emit('save', draft.value)
}

// A Vote that did not arrive takes the open field with it.
watch(() => props.voted, voted => !voted && cancel())

/** Closes the field Meh opened, if nothing was typed into it, when the Vote moves on from Meh. */
function closeIfUntouched() {
  if (editing.value && openedByMeh.value && draft.value === (props.note ?? '')) editing.value = false
}

defineExpose({ open, closeIfUntouched })
</script>

<template>
  <div
    v-if="!past"
    class="flex flex-col gap-2"
  >
    <div
      v-if="editing"
      class="flex flex-col gap-2"
      @keydown.esc.stop="cancel"
    >
      <TextField
        ref="field"
        v-model="draft"
        :label="t('mvp.notes.label')"
        :help="t('mvp.notes.help')"
        :maxlength="NOTE_MAX"
        cut-at-max
        @keydown.enter.prevent="save"
      />
      <div class="flex flex-wrap gap-2">
        <AppButton
          variant="secondary"
          @click="save"
        >
          {{ t('common.save') }}
        </AppButton>
        <AppButton
          variant="secondary"
          @click="cancel"
        >
          {{ t('common.cancel') }}
        </AppButton>
      </div>
    </div>
    <div
      v-else-if="voted && note"
      class="flex items-start gap-2"
    >
      <p class="m-0 min-w-0 flex-1 self-center text-[13px] text-pretty break-words">
        {{ note }}
      </p>
      <IconButton
        :icon="Pencil"
        :label="t('mvp.notes.edit')"
        @click="open()"
      />
    </div>
    <AppButton
      v-else-if="voted"
      variant="secondary"
      class="self-start"
      @click="open()"
    >
      <template #icon>
        <AppIcon
          :icon="MessageSquare"
          :size="14"
        />
      </template>
      {{ t('mvp.notes.add') }}
    </AppButton>
  </div>
</template>
