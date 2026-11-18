<script setup lang="ts">
import type { EventDraft, StepLocks } from '~/utils/event-draft'
import { EVENT_NAME_MAX, eventNameLength } from '~~/shared/event'

// The Event's name (#144). Every step v-models the whole draft, reports why Weiter is blocked through
// `v-model:blocker` (null = it can go on; the wizard reads that to block Weiter) and takes `locks`, which it may ignore.
defineProps<{ locks?: StepLocks }>()
const draft = defineModel<EventDraft>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

const name = computed({
  get: () => draft.value.name,
  set: (value) => {
    draft.value = { ...draft.value, name: value }
  },
})

const tooLong = computed(() => eventNameLength(name.value) > EVENT_NAME_MAX)
const empty = computed(() => name.value.trim() === '')
// The field says what is wrong once it was touched or Weiter was pressed (#797); Weiter's reason is the same text as before.
const error = computed(() => {
  if (tooLong.value) return t('error.nameTooLong', { max: EVENT_NAME_MAX })
  return empty.value ? t('error.nameRequired') : undefined
})

useStepBlocker(blocker, () => error.value)
</script>

<template>
  <div class="max-w-[520px]">
    <TextField
      v-model="name"
      :label="t('stepper.name.label')"
      :error="error"
      :maxlength="EVENT_NAME_MAX"
    />
  </div>
</template>
