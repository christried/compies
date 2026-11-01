<script setup lang="ts">
// An on/off setting (02-components § ToggleSwitch): „Rad verdecken“ in the Lucky Wheel's options (#145) and „Pool vorher zeigen“ (#225). The
// whole row is the switch, so the label is clickable; the optional help is its description. The knob slides with the
// same ease as the other motion, and not at all with reduced motion. `disabled` (#225) keeps the switch where it is: it
// is announced as disabled (aria-disabled, like the other disabled controls, so it stays focusable and its help, which
// can say why, is still read), looks muted and asks for nothing when it is clicked.
const props = defineProps<{
  modelValue: boolean
  label: string
  help?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function toggle() {
  if (!props.disabled) emit('update:modelValue', !props.modelValue)
}

const uid = useId()
const labelId = `${uid}-label`
const helpId = `${uid}-help`
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-disabled="disabled ? 'true' : undefined"
    :aria-labelledby="labelId"
    :aria-describedby="help ? helpId : undefined"
    class="flex min-h-11 w-full items-center gap-3 text-left focus-visible:focus-ring aria-disabled:cursor-not-allowed aria-disabled:text-ink-3"
    @click="toggle"
  >
    <span
      class="relative flex-none h-[30px] w-[52px] rounded-pill border-[2.5px]"
      :class="disabled ? 'border-dashed border-ink-3 bg-paper-2' : modelValue ? 'border-line bg-primary' : 'border-line bg-paper-2'"
      aria-hidden="true"
    >
      <span
        class="absolute top-[3px] left-[3px] size-[19px] rounded-pill transition-transform dur-base ease-snap motion-reduce:transition-none"
        :class="[modelValue ? 'translate-x-[22px]' : '', disabled ? 'bg-ink-3' : modelValue ? 'bg-ink' : 'bg-surface']"
      />
    </span>
    <span class="flex min-w-0 flex-1 flex-col leading-[1.3]">
      <b
        :id="labelId"
        class="text-[15px]"
      >{{ label }}</b>
      <span
        v-if="help"
        :id="helpId"
        class="text-[12px]"
        :class="disabled ? 'text-ink-3' : 'text-ink-2'"
      >{{ help }}</span>
    </span>
  </button>
</template>
