<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'

// A whole number with a minus and a plus button (02-components § NumberStepper): teams, Team size, Game count,
// points per place, Veto allowance. The group is a spinbutton (ArrowUp/ArrowDown count); the value sits in an
// <output>. At a limit the button stays focusable but is aria-disabled, does nothing and says why: as its
// title and as a visually hidden description. A parent that has a tighter limit than `max` (24 Players in
// teams) just passes the lower `max` with its own reason.
const props = withDefaults(defineProps<{
  modelValue: number
  min: number
  max: number
  step?: number
  /** Shown after the value, e.g. „Teams“. */
  unit?: string
  /** The group's accessible name. */
  label: string
  minReason?: string
  maxReason?: string
  /** lg = the big Game count stepper (56 px buttons, 72 px number). */
  size?: 'md' | 'lg'
}>(), { step: 1, unit: undefined, minReason: undefined, maxReason: undefined, size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const { t } = useI18n()
const minId = useId()
const maxId = useId()

const atMin = computed(() => props.modelValue - props.step < props.min)
const atMax = computed(() => props.modelValue + props.step > props.max)

function change(direction: 1 | -1) {
  if (direction === 1 ? atMax.value : atMin.value) return
  emit('update:modelValue', props.modelValue + direction * props.step)
}

function onKeydown(event: KeyboardEvent) {
  const direction = { ArrowUp: 1, ArrowDown: -1 }[event.key] as 1 | -1 | undefined
  if (direction === undefined) return
  event.preventDefault()
  change(direction)
}

const BUTTON = { md: 'size-11', lg: 'size-14' }
const VALUE = { md: 'min-w-11 text-[28px]', lg: 'min-w-[90px] text-[72px]' }
</script>

<template>
  <div
    role="spinbutton"
    :aria-label="label"
    :aria-valuenow="modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    class="flex items-center gap-2.5"
    @keydown="onKeydown"
  >
    <button
      type="button"
      :aria-label="t('stepper.number.less', { label })"
      :aria-disabled="atMin ? 'true' : undefined"
      :aria-describedby="atMin && minReason ? minId : undefined"
      :title="atMin ? minReason : undefined"
      class="grid flex-none place-items-center rounded-pill border-(length:--cp-bw) border-line bg-surface shadow-sm lift focus-visible:focus-ring aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0"
      :class="BUTTON[size]"
      @click="change(-1)"
    >
      <AppIcon
        :icon="Minus"
        :size="size === 'lg' ? 20 : 16"
      />
    </button>
    <span
      v-if="atMin && minReason"
      :id="minId"
      class="sr-only"
    >{{ minReason }}</span>
    <output
      :key="modelValue"
      class="animate-tick text-center font-num leading-none"
      :class="VALUE[size]"
    >{{ modelValue }}</output>
    <span
      v-if="unit"
      class="text-small font-bold text-ink-2"
    >{{ unit }}</span>
    <button
      type="button"
      :aria-label="t('stepper.number.more', { label })"
      :aria-disabled="atMax ? 'true' : undefined"
      :aria-describedby="atMax && maxReason ? maxId : undefined"
      :title="atMax ? maxReason : undefined"
      class="grid flex-none place-items-center rounded-pill border-(length:--cp-bw) border-line bg-surface shadow-sm lift focus-visible:focus-ring aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0"
      :class="BUTTON[size]"
      @click="change(1)"
    >
      <AppIcon
        :icon="Plus"
        :size="size === 'lg' ? 20 : 16"
      />
    </button>
    <span
      v-if="atMax && maxReason"
      :id="maxId"
      class="sr-only"
    >{{ maxReason }}</span>
  </div>
</template>
