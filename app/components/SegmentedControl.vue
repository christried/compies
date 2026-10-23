<script setup lang="ts">
import type { Component } from 'vue'

// Two to four exclusive options as a radio group (02-components § SegmentedControl). Arrow keys
// move and select, with the focus following; the selected option is the only tab stop. Options can
// carry their own selected fill and icon (the Slot card's vote options); a disabled group shows its
// options but does not select.
const props = defineProps<{
  modelValue: string
  options: { value: string, label: string, icon?: Component, fill?: string }[]
  /** The group's accessible name. */
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const group = useTemplateRef('group')

function select(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
}

// Without a matching value the first option is the one tab stop, so the group stays reachable.
const hasSelection = computed(() => props.options.some(option => option.value === props.modelValue))

function isTabStop(index: number) {
  return props.options[index]!.value === props.modelValue || (!hasSelection.value && index === 0)
}

function onKeydown(event: KeyboardEvent, index: number) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (step === undefined) return
  event.preventDefault()
  const next = (index + step + props.options.length) % props.options.length
  select(props.options[next]!.value)
  nextTick(() => (group.value?.querySelectorAll<HTMLElement>('[role="radio"]')[next])?.focus())
}
</script>

<template>
  <div
    ref="group"
    role="radiogroup"
    :aria-label="label"
    :aria-disabled="disabled ? 'true' : undefined"
    class="grid max-w-[420px] rounded-pill border-(length:--cp-bw) border-line"
    :style="{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue ? 'true' : 'false'"
      :aria-disabled="disabled ? 'true' : undefined"
      :tabindex="isTabStop(index) ? 0 : -1"
      class="hit-44 flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-small font-bold focus-visible:focus-ring transition-colors dur-instant"
      :class="[
        option.value === modelValue ? (option.fill ?? 'bg-ink text-paper') : 'bg-surface text-ink hover:bg-paper-2',
        index === 0 ? 'rounded-l-pill' : '',
        index === options.length - 1 ? 'rounded-r-pill' : '',
        index > 0 ? 'border-l-(length:--cp-bw) border-line' : '',
      ]"
      @click="select(option.value)"
      @keydown="onKeydown($event, index)"
    >
      <AppIcon
        v-if="option.icon"
        :icon="option.icon"
        :size="15"
      />
      {{ option.label }}
    </button>
  </div>
</template>
