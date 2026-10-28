<script setup lang="ts">
// An on/off setting (02-components § ToggleSwitch): „Rad verdecken“ in the Lucky Wheel's options (#145). The
// whole row is the switch, so the label is clickable; the help is its description. The knob slides with the
// same ease as the other motion, and not at all with reduced motion.
defineProps<{
  modelValue: boolean
  label: string
  help: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const uid = useId()
const labelId = `${uid}-label`
const helpId = `${uid}-help`
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-labelledby="labelId"
    :aria-describedby="helpId"
    class="flex min-h-11 w-full items-center gap-3 text-left focus-visible:focus-ring"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="relative flex-none h-[30px] w-[52px] rounded-pill border-[2.5px] border-line"
      :class="modelValue ? 'bg-primary' : 'bg-paper-2'"
      aria-hidden="true"
    >
      <span
        class="absolute top-[3px] left-[3px] size-[19px] rounded-pill transition-transform dur-base ease-snap motion-reduce:transition-none"
        :class="modelValue ? 'translate-x-[22px] bg-ink' : 'bg-surface'"
      />
    </span>
    <span class="flex min-w-0 flex-1 flex-col leading-[1.3]">
      <b
        :id="labelId"
        class="text-[15px]"
      >{{ label }}</b>
      <span
        :id="helpId"
        class="text-[12px] text-ink-2"
      >{{ help }}</span>
    </span>
  </button>
</template>
