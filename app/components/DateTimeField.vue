<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'

// A Berlin date and time in two native inputs (02-components § DateTimeField). The value is
// `YYYY-MM-DDTHH:mm` in Europe/Berlin, or empty until both parts are set (ADR 0003).
const props = withDefaults(defineProps<{
  modelValue: string
  /** Accessible name of the group, e.g. the numbered Slot label of the create form. */
  label: string
  /** The earliest selectable day, as a Berlin value; only its date part is used. */
  min?: string
  error?: string
}>(), { min: undefined, error: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const id = useId()
const errorId = `${id}-error`

const [initialDate = '', initialTime = ''] = props.modelValue.split('T')
const date = ref(initialDate)
const time = ref(initialTime)

function combined() {
  return date.value && time.value ? `${date.value}T${time.value}` : ''
}

function onPart() {
  emit('update:modelValue', combined())
}

// A value from outside (a reset, or the Slot list changing) replaces what the inputs show.
watch(() => props.modelValue, (value) => {
  if (value === combined()) return
  const [datePart = '', timePart = ''] = value.split('T')
  date.value = datePart
  time.value = timePart
})

const minDate = computed(() => props.min?.split('T')[0])
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    :aria-describedby="error ? errorId : undefined"
    class="flex flex-col gap-1.5"
  >
    <div class="flex gap-2">
      <label
        :for="`${id}-date`"
        class="sr-only"
      >{{ t('mvp.create.dateInput') }}</label>
      <input
        :id="`${id}-date`"
        v-model="date"
        type="date"
        :min="minDate"
        :aria-invalid="error ? 'true' : undefined"
        class="hit-44 h-12 min-w-0 flex-1 rounded-md bg-surface px-3 font-semibold text-ink"
        :class="error ? 'border-3 border-error-fg' : 'border-(length:--cp-bw) border-line'"
        @input="onPart"
      >
      <label
        :for="`${id}-time`"
        class="sr-only"
      >{{ t('mvp.create.timeInput') }}</label>
      <input
        :id="`${id}-time`"
        v-model="time"
        type="time"
        :aria-invalid="error ? 'true' : undefined"
        class="hit-44 h-12 w-[108px] flex-none rounded-md bg-surface px-3 font-num text-ink"
        :class="error ? 'border-3 border-error-fg' : 'border-(length:--cp-bw) border-line'"
        @input="onPart"
      >
    </div>
    <span
      v-if="error"
      :id="errorId"
      class="flex items-center gap-1.5 text-small font-bold text-error-fg"
    >
      <AppIcon
        :icon="CircleAlert"
        :size="14"
      />
      {{ error }}
    </span>
  </div>
</template>
