<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'

// Labelled single-line input (02-components § TextField). Help and error are linked with
// aria-describedby. With `maxlength` it shows a counter, announced only from 80 % of the maximum.
const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  help?: string
  /** Shown under the field and marks it invalid. */
  error?: string
  type?: string
  /** The maximum in characters; enables the counter. */
  maxlength?: number
}>(), { help: undefined, error: undefined, type: 'text', maxlength: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const id = useId()
const helpId = `${id}-help`
const errorId = `${id}-error`
const describedBy = computed(() => [props.error ? errorId : null, props.help ? helpId : null].filter(Boolean).join(' ') || undefined)
const count = computed(() => [...props.modelValue].length)
const nearLimit = computed(() => props.maxlength !== undefined && count.value >= props.maxlength * 0.8)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="id"
      class="text-[14px] font-bold"
    >{{ label }}</label>
    <input
      :id="id"
      :value="modelValue"
      :type="type"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="h-control-lg rounded-md bg-surface px-3.5 text-[17px] text-ink"
      :class="error ? 'border-3 border-error-fg' : 'border-(length:--cp-bw) border-line'"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <div class="flex items-start gap-3 text-small">
      <div class="flex flex-1 flex-col gap-0.5">
        <span
          v-if="error"
          :id="errorId"
          class="flex items-center gap-1.5 font-bold text-error-fg"
        >
          <AppIcon
            :icon="CircleAlert"
            :size="14"
          />
          {{ error }}
        </span>
        <span
          v-if="help"
          :id="helpId"
          class="text-ink-2"
        >{{ help }}</span>
      </div>
      <span
        v-if="maxlength !== undefined"
        class="font-mono text-ink-2"
        :aria-live="nearLimit ? 'polite' : undefined"
      >{{ t('common.counter', { n: count, max: maxlength }) }}</span>
    </div>
  </div>
</template>
