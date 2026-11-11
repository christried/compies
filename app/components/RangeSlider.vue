<script setup lang="ts">
// A range slider (#516, 02-components § RangeSlider): a native input[type=range] with a visible label and a value text,
// in the app's tokens. Built so another form could use it. The arrow keys, Home and End are the browser's: no key
// handler here. `change` forwards the native change (the thumb released, or a key step) with the same number.
// The thumb carries its on-colour text class only for test/unit/on-colour.ts (rule b: a state fill needs a text partner); the thumb has
// no text, so do not remove it.
withDefaults(defineProps<{
  min: number
  max: number
  step?: number
  /** Visible, and the input's accessible name. */
  label: string
  /** Visible, and the input's aria-valuetext. */
  valueText: string
  disabled?: boolean
}>(), { step: 1, disabled: false })

const emit = defineEmits<{ change: [value: number] }>()
const model = defineModel<number>({ required: true })
const inputId = useId()

function onInput(event: Event) {
  model.value = Number((event.target as HTMLInputElement).value)
}

function onChange(event: Event) {
  emit('change', Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-baseline justify-between gap-3">
      <label
        :for="inputId"
        class="text-[14px] font-bold"
      >{{ label }}</label>
      <span class="font-num text-[14px] font-bold">{{ valueText }}</span>
    </div>
    <input
      :id="inputId"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="model"
      :aria-valuetext="valueText"
      :disabled="disabled"
      class="h-11 w-full appearance-none bg-transparent focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:rounded-pill [&::-webkit-slider-runnable-track]:border-(length:--cp-bw-thin) [&::-webkit-slider-runnable-track]:border-line [&::-webkit-slider-runnable-track]:bg-paper-2 [&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-pill [&::-moz-range-track]:border-(length:--cp-bw-thin) [&::-moz-range-track]:border-line [&::-moz-range-track]:bg-paper-2 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:size-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-pill [&::-webkit-slider-thumb]:border-(length:--cp-bw) [&::-webkit-slider-thumb]:border-line [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:text-on-primary [&::-moz-range-thumb]:size-[18px] [&::-moz-range-thumb]:rounded-pill [&::-moz-range-thumb]:border-(length:--cp-bw) [&::-moz-range-thumb]:border-line [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:text-on-primary"
      @input="onInput"
      @change="onChange"
    >
  </div>
</template>
