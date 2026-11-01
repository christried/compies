<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { characterCount, cutToCharacters } from '~~/shared/text'

// Labelled single-line input (02-components § TextField). Help and error are linked with
// aria-describedby. With `maxlength` it shows a counter, announced only from 80 % of the maximum.
// `invalid` turns the help text into the reason for an invalid field (announced); `cutAtMax` cuts longer input
// to the maximum instead of showing an error. `multiline` (#223) is a text area that grows with its text and keeps
// its line breaks; its counter shows only near the maximum.
const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  /** A text area for several lines (#223) instead of one input. */
  multiline?: boolean
  help?: string
  /** Shown under the field and marks it invalid. */
  error?: string
  type?: string
  /** The maximum in characters; enables the counter. */
  maxlength?: number
  /** The input's id; the help and error ids derive from it. A generated one by default. */
  id?: string
  /** Marks the field invalid with the help text as the reason: bold, in the error colour, announced. For a field whose help turns into the error (profile setup). */
  invalid?: boolean
  autocomplete?: string
  /** The on-screen keyboard to offer, e.g. `numeric` (#141). */
  inputmode?: 'numeric' | 'text' | 'url'
  /** With `maxlength`: longer input is cut to the maximum instead of being shown with an error. */
  cutAtMax?: boolean
}>(), { multiline: false, help: undefined, error: undefined, type: 'text', maxlength: undefined, id: undefined, invalid: false, autocomplete: undefined, inputmode: undefined, cutAtMax: false })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const generatedId = useId()
const inputId = computed(() => props.id ?? generatedId)
const helpId = computed(() => `${inputId.value}-help`)
const errorId = computed(() => `${inputId.value}-error`)
const describedBy = computed(() => [props.error ? errorId.value : null, props.help ? helpId.value : null].filter(Boolean).join(' ') || undefined)
const count = computed(() => characterCount(props.modelValue))
const nearLimit = computed(() => props.maxlength !== undefined && count.value >= props.maxlength * 0.8)
// A multiline field has no counter until it nears the maximum (#223); a single-line one always shows it.
const showCounter = computed(() => props.maxlength !== undefined && (!props.multiline || nearLimit.value))
const inputEl = useTemplateRef<HTMLInputElement>('input')
const textareaEl = useTemplateRef<HTMLTextAreaElement>('textarea')
useAutoHeight(textareaEl, () => props.modelValue)

function onInput(event: Event) {
  const input = event.target as HTMLInputElement | HTMLTextAreaElement
  let value = input.value
  if (props.cutAtMax && props.maxlength !== undefined && characterCount(value) > props.maxlength) {
    value = cutToCharacters(value, props.maxlength)
    // Written back directly: when the cut value equals the current model, Vue would not patch the input.
    input.value = value
  }
  emit('update:modelValue', value)
}

defineExpose({ focus: () => (props.multiline ? textareaEl.value : inputEl.value)?.focus() })
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="inputId"
      class="text-[14px] font-bold"
    >{{ label }}</label>
    <textarea
      v-if="multiline"
      :id="inputId"
      ref="textarea"
      :value="modelValue"
      :aria-invalid="error || invalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="field-sizing-content min-h-[9.5rem] resize-none overflow-hidden rounded-md bg-surface px-3.5 py-2.5 text-[17px] leading-[1.45] text-ink"
      :class="error || invalid ? 'border-3 border-error-fg' : 'border-(length:--cp-bw) border-line'"
      @input="onInput"
    />
    <input
      v-else
      :id="inputId"
      ref="input"
      :value="modelValue"
      :type="type"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :aria-invalid="error || invalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="h-control-lg rounded-md bg-surface px-3.5 text-[17px] text-ink"
      :class="error || invalid ? 'border-3 border-error-fg' : 'border-(length:--cp-bw) border-line'"
      @input="onInput"
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
          :class="invalid ? 'font-bold text-error-fg' : 'text-ink-2'"
          :aria-live="invalid ? 'polite' : undefined"
        >{{ help }}</span>
      </div>
      <span
        v-if="showCounter"
        class="font-mono text-ink-2"
        :aria-live="nearLimit ? 'polite' : undefined"
      >{{ t('common.counter', { n: count, max: maxlength }) }}</span>
    </div>
  </div>
</template>
