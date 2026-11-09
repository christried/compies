<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { CHIP_OFF, CHIP_ON, CHIP_SHAPE } from '~/utils/chip-look'
import { fieldBox } from '~/utils/field-chrome'

// A select with its arrow drawn here (#176): the browser's own arrow sits on the border, so the arrow gets room inside
// the pill or the field. It started as the library's filter chip (`chip`, the default: ink when something is chosen);
// the Price source is its second look (`field`, the 52 px form field of TextField, #362). The empty option is the value
// '' and means nothing chosen. `id`, `aria-label` and `aria-describedby` go to the <select>, never to the wrapper (#362):
// the caller's label arrives that way, so the select has no label child of its own.
defineOptions({ inheritAttrs: false })

const modelValue = defineModel<string>({ required: true })
const props = withDefaults(defineProps<{
  /** The options after the empty one, in order. */
  options: { value: string, label: string }[]
  /** The text of the first, empty option. */
  emptyLabel: string
  variant?: 'chip' | 'field'
  /** `field` only: the 3 px error border and aria-invalid. */
  invalid?: boolean
  /** `chip` only: the Tag chip's width cap, so a long Tag truncates inside the row. */
  capped?: boolean
}>(), { variant: 'chip', invalid: false, capped: false })

const wrapperClass = computed(() => {
  if (props.variant === 'field') return 'relative'
  return props.capped ? 'relative max-w-full flex-none' : 'relative flex-none'
})
const selectClass = computed(() => (props.variant === 'field'
  ? ['h-control-lg w-full appearance-none pr-10 pl-3.5 text-[17px] text-ink', fieldBox(props.invalid)]
  : ['appearance-none py-0 pr-9 pl-4 text-[15px]', CHIP_SHAPE, props.capped && 'max-w-full truncate', modelValue.value !== '' ? CHIP_ON : CHIP_OFF]))
const chevronClass = computed(() => (props.variant === 'chip' && modelValue.value !== '' ? 'text-paper' : 'text-ink'))

function onChange(event: Event) {
  modelValue.value = (event.target as HTMLSelectElement).value
}
</script>

<template>
  <div :class="wrapperClass">
    <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- the label arrives through $attrs: the caller's aria-label, or a label for its id -->
    <select
      v-bind="$attrs"
      :value="modelValue"
      :aria-invalid="variant === 'field' && invalid ? 'true' : undefined"
      :class="selectClass"
      @change="onChange"
    >
      <option value="">
        {{ emptyLabel }}
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <AppIcon
      :icon="ChevronDown"
      :size="18"
      class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      :class="chevronClass"
    />
  </div>
</template>
