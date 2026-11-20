<script setup lang="ts">
import { characterCount, cutToCharacters } from '~~/shared/text'
import { fieldBox } from '~/utils/field-chrome'

// Labelled input or, with `multiline`, text area (02-components § TextField). Help and error are linked with
// aria-describedby. With `maxlength` it shows a counter, announced only from 80 % of the maximum.
// The `error` is the problem the field has; it shows (red, with the 3 px border) only once the field was touched or the
// form tried to submit (#797), and inside a FieldGroup as the group's one line. `cutAtMax` cuts longer input
// to the maximum instead of showing an error. `multiline` (#223) is a text area that grows with its text and keeps
// its line breaks; its counter shows only near the maximum.
const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  /** A text area for several lines (#223) instead of one input. */
  multiline?: boolean
  help?: string
  /** The problem of the field: shown under it and marking it invalid, once it was touched or a submit was tried (#797). */
  error?: string
  /** Shows `error` at once, untouched: for a problem the User's typing did not cause, such as a video the player reports as gone (#812). */
  errorAtOnce?: boolean
  type?: string
  /** The maximum in characters; enables the counter. */
  maxlength?: number
  /** The input's id; the help and error ids derive from it. A generated one by default. */
  id?: string
  autocomplete?: string
  /** The on-screen keyboard to offer, e.g. `numeric` (#141). */
  inputmode?: 'numeric' | 'text' | 'url'
  /** With `maxlength`: longer input is cut to the maximum instead of being shown with an error. */
  cutAtMax?: boolean
  /** Muted and not editable: the Price amount of a source that takes none (#337). */
  disabled?: boolean
  /** The hint shown in the empty field, in the muted colour (#804). A prop: as an attribute it would fall to the root `<div>`. */
  placeholder?: string
}>(), { multiline: false, help: undefined, error: undefined, type: 'text', maxlength: undefined, id: undefined, autocomplete: undefined, inputmode: undefined, cutAtMax: false, disabled: false, placeholder: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const generatedId = useId()
const inputId = computed(() => props.id ?? generatedId)
const helpId = computed(() => `${inputId.value}-help`)
const errorId = computed(() => `${inputId.value}-error`)
const { message, touch } = useTouched(() => props.error, () => (props.errorAtOnce ? true : undefined))
// A value that moves without an input of its own (a form that follows another field, as Länge follows Ende) is touched by
// that edit: the message of the field the User's edit hit must not wait for a blur.
watch(() => props.modelValue, touch)
// In a group the group draws the line; the field only points at it while its own message shows.
const groupErrorId = useGroupMember(() => message.value)
const describedBy = computed(() => [message.value ? (groupErrorId ?? errorId.value) : null, props.help ? helpId.value : null].filter(Boolean).join(' ') || undefined)
const count = computed(() => characterCount(props.modelValue))
const nearLimit = computed(() => props.maxlength !== undefined && count.value >= props.maxlength * 0.8)
// A multiline field has no counter until it nears the maximum (#223); a single-line one always shows it.
const showCounter = computed(() => props.maxlength !== undefined && (!props.multiline || nearLimit.value))
const inputEl = useTemplateRef<HTMLInputElement>('input')
const textareaEl = useTemplateRef<HTMLTextAreaElement>('textarea')
useAutoHeight(textareaEl, () => props.modelValue)

function onInput(event: Event) {
  touch()
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
      :aria-invalid="message ? 'true' : undefined"
      :aria-describedby="describedBy"
      :disabled="disabled"
      :placeholder="placeholder"
      class="field-sizing-content min-h-[9.5rem] resize-none overflow-hidden px-3.5 py-2.5 text-[17px] leading-[1.45] text-ink placeholder:text-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
      :class="fieldBox(Boolean(message))"
      @input="onInput"
      @blur="touch"
    />
    <input
      v-else
      :id="inputId"
      ref="input"
      :value="modelValue"
      :type="type"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :aria-invalid="message ? 'true' : undefined"
      :aria-describedby="describedBy"
      :disabled="disabled"
      :placeholder="placeholder"
      class="h-control-lg px-3.5 text-[17px] text-ink placeholder:text-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
      :class="fieldBox(Boolean(message))"
      @input="onInput"
      @blur="touch"
    >
    <div class="flex items-start gap-3 text-small">
      <div class="flex flex-1 flex-col gap-0.5">
        <FieldError
          v-if="message && !groupErrorId"
          :id="errorId"
        >
          {{ message }}
        </FieldError>
        <span
          v-if="help"
          :id="helpId"
          class="text-ink-2"
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
