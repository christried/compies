<script setup lang="ts">
import { EVENT_NAME_MAX, eventNameLength } from '~~/shared/event'

// Step 1: the Session's name (#144). Every step v-models its slice of the draft and reports why Weiter is
// blocked through `v-model:blocker` (null = it can go on): the stepper reads that to block Weiter.
const name = defineModel<string>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

const tooLong = computed(() => eventNameLength(name.value) > EVENT_NAME_MAX)
const error = computed(() => (tooLong.value ? t('error.nameTooLong', { max: EVENT_NAME_MAX }) : undefined))

watchEffect(() => {
  if (name.value.trim() === '') blocker.value = t('error.nameRequired')
  else blocker.value = error.value ?? null
})
</script>

<template>
  <div class="max-w-[520px]">
    <TextField
      v-model="name"
      :label="t('stepper.name.label')"
      :help="t('stepper.name.help')"
      :error="error"
      :maxlength="EVENT_NAME_MAX"
    />
  </div>
</template>
